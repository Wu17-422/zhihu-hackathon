/* 犀利评手 · 板块B — 写评论 + 故事/知识
 * ============================================
 * 依赖：window.__zha（由板块C 提供）
 * 独立运行，不引用板块A 的任何代码
 */

(function () {
  'use strict';

  // 惰性取值：从 window.__zha 读取共享工具（initB() 调用前 __zha 必须就绪）
  var esc = function(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  };
  var API = "http://localhost:8000";

  // 调样式不想烧额度时：localStorage.zhaMock = 1（和板块A 一个口径）
  // ⚠ 默认走真实调用。之前这里把 "?force=mock" 硬编码在 URL 里，
  //   润色功能从来没真正调过直答，返回的一直是兜底假数据。
  function apiUrl(path) {
    var mock = false;
    try { mock = !!localStorage.getItem("zhaMock"); } catch (e) {}
    return API + path + (mock ? "?force=mock" : "");
  }

  var callApi = async function(path, body) {
    var resp = await fetch(apiUrl(path), { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body) });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    return resp.json();
  };

  // ── CSS（B 独有的样式） ────────────────────────────────
  var CSS = `
    #zha-polish-panel{position:fixed;top:0;right:0;width:430px;height:100vh;background:#fff;z-index:2147483002;box-shadow:-4px 0 20px rgba(0,0,0,.15);overflow-y:auto;font-size:13px;color:#1a1a1a;line-height:1.6;padding:16px;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;display:none}
    .zr-polish-draft{width:100%;min-height:100px;border:1px solid #ebebeb;border-radius:8px;padding:10px;font-size:13px;box-sizing:border-box;font-family:inherit}
    .zr-polish-bar{display:flex;align-items:center;gap:10px;margin:8px 0;font-size:12px;color:#666}
    .zr-polish-result{font-size:13px;line-height:1.7}
    .zr-p-flaw{border:1px solid #ffd9d9;background:#fff6f6;border-radius:7px;padding:8px 11px;font-size:12.5px;margin-bottom:6px}
    .zr-pf-name{font-weight:700;color:#ef4444}
    .zr-pf-claim{color:#b91c1c;margin:3px 0}
    .zr-pf-why{color:#666}
    /* 这两个原来定义在板块A 的 CSS 里，但只有 B 用得到 —— 搬过来，B 不再依赖 A 的样式 */
    .zr-verdict{font-size:13px;background:#f4f8ff;border-radius:7px;padding:9px 11px;color:#444;margin-bottom:8px}
    .zr-verdict b{color:#1e6fff}
    .zb-err{background:#fff6f6;border:1px solid #ffd9d9;border-radius:7px;padding:9px 11px;font-size:12.5px;color:#b91c1c;line-height:1.6}
    /* 「相关讨论」—— 2026-09-15 替掉了原来的「改好的版本」(.zr-p-rewrite) */
    .zb-view{font-size:12px;color:#8590a6;margin-bottom:6px}
    .zb-ok{background:#e7f8f0;border:1px solid #bfe9d5;border-radius:7px;padding:8px 11px;font-size:12.5px;color:#0f7a4d;margin-bottom:6px}
    .zb-sec{font-size:12.5px;font-weight:700;color:#1a1a1a;margin:14px 0 8px;padding-top:12px;border-top:1px solid #f0f0f0}
    .zb-rp{display:flex;gap:9px;align-items:flex-start;padding:8px 0;border-bottom:1px solid #f5f5f5}
    .zb-rp:last-child{border-bottom:none}
    .zb-rp-no{flex:0 0 auto;width:18px;height:18px;border-radius:50%;background:#ecf3ff;color:#0066ff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:1px}
    .zb-rp-body{min-width:0}
    .zb-rp-title{font-size:13px;line-height:1.5;color:#1a1a1a}
    .zb-rp-link{color:#0066ff;text-decoration:none}
    .zb-rp-link:hover{text-decoration:underline}
    .zb-rp-why{font-size:11.5px;color:#8590a6;line-height:1.5;margin-top:3px}
    .zb-loading{opacity:.5;font-size:12.5px;color:#8590a6;transition:opacity .15s}
    .zb-slot-logic{margin-bottom:2px}
    .zb-slot-related{}
  `;

  // ── 写评论：实时挑逻辑漏洞 + 推 5 条相关讨论 ──────────────
  var polishTimer = null;
  var realtime = true;

  // 每次请求带一个序号：打字快的时候会连着发好几个请求，返回顺序不保证。
  // 不记序号的话，先发出去的慢请求回来得晚，会盖掉后发的新结果。
  var polishSeq = 0;

  var PLACEHOLDER = "输入评论，AI 实时帮你挑逻辑漏洞、并找 5 条相关讨论。";

  function relatedHtml(posts) {
    if (!posts || !posts.length) return "";
    var items = posts.slice(0, 5).map(function (p, i) {
      var title = p.url
        ? '<a href="' + esc(p.url) + '" target="_blank" rel="noopener" class="zb-rp-link">' + esc(p.title) + '</a>'
        : esc(p.title);
      return '<div class="zb-rp"><span class="zb-rp-no">' + (i + 1) + '</span>' +
        '<div class="zb-rp-body"><div class="zb-rp-title">' + title + '</div>' +
        (p.reason ? '<div class="zb-rp-why">' + esc(p.reason) + '</div>' : '') +
        '</div></div>';
    }).join("");
    return '<div class="zb-sec">🔗 相关讨论 · 发言前先看看别人怎么说</div>' + items;
  }

  // 并行发两个请求，各自回来各自填自己那块：
  //   /api/related 只搜不调模型，约 1 秒 → 先把 5 条帖子铺出来
  //   /api/polish  要调模型，约 6 秒     → 逻辑漏洞晚几秒填进来
  // 串着等的话用户 6 秒内什么都看不到，「实时」就不成立了。
  async function doPolish() {
    var draft = document.querySelector(".zr-polish-draft");
    var resultEl = document.querySelector(".zr-polish-result");
    if (!draft || !resultEl) return;
    var text = draft.value.trim();
    if (!text) { resultEl.textContent = PLACEHOLDER; return; }

    var myTurn = ++polishSeq;

    // 先搭骨架，两块各自占好位置 —— 免得后到的内容把先到的往下顶
    resultEl.innerHTML =
      '<div class="zb-slot-logic zb-loading">正在挑逻辑漏洞…</div>' +
      '<div class="zb-slot-related zb-loading">正在找相关讨论…</div>';
    var logicEl = resultEl.querySelector(".zb-slot-logic");
    var relEl = resultEl.querySelector(".zb-slot-related");

    // ── 快的那个：相关讨论 ──
    callApi("/api/related", { draft: text }).then(function (d) {
      if (myTurn !== polishSeq || !relEl) return;   // 已有更新的请求在路上
      relEl.classList.remove("zb-loading");
      var html = relatedHtml(d.related_posts);
      relEl.innerHTML = html || '<div class="zb-sec">🔗 相关讨论</div><div class="zb-rp-why">没搜到相关的帖子。</div>';
    }).catch(function (e) {
      if (myTurn !== polishSeq || !relEl) return;
      relEl.classList.remove("zb-loading");
      relEl.innerHTML = '<div class="zb-sec">🔗 相关讨论</div><div class="zb-rp-why">搜索失败：' + esc(e.message) + '</div>';
    });

    // ── 慢的那个：逻辑漏洞 ──
    try {
      var d = await callApi("/api/polish", { draft: text });
      if (myTurn !== polishSeq || !logicEl) return;

      var flaws = (d.flaws || []).map(function (f) {
        return '<div class="zr-p-flaw"><div class="zr-pf-name">⚠ ' + esc(f.name) + '</div><div class="zr-pf-claim">问题点：' + esc(f.claim) + '</div><div class="zr-pf-why">原因：' + esc(f.why) + '</div></div>';
      }).join("");

      var head = d.viewpoint ? '<div class="zb-view">你在主张：' + esc(d.viewpoint) + '</div>' : "";
      var ok = (d.flaws || []).length ? "" : '<div class="zb-ok">✓ 没挑出逻辑问题</div>';

      // 这里原来还有第三块「改好的版本」+ 复制按钮，2026-09-15 按需求去掉了 ——
      // 用户要的是判断和参考资料，不是代笔。
      logicEl.classList.remove("zb-loading");
      logicEl.innerHTML = head +
        '<div class="zr-verdict"><b>判断：</b>' + esc(d.verdict) + '</div>' + ok + flaws;
    } catch (e) {
      if (myTurn !== polishSeq || !logicEl) return;
      logicEl.classList.remove("zb-loading");
      logicEl.innerHTML = '<div class="zb-err">挑漏洞失败：' + esc(e.message) +
        '<br>确认后端在跑：http://localhost:8000/api/health</div>';
    }
  }

  function mountPolish() {
    // 如果面板已存在则不重复创建
    if (document.getElementById("zha-polish-panel")) return;

    var panel = document.createElement("div");
    panel.id = "zha-polish-panel";
    panel.innerHTML = '<div class="zr-head">\u270D\uFE0F 写评论 · 实时检测 <button class="zr-close">\u2715</button></div>' +
      '<textarea class="zr-polish-draft" placeholder="在这里写你的评论…"></textarea>' +
      '<div class="zr-polish-bar"><label><input type="checkbox" id="zr-realtime" checked> 实时检测</label><span style="color:#8590a6">（停顿 1.5 秒自动分析）</span></div>' +
      '<div class="zr-polish-result">输入评论，AI 实时帮你挑逻辑漏洞。</div>';
    document.body.appendChild(panel);

    panel.querySelector(".zr-close").onclick = function () { panel.style.display = "none"; window.__zha.polishPanelOpen = false; };
    var ta = panel.querySelector(".zr-polish-draft");
    ta.addEventListener("input", function () {
      if (document.getElementById("zr-realtime") && document.getElementById("zr-realtime").checked) {
        if (polishTimer) clearTimeout(polishTimer);
        polishTimer = setTimeout(doPolish, 1500);
      }
    });
    var cb = panel.querySelector("#zr-realtime");
    if (cb) cb.addEventListener("change", function (e) {
      realtime = e.target.checked;
      if (realtime && ta.value.trim()) doPolish();
    });
  }

  // ── 故事/知识 ──────────────────────────────────────────
  function renderStories(s, k) {
    var old = document.getElementById("zha-real-panel");
    if (old) old.remove();
    var panel = document.createElement("div");
    panel.id = "zha-real-panel";
    window.__zha.panelOpen = true;
    var sItems = (s && (s.data || s.items)) || [];
    var kItems = (k && (k.data || k.items)) || [];
    var html = '<div class="zr-head">\uD83D\uDCDA 黑客松故事/知识 <button class="zr-close">\u2715</button></div>';
    html += '<div class="zr-count">\uD83D\uDCD6 知乎故事（' + sItems.length + '）</div>';
    for (var i = 0; i < sItems.length; i++) {
      var it = sItems[i];
      html += '<div class="zr-comment" data-wid="' + esc(it.work_id) + '" style="cursor:pointer"><div class="zr-c-text">\uD83D\uDCC4 ' + esc(it.title) + '</div><div class="zr-count" style="color:#8590a6">' + esc(it.description || "") + '</div></div>';
    }
    html += '<div class="zr-count">\uD83D\uDCDA 知乎知识（' + kItems.length + '）</div>';
    for (var j = 0; j < kItems.length; j++) {
      var it2 = kItems[j];
      html += '<div class="zr-comment" data-wid="' + esc(it2.work_id) + '" style="cursor:pointer"><div class="zr-c-text">\uD83D\uDCC4 ' + esc(it2.title) + '</div><div class="zr-count" style="color:#8590a6">' + esc(it2.description || "") + '</div></div>';
    }
    panel.innerHTML = html;
    document.body.appendChild(panel);
    panel.querySelector(".zr-close").onclick = function () { panel.remove(); window.__zha.panelOpen = false; };
    panel.querySelectorAll("[data-wid]").forEach(function (el) {
      el.onclick = async function () {
        try {
          var d = await (await fetch(API + "/api/story/" + el.getAttribute("data-wid"))).json();
          showStoryDetail(d);
        } catch (e) {
          // 不用 alert()：原生弹窗在真知乎页面上很突兀，还挡住内容
          var box = document.createElement("div");
          box.className = "zb-err";
          box.style.marginTop = "8px";
          box.textContent = "打开失败：" + e.message;
          el.appendChild(box);
        }
      };
    });
  }

  function showStoryDetail(d) {
    var item = (d && (d.data || d)) || {};
    var content = item.content || item.introduction || "";
    var old = document.getElementById("zha-real-panel");
    if (old) old.remove();
    var panel = document.createElement("div");
    panel.id = "zha-real-panel";
    window.__zha.panelOpen = true;
    var html = '<div class="zr-head">\uD83D\uDCD6 ' + esc(item.chapter_name || item.title || "") + ' <button class="zr-close">\u2715</button></div>';
    if (item.author_name) html += '<div class="zr-c-author">作者：' + esc(item.author_name) + '</div>';
    html += '<div class="zr-c-text" style="max-height:300px;overflow:auto;background:#fafafa;padding:10px;border-radius:6px">' + esc(content) + '</div>';
    panel.innerHTML = html;
    document.body.appendChild(panel);
    panel.querySelector(".zr-close").onclick = function () { panel.remove(); window.__zha.panelOpen = false; };
  }

  // ── 添加 B 的菜单项到 FAB ──────────────────────────────
  function initB() {
    // 先注入 CSS
    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    // 创建写评论面板
    mountPolish();

    // 通过共享接口添加菜单项
    // 写评论
    window.__zha.addMenuItem("\u270D\uFE0F 写评论", "#7c4dff", "zha-fab-polish", function (e) {
      var panel = document.getElementById("zha-polish-panel");
      if (panel) {
        var show = panel.style.display !== "block";
        panel.style.display = show ? "block" : "none";
        window.__zha.polishPanelOpen = show;
      }
    });

    // 故事/知识
    window.__zha.addMenuItem("\uD83D\uDCDA 故事/知识", "#e65100", "zha-fab-stories", function (e) {
      var btn = e.currentTarget;
      btn.disabled = true;
      var orig = btn.textContent;
      btn.textContent = "加载中…";
      (async function () {
        try {
          var [s, k] = await Promise.all([
            fetch(API + "/api/stories").then(function (r) { return r.json(); }),
            fetch(API + "/api/knowledge").then(function (r) { return r.json(); }),
          ]);
          renderStories(s, k);
        } catch (e) {
          // 同上：错误显示在面板里，不弹原生窗
          var old = document.getElementById("zha-real-panel");
          if (old) old.remove();
          var p = document.createElement("div");
          p.id = "zha-real-panel";
          p.innerHTML = '<div class="zr-head">📚 黑客松故事/知识 <button class="zr-close">✕</button></div>' +
            '<div class="zb-err">加载失败：' + esc(e.message) +
            '<br>确认后端在跑：http://localhost:8000/api/health</div>';
          document.body.appendChild(p);
          p.querySelector(".zr-close").onclick = function () { p.remove(); window.__zha.panelOpen = false; };
          window.__zha.panelOpen = true;
        }
        finally { btn.disabled = false; btn.textContent = orig; }
      })();
    });

    window.__zha._bReady = true;
  }

  // ── 启动 ──
  if (window.__zha) {
    initB();
  } else {
    var wait = setInterval(function () {
      if (window.__zha) { clearInterval(wait); initB(); }
    }, 50);
  }

})();
