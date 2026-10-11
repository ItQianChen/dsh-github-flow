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

/* 16. 数据同步设置弹窗 (Sync Settings Modal) */
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
  width: 90%;
  max-width: 480px;
  background: var(--dsw-alias-bg-base, #ffffff);
  border: 1px solid var(--dsw-alias-border-l2, #d0d7de);
  border-radius: 12px;
  box-shadow: 0 16px 32px rgba(0, 0, 0, 0.18);
  padding: 24px;
  box-sizing: border-box;
  color: var(--dsw-alias-label-primary, #1f2328);
  font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
}
body[data-ds-dark-theme] .dsh-github-modal-dialog {
  background: var(--dsw-alias-bg-layer-2, #1e1e22);
  border-color: var(--dsw-alias-border-l1, #30363d);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.45);
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

/* 单选框点强调色 */
.dsh-github-radio {
  accent-color: var(--dsw-alias-link, #0969da);
  cursor: pointer;
  margin-top: 3px;
}
body[data-ds-dark-theme] .dsh-github-radio {
  accent-color: #58a6ff;
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

    // 认证与安装引导卡片组件（响应式自适应中央大面板与右侧栏）
    function AuthGuideCard(props: any) {
      var auth = props ? props.auth : null;
      var onRefresh = props ? props.onRefresh : () => {};
      var isRightbar = Boolean(props && props.isRightbar);

      var [copied, setCopied] = React.useState(false);
      var [launching, setLaunching] = React.useState(false);
      var [toastMsg, setToastMsg] = React.useState(null as string | null);

      var notInstalled = !auth?.installed;
      var guide = auth?.installGuide;
      var defaultCmd = notInstalled
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
            setToastMsg("已唤起系统终端，请在弹出窗口中完成操作");
            setTimeout(() => setToastMsg(null), 4000);
          } else {
            setToastMsg(json.message || "唤起失败，请在终端手动运行");
          }
        } catch (e) {
          setToastMsg("无法连接后台服务，请在终端手动运行");
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

      var h = React.createElement;

      return h(
        "div",
        {
          className: "dsh-github-guide-card " + (notInstalled ? "danger" : "warning"),
          style: isRightbar ? { padding: "12px", marginBottom: "12px" } : undefined
        },
        // 头部
        h(
          "div",
          { className: "dsh-github-guide-header" },
          notInstalled ? "⚠️ 未检测到 GitHub CLI (gh)" : "🔑 GitHub 账号尚未登录",
          h(
            "span",
            { className: "dsh-github-badge " + (notInstalled ? "dsh-badge-red" : "dsh-badge-yellow") },
            notInstalled ? "未安装" : "未认证"
          )
        ),
        // 描述
        h(
          "div",
          { className: "dsh-github-guide-desc" },
          notInstalled
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
          ? h(
              "ol",
              { className: "dsh-github-steps-list" },
              h("li", null, "打开系统终端（PowerShell / CMD / Terminal），运行上述命令；"),
              h("li", null, "按提示依次选择「GitHub.com」➜「HTTPS」➜「Login with a web browser」；"),
              h("li", null, "按回车打开浏览器确认授权后，切回本页面即可自动恢复。")
            )
          : null,
        // 操作按钮区域
        h(
          "div",
          { className: "dsh-github-guide-actions" },
          h(
            "button",
            {
              className: "dsh-github-action-btn",
              onClick: () => launchTerminal(defaultCmd),
              disabled: launching,
              title: "自动唤起系统终端并执行该命令"
            },
            launching ? "正在唤起..." : (notInstalled ? "💻 唤起终端安装" : "💻 唤起终端登录")
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
          h(
            "button",
            {
              className: "dsh-github-action-btn",
              onClick: function () {
                setToastMsg("正在快速检测登录状态...");
                fetch("/api/github/auth?force=true")
                  .then(function (res) { return res.json(); })
                  .then(function (json) {
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
                    onRefresh();
                  });
              },
              title: "重新检测登录与安装状态"
            },
            "🔄 刷新状态"
          )
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
            setMsg(json.message || "升级命令执行失败，请在宿主终端手动执行。");
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
        var cmd = updateInfo.upgradeCommand || "pnpm dsh plugin add dsh-github-flow@latest";
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
                style: { fontSize: "11px", padding: "4px 8px" },
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
              style: { padding: "6px 12px" },
            },
            "📋 复制命令"
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

    // 渲染 GitHub 仓库信息与操作视图的核心函数
    function renderGithubRepoView(
      h: any,
      data: any,
      loading: boolean,
      error: string | null,
      onRefresh: () => void,
      isRightbar: boolean = false,
      updateInfo: any = null
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

      var headerEl = h(
        "div",
        { className: "dsh-github-header" },
        h(
          "div",
          { className: "dsh-github-title" },
          renderOctocatBadge(isRightbar ? 26 : 30),
          h("h2", null, isRightbar ? "GitHub 仓库" : "GitHub 工作台")
        ),
        h(
          "button",
          {
            className: "dsh-github-refresh-btn",
            onClick: onRefresh,
            disabled: loading,
          },
          loading ? "刷新中..." : "🔄 刷新"
        )
      );

      // 仓库基础卡片
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

      // 快捷操作栏 (方案 1: 官方黄金功能直达)
      var actionsBarEl = h(
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
      );

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
              prs.map((pr: any) =>
                h(
                  "div",
                  { key: pr.number, className: "dsh-github-item" },
                  h("a", { className: "dsh-github-item-title", href: pr.url, target: "_blank" }, `#${pr.number} ${pr.title}`),
                  h(
                    "div",
                    { className: "dsh-github-item-meta" },
                    h("span", null, `${pr.headRefName} → ${pr.baseRefName}`),
                    pr.mergeable === "CONFLICTING"
                      ? h("span", { className: "dsh-github-badge dsh-badge-red" }, "代码冲突")
                      : h("span", { className: "dsh-github-badge dsh-badge-green" }, "可合并")
                  )
                )
              )
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
                  h("a", { className: "dsh-github-item-title", href: r.url, target: "_blank" }, r.name),
                  h(
                    "div",
                    { className: "dsh-github-item-meta" },
                    h("span", null, `分支: ${r.headBranch}`),
                    r.conclusion === "success"
                      ? h("span", { className: "dsh-github-badge dsh-badge-green" }, "✓ 成功")
                      : r.conclusion === "failure"
                      ? h("span", { className: "dsh-github-badge dsh-badge-red" }, "✕ 失败")
                      : h("span", { className: "dsh-github-badge dsh-badge-yellow" }, r.status)
                  )
                )
              )
            )
      );

      var authGuideEl = !auth?.loggedIn
        ? h(AuthGuideCard, { auth, onRefresh, isRightbar })
        : null;

      return [headerEl, upgradeBannerEl, authGuideEl, repoCardEl, actionsBarEl, prSectionEl, issueSectionEl, runSectionEl].filter(Boolean);
    }

    // 1. 右侧栏专属视图 (Right Sidebar Tab Body)
    function GithubRightbarBody(props: any) {
      var [loading, setLoading] = React.useState(true);
      var [data, setData] = React.useState(null as any);
      var [error, setError] = React.useState(null as string | null);
      var [updateInfo, setUpdateInfo] = React.useState(null as any);

      // gh 数据拉取完毕后，闲时 1.5 秒异步检测升级，绝对不抢占主业务首屏资源
      React.useEffect(() => {
        if (!data) return;
        var timer = setTimeout(function () {
          fetch("/api/github/check-update")
            .then(function (res) { return res.json(); })
            .then(function (json) {
              if (json && json.ok && json.data) {
                setUpdateInfo(json.data);
              }
            })
            .catch(function () {});
        }, 1500);
        return function () { clearTimeout(timer); };
      }, [data]);

      // 核心：直接从会话 Props 拿到真实物理工作区路径！
      var cwd: string | null = null;
      if (props && props.useSessions && props.sessionId) {
        try {
          cwd = props.useSessions((sessions: any) => sessions?.byId?.[props.sessionId]?.cwd);
        } catch (e) {}
      }

      var loadData = React.useCallback(async (forceRefresh = false) => {
        setLoading(true);
        setError(null);
        try {
          if (forceRefresh) {
            await fetch("/api/github/refresh", { method: "POST" }).catch(() => {});
          }
          var url = "/api/github/overview";
          var params: string[] = [];
          if (props && props.sessionId) {
            params.push("sessionId=" + encodeURIComponent(props.sessionId));
          }
          if (cwd) {
            params.push("cwd=" + encodeURIComponent(cwd));
          }
          if (params.length > 0) {
            url += "?" + params.join("&");
          }
          var res = await fetch(url);
          if (!res.ok) {
            var errText = await res.text().catch(() => "");
            setError(`后端服务未就绪 (${res.status}): ${errText || res.statusText}`);
            return;
          }
          var json = await res.json();
          if (json.ok && json.data) {
            setData(json.data);
            if (json.data.updateInfo) {
              setUpdateInfo(json.data.updateInfo);
            }
          } else {
            setError(json.error || "获取状态失败");
          }
        } catch (err: any) {
          setError(err.message || "网络异常");
        } finally {
          setLoading(false);
        }
      }, [cwd, props]);

      React.useEffect(() => {
        loadData(false);
      }, [loadData]);

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

      var h = React.createElement;
      return h(
        "div",
        { className: "dsh-github-rightbar-container" },
        ...renderGithubRepoView(h, data, loading, error, () => loadData(true), true, updateInfo)
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
          title: "GitHub 全景驾驶舱",
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

    // 本地持久化缓存与偏好配置键名
    var GLOBAL_OVERVIEW_CACHE_KEY = "dsh_github_global_overview_snapshot_v1";
    var SYNC_SETTINGS_STORAGE_KEY = "dsh_github_sync_settings_v1";

    var DEFAULT_SYNC_SETTINGS = {
      strategy: "swr",     // 'swr' (秒开展示旧数据，后台静默拉取) | 'manual' (仅手动刷新) | 'interval' (定时轮询)
      intervalMs: 300000,  // 默认 5 分钟 (300,000ms)
    };

    function getLocalSyncSettings() {
      try {
        var raw = localStorage.getItem(SYNC_SETTINGS_STORAGE_KEY);
        if (!raw) return DEFAULT_SYNC_SETTINGS;
        var parsed = JSON.parse(raw);
        return Object.assign({}, DEFAULT_SYNC_SETTINGS, parsed);
      } catch (e) {
        return DEFAULT_SYNC_SETTINGS;
      }
    }

    function saveLocalSyncSettings(settings: any) {
      try {
        localStorage.setItem(SYNC_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
      } catch (e) {}
    }

    function getStoredGlobalOverview() {
      try {
        var raw = localStorage.getItem(GLOBAL_OVERVIEW_CACHE_KEY);
        if (!raw) return null;
        var parsed = JSON.parse(raw);
        // 毒丸缓存自愈清洗：如果缓存中的快照显示「未登录」或未就绪，立即将其从 localStorage 彻底抹除！
        // 杜绝断网或历史偶发异常导致用户后续启动永远被锁死在“未登录”状态
        if (!parsed || !parsed.data || !parsed.data.auth || !parsed.data.auth.loggedIn) {
          localStorage.removeItem(GLOBAL_OVERVIEW_CACHE_KEY);
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
      // 毒丸拦截守卫：绝不持久化存储未登录状态、空数据或异常快照！
      if (!data || !data.auth || !data.auth.loggedIn) {
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

    // 数据新鲜度与同步状态微标组件
    function SyncStatusBadge(props: { syncStatus: string; lastSyncedAt: number }) {
      var syncStatus = props.syncStatus;
      var lastSyncedAt = props.lastSyncedAt;
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
        text = "⏳ 后台同步中...";
        bg = "rgba(9, 105, 218, 0.12)";
        color = "var(--dsw-alias-link, #0969da)";
      } else if (syncStatus === "fresh") {
        var timeStr = lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : "";
        text = "✅ 已是最新" + (timeStr ? " (" + timeStr + ")" : "");
        bg = "rgba(46, 160, 67, 0.12)";
        color = "var(--dsw-alias-state-success, #2ea043)";
      } else if (syncStatus === "cached") {
        text = "📦 本地快照 (" + formatTimeAgo(lastSyncedAt) + ")";
        bg = "rgba(101, 109, 118, 0.12)";
        color = "var(--dsw-alias-label-secondary, #656d76)";
      } else if (syncStatus === "failed") {
        text = "⚠️ 同步超时，已保留本地缓存";
        bg = "rgba(207, 34, 46, 0.1)";
        color = "var(--dsw-alias-state-error-primary, #cf222e)";
      }

      if (!text) return null;

      return React.createElement(
        "span",
        {
          className: "dsh-github-sync-badge",
          style: {
            fontSize: "11px",
            padding: "3px 8px",
            borderRadius: "12px",
            background: bg,
            color: color,
            marginLeft: "10px",
            fontWeight: 500,
            display: "inline-flex",
            alignItems: "center",
          },
        },
        text
      );
    }

    // 全景驾驶舱「⚙️ 数据同步与缓存设置」模态弹窗组件
    function GlobalSyncSettingsModal(props: {
      isOpen: boolean;
      onClose: () => void;
      currentSettings: any;
      onSave: (newSettings: any) => void;
      onClearCache: () => void;
    }) {
      if (!props.isOpen) return null;

      var [strategy, setStrategy] = React.useState(props.currentSettings.strategy || "swr");
      var [intervalMs, setIntervalMs] = React.useState(props.currentSettings.intervalMs || 300000);
      var [cacheMeta, setCacheMeta] = React.useState(getCacheStorageMeta());
      var [clearTip, setClearTip] = React.useState("");

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

      var h = React.createElement;

      var handleSave = function () {
        var updated = {
          strategy: strategy,
          intervalMs: Number(intervalMs),
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

      return h(
        "div",
        { className: "dsh-github-modal-overlay", onClick: props.onClose },
        h(
          "div",
          {
            className: "dsh-github-modal-dialog",
            onClick: function (e: any) { e.stopPropagation(); },
          },
          h(
            "div",
            { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" } },
            h("h3", { style: { margin: 0, fontSize: "16px", fontWeight: 600 } }, "⚙️ 数据同步与缓存偏好"),
            h("button", {
              style: { background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "var(--dsw-alias-label-secondary, #656d76)" },
              onClick: props.onClose,
            }, "✕")
          ),
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
                  "打开只浏览本地缓存，绝不自动触发后台 gh 进程，最省电、最省资源。"
                )
              )
            ),
            // 策略 C: 定时轮询
            h("div", {
              className: "dsh-github-radio-card" + (strategy === "interval" ? " active" : ""),
              onClick: function () { setStrategy("interval"); },
            },
              h("input", { type: "radio", className: "dsh-github-radio", checked: strategy === "interval", readOnly: true }),
              h("div", null,
                h("div", { style: { fontWeight: 600, fontSize: "13px" } }, "⏱️ 定时自动轮询 (Auto Poll)"),
                h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } },
                  "驾驶舱打开期间，按照下方设定的时间间隔在后台自动轮询。"
                )
              )
            )
          ),
          // 自动拉取间隔下拉
          h("div", { style: { marginBottom: "18px" } },
            h("div", { style: { fontSize: "13px", fontWeight: 600, marginBottom: "6px" } }, "后台自动拉取间隔"),
            h("select", {
              className: "dsh-github-select",
              value: intervalMs,
              onChange: function (e: any) { setIntervalMs(Number(e.target.value)); },
            },
              h("option", { value: 60000 }, "1 分钟 (高频刷新)"),
              h("option", { value: 300000 }, "5 分钟 (默认推荐)"),
              h("option", { value: 900000 }, "15 分钟"),
              h("option", { value: 1800000 }, "30 分钟 (推荐节能)"),
              h("option", { value: 3600000 }, "1 小时"),
              h("option", { value: 0 }, "从不自动刷新 (仅手动)")
            )
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
          ),
          // 操作按钮
          h("div", { style: { display: "flex", justifyContent: "flex-end", gap: "8px" } },
            h("button", {
              className: "dsh-github-btn-sm",
              style: { padding: "6px 14px" },
              onClick: props.onClose,
            }, "取消"),
            h("button", {
              className: "dsh-github-btn-sm",
              style: {
                padding: "6px 16px",
                background: "var(--dsw-alias-link, #0969da)",
                color: "#ffffff",
                borderColor: "var(--dsw-alias-link, #0969da)",
                fontWeight: 600,
              },
              onClick: handleSave,
            }, "保存并应用")
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
      var [isSettingsModalOpen, setIsSettingsModalOpen] = React.useState(false);
      var [error, setError] = React.useState(null as string | null);
      var [updateInfo, setUpdateInfo] = React.useState(null as any);
      var [activeTab, setActiveTab] = React.useState("workspaces"); // 'workspaces' | 'repos' | 'mywork'
      var [searchQuery, setSearchQuery] = React.useState("");
      var [issueFilter, setIssueFilter] = React.useState("all"); // 'all' | 'reported' | 'assigned' | 'created'

      // gh 业务数据就绪后，闲时 1.5 秒异步静默检测升级，绝不影响首屏
      React.useEffect(() => {
        if (!data) return;
        var timer = setTimeout(function () {
          fetch("/api/github/check-update")
            .then(function (res) { return res.json(); })
            .then(function (json) {
              if (json && json.ok && json.data) {
                setUpdateInfo(json.data);
              }
            })
            .catch(function () {});
        }, 1500);
        return function () { clearTimeout(timer); };
      }, [data]);

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
          if (forceRefresh) await fetch("/api/github/refresh", { method: "POST" }).catch(() => {});
          var res = await fetch("/api/github/global-overview", { signal: controller.signal });
          if (!res.ok) {
            var errText = await res.text().catch(() => "");
            var failMsg = `获取全局数据失败（HTTP ${res.status}）${errText ? ": " + errText : ""}`;
            if (data) {
              // 容灾保障：有本地旧数据时绝不红屏崩溃，平滑降级展示离线快照
              setSyncStatus("failed");
            } else {
              setError(failMsg);
            }
            return;
          }
          var json = await res.json();
          if (json.ok && json.data) {
            setData(json.data);
            saveStoredGlobalOverview(json.data); // 写入持久化快照
            setLastSyncedAt(Date.now());
            setSyncStatus("fresh");

            if (json.data.updateInfo) {
              setUpdateInfo(json.data.updateInfo);
            }
            if (json.data.workspaceError) {
              setError("工作区列表读取失败：" + json.data.workspaceError);
            }
          } else {
            if (data) {
              setSyncStatus("failed");
            } else {
              setError(json.error || "获取全局数据失败");
            }
          }
        } catch (err: any) {
          if (data) {
            // 后台网络故障时，旧数据依然完整可用
            setSyncStatus("failed");
          } else {
            if (timedOut || err.name === "AbortError") {
              setError("获取超时（30 秒）：本机 gh 命令响应过慢，通常是网络或工作区数量较多所致。可稍后重试，或减少同时打开的工作区。");
            } else {
              setError("无法连接后端服务：" + (err.message || err));
            }
          }
        } finally {
          clearTimeout(timer);
          setLoading(false);
        }
      }, [data, syncSettings]);

      // 挂载加载调度：SWR 模式下初次延迟 300ms 后台平滑发起静默同步
      React.useEffect(() => {
        if (syncSettings.strategy === "swr") {
          var timer = setTimeout(function () { loadData(false); }, 300);
          return function () { clearTimeout(timer); };
        } else if (!data) {
          loadData(false);
        }
      }, [syncSettings.strategy]);

      // 定时轮询调度
      React.useEffect(() => {
        if (syncSettings.strategy !== "interval" || !syncSettings.intervalMs || syncSettings.intervalMs <= 0) return;
        var timer = setInterval(function () {
          loadData(false);
        }, syncSettings.intervalMs);
        return function () { clearInterval(timer); };
      }, [syncSettings.strategy, syncSettings.intervalMs, loadData]);

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
          h(SyncStatusBadge, { syncStatus, lastSyncedAt })
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
              onClick: () => setIsSettingsModalOpen(true),
              title: "配置数据拉取节奏与本地缓存偏好",
              style: { padding: "6px 12px" },
            },
            "⚙️ 同步设置"
          )
        )
      );

      if (loading && !data) {
        return h("div", { className: "dsh-github-panel" }, headerEl, h("div", { className: "dsh-github-empty" }, "正在加载全局 GitHub 账号与工作区数据..."));
      }

      var effectiveUpdateInfo = updateInfo || data?.updateInfo;
      var upgradeBannerEl = effectiveUpdateInfo && effectiveUpdateInfo.hasUpdate
        ? h(UpgradeNotificationCard, { updateInfo: effectiveUpdateInfo, isRightbar: false })
        : null;

      var settingsModalEl = h(GlobalSyncSettingsModal, {
        isOpen: isSettingsModalOpen,
        onClose: () => setIsSettingsModalOpen(false),
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
          { className: "dsh-github-panel" },
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
            auth?.loggedIn
              ? `👤 ${auth.user}`
              : !auth?.installed
                ? "❌ 未安装 CLI"
                : "⚠️ 未登录",
            auth?.loggedIn
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
        )
      );

      // 安装与登录引导组件（未登录或未安装时显式展开）
      var authGuideEl = !auth?.loggedIn
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
                )
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
                    h("span", null, `⭐ ${r.stargazerCount}`)
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
              myPrs.map((pr: any) => h("div", { key: pr.number, className: "dsh-github-item" }, h("a", { className: "dsh-github-item-title", href: pr.url, target: "_blank" }, `[${pr.repository?.nameWithOwner || 'Repo'}] #${pr.number} ${pr.title}`)))
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

      return h(
        "div",
        { className: "dsh-github-panel" },
        headerEl,
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
            title: () => "GitHub 仓库",
            guide: [
              {
                id: "workspace.github",
                commandId: "workspace.github",
                order: 40,
                title: () => "GitHub 仓库",
                description: () => "查看与操作当前工作区目录下的 GitHub 仓库",
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
