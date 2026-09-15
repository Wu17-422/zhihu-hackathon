/* 犀利评手 · 共享连接器 (板块C)
 * ===============================
 * 职责：
 *   1. 定义 window.__zha 共享接口
 *   2. 按顺序加载板块A 和 板块B 的内容脚本
 *   3. 提供最终的 manifest.json
 *
 * 约定（A 和 B 遵守）：
 *   - A 调用 window.__zha.setupFab() 创建 FAB 按钮和菜单容器
 *   - B 调用 window.__zha.addMenuItem(...) 添加菜单项
 *   - A/B 各自独立，不引用对方代码
 *   - C 写好不动，A/B 修改内部逻辑不影响拼接
 */

(function () {
  'use strict';

  // ── 共享接口 ──────────────────────────────────────────
  window.__zha = {
    // FAB 菜单容器（A 创建后设置）
    fabMenu: null,

    // 关闭 FAB 菜单（由 A 注册）
    closeFabMenu: null,

    // 添加菜单项
    addMenuItem: function (label, color, id, onClick) {
      var self = this;
      var menu = self.fabMenu;
      if (!menu) {
        console.warn("[板块C] FAB 菜单还没创建，稍后重试");
        setTimeout(function () { self.addMenuItem(label, color, id, onClick); }, 100);
        return;
      }
      var btn = document.createElement("button");
      btn.className = "zha-fab-item";
      btn.id = id;
      btn.textContent = label;
      btn.style.background = color;
      menu.appendChild(btn);
      btn.onclick = function (e) {
        e.stopPropagation();
        if (typeof self.closeFabMenu === "function") self.closeFabMenu();
        onClick.call(this, e);
      };
    },

    // 面板状态
    panelOpen: false,
    polishPanelOpen: false,

    // 通用工具（A 和 B 共享）
    esc: function (s) {
      var d = document.createElement("div");
      d.textContent = s == null ? "" : String(s);
      return d.innerHTML;
    },

    // 后端 API 地址
    API: "http://localhost:8000",

    // 通用 API 调用
    //
    // ⚠ 默认走真实调用。这里原来把 "?force=mock" 硬编码在 URL 里，
    //   于是无论 key 对不对，全线返回的都是兜底假数据 —— 而且界面上
    //   那个「🚧 假数据」角标是对的，只是没人注意到它一直亮着。
    //
    // 调样式不想烧额度时，在控制台执行：localStorage.zhaMock = 1
    // 恢复真实调用：delete localStorage.zhaMock
    callApi: async function (path, body) {
      var mock = false;
      try { mock = !!localStorage.getItem("zhaMock"); } catch (e) {}
      var resp = await fetch(this.API + path + (mock ? "?force=mock" : ""), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      return resp.json();
    },
  };

  // ── 加载板块 A 和 B ──────────────────────────────────
  // contentC.js 通过 manifest.json 被注入页面，然后动态加载 A 和 B
  // 由于 content script 不能动态加载同目录文件，C 采用 append script 方式
  // 注入到页面上下文（A/B 通过 GM_xmlhttpRequest 或 fetch 加载自身）

  console.log("[板块C] 连接器已加载，等待板块 A/B 就绪");

  // 通过定时轮询等待 A 和 B 完成初始化
  // A 会在完成 setupFab 后设置 window.__zha._aReady = true
  // B 会在完成 init 后设置 window.__zha._bReady = true
  var checkReady = setInterval(function () {
    if (window.__zha._aReady && window.__zha._bReady) {
      clearInterval(checkReady);
      console.log("[板块C] 所有板块已就绪");
    }
  }, 200);

})();
