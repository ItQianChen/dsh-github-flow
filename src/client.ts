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
              onClick: onRefresh,
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

    // 渲染 GitHub 仓库信息与操作视图的核心函数
    function renderGithubRepoView(h: any, data: any, loading: boolean, error: string | null, onRefresh: () => void, isRightbar: boolean = false) {
      var auth = data ? data.auth : null;
      var repo = data ? data.repo : null;
      var prs = (data && data.pullRequests) || [];
      var issues = (data && data.issues) || [];
      var runs = (data && data.runs) || [];

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

      return [headerEl, authGuideEl, repoCardEl, actionsBarEl, prSectionEl, issueSectionEl, runSectionEl].filter(Boolean);
    }

    // 1. 右侧栏专属视图 (Right Sidebar Tab Body)
    function GithubRightbarBody(props: any) {
      var [loading, setLoading] = React.useState(true);
      var [data, setData] = React.useState(null as any);
      var [error, setError] = React.useState(null as string | null);

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

      // 窗口切回自动探测自愈
      React.useEffect(() => {
        var onFocus = () => {
          if (!data?.auth?.loggedIn) {
            loadData(false);
          }
        };
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
      }, [data, loadData]);

      var h = React.createElement;
      return h(
        "div",
        { className: "dsh-github-rightbar-container" },
        ...renderGithubRepoView(h, data, loading, error, () => loadData(true), true)
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

    function GithubWorkspacePanel() {
      var [loading, setLoading] = React.useState(true);
      var [data, setData] = React.useState(null as any);
      var [error, setError] = React.useState(null as string | null);
      var [activeTab, setActiveTab] = React.useState("workspaces"); // 'workspaces' | 'repos' | 'mywork'
      var [searchQuery, setSearchQuery] = React.useState("");
      var [issueFilter, setIssueFilter] = React.useState("all"); // 'all' | 'reported' | 'assigned' | 'created'

      var loadData = React.useCallback(async (forceRefresh = false) => {
        setLoading(true);
        setError(null);
        // 全局驾驶舱要 spawn 十几次 gh，冷启动可能超过 10 秒。
        // 不设显式超时的话浏览器会抛一个与真实原因无关的网络错误，
        // 早先这里会把所有失败都归因成「后端服务未就绪或接口不存在」——归因错误比没有报错更糟。
        var controller = new AbortController();
        var timedOut = false;
        var timer = setTimeout(function () { timedOut = true; controller.abort(); }, 30000);
        try {
          if (forceRefresh) await fetch("/api/github/refresh", { method: "POST" }).catch(() => {});
          var res = await fetch("/api/github/global-overview", { signal: controller.signal });
          if (!res.ok) {
            var errText = await res.text().catch(() => "");
            setError(`获取全局数据失败（HTTP ${res.status}）${errText ? ": " + errText : ""}`);
            return;
          }
          var json = await res.json();
          if (json.ok && json.data) {
            setData(json.data);
            // 工作区矩阵单独失败时不能静默：否则界面显示「暂无工作区」，把故障伪装成空状态
            if (json.data.workspaceError) {
              setError("工作区列表读取失败：" + json.data.workspaceError);
            }
          } else {
            setError(json.error || "获取全局数据失败");
          }
        } catch (err: any) {
          if (timedOut || err.name === "AbortError") {
            setError("获取超时（30 秒）：本机 gh 命令响应过慢，通常是网络或工作区数量较多所致。可稍后重试，或减少同时打开的工作区。");
          } else {
            setError("无法连接后端服务：" + (err.message || err));
          }
        } finally {
          clearTimeout(timer);
          setLoading(false);
        }
      }, []);

      React.useEffect(() => { loadData(false); }, [loadData]);

      // 窗口切回自动探测自愈
      React.useEffect(() => {
        var onFocus = () => {
          if (!data?.auth?.loggedIn) {
            loadData(false);
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
          h("h2", null, "GitHub 全景驾驶舱")
        ),
        h(
          "button",
          {
            className: "dsh-github-refresh-btn",
            onClick: () => loadData(true),
            disabled: loading,
          },
          loading ? "刷新中..." : "🔄 刷新全局数据"
        )
      );

      if (loading && !data) {
        return h("div", { className: "dsh-github-panel" }, headerEl, h("div", { className: "dsh-github-empty" }, "正在加载全局 GitHub 账号与工作区数据..."));
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

      return h("div", { className: "dsh-github-panel" }, headerEl, errorEl, statsCardsEl, authGuideEl, tabsEl, contentEl);
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
