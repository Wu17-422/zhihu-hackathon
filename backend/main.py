# -*- coding: utf-8 -*-
"""
FastAPI 后端 —— 插件唯一要调的接口

启动（在 backend 目录下）：
    set ZHIHU_ACCESS_SECRET=你的key
    uvicorn main:app --reload --port 8000

自测：
    curl http://localhost:8000/api/health
    curl -X POST http://localhost:8000/api/analyze?force=mock ^
         -H "Content-Type: application/json" ^
         -d "{\"comments\":[{\"id\":1,\"text\":\"测试\"}]}"
    curl -X POST http://localhost:8000/api/polish?force=mock ^
         -H "Content-Type: application/json" ^
         -d "{\"draft\":\"AI 根本取代不了程序员\"}"
    curl -X POST http://localhost:8000/api/mindmap?force=mock ^
         -H "Content-Type: application/json" ^
         -d "{\"title\":\"AI 会取代程序员吗\",\"content\":\"正文内容\"}"

接口：
    POST /api/consensus  ★ 争议地图（首屏）：阵营划分 + 分歧根源 + 被埋没的好评论 + 导图
    POST /api/analyze    评论区每条评论 → 立场 / 意思 / 逻辑 / 漏洞
    POST /api/analyze/stream  同上，SSE 一条一条推
    POST /api/related    草稿 → 5 条相关讨论（只搜不调模型，约 1 秒）
    POST /api/polish     用户自己写的草稿 → 概括观点 + 挑逻辑漏洞
    POST /api/mindmap    把知乎帖子/回答转成思维导图

    都吃同样的开关：
        ?force=mock  强制返回假数据（P2/P3 开发用，不烧额度）
        ?force=live  跳过缓存，强制调真接口（调提示词时用）
        不传         先查缓存，没有再调真接口
"""

import json
import requests
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional, Union

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from mock import mock_camps, mock_mindmap, mock_polish, mock_related, mock_result
from zhida import (
    ZhidaError,
    aggregate_camps,
    analyze_comments,
    generate_mindmap,
    model_for,
    note_error,
    polish_comment,
    search_related_posts,
    stream_analyze,
)


@asynccontextmanager
async def lifespan(app):
    """
    启动横幅：把 key 的形状直接打在这块黑窗口里。
    以前排查 401 要开浏览器看 /api/health，现在抬头就能看到。
    """
    from zhida import MODEL, SECRET, secret_shape

    shape = secret_shape()
    print("=" * 64, flush=True)
    print("  犀利评手 · 后端已启动", flush=True)
    print("  模型     :", MODEL, flush=True)
    print("  key 形状 :", shape, flush=True)
    print("  key 来源 :", "环境变量 / secret.txt" if SECRET else "没读到", flush=True)
    if shape != "40 位十六进制（正常长相）":
        print("  [!] key 看着不对 —— 接下来每次分析都会降级成假数据。", flush=True)
        print("      key 应该是 40 个十六进制字符，放在 backend\\secret.txt 里最省事。", flush=True)
    print("  自检页面 : http://localhost:8000/api/health", flush=True)
    print("=" * 64, flush=True)
    yield


app = FastAPI(title="知乎评论区观点分析", lifespan=lifespan)

# 插件是从浏览器发请求的，必须开 CORS。
# 黑客松就别细究域名了，全放开。
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,   # 注意：origins 用 * 的时候这个必须是 False
    allow_methods=["*"],
    allow_headers=["*"],
)


# ────────────────────────────────────────────────────────────
# 数据模型
# ────────────────────────────────────────────────────────────

class Comment(BaseModel):
    id: Union[int, str]
    text: str
    # 可选：评论赞数。后端会按它排序，只分析高赞的前 30 条。
    # P2 抓得到就传，抓不到不传也行。
    likes: Optional[int] = 0
    # 可选：评论作者昵称。争议地图会把它标在「阵营代表」的引文上。
    author: Optional[str] = ""


