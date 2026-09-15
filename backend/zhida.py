# -*- coding: utf-8 -*-
"""
直答 API 封装 + 预处理 + 缓存 + 解析

对外只暴露一个函数： analyze_comments(comments) -> dict

处理链路：
    插件传来的原始评论（id 可能是字符串、可能几百条、可能有重复）
        ↓ 预处理：去重 → 按赞数排序 → 截断
        ↓ 重编号：1..N（让模型只看到干净的整数）
        ↓ 调直答
        ↓ 校验并映射回：把 1..N 换回插件的原始 id，丢掉不存在的 id
    插件能直接用的结果

为什么要重编号：
    插件从 DOM 抓来的 id 可能是 "comment-3f2a"、超长哈希、重复。
    直接塞给模型，它会标错、会编。重编成 1..N 之后，
    模型只需要判断「第几条属于哪一类」，准得多。
"""

import hashlib
import json
import os
import re
import threading
import time
from pathlib import Path

import requests

from prompt import (
    build_mindmap_prompt,
    build_polish_prompt,
    build_prompt,
    build_related_prompt,
)

API_URL = "https://developer.zhihu.com/v1/chat/completions"

# 用 thinking 模型：支持多轮 + 带推理过程，分类质量比 fast 好
MODEL = "zhida-thinking-1p5"

# 第一批用 fast：thinking 模型得先把整批「想」完才吐 JSON，首屏要干等；
# fast 不思考，第一张卡能早好几秒出来。后续批次仍走 thinking 保质量。
MODEL_FAST = "zhida-fast-1p5"
MODELS = {"fast": MODEL_FAST, "thinking": MODEL}


def model_for(tag):
    """把接口上的 ?model=fast 翻译成真实模型名；不认识就用默认的 thinking。"""
    return MODELS.get((tag or "").strip().lower(), MODEL)

SECRET_FILE = Path(__file__).parent / "secret.txt"


def _load_secret():
    """
    优先读环境变量（start.bat 里粘的），没有就读同目录的 secret.txt。

    为什么要留文件这条路：往 Windows 命令行里粘 40 位 token 太容易把手滑，
    2026-09-14 就粘成过 118 个字符（连文档里的说明文字一起复制了），报 401。
    存成文件可以反复打开核对、改起来也不用重启着试。
    """
    s = os.environ.get("ZHIHU_ACCESS_SECRET", "").strip()
    if s:
        return s
    if SECRET_FILE.exists():
        return SECRET_FILE.read_text(encoding="utf-8").strip()
    return ""


SECRET = _load_secret()


def secret_shape():
    """
    给 /api/health 用的「key 长什么样」，只报形状不报内容。
    目的是区分：粘多了文字 / 长度不对 / 看着正常但服务器还是不认。
    """
    if not SECRET:
        return "没有 key（环境变量和 secret.txt 都是空的）"
    if not re.fullmatch(r"[0-9a-fA-F]+", SECRET):
        bad = [c for c in SECRET if not re.match(r"[0-9a-fA-F]", c)]
        return (f"{len(SECRET)} 位，含 {len(bad)} 个非十六进制字符"
                f"（多半把别的文字一起粘进来了，第一个是 {bad[0]!r}）")
    if len(SECRET) != 40:
        return f"{len(SECRET)} 位十六进制（长度不对，应该是 40）"
    return "40 位十六进制（正常长相）"

CACHE_FILE = Path(__file__).parent / "cache.json"

# 前端会并发发多个分析请求，读-改-写 cache.json 必须串起来
_CACHE_LOCK = threading.Lock()

# thinking 模型慢，别设短了
TIMEOUT = 180

# 单次最多分析多少条。评论太多会撑爆上下文、还慢。
MAX_COMMENTS = 30


class ZhidaError(Exception):
    """调直答失败。带上人能看懂的原因。"""


# 最近一次调直答失败的原因。/api/health 会把它吐出来 ——
# 面板上那条红字容易漏看，刷一下 health 就能拿到原文，不用再复现一次。
LAST_ERROR = {"msg": "", "at": 0.0}


