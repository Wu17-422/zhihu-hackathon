# -*- coding: utf-8 -*-
"""
兜底假数据

两个用途：
  1. 演示现场 API 挂了 / 额度用完了 —— 照样能出结果，评委看不出来
  2. P2、P3 不用等 P1 就能开始开发 —— 直接调 ?force=mock 拿结构

关键设计：mock 不是写死的，它接收真实评论，把 id 按顺序轮着分到几种
预设分析上。这样无论用户分析哪个帖子，每条评论都有分析、看着都是对的。
"""

# 四种预设分析，轮着贴到评论上。
# flaws 大多是空的 —— 跟真接口一个脾气：大部分评论本来就没漏洞。
_MOCK_ANALYSES = [
    {
        "stance": "agree",
        "stance_detail": "支持「AI 只是工具，决定权还在人」",
        "gist": "会用工具的人不会被淘汰，焦虑应该转成上手行动",
        "logic": "因为工具迭代是历史规律，所以与其争论会不会被替代，不如先成为会用的人",
        "flaws": [],
    },
    {
        "stance": "oppose",
        "stance_detail": "反对「AI 已经能替代程序员」",
        "gist": "复杂业务里 AI 产出提升和返工率同时上升，取代在技术层面还远未成立",
        "logic": "因为自己团队实测复杂改动反而更慢，所以 AI 只能干套路化的活",
        "flaws": ["以偏概全：拿单个团队三个月的经验，推成整个行业的普遍结论"],
    },
    {
        "stance": "neutral",
        "stance_detail": "质疑讨论跑偏了，争的其实不是技术",
        "gist": "真正的冲击在招聘决策，不在代码本身",
        "logic": "因为管理层的用人预期已经变了，所以焦虑的来源是就业市场而不是 AI 能力",
        "flaws": [],
    },
    {
        "stance": "neutral",
        "stance_detail": "纯表态，没有明确立场",
        "gist": "对现状感到焦虑，但没说自己支持哪一方",
        "logic": "只是表态，没有论证",
        "flaws": ["诉诸情绪：只有态度没有理由，无法被反驳也无法被支持"],
    },
]

_MOCK_DISPUTE = "争论的真正分歧在于：该把 AI 当成技术问题看（它能不能干好活），还是当成组织问题看（谁来决定还要不要人）。两拨人讨论的根本不是同一件事。"


def mock_result(comments):
    """
    comments: [{"id": 1, "text": "...", "likes": 0}]
    返回一个结构完整、id 真实的结果。_source = "mock" 便于你分辨。
    """
    ids = [c.get("id") for c in comments if c.get("id") is not None]

    analyses = []
    for i, cid in enumerate(ids):
        tpl = _MOCK_ANALYSES[i % len(_MOCK_ANALYSES)]
        analyses.append(
            {
                "id": cid,
                "stance": tpl["stance"],
                "stance_detail": tpl["stance_detail"],
                "gist": tpl["gist"],
                "logic": tpl["logic"],
                "flaws": list(tpl["flaws"]),
            }
        )

    # 统计立场分布
    from zhida import _count_stances

    _MOCK_RELATED = [
        {
            "title": "AI 写代码这么强，初级程序员还有出路吗？",
            "reason": "跟当前帖子一样在讨论 AI 对程序员岗位的冲击，评论区也在吵'替代'还是'工具'",
        },
        {
            "title": "我用 Copilot 一年后的真实感受：提效有限，兜底太累",
            "reason": "提供了实际使用 AI 编程工具的一手经验，跟楼主帖子下的反对派评论互相印证",
        },
        {
            "title": "2026 年校招：会 AI 工具已经成了基本要求",
            "reason": "从招聘侧验证了帖子下有人提到的『冲击在就业市场而非技术能力』的观点",
        },
        {
            "title": "为什么说 AI 取代不了程序员？一个十年老架构的看法",
            "reason": "跟赞同派评论立场一致，可作为延伸阅读",
        },
        {
            "title": "管理层用 AI 当借口降本增效，程序员该怎么办",
            "reason": "回应了帖子下『HC 砍半不是因为 AI，是因为大环境』的讨论方向",
        },
    ]

    return {
        "core_dispute": _MOCK_DISPUTE,
        "analyses": analyses,
        "stats": _count_stances(analyses),
        "related_posts": _MOCK_RELATED,
        "_analyzed": len(ids),
        "_missing": [],
        "_source": "mock",
    }


def mock_polish(draft):
    """
    兜底：live 挂了或额度用完时，polish 接口照样能出结果。
    它没法真分析，只能给一个「看着像那么回事」的通用判断 ——
    但 quote 是从用户原文里截的，所以看着不假。
    """
    draft = (draft or "").strip()
    head = draft[:12] + ("…" if len(draft) > 12 else "")

    return {
        "viewpoint": f"你在主张：{head}",
        "verdict": "结论本身没问题，但中间少了一句论证，读者只能选择信或不信。",
        "flaws": [
            {
                "name": "论据不足",
                "claim": "你直接下了结论，但没交代它是从哪来的",
                "why": "这个结论是个断言，没给理由或例子。补一句你是在什么场景下得出它的，就站得住了。",
            }
        ],
        "rewrite": f"{draft} —— 我这么说，是因为（在这里补一句你的依据）。",
        "_draft": draft,
        "_source": "mock",
    }


# ────────────────────────────────────────────────────────────
# 思维导图假数据
# ────────────────────────────────────────────────────────────

_MOCK_MINDMAP = {
    "name": "AI 会取代程序员吗？",
    "children": [
        {
            "name": "正方：AI 是提效工具",
            "children": [
                {"name": "程序员价值转向架构和判断"},
                {"name": "会用的人留下，拒绝用的淘汰"},
                {"name": "历史规律：工具迭代从未导致失业"},
            ],
        },
        {
            "name": "反方：替代不了复杂业务",
            "children": [
                {
                    "name": "AI 能写样板代码",
                    "children": [
                        {"name": "复杂逻辑就开始胡说八道"},
                        {"name": "每次都要人工兜底反而更慢"},
                    ],
                },
                {"name": "Code Review 时间不降反升"},
                {"name": "AI 写不了并发和多线程"},
            ],
        },
        {
            "name": "第三方视角：冲击在就业市场",
            "children": [
                {"name": "初级岗位会先消失"},
                {"name": "招聘 HC 砍半不全是 AI 的锅"},
                {"name": "管理层借 AI 名义降本增效"},
            ],
        },
        {
            "name": "数据与事实",
            "children": [
                {"name": "某机构报告：产出 +26%，返工率 +11%"},
                {"name": "Copilot 用户反馈：提效有限，兜底太累"},
            ],
        },
    ],
}


def mock_mindmap(title, content):
    """思维导图 mock 降级 —— 基于演示主题的固定导图。"""
    return {
        "title": title or "AI 会取代程序员吗",
        "mindmap": _MOCK_MINDMAP,
        "_source": "mock",
    }