class AnalyzeRequest(BaseModel):
    comments: List[Comment] = Field(..., min_length=1)


class CampsRequest(BaseModel):
    """争议地图。comments 的顺序就是楼层顺序，后端靠它判断「靠后的评论」。"""
    title: str = ""
    comments: List[Comment] = Field(..., min_length=1)


class PolishRequest(BaseModel):
    # 用户自己写的评论草稿。发之前让智能体挑逻辑漏洞。
    draft: str = Field(..., min_length=1)


class MindmapRequest(BaseModel):
    # 帖子标题（可选）
    title: str = ""
    # 帖子/回答正文。太长会被截断到 3000 字。
    content: str = Field(..., min_length=1)


# ────────────────────────────────────────────────────────────
# 接口
# ────────────────────────────────────────────────────────────

@app.get("/")
def root():
    """打开 http://localhost:8000 就能看到用法。P2/P3 第一眼都会来这。"""
    return {
        "ok": True,
        "msg": "后端在跑。接口见下面，试玩页见 /docs",
        "endpoints": {
            "GET  /api/health": "确认后端活着",
            "GET  /demo": "演示用的假知乎页面，插件挂到这上面试",
            "POST /api/consensus": "★ 争议地图（首屏）：阵营划分 + 分歧根源 + 被埋没的好评论 + 导图",
            "POST /api/analyze": "分析整个评论区的每条评论",
            "POST /api/analyze/stream": "同上，但用 SSE 一条一条推（前端边到边填卡）",
            "POST /api/related": "草稿 → 5 条相关讨论（只搜不调模型，约 1 秒）",
            "POST /api/polish": "用户自己写的评论 → 概括观点 + 挑逻辑漏洞",
            "POST /api/mindmap": "把知乎帖子/回答转成思维导图",
            "?force=mock": "假数据，开发用，不烧额度",
            "?force=live": "跳过缓存，调提示词时用",
            "?model=fast": "只给 stream 用，换快模型（首批首屏快几秒）",
        },
        "request": {"comments": [{"id": 1, "text": "评论内容"}]},
        "response": {
            "core_dispute": "一句话说清帖子下真正在争什么",
            "analyses": [
                {
                    "id": 1,
                    "stance": "agree / oppose / neutral（只能这三个）",
                    "stance_detail": "一句话说清他的立场",
                    "gist": "想表达什么",
                    "logic": "推理链",
                    "flaws": ["漏洞名：说明"],
                }
            ],
            "suggestions": [{"style": "追问式", "text": "可直接发的评论开头"}],
            "related_posts": [
                {"title": "相关帖子标题", "reason": "为什么跟当前讨论有关"},
            ],
            "stats": {
                "agree": {"count": 5, "ratio": 0.33},
                "oppose": {"count": 4, "ratio": 0.27},
                "neutral": {"count": 6, "ratio": 0.40},
            },
            "_source": "live / cache / mock",
        },
        "mindmap_demo": {
            "request": {"title": "帖子标题（可选）", "content": "帖子/回答正文"},
            "response": {
                "title": "帖子标题",
                "mindmap": {"name": "根节点", "children": [{"name": "子节点"}]},
                "_source": "live / cache / mock",
            },
        },
        "docs": "http://localhost:8000/docs",
    }


@app.get("/demo", include_in_schema=False)
def demo():
    """演示用的假知乎页面。P2 把插件挂到这一页上试效果，不用碰真知乎。"""
    return FileResponse(Path(__file__).parent / "demo.html")


@app.get("/api/health")
def health():
    """P2/P3 用来确认后端活着。也顺手看 key 有没有读到。"""
    from zhida import CACHE_FILE, LAST_ERROR, MODEL, SECRET, secret_shape

    entries = 0
    if CACHE_FILE.exists():
        try:
            entries = len(json.loads(CACHE_FILE.read_text(encoding="utf-8")))
        except Exception:
            entries = -1

    return {
        "ok": True,
        "secret_loaded": bool(SECRET),
        # 只看形状、不吐内容：401 时一眼能分出是粘多了还是长度不对
        "secret_shape": secret_shape(),
        "model": MODEL,
        "cache_entries": entries,
        # 版本标记：改完代码重启后打开 /api/health，看这里有没有变
        "features": ["stream", "model-switch", "consensus", "buried-gems", "related"],
        # 最近一次调直答失败的原因（面板上那条红字容易漏看）
        "last_error": LAST_ERROR["msg"],
    }