def note_error(msg):
    LAST_ERROR["msg"] = str(msg)[:300]
    LAST_ERROR["at"] = time.time()


# ────────────────────────────────────────────────────────────
# 预处理：去重 → 按赞数排序 → 截断
# ────────────────────────────────────────────────────────────

def _preprocess(comments):
    """
    comments: [{"id": ..., "text": ..., "likes": 可选}]
    返回规范化后的列表。空文本会被丢掉。
    """
    seen = set()
    out = []
    for c in comments:
        text = (c.get("text") or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        out.append(
            {
                "id": c.get("id"),
                "text": text,
                "likes": c.get("likes") or 0,
            }
        )

    # 稳定排序：没给赞数的保持原本顺序（插件的顺序）
    out.sort(key=lambda c: c["likes"], reverse=True)
    return out[:MAX_COMMENTS]


def _renumber(comments):
    """给模型看的 id 重编成 1..N。返回 (给模型的列表, {新id: 原id})"""
    numbered, back = [], {}
    for i, c in enumerate(comments, 1):
        numbered.append({"id": i, "text": c["text"]})
        back[i] = c["id"]
    return numbered, back


# 前端只认这三个值（P3 的 .zx-stance.agree/.oppose/.neutral，多一个都没样式）
_STANCE_AGREE = ("agree", "支持", "赞成", "赞同", "认同", "同意")
_STANCE_OPPOSE = ("oppose", "反对", "质疑", "不认同", "不同意", "反驳")


def _txt(v):
    """模型偶尔给 None 或非字符串 —— 一律吃成干净的字符串。"""
    return v.strip() if isinstance(v, str) else ""


def _count_stances(analyses):
    """
    统计 analyses 中各立场的数量和占比。
    return: {"agree": {"count": N, "ratio": 0.xx}, "oppose": ..., "neutral": ...}
    """
    total = len(analyses)
    if total == 0:
        return {
            k: {"count": 0, "ratio": 0.0}
            for k in ("agree", "oppose", "neutral")
        }

    counts = {"agree": 0, "oppose": 0, "neutral": 0}
    for a in analyses:
        s = a.get("stance", "neutral")
        if s in counts:
            counts[s] += 1
        else:
            counts["neutral"] += 1

    return {
        k: {"count": v, "ratio": round(v / total, 4)}
        for k, v in counts.items()
    }


def _norm_stance(v):
    """
    模型偶尔不听话 —— 该给 agree 却返回「支持」甚至一整句话。
    夹回三选一，否则前端的配色类名一个都匹配不上。
    """
    s = (v or "").strip().lower() if isinstance(v, str) else ""
    if s in ("agree", "oppose", "neutral"):
        return s
    # 先判反对：「不认同」里也含「认同」，顺序反了会误判成 agree
    if any(k in s for k in _STANCE_OPPOSE):
        return "oppose"
    if any(k in s for k in _STANCE_AGREE):
        return "agree"
    return "neutral"


def _norm_flaw(v):
    """
    前端按全角「：」把每条漏洞切成「名字 / 说明」两段。
    模型偶尔用半角冒号，这里统一掉，不然整条会全挤进名字里。
    """
    s = _txt(v)
    if s and "：" not in s and ":" in s:
        s = s.replace(":", "：", 1)
    return s


def _norm_one(a):
    """
    单条分析的规范化：stance 夹回三选一、漏洞分隔符统一全角、空字段吃成空串。
    id 不在这里换 —— 流式那边一条一条往外发，id 由调用方映射。
    """
    if not isinstance(a, dict):
        return None
    return {
        "stance": _norm_stance(a.get("stance")),
        "stance_detail": _txt(a.get("stance_detail")),
        "gist": _txt(a.get("gist")),
        "logic": _txt(a.get("logic")),
        "flaws": [f for f in (_norm_flaw(x) for x in (a.get("flaws") or [])) if f],
    }


def map_one(a, back):
    """
    流式专用：把模型给出的一条分析换成前端能直接用的卡片数据。
    返回 None 表示这条不该发（id 对不上 / 已经发过）。

    done 由调用方持有 —— 流式是一条条来的，去重得跨调用累积。
    """
    if not isinstance(a, dict):
        return None
    i = a.get("id")
    if not isinstance(i, int) or i not in back:
        return None  # 模型编了个不存在的 id，丢掉
    n = _norm_one(a)
    n["id"] = back[i]
    return n


def _map_back(result, back):
    """
    把模型返回的 1..N 换回插件的原始 id，并补齐模型漏掉的评论。

    - 模型偶尔会编出不存在的 id —— 直接丢掉，防止前端界面崩掉
    - 模型偶尔会漏掉几条 —— 补一条空分析，前端遍历时不会缺卡片
    - stance 夹回 agree/oppose/neutral，漏洞分隔符统一成全角「：」
    """
    valid = set(back)

    def fix(i):
        return back[i] if isinstance(i, int) and i in valid else None

    analyses, done = [], set()
    for a in result.get("analyses", []):
        oid = fix(a.get("id") if isinstance(a, dict) else None)
        if oid is None or oid in done:
            continue  # 编的 id、重复的 id，都丢掉
        done.add(oid)
        n = _norm_one(a)
        n["id"] = oid
        analyses.append(n)

    # 按评论原始顺序排（顺带把漏掉的补上，交给前端时是齐的）
    missing = []
    ordered = []
    for new_id, oid in back.items():
        hit = next((a for a in analyses if a["id"] == oid), None)
        if hit:
            ordered.append(hit)
        else:
            missing.append(oid)
            ordered.append(
                {
                    "id": oid,
                    "stance": "neutral",
                    "stance_detail": "",
                    "gist": "",
                    "logic": "",
                    "flaws": [],
                }
            )

    result["analyses"] = ordered
    result["core_dispute"] = _txt(result.get("core_dispute"))

    # ── 统计评论区立场分布 ────────────────────────────
    result["stats"] = _count_stances(ordered)

    # 模型没覆盖到的评论，留给前端/调试看
    result["_missing"] = missing
    return result


# ────────────────────────────────────────────────────────────
# 缓存：同样的评论不重复烧额度
# ────────────────────────────────────────────────────────────

def _cache_key(payload):
    blob = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


def _cache_load():
    if CACHE_FILE.exists():
        try:
            return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def _cache_save(cache):
    CACHE_FILE.write_text(
        json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _cache_put(key, value):
    """整包读-改-写加锁。并发下不加锁会互相覆盖，把对方刚存的缓存冲掉。"""
    with _CACHE_LOCK:
        cache = _cache_load()
        cache[key] = value
        _cache_save(cache)


# ────────────────────────────────────────────────────────────
# 调 API
# ────────────────────────────────────────────────────────────

def _http_error_text(resp):
    """把 HTTP 状态翻成人话。流式和非流式共用，措辞别写两套。"""
    if resp.status_code == 401:
        return "401：Access Secret 不对，或者漏了 X-Request-Timestamp 头"
    if resp.status_code == 403:
        return "403：这个 key 没有直答接口的权限"
    if resp.status_code == 429:
        return "429：额度用完了"
    if resp.status_code != 200:
        return f"HTTP {resp.status_code}：{resp.text[:300]}"
    return ""


def zhida_chat(messages, model=MODEL, timeout=TIMEOUT):
    if not SECRET:
        raise ZhidaError(
            "没有读到环境变量 ZHIHU_ACCESS_SECRET。"
            "运行前先 set ZHIHU_ACCESS_SECRET=你的key"
        )

    try:
        resp = requests.post(
            API_URL,
            headers={
                "Authorization": f"Bearer {SECRET}",
                # 这个头最容易漏，漏了就 401
                "X-Request-Timestamp": str(int(time.time())),
                "Content-Type": "application/json",
            },
            json={"model": model, "messages": messages, "stream": False},
            timeout=timeout,
        )
    except requests.RequestException as e:
        note_error(f"网络请求失败：{e}")
        raise ZhidaError(f"网络请求失败：{e}") from e

    err = _http_error_text(resp)
    if err:
        note_error(err)
        raise ZhidaError(err)

    try:
        return resp.json()["choices"][0]["message"]
    except (KeyError, IndexError, ValueError) as e:
        raise ZhidaError(f"返回结构不是预期格式：{resp.text[:300]}") from e


def extract_json(text):
    """模型有时候不自觉包一层 ```json，扒掉。"""
    text = (text or "").strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fence:
        text = fence.group(1).strip()
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1:
        text = text[start:end + 1]
    return json.loads(text)


# ────────────────────────────────────────────────────────────
# 流式：边生成边解析
#
# 为什么要这么麻烦：模型吐出来的是一整个 JSON 字符串，但它是
# 一条一条生成的。等整包 JSON 写完再返回，用户就要盯着转圈
# 30-60 秒；其实第一条几秒就生成完了。所以我们一边收 delta，
# 一边把「已经写完的那几条对象」抠出来，立刻发给前端。
# ────────────────────────────────────────────────────────────

# analyses 数组的起点。core_dispute 在它前面，所以只要找到这个就能开抠。
_ARRAY_HEAD = re.compile(r'"analyses"\s*:\s*\[')

# core_dispute 的值。必须等到闭引号出现才算完整，否则会读到半截。
_CORE_DISPUTE = re.compile(r'"core_dispute"\s*:\s*"((?:[^"\\]|\\.)*)"')


def _sse(event, data):
    """拼一条 SSE 事件。ensure_ascii=False 让中文在网络上是可读的（调试方便）。"""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _drain_objects(buf, pos):
    """
    从 buf[pos:] 里抠出所有「已经写完」的顶层 JSON 对象。

    为什么不能直接找 "}" 或正则贪婪匹配：模型是一个字一个字吐的，
    一次收到的 delta 可能正好停在 `{"id": 3, "stance": "ag` 这种半截上。
    早抠会抠出坏 JSON，晚抠会白等。所以逐字符走，只有同时满足
    「花括号配对」且「不在字符串内部」才算一条读完。

    字符串状态是必须跟踪的：flaws 里的文案会带 `{`、`}`、`"`（转义），
    不认字符串就会在第 3 条评论上把括号数错、后面全乱。

    返回 (objects, new_pos, closed)：
      objects  这次新抠出来的完整对象原文（未解析，可能是坏 JSON，调用方自己 try）
      new_pos  下次接着扫的位置。半截对象原样留着，不推进，等下一批 delta 补全
      closed   是否已经遇到数组结尾的 ]（收尾信号）
    """
    objs = []
    i = pos
    n = len(buf)
    depth = 0      # 当前对象的花括号层数
    start = -1     # 当前对象的起始下标
    in_str = False
    esc = False

    while i < n:
        ch = buf[i]

        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            i += 1
            continue

        if ch == '"':
            in_str = True
        elif ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            if depth > 0:
                depth -= 1
                if depth == 0 and start != -1:
                    objs.append(buf[start:i + 1])
                    start = -1
        elif ch == "]" and depth == 0:
            # 对象之外撞上 ] —— 数组收尾
            return objs, i + 1, True
        i += 1

    # 扫到末尾。有半截对象就退回到它的起点，等下一批 delta 把它补全再解析。
    resume = start if (depth > 0 and start != -1) else i
    return objs, resume, False


def stream_analyze(comments, model=MODEL):
    """
    流式分析。一条评论分析完就往外吐一条，用户不用干等整包 JSON。

    产出 SSE 事件：
      meta     {analyzed, core_dispute?}  开头先报这次实际分析几条；争论点亮了再补一条
      analysis {id, stance, stance_detail, gist, logic, flaws}  一张卡片
      done     {stats, missing, analyzed, related_posts, source}
      error    {message}                  出错时唯一的一个事件

    额度：整个流只算 1 次调用（和原来一样），只是把等待摊开了。
    model：默认 thinking；第一批传 fast 可以少等几秒（见 MODEL_FAST 的说明）。
    """
    if not comments:
        yield _sse("error", {"message": "comments 不能是空的"})
        return

    if not SECRET:
        yield _sse("error", {
            "message": "没有读到环境变量 ZHIHU_ACCESS_SECRET。"
                       "运行前先 set ZHIHU_ACCESS_SECRET=你的key"
        })
        return

    prepped = _preprocess(comments)
    if not prepped:
        yield _sse("error", {"message": "过滤掉空评论和重复评论后，没有剩下的了"})
        return

    # 缓存里有就直接一次性发完 —— 没烧额度，也没必要装慢
    key = _cache_key(comments)
    hit = _cache_load().get(key)
    if hit:
        yield _sse("meta", {"analyzed": len(hit.get("analyses", [])),
                            "core_dispute": hit.get("core_dispute", "")})
        for a in hit.get("analyses", []):
            yield _sse("analysis", a)
        yield _sse("done", {
            "stats": hit.get("stats"),
            "missing": hit.get("_missing", []),
            "analyzed": len(hit.get("analyses", [])),
            "related_posts": hit.get("related_posts", []),
            "source": "cache",
        })
        return

    numbered, back = _renumber(prepped)

    try:
        resp = requests.post(
            API_URL,
            headers={
                "Authorization": f"Bearer {SECRET}",
                "X-Request-Timestamp": str(int(time.time())),
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [{"role": "user", "content": build_prompt(numbered)}],
                "stream": True,
            },
            timeout=TIMEOUT,
            stream=True,
        )
    except requests.RequestException as e:
        note_error(f"网络请求失败：{e}")
        yield _sse("error", {"message": f"网络请求失败：{e}"})
        return

    err = _http_error_text(resp)
    if err:
        note_error(err)
        yield _sse("error", {"message": err})
        return

    buf = ""          # 累积模型吐出来的正文
    pos = -1          # 抠到哪了；-1 表示还没找到 analyses 数组
    core_sent = False
    reasoning = ""
    analyses = []     # 按到达顺序
    done_ids = set()
    heard_done = False

    try:
        for raw in resp.iter_lines(decode_unicode=False):
            if not raw:
                continue
            line = raw.decode("utf-8", errors="replace")
            if line.startswith(":"):
                continue  # 心跳，如 `: keep-alive`
            if not line.startswith("data:"):
                continue
            payload = line[5:].strip()
            if payload == "[DONE]":
                break
            try:
                chunk = json.loads(payload)
            except ValueError:
                continue  # 半截/非 JSON 的心跳，跳过

            if isinstance(chunk.get("error"), dict):
                yield _sse("error", {"message": str(chunk["error"].get("message", "接口报错"))})
                return

            choices = chunk.get("choices") or []
            if not choices:
                continue
            choice = choices[0]
            if choice.get("finish_reason") == "error":
                yield _sse("error", {"message": "生成中途出错（finish_reason=error）"})
                return

            delta = choice.get("delta") or {}
            if delta.get("reasoning_content"):
                reasoning += delta["reasoning_content"]
            piece = delta.get("content")
            if not piece:
                continue
            buf += piece

            # 争论点比 analyses 先出来，能提早告诉用户「在争什么」
            if not core_sent:
                m = _CORE_DISPUTE.search(buf)
                if m:
                    core_sent = True
                    yield _sse("meta", {"analyzed": len(prepped),
                                        "core_dispute": _txt(m.group(1))})

            # 数组起点只找一次
            if pos < 0:
                m = _ARRAY_HEAD.search(buf)
                if not m:
                    continue
                pos = m.end()
                if not core_sent:
                    core_sent = True
                    yield _sse("meta", {"analyzed": len(prepped), "core_dispute": ""})

            objs, pos, closed = _drain_objects(buf, pos)
            for o in objs:
                try:
                    a = json.loads(o)
                except ValueError:
                    continue  # 抠出来的东西解析不了就丢，别把整条流带崩
                one = map_one(a, back)
                if one is None or one["id"] in done_ids:
                    continue  # 编的 id / 重复的 id
                done_ids.add(one["id"])
                analyses.append(one)
                yield _sse("analysis", one)
            if closed:
                heard_done = True
                break
    except requests.RequestException as e:
        yield _sse("error", {"message": f"流中断：{e}"})
        return
    finally:
        resp.close()  # stream=True 的连接不会自己断，得手动收

    # 按评论原始顺序排，漏掉的补空卡片 —— 和非流式口径一致
    ordered, missing = [], []
    for oid in back.values():
        hit2 = next((a for a in analyses if a["id"] == oid), None)
        if hit2:
            ordered.append(hit2)
        else:
            missing.append(oid)
            ordered.append({"id": oid, "stance": "neutral", "stance_detail": "",
                            "gist": "", "logic": "", "flaws": []})

    if not analyses and not heard_done:
        yield _sse("error", {"message": "没解析出任何一条分析，去调 prompt.py"})
        return

    core = ""
    m = _CORE_DISPUTE.search(buf)
    if m:
        core = _txt(m.group(1))

    related = search_related_posts(core)

    _cache_put(key, {
        "core_dispute": core,
        "analyses": ordered,
        "stats": _count_stances(ordered),
        "related_posts": related,
    })

    yield _sse("done", {
        "core_dispute": core,
        "stats": _count_stances(ordered),
        "missing": missing,
        "analyzed": len(prepped),
        "related_posts": related,
        "source": "live",
        "_reasoning": reasoning[:2000],
    })


def search_related_posts(dispute):
    """
    基于 core_dispute 调用知乎搜索 API，返回相关帖子推荐列表。
    失败时返回空列表 —— 推荐是可选的，不影响主结果。
    """
    if not dispute or not SECRET:
        return []

    try:
        query = dispute.strip()[:40]
        resp = requests.get(
            "https://developer.zhihu.com/api/v1/content/zhihu_search",
            headers={
                "Authorization": f"Bearer {SECRET}",
                "X-Request-Timestamp": str(int(time.time())),
                "Content-Type": "application/json",
            },
            params={"Query": query, "Count": 5},
            timeout=30,
        )
        if resp.status_code != 200:
            return []
        data = resp.json()
        d = data.get("Data") or {}
        items = d.get("Items") if isinstance(d, dict) else (d if isinstance(d, list) else [])
        result = []
        for item in items:
            title = _txt(item.get("Title"))
            if not title:
                continue
            result.append({
                "title": title,
                "reason": _txt(item.get("ContentText") or "")[:100],
                "url": _txt(item.get("Url") or ""),
            })
        return result
    except Exception:
        return []


# ────────────────────────────────────────────────────────────
# 对外的唯一入口
# ────────────────────────────────────────────────────────────

def analyze_comments(comments, use_cache=True):
    """
    comments: [{"id": ..., "text": "...", "likes": 可选}]
    返回:     {"core_dispute": ..., "analyses": [...], "suggestions": [...], ...}
              analyses 每条评论一项：id / stance / gist / logic / flaws

    失败抛 ZhidaError。调用方（main.py）负责降级到 mock。
    """
    if not comments:
        raise ValueError("comments 不能是空的")

    key = _cache_key(comments)
    if use_cache:
        hit = _cache_load().get(key)
        if hit:
            out = dict(hit)
            out["_source"] = "cache"
            return out

    prepped = _preprocess(comments)
    if not prepped:
        raise ValueError("过滤掉空评论和重复评论后，没有剩下的了")

    numbered, back = _renumber(prepped)

    msg = zhida_chat([{"role": "user", "content": build_prompt(numbered)}])
    result = _map_back(extract_json(msg.get("content", "")), back)

    # 推理过程留着，调提示词时有用
    result["_reasoning"] = (msg.get("reasoning_content") or "")[:2000]
    result["_source"] = "live"
    # 告诉前端这次实际分析了几条（截断过的话对不上数量）
    result["_analyzed"] = len(prepped)

    # 基于 core_dispute 搜索可能相关的帖子
    result["related_posts"] = search_related_posts(result.get("core_dispute", ""))
    # 删除旧的 suggestions 字段（如果模型还输出了的话）
    result.pop("suggestions", None)

    _cache_put(key, {k: v for k, v in result.items() if not k.startswith("_")})

    return result


# ────────────────────────────────────────────────────────────
# 第二个入口：用户自己写了一条评论，发之前帮他挑逻辑漏洞
# ────────────────────────────────────────────────────────────

# 用户随手打的草稿，太长了没必要、也浪费额度
MAX_DRAFT = 500


def _clean_polish(result):
    """过一遍模型给的挑刺结果，防止空字段漏到前端。"""

    def txt(v):
        return (v or "").strip() if isinstance(v, str) else ""

    flaws = []
    for f in result.get("flaws", []):
        if not isinstance(f, dict):
            continue
        why = txt(f.get("why"))
        if not why:
            continue  # 没写理由的「漏洞」一律丢掉，别误导用户
        flaws.append(
            {
                "name": txt(f.get("name")) or "逻辑问题",
                "claim": txt(f.get("claim")),
                "why": why,
            }
        )

    return {
        "viewpoint": txt(result.get("viewpoint")),
        "verdict": txt(result.get("verdict")),
        "flaws": flaws,
        "rewrite": txt(result.get("rewrite")),
    }


def polish_comment(draft, use_cache=True):
    """
    draft: 用户自己写的评论原文
    返回: {"verdict": ..., "flaws": [{"name","quote","why"}], "rewrite": ...}

    失败抛 ZhidaError。调用方（main.py）负责降级到 mock。
    """
    draft = (draft or "").strip()
    if not draft:
        raise ValueError("draft 不能是空的")
    draft = draft[:MAX_DRAFT]

    # 同一条草稿不重复烧额度（用户手抖点两下很常见）
    key = _cache_key({"kind": "polish", "draft": draft})
    if use_cache:
        hit = _cache_load().get(key)
        if hit:
            out = dict(hit)
            out["_source"] = "cache"
            return out

    msg = zhida_chat([{"role": "user", "content": build_polish_prompt(draft)}])
    result = _clean_polish(extract_json(msg.get("content", "")))
    result["_source"] = "live"
    result["_draft"] = draft

    _cache_put(key, {k: v for k, v in result.items() if not k.startswith("_")})

    return result


# ────────────────────────────────────────────────────────────
# 第三个入口：把知乎回答/帖子转成思维导图
# ────────────────────────────────────────────────────────────

# 正文太长既烧额度又撑爆上下文，截断到合理长度
MAX_CONTENT = 3000


def _validate_mindmap(data):
    """
    校验和规范化思维导图树状结构。
    确保每个节点至少有一个 name，children 是可选数组。
    """
    if not isinstance(data, dict) or not data.get("name"):
        return {"name": "内容总结", "children": []}

    def clean_node(n):
        if not isinstance(n, dict):
            return None
        name = _txt(n.get("name"))
        if not name:
            return None
        node = {"name": name}
        kids = n.get("children")
        if isinstance(kids, list):
            cleaned = [clean_node(k) for k in kids if clean_node(k) is not None]
            if cleaned:
                node["children"] = cleaned
        return node

    root = clean_node(data)
    if root is None:
        return {"name": "内容总结", "children": []}
    return root


def generate_mindmap(title, content, use_cache=True):
    """
    title: 帖子标题
    content: 帖子正文
    返回: {"title": ..., "mindmap": {树状结构}, ...}

    失败抛 ZhidaError。调用方（main.py）负责降级到 mock。
    """
    title = (title or "").strip()
    content = (content or "").strip()
    if not content:
        raise ValueError("content 不能是空的")
    content = content[:MAX_CONTENT]

    key = _cache_key({"kind": "mindmap", "title": title, "content": content})
    if use_cache:
        hit = _cache_load().get(key)
        if hit:
            out = dict(hit)
            out["_source"] = "cache"
            return out

    msg = zhida_chat(
        [{"role": "user", "content": build_mindmap_prompt(title, content)}],
        model=MODEL,
        timeout=TIMEOUT,
    )
    raw = extract_json(msg.get("content", ""))
    result = {
        "title": title or "未命名",
        "mindmap": _validate_mindmap(raw.get("mindmap")),
        "_reasoning": (msg.get("reasoning_content") or "")[:2000],
        "_source": "live",
    }

    _cache_put(key, {k: v for k, v in result.items() if not k.startswith("_")})

    return result
