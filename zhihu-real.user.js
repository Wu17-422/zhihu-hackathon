// ==UserScript==
// @name         犀利评手 · 知乎评论分析（真知乎）
// @namespace    zhihu-hackathon
// @version      1.0
// @description  在知乎回答/文章页，一键抓取整个评论区，用 AI 分析每条评论的立场、逻辑与漏洞
// @match        https://www.zhihu.com/*
// @match        https://zhuanlan.zhihu.com/p/*
// @grant        GM_xmlhttpRequest
// @connect      localhost
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const API = "http://localhost:8000";

  const CSS = `
    #zha-real-btn{position:fixed;right:24px;bottom:24px;z-index:2147483000;padding:12px 20px;background:#0066ff;color:#fff;border:none;border-radius:22px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 14px rgba(0,102,255,.35)}
    #zha-real-btn:disabled{background:#b9d9f5;cursor:default}
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
    .zx-card{background:#f4f8ff;border:1px solid #e0ecff;border-left:3px solid #0066ff;border-radius:8px;padding:10px 12px;font-size:12.5px;line-height:1.6}
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
    .zr-stance-bar{margin:8px 0}
    .zr-stance-bar-inner{display:flex;height:14px;border-radius:7px;overflow:hidden;background:#eee}
    .zr-stance-seg{height:100%}
    .zr-stance-seg.agree{background:#0fa968}
    .zr-stance-seg.neutral{background:#f59e0b}
    .zr-stance-seg.oppose{background:#ef4444}
    .zr-stance-labels{display:flex;justify-content:space-between;font-size:11px;color:#666;margin-top:4px}
  `;

  function esc(s) { const d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 流式分析：后端一条分析完就推一条过来，卡片边到边填，用户不用等整批。
  // onEvent(type, data) 的 type 是 meta / analysis / done / error。
  // model 传 "fast" 就是换快模型（第一批用，首屏快几秒）；不传走后端默认。
  // 这里用页面自己的 fetch（不是 GM_xmlhttpRequest）—— 只有 fetch 能读流；
  // 后端开了 CORS，跨域没问题。起不来就直接抛，调用方退回整包分析。
  async function streamAnalyze(comments, onEvent, model) {
    const qs = model ? "?model=" + encodeURIComponent(model) : "";
    const resp = await fetch(API + "/api/analyze/stream" + qs, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comments }),
    });
    if (!resp.ok) throw new Error("后端 HTTP " + resp.status + "（start.bat 开了吗？）");
    if (!resp.body || !resp.body.getReader) throw new Error("这个浏览器读不了流");

    const reader = resp.body.getReader();
    const dec = new TextDecoder("utf-8");
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      // 一个 SSE 事件 = 若干行 + 空行。按空行切开逐个处理。
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const raw = buf.slice(0, idx).replace(/\r/g, "");
        buf = buf.slice(idx + 2);
        let name = "message", data = "";
        for (const line of raw.split("\n")) {
          if (line.startsWith("event:")) name = line.slice(6).trim();
          else if (line.startsWith("data:")) data += line.slice(5).trim();
        }
        if (!data) continue;
        let obj;
        try { obj = JSON.parse(data); } catch (e) { continue; }
        onEvent(name, obj);
      }
    }
  }

  function detectTarget() {
    const href = location.href;
    const ans = href.match(/\/answer\/(\d+)/);
    if (ans) return { type: "answer", id: ans[1] };
    const art = href.match(/zhuanlan\.zhihu\.com\/p\/(\d+)/);
    if (art) return { type: "article", id: art[1] };
    const q = href.match(/zhihu\.com\/question\/(\d+)/);
    if (q) return { type: "question", id: q[1] };
    return null;
  }

  // 从页面 DOM 提取回答（问题列表页）
  function scrapeAnswers() {
    const out = [];
    const seen = new Set();
    for (const el of document.querySelectorAll("a[href*='/answer/']")) {
      const m = (el.getAttribute("href") || "").match(/\/answer\/(\d+)/);
      if (!m || seen.has(m[1])) continue;
      seen.add(m[1]);
      // 回答正文：找它所在的回答卡片
      const card = el.closest("[class*='AnswerItem'], [class*='List-item'], [class*='Card']");
      const contentEl = card ? card.querySelector("[class*='RichText'], [class*='RichContent'], [class*='content']") : null;
      const text = (contentEl ? contentEl.textContent : el.textContent || "").replace(/\s+/g, " ").trim();
      out.push({ id: m[1], content: text.slice(0, 1000), likes: 0 });
      if (out.length >= 200) break;
    }
    return out;
  }

  async function fetchComments(target) {
    const all = [];
    let offset = 0;
    const LIMIT = 20;
    const MAX_PAGES = 3; // 后端只分析 30 条，再往后爬纯属白等
    for (let p = 0; p < MAX_PAGES; p++) {
      // 走 fetchCommentPage：它自己会挑能用的那版接口（v4 优先）
      const page = await fetchCommentPage(target, offset, LIMIT);
      if (!page.comments.length) {
        if (p === 0) throw new Error(page.diag || "没抓到评论");
        break;
      }
      for (const c of page.comments) all.push(c);
      if (page.isEnd) break;
      offset += LIMIT;
      await sleep(60);
    }
    return all;
  }

  // 抓一页评论（边抓边分析用）。返回 {comments, isEnd, diag}
  //
  // 知乎有两版评论接口，都试：
  //   v4  /api/v4/{answers|articles}/{id}/comments        ← 正常，主力
  //   v5  /api/v4/comment_v5/{...}/{id}/root_comment      ← 会回空页（声称 totals=N 但 data=[]）
  // 2026-09-14 实测：某个回答 v5 恒回 data:[] 而 totals:6，v4 同参数正常。
  // 所以这里按顺序试，遇到「说有 N 条却回空页」的直接换下一版。
  function commentUrls(target, offset, limit) {
    const t = `${target.type}s`; // answer→answers / article→articles
    return [
      `https://www.zhihu.com/api/v4/${t}/${target.id}/comments?order=normal&limit=${limit}&offset=${offset}`,
      `https://www.zhihu.com/api/v4/comment_v5/${t}/${target.id}/root_comment?order_by=score&limit=${limit}&offset=${offset}`,
    ];
  }

  async function fetchCommentPage(target, offset, limit) {
    const LIMIT = limit || 20;
    let lastDiag = "";

    for (const url of commentUrls(target, offset, LIMIT)) {
      let resp;
      try {
        resp = await fetch(url, { credentials: "include" });
      } catch (e) {
        // 跨站被浏览器拦掉就会走这里（从 zhuanlan 页面调 www 的接口属于跨域）
        lastDiag = `请求发不出去（可能是跨域，当前域名 ${location.host}）：${e.message}`;
        continue;
      }
      if (!resp.ok) {
        const hint = resp.status === 401 || resp.status === 403
          ? "（要么这个页面类型不支持，要么知乎改了鉴权）" : "";
        lastDiag = `评论接口 HTTP ${resp.status}${hint}`;
        continue;
      }
      const rawText = await resp.text();
      let json;
      try { json = JSON.parse(rawText); } catch (e) {
        lastDiag = "接口返回非 JSON：" + rawText.slice(0, 300);
        continue;
      }

      const d = json.data;
      let list = null;
      if (Array.isArray(d)) list = d;
      else if (d && Array.isArray(d.data)) list = d.data;
      else if (d && Array.isArray(d.comments)) list = d.comments;
      if (!list) {
        // 结构对不上：把接口实际回了什么带回去，省得靠猜
        const shape = json.error
          ? "error=" + JSON.stringify(json.error).slice(0, 200)
          : "data 是 " + (d === null ? "null" : typeof d) +
            (d && typeof d === "object" ? "，keys=" + Object.keys(d).slice(0, 10).join(",") : "");
        lastDiag = "接口结构对不上（" + shape + "）";
        continue;
      }

      const comments = [];
      for (const c of list) {
        const text = (c.content || c.content_text || "").toString().trim();
        if (!text) continue;
        comments.push({
          id: c.id,
          text,
          likes: c.vote_count || c.like_count || c.vote || 0,
          author: (c.author && c.author.member && c.author.member.name) || (c.author && c.author.name) || "",
        });
      }

      const paging = json.paging || (d && d.paging) || {};
      const totals = typeof paging.totals === "number" ? paging.totals : comments.length;
      if (!comments.length && totals > 0) {
        // 这个版本回空页了（v5 的毛病），换下一版试
        lastDiag = `接口说共 ${totals} 条，返回的却是空页`;
        continue;
      }
      return {
        comments,
        isEnd: !!paging.is_end,
        diag: comments.length ? "" : "接口回了 0 条 —— 这个页面本身没有评论",
      };
    }

    return { comments: [], isEnd: true, diag: lastDiag || "两版评论接口都没拿到数据" };
  }

  function callAnalyze(comments) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: API + "/api/analyze",
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify({ comments }),
        timeout: 180000,
        onload: (r) => {
          try {
            const d = JSON.parse(r.responseText);
            if (d && d.ok === false) reject(new Error((d.error && d.error.message) || "后端返回错误"));
            else resolve(d);
          } catch (e) { reject(new Error("后端返回非 JSON（HTTP " + r.status + "）")); }
        },
        onerror: () => reject(new Error("连不上本地后端，请先运行 start.bat")),
        ontimeout: () => reject(new Error("分析超时（>180s）")),
      });
    });
  }

  function normalizeStance(s) { const t = (s || "").toLowerCase(); if (/支持|赞成|同意|肯定|正方|agree|pro|support/.test(t)) return "agree"; if (/反对|驳斥|质疑|否定|反方|唱衰|oppose|con|against/.test(t)) return "oppose"; return "neutral"; }
  // cls 必须和 CSS 里的 .zx-stance.agree / .oppose / .neutral 对上（以前写错了，标签一直是灰的）
  function stanceMeta(s) { const n = normalizeStance(s); if (n === "agree") return { cls: "agree", ico: "🟢", label: "赞成" }; if (n === "oppose") return { cls: "oppose", ico: "🔴", label: "反对" }; return { cls: "neutral", ico: "🟡", label: "中立" }; }
  function parseFlaw(str) { const m = String(str).match(/^([^：:]+)[：:]\s*([\s\S]*)$/); return m ? { name: m[1].trim(), desc: m[2].trim() } : { name: String(str), desc: "" }; }

  function cardHtml(a) {
    const sm = stanceMeta(a.stance);
    const flaws = a.flaws || [];
    const flawsHtml = flaws.length ? `<div class="zx-flaws"><div class="zx-flaws-title">⚠ 逻辑漏洞</div>` + flaws.map(f => { const p = parseFlaw(f); return `<div class="zx-flaw"><span class="zx-flaw-badge">${esc(p.name)}</span><span class="zx-flaw-desc">${esc(p.desc)}</span></div>`; }).join("") + `</div>` : "";
    const empty = !a.gist && !a.logic;
    const body = empty ? `<div class="zx-block-row" style="color:#8590a6">— 未分析 —</div>` : `<div class="zx-block"><div class="zx-block-row"><b>想表达什么</b>${esc(a.gist)}</div></div><div class="zx-block"><div class="zx-block-row"><b>推理链</b>${esc(a.logic)}</div></div>${flawsHtml}`;
    return `<div class="zx-card"><div class="zx-card-head"><span class="zx-ai-chip">AI</span><span class="zx-brand">犀利评手 · 分析</span><span class="zx-stance ${sm.cls}">${sm.ico} ${sm.label}</span></div>${body}</div>`;
  }

  // 问题页：把页面上抓到的前 N 个回答逐个分析，每个回答配最多 5 条高赞评论。
  // 和回答页一样「立即开面板 + 流式边出边显」——
  // 以前是全部跑完才渲染面板，用户盯着一个只会变字的按钮好几分钟，会以为插件挂了。
  async function analyzeQuestion(qid, btn) {
    const panel = openShell();                        // 先开面板，别让用户干等
    const listEl = panel.querySelector("#zr-list");
    const setCore = (html) => { panel.querySelector("#zr-core").innerHTML = html; };
    const t0 = Date.now();
    const tick = (msg) => {
      panel.querySelector("#zr-count").textContent =
        `${msg} · ${Math.round((Date.now() - t0) / 1000)}s`;
    };

    // 不问 prompt 了：Chrome 一旦把「阻止此页面创建更多对话框」勾上，
    // prompt 会返回 null 而不显示，旧代码会因此掉进 || 20 去扫 20 个回答。
    // 改成面板里点按钮，也顺带让面板一进来就有东西看。
    setCore(`<b>问题 ${qid}</b> · 想分析前几个回答？（每个回答 = 1 次调用）`);
    tick("请选择回答数");
    const pick = document.createElement("div");
    pick.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin:0 0 10px";
    pick.innerHTML = [3, 5, 10].map((k) =>
      `<button data-n="${k}" style="padding:6px 14px;border:1px solid #0066ff;background:#ecf3ff;color:#0066ff;border-radius:16px;font-size:13px;font-weight:600;cursor:pointer">前 ${k} 个</button>`
    ).join("");
    panel.querySelector("#zr-core").after(pick);
    const n = await new Promise((res) => {
      pick.querySelectorAll("[data-n]").forEach((b) => { b.onclick = () => res(Number(b.dataset.n)); });
      panel.querySelector(".zr-close").onclick = () => res(0); // 关面板 = 取消，别把按钮卡在 disabled
    });
    pick.remove();
    panel.querySelector(".zr-close").onclick = () => panel.remove();
    if (!n) { panel.remove(); return; }

    const answers = scrapeAnswers();
    if (!answers.length) {
      setCore(`没从页面提取到回答。<span style="color:#8590a6">问题页要先把回答往下滚动加载出来，再点分析。</span>`);
      return;
    }
    const topAnswers = answers.slice(0, n);
    setCore(`问题 ${qid} · 逐条分析前 ${topAnswers.length} 个回答`);
    tick("开始");

    const totals = emptyStats();
    const allComments = [];
    let failed = 0, warned = false;

    for (let i = 0; i < topAnswers.length; i++) {
      const ans = topAnswers[i];
      tick(`第 ${i + 1}/${topAnswers.length} 个回答：抓评论…`);
      let comments = [];
      try { comments = await fetchComments({ type: "answer", id: ans.id }); }
      catch (e) { console.warn("评论抓取失败，只分析正文", ans.id, e); }
      allComments.push(...comments);

      // 一条回答 + 最多 5 条高赞评论：和接口 30 条上限对得上，别一次塞爆
      const topComments = comments.slice().sort((a, b) => (b.likes || 0) - (a.likes || 0)).slice(0, 5);
      const items = [{ id: "ans-" + ans.id, text: ans.content, likes: 0 }, ...topComments];

      // 回答头先贴出来当分隔，卡片一会儿跟在它后面
      listEl.insertAdjacentHTML("beforeend",
        `<div class="zr-comment"><div class="zr-c-author">回答 #${esc(ans.id)}</div>` +
        `<div class="zr-c-text">${esc(ans.content.slice(0, 150))}${ans.content.length > 150 ? "…" : ""}</div></div>`);

      const pending = collectComments(items);
      const flush = (inner) => {
        for (const [, c] of pending) appendCommentCard(listEl, c, inner);
        pending.clear();
      };
      const showStats = (data) => {
        if (!data) return;
        addStats(totals, data.stats);
        panel.querySelector("#zr-stats").innerHTML = stanceBarHtml(totals);
        if (data.source) setSource(panel, data.source);
      };

      tick(`第 ${i + 1}/${topAnswers.length} 个回答：分析中…`);
      try {
        // 第一个回答走快模型，首屏早一点出东西
        await streamAnalyze(items, (ev, data) => {
          if (ev === "analysis") {
            const c = pending.get(String(data.id));
            if (!c) return;
            pending.delete(String(data.id));
            appendCommentCard(listEl, c, cardHtml(data));
          } else if (ev === "done") {
            flush(NOT_ANALYZED);
            showStats(data);
          } else if (ev === "error") {
            throw new Error(data.message || "流式分析出错");
          }
        }, i === 0 ? "fast" : null);
        if (pending.size) flush(NOT_ANALYZED);
      } catch (e) {
        // 流没接上就退回整包 —— 和回答页一个策略，别让用户少这一块
        console.warn(`回答 ${ans.id} 流式失败，退回整包`, e);
        try {
          const data = await callAnalyze(items);
          const byId = new Map();
          (data.analyses || []).forEach((a) => byId.set(String(a.id), a));
          for (const [id, c] of pending) {
            appendCommentCard(listEl, c, byId.get(id) ? cardHtml(byId.get(id)) : NOT_ANALYZED);
          }
          pending.clear();
          showStats(data);
          if (!warned && data._source === "mock" && data._error) {
            warned = true;
            showMockWarning(panel, data._error);
          }
        } catch (e2) {
          failed++;
          flush(`<div class="zx-block-row" style="color:#ef4444">— 这条没分析成功 —<br><span style="color:#b91c1c;font-size:11px">${esc(e2.message)}</span></div>`);
        }
      }
    }

    // 最后把所有评论汇总一次，出「整体争议」+ 相关帖子
    if (allComments.length) {
      tick("整体汇总…");
      try {
        await streamAnalyze(allComments, (ev, data) => {
          if (ev === "meta" && data.core_dispute) setCore(`<b>整体争议：</b>${esc(data.core_dispute)}`);
          else if (ev === "done") {
            panel.querySelector("#zr-related").innerHTML = relatedPostsHtml(data.related_posts);
            if (data.source) setSource(panel, data.source);
          } else if (ev === "error") throw new Error(data.message || "汇总出错");
        });
      } catch (e) {
        console.warn("整体汇总没成功，不影响上面的分答结果", e);
      }
    }

    tick(failed ? `完成（${failed} 个回答失败）` : "全部完成");
  }

  function relatedPostsHtml(posts) {
    if (!posts || !posts.length) return "";
    return `<div class="zr-count">🔗 相关帖子推荐：</div>` +
      posts.map(p => `<div class="zr-comment"><div class="zr-c-text">📄 ${esc(p.title)}</div><div class="zr-count" style="color:#8590a6">${esc(p.reason || "")}</div></div>`).join("");
  }

  function mindmapHtml(node, depth) {
    const pad = depth * 14;
    let h = `<div style="margin:2px 0 2px ${pad}px">${depth === 0 ? "🎯 " : "· "}${esc(node.name || "")}</div>`;
    for (const c of (node.children || [])) h += mindmapHtml(c, depth + 1);
    return h;
  }

  function scrapePostContent() {
    const els = document.querySelectorAll("[class*='RichContent'], [class*='Post-RichText'], [class*='RichText']");
    for (const el of els) {
      const t = el.textContent.replace(/\s+/g, " ").trim();
      if (t.length > 50) return t.slice(0, 3000);
    }
    const title = document.querySelector("[class*='QuestionHeader-title'], h1, [class*='Post-Title']");
    if (title) return title.textContent.replace(/\s+/g, " ").trim().slice(0, 3000);
    return "";
  }

  async function doMindmap(btn) {
    let content = scrapePostContent();
    if (!content) {
      content = prompt("没自动识别到正文，请粘贴帖子/回答的正文：");
      if (!content || !content.trim()) return;
    }
    const titleEl = document.querySelector("[class*='QuestionHeader-title'], h1, [class*='Post-Title']");
    const title = titleEl ? titleEl.textContent.replace(/\s+/g, " ").trim() : "";
    btn.disabled = true; btn.textContent = "生成导图中…";
    try {
      const resp = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "POST",
          url: API + "/api/mindmap",
          headers: { "Content-Type": "application/json" },
          data: JSON.stringify({ title, content }),
          timeout: 180000,
          onload: (r) => { try { resolve(JSON.parse(r.responseText)); } catch (e) { reject(new Error("后端返回非 JSON")); } },
          onerror: () => reject(new Error("连不上本地后端，请先运行 start.bat")),
          ontimeout: () => reject(new Error("生成超时")),
        });
      });
      renderMindmap(resp);
    } catch (e) { alert("出错：" + e.message); }
    finally { btn.disabled = false; btn.textContent = "🧠 思维导图"; }
  }

  function renderMindmap(data) {
    const old = document.getElementById("zha-real-panel");
    if (old) old.remove();
    const panel = document.createElement("div");
    panel.id = "zha-real-panel";
    let html = `<div class="zr-head">🧠 思维导图 <span class="zr-src">${esc(data._source || "")}</span> <button class="zr-close">✕</button></div>`;
    if (data.title) html += `<div class="zr-count">${esc(data.title)}</div>`;
    html += `<div class="zr-core">${data.mindmap ? mindmapHtml(data.mindmap, 0) : "没有导图数据。"}</div>`;
    panel.innerHTML = html;
    document.body.appendChild(panel);
    panel.querySelector(".zr-close").onclick = () => panel.remove();
  }

  function stanceBarHtml(stats) {
    if (!stats) return "";
    const agree = stats.agree ? stats.agree.count : 0;
    const oppose = stats.oppose ? stats.oppose.count : 0;
    const neutral = stats.neutral ? stats.neutral.count : 0;
    const total = agree + oppose + neutral;
    if (total === 0) return "";
    const ap = Math.round(agree / total * 100);
    const op = Math.round(oppose / total * 100);
    const np = 100 - ap - op;
    return `<div class="zr-stance-bar"><div class="zr-stance-bar-inner"><div class="zr-stance-seg agree" style="width:${ap}%"></div><div class="zr-stance-seg neutral" style="width:${np}%"></div><div class="zr-stance-seg oppose" style="width:${op}%"></div></div><div class="zr-stance-labels"><span>🟢 赞成 ${agree}</span><span>🟡 中立 ${neutral}</span><span>🔴 反对 ${oppose}</span></div></div>`;
  }

  // ── 边抓边分析 ──────────────────────────────────────────
  // 抓到一批就先贴出来，AI 结果回来再原地填卡；用户不用等全部跑完。
  // 每批条数 = 一次模型调用要处理的评论数。批越小，这一批的第一张卡越早出现
  // （模型得先想完再吐），但覆盖的评论也越少。总批数 = 消耗的额度次数。
  const FIRST_BATCH = 5;  // 第一批再小一点，第一屏抢时间
  const BATCH = 10;       // 后续每批
  const MAX_BATCHES = 3;  // 总共几批 = 消耗几次额度

  function openShell() {
    const old = document.getElementById("zha-real-panel");
    if (old) old.remove();
    const panel = document.createElement("div");
    panel.id = "zha-real-panel";
    panel.innerHTML =
      `<div class="zr-head">⚔️ 犀利评手 · 评论分析 <span class="zr-src" id="zr-src">分析中…</span> <button class="zr-close">✕</button></div>` +
      `<div id="zr-warn"></div>` +
      `<div class="zr-core" id="zr-core">正在抓取第一批评论…</div>` +
      `<div id="zr-stats"></div>` +
      `<div class="zr-count" id="zr-count"></div>` +
      `<div id="zr-related"></div>` +
      `<div id="zr-list"></div>`;
    document.body.appendChild(panel);
    panel.querySelector(".zr-close").onclick = () => panel.remove();
    return panel;
  }

  // 抓到的评论先只登记，不贴出来 —— 等分析结果回来，再连评论原文带卡片一起显示。
  // 为什么不立刻贴：整批分析要几十秒，列表里铺一屏「分析中…」看着就像卡死了。
  function collectComments(comments) {
    const m = new Map();
    for (const c of comments) m.set(String(c.id), c);
    return m;
  }

  const NOT_ANALYZED = `<div class="zx-block-row" style="color:#8590a6">— 未分析 —</div>`;

  // 一条评论 + 它的分析卡，一起贴到列表末尾。
  // 谁先分析完谁先出现，天然就是「先出结果的在前面」，不用再来回挪 DOM。
  function appendCommentCard(listEl, c, inner) {
    listEl.insertAdjacentHTML(
      "beforeend",
      `<div class="zr-comment"><div class="zr-c-author">${esc(c.author || "匿名用户")}${c.likes ? ` · 👍 ${c.likes}` : ""}</div><div class="zr-c-text">${esc(c.text)}</div>${inner}</div>`
    );
    return listEl.lastElementChild;
  }

  function emptyStats() { return { agree: { count: 0 }, oppose: { count: 0 }, neutral: { count: 0 } }; }

  function addStats(total, s) {
    if (!s) return;
    for (const k of ["agree", "oppose", "neutral"]) {
      if (s[k] && typeof s[k].count === "number") total[k].count += s[k].count;
    }
  }

  function setSource(panel, src) {
    const el = panel.querySelector("#zr-src");
    el.textContent = src || "";
    el.className = "zr-src" + (src === "mock" ? " mock" : src === "cache" ? " cache" : "");
  }

  // 真接口没调通时后端会拿假数据兜底 —— 必须让用户看见，否则会以为分析的就是真实评论
  function showMockWarning(panel, err) {
    panel.querySelector("#zr-warn").innerHTML =
      `<div class="zx-flaws" style="margin-bottom:8px"><div class="zx-flaws-title">⚠ 后端在用兜底假数据</div>` +
      `<div style="color:#b91c1c;font-size:12px;line-height:1.5">${esc(err)}</div>` +
      `<div style="color:#8590a6;font-size:11px;margin-top:4px">真接口没调通，下面这些内容是编的，不是对真实评论的分析。</div></div>`;
  }

  async function analyzeIncremental(target, btn) {
    const panel = openShell();
    const listEl = panel.querySelector("#zr-list");
    const totals = emptyStats();
    const t0 = Date.now();
    let offset = 0, crawled = 0, analyzed = 0, batches = 0, failed = 0;
    let headlineDone = false, relatedDone = false, warned = false;
    let crawlErr = ""; // 抓取失败的真实原因，下面别拿通用文案把它盖掉
    let streamErr = ""; // 流式失败的原因，也让用户看得见，别只写 console
    const jobs = [];

    const tick = (msg) => {
      panel.querySelector("#zr-count").textContent =
        `${msg} · 已抓 ${crawled} 条 · 已分析 ${analyzed} 条 · ${Math.round((Date.now() - t0) / 1000)}s`;
    };

    // 抓取循环：抓到一批就贴出原文、把分析丢出去，然后立刻抓下一批 —— 不等 AI 回来
    while (batches < MAX_BATCHES) {
      const limit = batches === 0 ? FIRST_BATCH : BATCH;
      btn.textContent = `⚔️ 抓取第 ${batches + 1} 批…`;
      let page;
      try {
        page = await fetchCommentPage(target, offset, limit);
      } catch (e) {
        crawlErr = e.message;
        break;
      }
      if (!page.comments.length) { crawlErr = crawlErr || page.diag || ""; break; }

      batches++;
      crawled += page.comments.length;
      offset += limit;

      const pending = collectComments(page.comments); // 还没出结果的评论（key 是 id 的字符串）
      const batchNo = batches;
      tick(`第 ${batchNo} 批已抓，正在分析`);

      jobs.push(
        (async () => {
          let ok = 0;

          // 一批的收尾：没等到结果的也要把评论原文贴出来（标「未分析」），统计和顶部一次性对齐
          const finish = (data) => {
            for (const [, c] of pending) appendCommentCard(listEl, c, NOT_ANALYZED);
            pending.clear();
            if (data) {
              addStats(totals, data.stats);
              panel.querySelector("#zr-stats").innerHTML = stanceBarHtml(totals);
              // 顶部只让最先回来的那批写，避免几批互相刷
              if (!headlineDone && data.core_dispute) {
                headlineDone = true;
                panel.querySelector("#zr-core").textContent = data.core_dispute;
              }
              if (!relatedDone) {
                relatedDone = true;
                panel.querySelector("#zr-related").innerHTML = relatedPostsHtml(data.related_posts);
              }
              if (data.source) setSource(panel, data.source);
            }
            tick(`第 ${batchNo} 批完成`);
          };

          try {
            // 第一批走快模型：thinking 要先把整批想完才吐 JSON，首屏干等太久
            await streamAnalyze(page.comments, (ev, data) => {
              if (ev === "meta") {
                // 争论点比逐条分析先出来，先把它贴到顶部
                if (!headlineDone && data.core_dispute) {
                  headlineDone = true;
                  panel.querySelector("#zr-core").textContent = data.core_dispute;
                }
              } else if (ev === "analysis") {
                const c = pending.get(String(data.id));
                if (c) {
                  pending.delete(String(data.id));
                  appendCommentCard(listEl, c, cardHtml(data)); // 评论 + 卡片一起出现
                  ok++; analyzed++;
                  tick(`第 ${batchNo} 批分析中`);
                }
              } else if (ev === "error") {
                throw new Error(data.message || "流式分析出错");
              } else if (ev === "done") {
                finish(data);
              }
            }, batchNo === 1 ? "fast" : null);
            if (pending.size) finish(null); // 流正常结束但没等到 done（少见）
          } catch (e) {
            // 流起不来或中途断了 —— 退回原来的一次性分析，别让用户少一批卡
            console.warn(`第 ${batchNo} 批流式失败，退回整包分析`, e);
            if (!streamErr) {
              streamErr = e.message;
              panel.querySelector("#zr-warn").innerHTML =
                `<div style="background:#fff8e6;border:1px solid #ffe1a8;border-radius:6px;padding:7px 9px;margin-bottom:8px;font-size:12px;color:#8a5a00">` +
                `流式没接上，已退回整批分析（要等更久）：${esc(e.message)}</div>`;
            }
            try {
              const data = await callAnalyze(page.comments);
              const byId = new Map();
              (data.analyses || []).forEach((a) => byId.set(String(a.id), a));
              for (const [id, c] of pending) {
                appendCommentCard(listEl, c, byId.get(id) ? cardHtml(byId.get(id)) : NOT_ANALYZED);
              }
              pending.clear();
              analyzed += page.comments.length - ok;
              finish(data);
              if (!warned && data._source === "mock" && data._error) {
                warned = true;
                showMockWarning(panel, data._error);
              }
            } catch (e2) {
              console.warn(`第 ${batchNo} 批分析失败`, e2);
              failed += page.comments.length - ok;
              // 把原因写在卡片上 —— 只写 console 的话，用户没法告诉我们到底哪错了
              for (const [, c] of pending) {
                appendCommentCard(listEl, c,
                  `<div class="zx-block-row" style="color:#ef4444">— 这批分析失败 —<br><span style="color:#b91c1c;font-size:11px">${esc(e2.message)}</span></div>`);
              }
              pending.clear();
              tick(`第 ${batchNo} 批失败`);
            }
          }
        })()
      );

      if (page.isEnd) break;
      await sleep(80);
    }

    if (!jobs.length) {
      // 有真实原因就显示真实原因 —— 通用文案会把诊断线索全吃掉
      panel.querySelector("#zr-core").innerHTML = crawlErr
        ? `抓取出错：<span style="color:#b91c1c">${esc(crawlErr)}</span>`
        : "没抓到评论（这条回答可能真的一条评论都没有）。";
      return;
    }

    btn.textContent = "⚔️ 分析中…";
    tick("等 AI 返回…");
    await Promise.all(jobs);
    tick(failed ? `完成（${failed} 条失败）` : "全部完成");
  }

  function mount() {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    const btn = document.createElement("button");
    btn.id = "zha-real-btn";
    btn.textContent = "⚔️ 分析知乎评论";
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = "抓取评论中…";
      try {
        const target = detectTarget();
        if (!target) { alert("无法识别当前页面。请打开回答页、文章页或问题页。"); return; }
        if (target.type === "question") {
          await analyzeQuestion(target.id, btn);
          return;
        }
        await analyzeIncremental(target, btn);
      } catch (e) {
        console.error(e);
        alert("出错：" + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = "⚔️ 分析知乎评论";
      }
    };
    document.body.appendChild(btn);

    const mmBtn = document.createElement("button");
    mmBtn.id = "zha-mindmap-btn";
    mmBtn.style.cssText = "position:fixed;right:24px;bottom:80px;z-index:2147483000;padding:10px 16px;background:#00897b;color:#fff;border:none;border-radius:22px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 4px 14px rgba(0,137,123,.35)";
    mmBtn.textContent = "🧠 思维导图";
    mmBtn.onclick = () => doMindmap(mmBtn);
    document.body.appendChild(mmBtn);
  }

  mount();
})();