@app.post("/api/analyze")
def analyze(req: AnalyzeRequest, force: str = None):
    comments = [
        {"id": c.id, "text": c.text, "likes": c.likes} for c in req.comments
    ]

    # P2/P3 开发用：永远返回假数据，一次额度都不烧
    if force == "mock":
        return mock_result(comments)

    try:
        # force=live 跳过缓存（调提示词时必须用这个，否则拿到的还是旧结果）
        return analyze_comments(comments, use_cache=(force != "live"))

    except ZhidaError as e:
        # ★ 降级：接口挂了也要出结果，演示不能冷场
        #   _source 会是 "mock"，_error 里是真实原因
        note_error(e)
        result = mock_result(comments)
        result["_error"] = str(e)
        return result

    except ValueError as e:
        # 模型没按格式输出 JSON —— 这是提示词的问题，不是网络问题
        raise HTTPException(
            status_code=502,
            detail=f"模型返回的不是合法 JSON，去调 prompt.py：{e}",
        )


@app.post("/api/consensus")
def consensus(req: CampsRequest, force: str = None):
    """
    争议地图 —— 产品首屏。

    N 条评论 → 3~5 个阵营 + 分歧根源 + 被埋没的好评论 + 一棵能直接渲染的导图树。
    逐条分析（/api/analyze）降级成点开才看的细节。

    出错一律降级到 mock 而不是抛 502：这是首屏，演示时白屏比数据不准糟得多。
    """
    comments = [
        {"id": c.id, "text": c.text, "likes": c.likes, "author": c.author}
        for c in req.comments
    ]

    if force == "mock":
        return mock_camps(comments, req.title)

    try:
        return aggregate_camps(
            comments, title=req.title, use_cache=(force != "live")
        )

    except (ZhidaError, ValueError) as e:
        note_error(e)
        result = mock_camps(comments, req.title)
        result["_error"] = str(e)
        return result


@app.post("/api/related")
def related(req: PolishRequest, force: str = None):
    """
    草稿 → 5 条相关讨论。**不调模型**，直接拿草稿去搜知乎，所以约 1 秒就回。

    为什么单独开一个接口：/api/polish 要等模型 5 秒多，而搜索只要 0.8 秒。
    串在一起用户 6 秒内什么都看不到。拆开后前端并行发两个请求，
    这个先回、先把帖子铺出来，逻辑漏洞晚几秒填进来。

    额度：只烧知乎搜索（5000 次/天），不烧直答。
    """
    draft = (req.draft or "").strip()
    if not draft:
        raise HTTPException(status_code=400, detail="draft 不能为空")

    if force == "mock":
        return mock_related(draft)

    try:
        posts = search_related_posts(draft)
    except Exception as e:          # 搜索挂了不该让面板空着
        note_error(f"related 搜索失败：{e}")
        result = mock_related(draft)
        result["_error"] = str(e)
        return result

    # search_related_posts 内部失败会返回空列表 —— 那就退回 mock，
    # 免得用户看到一个空的「相关讨论」区域，以为是功能坏了
    if not posts:
        result = mock_related(draft)
        result["_error"] = "知乎搜索没返回结果"
        return result

    return {"related_posts": posts[:5], "_source": "live"}


