/* 犀利评手 · 板块A — 争议地图 + 逐条分析 + 思维导图
 * ============================================
 * 依赖：window.__zha（由板块C 提供）
 * 独立运行，不引用板块B 的任何代码
 *
 * 首屏是「争议地图」：N 条评论压成 3~5 个阵营 + 分歧根源 + 被埋没的好评论。
 * 逐条卡片降级成折叠区，点开才看 —— 输入 800 条、输出 800 张卡片没有意义，
 * 压缩工具的产物必须比原料短。
 */

(function () {
  'use strict';

  // ── CSS ──────────────────────────────────────────────
  var CSS = `
    #zha-fab{position:fixed;right:24px;bottom:24px;z-index:2147483000;width:56px;height:56px;border:none;border-radius:50%;background:linear-gradient(135deg,#0066ff,#4da3ff);color:#fff;font-size:24px;cursor:pointer;box-shadow:0 4px 16px rgba(0,102,255,.4);display:flex;align-items:center;justify-content:center;transition:transform .2s,box-shadow .2s}
    #zha-fab:hover{transform:scale(1.05);box-shadow:0 6px 20px rgba(0,102,255,.5)}
    #zha-fab:active{transform:scale(.95)}
    #zha-fab.open{transform:rotate(45deg)}
    #zha-fab-menu{position:fixed;right:24px;z-index:2147482999;display:flex;flex-direction:column;align-items:flex-end;gap:8px;pointer-events:none;opacity:0;transform:translateY(10px);transition:opacity .2s,transform .2s}
    #zha-fab-menu.show{pointer-events:auto;opacity:1;transform:translateY(0)}
    .zha-fab-item{display:flex;align-items:center;gap:8px;border:none;border-radius:20px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.15);font-size:13px;font-weight:600;padding:8px 16px;transition:transform .15s;color:#fff;white-space:nowrap}
    .zha-fab-item:hover{transform:scale(1.03)}
    .zha-fab-item:active{transform:scale(.97)}
    #zha-real-panel{position:fixed;top:0;right:0;width:430px;height:100vh;background:#fff;z-index:2147483001;box-shadow:-4px 0 20px rgba(0,0,0,.15);overflow-y:auto;font-size:13px;color:#1a1a1a;line-height:1.6;padding:16px;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
    .zr-head{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700;color:#0066ff;margin-bottom:8px}
    .zr-src{font-size:11px;font-weight:700;padding:1px 9px;border-radius:999px;background:#e7f8f0;color:#0fa968}
    .zr-src.mock{background:#fef4e6;color:#f59e0b}.zr-src.cache{background:#ecf3ff;color:#0066ff}
    .zr-close{margin-left:auto;background:none;border:none;font-size:20px;cursor:pointer;color:#999}
    .zr-core{background:#ecf3ff;border-radius:8px;padding:10px 12px;margin-bottom:8px}
    .zr-count{color:#8590a6;font-size:12px;margin-bottom:10px}
    .zr-comment{border-bottom:1px solid #f0f0f0;padding:12px 0}
    .zr-c-author{font-weight:600;color:#444;font-size:13px}
    .zr-c-text{color:#1a1a1a;margin:4px 0 8px;font-size:14px}
    .zx-card{background:#f4f8ff;border:1px solid #e0ecff;border-left:3px solid #0066ff;border-radius:8px;padding:10px 12px;font-size:12.5px;line-height:1.6;margin-top:6px}
    .zx-card-head{display:flex;align-items:center;gap:6px;margin-bottom:6px}
    .zx-brand{font-size:11px;font-weight:700;color:#0066ff}
    .zx-ai-chip{font-size:9px;font-weight:700;color:#fff;background:linear-gradient(135deg,#0066ff,#4da3ff);border-radius:4px;padding:1px 5px}
    .zx-stance{margin-left:auto;font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;white-space:nowrap}
    .zx-stance.agree{background:#e7f8f0;color:#0fa968}
    .zx-stance.oppose{background:#fdeceb;color:#ef4444}
    .zx-stance.neutral{background:#fef4e6;color:#f59e0b}
    .zx-block{background:#f5f9ff;border:1px solid #e0ecff;border-radius:6px;padding:6px 9px;margin-bottom:5px}
    .zx-block-row{font-size:12px;color:#444;line-height:1.5}
    .zx-block-row b{color:#1e6fff;font-size:10px;margin-right:6px}
    .zx-flaws{border:1px solid #ffd9d9;background:#fff6f6;border-radius:6px;padding:7px 9px;margin-top:2px}
    .zx-flaws-title{font-size:10px;font-weight:700;color:#ef4444;margin-bottom:4px}
    .zx-flaw{display:flex;gap:7px;align-items:flex-start;margin:3px 0;font-size:11.5px}
    .zx-flaw-badge{flex:0 0 auto;font-weight:700;color:#ef4444;background:#ffe3e3;border:1px solid #ffc9c9;border-radius:5px;padding:0 6px;font-size:10px;line-height:1.7;white-space:nowrap}
    .zx-flaw-desc{color:#b91c1c;line-height:1.5}
    .zc-scale{font-size:12px;color:#8590a6;margin-bottom:10px}
    .zc-scale b{color:#0066ff;font-weight:700}
    .zc-bar{display:flex;height:16px;border-radius:8px;overflow:hidden;background:#eee;margin:10px 0 6px}
    .zc-seg{height:100%}
    .zc-legends{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:11px;color:#555;margin-bottom:12px}
    .zc-legend{display:flex;align-items:center;gap:4px}
    .zc-legend i{width:8px;height:8px;border-radius:2px;display:inline-block;flex:0 0 auto}
    .zc-sec{font-size:13px;font-weight:700;color:#1a1a1a;margin:16px 0 8px;display:flex;align-items:center;gap:6px}
    .zc-crux{background:#fff8e6;border:1px solid #ffe1a8;border-left:3px solid #f7b731;border-radius:8px;padding:10px 12px;font-size:12.5px;line-height:1.7;color:#5c4400}
    .zc-gem{background:#f0fdf7;border:1px solid #bfe9d5;border-left:3px solid #0fa968;border-radius:8px;padding:10px 12px;margin-bottom:8px}
    .zc-gem-meta{font-size:10.5px;color:#0fa968;font-weight:700;margin-bottom:5px;display:flex;align-items:center;gap:8px}
    .zc-gem-text{font-size:13px;color:#1a1a1a;line-height:1.6;margin-bottom:6px}
    .zc-gem-why{font-size:11.5px;color:#15803d;line-height:1.5;background:#dcfce7;border-radius:5px;padding:5px 8px}
    .zc-camp{border:1px solid #eee;border-radius:8px;padding:10px 12px;margin-bottom:8px;border-left:3px solid #ccc}
    .zc-camp-head{display:flex;align-items:baseline;gap:8px;margin-bottom:4px}
    .zc-camp-name{font-size:13px;font-weight:700;color:#1a1a1a}
    .zc-camp-size{font-size:11px;color:#8590a6;margin-left:auto;white-space:nowrap}
    .zc-camp-claim{font-size:12.5px;color:#444;line-height:1.6;margin-bottom:6px}
    .zc-grounds{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px}
    .zc-ground{font-size:11px;color:#444;background:#f4f6fa;border:1px solid #e6eaf0;border-radius:5px;padding:2px 7px}
    .zc-quote{font-size:12px;color:#555;line-height:1.6;background:#fafbfc;border-left:2px solid #ddd;padding:5px 9px}
    .zc-quote-who{font-size:10.5px;color:#8590a6;margin-top:3px}
    .zc-fold{margin-top:16px;border-top:1px solid #f0f0f0;padding-top:12px}
    .zc-fold-btn{width:100%;background:#f4f6fa;border:1px solid #e6eaf0;border-radius:7px;padding:9px 12px;font-size:12.5px;font-weight:600;color:#444;cursor:pointer;text-align:left;font-family:inherit}
    .zc-fold-btn:hover{background:#eaeef5}
    .zc-fold-btn:disabled{opacity:.6;cursor:default}
    .zc-note{font-size:11.5px;color:#8590a6;line-height:1.6;margin-top:6px}
    .zc-err{background:#fff6f6;border:1px solid #ffd9d9;border-radius:7px;padding:9px 11px;font-size:12.5px;color:#b91c1c;line-height:1.6}
    .zc-retry{margin-top:7px;background:#ef4444;border:none;border-radius:6px;color:#fff;font-size:12px;font-weight:600;padding:6px 14px;cursor:pointer;font-family:inherit}
    .zc-paste{width:100%;box-sizing:border-box;min-height:96px;border:1px solid #ddd;border-radius:7px;padding:9px;font-size:13px;font-family:inherit;line-height:1.6;resize:vertical}
    .zc-paste-go{margin-top:7px;background:#00897b;border:none;border-radius:6px;color:#fff;font-size:12.5px;font-weight:600;padding:7px 16px;cursor:pointer;font-family:inherit}
  `;

  var esc = function (s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  };

  var API = "http://localhost:8000";

  // 调样式不想烧额度时，在控制台执行：localStorage.zhaMock = 1
  // 删掉这个 key（delete localStorage.zhaMock）就恢复真实调用。
  //
  // ⚠ 默认必须是真实调用。之前这里把 "?force=mock" 硬编码进了 URL，
  //   结果无论 key 对不对，全线走的都是兜底假数据 —— 演示时才发现就晚了。
  function apiUrl(path, params) {
    var qs = [];
    try { if (localStorage.getItem("zhaMock")) qs.push("force=mock"); } catch (e) {}
    if (params) {
      for (var k in params) {
        if (params[k]) qs.push(k + "=" + encodeURIComponent(params[k]));
      }
    }
    return API + path + (qs.length ? "?" + qs.join("&") : "");
  }

  var callApi = async function (path, body) {
    var resp = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    return resp.json();
  };

  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  // ── 流式逐条分析 ─────────────────────────────────────
  async function streamAnalyze(comments, onEvent, model) {
    var resp = await fetch(apiUrl("/api/analyze/stream", { model: model }), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comments: comments.map(function (c) { return { id: c.id, text: c.text }; }) }),
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    var reader = resp.body.getReader();
    var decoder = new TextDecoder();
    var buf = "";
    var event = "", dataStr = "";
    function parseLine(line) {
      if (line.startsWith("event: ")) { event = line.slice(7).trim(); }
      else if (line.startsWith("data: ")) { dataStr = line.slice(6).trim(); }
      else if (line === "") {
        if (event && dataStr) {
          try { onEvent(event, JSON.parse(dataStr)); } catch (e) { console.warn("流式解析失败", e); }
        }
        event = ""; dataStr = "";
      }
    }
    while (true) {
      var r = await reader.read();
      if (r.done) break;
      buf += decoder.decode(r.value, { stream: true });
      var lines = buf.split("\n");
      buf = lines.pop() || "";
      for (var i = 0; i < lines.length; i++) parseLine(lines[i]);
    }
    if (buf.trim()) parseLine(buf);
  }

  // ── 页面检测 ──────────────────────────────────────────
  function detectTarget() {
    // 演示页（/demo）优先：它的评论是写在 HTML 里的，不走知乎接口。
    // 真知乎当天要是抽风（改接口、限流、登录态掉了），这是唯一还能演的路，
    // 所以必须认得出来 —— 之前三个正则一个都不匹配，点按钮直接报「页面识别不出来」。
    if (document.querySelector(".CommentItem .CommentItem-text")) {
      return { type: "demo", id: "demo" };
    }
    var path = window.location.pathname;
    var m = path.match(/^\/question\/(\d+)\/answer\/(\d+)/);
    if (m) return { type: "answer", id: m[2] };
    m = path.match(/^\/question\/(\d+)/);
    if (m) return { type: "question", id: m[1] };
    m = path.match(/^\/answer\/(\d+)/);
    if (m) return { type: "answer", id: m[1] };
    m = path.match(/^\/p\/([\w-]+)/);
    if (m) return { type: "article", id: m[1] };
    return null;
  }

  // 演示页的评论直接从 DOM 读。类名和真知乎不一样（.CommentItem-text
  // vs 真站的 .CommentContent），所以单独一个函数，别硬套。
  function scrapeDemoComments() {
    var out = [], seen = {};
    var items = document.querySelectorAll(".CommentItem");
    for (var i = 0; i < items.length; i++) {
      var box = items[i];
      var textEl = box.querySelector(".CommentItem-text");
      if (!textEl) continue;
      var text = textEl.textContent.replace(/\s+/g, " ").trim();
      if (!text || seen[text]) continue;
      seen[text] = true;
      var authorEl = box.querySelector(".CommentItem-author");
      var likeEl = box.querySelector(".CommentItem-likeCount");
      out.push({
        id: box.getAttribute("data-id") || ("demo-" + i),
        text: text,
        likes: likeEl ? (parseInt(likeEl.textContent.replace(/\D/g, ""), 10) || 0) : 0,
        author: authorEl ? authorEl.textContent.replace(/\s+/g, " ").trim() : "用户",
      });
    }
    return out;
  }

  // ── 抓评论 ───────────────────────────────────────────
  // 只有 v4 这一条路。使用说明里写的「v4 优先 + v5 回退」实际不存在，也不用去补：
  // v5（/api/v4/comment_v5/.../root_comment）会回空页 —— paging.totals 说有 N 条，
  // data 却是 []，多半要 x-zse-96 签名，扩展里伪造不了。别再花时间试它。
  var CRAWL = {
    pageSize: 20,        // 知乎单页上限
    maxPerTarget: 200,   // 单个回答/文章最多读多少条（原来写死 100，热帖读不全）
    maxAnswers: 10,      // 问题页最多扫几个回答（原来 50 个 × 每答 60 条，能跑几分钟）
    maxPerAnswer: 40,    // 问题页每个回答读多少条（要的是「有哪几种说法」，不是完整评论区）
    maxTotal: 600,       // 总上限，别把浏览器读到卡死
    gapMs: 120,          // 请求之间歇一下，躲知乎限流
  };

  function stripHtml(html) {
    // v4 的 content 是 HTML（<p>、表情 <img>、@某人的 <a>）。
    // 不清掉的话模型看到的是标签，界面上也会把标签当正文显示出来。
    var d = document.createElement("div");
    d.innerHTML = html == null ? "" : String(html);
    return d.textContent.replace(/\s+/g, " ").trim();
  }

  function commentAuthor(c) {
    // 作者在不同接口里的位置不一样，挨个试。
    // 原来直接取 c.author —— 那是个对象，渲染出来就是 [object Object]。
    var a = c && c.author;
    if (!a) return "用户";
    if (typeof a === "string") return a;
    var m = a.member || a;
    var name = m && (m.name || m.fullname);
    return (typeof name === "string" && name.trim()) ? name.trim() : "用户";
  }

  function commentLikes(c) {
    // 评论接口给的是 vote_count。原来只读 like_count，永远是 0 ——
    // 于是按赞数排序和「被埋没的好评论」全都失效了。
    if (!c) return 0;
    if (typeof c.vote_count === "number") return c.vote_count;
    if (typeof c.like_count === "number") return c.like_count;
    return 0;
  }

  function pushComment(all, c, seen) {
    var text = stripHtml(c && c.content);
    if (!text || seen[text]) return;
    seen[text] = true;
    all.push({ id: c.id, text: text, likes: commentLikes(c), author: commentAuthor(c) });
  }

  function harvest(all, page, seen) {
    // v4 的一级评论里常内嵌几条子回复（child_comments）。v5 走不通，
    // 所以「谁在回复谁」这一层只能从这儿顺手捡，捡到多少算多少。
    for (var i = 0; i < page.data.length; i++) {
      var c = page.data[i];
      pushComment(all, c, seen);
      var kids = c.child_comments;
      if (kids && kids.length) {
        for (var j = 0; j < kids.length; j++) pushComment(all, kids[j], seen);
      }
      if (all.length >= CRAWL.maxTotal) return;
    }
  }

  function commentUrl(target, offset, limit) {
    var kind = target.type === "article" ? "articles" : "answers";
    return "https://www.zhihu.com/api/v4/" + kind + "/" + target.id +
      "/comments?order=normal&limit=" + limit + "&offset=" + offset;
  }

  async function fetchCommentPage(url) {
    var resp = await fetch(url, { credentials: "include" });
    if (!resp.ok) throw new Error("HTTP " + resp.status + "（评论接口）");
    return resp.json();
  }

  async function fetchComments(target, onProgress) {
    var all = [], seen = {};
    for (var offset = 0; offset < CRAWL.maxPerTarget; offset += CRAWL.pageSize) {
      var page;
      try { page = await fetchCommentPage(commentUrl(target, offset, CRAWL.pageSize)); }
      catch (e) { if (!all.length) throw e; break; }
      if (!page || !page.data || !page.data.length) break;
      harvest(all, page, seen);
      if (onProgress) onProgress(all.length);
      if (all.length >= CRAWL.maxTotal) break;
      if (page.paging && page.paging.is_end) break;
      await sleep(CRAWL.gapMs);
    }

    // API 一条都没读到 → 从页面 DOM 兜一把。
    // 原来这个兜底只对专栏页生效，回答页的接口一挂就完全没退路了。
    if (!all.length) {
      var hits = scrapeCommentsFromDom(seen);
      for (var k = 0; k < hits.length; k++) all.push(hits[k]);
      if (onProgress) onProgress(all.length);
    }

    return all;
  }

  // 从已经渲染在页面上的 DOM 里扒评论。
  //
  // 什么时候用得上：知乎的评论接口要登录态，还会改版、会限流。只要评论已经显示
  // 在页面上，这条路就还能走 —— 但前提是**用户先把评论区展开**（点「N 条评论」），
  // 没展开的话 DOM 里根本没有评论节点。
  //
  // 真知乎的类名带构建 hash 且会变，所以一律用 class*= 模糊匹配，别写死。
  function scrapeCommentsFromDom(seen) {
    seen = seen || {};
    var out = [];
    var nodes = document.querySelectorAll(
      '[class*="CommentContent"], [class*="CommentItem-text"], [class*="comment-content"]'
    );

    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var text = el.textContent.replace(/\s+/g, " ").trim();
      if (!text || seen[text]) continue;

      // 往上找这条评论的容器，最多 6 层
      var box = el, hops = 0;
      while (box && hops < 6 && !/comment[-_]?item/i.test(String(box.className || ""))) {
        box = box.parentElement;
        hops++;
      }
      if (!box) box = el.parentElement || el;

      // 作者：先试作者专用的类名，最后才用 /people/ 链接 ——
      // 顺序反了会把评论正文里 @某人 的链接当成作者
      var who = box.querySelector(
        '[class*="CommentItem-author"], [class*="AuthorInfo"], [class*="UserLink"], a[href*="/people/"]'
      );
      var author = who ? who.textContent.replace(/\s+/g, " ").trim() : "用户";

      // 赞数：在按钮/点赞类元素里找第一个数字（「赞 12」「12」都能吃）
      var likes = 0;
      var cands = box.querySelectorAll('button, [class*="ike"], [class*="ote"]');
      for (var j = 0; j < cands.length; j++) {
        var mm = cands[j].textContent.replace(/,/g, "").match(/(\d+)/);
        if (mm) { likes = parseInt(mm[1], 10) || 0; break; }
      }

      seen[text] = true;
      out.push({
        id: (box.getAttribute && box.getAttribute("data-id")) || ("dom-" + i),
        text: text,
        likes: likes,
        author: author,
      });
    }
    return out;
  }

  // ── 问题页：扫该问题下前 N 个回答的评论区 ──────────────
  async function fetchAnswerList(qid, offset, limit) {
    var url = "https://www.zhihu.com/api/v4/questions/" + qid +
      "/answers?limit=" + limit + "&offset=" + offset;
    var resp = await fetch(url, { credentials: "include" });
    if (!resp.ok) throw new Error("HTTP " + resp.status + "（回答列表）");
    return resp.json();
  }

  async function fetchAllComments(qid, onProgress) {
    // 只扫前 maxAnswers 个回答（知乎默认按赞数返回，前几个就是主战场）
    var ids = [];
    for (var off = 0; off < CRAWL.maxAnswers; off += 10) {
      var page = await fetchAnswerList(qid, off, Math.min(10, CRAWL.maxAnswers - off));
      if (!page || !page.data || !page.data.length) break;
      for (var i = 0; i < page.data.length && ids.length < CRAWL.maxAnswers; i++) {
        if (page.data[i].id) ids.push(page.data[i].id);
      }
      if (page.paging && page.paging.is_end) break;
    }
    if (!ids.length) return [];

    var all = [], seen = {};
    for (var j = 0; j < ids.length; j++) {
      if (all.length >= CRAWL.maxTotal) break;
      if (onProgress) onProgress(all.length, j + 1, ids.length);
      for (var o = 0; o < CRAWL.maxPerAnswer; o += CRAWL.pageSize) {
        var cp;
        try { cp = await fetchCommentPage(commentUrl({ type: "answer", id: ids[j] }, o, CRAWL.pageSize)); }
        catch (e) { break; }
        if (!cp || !cp.data || !cp.data.length) break;
        harvest(all, cp, seen);
        if (all.length >= CRAWL.maxTotal) break;
        if (cp.paging && cp.paging.is_end) break;
        await sleep(CRAWL.gapMs);
      }
    }
    if (onProgress) onProgress(all.length, ids.length, ids.length);
    return all;
  }

  function pageTitle() {
    var el = document.querySelector("[class*='QuestionHeader-title'], h1, [class*='Post-Title']");
    return el ? el.textContent.replace(/\s+/g, " ").trim().slice(0, 120) : "";
  }

  // ── 逐条卡片的渲染（折叠区里用） ───────────────────────
  function normalizeStance(s) {
    var t = (s || "").toLowerCase();
    if (/支持|赞成|同意|肯定|正方|agree|pro|support/.test(t)) return "agree";
    if (/反对|驳斥|质疑|否定|反方|唱衰|oppose|con|against/.test(t)) return "oppose";
    return "neutral";
  }

  // 类名必须和 CSS 里的 .zx-stance.agree/.oppose/.neutral 对齐。
  // 原来返回的是 stance-agree 这种，一个都匹配不上，立场标签全是没颜色的。
  function stanceMeta(s) {
    var n = normalizeStance(s);
    if (n === "agree") return { cls: "agree", ico: "🟢", label: "赞成" };
    if (n === "oppose") return { cls: "oppose", ico: "🔴", label: "反对" };
    return { cls: "neutral", ico: "🟡", label: "中立" };
  }

  function parseFlaw(str) {
    var m = String(str).match(/^([^：:]+)[：:]\s*([\s\S]*)$/);
    return m ? { name: m[1].trim(), desc: m[2].trim() } : { name: String(str), desc: "" };
  }

  function relatedPostsHtml(posts) {
    if (!posts || !posts.length) return "";
    return '<div class="zc-sec">🔗 相关讨论</div>' +
      posts.map(function (p) {
        var t = p.url
          ? '<a href="' + esc(p.url) + '" target="_blank" rel="noopener" style="color:#0066ff;text-decoration:none">' + esc(p.title) + '</a>'
          : esc(p.title);
        return '<div class="zr-comment"><div class="zr-c-text">📄 ' + t + '</div>' +
          (p.reason ? '<div class="zr-count" style="margin:0">' + esc(p.reason) + '</div>' : '') + '</div>';
      }).join("");
  }

  function cardHtml(a) {
    var sm = stanceMeta(a.stance);
    var flaws = a.flaws || [];
    var flawsHtml = flaws.length
      ? '<div class="zx-flaws"><div class="zx-flaws-title">⚠ 逻辑漏洞</div>' + flaws.map(function (f) {
          var p = parseFlaw(f);
          return '<div class="zx-flaw"><span class="zx-flaw-badge">' + esc(p.name) + '</span><span class="zx-flaw-desc">' + esc(p.desc) + '</span></div>';
        }).join("") + '</div>'
      : "";
    var empty = !a.gist && !a.logic;
    var body = empty
      ? '<div class="zx-block-row" style="color:#8590a6">— 未分析 —</div>'
      : '<div class="zx-block"><div class="zx-block-row"><b>想表达什么</b>' + esc(a.gist) + '</div></div>' +
        '<div class="zx-block"><div class="zx-block-row"><b>推理链</b>' + esc(a.logic) + '</div></div>' + flawsHtml;
    return '<div class="zx-card"><div class="zx-card-head"><span class="zx-ai-chip">AI</span>' +
      '<span class="zx-brand">犀利评手 · 分析</span>' +
      '<span class="zx-stance ' + sm.cls + '">' + sm.ico + ' ' + sm.label + '</span></div>' + body + '</div>';
  }

  // ── 思维导图渲染引擎（争议地图和正文导图共用） ──────────
  var MM_BRANCH_COLORS = [
    { bg: "#4361ee", line: "#4361ee" }, { bg: "#e63946", line: "#e63946" },
    { bg: "#2a9d8f", line: "#2a9d8f" }, { bg: "#e76f51", line: "#e76f51" },
    { bg: "#7b2cbf", line: "#7b2cbf" }, { bg: "#0096c7", line: "#0096c7" },
    { bg: "#d62828", line: "#d62828" }, { bg: "#2d6a4f", line: "#2d6a4f" },
  ];
  var MM_ROOT_COLOR = { bg: "#f7b731", text: "#1a1a1a", line: "#f7b731" };
  var MM_NODE_H = 34, MM_NODE_MIN_W = 84, MM_NODE_PAD = 16;
  var MM_V_GAP = 16, MM_H_GAP = 48, MM_PADDING = 24, MM_RADIUS = 8;

  function mmBranchColor(branchIndex, depth) {
    if (depth === 0) return MM_ROOT_COLOR;
    return MM_BRANCH_COLORS[branchIndex % MM_BRANCH_COLORS.length];
  }
  function mmTextWidth(text) {
    var w = 0;
    for (var i = 0; i < (text || "").length; i++) {
      var ch = text[i];
      w += (ch >= '一' && ch <= '鿿') || ch >= '　' ? 16 : 9;
    }
    return w;
  }
  function mmLayout(node, depth, branchIdx) {
    var name = node.name || "";
    var nodeW = Math.max(mmTextWidth(name) + MM_NODE_PAD * 2, MM_NODE_MIN_W);
    var kids = (node.children || []).map(function (c, i) { return mmLayout(c, depth + 1, depth === 0 ? i : branchIdx); });
    var height = kids.length ? Math.max(kids.reduce(function (s, k) { return s + k.height; }, 0) + (kids.length - 1) * MM_V_GAP, MM_NODE_H) : MM_NODE_H;
    return { node: node, name: name, nodeW: nodeW, depth: depth, branchIdx: branchIdx, kids: kids, width: nodeW + MM_H_GAP + (kids.length ? Math.max.apply(null, kids.map(function (k) { return k.width; })) : 0), height: height };
  }
  function mmRender(layout, x, y, svgLines, defs) {
    var name = layout.name, nodeW = layout.nodeW, depth = layout.depth, branchIdx = layout.branchIdx, kids = layout.kids;
    var col = mmBranchColor(branchIdx, depth);
    var childSvg = "";
    var childY = y + layout.height;
    for (var i = kids.length - 1; i >= 0; i--) {
      var kid = kids[i];
      childY -= kid.height;
      kid._yOffset = childY;
      var kidResult = mmRender(kid, x + nodeW + MM_H_GAP, childY, svgLines, defs);
      childSvg = kidResult.svg + childSvg;
      svgLines = kidResult.svgLines;
      defs = kidResult.defs;
    }
    var cy = y + layout.height / 2;
    var ny = cy - MM_NODE_H / 2;
    var r = depth === 0 ? 12 : MM_RADIUS;
    var fontSize = depth === 0 ? 15 : (depth <= 2 ? 13 : 12);
    var fontWeight = depth === 0 ? 700 : (depth <= 2 ? 600 : 500);
    var shadowAttr = depth <= 2 ? (depth === 0 ? 'filter="url(#shadowRoot)"' : 'filter="url(#shadowNode)"') : '';
    var textCol = depth === 0 ? "#1a1a1a" : "#ffffff";
    var svg = '<rect x="' + x + '" y="' + ny + '" width="' + nodeW + '" height="' + MM_NODE_H + '" rx="' + r + '" ry="' + r + '" fill="' + col.bg + '" ' + shadowAttr + ' />';
    svg += '<text x="' + (x + nodeW / 2) + '" y="' + (cy + 1) + '" text-anchor="middle" dominant-baseline="middle" font-size="' + fontSize + '" font-weight="' + fontWeight + '" fill="' + textCol + '" font-family="-apple-system,BlinkMacSystemFont,\'PingFang SC\',\'Microsoft YaHei\',sans-serif">' + esc(name) + '</text>';
    var parentRight = x + nodeW;
    var parentCY = cy;
    for (var j = 0; j < kids.length; j++) {
      var kid2 = kids[j];
      var kx = x + nodeW + MM_H_GAP;
      var kcy = kid2._yOffset + kid2.height / 2;
      var midX = (parentRight + kx) / 2;
      var lineCol = mmBranchColor(kid2.branchIdx, kid2.depth);
      svgLines += '<path d="M' + parentRight + ',' + parentCY + ' C' + midX + ',' + parentCY + ' ' + midX + ',' + kcy + ' ' + kx + ',' + kcy + '" stroke="' + lineCol.line + '" stroke-width="2.5" fill="none" opacity="0.45" />';
    }
    return { svg: svg + childSvg, svgLines: svgLines, defs: defs };
  }
  function mindmapHtml(root) {
    if (!root || !root.name) return "<div style='color:#8590a6;padding:10px'>没有导图数据。</div>";
    var layout = mmLayout(root, 0, 0);
    var defs = '<defs><filter id="shadowRoot" x="-10%" y="-10%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000000" flood-opacity="0.25"/></filter><filter id="shadowNode" x="-10%" y="-10%" width="130%" height="130%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000000" flood-opacity="0.15"/></filter></defs>';
    var result = mmRender(layout, MM_PADDING, MM_PADDING, "", defs);
    var totalW = layout.width + MM_PADDING * 2;
    var totalH = layout.height + MM_PADDING * 2;
    return '<div style="overflow:auto;max-height:60vh;padding:4px 0"><svg width="' + totalW + '" height="' + totalH + '" viewBox="0 0 ' + totalW + ' ' + totalH + '" style="min-width:' + totalW + 'px;display:block">' + defs + result.svgLines + result.svg + '</svg></div>';
  }

  // ── 争议地图渲染（首屏） ──────────────────────────────
  function campsBarHtml(camps) {
    if (!camps || !camps.length) return "";
    // 配色和导图分支一一对应：条形图第 i 段的颜色 == 导图第 i 个分支的颜色
    var segs = camps.map(function (c, i) {
      var col = MM_BRANCH_COLORS[i % MM_BRANCH_COLORS.length].bg;
      return '<div class="zc-seg" style="width:' + (c.ratio * 100).toFixed(1) + '%;background:' + col + '" title="' + esc(c.name) + '"></div>';
    }).join("");
    var legends = camps.map(function (c, i) {
      var col = MM_BRANCH_COLORS[i % MM_BRANCH_COLORS.length].bg;
      return '<span class="zc-legend"><i style="background:' + col + '"></i>' + esc(c.name) +
        ' <b style="color:#8590a6;font-weight:400">' + Math.round(c.ratio * 100) + '%</b></span>';
    }).join("");
    return '<div class="zc-bar">' + segs + '</div><div class="zc-legends">' + legends + '</div>';
  }

  function campsListHtml(camps) {
    if (!camps || !camps.length) return "";
    return camps.map(function (c, i) {
      var col = MM_BRANCH_COLORS[i % MM_BRANCH_COLORS.length].bg;
      var sm = stanceMeta(c.stance);
      var grounds = (c.grounds || []).length
        ? '<div class="zc-grounds">' + c.grounds.map(function (g) { return '<span class="zc-ground">' + esc(g) + '</span>'; }).join("") + '</div>'
        : "";
      var q = c.quote;
      var quote = q && q.text
        ? '<div class="zc-quote">「' + esc(q.text) + '」<div class="zc-quote-who">— ' + esc(q.author || "用户") +
          (q.likes ? '，' + q.likes + ' 赞' : '') + '</div></div>'
        : "";
      return '<div class="zc-camp" style="border-left-color:' + col + '">' +
        '<div class="zc-camp-head"><span class="zc-camp-name">' + esc(c.name) + '</span>' +
        '<span class="zx-stance ' + sm.cls + '">' + sm.label + '</span>' +
        '<span class="zc-camp-size">' + c.size + ' 条</span></div>' +
        '<div class="zc-camp-claim">' + esc(c.claim) + '</div>' + grounds + quote + '</div>';
    }).join("");
  }

  function gemsHtml(gems) {
    if (!gems || !gems.length) return "";
    return '<div class="zc-sec">💎 被埋没的好评论</div>' +
      '<div class="zc-note" style="margin:-4px 0 8px">赞数低、排在后面，但内容质量明显高于平均 —— 知乎的排序容易把它们盖掉。</div>' +
      gems.map(function (g) {
        return '<div class="zc-gem">' +
          '<div class="zc-gem-meta"><span>第 ' + g.floor + ' 楼</span><span>' + (g.likes || 0) + ' 赞</span><span>' + esc(g.author || "用户") + '</span></div>' +
          '<div class="zc-gem-text">' + esc(g.text) + '</div>' +
          '<div class="zc-gem-why">为什么值得看：' + esc(g.why) + '</div></div>';
      }).join("");
  }

  function openShell() {
    var old = document.getElementById("zha-real-panel");
    if (old) old.remove();
    var panel = document.createElement("div");
    panel.id = "zha-real-panel";
    panel.innerHTML =
      '<div class="zr-head">🗺️ 犀利评手 · 争议地图 <span class="zr-src" id="zr-src">读取中…</span> <button class="zr-close">✕</button></div>' +
      '<div id="zr-warn"></div>' +
      '<div id="zr-body"><div class="zr-core" id="zr-core">正在读取评论…</div><div class="zr-count" id="zr-count"></div></div>';
    document.body.appendChild(panel);
    panel.querySelector(".zr-close").onclick = function () { panel.remove(); window.__zha.panelOpen = false; };
    window.__zha.panelOpen = true;
    return panel;
  }

  function setSource(panel, src) {
    var el = panel.querySelector("#zr-src");
    if (!el) return;
    el.textContent = src === "mock" ? "🚧 假数据" : (src === "cache" ? "📥 缓存" : "🔼 直答");
    el.className = "zr-src" + (src === "mock" ? " mock" : src === "cache" ? " cache" : "");
  }

  function showMockWarning(panel, err) {
    var w = panel.querySelector("#zr-warn");
    if (!w) return;
    w.innerHTML = '<div style="background:#fef4e6;border:1px solid #fde68a;border-radius:6px;padding:7px 9px;margin-bottom:8px;font-size:12px;color:#92400e">⚠️ 后端在用兜底假数据' + (err ? '（' + esc(err) + '）' : '') + '</div>';
  }

  function dedupe(comments) {
    var seen = {}, out = [];
    for (var i = 0; i < comments.length; i++) {
      var text = (comments[i].text || "").trim();
      if (!text || seen[text]) continue;
      seen[text] = true;
      out.push(comments[i]);
    }
    return out;
  }

  // ── 主流程：读评论 → 争议地图 → （可选）逐条展开 ────────
  var FIRST_BATCH = 5;
  var BATCH = 10;
  var MAX_BATCHES = 3;

  async function doAnalyze(target, btn) {
    var panel = openShell();
    var t0 = Date.now();
    var body = panel.querySelector("#zr-body");
    var core = panel.querySelector("#zr-core");
    var tick = function (msg) {
      var el = panel.querySelector("#zr-count");
      if (el) el.textContent = msg + "（" + ((Date.now() - t0) / 1000).toFixed(1) + "s）";
    };

    // 1) 读评论
    var comments = [];
    try {
      if (target.type === "demo") {
        // 演示页：评论就在 HTML 里，不走网络，也就不会因为知乎抽风而失败
        core.textContent = "正在读取演示页评论…";
        comments = scrapeDemoComments();
        tick("已读 " + comments.length + " 条");
      } else if (target.type === "question") {
        core.textContent = "正在读取该问题下前 " + CRAWL.maxAnswers + " 个回答的评论…";
        comments = await fetchAllComments(target.id, function (n, cur, total) {
          tick("已读 " + n + " 条（第 " + cur + "/" + total + " 个回答）");
        });
      } else {
        core.textContent = "正在读取评论…";
        comments = await fetchComments(target, function (n) { tick("已读 " + n + " 条"); });
      }
    } catch (e) {
      body.innerHTML = '<div class="zc-err">读评论失败：' + esc(e.message) +
        '<div class="zc-note" style="color:#b91c1c">知乎的评论接口需要登录态，先确认当前浏览器是登录状态。</div></div>';
      var rb = document.createElement("button");
      rb.className = "zc-retry"; rb.textContent = "重试";
      rb.onclick = function () { doAnalyze(target, btn); };
      body.appendChild(rb);
      return;
    }

    comments = dedupe(comments);
    if (!comments.length) {
      // 最常见的原因不是「没有评论」，而是评论区还没展开 ——
      // 接口要登录态/会限流，DOM 兜底又只能读已经渲染出来的节点。
      // 所以这里要给出能照着做的下一步，不是一句「没读到」。
      body.innerHTML =
        '<div class="zc-err">没读到评论。</div>' +
        '<div class="zc-note">按这个顺序试：' +
        '<br>1. <b>先点开页面上的「N 条评论」把评论区展开</b>，滚动几下让评论加载出来，再点一次本按钮' +
        '<br>2. 确认当前浏览器<b>已登录知乎</b>（评论接口要登录态）' +
        '<br>3. 刚才连着点了很多次 → 可能被知乎限流了，等一两分钟' +
        '<br>4. 想先看效果不依赖知乎：打开 <b>localhost:8000/demo</b>' +
        '</div>';
      var rb0 = document.createElement("button");
      rb0.className = "zc-retry";
      rb0.textContent = "展开评论区后，点这里重试";
      rb0.onclick = function () { doAnalyze(target, btn); };
      body.appendChild(rb0);
      return;
    }

    // 2) 争议聚合
    core.textContent = "读到 " + comments.length + " 条评论，正在归并阵营…";
    tick("AI 正在读这 " + comments.length + " 条");
    var data;
    try {
      data = await callApi("/api/consensus", {
        title: pageTitle(),
        comments: comments.map(function (c) {
          return { id: c.id, text: c.text, likes: c.likes, author: c.author };
        }),
      });
    } catch (e) {
      body.innerHTML = '<div class="zc-err">后端没响应：' + esc(e.message) +
        '<div class="zc-note" style="color:#b91c1c">确认后端在跑：双击 start.bat，然后打开 http://localhost:8000/api/health</div></div>';
      var rb2 = document.createElement("button");
      rb2.className = "zc-retry"; rb2.textContent = "重试";
      rb2.onclick = function () { doAnalyze(target, btn); };
      body.appendChild(rb2);
      return;
    }

    setSource(panel, data._source);
    if (data._source === "mock" && data._error) showMockWarning(panel, data._error);

    // 3) 渲染首屏
    var scale = data._total > data._analyzed
      ? '读了 <b>' + data._total + '</b> 条评论，抽 <b>' + data._analyzed + '</b> 条做归并'
      : '读了 <b>' + data._total + '</b> 条评论';

    var html = '<div class="zc-scale">' + scale + '，归成 <b>' + (data.camps || []).length + '</b> 个阵营</div>';
    if (data.core_dispute) html += '<div class="zr-core">⚔️ 在争什么：' + esc(data.core_dispute) + '</div>';
    html += campsBarHtml(data.camps);
    if (data.mindmap) html += '<div class="zc-sec">🗺️ 争议地图</div>' + mindmapHtml(data.mindmap);
    if (data.crux) html += '<div class="zc-sec">🎯 分歧的根在哪</div><div class="zc-crux">' + esc(data.crux) + '</div>';
    html += gemsHtml(data.buried_gems);
    if ((data.camps || []).length) html += '<div class="zc-sec">🧭 各阵营在说什么</div>' + campsListHtml(data.camps);
    html += relatedPostsHtml(data.related_posts);
    html += '<div class="zc-fold"><button class="zc-fold-btn" id="zr-fold">🔍 逐条看这 ' +
      Math.min(comments.length, FIRST_BATCH + BATCH * MAX_BATCHES) +
      ' 条评论的逻辑分析</button><div class="zc-note" id="zr-fold-note">阵营划分已经够看懂争议了。要挑单条的推理链和逻辑漏洞再点开。</div><div id="zr-list"></div></div>';

    body.innerHTML = html;
    tick("完成");

    var fold = panel.querySelector("#zr-fold");
    fold.onclick = function () {
      fold.disabled = true;
      fold.textContent = "⏳ 正在逐条分析…";
      var note = panel.querySelector("#zr-fold-note");
      if (note) note.remove();
      streamCards(comments, panel, function (msg) { fold.textContent = msg; });
    };
  }

  // 折叠区里的逐条流式分析（原来的主流程，现在降级成细节）
  async function streamCards(comments, panel, onStatus) {
    var listEl = panel.querySelector("#zr-list");
    var pages = [];
    for (var i = 0; i < Math.min(comments.length, FIRST_BATCH + BATCH * MAX_BATCHES); i += BATCH) {
      if (i === 0) pages.push({ comments: comments.slice(0, FIRST_BATCH), isEnd: false });
      else pages.push({ comments: comments.slice(i, i + BATCH), isEnd: i + BATCH >= comments.length });
    }

    var failed = 0, jobs = [];
    for (var bi = 0; bi < pages.length; bi++) {
      var page = pages[bi];
      var batchNo = bi + 1;
      var pending = new Map();
      page.comments.forEach(function (c) {
        pending.set(String(c.id), c);
        var ph = document.createElement("div");
        ph.className = "zr-comment";
        ph.id = "zr-pending-" + c.id;
        ph.innerHTML = '<div class="zr-c-author">' + esc(c.author || "用户") + '</div>' +
          '<div class="zr-c-text">' + esc(c.text) + '</div>' +
          '<div class="zr-count" style="margin:0">分析中…</div>';
        listEl.appendChild(ph);
      });

      (function (batchNo, page, pending) {
        jobs.push((async function () {
          var fill = function (key, c, inner) {
            var ph = document.getElementById("zr-pending-" + key);
            if (!ph) return;
            ph.outerHTML = '<div class="zr-comment"><div class="zr-c-author">' + esc(c.author || "用户") + '</div>' +
              '<div class="zr-c-text">' + esc(c.text) + '</div>' + inner + '</div>';
          };
          try {
            await streamAnalyze(page.comments, function (ev, d) {
              if (ev === "analysis") {
                var c = pending.get(String(d.id));
                if (c) { pending.delete(String(d.id)); fill(String(d.id), c, cardHtml(d)); }
              } else if (ev === "error") {
                throw new Error(d.message || "流式分析出错");
              }
            }, batchNo === 1 ? "fast" : null);
          } catch (e) {
            // 流式没接上 → 退回整批
            try {
              var d2 = await callApi("/api/analyze", { comments: page.comments });
              var byId = new Map();
              (d2.analyses || []).forEach(function (a) { byId.set(String(a.id), a); });
              pending.forEach(function (c, key) {
                fill(key, c, byId.has(key) ? cardHtml(byId.get(key))
                  : '<div class="zx-block-row" style="color:#8590a6">— 未分析 —</div>');
              });
              pending.clear();
            } catch (e2) {
              failed += pending.size;
              pending.forEach(function (c, key) {
                fill(key, c, '<div class="zx-block-row" style="color:#ef4444">— 这批分析失败 —<br>' +
                  '<span style="color:#b91c1c;font-size:11px">' + esc(e2.message) + '</span></div>');
              });
              pending.clear();
            }
          }
        })());
      })(batchNo, page, pending);

      if (page.isEnd) break;
      await sleep(80);
    }

    await Promise.all(jobs);
    if (onStatus) onStatus(failed ? "✅ 逐条分析完成（" + failed + " 条失败）" : "✅ 逐条分析完成");
  }

  // ── 思维导图（帖子正文） ────────────────────────────────
  function scrapePostContent() {
    var els = document.querySelectorAll("[class*='RichContent'], [class*='Post-RichText'], [class*='RichText']");
    for (var i = 0; i < els.length; i++) {
      var t = els[i].textContent.replace(/\s+/g, " ").trim();
      if (t.length > 50) return t.slice(0, 3000);
    }
    var title = document.querySelector("[class*='QuestionHeader-title'], h1, [class*='Post-Title']");
    if (title) return title.textContent.replace(/\s+/g, " ").trim().slice(0, 3000);
    return "";
  }

  function renderMindmap(panel, data) {
    var html = '<div class="zr-head">🧠 思维导图 <span class="zr-src' +
      (data._source === "mock" ? " mock" : data._source === "cache" ? " cache" : "") + '">' +
      (data._source === "mock" ? "🚧 假数据" : data._source === "cache" ? "📥 缓存" : "🔼 直答") +
      '</span> <button class="zr-close">✕</button></div>';
    if (data.title) html += '<div class="zr-count">' + esc(data.title) + '</div>';
    html += (data.mindmap ? mindmapHtml(data.mindmap) : '<div class="zc-err">没有导图数据。</div>');
    if (data.related_posts && data.related_posts.length) html += relatedPostsHtml(data.related_posts);
    panel.innerHTML = html;
    panel.querySelector(".zr-close").onclick = function () { panel.remove(); window.__zha.panelOpen = false; };
  }

  // 面板内的粘贴框，替代原来的 prompt()。
  // 原生 prompt()/alert() 在真知乎页面上一弹就露馅，而且页面结构一变就会触发。
  function askForContent(panel, onGot) {
    panel.innerHTML =
      '<div class="zr-head">🧠 思维导图 <button class="zr-close">✕</button></div>' +
      '<div class="zc-note" style="margin-bottom:8px">没自动识别到正文（这个页面的结构和预期不一样）。把正文粘进来也能生成：</div>' +
      '<textarea class="zc-paste" id="zr-paste" placeholder="粘贴帖子或回答的正文…"></textarea>' +
      '<button class="zc-paste-go" id="zr-paste-go">生成导图</button>';
    panel.querySelector(".zr-close").onclick = function () { panel.remove(); window.__zha.panelOpen = false; };
    var ta = panel.querySelector("#zr-paste");
    ta.focus();
    panel.querySelector("#zr-paste-go").onclick = function () {
      var v = ta.value.trim();
      if (v) onGot(v);
    };
  }

  async function doMindmap(btn) {
    var orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = "生成中…";

    var panel = openPanel();
    panel.innerHTML = '<div class="zr-head">🧠 思维导图 <button class="zr-close">✕</button></div>' +
      '<div class="zr-core">正在生成…</div>';
    panel.querySelector(".zr-close").onclick = function () { panel.remove(); window.__zha.panelOpen = false; };

    var run = async function (content) {
      panel.innerHTML = '<div class="zr-head">🧠 思维导图 <button class="zr-close">✕</button></div>' +
        '<div class="zr-core">正在生成…</div>';
      panel.querySelector(".zr-close").onclick = function () { panel.remove(); window.__zha.panelOpen = false; };
      try {
        var data = await callApi("/api/mindmap", { title: pageTitle(), content: content });
        renderMindmap(panel, data);
      } catch (e) {
        panel.innerHTML = '<div class="zr-head">🧠 思维导图 <button class="zr-close">✕</button></div>' +
          '<div class="zc-err">生成失败：' + esc(e.message) +
          '<div class="zc-note" style="color:#b91c1c">确认后端在跑：http://localhost:8000/api/health</div></div>';
        panel.querySelector(".zr-close").onclick = function () { panel.remove(); window.__zha.panelOpen = false; };
      } finally {
        btn.disabled = false;
        btn.textContent = orig;
      }
    };

    var content = scrapePostContent();
    if (content) { await run(content); return; }

    btn.disabled = false;
    btn.textContent = orig;
    askForContent(panel, function (v) {
      btn.disabled = true;
      btn.textContent = "生成中…";
      run(v);
    });
  }

  function openPanel() {
    var old = document.getElementById("zha-real-panel");
    if (old) old.remove();
    var p = document.createElement("div");
    p.id = "zha-real-panel";
    document.body.appendChild(p);
    window.__zha.panelOpen = true;
    return p;
  }

  // ── FAB 菜单（板块A 部分） ──────────────────────────────
  function mountFab() {
    var fab = document.createElement("button");
    fab.id = "zha-fab";
    fab.textContent = "⚡";
    document.body.appendChild(fab);

    var menu = document.createElement("div");
    menu.id = "zha-fab-menu";
    menu.style.bottom = (24 + 56 + 12) + "px";
    document.body.appendChild(menu);

    window.__zha.fabMenu = menu;

    function toggleMenu(show) {
      var isOpen = menu.classList.contains("show");
      if (show === undefined) show = !isOpen;
      menu.classList.toggle("show", show);
      fab.classList.toggle("open", show);
    }
    window.__zha.closeFabMenu = function () { toggleMenu(false); };

    fab.onclick = function (e) { e.stopPropagation(); toggleMenu(); };
    document.addEventListener("click", function () { toggleMenu(false); }, { passive: true });

    // ── A 的菜单项：争议地图 ──
    (function () {
      var btn = document.createElement("button");
      btn.className = "zha-fab-item";
      btn.id = "zha-fab-analyze";
      btn.textContent = "🗺️ 争议地图";
      btn.style.background = "#0066ff";
      menu.appendChild(btn);
      btn.onclick = function (e) {
        e.stopPropagation();
        toggleMenu(false);
        var b = e.currentTarget;
        var orig = b.textContent;
        b.disabled = true;
        b.textContent = "读取中…";
        (async function () {
          try {
            var target = detectTarget();
            if (!target) {
              // 不用 alert：原生弹窗在真知乎上很突兀，也挡住了页面
              var p = openShell();
              p.querySelector("#zr-body").innerHTML =
                '<div class="zc-err">这个页面识别不出来。争议地图支持：问题页、回答页、专栏文章页。</div>';
              p.querySelector("#zr-src").textContent = "—";
              return;
            }
            await doAnalyze(target, b);
          } catch (err) {
            console.error(err);
            var p2 = document.getElementById("zha-real-panel") || openShell();
            var bodyEl = p2.querySelector("#zr-body");
            if (bodyEl) bodyEl.innerHTML = '<div class="zc-err">出错了：' + esc(err.message) + '</div>';
          } finally {
            b.disabled = false;
            b.textContent = orig;
          }
        })();
      };
    })();

    // ── A 的菜单项：思维导图 ──
    (function () {
      var btn = document.createElement("button");
      btn.className = "zha-fab-item";
      btn.id = "zha-fab-mindmap";
      btn.textContent = "🧠 思维导图";
      btn.style.background = "#00897b";
      menu.appendChild(btn);
      btn.onclick = function (e) {
        e.stopPropagation();
        toggleMenu(false);
        doMindmap(e.currentTarget);
      };
    })();

    window.__zha._aReady = true;
  }

  // ── 启动 ──
  function mount() {
    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    mountFab();
  }

  if (window.__zha) {
    mount();
  } else {
    var wait = setInterval(function () {
      if (window.__zha) { clearInterval(wait); mount(); }
    }, 50);
  }

})();
