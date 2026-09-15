#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
知乎直答 API —— 验证脚本
==========================

写在最前面的一句话：
    这个脚本不做界面、不做插件。它只回答一个问题——
    「直答到底能不能把每条评论的立场、意思、逻辑、漏洞分析准？」

    如果这个不准，后面做插件、做界面全是白做。
    所以先跑它，别急着写别的。

    提示词不在这里 —— 它从 backend/prompt.py 读，跟线上完全同一份。
    改提示词只改那一个文件，这里不用动。

用法（Windows cmd）：
    set ZHIHU_ACCESS_SECRET=你的access_secret
    python verify_zhida.py

用法（PowerShell）：
    $env:ZHIHU_ACCESS_SECRET="你的access_secret"
    python verify_zhida.py

只测连通性（不跑分析）：
    python verify_zhida.py --ping

注意：每次运行会消耗直答额度。默认只打 1 次请求，别乱按。
"""

import json
import os
import re
import sys
import time

try:
    import requests
except ImportError:
    sys.exit("先装依赖：  pip install requests")

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "backend"))

from prompt import build_prompt          # noqa: E402  —— 线上同一份提示词
from zhida import _map_back, _renumber, extract_json  # noqa: E402


# ────────────────────────────────────────────────────────────
# 配置
# ────────────────────────────────────────────────────────────

API_URL = "https://developer.zhihu.com/v1/chat/completions"

# 用 thinking 模型：支持多轮 + 带推理过程，分析质量比 fast 好
# 另一个模型 zhida-agent 只能单轮，这里用不上
MODEL = "zhida-thinking-1p5"

SECRET = os.environ.get("ZHIHU_ACCESS_SECRET", "").strip()


# ────────────────────────────────────────────────────────────
# API 封装
# ────────────────────────────────────────────────────────────

def zhida_chat(messages, model=MODEL, timeout=180):
    """调一次知乎直答。messages 是 OpenAI 格式：[{"role": "user", "content": "..."}]"""
    if not SECRET:
        print()
        print("!! 没有读到 ZHIHU_ACCESS_SECRET 环境变量")
        print("   Windows cmd:        set ZHIHU_ACCESS_SECRET=你的key")
        print("   PowerShell:         $env:ZHIHU_ACCESS_SECRET=\"你的key\"")
        print("   key 在知乎开放平台个人中心里，叫 Access Secret")
        print()
        sys.exit(1)

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

    # 把常见的失败原因翻译成人话
    if resp.status_code != 200:
        print(f"\n!! 请求失败  HTTP {resp.status_code}")
        if resp.status_code == 401:
            print("   → Access Secret 不对，或者漏了 X-Request-Timestamp 头")
        elif resp.status_code == 403:
            print("   → 这个 key 没有直答接口的权限")
        elif resp.status_code == 429:
            print("   → 额度用完了。去个人中心看还剩多少")
        else:
            print(f"   → {resp.text[:400]}")
        sys.exit(1)

    data = resp.json()
    return data["choices"][0]["message"]


def ping():
    """最小的一次调用，只为了确认 key 通不通、额度还在不在。"""
    print("正在测试连通性…")
    msg = zhida_chat([{"role": "user", "content": "回复两个字：正常"}])
    print(f"   OK，模型回了：{msg.get('content', '').strip()!r}")
    if msg.get("reasoning_content"):
        print("   （这个模型会返回 reasoning_content，说明 thinking 模式生效了）")


# ────────────────────────────────────────────────────────────
# 测试数据：10 条评论，故意混了各种状况
#
# 里面埋伏了这些坑，专门看模型抓不抓得出来：
#   id 5  人身攻击（拿算盘师傅打比方攻击人）
#   id 6  诉诸动机（说发帖的都是卖课的）
#   id 9  纯情绪（只说自己焦虑，没有论证）
#   id 10 跑题（把话题引到教育层面）
#   id 4  有具体数字，是最扎实的一条
#   id 7  有经验也有情绪，混在一起
# 换成你从真实帖子里抓的评论，效果更真实
# ────────────────────────────────────────────────────────────

COMMENTS = [
    {"id": 1, "text": "AI 就是个提效工具，程序员的价值会从写代码转向做架构和判断。会用它的人不会被淘汰，拒绝用的人才会。"},
    {"id": 2, "text": "扯淡。我们团队用了半年，AI 只能写写样板代码，稍微复杂一点的业务逻辑就开始胡说八道，每次都要人工兜底，反而更慢。"},
    {"id": 3, "text": "我觉得关键不是会不会取代，而是初级岗位会先消失。以前招 5 个初级，现在招 1 个能指挥 AI 的。"},
    {"id": 4, "text": "某机构 2025 年的报告说，用了 AI 的团队平均产出提升 26%，但同时代码返工率上升了 11%。这组数字比吵架有用。"},
    {"id": 5, "text": "程序员就是矫情，当年计算器出来的时候算盘师傅也这么喊，现在谁还记得算盘？"},
    {"id": 6, "text": "说 AI 取代程序员的，基本都是卖课的。真正在一线的人根本没时间发帖，都在改 bug。"},
    {"id": 7, "text": "我做了 12 年后端，说句掏心窝的话：AI 最可怕的不是写代码，是它让管理层觉得「不需要那么多人了」。我们组今年 HC 直接砍半。"},
    {"id": 8, "text": "楼上的担心是有道理的，但 HC 砍半跟 AI 关系不大吧，大环境本来就是降本增效，AI 只是个好用的借口。"},
    {"id": 9, "text": "作为一个刚毕业的人，我确实焦虑。投了 200 份简历没回音，看到这个帖子更慌了。"},
    {"id": 10, "text": "这个话题其实应该放到教育层面聊——如果 AI 能做初级工作，那大学还该不该教那些基础语法？"},
]


# ────────────────────────────────────────────────────────────
# 输出
# ────────────────────────────────────────────────────────────

def print_result(result):
    print("\n" + "=" * 62)
    print("  逐条分析结果")
    print("=" * 62)

    disputed = result.get("core_dispute", "")
    print(f"\n  核心分歧：{disputed}")

    for a in result.get("analyses", []):
        print("\n" + "-" * 62)
        print(f"  [id {a.get('id')}]  立场：{a.get('stance') or '（空）'}")
        print(f"      想说：{a.get('gist') or '（空）'}")
        print(f"      逻辑：{a.get('logic') or '（空）'}")
        flaws = a.get("flaws") or []
        if flaws:
            for f in flaws:
                print(f"      ✗ 漏洞：{f}")
        else:
            print("      ✓ 没挑出漏洞")

    print("\n" + "=" * 62)
    print("  评论建议")
    print("=" * 62)
    for s in result.get("suggestions", []):
        print(f"\n  【{s.get('style') or '?'}】{s.get('text')}")

    missing = result.get("_missing", [])
    if missing:
        print(f"\n  !! 模型漏了这几条没分析：{missing}")

    print("\n" + "=" * 62)


def main():
    if "--ping" in sys.argv:
        ping()
        return

    print(f"模型：{MODEL}")
    print(f"评论条数：{len(COMMENTS)}")
    print("正在调用直答…（thinking 模型会慢一些，等十几秒很正常）")

    prepped = [{"id": c["id"], "text": c["text"]} for c in COMMENTS]
    numbered, back = _renumber(prepped)

    msg = zhida_chat([{"role": "user", "content": build_prompt(numbered)}])
    raw = msg.get("content", "")

    print("\n" + "=" * 62)
    print("  原始返回（调试用，正式做产品时去掉）")
    print("=" * 62)
    print(raw)

    try:
        print_result(_map_back(extract_json(raw), back))
    except Exception as e:
        print(f"\n!! 解析 JSON 失败：{e}")
        print("   看上面的原始返回——如果模型没按规定输出 JSON，")
        print("   说明提示词还得调，这也是这个脚本要验证的东西之一。")

    print("\n现在自己判断五件事：")
    print("  1. 立场判得准不准？有没有硬套「支持/反对」？")
    print("  2. flaws 是不是宁缺毋滥？（10 条里大多数应该没漏洞。")
    print("     如果每条都被扣了漏洞 → 模型在硬找，必调提示词）")
    print("  3. gist / logic 是不是都只有一句话？有没有展开成长段？")
    print("  4. 评论建议扣不扣这个帖子的题？有没有空话？")
    print("  5. 有没有「模型漏了这几条」的提示？有 → 提示词要强调逐条全覆盖")
    print("  第 2 条不合格最常见，也最好改。")


if __name__ == "__main__":
    main()