def _mock_stream(comments):
    """假数据的流式版：故意一条一条慢慢发，方便 P2/P3 在 mock 下调前端。"""
    import time as _time

    from zhida import _sse  # 事件格式只写一套，mock 和真流都走它

    result = mock_result(comments)
    yield _sse("meta", {"analyzed": result["_analyzed"],
                        "core_dispute": result["core_dispute"]})
    for a in result["analyses"]:
        _time.sleep(0.15)  # 太快就看不出流式效果了
        yield _sse("analysis", a)
    yield _sse("done", {
        "core_dispute": result["core_dispute"],
        "stats": result["stats"],
        "missing": [],
        "analyzed": result["_analyzed"],
        "related_posts": result["related_posts"],
        "source": "mock",
    })


@app.post("/api/analyze/stream")
def analyze_stream(req: AnalyzeRequest, force: str = None, model: str = None):
    """
    和 /api/analyze 同样的输入，但用 SSE 一条一条往外推。

    事件：meta / analysis / done / error —— 详见 zhida.stream_analyze 的说明。
    前端据此把卡片边生成边填上，用户不用盯着转圈等整包 JSON。

    ?force=mock 照样支持，不烧额度，方便调前端。
    ?model=fast 换快模型（不思考），第一批想要首屏快就传它；见 MODEL_FAST 的说明。
    """
    comments = [
        {"id": c.id, "text": c.text, "likes": c.likes} for c in req.comments
    ]

    body = (
        _mock_stream(comments) if force == "mock"
        else stream_analyze(comments, model=model_for(model))
    )
    return StreamingResponse(
        body,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            # 有些反代会把 SSE 攒成一坨再发，那样流式就白做了
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/polish")
def polish(req: PolishRequest, force: str = None):
    """
    用户自己写的评论草稿 → 概括观点 + 挑逻辑漏洞。

    2026-09-15 起不再返回「改好的版本」（rewrite）—— 用户要的是判断和参考资料，
    不是代笔。相关讨论也从这里拆走了，见上面的 /api/related。
    """
    draft = (req.draft or "").strip()
    if not draft:
        raise HTTPException(status_code=400, detail="draft 不能为空")

    if force == "mock":
        return mock_polish(draft)

    try:
        return polish_comment(draft, use_cache=(force != "live"))

    except ZhidaError as e:
        result = mock_polish(draft)
        result["_error"] = str(e)
        return result

    except ValueError as e:
        raise HTTPException(
            status_code=502,
            detail=f"模型返回的不是合法 JSON，去调 prompt.py：{e}",
        )


@app.post("/api/mindmap")
def mindmap(req: MindmapRequest, force: str = None):
    """把知乎帖子/回答正文转成思维导图。"""
    content = (req.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="content 不能为空")

    if force == "mock":
        return mock_mindmap(req.title, content)

    try:
        return generate_mindmap(req.title, content, use_cache=(force != "live"))

    except ZhidaError as e:
        result = mock_mindmap(req.title, content)
        result["_error"] = str(e)
        return result

    except ValueError as e:
        raise HTTPException(
            status_code=502,
            detail=f"模型返回的不是合法 JSON，去调 prompt.py：{e}",
        )


# ────────────────────────────────────────────────────────────
# 黑客松专属内容（故事/知识，免费、无需鉴权）
# ────────────────────────────────────────────────────────────

HACKATHON_API = "https://api.zhihu.com/km-indep-home/hackathon/v2"


def _fetch_hackathon(path):
    try:
        resp = requests.get(HACKATHON_API + path, headers={"Accept": "application/json"}, timeout=20)
        if resp.status_code != 200:
            return {"ok": False, "error": f"HTTP {resp.status_code}"}
        return {"ok": True, "data": resp.json()}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/api/stories")
def stories():
    """黑客松知乎故事列表（免费、无需鉴权）。"""
    return _fetch_hackathon("/story/list")


@app.get("/api/knowledge")
def knowledge():
    """黑客松知乎知识列表（免费、无需鉴权）。"""
    return _fetch_hackathon("/knowledge/list")


@app.get("/api/story/{work_id}")
def story_detail(work_id: str):
    """黑客松故事/知识详情（免费、无需鉴权）。"""
    return _fetch_hackathon(f"/story/{work_id}")
