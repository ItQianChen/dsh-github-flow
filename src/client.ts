declare global {
  interface Window {
    __ModuleLoader__: {
      load(options: { id: string; factory: (require: any) => any }): void;
    };
  }
}

window.__ModuleLoader__.load({
  id: "dsh-github-flow",
  factory: (require: any) => {
    var module = { exports: {} as any };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require("react");

    // ============================================================
    // 面板公共工具函数（纯函数，可被单元测试直接覆盖）
    // ============================================================

    /**
     * ISO 时间 → 人性化相对时间（"刚刚"/"N分钟前"/"N小时前"/"N天前"/日期回退）。
     * 为什么需要：PR/Issue/Run 的时间字段原始 ISO 串在窄面板不可读，相对时间
     * 一眼判断「还活跃吗」；hover 场景由调用方把绝对时间放进 title。
     */
    function formatRelativeTime(iso: any): string {
      if (!iso || typeof iso !== "string") return "";
      var t = Date.parse(iso);
      if (isNaN(t)) return "";
      var diff = Date.now() - t;
      if (diff < 0) return "刚刚"; // 时钟轻微漂移容错
      var MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
      if (diff < MIN) return "刚刚";
      if (diff < HOUR) return Math.floor(diff / MIN) + "分钟前";
      if (diff < DAY) return Math.floor(diff / HOUR) + "小时前";
      if (diff < 7 * DAY) return Math.floor(diff / DAY) + "天前";
      var d = new Date(t);
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }

    /**
     * statusCheckRollup 聚合为单枚举 CI 徽章状态（"pass" | "fail" | "pending" | null）。
     * 归约顺序刻意 fail > pending > pass：用户扫一眼要看到的是「有没有问题」，
     * 而非「有多少通过」——一个 fail 淹没在 9 个 pass 里就是漏报。
     */
    function rollupCiStatus(checks: any): "pass" | "fail" | "pending" | null {
      if (!Array.isArray(checks) || checks.length === 0) return null;
      var hasFail = false, hasPending = false;
      for (var i = 0; i < checks.length; i++) {
        var c = checks[i] || {};
        var status = String(c.status || "").toLowerCase();
        var conclusion = String(c.conclusion || "").toLowerCase();
        if (conclusion === "failure" || conclusion === "timed_out" || conclusion === "cancelled") hasFail = true;
        else if (conclusion === "success" || conclusion === "skipped" || conclusion === "neutral") { /* 通过族 */ }
        else if (status === "in_progress" || status === "queued" || conclusion === "pending" || (!conclusion && status)) hasPending = true;
      }
      if (hasFail) return "fail";
      if (hasPending) return "pending";
      return "pass";
    }

    /**
     * reviewDecision → 展示态（徽章文案与色彩键）。无判定返回 null 不渲染。
     */
    function reviewDecisionBadge(decision: any): { text: string; kind: "green" | "red" | "yellow" } | null {
      var d = String(decision || "").toUpperCase();
      if (d === "APPROVED") return { text: "✔ 已批准", kind: "green" };
      if (d === "CHANGES_REQUESTED") return { text: "✋ 需修改", kind: "red" };
      if (d === "REVIEW_REQUIRED") return { text: "👀 待审查", kind: "yellow" };
      return null;
    }

    /**
     * Actions event → 触发方式短标签。
     */
    function eventLabel(event: any): string {
      var e = String(event || "");
      if (e === "push") return "⇡ push";
      if (e === "schedule") return "⏰ 定时";
      if (e === "workflow_dispatch") return "▶ 手动";
      if (e === "pull_request") return "🔀 PR";
      return e || "";
    }

    /**
     * 按容器记录的 Tab 键应用互斥显示状态（hidden 页 + active 按钮）。
     * 模块级纯 DOM 操作：渲染函数（switchTab 点击路径）与宿主组件的 effect
     * （SWR 重渲染校正路径）共用——后者是必须的：React 重渲染会按 VDOM 初值
     * 重设 hidden/active，用户手动切的 Tab 会被一次后台数据同步拽回默认页。
     */
    function applyTabState(container: HTMLElement, tabKey: string) {
      var pages = container.querySelectorAll("[data-tab-page]");
      pages.forEach(function (page) {
        (page as HTMLElement).hidden = page.getAttribute("data-tab-page") !== tabKey;
      });
      var btns = container.querySelectorAll("[data-tab-btn]");
      btns.forEach(function (btn) {
        var on = btn.getAttribute("data-tab-btn") === tabKey;
        btn.className = "dsh-github-tab-btn" + (on ? " active" : "");
      });
    }

    // 面板样式（内联维护）：DSH 客户端加载器以经典脚本语义执行本产物（build.mjs 剥除
    // export 声明即为佐证），模块级 import 在该语境是 SyntaxError。曾尝试把 CSS 拆为
    // 独立模块经 import 引入，导致 DSH 重启时客户端加载崩溃并触发插件批量卸载——
    // 已回滚。样式与组件的分离改由「同文件内分区注释」维持，不再跨文件。
    var GITHUB_PANEL_CSS = `
/* ==========================================================================
   DSH GitHub Flow - 主题自适应样式系统 (Light / Dark 动态联动)
   遵循 DSH 原生 DSW (DeepSeek Web) 设计语言规范
   ========================================================================== */

/* 1. 侧边栏图标与外壳 */
.dsh-github-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  cursor: pointer;
  color: var(--dsw-alias-label-secondary, #656d76);
  transition: color 0.15s ease;
}
.dsh-github-icon:hover {
  color: var(--dsw-alias-label-primary, #1f2328);
}
.dsh-github-icon-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  border: 1px solid transparent;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.dsh-github-icon-inner.active {
  background: var(--dsw-alias-bg-module-platform, rgba(9, 105, 218, 0.08));
  color: var(--dsw-alias-link, #0969da);
  border-color: var(--dsw-alias-border-l2, rgba(9, 105, 218, 0.2));
}

body[data-ds-dark-theme] .dsh-github-icon {
  color: var(--dsw-alias-label-secondary, #9ca3af);
}
body[data-ds-dark-theme] .dsh-github-icon:hover {
  color: var(--dsw-alias-label-primary, #ffffff);
}
body[data-ds-dark-theme] .dsh-github-icon-inner.active {
  background: linear-gradient(135deg, rgba(46, 160, 67, 0.3) 0%, rgba(31, 111, 235, 0.45) 100%);
  color: #ffffff;
  box-shadow: 0 0 12px rgba(31, 111, 235, 0.4);
  border-color: rgba(88, 166, 255, 0.45);
}

/* 2. Octocat 科技勋章 Badge */
.dsh-octocat-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1f6feb 0%, #0969da 60%, #8957e5 100%);
  box-shadow: 0 2px 6px rgba(9, 105, 218, 0.25);
  flex-shrink: 0;
}
body[data-ds-dark-theme] .dsh-octocat-badge {
  background: linear-gradient(135deg, #2ea043 0%, #1f6feb 60%, #8957e5 100%);
  box-shadow: 0 2px 8px rgba(31, 111, 235, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.25);
}

/* 3. 容器视图（主面板与右侧抽屉栏） */
.dsh-github-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding: 24px 32px;
  box-sizing: border-box;
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2328);
  font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
}

.dsh-github-rightbar-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding: 16px 18px;
  box-sizing: border-box;
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2328);
  font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
}

body[data-ds-dark-theme] .dsh-github-panel,
body[data-ds-dark-theme] .dsh-github-rightbar-container {
  background: var(--dsw-alias-bg-base, #151517);
  color: var(--dsw-alias-label-primary, #ececec);
}

/* 4. 头部区域 */
.dsh-github-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, #e5e7eb);
}
body[data-ds-dark-theme] .dsh-github-header {
  border-bottom-color: var(--dsw-alias-border-l1, #2c2c2e);
}
.dsh-github-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.dsh-github-title h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #1f2328);
}
body[data-ds-dark-theme] .dsh-github-title h2 {
  color: var(--dsw-alias-label-primary, #f0f6fc);
}

/* 5. 刷新按钮 */
.dsh-github-refresh-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2, #e1e4e8);
  background: var(--dsw-alias-bg-module-platform, #f6f8fa);
  color: var(--dsw-alias-label-primary, #1f2328);
  cursor: pointer;
  transition: all 0.15s ease;
}
.dsh-github-refresh-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, #ebeef2);
  border-color: var(--dsw-alias-border-l3, #d0d7de);
}
.dsh-github-refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
body[data-ds-dark-theme] .dsh-github-refresh-btn {
  border-color: var(--dsw-alias-border-l1, #38383c);
  background: var(--dsw-alias-bg-layer-2, #242528);
  color: var(--dsw-alias-label-primary, #f0f6fc);
}
body[data-ds-dark-theme] .dsh-github-refresh-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, #2f3034);
  border-color: rgba(255, 255, 255, 0.25);
}

/* 6. 概览卡片与网格 */
.dsh-github-overview-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}
.dsh-github-card {
  padding: 14px 16px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, #e5e7eb);
  background: var(--dsw-alias-bg-layer-1, #fcfcfd);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  margin-bottom: 12px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
body[data-ds-dark-theme] .dsh-github-card {
  border-color: var(--dsw-alias-border-l1, #303034);
  background: var(--dsw-alias-bg-layer-2, #212124);
  box-shadow: none;
}
.dsh-github-card-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--dsw-alias-label-tertiary, #656d76);
  margin-bottom: 6px;
  font-weight: 500;
}
body[data-ds-dark-theme] .dsh-github-card-title {
  color: var(--dsw-alias-label-tertiary, #888);
}
.dsh-github-card-value {
  font-size: 15px;
  font-weight: 600;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--dsw-alias-label-primary, #1f2328);
}
body[data-ds-dark-theme] .dsh-github-card-value {
  color: var(--dsw-alias-label-primary, #f0f6fc);
}
.dsh-github-card-desc {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #656d76);
  margin-top: 4px;
  line-height: 1.4;
}
body[data-ds-dark-theme] .dsh-github-card-desc {
  color: var(--dsw-alias-label-secondary, #bbb);
}
.dsh-github-card-subtext {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #8c959f);
  margin-top: 6px;
}
body[data-ds-dark-theme] .dsh-github-card-subtext {
  color: var(--dsw-alias-label-tertiary, #888);
}

/* 7. 徽章（Badges） */
.dsh-github-badge {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 12px;
  font-weight: 500;
  line-height: 16px;
}
.dsh-badge-green {
  background: rgba(46, 160, 67, 0.12);
  color: #1a7f37;
  border: 1px solid rgba(46, 160, 67, 0.2);
}
.dsh-badge-red {
  background: rgba(207, 34, 46, 0.12);
  color: #cf222e;
  border: 1px solid rgba(207, 34, 46, 0.2);
}
.dsh-badge-yellow {
  background: rgba(154, 103, 0, 0.12);
  color: #9a6700;
  border: 1px solid rgba(154, 103, 0, 0.2);
}
.dsh-badge-blue {
  background: rgba(9, 105, 218, 0.12);
  color: #0969da;
  border: 1px solid rgba(9, 105, 218, 0.2);
}
.dsh-badge-purple {
  background: rgba(137, 87, 229, 0.12);
  color: #8250df;
  border: 1px solid rgba(137, 87, 229, 0.2);
}
body[data-ds-dark-theme] .dsh-badge-green {
  background: rgba(46, 160, 67, 0.22);
  color: #3fb950;
  border-color: rgba(46, 160, 67, 0.3);
}
body[data-ds-dark-theme] .dsh-badge-red {
  background: rgba(248, 81, 73, 0.22);
  color: #f85149;
  border-color: rgba(248, 81, 73, 0.3);
}
body[data-ds-dark-theme] .dsh-badge-yellow {
  background: rgba(210, 153, 34, 0.22);
  color: #d29922;
  border-color: rgba(210, 153, 34, 0.3);
}
body[data-ds-dark-theme] .dsh-badge-blue {
  background: rgba(56, 139, 253, 0.22);
  color: #58a6ff;
  border-color: rgba(56, 139, 253, 0.3);
}
body[data-ds-dark-theme] .dsh-badge-purple {
  background: rgba(163, 113, 247, 0.22);
  color: #bc8cff;
  border-color: rgba(163, 113, 247, 0.3);
}

/* 插件身份徽标：标识界面由第三方插件 dsh-github-flow 提供（非 DSH/GitHub 官方）。
 * 为什么需要：界面以 GitHub 官方 Octocat 做功能图标，新用户易误认为官方功能；
 * 徽标点击跳插件仓库，与设置「关于」页形成身份闭环。 */
.dsh-github-plugin-badge {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  font-weight: 500;
  padding: 1px 7px;
  border-radius: 10px;
  line-height: 14px;
  vertical-align: middle;
  margin-left: 8px;
  text-decoration: none !important;
  background: rgba(125, 133, 144, 0.12);
  color: #656d76;
  border: 1px solid rgba(125, 133, 144, 0.25);
  cursor: pointer;
  transition: all 0.15s ease;
}
.dsh-github-plugin-badge:hover {
  background: rgba(125, 133, 144, 0.2);
  color: var(--dsw-alias-label-primary, #1f2328);
}
body[data-ds-dark-theme] .dsh-github-plugin-badge {
  background: rgba(139, 148, 158, 0.18);
  color: #8b949e;
  border-color: rgba(139, 148, 158, 0.3);
}
body[data-ds-dark-theme] .dsh-github-plugin-badge:hover {
  background: rgba(139, 148, 158, 0.28);
  color: #f0f6fc;
}

/* 7.5. 分类筛选药丸栏 */
.dsh-github-pills {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.dsh-github-pill-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 14px;
  font-size: 11px;
  font-weight: 500;
  border: 1px solid var(--dsw-alias-border-l2, #d0d7de);
  background: var(--dsw-alias-bg-module-platform, #f6f8fa);
  color: var(--dsw-alias-label-secondary, #656d76);
  cursor: pointer;
  transition: all 0.15s ease;
}
.dsh-github-pill-btn:hover {
  color: var(--dsw-alias-label-primary, #1f2328);
  border-color: var(--dsw-alias-border-l3, #b0b8c1);
}
.dsh-github-pill-btn.active {
  background: var(--dsw-alias-bg-module-platform, rgba(9, 105, 218, 0.1));
  color: var(--dsw-alias-link, #0969da);
  border-color: var(--dsw-alias-link, #0969da);
  font-weight: 600;
}
body[data-ds-dark-theme] .dsh-github-pill-btn {
  background: var(--dsw-alias-bg-layer-2, #21262d);
  color: var(--dsw-alias-label-secondary, #8b949e);
  border-color: var(--dsw-alias-border-l1, #30363d);
}
body[data-ds-dark-theme] .dsh-github-pill-btn:hover {
  color: var(--dsw-alias-label-primary, #f0f6fc);
  border-color: #8b949e;
}
body[data-ds-dark-theme] .dsh-github-pill-btn.active {
  background: rgba(56, 139, 253, 0.18);
  color: #58a6ff;
  border-color: #58a6ff;
}

/* 8. 快捷操作网格 */
.dsh-github-quick-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 16px;
}
.dsh-github-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2, #e1e4e8);
  background: var(--dsw-alias-bg-module-platform, #f6f8fa);
  color: var(--dsw-alias-label-primary, #1f2328);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}
.dsh-github-action-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover, #ebeef2);
  border-color: var(--dsw-alias-link, #0969da);
  color: var(--dsw-alias-link, #0969da);
}
body[data-ds-dark-theme] .dsh-github-action-btn {
  border-color: var(--dsw-alias-border-l1, #444);
  background: var(--dsw-alias-bg-layer-2, #28282b);
  color: var(--dsw-alias-label-primary, #fff);
}
body[data-ds-dark-theme] .dsh-github-action-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover, #343438);
  border-color: #58a6ff;
  color: #58a6ff;
}

/* 组合式快捷操作按钮 (AI 智能装填主操作 + 官方外链直达) */
.dsh-github-split-btn {
  display: flex;
  align-items: stretch;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2, #e1e4e8);
  background: var(--dsw-alias-bg-module-platform, #f6f8fa);
  overflow: hidden;
  transition: all 0.15s ease;
}
.dsh-github-split-btn:hover {
  border-color: var(--dsw-alias-link, #0969da);
}
body[data-ds-dark-theme] .dsh-github-split-btn {
  border-color: var(--dsw-alias-border-l1, #444);
  background: var(--dsw-alias-bg-layer-2, #28282b);
}
body[data-ds-dark-theme] .dsh-github-split-btn:hover {
  border-color: #58a6ff;
}
.dsh-github-split-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 8px 8px;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-primary, #1f2328);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}
.dsh-github-split-main:hover {
  background: var(--dsw-alias-interactive-bg-hover, #ebeef2);
  color: var(--dsw-alias-link, #0969da);
}
body[data-ds-dark-theme] .dsh-github-split-main {
  color: var(--dsw-alias-label-primary, #fff);
}
body[data-ds-dark-theme] .dsh-github-split-main:hover {
  background: var(--dsw-alias-interactive-bg-hover, #343438);
  color: #58a6ff;
}
.dsh-github-split-link {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 8px;
  border-left: 1px solid var(--dsw-alias-border-l2, #e1e4e8);
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #656d76);
  font-size: 12px;
  font-weight: bold;
  text-decoration: none !important;
  cursor: pointer;
  transition: all 0.15s ease;
}
.dsh-github-split-link:hover {
  background: var(--dsw-alias-interactive-bg-hover, #ebeef2);
  color: var(--dsw-alias-link, #0969da);
}
body[data-ds-dark-theme] .dsh-github-split-link {
  border-left-color: var(--dsw-alias-border-l1, #444);
  color: var(--dsw-alias-label-secondary, #9ca3af);
}
body[data-ds-dark-theme] .dsh-github-split-link:hover {
  background: var(--dsw-alias-interactive-bg-hover, #343438);
  color: #58a6ff;
}

/* 9. 模块分区与列表 */
.dsh-github-section {
  margin-bottom: 20px;
}
.dsh-github-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.dsh-github-section-header h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary, #656d76);
}
body[data-ds-dark-theme] .dsh-github-section-header h3 {
  color: var(--dsw-alias-label-secondary, #ccc);
}
.dsh-github-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dsh-github-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2, #e5e7eb);
  background: var(--dsw-alias-bg-layer-1, #fcfcfd);
  transition: border-color 0.15s ease, background 0.15s ease;
}
.dsh-github-item:hover {
  border-color: var(--dsw-alias-border-l3, #d0d7de);
  background: var(--dsw-alias-interactive-bg-hover, #f6f8fa);
}
body[data-ds-dark-theme] .dsh-github-item {
  border-color: var(--dsw-alias-border-l1, #333336);
  background: var(--dsw-alias-bg-layer-2, #252528);
}
body[data-ds-dark-theme] .dsh-github-item:hover {
  border-color: var(--dsw-alias-border-l2, #555);
  background: var(--dsw-alias-interactive-bg-hover, #2c2c30);
}
.dsh-github-item-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary, #1f2328);
  text-decoration: none;
  transition: color 0.15s ease;
}
.dsh-github-item-title:hover {
  color: var(--dsw-alias-link, #0969da);
  text-decoration: underline;
}
body[data-ds-dark-theme] .dsh-github-item-title {
  color: var(--dsw-alias-label-primary, #f0f6fc);
}
body[data-ds-dark-theme] .dsh-github-item-title:hover {
  color: #58a6ff;
}
.dsh-github-item-desc {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #656d76);
  line-height: 1.4;
}
body[data-ds-dark-theme] .dsh-github-item-desc {
  color: var(--dsw-alias-label-secondary, #bbb);
}
.dsh-github-item-meta {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #656d76);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
body[data-ds-dark-theme] .dsh-github-item-meta {
  color: var(--dsw-alias-label-secondary, #8c8c8c);
}

/* 10. 小按钮样式（在 GitHub 打开等） */
.dsh-github-btn-sm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2, #d0d7de);
  background: var(--dsw-alias-bg-module-platform, #f6f8fa);
  color: var(--dsw-alias-label-primary, #1f2328);
  cursor: pointer;
  text-decoration: none !important;
  transition: all 0.15s ease;
}
.dsh-github-btn-sm:hover {
  background: var(--dsw-alias-interactive-bg-hover, #ebeef2);
  border-color: var(--dsw-alias-border-l3, #b0b8c1);
  color: var(--dsw-alias-link, #0969da);
}
body[data-ds-dark-theme] .dsh-github-btn-sm {
  border-color: var(--dsw-alias-border-l1, #444);
  background: var(--dsw-alias-bg-layer-2, #26272b);
  color: var(--dsw-alias-label-primary, #f0f6fc);
}
body[data-ds-dark-theme] .dsh-github-btn-sm:hover {
  background: var(--dsw-alias-interactive-bg-hover, #33343a);
  border-color: rgba(255, 255, 255, 0.25);
  color: #58a6ff;
}

/* 11. 空状态 */
.dsh-github-empty {
  padding: 24px;
  text-align: center;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary, #656d76);
  border: 1px dashed var(--dsw-alias-border-l2, #d0d7de);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.01);
}
body[data-ds-dark-theme] .dsh-github-empty {
  color: var(--dsw-alias-label-tertiary, #888);
  border-color: var(--dsw-alias-border-l1, #38383c);
  background: rgba(255, 255, 255, 0.01);
}

/* 12. Tabs 导航栏 */
.dsh-github-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 18px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, #e5e7eb);
  padding-bottom: 8px;
}
body[data-ds-dark-theme] .dsh-github-tabs {
  border-bottom-color: var(--dsw-alias-border-l1, #303034);
}
.dsh-github-tab-btn {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #656d76);
  cursor: pointer;
  transition: all 0.15s ease;
}
.dsh-github-tab-btn:hover {
  color: var(--dsw-alias-label-primary, #1f2328);
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.dsh-github-tab-btn.active {
  color: var(--dsw-alias-link, #0969da);
  background: rgba(9, 105, 218, 0.1);
  font-weight: 600;
}
body[data-ds-dark-theme] .dsh-github-tab-btn {
  color: var(--dsw-alias-label-secondary, #8c8c8c);
}
body[data-ds-dark-theme] .dsh-github-tab-btn:hover {
  color: var(--dsw-alias-label-primary, #fff);
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.06));
}
body[data-ds-dark-theme] .dsh-github-tab-btn.active {
  color: #58a6ff;
  background: rgba(88, 166, 255, 0.15);
}

/* 13. 搜索输入框 */
.dsh-github-search-input {
  width: 100%;
  max-width: 320px;
  padding: 6px 12px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2, #d0d7de);
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2328);
  outline: none;
  margin-bottom: 14px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.dsh-github-search-input:focus {
  border-color: var(--dsw-alias-link, #0969da);
  box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.15);
}
body[data-ds-dark-theme] .dsh-github-search-input {
  border-color: var(--dsw-alias-border-l1, #444);
  background: var(--dsw-alias-bg-layer-2, #212124);
  color: var(--dsw-alias-label-primary, #f0f6fc);
}
body[data-ds-dark-theme] .dsh-github-search-input:focus {
  border-color: #58a6ff;
  box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.2);
}

/* 14. 工作区矩阵条目专属类 */
.dsh-github-workspace-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.dsh-github-ws-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #1f2328);
}
body[data-ds-dark-theme] .dsh-github-ws-title {
  color: var(--dsw-alias-label-primary, #f0f6fc);
}
.dsh-github-ws-path {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary, #656d76);
  font-family: var(--ds-font-family-code, monospace);
}
body[data-ds-dark-theme] .dsh-github-ws-path {
  color: var(--dsw-alias-label-tertiary, #888);
}
.dsh-github-ws-repo-link {
  color: var(--dsw-alias-link, #0969da);
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 500;
}
body[data-ds-dark-theme] .dsh-github-ws-repo-link {
  color: #58a6ff;
}
.dsh-github-repo-link {
  color: var(--dsw-alias-link, #0969da);
  text-decoration: none;
  font-weight: 600;
}
.dsh-github-repo-link:hover {
  text-decoration: underline;
}
body[data-ds-dark-theme] .dsh-github-repo-link {
  color: #58a6ff;
}
.dsh-github-subheading {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 10px 0;
  color: var(--dsw-alias-label-primary, #1f2328);
}
body[data-ds-dark-theme] .dsh-github-subheading {
  color: var(--dsw-alias-label-primary, #f0f6fc);
}

/* 15. 就绪引导横幅 (Setup Guide Banner) */
.dsh-github-guide-card {
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  border: 1px solid var(--dsw-alias-border-l2, #d0d7de);
  background: var(--dsw-alias-bg-layer-1, #f6f8fa);
}
.dsh-github-guide-card.warning {
  border-color: rgba(210, 153, 34, 0.4);
  background: rgba(210, 153, 34, 0.08);
}
.dsh-github-guide-card.danger {
  border-color: rgba(248, 81, 73, 0.4);
  background: rgba(248, 81, 73, 0.08);
}
.dsh-github-guide-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--dsw-alias-label-primary, #1f2328);
}
body[data-ds-dark-theme] .dsh-github-guide-header {
  color: var(--dsw-alias-label-primary, #f0f6fc);
}
.dsh-github-guide-desc {
  font-size: 13px;
  color: var(--dsw-alias-label-secondary, #656d76);
  line-height: 1.5;
  margin-bottom: 12px;
}
body[data-ds-dark-theme] .dsh-github-guide-desc {
  color: var(--dsw-alias-label-secondary, #8c8c8c);
}
.dsh-github-cmd-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--dsw-alias-bg-base, #ffffff);
  border: 1px solid var(--dsw-alias-border-l2, #d0d7de);
  border-radius: 6px;
  padding: 8px 12px;
  font-family: var(--ds-font-family-code, monospace);
  font-size: 13px;
  color: var(--dsw-alias-label-primary, #1f2328);
  margin-bottom: 12px;
}
body[data-ds-dark-theme] .dsh-github-cmd-box {
  background: var(--dsw-alias-bg-layer-2, #161b22);
  border-color: var(--dsw-alias-border-l1, #30363d);
  color: var(--dsw-alias-label-primary, #f0f6fc);
}
.dsh-github-copy-btn {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 4px;
  border: 1px solid var(--dsw-alias-border-l2, #d0d7de);
  background: var(--dsw-alias-bg-layer-1, #f6f8fa);
  color: var(--dsw-alias-label-primary, #1f2328);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}
body[data-ds-dark-theme] .dsh-github-copy-btn {
  background: var(--dsw-alias-bg-layer-2, #21262d);
  border-color: var(--dsw-alias-border-l1, #30363d);
  color: var(--dsw-alias-label-primary, #c9d1d9);
}
.dsh-github-copy-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover, #ebeef1);
}
body[data-ds-dark-theme] .dsh-github-copy-btn:hover {
  background: #30363d;
}
.dsh-github-copy-btn.copied {
  color: #2da44e !important;
  border-color: #2da44e !important;
  background: rgba(45, 164, 78, 0.15) !important;
}
.dsh-github-steps-list {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #656d76);
  line-height: 1.6;
  margin: 0 0 12px 18px;
  padding: 0;
}
body[data-ds-dark-theme] .dsh-github-steps-list {
  color: var(--dsw-alias-label-secondary, #8c8c8c);
}
.dsh-github-guide-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.dsh-github-guide-tip {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #8c8c8c);
  margin-top: 10px;
  line-height: 1.4;
}

/* 16. 设置弹窗 (Settings Modal)：左侧分区导航 + 右侧内容区 */
.dsh-github-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999;
  backdrop-filter: blur(2px);
}
.dsh-github-modal-dialog {
  width: 92%;
  max-width: 640px;
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base, #ffffff);
  border: 1px solid var(--dsw-alias-border-l2, #d0d7de);
  border-radius: 12px;
  box-shadow: 0 16px 32px rgba(0, 0, 0, 0.18);
  padding: 0;
  box-sizing: border-box;
  overflow: hidden;
  color: var(--dsw-alias-label-primary, #1f2328);
  font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
}
body[data-ds-dark-theme] .dsh-github-modal-dialog {
  background: var(--dsw-alias-bg-layer-2, #1e1e22);
  border-color: var(--dsw-alias-border-l1, #30363d);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.45);
}
/* 弹窗头部（标题 + 关闭） */
.dsh-github-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 22px 14px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, #d0d7de);
  flex-shrink: 0;
}
body[data-ds-dark-theme] .dsh-github-modal-header {
  border-bottom-color: var(--dsw-alias-border-l1, #30363d);
}
/* 分区导航 + 内容 双栏骨架：窄屏（<560px）自动折叠为顶部横向页签 */
.dsh-github-modal-body {
  display: flex;
  min-height: 0;
  flex: 1;
}
.dsh-github-settings-nav {
  flex-shrink: 0;
  width: 148px;
  padding: 14px 10px;
  border-right: 1px solid var(--dsw-alias-border-l2, #d0d7de);
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-sizing: border-box;
}
body[data-ds-dark-theme] .dsh-github-settings-nav {
  border-right-color: var(--dsw-alias-border-l1, #30363d);
}
.dsh-github-settings-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 13px;
  text-align: left;
  color: var(--dsw-alias-label-secondary, #656d76);
  transition: background 0.12s ease, color 0.12s ease;
}
.dsh-github-settings-nav-item:hover {
  background: var(--dsw-alias-bg-layer-1, #f6f8fa);
  color: var(--dsw-alias-label-primary, #1f2328);
}
.dsh-github-settings-nav-item.active {
  background: rgba(9, 105, 218, 0.1);
  color: var(--dsw-alias-link, #0969da);
  font-weight: 600;
}
body[data-ds-dark-theme] .dsh-github-settings-nav-item:hover {
  background: rgba(240, 246, 252, 0.06);
  color: var(--dsw-alias-label-primary, #f0f6fc);
}
body[data-ds-dark-theme] .dsh-github-settings-nav-item.active {
  background: rgba(88, 166, 255, 0.15);
  color: #58a6ff;
}
.dsh-github-settings-content {
  flex: 1;
  min-width: 0;
  padding: 18px 22px 20px;
  overflow-y: auto;
  box-sizing: border-box;
}
@media (max-width: 560px) {
  .dsh-github-modal-body {
    flex-direction: column;
  }
  .dsh-github-settings-nav {
    width: 100%;
    flex-direction: row;
    border-right: none;
    border-bottom: 1px solid var(--dsw-alias-border-l2, #d0d7e0);
    overflow-x: auto;
  }
  body[data-ds-dark-theme] .dsh-github-settings-nav {
    border-bottom-color: var(--dsw-alias-border-l1, #30363d);
  }
  .dsh-github-settings-nav-item {
    white-space: nowrap;
  }
}
/* 弹窗底部操作条 */
.dsh-github-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 22px;
  border-top: 1px solid var(--dsw-alias-border-l2, #d0d7de);
  flex-shrink: 0;
}
body[data-ds-dark-theme] .dsh-github-modal-footer {
  border-top-color: var(--dsw-alias-border-l1, #30363d);
}
.dsh-github-radio-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, #d0d7de);
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  background: var(--dsw-alias-bg-layer-1, #f6f8fa);
}
.dsh-github-radio-card:hover {
  border-color: var(--dsw-alias-link, #0969da);
}
.dsh-github-radio-card.active {
  border-color: var(--dsw-alias-link, #0969da);
  background: rgba(9, 105, 218, 0.08);
}
body[data-ds-dark-theme] .dsh-github-radio-card {
  background: var(--dsw-alias-bg-base, #161b22);
  border-color: var(--dsw-alias-border-l1, #30363d);
}
body[data-ds-dark-theme] .dsh-github-radio-card.active {
  border-color: #58a6ff;
  background: rgba(88, 166, 255, 0.12);
}

/* 下拉菜单及选项在深色/浅色模式下的精准适配 */
.dsh-github-select {
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2, #d0d7de);
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2328);
  font-size: 13px;
  outline: none;
  cursor: pointer;
  box-sizing: border-box;
  color-scheme: light;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.dsh-github-select:focus {
  border-color: var(--dsw-alias-link, #0969da);
  box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.15);
}
.dsh-github-select option {
  background-color: #ffffff;
  color: #1f2328;
  padding: 6px 10px;
}
body[data-ds-dark-theme] .dsh-github-select {
  border-color: var(--dsw-alias-border-l1, #30363d);
  background: var(--dsw-alias-bg-layer-2, #1e1e22);
  color: var(--dsw-alias-label-primary, #f0f6fc);
  color-scheme: dark;
}
body[data-ds-dark-theme] .dsh-github-select:focus {
  border-color: #58a6ff;
  box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.2);
}
body[data-ds-dark-theme] .dsh-github-select option {
  background-color: #1e1e22;
  color: #f0f6fc;
}

/* 代理设置弹窗的文本输入框（浅色/深色双模式，设计变量对齐 select 保持视觉一致） */
.dsh-github-input {
  padding: 7px 12px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2, #d0d7de);
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2328);
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
  color-scheme: light;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.dsh-github-input:focus {
  border-color: var(--dsw-alias-link, #0969da);
  box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.15);
}
.dsh-github-input::placeholder {
  color: var(--dsw-alias-label-tertiary, #8c959f);
}
body[data-ds-dark-theme] .dsh-github-input {
  border-color: var(--dsw-alias-border-l1, #30363d);
  background: var(--dsw-alias-bg-layer-2, #1e1e22);
  color: var(--dsw-alias-label-primary, #f0f6fc);
  color-scheme: dark;
}
body[data-ds-dark-theme] .dsh-github-input:focus {
  border-color: #58a6ff;
  box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.2);
}

/* 缓存信息展示框 */
.dsh-github-cache-info-box {
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1, #f6f8fa);
  border: 1px solid var(--dsw-alias-border-l2, #d0d7de);
  margin-bottom: 20px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #656d76);
  transition: all 0.15s ease;
}
body[data-ds-dark-theme] .dsh-github-cache-info-box {
  background: var(--dsw-alias-bg-base, #161b22);
  border-color: var(--dsw-alias-border-l1, #30363d);
  color: var(--dsw-alias-label-secondary, #8c8c8c);
}

/* 关于页求 Star 卡片：与 cache-info-box 同款双主题底色（浅色纸面/暗色深底） */
.dsh-github-about-star-box {
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, #f6f8fa);
  border: 1px solid var(--dsw-alias-border-l2, #d0d7de);
}
body[data-ds-dark-theme] .dsh-github-about-star-box {
  background: var(--dsw-alias-bg-base, #161b22);
  border-color: var(--dsw-alias-border-l1, #30363d);
}

/* 主操作按钮（链接色底）：链接色底 + 白字，暗色用亮蓝（对齐 radio/链接的暗色强调色 58a6ff） */
.dsh-github-primary-btn {
  padding: 5px 14px;
  font-weight: 600;
  white-space: nowrap;
  background: var(--dsw-alias-link, #0969da);
  border-color: var(--dsw-alias-link, #0969da);
  color: #ffffff;
}
.dsh-github-primary-btn:hover {
  background: var(--dsw-alias-link, #0969da);
  border-color: var(--dsw-alias-link, #0969da);
  color: #ffffff;
  opacity: 0.88;
}
body[data-ds-dark-theme] .dsh-github-primary-btn {
  background: #58a6ff;
  border-color: #58a6ff;
  color: #0d1117;
}
body[data-ds-dark-theme] .dsh-github-primary-btn:hover {
  background: #58a6ff;
  border-color: #58a6ff;
  color: #0d1117;
  opacity: 0.88;
}

/* 单选框点强调色 */
.dsh-github-radio {
  accent-color: var(--dsw-alias-link, #0969da);
  cursor: pointer;
  margin-top: 3px;
}
body[data-ds-dark-theme] .dsh-github-radio {
  accent-color: #58a6ff;
}

/* 17. 提交详情原生模态弹窗 (<dialog>) */
#dsh-github-commit-dialog {
  max-width: 600px;
  width: calc(100vw - 48px);
  border: 1px solid var(--dsw-alias-border-l2, #d0d7de);
  border-radius: 12px;
  padding: 0;
  box-sizing: border-box;
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2328);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.22);
  font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
}
#dsh-github-commit-dialog::backdrop {
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
}
body[data-ds-dark-theme] #dsh-github-commit-dialog {
  background: var(--dsw-alias-bg-layer-2, #1e1e22);
  border-color: var(--dsw-alias-border-l1, #30363d);
  color: var(--dsw-alias-label-primary, #ececec);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5);
}
.dsh-github-commit-row {
  transition: background 0.15s ease;
}
.dsh-github-commit-row:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
body[data-ds-dark-theme] .dsh-github-commit-row:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.08));
}
body[data-ds-dark-theme] .dsh-github-commit-pre {
  background: var(--dsw-alias-bg-base, #151517) !important;
  color: #ececec !important;
  border: 1px solid #30363d !important;
}
.dsh-github-dialog-close-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.08)) !important;
  opacity: 1 !important;
}
`;


    function injectStyles() {
      var styleId = "dsh-plugin-github-styles";
      var existing = document.getElementById(styleId);
      if (existing) {
        existing.textContent = GITHUB_PANEL_CSS;
        return () => {};
      }
      var style = document.createElement("style");
      style.id = styleId;
      style.textContent = GITHUB_PANEL_CSS;
      document.head.appendChild(style);
      return () => style.remove();
    }

    // 官方高清 Octocat SVG 矢量组件
    function renderOctocat(size = 18, color = "currentColor") {
      return React.createElement(
        "svg",
        {
          viewBox: "0 0 16 16",
          width: size,
          height: size,
          fill: color,
          style: { flexShrink: 0, display: "inline-block", verticalAlign: "middle" }
        },
        React.createElement("path", {
          fillRule: "evenodd",
          clipRule: "evenodd",
          d: "M8 0C3.58 0 0 3.58 0 8C0 11.54 2.29 14.53 5.47 15.59C5.87 15.66 6.02 15.42 6.02 15.21C6.02 15.02 6.01 14.39 6.01 13.72C4 14.09 3.48 13.23 3.32 12.78C3.23 12.55 2.84 11.84 2.5 11.65C2.22 11.5 1.82 11.13 2.49 11.12C3.12 11.11 3.57 11.7 3.72 11.94C4.44 13.15 5.59 12.81 6.05 12.6C6.12 12.08 6.33 11.72 6.56 11.52C4.78 11.32 2.92 10.63 2.92 7.58C2.92 6.71 3.23 5.99 3.74 5.43C3.66 5.23 3.38 4.41 3.82 3.31C3.82 3.31 4.49 3.1 6.02 4.13C6.66 3.95 7.34 3.86 8.02 3.86C8.7 3.86 9.38 3.95 10.02 4.13C11.55 3.09 12.22 3.31 12.22 3.31C12.66 4.41 12.38 5.23 12.3 5.43C12.81 5.99 13.12 6.7 13.12 7.58C13.12 10.65 11.25 11.32 9.47 11.52C9.76 11.77 10.01 12.25 10.01 13C10.01 14.08 10 14.95 10 15.21C10 15.42 10.15 15.67 10.55 15.59C13.71 14.53 16 11.53 16 8C16 3.58 12.42 0 8 0Z"
        })
      );
    }

    // Git 官方菱形分支矢量组件 (viewBox 0 0 1024 1024，经典 #1296db 配色)
    function renderGitIcon(size = 14, color = "#1296db") {
      return React.createElement(
        "svg",
        {
          viewBox: "0 0 1024 1024",
          width: size,
          height: size,
          style: { flexShrink: 0, display: "inline-block", verticalAlign: "middle" }
        },
        React.createElement("path", {
          fill: color,
          d: "M943.078 472.342L551.076 80.34c-21.859-21.859-57.626-21.859-79.485 0L79.589 472.342c-21.859 21.859-21.859 57.626 0 79.485l392.002 392.002c21.859 21.859 57.626 21.859 79.485 0l392.002-392.002c21.858-21.858 21.858-57.626 0-79.485z m-249.083 113.12c-37.939 0-68.693-30.755-68.693-68.693a68.532 68.532 0 0 1 4.136-23.521l-86.88-86.88v237.369c21.391 11.639 35.908 34.313 35.908 60.378 0 37.939-30.755 68.693-68.693 68.693s-68.693-30.755-68.693-68.693c0-27.314 15.944-50.903 39.03-61.973v-250.25c-23.022-10.642-39.03-33.879-39.03-60.907 0-7.808 1.401-15.272 3.853-22.243L344.061 207.871l44.159-44.159L490.738 266.23c5.58-1.503 11.418-2.378 17.473-2.378 37.076 0 67.132 30.056 67.132 67.132 0 6.055-0.875 11.893-2.378 17.473l102.241 102.241a68.68 68.68 0 0 1 18.789-2.623c37.939 0 68.693 30.755 68.693 68.693s-30.754 68.694-68.693 68.694z"
        })
      );
    }

    // 现代暗黑与浅色自适应科技风勋章图标
    function renderOctocatBadge(size = 32) {
      return React.createElement(
        "div",
        {
          className: "dsh-octocat-badge",
          style: {
            width: size + "px",
            height: size + "px",
            borderRadius: Math.round(size * 0.25) + "px",
          }
        },
        renderOctocat(Math.round(size * 0.58), "#ffffff")
      );
    }

    // 插件身份徽标（h 工厂注入）：标注界面由第三方插件 dsh-github-flow 提供。
    // 点击不直接跳仓库，而是派发全局事件打开「设置-关于」弹窗（仓库/协议/Star
    // 都在里面），由各宿主面板监听并挂载弹窗——避免从任意界面突兀跳浏览器。
    function renderPluginBadge(h: any) {
      return h("button", {
        className: "dsh-github-plugin-badge",
        type: "button",
        title: "本界面由第三方插件 dsh-github-flow 提供（非 DSH / GitHub 官方）。点击查看关于。",
        onClick: function (e: any) {
          e.stopPropagation();
          e.preventDefault();
          try {
            window.dispatchEvent(new CustomEvent("dsh-github-open-about"));
          } catch (err) { /* 事件派发失败不阻断点击语义 */ }
        },
      }, "插件");
    }

    // 认证与安装引导卡片组件（响应式自适应中央大面板与右侧栏）
    function AuthGuideCard(props: any) {
      var auth = props ? props.auth : null;
      var onRefresh = props ? props.onRefresh : () => {};
      var isRightbar = Boolean(props && props.isRightbar);

      var [copied, setCopied] = React.useState(false);
      var [launching, setLaunching] = React.useState(false);
      var [toastMsg, setToastMsg] = React.useState(null as string | null);

      var isNetwork = Boolean(auth?.networkError);
      var notInstalled = !isNetwork && Boolean(auth && auth.installed === false);
      var notLoggedIn = !isNetwork && !notInstalled && Boolean(!auth?.loggedIn);

      var guide = auth?.installGuide;
      var defaultCmd = isNetwork
        ? "gh auth status"
        : notInstalled
          ? (guide?.command || "winget install --id GitHub.cli")
          : "gh auth login";

      var copyCmd = (cmd: string) => {
        try {
          if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(cmd);
          } else {
            var input = document.createElement("textarea");
            input.value = cmd;
            document.body.appendChild(input);
            input.select();
            document.execCommand("copy");
            document.body.removeChild(input);
          }
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch (e) {
          console.warn("复制失败:", e);
        }
      };

      var launchTerminal = async (cmd: string) => {
        setLaunching(true);
        setToastMsg(null);
        try {
          var res = await fetch("/api/github/action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "open_terminal", command: cmd })
          });
          var json = await res.json();
          if (json.ok) {
            // 措辞留余地：start 的成败偶受系统会话策略影响，未弹出时用户仍有手动出路
            setToastMsg("已唤起系统终端，请在弹出窗口中完成操作；若未弹出，可手动打开终端执行上方命令");
            setTimeout(() => setToastMsg(null), 6000);
          } else {
            // 失败如实展示：后端带回真实原因（如未找到终端/命令失败），并给出手动命令
            setToastMsg("❌ " + (json.message || "唤起失败，请手动打开终端执行上方命令"));
          }
        } catch (e) {
          setToastMsg("无法连接后台服务，请手动打开终端执行上方命令");
        } finally {
          setLaunching(false);
        }
      };

      var openDownload = async () => {
        var url = guide?.downloadUrl || "https://cli.github.com/";
        try {
          await fetch("/api/github/action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "open_browser", url })
          });
        } catch (e) {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      };

      var openProxySettings = () => {
        try {
          window.dispatchEvent(new CustomEvent("dsh-github-open-proxy"));
        } catch (e) {}
      };

      var h = React.createElement;

      return h(
        "div",
        {
          className: "dsh-github-guide-card " + (isNetwork ? "warning" : notInstalled ? "danger" : "warning"),
          style: isRightbar ? { padding: "12px", marginBottom: "12px" } : undefined
        },
        // 头部
        h(
          "div",
          { className: "dsh-github-guide-header" },
          isNetwork
            ? "🌐 无法连接 GitHub 服务器"
            : notInstalled
              ? "⚠️ 未检测到 GitHub CLI (gh)"
              : "🔑 GitHub 账号尚未登录",
          h(
            "span",
            { className: "dsh-github-badge " + (isNetwork ? "dsh-badge-yellow" : notInstalled ? "dsh-badge-red" : "dsh-badge-yellow") },
            isNetwork ? "网络受限" : notInstalled ? "未安装" : "未认证"
          )
        ),
        // 描述
        h(
          "div",
          { className: "dsh-github-guide-desc" },
          isNetwork
            ? (auth?.networkErrorReason || "检测到本机已安装 GitHub CLI，但当前无法连接至 api.github.com（网络超时、DNS 无法解析或被系统代理阻断）。")
            : notInstalled
              ? (guide?.description || "DSH GitHub Flow 插件依赖官方 GitHub CLI 工具与云端进行安全交互，当前系统 PATH 中未检测到该工具。")
              : "检测到本机已安装 GitHub CLI，请完成账号授权以解锁仓库管理、PR 审查和 Issues 待办。"
        ),
        // 命令代码展示框
        h(
          "div",
          { className: "dsh-github-cmd-box" },
          h("code", null, defaultCmd),
          h(
            "button",
            {
              className: "dsh-github-copy-btn " + (copied ? "copied" : ""),
              onClick: () => copyCmd(defaultCmd),
              title: "复制命令到剪贴板"
            },
            copied ? "✓ 已复制" : "📋 复制命令"
          )
        ),
        // 步骤提示
        !notInstalled && !isRightbar
          ? (isNetwork
              ? h(
                  "ol",
                  { className: "dsh-github-steps-list" },
                  h("li", null, "检查系统本地网络连接或 DNS 解析，确认能正常访问 github.com；"),
                  h("li", null, "若使用了网络代理工具，可在下方点击「配置网络代理」填写 HTTP 或 SOCKS5 代理；"),
                  h("li", null, "配置或恢复网络后，切回本面板或点击「重试连接」即可自动同步数据。")
                )
              : h(
                  "ol",
                  { className: "dsh-github-steps-list" },
                  h("li", null, "打开系统终端（PowerShell / CMD / Terminal），运行上述命令；"),
                  h("li", null, "按提示依次选择「GitHub.com」➜「HTTPS」➜「Login with a web browser」；"),
                  h("li", null, "按回车打开浏览器确认授权后，切回本页面即可自动恢复。")
                ))
          : null,
        // 操作按钮区域
        h(
          "div",
          { className: "dsh-github-guide-actions" },
          isNetwork
            ? h(
                "button",
                {
                  className: "dsh-github-action-btn",
                  onClick: onRefresh,
                  title: "重新发起网络连接校验"
                },
                "🔄 重试网络连接"
              )
            : null,
          isNetwork
            ? h(
                "button",
                {
                  className: "dsh-github-action-btn",
                  onClick: openProxySettings,
                  title: "打开网络代理设置，配置 HTTP/SOCKS5 代理服务器"
                },
                "⚙️ 配置网络代理"
              )
            : null,
          h(
            "button",
            {
              className: "dsh-github-action-btn",
              onClick: () => launchTerminal(defaultCmd),
              disabled: launching,
              title: "自动唤起系统终端并执行该命令"
            },
            launching ? "正在唤起..." : (isNetwork ? "💻 终端排查状态" : notInstalled ? "💻 唤起终端安装" : "💻 唤起终端登录")
          ),
          notInstalled
            ? h(
                "button",
                {
                  className: "dsh-github-action-btn",
                  onClick: openDownload,
                  title: "打开 GitHub CLI 官方下载主页获取安装包"
                },
                "🌐 官网安装包 (.msi/.pkg)"
              )
            : null,
          !isNetwork
            ? h(
                "button",
                {
                  className: "dsh-github-action-btn",
                  onClick: function () {
                    setToastMsg("正在快速检测登录状态...");
                    // 探测超时保护：后端 auth 探针本身 10s 超时，前端同样 10s 兜底——
                    // 无超时时挂起会让 toast 永远停在\"正在检测\"且自愈刷新不触发
                    var probeController = new AbortController();
                    var probeTimer = setTimeout(function () { probeController.abort(); }, 10000);
                    fetch("/api/github/auth?force=true", { signal: probeController.signal })
                      .then(function (res) { return res.json(); })
                      .then(function (json) {
                        clearTimeout(probeTimer);
                        if (json && json.ok && json.auth && json.auth.loggedIn) {
                          setToastMsg("✅ 已识别到 GitHub CLI 登录态，正在拉取数据...");
                          clearStoredGlobalOverview();
                          onRefresh();
                        } else {
                          setToastMsg("⚠️ 暂未检测到登录凭据，请在终端执行 gh auth login 完成授权");
                          onRefresh();
                        }
                      })
                      .catch(function () {
                        clearTimeout(probeTimer);
                        setToastMsg("❌ 检测超时或后端不可达，请稍后重试");
                        onRefresh();
                      });
                  },
                  title: "重新检测登录与安装状态"
                },
                "🔄 刷新状态"
              )
            : null
        ),
        toastMsg
          ? h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-link, #0969da)", marginTop: "8px" } }, `ℹ️ ${toastMsg}`)
          : null,
        h(
          "div",
          { className: "dsh-github-guide-tip" },
          notInstalled
            ? "💡 提示：使用包管理器安装完成后，若未立即识别，可重启 DeepSeek Harness 应用刷新系统环境变量 PATH。"
            : "💡 提示：凭证由官方 GitHub CLI 加密保存在操作系统安全凭据库中，授权完毕切回本窗口将自动识别刷新。"
        )
      );
    }

    // 通用升级通知与一键升级卡片组件（自适应右侧栏紧凑模式与全景大面板模式）
    function UpgradeNotificationCard(props: { updateInfo: any; isRightbar?: boolean }) {
      var updateInfo = props.updateInfo;
      var isRightbar = Boolean(props.isRightbar);
      if (!updateInfo || !updateInfo.hasUpdate) return null;

      var storageKey = "dsh_dismissed_update_" + (updateInfo.latestVersion || "latest");
      var [dismissed, setDismissed] = React.useState(function () {
        try {
          return localStorage.getItem(storageKey) === "true";
        } catch (e) {
          return false;
        }
      });
      var [status, setStatus] = React.useState("idle"); // 'idle' | 'upgrading' | 'success' | 'failed'
      var [msg, setMsg] = React.useState("");

      // 窗口切回或切 Tab 重挂载时，主动对齐后端实际的升级状态，防止状态丢失
      React.useEffect(function () {
        fetch("/api/github/upgrade-status")
          .then(function (res) { return res.json(); })
          .then(function (json) {
            if (json && json.ok && json.data) {
              if (json.data.state === "upgrading") {
                setStatus("upgrading");
                setMsg("正在拉取最新版本（约需 5~15 秒）...");
              } else if (json.data.state === "success") {
                setStatus("success");
                setMsg(json.data.message || "升级成功！已安装最新依赖。");
              }
            }
          })
          .catch(function () {});
      }, []);

      if (dismissed) return null;

      var handleUpgrade = async function () {
        if (status === "upgrading") return;
        setStatus("upgrading");
        setMsg("正在拉取最新版本（约需 5~15 秒）...");

        try {
          var res = await fetch("/api/github/upgrade", { method: "POST" });
          var json = await res.json().catch(function () { return {}; });
          if (res.ok && json.ok) {
            setStatus("success");
            setMsg(json.message || "升级成功！已安装最新依赖。");
          } else {
            setStatus("failed");
            // 失败原因透传：后端 log 的末尾几行含真实报错（如 'dsh' 不是内部命令），
            // 只给「退出码异常」这类笼统话术用户无从下手
            var logTail = "";
            if (json.log && typeof json.log === "string") {
              var lines = json.log.trim().split("\n").filter(function (l: string) { return l.trim(); });
              if (lines.length > 0) {
                logTail = "\n\n📝 日志末尾: " + lines.slice(-4).join(" ⏎ ").slice(0, 400);
              }
            }
            setMsg((json.message || "升级命令执行失败，请在宿主终端手动执行。") + logTail);
          }
        } catch (err: any) {
          setStatus("failed");
          setMsg("无法连接后端执行升级: " + (err.message || err));
        }
      };

      var handleDismiss = function () {
        try {
          localStorage.setItem(storageKey, "true");
        } catch (e) {}
        setDismissed(true);
      };

      var handleCopy = function () {
        // 兜底命令也必须带 --profile（官方 CLI 必填）——正常路径 upgradeCommand
        // 由后端按真实 profile 生成，此默认值仅在后端数据缺失时兜底
        var cmd = updateInfo.upgradeCommand || "dsh plugin --profile desktop add dsh-github-flow@latest";
        if (navigator.clipboard) {
          navigator.clipboard.writeText(cmd);
          alert("已复制升级命令到剪贴板：\n" + cmd);
        } else {
          prompt("请复制升级命令：", cmd);
        }
      };

      var handleReload = function () {
        window.location.reload();
      };

      var h = React.createElement;

      // 1. 右侧栏紧凑型模式
      if (isRightbar) {
        return h(
          "div",
          {
            className: "dsh-github-upgrade-strip",
            style: {
              padding: "10px 12px",
              marginBottom: "12px",
              borderRadius: "8px",
              background: status === "success"
                ? "var(--dsw-alias-state-success-subtle, rgba(46, 160, 67, 0.12))"
                : "var(--dsw-alias-bg-module-platform, rgba(9, 105, 218, 0.08))",
              border: "1px solid " + (status === "success"
                ? "var(--dsw-alias-state-success-border, rgba(46, 160, 67, 0.35))"
                : "var(--dsw-alias-border-l2, rgba(9, 105, 218, 0.25))"),
              fontSize: "12px",
            },
          },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" } },
            h(
              "span",
              { style: { fontWeight: 600, color: "var(--dsw-alias-label-primary, #1f2328)" } },
              status === "success" ? "🎉 升级完成" : "🚀 发现新版 v" + updateInfo.latestVersion
            ),
            h(
              "button",
              {
                onClick: handleDismiss,
                title: "不再提醒此版本",
                style: { background: "none", border: "none", cursor: "pointer", color: "var(--dsw-alias-label-tertiary, #8c8c8c)", fontSize: "14px", padding: 0 },
              },
              "✕"
            )
          ),
          h(
            "div",
            { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #656d76)", marginBottom: "8px", lineHeight: "1.4" } },
            msg || (status === "success"
              ? "需重启 DSH 服务彻底生效后端工具，或刷新网页预览新界面。"
              : "当前: v" + updateInfo.currentVersion + "，推荐升级以获取最新功能。")
          ),
          h(
            "div",
            { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
            status === "success"
              ? h(
                  "button",
                  {
                    className: "dsh-github-btn-sm",
                    onClick: handleReload,
                    style: { flex: 1, justifyContent: "center", background: "#2ea043", color: "#fff", borderColor: "#2ea043" },
                  },
                  "🔄 刷新页面"
                )
              : h(
                  "button",
                  {
                    className: "dsh-github-btn-sm",
                    disabled: status === "upgrading",
                    onClick: handleUpgrade,
                    style: {
                      flex: 1,
                      justifyContent: "center",
                      background: "var(--dsw-alias-link, #0969da)",
                      color: "#fff",
                      borderColor: "var(--dsw-alias-link, #0969da)",
                      opacity: status === "upgrading" ? 0.7 : 1,
                    },
                  },
                  status === "upgrading" ? "升级中..." : "⚡ 一键升级"
                ),
            h(
              "button",
              {
                className: "dsh-github-btn-sm",
                onClick: handleCopy,
                style: {
                  fontSize: "11px",
                  padding: "4px 8px",
                  // 失败态高亮：与驾驶舱横幅同一引导逻辑（失败文案指向复制动作）
                  ...(status === "failed" ? {
                    background: "var(--dsw-alias-link, #0969da)",
                    color: "#ffffff",
                    borderColor: "var(--dsw-alias-link, #0969da)",
                    fontWeight: 600,
                  } : {}),
                },
              },
              "📋 复制命令"
            )
          )
        );
      }

      // 2. 全景驾驶舱大面板横幅模式
      return h(
        "div",
        {
          className: "dsh-github-upgrade-banner",
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 18px",
            marginBottom: "16px",
            borderRadius: "8px",
            background: status === "success"
              ? "linear-gradient(90deg, rgba(46, 160, 67, 0.15) 0%, rgba(9, 105, 218, 0.12) 100%)"
              : "linear-gradient(90deg, rgba(9, 105, 218, 0.12) 0%, rgba(137, 87, 229, 0.12) 100%)",
            border: "1px solid " + (status === "success" ? "rgba(46, 160, 67, 0.35)" : "rgba(9, 105, 218, 0.3)"),
            fontSize: "13px",
          },
        },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "10px" } },
          h("span", { style: { fontSize: "20px" } }, status === "success" ? "🎉" : "🚀"),
          h(
            "div",
            null,
            h(
              "div",
              { style: { fontWeight: 600, color: "var(--dsw-alias-label-primary, #1f2328)" } },
              status === "success"
                ? "升级完成！新版本 v" + updateInfo.latestVersion + " 已写入"
                : "发现 dsh-github-flow 新版本 v" + updateInfo.latestVersion + "（当前版本: v" + updateInfo.currentVersion + "）"
            ),
            h(
              "div",
              { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } },
              msg || (status === "success"
                ? "💡 提示：DSH 后端驻留了旧版内存，需重启 DSH 服务彻底生效后端工具；若仅预览界面改动可先刷新网页。"
                : "包含最新 GitHub 工具特性与性能优化，点击右侧可一键自动升级。")
            )
          )
        ),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 } },
          status === "success"
            ? h(
                "button",
                {
                  className: "dsh-github-btn-sm",
                  onClick: handleReload,
                  style: { background: "#2ea043", color: "#fff", borderColor: "#2ea043", padding: "6px 14px", fontWeight: 600 },
                },
                "🔄 立即刷新页面"
              )
            : h(
                "button",
                {
                  className: "dsh-github-btn-sm",
                  disabled: status === "upgrading",
                  onClick: handleUpgrade,
                  style: {
                    background: "var(--dsw-alias-link, #0969da)",
                    color: "#fff",
                    borderColor: "var(--dsw-alias-link, #0969da)",
                    padding: "6px 14px",
                    fontWeight: 600,
                    opacity: status === "upgrading" ? 0.7 : 1,
                  },
                },
                status === "upgrading" ? "正在自动升级中..." : "⚡ 一键自动升级"
              ),
          h(
            "button",
            {
              className: "dsh-github-btn-sm",
              onClick: handleCopy,
              style: {
                padding: "6px 12px",
                // 失败态高亮复制按钮：失败文案引导的动作就是它，视觉权重同步提升
                ...(status === "failed" ? {
                  background: "var(--dsw-alias-link, #0969da)",
                  color: "#ffffff",
                  borderColor: "var(--dsw-alias-link, #0969da)",
                  fontWeight: 600,
                } : {}),
              },
            },
            status === "failed" ? "📋 复制命令手动升级" : "📋 复制命令"
          ),
          h(
            "button",
            {
              onClick: handleDismiss,
              title: "不再提醒此版本",
              style: { background: "none", border: "none", cursor: "pointer", color: "var(--dsw-alias-label-tertiary, #8c8c8c)", fontSize: "16px", padding: "0 4px" },
            },
            "✕"
          )
        )
      );
    }

    /**
     * 网络连接异常与离线状态醒目横幅组件
     * 严防静默欺骗：当刷新失败、超时或断网时，直接在核心视觉区置顶展示警告，
     * 明确告知用户正在查看历史离线快照，绝不伪装成最新状态，并提供重试与代理配置。
     */
    function NetworkAlertBanner(props: {
      isRightbar?: boolean;
      networkErrorReason?: string | null;
      lastSyncedAt?: number;
      onRefresh?: () => void;
      onOpenProxy?: () => void;
    }) {
      var isRightbar = Boolean(props.isRightbar);
      var reason = props.networkErrorReason || "无法连接至 GitHub API 服务器（网络超时或被防火墙/代理阻断），本次未能获取最新数据。";
      var lastSyncedAt = props.lastSyncedAt || 0;
      var onRefresh = props.onRefresh || (() => {});
      var onOpenProxy = props.onOpenProxy || (() => {
        try { window.dispatchEvent(new CustomEvent("dsh-github-open-proxy")); } catch (e) {}
      });

      var formatTime = function (ts: number) {
        if (!ts) return "未知时间";
        var diff = Date.now() - ts;
        var MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
        if (diff < MIN) return "刚刚";
        if (diff < HOUR) return Math.floor(diff / MIN) + " 分钟前";
        if (diff < DAY) return Math.floor(diff / HOUR) + " 小时前";
        return new Date(ts).toLocaleDateString();
      };

      var h = React.createElement;

      return h(
        "div",
        {
          className: "dsh-github-network-alert",
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            padding: isRightbar ? "10px 12px" : "12px 16px",
            marginBottom: "12px",
            borderRadius: "8px",
            background: "rgba(240, 136, 62, 0.12)",
            border: "1px solid rgba(240, 136, 62, 0.4)",
            fontSize: "12px",
            color: "var(--dsw-alias-label-primary, #1f2328)",
          },
        },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px" } },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "6px", fontWeight: 600, color: "var(--dsw-alias-state-attention-primary, #9a6700)" } },
            h("span", null, "⚠️"),
            h("span", null, "网络连接失败，当前展示离线历史数据")
          ),
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 } },
            h(
              "button",
              {
                className: "dsh-github-btn-sm",
                onClick: onRefresh,
                title: "重新发起网络连接刷新",
                style: { padding: "3px 8px", fontSize: "11px", cursor: "pointer" },
              },
              "🔄 重试刷新"
            ),
            h(
              "button",
              {
                className: "dsh-github-btn-sm",
                onClick: onOpenProxy,
                title: "打开网络代理设置配置 HTTP/SOCKS5 代理",
                style: { padding: "3px 8px", fontSize: "11px", cursor: "pointer" },
              },
              "⚙️ 配置代理"
            )
          )
        ),
        h(
          "div",
          { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #656d76)", lineHeight: 1.4 } },
          reason + (lastSyncedAt ? `（当前数据快照同步于 ${formatTime(lastSyncedAt)}）` : "")
        )
      );
    }

    // 数据新鲜度与同步状态微标组件 (自适应全景大面板与右侧栏紧凑模式)
    function SyncStatusBadge(props: { syncStatus: string; lastSyncedAt: number; isRightbar?: boolean }) {
      var syncStatus = props.syncStatus;
      var lastSyncedAt = props.lastSyncedAt;
      var isRightbar = Boolean(props.isRightbar);
      var text = "";
      var bg = "rgba(101, 109, 118, 0.1)";
      var color = "var(--dsw-alias-label-secondary, #656d76)";

      var formatTimeAgo = function (ts: number) {
        if (!ts) return "刚刚";
        var diffSec = Math.floor((Date.now() - ts) / 1000);
        if (diffSec < 60) return "刚刚";
        var diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return diffMin + "分钟前";
        var diffHour = Math.floor(diffMin / 60);
        if (diffHour < 24) return diffHour + "小时前";
        var diffDay = Math.floor(diffHour / 24);
        return diffDay + "天前";
      };

      if (syncStatus === "syncing") {
        text = isRightbar ? "⏳ 同步中..." : "⏳ 后台同步中...";
        bg = "rgba(9, 105, 218, 0.12)";
        color = "var(--dsw-alias-link, #0969da)";
      } else if (syncStatus === "fresh") {
        var timeStr = lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : "";
        text = "✅ " + (isRightbar ? "最新" : "已是最新") + (timeStr ? " (" + timeStr + ")" : "");
        bg = "rgba(46, 160, 67, 0.12)";
        color = "var(--dsw-alias-state-success, #2ea043)";
      } else if (syncStatus === "cached") {
        text = "📦 本地快照 (" + formatTimeAgo(lastSyncedAt) + ")";
        bg = "rgba(101, 109, 118, 0.12)";
        color = "var(--dsw-alias-label-secondary, #656d76)";
      } else if (syncStatus === "failed") {
        text = isRightbar ? "❌ 刷新失败 (离线)" : "❌ 网络断开 (展示离线数据)";
        bg = "rgba(207, 34, 46, 0.12)";
        color = "var(--dsw-alias-state-error-primary, #cf222e)";
      }

      if (!text) return null;

      return React.createElement(
        "span",
        {
          className: "dsh-github-sync-badge",
          style: {
            fontSize: isRightbar ? "10px" : "11px",
            padding: isRightbar ? "2px 6px" : "3px 8px",
            borderRadius: "12px",
            background: bg,
            color: color,
            marginLeft: isRightbar ? "6px" : "10px",
            fontWeight: 500,
            display: "inline-flex",
            alignItems: "center",
            whiteSpace: "nowrap",
          },
        },
        text
      );
    }

    // 渲染 GitHub 仓库信息与操作视图的核心函数
    function renderGithubRepoView(
      h: any,
      data: any,
      loading: boolean,
      error: string | null,
      onRefresh: () => void,
      isRightbar: boolean = false,
      updateInfo: any = null,
      syncStatus: string = "",
      lastSyncedAt: number = 0,
      onOpenSettings: (() => void) | null = null,
      cwd: string | null = null,
      onSelectCommit: ((c: any) => void) | null = null,
      gitLogPagination: any = null
    ) {
      var auth = data ? data.auth : null;
      var repo = data ? data.repo : null;
      var prs = (data && data.pullRequests) || [];
      var issues = (data && data.issues) || [];
      var runs = (data && data.runs) || [];

      var effectiveUpdateInfo = updateInfo || data?.updateInfo;
      var upgradeBannerEl = effectiveUpdateInfo && effectiveUpdateInfo.hasUpdate
        ? h(UpgradeNotificationCard, { updateInfo: effectiveUpdateInfo, isRightbar })
        : null;

      // 核心防欺骗告警：若当前处于网络失败态（syncStatus === 'failed' 或 auth?.networkError 或明确的 error），
      // 绝不静默展示旧数据！直接在正中央高亮告警横幅，标明「离线历史快照」，并提供重试与代理设置！
      var networkAlertBannerEl = (syncStatus === "failed" || auth?.networkError || (error && data))
        ? h(NetworkAlertBanner, {
            isRightbar,
            networkErrorReason: auth?.networkErrorReason || error || "连接 GitHub API 超时或网络不可达，本次未能获取最新数据。",
            lastSyncedAt,
            onRefresh,
            onOpenProxy: function () {
              try { window.dispatchEvent(new CustomEvent("dsh-github-open-proxy")); } catch (e) {}
            },
          })
        : null;

      var headerEl = h(
        "div",
        { className: "dsh-github-header" },
        h(
          "div",
          { className: "dsh-github-title" },
          renderOctocatBadge(isRightbar ? 26 : 30),
          h("h2", null, isRightbar ? "GitHub 仓库" : "GitHub 工作台"),
          renderPluginBadge(h),
          syncStatus ? h(SyncStatusBadge, { syncStatus, lastSyncedAt, isRightbar }) : null
        ),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "6px" } },
          h(
            "button",
            {
              className: "dsh-github-refresh-btn",
              onClick: onRefresh,
              disabled: loading,
            },
            loading ? "刷新中..." : "🔄 刷新"
          ),
          // 设置按钮：与全景主页复用同一设置弹窗（传入回调时渲染——目前仅右侧栏）。
          // 右侧栏此前没有设置入口，用户必须切到主页才能改同步/代理/更新设置。
          onOpenSettings ? h(
            "button",
            {
              className: "dsh-github-btn-sm",
              onClick: onOpenSettings,
              title: "配置数据同步节奏、本地缓存、网络代理与插件信息",
              style: { padding: "4px 10px" },
            },
            "⚙️"
          ) : null
        )
      );

      // 仓库基础卡片（Tab 化后回归纯身份信息——git/PR/Release 细节移入「Git 记录」Tab 页）
      var gitSt = data && data.gitStatus;
      var relInfo = data && data.releaseInfo;
      var branchPr = data && data.branchPr;
      var repoCardEl = h(
        "div",
        { className: "dsh-github-card" },
        h("div", { className: "dsh-github-card-title" }, "当前工作区 GitHub 仓库"),
        h(
          "div",
          { className: "dsh-github-card-value" },
          repo
            ? h("a", { href: repo.url, target: "_blank", className: "dsh-github-repo-link" }, repo.nameWithOwner)
            : h("span", { style: { color: "var(--dsw-alias-state-error-primary, #cf222e)" } }, "未检测到关联的 GitHub 仓库"),
          repo ? h("span", { className: "dsh-github-badge dsh-badge-green" }, repo.defaultBranch) : null
        ),
        repo && repo.description
          ? h("div", { className: "dsh-github-card-desc" }, repo.description)
          : null,
        auth && auth.loggedIn
          ? h("div", { className: "dsh-github-card-subtext" }, `CLI 认证账号: ${auth.user} (${auth.scopes?.join(", ") || "已登录"})`)
          : null,
        !repo
          ? h("div", { className: "dsh-github-card-subtext" }, "若本地已有 git 仓库，请运行 `git remote add github <url>` 或 `git remote add origin <url>` 关联远程仓库。")
          : null
      );

      // ============ 「Git 记录」Tab 页：提交记录 + 本地↔远程差异 ============
      // 用户核心诉求：具体的提交内容（谁/何时/什么信息）+ 远程与本地的区别。
      // 三段视图：待推送（本地领先）/ 待拉取（远程领先，快照口径）/ 最近提交；
      // 分支同步摘要行保留为上下文锚点。
      var commitLog = data && data.commitLog;
      var renderCommitRow = function (c: any, tone: string) {
        return h(
          "div",
          {
            style: { display: "flex", alignItems: "baseline", gap: "8px", padding: "3px 6px", fontSize: "12px", cursor: "pointer", borderRadius: "4px" },
            className: "dsh-github-commit-row",
            // 行级悬浮：完整 subject + 作者 + 时间 + 点击提示
            title: `${c.subject}\n— ${c.author} · ${c.relative} · ${c.sha}\n（点击查看提交详情）`,
            onClick: function () {
              if (typeof onSelectCommit === "function") {
                onSelectCommit(c);
              }
            },
          },
          h("span", {
            style: {
              fontFamily: "monospace",
              fontSize: "11px",
              color: tone === "ahead" ? "var(--dsw-alias-state-success-primary, #1a7f37)"
                : tone === "behind" ? "var(--dsw-alias-state-attention-primary, #9a6700)"
                : "var(--dsw-alias-label-secondary, #656d76)",
              flexShrink: 0,
            },
          }, c.sha),
          // subject 单行截断：溢出省略号，全文走悬浮与点击弹窗
          h("span", {
            style: {
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            },
          }, c.subject),
          h("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #656d76)", whiteSpace: "nowrap", flexShrink: 0 } }, `${c.author} · ${c.relative}`)
        );
      };
      var gitSectionEl = h(
        "div",
        { className: "dsh-github-section" },
        // section header + Release 右上角小徽章（flex 两端对齐；hover title 显详情，
        // 点击直达 Release 页——从尾部大块降为角落锚点，节省一整行卡片空间）
        h(
          "div",
          { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" } },
          h("h3", { style: { margin: 0, display: "flex", alignItems: "center", gap: "6px" } }, renderGitIcon(16, "#1296db"), "Git 记录"),
          relInfo
            ? h(
                relInfo.url ? "a" : "span",
                {
                  ...(relInfo.url ? { href: relInfo.url, target: "_blank" } : {}),
                  className: "dsh-github-badge" + (relInfo.isPrerelease ? " dsh-badge-purple" : " dsh-badge-green"),
                  style: { fontSize: "10px", textDecoration: "none", flexShrink: 0 },
                  title: `最新 Release: ${relInfo.tagName}${relInfo.isPrerelease ? "（预发布）" : ""}${formatRelativeTime(relInfo.publishedAt) ? ` · ${formatRelativeTime(relInfo.publishedAt)}发布` : ""}\n点击打开 Release 页`,
                },
                `🏷️ ${relInfo.tagName}`
              )
            : null
        ),
        // 分支同步摘要（上下文锚点，含快照语义提示）
        gitSt
          ? h(
              "div",
              {
                style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", fontSize: "13px", marginBottom: "8px" },
                title: "ahead/behind 相对上次 git fetch 的快照（非实时）",
              },
              h("span", { style: { fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "5px" } }, renderGitIcon(13, "#1296db"), gitSt.branch),
              gitSt.hasUpstream
                ? h("span", null, `${gitSt.ahead > 0 ? "↑" + gitSt.ahead + " " : ""}${gitSt.behind > 0 ? "↓" + gitSt.behind : ""}${gitSt.ahead === 0 && gitSt.behind === 0 ? "✓ 与远程同步" : ""}`)
                : h("span", { style: { opacity: 0.7 } }, "↑? ↓?（无 upstream）"),
              gitSt.dirtyCount > 0
                ? h("span", null, `· ${gitSt.dirtyCount} 文件未提交`)
                : h("span", null, "· 工作区干净")
            )
          : null,
        // 段 1：本地领先远程（待推送的具体提交）
        commitLog && commitLog.aheadCommits && commitLog.aheadCommits.length > 0
          ? h(
              "div",
              { style: { marginBottom: "10px" } },
              h("div", { style: { fontSize: "12px", fontWeight: 600, marginBottom: "4px", color: "var(--dsw-alias-state-success-primary, #1a7f37)" } }, `↑ 本地领先远程 ${commitLog.aheadCommits.length} 个提交（待 push）`),
              commitLog.aheadCommits.map(function (c: any, i: number) { return h("div", { key: "a" + i }, renderCommitRow(c, "ahead")); })
            )
          : null,
        // 段 2：远程领先本地（待拉取的具体提交——上次 fetch 快照口径）
        commitLog && commitLog.behindCommits && commitLog.behindCommits.length > 0
          ? h(
              "div",
              { style: { marginBottom: "10px" } },
              h("div", { style: { fontSize: "12px", fontWeight: 600, marginBottom: "4px", color: "var(--dsw-alias-state-attention-primary, #9a6700)" } }, `↓ 远程领先本地 ${commitLog.behindCommits.length} 个提交（待 pull · 快照口径）`),
              commitLog.behindCommits.map(function (c: any, i: number) { return h("div", { key: "b" + i }, renderCommitRow(c, "behind")); })
            )
          : null,
        // 段 3：最近提交（常态锚定——即使完全同步也有内容可看；支持分页加载更多）
        (() => {
          var baseRecent = (commitLog && commitLog.recent) || [];
          var extraRecent = (gitLogPagination && gitLogPagination.extraCommits) || [];
          var allRecentCommits = baseRecent.concat(extraRecent);
          var totalCommits = commitLog && commitLog.totalCount;
          var loadingMore = Boolean(gitLogPagination && gitLogPagination.loadingMore);
          var hasMore = Boolean(gitLogPagination && gitLogPagination.hasMore);
          var onLoadMore = gitLogPagination ? gitLogPagination.onLoadMore : null;

          if (allRecentCommits.length === 0) return null;
          return h(
            "div",
            null,
            h(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" } },
              h("div", { style: { fontSize: "12px", fontWeight: 600, opacity: 0.85 } }, "🕘 最近提交"),
              totalCommits
                ? h("div", { style: { fontSize: "11px", opacity: 0.6 } }, `${allRecentCommits.length} / ${totalCommits}`)
                : null
            ),
            allRecentCommits.map(function (c: any, i: number) { return h("div", { key: "r" + (c.sha || i) }, renderCommitRow(c, "recent")); }),
            // 下滑或点击加载更多
            h(
              "div",
              { style: { marginTop: "10px", textAlign: "center" } },
              loadingMore
                ? h("div", { style: { fontSize: "11px", opacity: 0.75, padding: "6px 0" } }, "⏳ 正在加载更多提交…")
                : (hasMore && onLoadMore)
                ? h(
                    "button",
                    {
                      className: "dsh-github-btn-sm",
                      style: {
                        cursor: "pointer",
                        padding: "4px 14px",
                        borderRadius: "14px",
                        border: "1px solid var(--dsw-alias-border-l2, #d0d7de)",
                        background: "var(--dsw-alias-bg-module-platform, #f6f8fa)",
                        color: "inherit",
                        fontSize: "11px",
                        lineHeight: "1.6",
                      },
                      onClick: onLoadMore,
                    },
                    `⬇️ 下滑或点击加载更多 (${allRecentCommits.length}${totalCommits ? " / " + totalCommits : ""})`
                  )
                : (allRecentCommits.length >= 15)
                ? h("div", { style: { fontSize: "11px", opacity: 0.5, padding: "4px 0" } }, `✓ 已加载全部 ${allRecentCommits.length} 条提交`)
                : null
            )
          );
        })(),
        !commitLog || ((commitLog.aheadCommits || []).length === 0 && (commitLog.behindCommits || []).length === 0 && (commitLog.recent || []).length === 0)
          ? h("div", { className: "dsh-github-empty" }, "无提交记录")
          : null,
        // 分支关联 PR 与 Release 锚定（保留）
        branchPr
          ? h(
              "div",
              { className: "dsh-github-item", style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginTop: "8px" } },
              h("span", null, "🔀"),
              branchPr.url
                ? h("a", { className: "dsh-github-item-title", href: branchPr.url, target: "_blank" }, `PR #${branchPr.number} ${branchPr.title}`)
                : h("span", { className: "dsh-github-item-title" }, `PR #${branchPr.number} ${branchPr.title}`),
              branchPr.isDraft ? h("span", { className: "dsh-github-badge dsh-badge-yellow" }, "DRAFT") : null
            )
          : null
      );

      // ============ 「未提交清单」Tab 页（全宽列表，原 details 折叠平移） ============
      var dirtySectionEl = h(
        "div",
        { className: "dsh-github-section" },
        h("div", { className: "dsh-github-section-header" }, h("h3", null, `📁 未提交清单 (${gitSt ? gitSt.dirtyCount : 0})`)),
        !gitSt || gitSt.dirtyCount === 0
          ? h("div", { className: "dsh-github-empty" }, "工作区干净，没有未提交的变更 ✓")
          : h(
              "div",
              { style: { fontSize: "12px", lineHeight: "1.9" } },
              (gitSt.dirtyFiles || []).map(function (f: any, i: number) {
                return h(
                  "div",
                  { key: i, style: { display: "flex", gap: "8px", padding: "2px 4px", borderRadius: "4px" } },
                  h("span", {
                    style: {
                      minWidth: "24px",
                      textAlign: "center",
                      opacity: 0.75,
                      fontSize: "11px",
                      fontFamily: "monospace",
                      // 状态码配色：?? 新增(绿) / D 删除(红) / M 修改(黄) / 其他中性
                      color: f.status === "??" ? "var(--dsw-alias-state-success-primary, #1a7f37)"
                        : f.status.indexOf("D") >= 0 ? "var(--dsw-alias-state-error-primary, #cf222e)"
                        : f.status.indexOf("M") >= 0 || f.status.indexOf("R") >= 0 ? "var(--dsw-alias-state-attention-primary, #9a6700)"
                        : "inherit",
                    },
                  }, f.status === "??" ? "??" : f.status),
                  h("span", { style: { wordBreak: "break-all" } }, f.path)
                );
              }),
              gitSt.dirtyCount > (gitSt.dirtyFiles || []).length
                ? h("div", { style: { opacity: 0.6, marginTop: "6px" } }, `…共 ${gitSt.dirtyCount} 个变更（仅列前 ${(gitSt.dirtyFiles || []).length}）`)
                : null
            )
      );

      // 快捷操作栏 (仅在检测到关联仓库时展示，未绑定仓库时不展示虚假按钮)
      var actionsBarEl = repo ? h(
        "div",
        { className: "dsh-github-quick-actions" },
        // 1. 浏览器打开仓库主页
        h(
          "button",
          {
            className: "dsh-github-action-btn",
            title: "在系统默认浏览器中打开当前仓库主页",
            onClick: () => {
              if (repo?.url) {
                window.open(repo.url, "_blank", "noopener,noreferrer");
              }
            },
          },
          "🌐 浏览器打开"
        ),
        // 2. 查看所有 PRs
        h(
          "button",
          {
            className: "dsh-github-action-btn",
            title: "在系统默认浏览器中查看所有 Pull Requests",
            onClick: () => {
              if (repo?.url) {
                window.open(`${repo.url}/pulls`, "_blank", "noopener,noreferrer");
              }
            },
          },
          "🔀 查看所有 PRs"
        ),
        // 3. 🚀 快速创建 PR (官方对比与创建页直达)
        h(
          "button",
          {
            className: "dsh-github-action-btn",
            title: "在系统默认浏览器中打开 GitHub 官方对比与创建 Pull Request 页面",
            onClick: () => {
              if (repo?.url) {
                window.open(`${repo.url}/compare`, "_blank", "noopener,noreferrer");
              }
            },
          },
          "🚀 快速创建 PR"
        ),
        // 4. 查看所有 Issues (官方 Issues 列表直达)
        h(
          "button",
          {
            className: "dsh-github-action-btn",
            title: "在系统默认浏览器中查看当前仓库所有 Issues",
            onClick: () => {
              if (repo?.url) {
                window.open(`${repo.url}/issues`, "_blank", "noopener,noreferrer");
              }
            },
          },
          "📋 查看所有 Issues"
        ),
        // 5. 📝 新建 Issue (官方 Issue 模板页直达)
        h(
          "button",
          {
            className: "dsh-github-action-btn",
            title: "在系统默认浏览器中打开 GitHub 官方新建 Issue 页面",
            onClick: () => {
              if (repo?.url) {
                window.open(`${repo.url}/issues/new`, "_blank", "noopener,noreferrer");
              }
            },
          },
          "📝 新建 Issue"
        )
      ) : null;

      // PR 列表
      var prSectionEl = h(
        "div",
        { className: "dsh-github-section" },
        h("div", { className: "dsh-github-section-header" }, h("h3", null, `🔀 Pull Requests (${prs.length})`)),
        prs.length === 0
          ? h("div", { className: "dsh-github-empty" }, "当前无开放中的 PR")
          : h(
              "div",
              { className: "dsh-github-list" },
              prs.map((pr: any) => {
                // CI 聚合（归约顺序 fail>pending>pass——问题优先于通过）与 Review 判定
                var ci = rollupCiStatus(pr.statusCheckRollup);
                var rv = reviewDecisionBadge(pr.reviewDecision);
                var relTime = formatRelativeTime(pr.updatedAt);
                return h(
                  "div",
                  { key: pr.number, className: "dsh-github-item" },
                  h("a", {
                    className: "dsh-github-item-title",
                    href: pr.url,
                    target: "_blank",
                    title: relTime ? `更新于 ${pr.updatedAt}` : undefined,
                  }, `${pr.isDraft ? "⚪ " : ""}#${pr.number} ${pr.title}`),
                  h(
                    "div",
                    { className: "dsh-github-item-meta" },
                    h("span", null, `${pr.headRefName} → ${pr.baseRefName}`),
                    pr.mergeable === "CONFLICTING"
                      ? h("span", { className: "dsh-github-badge dsh-badge-red" }, "代码冲突")
                      : h("span", { className: "dsh-github-badge dsh-badge-green" }, "可合并"),
                    ci === "fail"
                      ? h("span", { className: "dsh-github-badge dsh-badge-red" }, "❌ CI 失败")
                      : ci === "pending"
                      ? h("span", { className: "dsh-github-badge dsh-badge-yellow" }, "⏳ CI 运行中")
                      : ci === "pass"
                      ? h("span", { className: "dsh-github-badge dsh-badge-green" }, "✅ CI 通过")
                      : null,
                    rv
                      ? h("span", { className: `dsh-github-badge dsh-badge-${rv.kind}` }, rv.text)
                      : null,
                    relTime ? h("span", null, relTime) : null
                  )
                );
              })
            )
      );

      // 仓库 Issues 列表
      var issueSectionEl = h(
        "div",
        { className: "dsh-github-section" },
        h(
          "div",
          { className: "dsh-github-section-header" },
          h("h3", null, `📋 仓库 Issues (${issues.length})`),
          repo?.url
            ? h(
                "a",
                {
                  href: `${repo.url}/issues`,
                  target: "_blank",
                  style: { fontSize: "11px", color: "var(--dsw-alias-link, #0969da)", textDecoration: "none" },
                },
                "全部 ↗"
              )
            : null
        ),
        issues.length === 0
          ? h("div", { className: "dsh-github-empty" }, "当前无开放中的 Issue")
          : h(
              "div",
              { className: "dsh-github-list" },
              issues.map((issue: any) => {
                var cats = issue.categories || [];
                var badges: any[] = [];
                if (cats.includes("reported")) {
                  badges.push(h("span", { key: "rep", className: "dsh-github-badge dsh-badge-purple" }, "用户反馈"));
                }
                if (cats.includes("assigned")) {
                  badges.push(h("span", { key: "asn", className: "dsh-github-badge dsh-badge-blue" }, "已分配"));
                }
                if (cats.includes("created")) {
                  badges.push(h("span", { key: "crt", className: "dsh-github-badge dsh-badge-green" }, "我发起的"));
                }

                return h(
                  "div",
                  { key: issue.number, className: "dsh-github-item" },
                  h(
                    "div",
                    { style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" } },
                    h(
                      "a",
                      { className: "dsh-github-item-title", href: issue.url, target: "_blank" },
                      `#${issue.number} ${issue.title}`
                    ),
                    ...badges
                  ),
                  h(
                    "div",
                    { className: "dsh-github-item-meta" },
                    h("span", null, `由 ${issue.author?.login || "未知"} 提出`),
                    issue.assignees && issue.assignees.length > 0
                      ? h("span", null, `指派: ${issue.assignees.map((a: any) => a.login).join(", ")}`)
                      : null,
                    issue.labels && issue.labels.length > 0
                      ? issue.labels.map((lbl: any) =>
                          h("span", { key: lbl.name, className: "dsh-github-badge dsh-badge-yellow" }, lbl.name)
                        )
                      : null
                  )
                );
              })
            )
      );

      // Actions 流水线
      var runSectionEl = h(
        "div",
        { className: "dsh-github-section" },
        h("div", { className: "dsh-github-section-header" }, h("h3", null, `⚡ 最近 Actions 流水线 (${runs.length})`)),
        runs.length === 0
          ? h("div", { className: "dsh-github-empty" }, "暂无工作流记录")
          : h(
              "div",
              { className: "dsh-github-list" },
              runs.map((r: any) =>
                h(
                  "div",
                  { key: r.databaseId, className: "dsh-github-item" },
                  h("a", {
                    className: "dsh-github-item-title",
                    href: r.url,
                    target: "_blank",
                    title: r.createdAt ? `始于 ${r.createdAt}` : undefined,
                  }, r.name),
                  h(
                    "div",
                    { className: "dsh-github-item-meta" },
                    h("span", null, `分支: ${r.headBranch}`),
                    r.event ? h("span", null, eventLabel(r.event)) : null,
                    formatRelativeTime(r.createdAt) ? h("span", null, formatRelativeTime(r.createdAt)) : null,
                    r.conclusion === "success"
                      ? h("span", { className: "dsh-github-badge dsh-badge-green" }, "✓ 成功")
                      : r.conclusion === "failure"
                      ? h("span", { className: "dsh-github-badge dsh-badge-red" }, "✕ 失败")
                      : h("span", { className: "dsh-github-badge dsh-badge-yellow" }, r.status)
                  ),
                  // 失败自愈引导：把面板从「展示」升级为「引导 Agent 定位」——
                  // run_id 直接嵌入文案，Agent 看到即可发起 log_failed 调用
                  r.conclusion === "failure"
                    ? h("div", {
                        className: "dsh-github-card-subtext",
                        style: { fontSize: "11px", marginTop: "2px" },
                      }, `💡 让 Agent 调用 github_run(action:'log_failed', run_id:'${r.databaseId}') 提取失败日志定位原因`)
                    : null
                )
              )
            )
      );

      var authGuideEl = (!auth?.loggedIn && !auth?.networkError && syncStatus !== "failed")
        ? h(AuthGuideCard, { auth, onRefresh, isRightbar })
        : null;

      // ============ 内容区 Tab 化（五页互斥，DOM 级状态） ============
      // 为什么 Tab 状态存 DOM 而非 React state / 模块变量：renderGithubRepoView
      // 是普通渲染函数（非组件，不能 useState）；模块级可变状态在多宿主双挂载时
      // 会串扰。data-active-tab 属性挂在每实例容器上，各实例独立记忆各自 Tab。
      var TAB_DEFS: Array<{ key: string; label: string; count: number | null; icon?: any }> = [
        { key: "git", label: "Git", count: null, icon: renderGitIcon(13, "#1296db") },
        { key: "dirty", label: "📁 未提交", count: gitSt ? gitSt.dirtyCount : null },
        { key: "prs", label: "🔀 PR", count: prs.length },
        { key: "issues", label: "📋 Issues", count: issues.length },
        { key: "runs", label: "⚡ Actions", count: runs.length },
      ].filter(function (t) {
        // 无 gitStatus（非 Git 工作区/探测失败）时 Git 与未提交两页隐藏——
        // 数据缺失是常态而非禁用态，隐藏比置灰诚实
        if ((t.key === "git" || t.key === "dirty") && !gitSt) return false;
        return true;
      });
      // 默认 Tab：Git 记录（工作区状态是会话最常查的上下文）；非 Git 工作区
      // 降级为 PR，空 PR + 有 Issue 再降 Issues
      var defaultTab = gitSt ? "git" : (prs.length === 0 && issues.length > 0 ? "issues" : "prs");

      var switchTab = function (container: HTMLElement, tabKey: string) {
        // data-active-tab 是每实例的 Tab 记忆载体（DOM 属性）；互斥显示逻辑
        // 提升为模块级 applyTabState（与宿主组件的 SWR 校正 effect 共用）
        container.setAttribute("data-active-tab", tabKey);
        applyTabState(container, tabKey);
      };

      var tabsBarEl = h(
        "div",
        { className: "dsh-github-tabs", style: { marginBottom: "12px" } },
        ...TAB_DEFS.map(function (t) {
          var labelText = t.count !== null ? `${t.label} (${t.count})` : t.label;
          return h(
            "button",
            {
              key: t.key,
              // React 无受控状态——className 初值按默认 Tab 计算，切换由 switchTab 直接改 DOM
              className: "dsh-github-tab-btn" + (t.key === defaultTab ? " active" : ""),
              "data-tab-btn": t.key,
              style: t.icon ? { display: "inline-flex", alignItems: "center", gap: "5px" } : undefined,
              onClick: function (e: any) {
                var container = (e.target as HTMLElement).closest("[data-active-tab]");
                if (container) switchTab(container as HTMLElement, t.key);
              },
            },
            t.icon ? [t.icon, " ", labelText] : labelText
          );
        })
      );

      var tabbedContentEl = h(
        "div",
        { "data-active-tab": defaultTab },
        tabsBarEl,
        // 五个页面：hidden 初值按默认 Tab；原三区块内部渲染零改动，仅加包裹属性
        h("div", { "data-tab-page": "prs", hidden: defaultTab !== "prs" }, prSectionEl),
        h("div", { "data-tab-page": "issues", hidden: defaultTab !== "issues" }, issueSectionEl),
        h("div", { "data-tab-page": "runs", hidden: defaultTab !== "runs" }, runSectionEl),
        gitSt ? h("div", { "data-tab-page": "git", hidden: defaultTab !== "git" }, gitSectionEl) : null,
        gitSt ? h("div", { "data-tab-page": "dirty", hidden: defaultTab !== "dirty" }, dirtySectionEl) : null
      );

      return [headerEl, networkAlertBannerEl, upgradeBannerEl, authGuideEl, repoCardEl, actionsBarEl, tabbedContentEl].filter(Boolean);
    }

    // 全局持久化缓存与偏好配置键名
    var GLOBAL_OVERVIEW_CACHE_KEY = "dsh_github_global_overview_snapshot_v1";
    var SYNC_SETTINGS_STORAGE_KEY = "dsh_github_sync_settings_v1";

    // 同步策略收敛为两态：'swr'（打开秒开旧数据+后台静默拉新）| 'manual'（仅手动刷新）。
    // 旧的第三态 'interval'（前端 setInterval 轮询）已删除：浏览器对后台标签页节流
    // 定时器、组件卸载即销毁，该模式在真实环境几乎从不按承诺工作（停留短于间隔则
    // 永不触发）；其「打开即新鲜」的诉求由 SWR 挂载自愈覆盖，「持续同步」点刷新即可。
    var DEFAULT_SYNC_SETTINGS = {
      strategy: "swr",     // 'swr' | 'manual'
    };

    function getLocalSyncSettings() {
      try {
        var raw = localStorage.getItem(SYNC_SETTINGS_STORAGE_KEY);
        if (!raw) return DEFAULT_SYNC_SETTINGS;
        var parsed = JSON.parse(raw);
        var merged = Object.assign({}, DEFAULT_SYNC_SETTINGS, parsed);
        // 旧版本迁移：曾选过 'interval' 的用户自动回落 SWR（最接近原意图），
        // 并立即覆写存储防止每次读取都走迁移分支。
        if (merged.strategy === "interval") {
          merged.strategy = "swr";
          saveLocalSyncSettings(merged);
        }
        return merged;
      } catch (e) {
        return DEFAULT_SYNC_SETTINGS;
      }
    }

    function saveLocalSyncSettings(settings: any) {
      try {
        localStorage.setItem(SYNC_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
        // 跨组件事件通知：确保主页设置被修改后，右侧栏及所有实例即时同步新规则
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("dsh-github-sync-settings-change", { detail: settings }));
        }
      } catch (e) {}
    }

    function getStoredGlobalOverview() {
      try {
        var raw = localStorage.getItem(GLOBAL_OVERVIEW_CACHE_KEY);
        if (!raw) return null;
        var parsed = JSON.parse(raw);
        // 数据完整性校验：必须具备有效 data 载荷
        if (!parsed || !parsed.data) {
          return null;
        }
        if (typeof parsed.savedAt === "number") {
          return parsed;
        }
        return null;
      } catch (e) {
        return null;
      }
    }

    function saveStoredGlobalOverview(data: any) {
      // 容灾拦截守卫：绝不让网络异常状态冲刷覆盖已持久化的有效快照！
      if (!data || !data.auth || data.auth.networkError) {
        return;
      }
      try {
        localStorage.setItem(GLOBAL_OVERVIEW_CACHE_KEY, JSON.stringify({
          data: data,
          savedAt: Date.now(),
        }));
      } catch (e) {}
    }

    function clearStoredGlobalOverview() {
      try {
        localStorage.removeItem(GLOBAL_OVERVIEW_CACHE_KEY);
        // 彻底清空所有右侧栏工作区历史快照，确保全局一致
        if (typeof localStorage !== "undefined") {
          for (var i = localStorage.length - 1; i >= 0; i--) {
            var k = localStorage.key(i);
            if (k && k.indexOf("dsh_github_rightbar_snapshot_") === 0) {
              localStorage.removeItem(k);
            }
          }
        }
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("dsh-github-cache-cleared"));
        }
      } catch (e) {}
    }

    function getCacheStorageMeta() {
      try {
        var raw = localStorage.getItem(GLOBAL_OVERVIEW_CACHE_KEY);
        if (!raw) return { exists: false, sizeKb: 0, savedAt: 0 };
        var parsed = JSON.parse(raw);
        var sizeKb = Math.round((raw.length * 2) / 1024 * 10) / 10;
        return { exists: true, sizeKb: sizeKb, savedAt: parsed?.savedAt || 0 };
      } catch (e) {
        return { exists: false, sizeKb: 0, savedAt: 0 };
      }
    }

    // 右侧栏专属本地持久化快照工具
    function getRightbarStorageKey(cwd: string | null) {
      var safe = (cwd || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
      return "dsh_github_rightbar_snapshot_" + safe;
    }

    function getStoredRightbarSnapshot(cwd: string | null) {
      try {
        var key = getRightbarStorageKey(cwd);
        var raw = localStorage.getItem(key);
        if (!raw) return null;
        var parsed = JSON.parse(raw);
        if (!parsed || !parsed.data) {
          return null;
        }
        return { data: parsed.data, savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0 };
      } catch (e) {
        return null;
      }
    }

    function saveStoredRightbarData(cwd: string | null, data: any) {
      // 遭遇网络故障或空数据时，不冲刷本地有效快照
      if (!data || !data.auth || data.auth.networkError) return;
      try {
        var key = getRightbarStorageKey(cwd);
        localStorage.setItem(key, JSON.stringify({
          data: data,
          savedAt: Date.now(),
        }));
      } catch (e) {}
    }

    // 1. 右侧栏专属视图 (Right Sidebar Tab Body)
    function GithubRightbarBody(props: any) {
      var sessionId = props ? props.sessionId : null;
      var cwd: string | null = null;
      if (props && typeof props.useSessions === "function" && sessionId) {
        try {
          cwd = props.useSessions((sessions: any) => sessions?.byId?.[sessionId]?.cwd) || null;
        } catch (e) {}
      }

      // 核心原则：右侧栏与全景主页使用同一套在“主页-设置”中配置的缓存与刷新规则事实源
      var initialSettings = React.useMemo(() => getLocalSyncSettings(), []);
      var [syncSettings, setSyncSettings] = React.useState(initialSettings);

      // SWR 秒开机制：初始数据直接从本地快照读取，0ms 瞬间展示！
      var initialSnapshot = React.useMemo(() => getStoredRightbarSnapshot(cwd), [cwd]);
      var [data, setData] = React.useState(initialSnapshot?.data || null);
      var [syncStatus, setSyncStatus] = React.useState(initialSnapshot ? "cached" : "loading");
      var [lastSyncedAt, setLastSyncedAt] = React.useState(initialSnapshot?.savedAt || 0);
      var [loading, setLoading] = React.useState(false);
      var [error, setError] = React.useState(null as string | null);
      var [updateInfo, setUpdateInfo] = React.useState(null as any);
      var [toastMsg, setToastMsg] = React.useState(null as string | null);

      var showToast = (msg: string) => {
        setToastMsg(msg);
        setTimeout(() => setToastMsg(null), 5000);
      };

      // 工作区路径 (cwd) 切换响应式同步：立即加载对应新工作区的独立本地快照，杜绝上一个工作区数据残留！
      React.useEffect(() => {
        var snap = getStoredRightbarSnapshot(cwd);
        setData(snap?.data || null);
        setSyncStatus(snap ? "cached" : "loading");
        setLastSyncedAt(snap?.savedAt || 0);
        setError(null);
      }, [cwd]);

      // 跨组件事件监听：当主页修改了同步设置或清空缓存时，右侧栏即时无感对齐
      React.useEffect(function () {
        var onSettingsChange = function (e: any) {
          if (e && e.detail) {
            setSyncSettings(e.detail);
          }
        };
        var onCacheCleared = function () {
          setData(null);
          setLastSyncedAt(0);
          setSyncStatus("loading");
        };
        window.addEventListener("dsh-github-sync-settings-change", onSettingsChange);
        window.addEventListener("dsh-github-cache-cleared", onCacheCleared);
        return function () {
          window.removeEventListener("dsh-github-sync-settings-change", onSettingsChange);
          window.removeEventListener("dsh-github-cache-cleared", onCacheCleared);
        };
      }, []);

      // 检查更新与 gh 环境链路（安装/登录/业务数据）零依赖，挂载即并行发起：
      // 原先门控在 [data] 之后会串行等 5~19 秒，且 gh 冷启动失败时 data 恒空导致横幅永不出。
      // 仅 300ms 微延迟避让首屏渲染；并发由服务端 inFlightPromise + 24h 缓存合流去重。
      React.useEffect(() => {
        var timer = setTimeout(function () {
          fetch("/api/github/check-update")
            .then(function (res) { return res.json(); })
            .then(function (json) {
              if (json && json.ok && json.data) {
                setUpdateInfo(json.data);
              }
            })
            .catch(function () {});
        }, 300);
        return function () { clearTimeout(timer); };
      }, []);

      // 遵循全局规则的数据拉取核心函数 (仅依赖标量 cwd 与 sessionId，坚决去除 props 引用依赖，彻底终结死循环)
      var loadData = React.useCallback(async (forceRefresh = false) => {
        // 规则执行：若主页设置为「纯手动模式 (manual)」，且非用户点击强制刷新，且本地已有数据，坚决不打后台网络！
        if (!forceRefresh && syncSettings.strategy === "manual" && data) {
          return;
        }

        if (forceRefresh || !data) {
          setLoading(true);
        }
        setSyncStatus(data ? "syncing" : "loading");
        setError(null);

        // 与全局面板同规格的超时保护：任一 fetch 挂起（如系统代理劫持回环请求）时
        // 45 秒 abort，loading 必然清除——未安装 gh 的用户能拿到明确的错误出口
        // 而非永久转圈。此前本函数完全没有 AbortController，挂起即永久 loading。
        var controller = new AbortController();
        var timedOut = false;
        var timer = setTimeout(function () { timedOut = true; controller.abort(); }, 45000);
        try {
          if (forceRefresh) {
            await fetch("/api/github/refresh", { method: "POST", signal: controller.signal }).catch(() => {});
          }
          var url = "/api/github/overview";
          var params: string[] = [];
          if (forceRefresh) {
            params.push("force=true");
          }
          if (sessionId) {
            params.push("sessionId=" + encodeURIComponent(sessionId));
          }
          if (cwd) {
            params.push("cwd=" + encodeURIComponent(cwd));
          }
          if (params.length > 0) {
            url += "?" + params.join("&");
          }
          var res = await fetch(url, { signal: controller.signal });
          if (!res.ok) {
            var errText = await res.text().catch(() => "");
            var msg = `后端服务未就绪 (${res.status}): ${errText || res.statusText}`;
            setSyncStatus("failed");
            setError(msg);
            if (forceRefresh) {
              showToast("❌ 刷新失败：" + msg);
            }
            return;
          }
          var json = await res.json();
          if (json.ok && json.data) {
            var isFail = Boolean(
              json.partialFailure ||
              json.data.partialFailure ||
              json.data.networkError ||
              json.data.auth?.networkError ||
              json.error
            );
            var failReason = String(
              json.error ||
              json.fetchError ||
              json.data.networkErrorReason ||
              json.data.auth?.networkErrorReason ||
              "拉取云端数据失败"
            );

            if (isFail) {
              setSyncStatus("failed");
              setError(failReason);
              // 关键保全：若当前本地已有数据且包含 PR/Issue，若新拉取的为空，绝不让空列表抹杀现有数据！
              if (data && (data.pullRequests?.length > 0 || data.issues?.length > 0 || data.runs?.length > 0)) {
                if (json.data.pullRequests?.length > 0 || json.data.issues?.length > 0) {
                  setData(json.data);
                }
              } else {
                setData(json.data);
              }
              if (forceRefresh) {
                showToast("❌ 刷新失败：" + failReason);
              }
            } else {
              setData(json.data);
              saveStoredRightbarData(cwd, json.data); // 写入持久化快照
              // 关键修正：如果是来自后端缓存则读取缓存历史时间，仅在云端新鲜请求时使用 Date.now()！
              var syncTs = json.fromCache && json.data.lastUpdated
                ? (Date.parse(json.data.lastUpdated) || Date.now())
                : Date.now();
              setLastSyncedAt(syncTs);
              setSyncStatus(json.fromCache ? "cached" : "fresh");
              setError(null);
              if (forceRefresh) {
                showToast("✅ 刷新成功，已同步最新数据");
              }
            }
            if (json.data.updateInfo) {
              setUpdateInfo(json.data.updateInfo);
            }
          } else if (data) {
            setSyncStatus("failed");
            var failMsg = json.error || "获取状态失败";
            setError(failMsg);
            if (forceRefresh) {
              showToast("❌ 刷新失败：" + failMsg);
            }
          } else {
            setError(json.error || "获取状态失败");
          }
        } catch (err: any) {
          setSyncStatus("failed");
          var catchFailReason = (timedOut || err.name === "AbortError")
            ? "网络连接超时 (45 秒)：请检查网络或在代理设置中放行 127.0.0.1"
            : (err.message || "网络异常");
          setError(catchFailReason);
          if (forceRefresh) {
            showToast("❌ 刷新失败：" + catchFailReason);
          }
        } finally {
          clearTimeout(timer);
          setLoading(false);
        }
      }, [cwd, sessionId, data, syncSettings.strategy]);

      // 挂载与策略调度：与主页规则 100% 保持一致。
      // SWR 分支不判 data：挂载 300ms 后台静默拉新，昨天的持久化快照当场自愈——
      // 「打开就能看到最新」是 SWR 的定义，不依赖用户停留时长。
      React.useEffect(() => {
        if (syncSettings.strategy === "swr") {
          var timer = setTimeout(function () { loadData(false); }, 300);
          return function () { clearTimeout(timer); };
        } else if (!data) {
          loadData(false);
        }
      }, [cwd, sessionId, syncSettings.strategy]);

      // （原定时轮询调度已随 'interval' 策略一并移除：前端 setInterval 受浏览器
      //  后台节流且随组件卸载销毁，无法兑现「定时自动更新」承诺）

      // Tab 状态校正：SWR 后台同步触发 data 重渲染时，renderGithubRepoView 的
      // hidden/active 按默认 Tab 重算——用户手动切换的选择会被拽回。此 effect
      // 在每次 data 变化后按容器记录的 data-active-tab（用户最后选择）重新应用。
      React.useEffect(() => {
        var container = containerRef.current;
        if (!container) return;
        var active = container.getAttribute("data-active-tab");
        if (active) applyTabState(container, active);
      }, [data]);

      // 窗口切回自动探测自愈：优先轻量快速探针，检测到已登录立即自愈
      React.useEffect(() => {
        var onFocus = () => {
          if (!data?.auth?.loggedIn) {
            fetch("/api/github/auth?force=true")
              .then(function (res) { return res.json(); })
              .then(function (json) {
                if (json && json.ok && json.auth && json.auth.loggedIn) {
                  loadData(true);
                }
              })
              .catch(function () {});
          }
        };
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
      }, [data, loadData]);

      // 设置弹窗（右侧栏独立实例）：插件徽标 → 直开「关于」分区；⚙️ 按钮 → 默认
      // 「数据同步」。与全景主页复用同一弹窗组件，同步设置经事件总线实时对齐两侧。
      var [aboutModalOpen, setAboutModalOpen] = React.useState(false);
      var [rightbarModalOpen, setRightbarModalOpen] = React.useState(false);
      var [rightbarModalSection, setRightbarModalSection] = React.useState("sync");
      var [selectedCommit, setSelectedCommit] = React.useState(null as any);
      var [extraCommits, setExtraCommits] = React.useState([] as any[]);
      var [loadingMore, setLoadingMore] = React.useState(false);
      var [hasMoreCommits, setHasMoreCommits] = React.useState(true);
      var containerRef = React.useRef(null as any);

      // 工作区路径切换或刷新数据时重置分页状态
      React.useEffect(function () {
        setExtraCommits([]);
        setHasMoreCommits(true);
      }, [cwd, data]);

      var loadMoreCommits = function () {
        if (loadingMore || !hasMoreCommits) return;
        var baseCount = (data?.commitLog?.recent?.length || 0);
        var currentCount = baseCount + extraCommits.length;
        var total = data?.commitLog?.totalCount;
        if (total !== undefined && currentCount >= total) {
          setHasMoreCommits(false);
          return;
        }
        setLoadingMore(true);
        var url = "/api/github/git-log?limit=15&skip=" + currentCount + (cwd ? "&cwd=" + encodeURIComponent(cwd) : "");
        fetch(url)
          .then(function (r: any) { return r.json(); })
          .then(function (j: any) {
            setLoadingMore(false);
            if (j && j.ok && j.data && Array.isArray(j.data.commits)) {
              if (j.data.commits.length === 0) {
                setHasMoreCommits(false);
              } else {
                setExtraCommits(function (prev: any[]) { return prev.concat(j.data.commits); });
                if (j.data.totalCount !== undefined && (currentCount + j.data.commits.length) >= j.data.totalCount) {
                  setHasMoreCommits(false);
                }
              }
            } else {
              setHasMoreCommits(false);
            }
          })
          .catch(function () {
            setLoadingMore(false);
          });
      };

      // 监听右侧栏容器滚动触底：下滑时自动加载更多提交
      React.useEffect(function () {
        var el = containerRef.current;
        if (!el) return;
        var onScroll = function () {
          var activeTab = el.getAttribute("data-active-tab");
          if (activeTab && activeTab !== "git") return;
          var threshold = 80;
          if (el.scrollHeight - el.scrollTop - el.clientHeight < threshold) {
            loadMoreCommits();
          }
        };
        el.addEventListener("scroll", onScroll, { passive: true });
        return function () { el.removeEventListener("scroll", onScroll); };
      }, [data, extraCommits, loadingMore, hasMoreCommits, cwd]);
      React.useEffect(() => {
        // 多宿主同挂载防叠层：全景主页与右侧栏可能同时在 DOM 中，徽标事件若被
        // 两处同时响应会出现双层弹窗。只有「自身容器可见」的宿主才响应——
        // 徽标所在面板必然是用户当前看到的那个。
        var onOpenAbout = () => {
          var el = containerRef.current;
          if (!el) return;
          var rect = el.getBoundingClientRect();
          var visible = rect.width > 0 && rect.height > 0;
          if (visible) setAboutModalOpen(true);
        };
        var onOpenProxy = () => {
          var el = containerRef.current;
          if (!el) return;
          var rect = el.getBoundingClientRect();
          var visible = rect.width > 0 && rect.height > 0;
          if (visible) {
            setRightbarModalSection("proxy");
            setRightbarModalOpen(true);
          }
        };
        window.addEventListener("dsh-github-open-about", onOpenAbout);
        window.addEventListener("dsh-github-open-proxy", onOpenProxy);
        return () => {
          window.removeEventListener("dsh-github-open-about", onOpenAbout);
          window.removeEventListener("dsh-github-open-proxy", onOpenProxy);
        };
      }, []);
      var openRightbarSettings = () => {
        setRightbarModalSection("sync");
        setRightbarModalOpen(true);
      };

      var h = React.createElement;
      var toastEl = toastMsg
        ? h(
            "div",
            {
              style: {
                padding: "8px 12px",
                marginBottom: "10px",
                borderRadius: "6px",
                fontSize: "12px",
                background: toastMsg.startsWith("✅") ? "rgba(46, 160, 67, 0.15)" : "rgba(207, 34, 46, 0.15)",
                color: toastMsg.startsWith("✅") ? "var(--dsw-alias-state-success, #2ea043)" : "var(--dsw-alias-state-error-primary, #cf222e)",
                border: "1px solid " + (toastMsg.startsWith("✅") ? "rgba(46, 160, 67, 0.35)" : "rgba(207, 34, 46, 0.35)"),
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
              },
            },
            h("span", null, toastMsg),
            h("button", { onClick: () => setToastMsg(null), style: { background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: "14px" } }, "✕")
          )
        : null;

      return h(
        "div",
        { className: "dsh-github-rightbar-container", ref: containerRef },
        toastEl,
        ...renderGithubRepoView(
          h,
          data,
          loading,
          error,
          () => loadData(true),
          true,
          updateInfo,
          syncStatus,
          lastSyncedAt,
          openRightbarSettings,
          cwd,
          (c: any) => setSelectedCommit(c),
          {
            extraCommits: extraCommits,
            loadingMore: loadingMore,
            hasMore: hasMoreCommits,
            onLoadMore: loadMoreCommits,
          }
        ),
        // 弹窗一：插件徽标触发的「关于」单页展示
        h(GlobalSyncSettingsModal, {
          isOpen: aboutModalOpen,
          initialSection: "about",
          onClose: () => setAboutModalOpen(false),
          currentSettings: syncSettings,
          onSave: function () { /* 关于入口不触发 sync 保存路径 */ },
          onClearCache: function () { setData(null); },
        }),
        // 弹窗二：⚙️ 按钮触发的完整设置（与主页同一弹窗组件，分区可自由切换）
        h(GlobalSyncSettingsModal, {
          isOpen: rightbarModalOpen,
          initialSection: rightbarModalSection,
          onClose: () => setRightbarModalOpen(false),
          currentSettings: syncSettings,
          onSave: function (newSettings: any) { setSyncSettings(newSettings); },
          onClearCache: function () {
            setData(null);
            setLastSyncedAt(0);
            setSyncStatus("loading");
          },
        }),
        // 弹窗三：点击 Git 提交记录行的详情模态弹窗（与设置弹窗同构，在右侧栏容器内天然居中）
        selectedCommit
          ? h(CommitDetailModal, {
              commit: selectedCommit,
              onClose: function () { setSelectedCommit(null); },
              cwd: cwd,
            })
          : null
      );
    }

    // 2. 右侧栏 Tab 标题组件
    function GithubRightbarTitle() {
      var h = React.createElement;
      return h(
        "span",
        { style: { display: "flex", alignItems: "center", gap: "6px" } },
        renderOctocat(15, "#58a6ff"),
        h("span", null, "GitHub")
      );
    }

    // 3. 右侧栏“开始”引导页的大图标 (Artwork)
    function GithubArtwork() {
      return renderOctocatBadge(32);
    }

    // 4. 左侧栏全局入口与中央大面板
    function GithubSidebarIcon(props: any) {
      const active = Boolean(props && props.active);
      return React.createElement(
        "div",
        {
          className: "dsh-github-icon" + (active ? " active" : ""),
          title: "GitHub 全景驾驶舱（dsh-github-flow 插件）",
        },
        React.createElement(
          "div",
          {
            className: "dsh-github-icon-inner" + (active ? " active" : "")
          },
          renderOctocat(18, "currentColor")
        )
      );
    }

    // 提交详情模态弹窗组件（与设置弹窗同构：使用相同的 modal-overlay 与 modal-dialog，
    // 在右侧栏宿主内天然居中展示，不突破右侧容器边界）。
    // 数据源优先来自本地 git 预取（c.sha/fullSha/author/date/subject/body/stat，0ms 纯本地秒开），
    // 缺失时静默向后端拉取 git show 原文补充，弹窗内完整支持上下滚动浏览超长提交说明。
    function CommitDetailModal(props: { commit: any; onClose: () => void; cwd?: string | null }) {
      if (!props.commit) return null;
      var c = props.commit;
      var h = React.createElement;
      var [fetchedDetail, setFetchedDetail] = React.useState(null as string | null);
      var [fetchingDetail, setFetchingDetail] = React.useState(false);

      React.useEffect(function () {
        var onKeyDown = function (e: any) {
          if (e.key === "Escape" || e.keyCode === 27) props.onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return function () { window.removeEventListener("keydown", onKeyDown); };
      }, [props.onClose]);

      // 兜底补全机制：若内存中无 body/stat（如 DSH 尚未重启加载新解析逻辑），静默单查
      React.useEffect(function () {
        setFetchedDetail(null);
        if (c.body || c.stat) return;
        setFetchingDetail(true);
        var url = "/api/github/commit-detail?sha=" + encodeURIComponent(c.sha) + (props.cwd ? "&cwd=" + encodeURIComponent(props.cwd) : "");
        fetch(url)
          .then(function (r: any) { return r.json(); })
          .then(function (j: any) {
            setFetchingDetail(false);
            if (j && j.ok && j.detail) setFetchedDetail(j.detail);
          })
          .catch(function () { setFetchingDetail(false); });
      }, [c.sha, props.cwd]);

      var effectiveBody = c.body;
      var effectiveStat = c.stat;
      if (!effectiveBody && !effectiveStat && fetchedDetail) {
        effectiveStat = fetchedDetail;
      }

      return h(
        "div",
        {
          className: "dsh-github-modal-overlay",
          onClick: props.onClose,
          style: { zIndex: 100000 },
        },
        h(
          "div",
          {
            className: "dsh-github-modal-dialog",
            style: { width: "94%", maxWidth: "460px", maxHeight: "84vh", display: "flex", flexDirection: "column", overflow: "hidden" },
            onClick: function (e: any) { e.stopPropagation(); },
          },
          h(
            "div",
            { className: "dsh-github-modal-header", style: { flexShrink: 0 } },
            h(
              "div",
              { style: { display: "flex", alignItems: "center", gap: "8px" } },
              renderGitIcon(15, "#1296db"),
              h("h3", { style: { margin: 0, fontSize: "14px", fontWeight: 600 } }, "提交详情")
            ),
            h(
              "button",
              {
                style: { background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "var(--dsw-alias-label-secondary, #656d76)", padding: "0 4px" },
                onClick: props.onClose,
                title: "关闭 (Esc)",
              },
              "✕"
            )
          ),
          h(
            "div",
            {
              className: "dsh-github-modal-body",
              style: { padding: "16px", overflowY: "auto", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: "12px", boxSizing: "border-box" },
            },
            h(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", opacity: 0.85 } },
              h("span", { style: { fontFamily: "monospace", fontWeight: 600, userSelect: "all" }, title: "完整 SHA: " + (c.fullSha || c.sha) }, c.fullSha || c.sha),
              h("span", null, c.relative)
            ),
            h(
              "div",
              { style: { fontSize: "13px", fontWeight: 600, color: "var(--dsw-alias-label-primary, #1f2328)", wordBreak: "break-word", lineHeight: "1.45" } },
              c.subject
            ),
            h(
              "div",
              { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #656d76)" } },
              `提交者: ${c.author}${c.email ? ` <${c.email}>` : ""}${c.date ? ` · ${c.date}` : ""}`
            ),
            effectiveBody
              ? h(
                  "div",
                  {
                    style: {
                      fontSize: "12px",
                      lineHeight: "1.6",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      padding: "10px 12px",
                      borderRadius: "6px",
                      background: "var(--dsw-alias-bg-module-platform, #f6f8fa)",
                      border: "1px solid var(--dsw-alias-border-l2, #e1e4e8)",
                    },
                  },
                  effectiveBody
                )
              : null,
            effectiveStat
              ? h(
                  "div",
                  null,
                  h("div", { style: { fontSize: "11px", fontWeight: 600, marginBottom: "4px", opacity: 0.8 } }, "📁 文件变更统计:"),
                  h(
                    "pre",
                    {
                      className: "dsh-github-commit-pre",
                      style: {
                        fontSize: "11px",
                        lineHeight: "1.5",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        margin: 0,
                        maxHeight: "34vh",
                        overflowY: "auto",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        background: "var(--dsw-alias-bg-module-platform, #f6f8fa)",
                        border: "1px solid var(--dsw-alias-border-l2, #e1e4e8)",
                      },
                    },
                    effectiveStat
                  )
                )
              : null,
            !effectiveBody && !effectiveStat
              ? (fetchingDetail
                  ? h("div", { style: { fontSize: "12px", opacity: 0.7, padding: "8px 0" } }, "⏳ 正在获取详细变更说明…")
                  : h("div", { style: { fontSize: "11px", opacity: 0.6, fontStyle: "italic", padding: "6px 0" } }, "（该提交未包含多行正文；重启 DSH 桌面端可同步最新格式并直接呈现变更统计）"))
              : null
          )
        )
      );
    }

    // 全景驾驶舱「⚙️ 设置」模态弹窗组件：左侧分区导航（数据同步 / 网络代理 / 更新设置 / 关于）+ 右侧内容区。
    // 为什么改多分区：弹窗承载能力从单一「同步偏好」扩展为多项插件设置（后续可继续加），
    // 单页滚动堆叠会让用户找不到入口；分区导航让每项设置拥有独立心智空间与保存动作。
    // initialSection：宿主可指定初始分区——插件徽标点击时直开「关于」，单独展示身份信息。
    function GlobalSyncSettingsModal(props: {
      isOpen: boolean;
      onClose: () => void;
      currentSettings: any;
      onSave: (newSettings: any) => void;
      onClearCache: () => void;
      initialSection?: string;
    }) {
      if (!props.isOpen) return null;

      // ---- 当前激活分区：sync / proxy / update / about ----
      var [activeSection, setActiveSection] = React.useState(props.initialSection || "sync");
      var [strategy, setStrategy] = React.useState(props.currentSettings.strategy || "swr");
      var [cacheMeta, setCacheMeta] = React.useState(getCacheStorageMeta());
      var [clearTip, setClearTip] = React.useState("");

      // ---- 更新设置分区状态 ----
      // 打开弹窗时从后端拉取真实模式（权威源是 update-settings.json 而非 localStorage），
      // 与代理分区同范式：避免多窗口/外部手改文件导致 UI 与实际生效配置漂移。
      var [updateMode, setUpdateMode] = React.useState("official");
      var [updateBusy, setUpdateBusy] = React.useState(false);
      var [updateMsg, setUpdateMsg] = React.useState(null as { kind: "ok" | "err" | "info"; text: string } | null);
      // ---- 关于分区：当前运行版本号（弹窗打开时轻量拉取，失败静默回落占位）----
      var [aboutVersion, setAboutVersion] = React.useState(null as string | null);

      React.useEffect(function () {
        if (!props.isOpen) return;
        fetch("/api/github/update-settings")
          .then(function (r: any) { return r.json(); })
          .then(function (j: any) {
            if (j && j.ok && j.data && j.data.mode) {
              setUpdateMode(j.data.mode);
            }
          })
          .catch(function () { /* 后端不可达时保持默认 official，保存时会得到明确报错 */ });
        // 版本号：check-update 命中 24h 缓存时零成本；失败静默（关于页显示占位版本）
        fetch("/api/github/check-update")
          .then(function (r: any) { return r.json(); })
          .then(function (j: any) {
            if (j && j.ok && j.data && j.data.currentVersion) setAboutVersion(j.data.currentVersion);
          })
          .catch(function () {});
      }, [props.isOpen]);

      // ---- 网络代理分区状态 ----
      // 打开弹窗时从后端拉取真实代理状态（权威源是 proxy.json 而非 localStorage），
      // 避免多窗口/外部手改文件导致的 UI 与实际生效配置漂移。
      var [proxyEnabled, setProxyEnabled] = React.useState(false);
      var [proxyUrl, setProxyUrl] = React.useState("");
      var [proxyNoProxy, setProxyNoProxy] = React.useState("localhost,127.0.0.1");
      var [proxyApplyNpm, setProxyApplyNpm] = React.useState(true);
      var [proxyBusy, setProxyBusy] = React.useState(false);
      var [proxyMsg, setProxyMsg] = React.useState(null as { kind: "ok" | "err" | "info"; text: string } | null);
      var [proxyProbe, setProxyProbe] = React.useState(null as { ok: boolean; latencyMs?: number; error?: string } | null);

      React.useEffect(function () {
        if (!props.isOpen) return;
        fetch("/api/github/proxy")
          .then(function (r: any) { return r.json(); })
          .then(function (j: any) {
            if (j && j.ok && j.state) {
              setProxyEnabled(Boolean(j.state.config && j.state.config.url));
              setProxyUrl((j.state.config && j.state.config.url) || "");
              setProxyNoProxy((j.state.config && j.state.config.noProxy) || "localhost,127.0.0.1");
              setProxyApplyNpm(j.state.config ? j.state.config.applyToPackageManager !== false : true);
              if (j.state.lastProbe) setProxyProbe(j.state.lastProbe);
            }
          })
          .catch(function () { /* 后端不可达时保持默认值，保存时会得到明确报错 */ });
      }, [props.isOpen]);

      // 键盘 Escape 快捷关闭支持
      React.useEffect(function () {
        var onKeyDown = function (e: any) {
          if (e.key === "Escape" || e.keyCode === 27) {
            props.onClose();
          }
        };
        window.addEventListener("keydown", onKeyDown);
        return function () { window.removeEventListener("keydown", onKeyDown); };
      }, [props.onClose]);

      // initialSection 同步：弹窗实例常驻（return null 在 hooks 后，不卸载），
      // useState 初值只在首挂载取一次——宿主切换入口重开时（如齿轮→关→徽标），
      // 必须显式把 activeSection 对齐到新的 initialSection，否则停留在旧分区。
      React.useEffect(function () {
        if (props.isOpen && props.initialSection) {
          setActiveSection(props.initialSection);
        }
      }, [props.isOpen, props.initialSection]);

      // 更新源保存：POST 后端（写盘 + 热切换 checker + 立即用新源真探）。
      // 返回的 probe 结果如实展示：探测失败提示网络问题而非假报「已生效无异常」。
      var handleUpdateSave = function () {
        setUpdateBusy(true);
        setUpdateMsg(null);
        fetch("/api/github/update-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: updateMode }),
        })
          .then(function (r: any) { return r.json(); })
          .then(function (j: any) {
            setUpdateBusy(false);
            if (j && j.ok && j.data) {
              var d = j.data;
              var text = "";
              if (d.mode === "off") {
                text = "✅ 已关闭自动检查更新（/gh upgrade 与一键升级仍可用），无需重启";
              } else if (d.probe && d.probe.latestVersion) {
                text = "✅ 已切换至" + d.description + "，当前最新版本 v" + d.probe.latestVersion
                  + (d.probe.hasUpdate ? "（有可用更新）" : "（已是最新）") + "，无需重启";
              } else {
                // 探测失败如实告知：设置已生效但新源暂不可达（可能是网络或源同步问题）
                text = "✅ 已切换至" + d.description + "，但新源暂时不可达（版本探测失败，稍后会自动重试）；设置已生效，无需重启";
              }
              if (d.persisted === false) {
                text += "；⚠️ 设置写盘失败，重启后需重新选择";
              }
              setUpdateMsg({ kind: "ok", text: text });
            } else {
              setUpdateMsg({ kind: "err", text: (j && j.message) || "保存失败" });
            }
          })
          .catch(function (e: any) {
            setUpdateBusy(false);
            setUpdateMsg({ kind: "err", text: "网络请求失败: " + (e && e.message ? e.message : e) });
          });
      };

      var h = React.createElement;

      var handleSave = function () {
        var updated = {
          strategy: strategy,
        };
        saveLocalSyncSettings(updated);
        props.onSave(updated);
        props.onClose();
      };

      var handleClear = function () {
        clearStoredGlobalOverview();
        props.onClearCache();
        setCacheMeta({ exists: false, sizeKb: 0, savedAt: 0 });
        setClearTip("本地缓存已彻底清空！");
        setTimeout(function () { setClearTip(""); }, 2000);
      };

      // 代理保存：POST 后端后立即全局生效（gh 子进程/升级链路 env + npm 探测 dispatcher）。
      // 保存成功即提示「无需重启」，与「设置完成之后全局生效」的语义对齐。
      var handleProxySave = function () {
        setProxyBusy(true);
        setProxyMsg(null);
        fetch("/api/github/proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: proxyEnabled ? proxyUrl.trim() : "",
            noProxy: proxyNoProxy,
            applyToPackageManager: proxyApplyNpm,
          }),
        })
          .then(function (r: any) { return r.json(); })
          .then(function (j: any) {
            setProxyBusy(false);
            if (j && j.ok) {
              setProxyMsg({
                kind: "ok",
                text: j.state && j.state.config && j.state.config.url
                  ? "🌐 代理已保存并全局生效（驾驶舱 / 右侧栏 / Agent 工具 / 升级链路），无需重启"
                  : "已切换为系统默认网络（直连或系统环境代理），无需重启",
              });
              if (j.state && j.state.lastProbe) setProxyProbe(j.state.lastProbe);
            } else {
              setProxyMsg({ kind: "err", text: (j && j.message) || "保存失败" });
            }
          })
          .catch(function (e: any) {
            setProxyBusy(false);
            setProxyMsg({ kind: "err", text: "网络请求失败: " + (e && e.message ? e.message : e) });
          });
      };

      // 连通性探测：验证经当前配置访问 GitHub API 的可达性（2.5s 超时由后端控制）
      var handleProxyProbe = function () {
        setProxyBusy(true);
        setProxyMsg(null);
        fetch("/api/github/proxy/probe", { method: "POST" })
          .then(function (r: any) { return r.json(); })
          .then(function (j: any) {
            setProxyBusy(false);
            if (j && j.ok && j.probe) {
              setProxyProbe(j.probe);
              setProxyMsg(j.probe.ok
                ? { kind: "ok", text: "✅ GitHub API 可达 (" + j.probe.latencyMs + "ms)" }
                : { kind: "err", text: "❌ " + (j.probe.error || "探测失败") });
            } else {
              setProxyMsg({ kind: "err", text: (j && j.message) || "探测失败" });
            }
          })
          .catch(function (e: any) {
            setProxyBusy(false);
            setProxyMsg({ kind: "err", text: "探测请求失败: " + (e && e.message ? e.message : e) });
          });
      };

      return h(
        "div",
        { className: "dsh-github-modal-overlay", onClick: props.onClose },
        h(
          "div",
          {
            className: "dsh-github-modal-dialog",
            onClick: function (e: any) { e.stopPropagation(); },
          },
          // 弹窗头部：标题 + 关闭按钮
          h("div", { className: "dsh-github-modal-header" },
            h("h3", { style: { margin: 0, fontSize: "16px", fontWeight: 600 } }, "⚙️ 设置"),
            h("button", {
              style: { background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "var(--dsw-alias-label-secondary, #656d76)" },
              onClick: props.onClose,
            }, "✕")
          ),
          // 双栏骨架：左侧分区导航 + 右侧内容区（窄屏自动折叠为横向页签）
          h("div", { className: "dsh-github-modal-body" },
            h("div", { className: "dsh-github-settings-nav" },
              h("button", {
                className: "dsh-github-settings-nav-item" + (activeSection === "sync" ? " active" : ""),
                onClick: function () { setActiveSection("sync"); },
              }, "🔄 数据同步"),
              h("button", {
                className: "dsh-github-settings-nav-item" + (activeSection === "proxy" ? " active" : ""),
                onClick: function () { setActiveSection("proxy"); },
              }, "🌐 网络代理"),
              h("button", {
                className: "dsh-github-settings-nav-item" + (activeSection === "update" ? " active" : ""),
                onClick: function () { setActiveSection("update"); },
              }, "⬆️ 更新设置"),
              h("button", {
                className: "dsh-github-settings-nav-item" + (activeSection === "about" ? " active" : ""),
                onClick: function () { setActiveSection("about"); },
              }, "ℹ️ 关于")
            ),
            h("div", { className: "dsh-github-settings-content" },
              activeSection === "sync" ? h("div", null,
                h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginBottom: "14px", lineHeight: "1.5" } },
                  "配置 GitHub 全景驾驶舱的数据拉取节奏。启用秒开模式可利用本地持久化缓存消除每次打开时的漫长等待。"
                ),
                // 刷新策略选择
                h("div", { style: { marginBottom: "16px" } },
                  h("div", { style: { fontSize: "13px", fontWeight: 600, marginBottom: "8px" } }, "数据刷新策略"),
                  // 策略 A: SWR 秒开
                  h("div", {
                    className: "dsh-github-radio-card" + (strategy === "swr" ? " active" : ""),
                    onClick: function () { setStrategy("swr"); },
                  },
                    h("input", { type: "radio", className: "dsh-github-radio", checked: strategy === "swr", readOnly: true }),
                    h("div", null,
                      h("div", { style: { fontWeight: 600, fontSize: "13px" } }, "⚡ 秒开展示旧数据 (SWR, 强烈推荐)"),
                      h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } },
                        "打开驾驶舱立即展示上次本地缓存（0ms秒开），后台静默同步最新状态。"
                      )
                    )
                  ),
                  // 策略 B: 纯手动刷新
                  h("div", {
                    className: "dsh-github-radio-card" + (strategy === "manual" ? " active" : ""),
                    onClick: function () { setStrategy("manual"); },
                  },
                    h("input", { type: "radio", className: "dsh-github-radio", checked: strategy === "manual", readOnly: true }),
                    h("div", null,
                      h("div", { style: { fontWeight: 600, fontSize: "13px" } }, "📋 仅在手动点击时拉取 (Manual Only)"),
                      h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } },
                        "打开只浏览本地缓存，绝不自动触发后台 gh 进程，最省电、最省资源；想更新时点击「🔄 刷新」即可。"
                      )
                    )
                  )
                  // （第三种「定时自动轮询」策略已移除：前端定时器受浏览器后台节流且随
                  //  组件卸载销毁，无法兑现定时更新承诺；SWR 挂载自愈已覆盖「打开即新鲜」）
                ),
                // 本地缓存信息与清理
                h("div", {
                  className: "dsh-github-cache-info-box",
                },
                  h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                    h("span", null, cacheMeta.exists
                      ? `📦 本地缓存: 约 ${cacheMeta.sizeKb} KB (上次保存: ${new Date(cacheMeta.savedAt).toLocaleTimeString()})`
                      : "📦 暂无本地持久化缓存"
                    ),
                    cacheMeta.exists ? h("button", {
                      className: "dsh-github-btn-sm",
                      style: { padding: "3px 8px", fontSize: "11px", color: "var(--dsw-alias-state-error-primary, #cf222e)" },
                      onClick: handleClear,
                    }, "🗑️ 清空缓存") : null
                  ),
                  clearTip ? h("div", { style: { color: "var(--dsw-alias-state-success, #2ea043)", marginTop: "4px", fontWeight: 500 } }, clearTip) : null
                )
              ) : activeSection === "update" ? h("div", null,
                // ⬆️ 更新设置分区：选择版本检测的 npm 源（或关闭自动检查）。
                // 检测与升级流量均遵循「🌐 网络代理」分区设置——代理是全局的。
                h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginBottom: "14px", lineHeight: "1.5" } },
                  "选择插件新版本检测所用的 npm 源。检测与升级流量均遵循「🌐 网络代理」分区设置：启用 http/https 代理时自动经代理访问；socks5 代理下 npm 检测为直连（gh 与升级子进程链路仍走代理）。无论选择哪个源，安装与升级流程本身不受影响。"
                ),
                h("div", { style: { marginBottom: "16px" } },
                  h("div", { style: { fontSize: "13px", fontWeight: 600, marginBottom: "8px" } }, "更新源"),
                  // 源 A: npm 官方（默认）
                  h("div", {
                    className: "dsh-github-radio-card" + (updateMode === "official" ? " active" : ""),
                    onClick: function () { setUpdateMode("official"); },
                  },
                    h("input", { type: "radio", className: "dsh-github-radio", checked: updateMode === "official", readOnly: true }),
                    h("div", null,
                      h("div", { style: { fontWeight: 600, fontSize: "13px" } }, "🌍 npm 官方源 (推荐)"),
                      h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } },
                        "版本全球首发最及时，刚发布的新版立即可见；国内直连可能较慢。"
                      )
                    )
                  ),
                  // 源 B: 国内镜像
                  h("div", {
                    className: "dsh-github-radio-card" + (updateMode === "mirror" ? " active" : ""),
                    onClick: function () { setUpdateMode("mirror"); },
                  },
                    h("input", { type: "radio", className: "dsh-github-radio", checked: updateMode === "mirror", readOnly: true }),
                    h("div", null,
                      h("div", { style: { fontWeight: 600, fontSize: "13px" } }, "🇨🇳 国内镜像 (npmmirror)"),
                      h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } },
                        "阿里云镜像，国内访问快；同步存在分钟级延迟，刚发布的新版可能暂时查不到。"
                      )
                    )
                  ),
                  // 源 C: 不检查更新
                  h("div", {
                    className: "dsh-github-radio-card" + (updateMode === "off" ? " active" : ""),
                    onClick: function () { setUpdateMode("off"); },
                  },
                    h("input", { type: "radio", className: "dsh-github-radio", checked: updateMode === "off", readOnly: true }),
                    h("div", null,
                      h("div", { style: { fontWeight: 600, fontSize: "13px" } }, "⛔ 不检查更新"),
                      h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } },
                        "关闭自动检查与新版提示横幅；/gh upgrade 命令与一键升级仍然可用。"
                      )
                    )
                  )
                ),
                // 保存按钮 + 结果反馈（按钮复用 star-btn 的双主题链接色样式：内联色
                // 会覆盖 btn-sm 暗色规则，且暗色下亮蓝底刺眼——与关于页修复同源）
                h("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } },
                  h("button", {
                    className: "dsh-github-btn-sm dsh-github-primary-btn",
                    disabled: updateBusy,
                    onClick: handleUpdateSave,
                  }, updateBusy ? "验证中..." : "💾 保存并全局应用"),
                  updateMsg ? h("span", {
                    style: {
                      fontSize: "12px",
                      lineHeight: "1.5",
                      color: updateMsg.kind === "ok"
                        ? "var(--dsw-alias-state-success, #2ea043)"
                        : updateMsg.kind === "err"
                          ? "var(--dsw-alias-state-error-primary, #cf222e)"
                          : "var(--dsw-alias-label-secondary, #656d76)",
                    },
                  }, updateMsg.text) : null
                )
              ) : activeSection === "about" ? h("div", null,
                // ℹ️ 关于分区：项目信息/仓库地址/开源协议/求 Star。纯静态展示，零状态零请求。
                h("div", { style: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" } },
                  renderOctocatBadge(40),
                  h("div", null,
                    h("div", { style: { fontSize: "15px", fontWeight: 600 } }, "DSH GitHub Flow"),
                    h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } },
                      "当前版本: v" + (aboutVersion || "…")
                    )
                  )
                ),
                h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginBottom: "14px", lineHeight: "1.6" } },
                  "让 DeepSeek Harness Agent 拥有操作 GitHub 的原生手脚。原生复用宿主机 gh CLI 安全凭据，深度打通本地 Git 工作区与云端协作，提供 9 大领域 Agent 工具、人类 Slash 指令、Web 全景驾驶舱与一键跨平台升级。"
                ),
                // 信息条目
                h("div", { style: { display: "flex", flexDirection: "column", gap: "8px", marginBottom: "14px" } },
                  h("div", { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" } },
                    h("span", { style: { minWidth: "64px", color: "var(--dsw-alias-label-secondary, #656d76)" } }, "仓库地址"),
                    h("a", { href: "https://github.com/ItQianChen/dsh-github-flow", target: "_blank", rel: "noopener noreferrer", style: { color: "var(--dsw-alias-link, #0969da)" } }, "github.com/ItQianChen/dsh-github-flow")
                  ),
                  h("div", { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" } },
                    h("span", { style: { minWidth: "64px", color: "var(--dsw-alias-label-secondary, #656d76)" } }, "npm 包"),
                    h("a", { href: "https://www.npmjs.com/package/dsh-github-flow", target: "_blank", rel: "noopener noreferrer", style: { color: "var(--dsw-alias-link, #0969da)" } }, "npmjs.com/package/dsh-github-flow")
                  ),
                  h("div", { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" } },
                    h("span", { style: { minWidth: "64px", color: "var(--dsw-alias-label-secondary, #656d76)" } }, "开源协议"),
                    h("a", { href: "https://github.com/ItQianChen/dsh-github-flow/blob/master/LICENSE", target: "_blank", rel: "noopener noreferrer", style: { color: "var(--dsw-alias-link, #0969da)" } }, "MIT License")
                  )
                ),
                // 求 Star 卡片
                // 主题兼容：不用内联色——暗色主题的覆盖只能作用于 class 选择器；
                // 且此前的 canvas-subtle/border-muted 并非宿主真实令牌（全项目无他处使用），
                // 永远回落亮色值导致暗色下一块刺眼亮底。改用 cache-info-box 同款双主题 class。
                h("div", {
                  className: "dsh-github-about-star-box",
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                  },
                },
                  h("span", { style: { fontSize: "18px" } }, "⭐"),
                  h("div", { style: { flex: 1, fontSize: "12px", lineHeight: "1.5" } },
                    "如果这个插件对你的日常研发有帮助，欢迎到 GitHub 仓库点个 Star 支持一下——你的 Star 是持续迭代的动力！也欢迎提交 Issue 与 PR。"
                  ),
                  h("a", {
                    href: "https://github.com/ItQianChen/dsh-github-flow",
                    target: "_blank",
                    rel: "noopener noreferrer",
                    className: "dsh-github-btn-sm dsh-github-primary-btn",
                  }, "🌟 去点 Star")
                )
              ) : h("div", null,
                // 🌐 网络代理分区：设置保存即全局生效（驾驶舱/右侧栏/Agent 工具/升级链路），
                // 未启用时回落系统环境代理或直连（「默认走系统设置」语义）。
                h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginBottom: "14px", lineHeight: "1.5" } },
                  "设置后插件的 GitHub 数据链路（本页面、右侧栏、Agent 工具调用、版本升级）全部经代理访问；未启用时默认使用系统环境代理或直连。保存后立即生效，无需重启。"
                ),
            h("label", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", cursor: "pointer", fontSize: "13px" } },
              h("input", {
                type: "checkbox",
                checked: proxyEnabled,
                onChange: function (e: any) { setProxyEnabled(Boolean(e.target.checked)); },
              }),
              "启用代理"
            ),
            proxyEnabled ? h("div", null,
              h("div", { style: { fontSize: "12px", marginBottom: "4px" } }, "代理地址"),
              h("input", {
                className: "dsh-github-input",
                style: { width: "100%", boxSizing: "border-box", padding: "6px 10px", fontSize: "13px", marginBottom: "10px" },
                placeholder: "http://127.0.0.1:7890 或 socks5h://127.0.0.1:1080（DNS 由代理解析）",
                value: proxyUrl,
                onChange: function (e: any) { setProxyUrl(e.target.value); },
              }),
              h("div", { style: { fontSize: "12px", marginBottom: "4px" } }, "NO_PROXY 排除列表（逗号分隔，localhost 与 127.0.0.1 强制包含）"),
              h("input", {
                className: "dsh-github-input",
                style: { width: "100%", boxSizing: "border-box", padding: "6px 10px", fontSize: "12px", marginBottom: "10px" },
                value: proxyNoProxy,
                onChange: function (e: any) { setProxyNoProxy(e.target.value); },
              }),
              h("label", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", cursor: "pointer", fontSize: "12px" } },
                h("input", {
                  type: "checkbox",
                  checked: proxyApplyNpm,
                  onChange: function (e: any) { setProxyApplyNpm(Boolean(e.target.checked)); },
                }),
                "同时应用于 npm 版本探测与一键升级"
              )
            ) : null,
            // 操作与反馈行：探测/保存按钮 + 结果胶囊
            h("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } },
              h("button", {
                className: "dsh-github-btn-sm",
                style: { padding: "5px 12px", fontSize: "12px" },
                disabled: proxyBusy || !proxyEnabled,
                onClick: handleProxyProbe,
                title: "经当前配置探测 GitHub API 连通性（约 2.5 秒）",
              }, "🧪 测试连通性"),
              h("button", {
                className: "dsh-github-btn-sm",
                style: {
                  padding: "5px 14px",
                  fontSize: "12px",
                  background: "var(--dsw-alias-link, #0969da)",
                  color: "#ffffff",
                  borderColor: "var(--dsw-alias-link, #0969da)",
                  fontWeight: 600,
                },
                disabled: proxyBusy,
                onClick: handleProxySave,
              }, proxyBusy ? "处理中..." : "💾 保存并全局应用"),
              proxyProbe ? h("span", {
                style: {
                  fontSize: "12px",
                  fontWeight: 500,
                  color: proxyProbe.ok ? "var(--dsw-alias-state-success, #2ea043)" : "var(--dsw-alias-state-error-primary, #cf222e)",
                },
                title: proxyProbe.error || "",
              }, proxyProbe.ok ? "✅ " + proxyProbe.latencyMs + "ms" : "❌ 探测失败") : null
            ),
            proxyMsg ? h("div", {
              style: {
                marginTop: "8px",
                fontSize: "12px",
                lineHeight: "1.5",
                color: proxyMsg.kind === "ok"
                  ? "var(--dsw-alias-state-success, #2ea043)"
                  : proxyMsg.kind === "err"
                    ? "var(--dsw-alias-state-error-primary, #cf222e)"
                    : "var(--dsw-alias-label-secondary, #656d76)",
              },
            }, proxyMsg.text) : null
              )
            )
          ),
          // 底部操作条：sync 分区提供主保存动作；proxy/update 分区有自己的「保存并全局应用」，
          // 底部统一为「完成」关闭弹窗，避免多个保存按钮的语义冲突。
          h("div", { className: "dsh-github-modal-footer" },
            activeSection === "sync" ? h("button", {
              className: "dsh-github-btn-sm",
              style: {
                padding: "6px 16px",
                background: "var(--dsw-alias-link, #0969da)",
                color: "#ffffff",
                borderColor: "var(--dsw-alias-link, #0969da)",
                fontWeight: 600,
              },
              onClick: handleSave,
            }, "保存同步设置") : null,
            h("button", {
              className: "dsh-github-btn-sm",
              style: { padding: "6px 14px" },
              onClick: props.onClose,
            }, activeSection === "sync" ? "取消" : "完成")
          )
        )
      );
    }

    function GithubWorkspacePanel() {
      // 1. 读取本地偏好配置与历史持久化快照 (0ms 纯内存读取)
      var initialSettings = React.useMemo(() => getLocalSyncSettings(), []);
      var initialSnapshot = React.useMemo(() => getStoredGlobalOverview(), []);

      var [syncSettings, setSyncSettings] = React.useState(initialSettings);
      var [data, setData] = React.useState(initialSnapshot?.data || null);
      var [loading, setLoading] = React.useState(!initialSnapshot);
      var [syncStatus, setSyncStatus] = React.useState(initialSnapshot ? "cached" : "loading");
      var [lastSyncedAt, setLastSyncedAt] = React.useState(initialSnapshot?.savedAt || 0);
      // 弹窗开闭 + 初始分区分离：插件徽标点击直开「关于」分区（initialSection=about），
      // 而齿轮按钮仍默认打开「数据同步」——同一弹窗两种入口语义。
      var [isSettingsModalOpen, setIsSettingsModalOpen] = React.useState(false);
      var [settingsInitialSection, setSettingsInitialSection] = React.useState("sync");
      var [error, setError] = React.useState(null as string | null);
      var [updateInfo, setUpdateInfo] = React.useState(null as any);
      var [activeTab, setActiveTab] = React.useState("workspaces"); // 'workspaces' | 'repos' | 'mywork'
      var [searchQuery, setSearchQuery] = React.useState("");
      var [issueFilter, setIssueFilter] = React.useState("all"); // 'all' | 'reported' | 'assigned' | 'created'
      var [toastMsg, setToastMsg] = React.useState(null as string | null);

      var showToast = (msg: string) => {
        setToastMsg(msg);
        setTimeout(() => setToastMsg(null), 5000);
      };

      // 代理生效状态（标题栏 🌐 徽章数据源）：挂载时读一次 + 弹窗关闭时刷新
      //（保存发生在弹窗内，关闭时机足以让徽章与最新配置对齐，无需轮询）
      var [proxyActive, setProxyActive] = React.useState(null as { enabled: boolean; url: string } | null);

      var refreshProxyBadge = React.useCallback(function () {
        fetch("/api/github/proxy")
          .then(function (r: any) { return r.json(); })
          .then(function (j: any) {
            if (j && j.ok && j.state && j.state.config) {
              setProxyActive({ enabled: Boolean(j.state.config.url), url: j.state.config.url || "" });
            } else {
              setProxyActive({ enabled: false, url: "" });
            }
          })
          .catch(function () {});
      }, []);

      React.useEffect(function () { refreshProxyBadge(); }, [refreshProxyBadge]);

      // 检查更新与 gh 业务数据零依赖，挂载即并行发起（与右侧栏同策略）：
      // 并发由服务端 inFlightPromise + 24h 缓存合流去重，无请求风暴风险。
      React.useEffect(() => {
        var timer = setTimeout(function () {
          fetch("/api/github/check-update")
            .then(function (res) { return res.json(); })
            .then(function (json) {
              if (json && json.ok && json.data) {
                setUpdateInfo(json.data);
              }
            })
            .catch(function () {});
        }, 300);
        return function () { clearTimeout(timer); };
      }, []);

      // 插件徽标事件：标题上的「插件」徽标点击 → 直开设置弹窗的「关于」分区。
      // 可见性守卫：右侧栏与主页可能同挂载，只有自身容器可见的宿主响应（防双层弹窗）。
      var panelRef = React.useRef(null as any);
      React.useEffect(() => {
        var onOpenAbout = () => {
          var el = panelRef.current;
          if (!el) return;
          var rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            setSettingsInitialSection("about");
            setIsSettingsModalOpen(true);
          }
        };
        var onOpenProxy = () => {
          var el = panelRef.current;
          if (!el) return;
          var rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            setSettingsInitialSection("proxy");
            setIsSettingsModalOpen(true);
          }
        };
        window.addEventListener("dsh-github-open-about", onOpenAbout);
        window.addEventListener("dsh-github-open-proxy", onOpenProxy);
        return () => {
          window.removeEventListener("dsh-github-open-about", onOpenAbout);
          window.removeEventListener("dsh-github-open-proxy", onOpenProxy);
        };
      }, []);

      // 齿轮按钮：默认打开「数据同步」分区（既有语义不变）
      var openSettingsDefault = () => {
        setSettingsInitialSection("sync");
        setIsSettingsModalOpen(true);
      };

      var loadData = React.useCallback(async (forceRefresh = false) => {
        // 如果是纯手动模式，且非显式强制刷新，且本地已有旧数据，直接跳过后台拉取
        if (!forceRefresh && syncSettings.strategy === "manual" && data) {
          return;
        }

        setLoading(true);
        setSyncStatus(data ? "syncing" : "loading");
        setError(null);

        var controller = new AbortController();
        var timedOut = false;
        var timer = setTimeout(function () { timedOut = true; controller.abort(); }, 45000);
        try {
          if (forceRefresh) await fetch("/api/github/refresh", { method: "POST", signal: controller.signal }).catch(() => {});
          var url = "/api/github/global-overview";
          if (forceRefresh) {
            url += "?force=true";
          }
          var res = await fetch(url, { signal: controller.signal });
          if (!res.ok) {
            var errText = await res.text().catch(() => "");
            var failMsg = `获取全局数据失败（HTTP ${res.status}）${errText ? ": " + errText : ""}`;
            setSyncStatus("failed");
            setError(failMsg);
            if (forceRefresh) showToast("❌ 刷新失败：" + failMsg);
            return;
          }
          var json = await res.json();
          if (json.ok && json.data) {
            var isFail = Boolean(
              json.partialFailure ||
              json.data.partialFailure ||
              json.data.networkError ||
              json.data.auth?.networkError ||
              json.error
            );
            var failReason = String(
              json.error ||
              json.fetchError ||
              json.data.networkErrorReason ||
              json.data.auth?.networkErrorReason ||
              "拉取全局数据失败"
            );

            if (isFail) {
              setSyncStatus("failed");
              setError(failReason);
              if (data && (data.userRepos?.length > 0 || data.myPrs?.length > 0 || data.myIssues?.length > 0)) {
                if (json.data.userRepos?.length > 0 || json.data.myPrs?.length > 0) {
                  setData(json.data);
                }
              } else {
                setData(json.data);
              }
              if (forceRefresh) showToast("❌ 刷新失败：" + failReason);
            } else {
              setData(json.data);
              saveStoredGlobalOverview(json.data); // 写入持久化快照
              var syncTs = json.fromCache && json.data.lastUpdated
                ? (Date.parse(json.data.lastUpdated) || Date.now())
                : Date.now();
              setLastSyncedAt(syncTs);
              setSyncStatus(json.fromCache ? "cached" : "fresh");
              setError(null);
              if (forceRefresh) showToast("✅ 刷新成功，已同步最新数据");
            }

            if (json.data.updateInfo) {
              setUpdateInfo(json.data.updateInfo);
            }
            if (json.data.workspaceError) {
              setError("工作区列表读取失败：" + json.data.workspaceError);
            }
          } else {
            setSyncStatus("failed");
            var errPayload = String(json?.error || "获取全局数据失败");
            setError(errPayload);
            if (forceRefresh) showToast("❌ 刷新失败：" + errPayload);
          }
        } catch (err: any) {
          setSyncStatus("failed");
          var failReason = (timedOut || err.name === "AbortError")
            ? "获取超时（45 秒）：本机 gh 命令响应过慢或网络代理劫持了回环请求。可稍后重试，或在「⚙️ 设置 → 🌐 网络代理」确认代理已放行 127.0.0.1。"
            : ("无法连接后端服务：" + (err.message || err));
          setError(failReason);
          if (forceRefresh) showToast("❌ 刷新失败：" + failReason);
        } finally {
          clearTimeout(timer);
          setLoading(false);
        }
      }, [data, syncSettings]);

      // 挂载加载调度：SWR 模式下初次延迟 300ms 后台平滑发起静默同步。
      // 无论本地是否有旧快照都拉：昨天的持久化快照在挂载后 300ms 内自愈，
      // 「打开驾驶舱即新鲜」由 SWR 定义本身保证，而非依赖用户停留或手动刷新。
      React.useEffect(() => {
        if (syncSettings.strategy === "swr") {
          var timer = setTimeout(function () { loadData(false); }, 300);
          return function () { clearTimeout(timer); };
        } else if (!data) {
          loadData(false);
        }
      }, [syncSettings.strategy]);

      // （原定时轮询调度已随 'interval' 策略一并移除）

      // 窗口切回自动探测自愈：优先轻量快速探针，检测到已登录立即自愈
      React.useEffect(() => {
        var onFocus = () => {
          if (!data?.auth?.loggedIn) {
            fetch("/api/github/auth?force=true")
              .then(function (res) { return res.json(); })
              .then(function (json) {
                if (json && json.ok && json.auth && json.auth.loggedIn) {
                  clearStoredGlobalOverview();
                  loadData(true);
                }
              })
              .catch(function () {});
          }
        };
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
      }, [data, loadData]);

      var h = React.createElement;

      var headerEl = h(
        "div",
        { className: "dsh-github-header" },
        h(
          "div",
          { className: "dsh-github-title" },
          renderOctocatBadge(32),
          h("h2", null, "GitHub 全景驾驶舱"),
          renderPluginBadge(h),
          h(SyncStatusBadge, { syncStatus, lastSyncedAt }),
          // 代理生效徽章：启用时可见，hover 展示代理地址，让用户随时确认「当前确实在走代理」
          proxyActive && proxyActive.enabled
            ? h("span", {
                style: {
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "11px",
                  fontWeight: 500,
                  padding: "2px 8px",
                  borderRadius: "999px",
                  background: "rgba(9, 105, 218, 0.1)",
                  border: "1px solid rgba(9, 105, 218, 0.35)",
                  color: "var(--dsw-alias-link, #0969da)",
                  cursor: "default",
                },
                title: "插件网络代理已启用: " + proxyActive.url + "（GitHub 数据链路与工具调用经此代理；点击 ⚙️ 可修改）",
              }, "🌐 代理")
            : null
        ),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px" } },
          h(
            "button",
            {
              className: "dsh-github-refresh-btn",
              onClick: () => loadData(true),
              disabled: loading,
            },
            loading ? "同步中..." : "🔄 刷新全局数据"
          ),
          h(
            "button",
            {
              className: "dsh-github-btn-sm",
              onClick: openSettingsDefault,
              title: "配置数据同步节奏、本地缓存、网络代理与插件信息",
              style: { padding: "6px 12px" },
            },
            "⚙️ 设置"
          )
        )
      );

      if (loading && !data) {
        return h("div", { className: "dsh-github-panel", ref: panelRef }, headerEl, h("div", { className: "dsh-github-empty" }, "正在加载全局 GitHub 账号与工作区数据..."));
      }

      var effectiveUpdateInfo = updateInfo || data?.updateInfo;
      var upgradeBannerEl = effectiveUpdateInfo && effectiveUpdateInfo.hasUpdate
        ? h(UpgradeNotificationCard, { updateInfo: effectiveUpdateInfo, isRightbar: false })
        : null;

      var settingsModalEl = h(GlobalSyncSettingsModal, {
        isOpen: isSettingsModalOpen,
        initialSection: settingsInitialSection,
        onClose: () => {
          setIsSettingsModalOpen(false);
          // 弹窗内可能刚保存过代理配置，关闭时同步刷新标题栏徽章
          refreshProxyBadge();
        },
        currentSettings: syncSettings,
        onSave: (newSettings: any) => {
          setSyncSettings(newSettings);
        },
        onClearCache: () => {
          setSyncStatus("loading");
          setData(null);
          setLastSyncedAt(0);
        },
      });

      // 错误拦截阻断：若无本地数据且请求失败，直接呈现错误卡片，杜绝把接口异常伪装成「未安装 CLI」
      if (!data && error) {
        return h(
          "div",
          { className: "dsh-github-panel", ref: panelRef },
          headerEl,
          upgradeBannerEl,
          h(
            "div",
            {
              style: {
                padding: "24px",
                borderRadius: "8px",
                background: "rgba(248, 81, 73, 0.08)",
                border: "1px solid rgba(248, 81, 73, 0.3)",
                margin: "16px 0",
                textAlign: "center",
              },
            },
            h("div", { style: { fontSize: "16px", fontWeight: 600, color: "#f85149", marginBottom: "8px" } }, "⚠️ 后端服务加载异常"),
            h("div", { style: { fontSize: "13px", color: "var(--dsw-alias-label-secondary, #656d76)", marginBottom: "16px" } }, error),
            h(
              "button",
              {
                className: "dsh-github-btn-sm",
                onClick: () => loadData(true),
                style: { padding: "6px 18px", background: "var(--dsw-alias-link, #0969da)", color: "#ffffff", borderColor: "var(--dsw-alias-link, #0969da)" },
              },
              "🔄 重新请求"
            )
          ),
          settingsModalEl
        );
      }

      var auth = data ? data.auth : null;
      var userRepos = (data && data.userRepos) || [];
      var workspaceMatrix = (data && data.workspaceMatrix) || [];
      var myPrs = (data && data.myPrs) || [];
      var myIssues = (data && data.myIssues) || [];

      var errorEl = error ? h("div", { style: { color: "#f85149", background: "rgba(248,81,73,0.1)", border: "1px solid rgba(248,81,73,0.3)", padding: "8px 12px", borderRadius: "6px", marginBottom: "16px", fontSize: "12px" } }, `⚠️ 加载失败: ${error}`) : null;

      // 顶部统计卡片
      var statsCardsEl = h(
        "div",
        { className: "dsh-github-overview-cards" },
        h(
          "div",
          { className: "dsh-github-card" },
          h("div", { className: "dsh-github-card-title" }, "CLI 认证账号"),
          h(
            "div",
            { className: "dsh-github-card-value" },
            auth?.networkError
              ? (auth.user ? `👤 ${auth.user} (离线)` : "🌐 网络连接受限")
              : auth?.loggedIn
                ? `👤 ${auth.user}`
                : !auth?.installed
                  ? "❌ 未安装 CLI"
                  : "⚠️ 未登录",
            auth?.networkError
              ? h("span", { className: "dsh-github-badge dsh-badge-yellow" }, "Offline")
              : auth?.loggedIn
                ? h("span", { className: "dsh-github-badge dsh-badge-green" }, "Active")
                : !auth?.installed
                  ? h("span", { className: "dsh-github-badge dsh-badge-red" }, "Missing")
                  : h("span", { className: "dsh-github-badge dsh-badge-yellow" }, "Required")
          )
        ),
        h(
          "div",
          { className: "dsh-github-card" },
          h("div", { className: "dsh-github-card-title" }, "账号云端仓库"),
          h("div", { className: "dsh-github-card-value" }, `${userRepos.length} 个 Repositories`)
        ),
        h(
          "div",
          { className: "dsh-github-card" },
          h("div", { className: "dsh-github-card-title" }, "本地工作区联动"),
          h("div", { className: "dsh-github-card-value" }, `${workspaceMatrix.length} 个工作区 (${workspaceMatrix.filter((w: any) => w.repo).length} 个已关联)`)
        ),
        // 待办概览卡：issueStats 三分类（数据已有零成本）——第一屏直接呈现工作量，
        // 无待办时正向反馈「无待办 ✓」而非空白
        h(
          "div",
          { className: "dsh-github-card" },
          h("div", { className: "dsh-github-card-title" }, "📥 待处理 Issues"),
          (data && data.issueStats && (data.issueStats.reported || data.issueStats.assigned || data.issueStats.created))
            ? h("div", { className: "dsh-github-card-value", style: { fontSize: "14px" } },
                `📥 用户提单 ${data.issueStats.reported || 0} · 🎯 分配给我 ${data.issueStats.assigned || 0} · ✍️ 我创建 ${data.issueStats.created || 0}`)
            : h("div", { className: "dsh-github-card-value" }, "无待办 ✓")
        )
      );

      // 安装与登录引导组件（未登录且无网络错误时显式展开；网络错误时由上方 NetworkAlertBanner 统一承接）
      var authGuideEl = (!auth?.loggedIn && !auth?.networkError && syncStatus !== "failed")
        ? h(AuthGuideCard, { auth, onRefresh: () => loadData(true), isRightbar: false })
        : null;

      // Tab 栏
      var tabsEl = h(
        "div",
        { className: "dsh-github-tabs" },
        h("button", { className: `dsh-github-tab-btn ${activeTab === 'workspaces' ? 'active' : ''}`, onClick: () => setActiveTab('workspaces') }, `📂 本地工作区矩阵 (${workspaceMatrix.length})`),
        h("button", { className: `dsh-github-tab-btn ${activeTab === 'repos' ? 'active' : ''}`, onClick: () => setActiveTab('repos') }, `☁️ 我的 GitHub 仓库 (${userRepos.length})`),
        h("button", { className: `dsh-github-tab-btn ${activeTab === 'mywork' ? 'active' : ''}`, onClick: () => setActiveTab('mywork') }, `📋 任务与待办 (PR: ${myPrs.length} · Issue: ${myIssues.length})`)
      );

      // 内容区
      var contentEl = null;

      if (activeTab === 'workspaces') {
        contentEl = h(
          "div",
          { className: "dsh-github-list" },
          workspaceMatrix.map((ws: any) =>
            h(
              "div",
              { key: ws.id, className: "dsh-github-card dsh-github-workspace-card" },
              h(
                "div",
                { style: { display: "flex", flexDirection: "column", gap: "4px" } },
                h("div", { className: "dsh-github-ws-title" }, ws.title),
                h("div", { className: "dsh-github-ws-path" }, ws.path),
                h(
                  "div",
                  { style: { fontSize: "12px", marginTop: "4px", display: "flex", gap: "8px", alignItems: "center" } },
                  ws.repo
                    ? h("span", { className: "dsh-github-ws-repo-link" }, renderOctocat(13, "currentColor"), `关联远程: ${ws.repo.nameWithOwner} (${ws.repo.defaultBranch})`)
                    : h("span", { className: "dsh-github-ws-path" }, ws.hasGit ? "本地有 Git，未关联 GitHub 远程" : "本地无 Git 仓库"),
                  ws.repo ? h("span", { className: "dsh-github-badge dsh-badge-green" }, "已关联") : null
                ),
                // git 本地状态摘要（ahead/behind 快照语义 + dirty；探测失败/非 Git 不渲染）
                ws.gitStatus
                  ? h(
                      "div",
                      {
                        style: { fontSize: "11px", display: "flex", gap: "8px", alignItems: "center", opacity: 0.85 },
                        title: "ahead/behind 相对上次 git fetch 的快照（非实时）",
                      },
                      h("span", { style: { display: "inline-flex", alignItems: "center", gap: "4px" } }, renderGitIcon(12, "#1296db"), ws.gitStatus.branch),
                      ws.gitStatus.hasUpstream
                        ? h("span", null, `${ws.gitStatus.ahead > 0 ? "↑" + ws.gitStatus.ahead + " " : ""}${ws.gitStatus.behind > 0 ? "↓" + ws.gitStatus.behind : ""}${ws.gitStatus.ahead === 0 && ws.gitStatus.behind === 0 ? "✓ 同步" : ""}`)
                        : h("span", null, "↑? ↓?"),
                      ws.gitStatus.dirtyCount > 0
                        ? h("span", null, `${ws.gitStatus.dirtyCount} 文件未提交`)
                        : h("span", null, "干净")
                    )
                  : null,
                ws.gitStatus && ws.gitStatus.dirtyFiles && ws.gitStatus.dirtyFiles.length > 0
                  ? h(
                      "details",
                      { style: { fontSize: "11px" } },
                      h("summary", { style: { cursor: "pointer", opacity: 0.8 } }, `未提交清单（${ws.gitStatus.dirtyFiles.length}）`),
                      h(
                        "div",
                        { style: { padding: "4px 8px", borderRadius: "6px", background: "var(--dsw-alias-bg-module-platform, #f6f8fa)", lineHeight: "1.6", marginTop: "4px" } },
                        ws.gitStatus.dirtyFiles.map(function (f: any, i: number) {
                          return h("div", { key: i }, h("span", { style: { opacity: 0.7, marginRight: "6px" } }, f.status === "??" ? "??" : f.status), f.path);
                        })
                      )
                    )
                  : null
              ),
              h(
                "div",
                { style: { display: "flex", gap: "8px" } },
                ws.repo
                  ? h("a", { className: "dsh-github-btn-sm", href: ws.repo.url, target: "_blank" }, "在 GitHub 打开")
                  : null
              )
            )
          )
        );
      } else if (activeTab === 'repos') {
        if (!auth?.loggedIn) {
          contentEl = h("div", { className: "dsh-github-empty" }, "当前尚未认证登录 GitHub 账号，无法读取云端仓库列表。请先完成上方的安装或登录指引。");
        } else {
          var filteredRepos = userRepos.filter((r: any) => !searchQuery || r.nameWithOwner.toLowerCase().includes(searchQuery.toLowerCase()) || r.description?.toLowerCase().includes(searchQuery.toLowerCase()));
          contentEl = h(
            "div",
            null,
            h("input", {
              className: "dsh-github-search-input",
              placeholder: "🔍 搜索我的 GitHub 仓库...",
              value: searchQuery,
              onChange: (e: any) => setSearchQuery(e.target.value)
            }),
            h(
              "div",
              { className: "dsh-github-list" },
              filteredRepos.map((r: any) =>
                h(
                  "div",
                  { key: r.nameWithOwner, className: "dsh-github-item" },
                  h("a", { className: "dsh-github-item-title", href: r.url, target: "_blank" }, r.nameWithOwner),
                  r.description ? h("div", { className: "dsh-github-item-desc" }, r.description) : null,
                  h(
                    "div",
                    { className: "dsh-github-item-meta" },
                    h("span", null, `默认分支: ${r.defaultBranch}`),
                    r.isPrivate ? h("span", { className: "dsh-github-badge dsh-badge-yellow" }, "Private") : h("span", { className: "dsh-github-badge dsh-badge-green" }, "Public"),
                    h("span", null, `⭐ ${r.stargazerCount}`),
                    formatRelativeTime(r.updatedAt)
                      ? h("span", { title: `更新于 ${r.updatedAt}` }, `活跃于 ${formatRelativeTime(r.updatedAt)}`)
                      : null
                  )
                )
              )
            )
          );
        }
      } else {
        if (!auth?.loggedIn) {
          contentEl = h("div", { className: "dsh-github-empty" }, "当前尚未认证登录 GitHub 账号，无法读取个人待办 PR 与 Issues。请先完成上方的安装或登录指引。");
        } else {
          var issueStats = (data && data.issueStats) || {
            total: myIssues.length,
            reported: myIssues.filter((i: any) => (i.categories || []).includes('reported')).length,
            assigned: myIssues.filter((i: any) => (i.categories || []).includes('assigned')).length,
            created: myIssues.filter((i: any) => (i.categories || []).includes('created')).length,
          };

          var filteredIssues = myIssues.filter((is: any) => {
            if (issueFilter === 'all') return true;
            var cats = is.categories || [];
            return cats.includes(issueFilter);
          });

          var issuePillsEl = h(
            "div",
            { className: "dsh-github-pills" },
            h(
              "button",
              {
                className: `dsh-github-pill-btn ${issueFilter === 'all' ? 'active' : ''}`,
                onClick: () => setIssueFilter('all'),
              },
              `全部 (${issueStats.total || myIssues.length})`
            ),
            h(
              "button",
              {
                className: `dsh-github-pill-btn ${issueFilter === 'reported' ? 'active' : ''}`,
                onClick: () => setIssueFilter('reported'),
              },
              `📥 用户提起的 (${issueStats.reported || 0})`
            ),
            h(
              "button",
              {
                className: `dsh-github-pill-btn ${issueFilter === 'assigned' ? 'active' : ''}`,
                onClick: () => setIssueFilter('assigned'),
              },
              `🎯 分配给我的 (${issueStats.assigned || 0})`
            ),
            h(
              "button",
              {
                className: `dsh-github-pill-btn ${issueFilter === 'created' ? 'active' : ''}`,
                onClick: () => setIssueFilter('created'),
              },
              `✍️ 我创建的 (${issueStats.created || 0})`
            )
          );

          contentEl = h(
            "div",
            null,
            h("h3", { className: "dsh-github-subheading" }, `🔀 我发起的 PR (${myPrs.length})`),
            myPrs.length === 0 ? h("div", { className: "dsh-github-empty", style: { marginBottom: "16px" } }, "暂无开放中的 PR") : h(
              "div",
              { className: "dsh-github-list", style: { marginBottom: "16px" } },
              myPrs.map((pr: any) => h(
                "div",
                { key: pr.number, className: "dsh-github-item", style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } },
                h("a", {
                  className: "dsh-github-item-title",
                  href: pr.url,
                  target: "_blank",
                  title: pr.updatedAt ? `更新于 ${pr.updatedAt}` : undefined,
                }, `${pr.isDraft ? "⚪ " : ""}[${pr.repository?.nameWithOwner || 'Repo'}] #${pr.number} ${pr.title}`),
                pr.isDraft ? h("span", { className: "dsh-github-badge dsh-badge-yellow" }, "DRAFT") : null,
                formatRelativeTime(pr.updatedAt)
                  ? h("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #656d76)", whiteSpace: "nowrap" } }, formatRelativeTime(pr.updatedAt))
                  : null
              ))
            ),
            h("h3", { className: "dsh-github-subheading" }, `📝 任务与待办 Issues (${filteredIssues.length})`),
            issuePillsEl,
            filteredIssues.length === 0 ? h("div", { className: "dsh-github-empty" }, "当前分类下暂无开放中的 Issue") : h(
              "div",
              { className: "dsh-github-list" },
              filteredIssues.map((is: any) => {
                var cats = is.categories || [];
                var badges: any[] = [];
                if (cats.includes("reported")) {
                  badges.push(h("span", { key: "rep", className: "dsh-github-badge dsh-badge-purple" }, "用户提单"));
                }
                if (cats.includes("assigned")) {
                  badges.push(h("span", { key: "asn", className: "dsh-github-badge dsh-badge-blue" }, "分配待办"));
                }
                if (cats.includes("created")) {
                  badges.push(h("span", { key: "crt", className: "dsh-github-badge dsh-badge-green" }, "我发起的"));
                }

                return h(
                  "div",
                  { key: is.url || is.number, className: "dsh-github-item" },
                  h(
                    "div",
                    { style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" } },
                    h(
                      "a",
                      { className: "dsh-github-item-title", href: is.url, target: "_blank" },
                      `[${is.repository?.nameWithOwner || 'Repo'}] #${is.number} ${is.title}`
                    ),
                    ...badges
                  ),
                  h(
                    "div",
                    { className: "dsh-github-item-meta" },
                    is.author ? h("span", null, `由 @${is.author.login} 提出`) : null,
                    is.assignees && is.assignees.length > 0
                      ? h("span", null, `指派: ${is.assignees.map((a: any) => '@' + a.login).join(', ')}`)
                      : null,
                    is.labels && is.labels.length > 0
                      ? is.labels.map((lbl: any) => h("span", { key: lbl.name, className: "dsh-github-badge dsh-badge-yellow" }, lbl.name))
                      : null,
                    is.updatedAt ? h("span", null, `更新于: ${new Date(is.updatedAt).toLocaleDateString()}`) : null
                  )
                );
              })
            )
          );
        }
      }

      var toastEl = toastMsg
        ? h(
            "div",
            {
              style: {
                padding: "8px 12px",
                marginBottom: "12px",
                borderRadius: "6px",
                fontSize: "12px",
                background: toastMsg.startsWith("✅") ? "rgba(46, 160, 67, 0.15)" : "rgba(207, 34, 46, 0.15)",
                color: toastMsg.startsWith("✅") ? "var(--dsw-alias-state-success, #2ea043)" : "var(--dsw-alias-state-error-primary, #cf222e)",
                border: "1px solid " + (toastMsg.startsWith("✅") ? "rgba(46, 160, 67, 0.35)" : "rgba(207, 34, 46, 0.35)"),
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
              },
            },
            h("span", null, toastMsg),
            h("button", { onClick: () => setToastMsg(null), style: { background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: "14px" } }, "✕")
          )
        : null;

      var networkAlertBannerEl = (syncStatus === "failed" || auth?.networkError || (error && data))
        ? h(NetworkAlertBanner, {
            isRightbar: false,
            networkErrorReason: auth?.networkErrorReason || error || "连接 GitHub API 超时或网络不可达，本次未能获取最新数据。",
            lastSyncedAt,
            onRefresh: () => loadData(true),
            onOpenProxy: function () {
              setSettingsInitialSection("proxy");
              setIsSettingsModalOpen(true);
            },
          })
        : null;

      return h(
        "div",
        { className: "dsh-github-panel", ref: panelRef },
        toastEl,
        headerEl,
        networkAlertBannerEl,
        upgradeBannerEl,
        errorEl,
        statsCardsEl,
        authGuideEl,
        tabsEl,
        contentEl,
        settingsModalEl
      );
    }

    var inject = ["slots", "sidebarRightTabs", "sessions", "layout", "theme"];

    function apply(ctx: any) {
      // 彻底清理历史在界面底部错位遗留的 DOM 元素
      if (typeof window !== "undefined" && window.document) {
        var sweep = () => {
          document.querySelectorAll(".dsh-github-right-card, .dsh-github-mounted-card, #dsh-github-floating-drawer").forEach((el) => el.remove());
        };
        sweep();
        setTimeout(sweep, 300);
        setTimeout(sweep, 1500);
      }

      if (ctx.effect) {
        ctx.effect(() => injectStyles(), "github: styles");
      } else {
        injectStyles();
      }

      if (ctx.on) {
        ctx.on("theme/change", () => {
          injectStyles();
        });
      }

      // A. 原生接入 DSH 右侧栏 Tab 体系 (sidebarRightTabs)
      // 这会让 GitHub 仓库自动、原生出现在“开始”引导页上（排在浏览器下方，无任何错位代码！）
      if (ctx.sidebarRightTabs && typeof ctx.sidebarRightTabs.register === "function") {
        ctx.effect(() => {
          return ctx.sidebarRightTabs.register({
            id: "dsh-github-flow",
            kind: "github",
            priority: "plugin",
            // 标题保持简洁，身份由面板内徽标标注（Tab 体系不支持内嵌徽标元素）
            title: () => "GitHub 仓库",
            guide: [
              {
                id: "workspace.github",
                commandId: "workspace.github",
                order: 40,
                title: () => "GitHub 仓库",
                description: () => "查看与操作当前工作区目录下的 GitHub 仓库（由 dsh-github-flow 插件提供）",
                icon: GithubArtwork,
              },
            ],
          });
        }, "github: sidebar right tab definition");
      }

      // B. 注册右侧栏的真实 Tab 内容与标题 (sidebar.right.pane.tab)
      if (ctx.slots) {
        ctx.slots.inject("sidebar.right.pane.tab", () => {
          return ctx.slots.register({
            name: "sidebar.right.pane.tab",
            key: "dsh-github-flow",
          }, GithubRightbarBody);
        });

        ctx.slots.inject("sidebar.right.pane.tab.title", () => {
          return ctx.slots.register({
            name: "sidebar.right.pane.tab.title",
            key: "dsh-github-flow",
          }, GithubRightbarTitle);
        });

        // C. 保留左侧栏导航与中央大面板（双向可达）
        ctx.slots.inject("sidebar.panellist", () => {
          return ctx.slots.register({
            name: "sidebar.panellist",
            id: "github",
            order: 20,
            label: "GitHub",
          }, GithubSidebarIcon);
        });

        ctx.slots.inject("main", () => {
          return ctx.slots.register({
            name: "main",
            key: "github",
          }, GithubWorkspacePanel);
        });
      }
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.name = "dsh-github-flow";

    return module.exports;
  }
});

export {};