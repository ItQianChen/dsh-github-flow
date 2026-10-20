/**
 * DSH GitHub Flow - 主题自适应样式系统 (Light / Dark 动态联动)
 * 遵循 DSH 原生 DSW (DeepSeek Web) 设计语言规范
 */
export const GITHUB_PANEL_CSS = `
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

/* fork 血缘行：说明「这是谁的上游」，上游名可点击 */
.dsh-github-fork-line {
  font-size: 12px;
  margin-top: 4px;
  color: var(--dsw-alias-label-secondary, #656d76);
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
body[data-ds-dark-theme] .dsh-github-fork-line {
  color: var(--dsw-alias-label-secondary, #bbb);
}
.dsh-github-fork-line a {
  color: var(--dsw-alias-link, #0969da);
  text-decoration: none;
  font-weight: 600;
}
.dsh-github-fork-line a:hover {
  text-decoration: underline;
}
body[data-ds-dark-theme] .dsh-github-fork-line a {
  color: #58a6ff;
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

/*
 * 只读徽章：与 yellow 同色系但描边更明显，因为「你改不了」是需要被看见的约束。
 * 独立类而非复用 yellow，是为了将来调整只读语义的视觉强度时不牵动其他黄色徽章。
 */
.dsh-badge-readonly {
  background: rgba(154, 103, 0, 0.12);
  color: #9a6700;
  border: 1px solid rgba(154, 103, 0, 0.35);
  font-weight: 600;
}
body[data-ds-dark-theme] .dsh-badge-readonly {
  background: rgba(210, 153, 34, 0.18);
  color: #d29922;
  border-color: rgba(210, 153, 34, 0.4);
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

/* 插件身份徽标：标识界面由第三方插件 dsh-github-flow 提供（非 DSH/GitHub 官方） */
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

.dsh-github-radio {
  accent-color: var(--dsw-alias-link, #0969da);
  cursor: pointer;
  margin-top: 3px;
}
body[data-ds-dark-theme] .dsh-github-radio {
  accent-color: #58a6ff;
}

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

.dsh-github-branch-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 12px;
  border: 1px solid rgba(46, 160, 67, 0.4);
  background: rgba(46, 160, 67, 0.12);
  color: var(--dsw-alias-state-success, #2ea043);
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}
.dsh-github-branch-btn:hover {
  background: rgba(46, 160, 67, 0.22);
  border-color: rgba(46, 160, 67, 0.6);
}
body[data-ds-dark-theme] .dsh-github-branch-btn {
  border-color: rgba(56, 139, 253, 0.4);
  background: rgba(56, 139, 253, 0.15);
  color: #58a6ff;
}
body[data-ds-dark-theme] .dsh-github-branch-btn:hover {
  background: rgba(56, 139, 253, 0.25);
  border-color: #58a6ff;
}

.dsh-github-branch-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 5px;
  width: 290px;
  max-height: 380px;
  background: var(--dsw-alias-bg-base, #ffffff);
  border: 1px solid var(--dsw-alias-border-l2, #e1e4e8);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
body[data-ds-dark-theme] .dsh-github-branch-dropdown {
  background: var(--dsw-alias-bg-layer-2, #1e1e22);
  border-color: var(--dsw-alias-border-l1, #30363d);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
}

.dsh-github-branch-search {
  padding: 8px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, #e1e4e8);
}
body[data-ds-dark-theme] .dsh-github-branch-search {
  border-bottom-color: var(--dsw-alias-border-l1, #30363d);
}
.dsh-github-branch-input {
  width: 100%;
  padding: 5px 8px;
  box-sizing: border-box;
  font-size: 11px;
  border-radius: 5px;
  border: 1px solid var(--dsw-alias-border-l2, #d0d7de);
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2328);
  outline: none;
}
body[data-ds-dark-theme] .dsh-github-branch-input {
  border-color: var(--dsw-alias-border-l1, #30363d);
  background: var(--dsw-alias-bg-base, #151517);
  color: #ececec;
}
.dsh-github-branch-input:focus {
  border-color: var(--dsw-alias-link, #0969da);
}

.dsh-github-branch-list {
  flex: 1;
  overflow-y: auto;
  max-height: 280px;
  padding: 4px 0;
}
.dsh-github-branch-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.12s ease;
  color: var(--dsw-alias-label-primary, #1f2328);
}
body[data-ds-dark-theme] .dsh-github-branch-item {
  color: var(--dsw-alias-label-primary, #ececec);
}
.dsh-github-branch-item:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
body[data-ds-dark-theme] .dsh-github-branch-item:hover {
  background: rgba(255, 255, 255, 0.08);
}
.dsh-github-branch-item.active {
  font-weight: 600;
  color: var(--dsw-alias-state-success, #1a7f37);
}
body[data-ds-dark-theme] .dsh-github-branch-item.active {
  color: #3fb950;
}

/* 15. 独立沉浸式指南大窗口 (Help Modal) 双主题体系 */
.dsh-github-help-dialog {
  width: 920px;
  max-width: 92vw;
  height: 85vh;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  background: var(--dsw-alias-bg-base, #ffffff);
  border: 1px solid var(--dsw-alias-border-l2, #d0d7de);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.22);
  color: var(--dsw-alias-label-primary, #1f2328);
  font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
  overflow: hidden;
  box-sizing: border-box;
}
body[data-ds-dark-theme] .dsh-github-help-dialog {
  background: var(--dsw-alias-bg-layer-2, #1c2128);
  border-color: var(--dsw-alias-border-l1, #30363d);
  color: var(--dsw-alias-label-primary, #f0f6fc);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.65);
}

.dsh-github-help-header {
  padding: 16px 22px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, #d0d7de);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  background: var(--dsw-alias-bg-base, #ffffff);
}
body[data-ds-dark-theme] .dsh-github-help-header {
  background: var(--dsw-alias-bg-layer-2, #1c2128);
  border-bottom-color: var(--dsw-alias-border-l1, #30363d);
}

.dsh-github-help-nav {
  display: flex;
  gap: 8px;
  padding: 10px 22px;
  background: var(--dsw-alias-bg-module-platform, rgba(9, 105, 218, 0.05));
  border-bottom: 1px solid var(--dsw-alias-border-l2, #d0d7de);
  flex-shrink: 0;
}
body[data-ds-dark-theme] .dsh-github-help-nav {
  background: rgba(56, 139, 253, 0.08);
  border-bottom-color: var(--dsw-alias-border-l1, #30363d);
}

.dsh-github-help-tab-btn {
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #656d76);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}
body[data-ds-dark-theme] .dsh-github-help-tab-btn {
  color: var(--dsw-alias-label-secondary, #8b949e);
}
.dsh-github-help-tab-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}
body[data-ds-dark-theme] .dsh-github-help-tab-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #f0f6fc;
}
.dsh-github-help-tab-btn.active {
  font-weight: 600;
  background: var(--dsw-alias-link, #0969da);
  color: #ffffff !important;
  border-color: var(--dsw-alias-link, #0969da);
}
body[data-ds-dark-theme] .dsh-github-help-tab-btn.active {
  background: #1f6feb;
  border-color: #1f6feb;
}

.dsh-github-help-scroll-body {
  flex: 1;
  overflow-y: auto;
  padding: 22px;
  box-sizing: border-box;
}
.dsh-github-help-scroll-body::-webkit-scrollbar {
  width: 6px;
}
.dsh-github-help-scroll-body::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 3px;
}
body[data-ds-dark-theme] .dsh-github-help-scroll-body::-webkit-scrollbar-thumb {
  background: #30363d;
}

.dsh-github-help-card {
  padding: 16px 18px;
  margin-bottom: 14px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-module-platform, rgba(9, 105, 218, 0.04));
  border: 1px solid var(--dsw-alias-border-l2, rgba(9, 105, 218, 0.18));
  transition: border-color 0.15s ease;
}
body[data-ds-dark-theme] .dsh-github-help-card {
  background: rgba(56, 139, 253, 0.05);
  border-color: rgba(56, 139, 253, 0.18);
}
.dsh-github-help-card:hover {
  border-color: rgba(9, 105, 218, 0.35);
}
body[data-ds-dark-theme] .dsh-github-help-card:hover {
  border-color: rgba(56, 139, 253, 0.4);
}

.dsh-github-prompt-box {
  padding: 10px 14px;
  margin-bottom: 8px;
  border-radius: 6px;
  background: #f6f8fa;
  border: 1px solid #d0d7de;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-primary, #1f2328);
  word-break: break-all;
}
body[data-ds-dark-theme] .dsh-github-prompt-box {
  background: #0d1117;
  border-color: #30363d;
  color: #79c0ff;
}

.dsh-github-help-step-badge {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--dsw-alias-link, #0969da);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
  flex-shrink: 0;
}
body[data-ds-dark-theme] .dsh-github-help-step-badge {
  background: #1f6feb;
  box-shadow: 0 0 10px rgba(31, 111, 235, 0.35);
}

.dsh-github-help-footer {
  padding: 12px 22px;
  border-top: 1px solid var(--dsw-alias-border-l2, #d0d7de);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--dsw-alias-bg-base, #ffffff);
  flex-shrink: 0;
}
body[data-ds-dark-theme] .dsh-github-help-footer {
  background: var(--dsw-alias-bg-layer-2, #1c2128);
  border-top-color: var(--dsw-alias-border-l1, #30363d);
}

.dsh-github-help-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--dsw-alias-label-primary, #1f2328);
}
body[data-ds-dark-theme] .dsh-github-help-title {
  color: var(--dsw-alias-label-primary, #f0f6fc);
}

.dsh-github-help-desc {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #656d76);
  line-height: 1.5;
}
body[data-ds-dark-theme] .dsh-github-help-desc {
  color: var(--dsw-alias-label-secondary, #8b949e);
}

/* 16. 未提交文件清单交互与 Git Diff 对比视图 */
.dsh-github-dirty-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s ease;
  user-select: none;
}
.dsh-github-dirty-item:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
body[data-ds-dark-theme] .dsh-github-dirty-item:hover {
  background: rgba(255, 255, 255, 0.08);
}
.dsh-github-dirty-item:active {
  background: var(--dsw-alias-interactive-bg-active, rgba(0, 0, 0, 0.08));
}
body[data-ds-dark-theme] .dsh-github-dirty-item:active {
  background: rgba(255, 255, 255, 0.12);
}

.dsh-github-inline-diff-view {
  animation: dsh-github-fade-in 0.15s ease-out;
}
@keyframes dsh-github-fade-in {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 1; transform: translateY(0); }
}
body[data-ds-dark-theme] .dsh-github-inline-diff-content {
  background-color: var(--dsw-alias-bg-layer-2, #1c2128) !important;
  border-color: var(--dsw-alias-border-l1, #30363d) !important;
}

/* 17. 提交详情文件变更统计结构化高亮 */
.dsh-github-stat-list {
  border: 1px solid var(--dsw-alias-border-l2, #e1e4e8);
  background: var(--dsw-alias-bg-module-platform, #f6f8fa);
}
body[data-ds-dark-theme] .dsh-github-stat-list {
  border-color: var(--dsw-alias-border-l1, #30363d) !important;
  background: var(--dsw-alias-bg-layer-2, #1c2128) !important;
}

.dsh-github-stat-row {
  transition: background-color 0.15s ease;
}
.dsh-github-stat-row:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.04));
}
body[data-ds-dark-theme] .dsh-github-stat-row:hover {
  background: rgba(255, 255, 255, 0.06);
}

/* 18. 右侧栏上方卡片折叠/展开动画与按钮样式 */
.dsh-github-header-cards-collapsed {
  display: none !important;
}

.dsh-github-btn-sm.active {
  background: var(--dsw-alias-state-attention-subtle, rgba(234, 179, 8, 0.15)) !important;
  color: var(--dsw-alias-state-attention-primary, #9a6700) !important;
  border-color: var(--dsw-alias-state-attention-primary, #d29922) !important;
}
body[data-ds-dark-theme] .dsh-github-btn-sm.active {
  background: rgba(234, 179, 8, 0.2) !important;
  color: #f0b72f !important;
  border-color: #d29922 !important;
}

/* 19. 关联仓库切换器 (RepoSelectorDropdown) */
.dsh-github-repo-switch-trigger {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 7px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 12px;
  border: 1px solid rgba(130, 80, 223, 0.35);
  background: rgba(130, 80, 223, 0.1);
  color: #8250df;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
  line-height: 16px;
}
.dsh-github-repo-switch-trigger:hover {
  background: rgba(130, 80, 223, 0.2);
  border-color: rgba(130, 80, 223, 0.6);
}
body[data-ds-dark-theme] .dsh-github-repo-switch-trigger {
  border-color: rgba(163, 113, 247, 0.4);
  background: rgba(163, 113, 247, 0.15);
  color: #a371f7;
}
body[data-ds-dark-theme] .dsh-github-repo-switch-trigger:hover {
  background: rgba(163, 113, 247, 0.25);
  border-color: #a371f7;
}

.dsh-github-repo-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 5px;
  width: 320px;
  max-height: 380px;
  background: var(--dsw-alias-bg-base, #ffffff);
  border: 1px solid var(--dsw-alias-border-l2, #e1e4e8);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
body[data-ds-dark-theme] .dsh-github-repo-dropdown {
  background: var(--dsw-alias-bg-layer-2, #1e1e22);
  border-color: var(--dsw-alias-border-l1, #30363d);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
}

.dsh-github-repo-dropdown-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  background: var(--dsw-alias-bg-layer-1, #f6f8fa);
  border-bottom: 1px solid var(--dsw-alias-border-l2, #e1e4e8);
  color: var(--dsw-alias-label-secondary, #57606a);
}
body[data-ds-dark-theme] .dsh-github-repo-dropdown-header {
  background: var(--dsw-alias-bg-layer-1, #16161a);
  border-bottom-color: var(--dsw-alias-border-l1, #30363d);
  color: var(--dsw-alias-label-secondary, #8b949e);
}

.dsh-github-repo-dropdown-list {
  overflow-y: auto;
  max-height: 260px;
  padding: 4px 0;
}

.dsh-github-repo-item {
  padding: 7px 12px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.12s ease;
  color: var(--dsw-alias-label-primary, #1f2328);
}
.dsh-github-repo-item:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
body[data-ds-dark-theme] .dsh-github-repo-item {
  color: var(--dsw-alias-label-primary, #f0f6fc);
}
body[data-ds-dark-theme] .dsh-github-repo-item:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.06));
}
.dsh-github-repo-item.selected {
  background: rgba(9, 105, 218, 0.08);
}
body[data-ds-dark-theme] .dsh-github-repo-item.selected {
  background: rgba(56, 139, 253, 0.15);
}

.dsh-github-repo-dropdown-footer {
  padding: 6px 10px;
  font-size: 10px;
  background: var(--dsw-alias-bg-layer-1, #f6f8fa);
  border-top: 1px solid var(--dsw-alias-border-l2, #e1e4e8);
  color: var(--dsw-alias-label-tertiary, #656d76);
  line-height: 1.4;
}
body[data-ds-dark-theme] .dsh-github-repo-dropdown-footer {
  background: var(--dsw-alias-bg-layer-1, #16161a);
  border-top-color: var(--dsw-alias-border-l1, #30363d);
  color: var(--dsw-alias-label-tertiary, #8b949e);
}

.dsh-github-switch-quicklink {
  font-size: 11px;
  cursor: pointer;
  color: var(--dsw-alias-link, #0969da);
  text-decoration: none;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(9, 105, 218, 0.08);
  border: 1px solid rgba(9, 105, 218, 0.2);
}
.dsh-github-switch-quicklink:hover {
  text-decoration: none;
  background: rgba(9, 105, 218, 0.16);
  border-color: rgba(9, 105, 218, 0.4);
}
body[data-ds-dark-theme] .dsh-github-switch-quicklink {
  color: #58a6ff;
  background: rgba(56, 139, 253, 0.15);
  border-color: rgba(56, 139, 253, 0.3);
}
body[data-ds-dark-theme] .dsh-github-switch-quicklink:hover {
  background: rgba(56, 139, 253, 0.25);
  border-color: rgba(56, 139, 253, 0.5);
}

/* 20. PR 在线详情与代码审阅工作台 (PrDetailModal) */
.dsh-github-pr-modal-dialog {
  width: 95% !important;
  max-width: 1040px !important;
  height: 88vh !important;
  max-height: 88vh !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
  padding: 0 !important;
}

.dsh-github-pr-modal-header {
  padding: 12px 16px !important;
  border-bottom: 1px solid var(--dsw-alias-border-l2, #e1e4e8);
  background: var(--dsw-alias-bg-layer-1, #f6f8fa);
  flex-shrink: 0;
}
body[data-ds-dark-theme] .dsh-github-pr-modal-header {
  border-bottom-color: var(--dsw-alias-border-l1, #30363d);
  background: var(--dsw-alias-bg-layer-1, #16161a);
}

.dsh-github-pr-modal-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 16px;
  background: var(--dsw-alias-bg-base, #ffffff);
  border-bottom: 1px solid var(--dsw-alias-border-l2, #e1e4e8);
  flex-shrink: 0;
}
body[data-ds-dark-theme] .dsh-github-pr-modal-tabs {
  background: var(--dsw-alias-bg-layer-2, #1e1e22);
  border-bottom-color: var(--dsw-alias-border-l1, #30363d);
}

.dsh-github-pr-tab-btn {
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #656d76);
  cursor: pointer;
  transition: all 0.15s ease;
}
.dsh-github-pr-tab-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
  color: var(--dsw-alias-label-primary, #1f2328);
}
.dsh-github-pr-tab-btn.active {
  background: var(--dsw-alias-interactive-bg-active, rgba(9, 105, 218, 0.1));
  color: var(--dsw-alias-link, #0969da);
  font-weight: 600;
  border-color: rgba(9, 105, 218, 0.25);
}
body[data-ds-dark-theme] .dsh-github-pr-tab-btn {
  color: var(--dsw-alias-label-secondary, #8b949e);
}
body[data-ds-dark-theme] .dsh-github-pr-tab-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #f0f6fc;
}
body[data-ds-dark-theme] .dsh-github-pr-tab-btn.active {
  background: rgba(56, 139, 253, 0.15);
  color: #58a6ff;
  border-color: rgba(56, 139, 253, 0.4);
}

.dsh-github-pr-conversation-pane {
  padding: 16px !important;
  overflow-y: auto !important;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dsh-github-pr-checks-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--dsw-alias-bg-module-platform, #f6f8fa);
  border: 1px solid var(--dsw-alias-border-l2, #e1e4e8);
  border-radius: 6px;
  font-size: 11px;
}
body[data-ds-dark-theme] .dsh-github-pr-checks-bar {
  background: var(--dsw-alias-bg-layer-1, #16161a);
  border-color: var(--dsw-alias-border-l1, #30363d);
}

.dsh-github-pr-body-card {
  border: 1px solid var(--dsw-alias-border-l2, #e1e4e8);
  border-radius: 6px;
  background: var(--dsw-alias-bg-base, #ffffff);
  overflow: hidden;
}
body[data-ds-dark-theme] .dsh-github-pr-body-card {
  border-color: var(--dsw-alias-border-l1, #30363d);
  background: var(--dsw-alias-bg-layer-2, #1e1e22);
}

.dsh-github-pr-comment-card {
  border: 1px solid var(--dsw-alias-border-l2, #e1e4e8);
  border-radius: 6px;
  background: var(--dsw-alias-bg-base, #ffffff);
  overflow: hidden;
  margin-bottom: 10px;
}
body[data-ds-dark-theme] .dsh-github-pr-comment-card {
  border-color: var(--dsw-alias-border-l1, #30363d);
  background: var(--dsw-alias-bg-layer-2, #1e1e22);
}

.dsh-github-pr-comment-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  background: var(--dsw-alias-bg-module-platform, #f6f8fa);
  border-bottom: 1px solid var(--dsw-alias-border-l2, #e1e4e8);
  font-size: 11px;
}
body[data-ds-dark-theme] .dsh-github-pr-comment-header {
  background: var(--dsw-alias-bg-layer-1, #16161a);
  border-bottom-color: var(--dsw-alias-border-l1, #30363d);
}

.dsh-github-pr-files-pane {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.dsh-github-pr-file-list {
  width: 280px;
  flex-shrink: 0;
  border-right: 1px solid var(--dsw-alias-border-l2, #e1e4e8);
  background: var(--dsw-alias-bg-layer-1, #f6f8fa);
  overflow-y: auto;
  padding: 6px 0;
}
body[data-ds-dark-theme] .dsh-github-pr-file-list {
  border-right-color: var(--dsw-alias-border-l1, #30363d);
  background: var(--dsw-alias-bg-layer-1, #16161a);
}

.dsh-github-pr-file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace;
  cursor: pointer;
  color: var(--dsw-alias-label-primary, #1f2328);
  transition: background 0.12s ease;
}
.dsh-github-pr-file-item:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.dsh-github-pr-file-item.selected {
  background: rgba(9, 105, 218, 0.1);
  color: var(--dsw-alias-link, #0969da);
  font-weight: 600;
}
body[data-ds-dark-theme] .dsh-github-pr-file-item {
  color: var(--dsw-alias-label-primary, #f0f6fc);
}
body[data-ds-dark-theme] .dsh-github-pr-file-item:hover {
  background: rgba(255, 255, 255, 0.06);
}
body[data-ds-dark-theme] .dsh-github-pr-file-item.selected {
  background: rgba(56, 139, 253, 0.18);
  color: #58a6ff;
}

.dsh-github-pr-diff-viewer {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--dsw-alias-bg-base, #ffffff);
}
body[data-ds-dark-theme] .dsh-github-pr-diff-viewer {
  background: var(--dsw-alias-bg-layer-2, #1e1e22);
}

.dsh-github-pr-diff-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, #e1e4e8);
  background: var(--dsw-alias-bg-module-platform, #f6f8fa);
  flex-shrink: 0;
}
body[data-ds-dark-theme] .dsh-github-pr-diff-toolbar {
  border-bottom-color: var(--dsw-alias-border-l1, #30363d);
  background: var(--dsw-alias-bg-layer-1, #16161a);
}

/* 行级审查评论：与对话区评论视觉区分（左侧紫色描边，暗示「挂在代码上」） */
.dsh-github-pr-line-comments {
  border-top: 1px solid var(--dsw-alias-border-l2, #e1e4e8);
  padding: 10px 12px 14px;
  background: var(--dsw-alias-bg-layer-1, #f6f8fa);
}
body[data-ds-dark-theme] .dsh-github-pr-line-comments {
  border-top-color: var(--dsw-alias-border-l1, #30363d);
  background: var(--dsw-alias-bg-layer-1, #16161a);
}
.dsh-github-pr-line-comments-title {
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--dsw-alias-label-secondary, #656d76);
}
body[data-ds-dark-theme] .dsh-github-pr-line-comments-title {
  color: var(--dsw-alias-label-secondary, #8b949e);
}
.dsh-github-pr-line-comment-item {
  border-left: 3px solid rgba(130, 80, 223, 0.5);
  border-radius: 4px;
  background: var(--dsw-alias-bg-base, #ffffff);
  padding: 8px 10px;
  margin-bottom: 8px;
}
body[data-ds-dark-theme] .dsh-github-pr-line-comment-item {
  background: var(--dsw-alias-bg-layer-2, #1e1e22);
  border-left-color: rgba(163, 113, 247, 0.6);
}
.dsh-github-pr-line-comment-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 11px;
  margin-bottom: 5px;
}
.dsh-github-pr-line-comment-body {
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--dsw-alias-label-primary, #1f2328);
}
body[data-ds-dark-theme] .dsh-github-pr-line-comment-body {
  color: var(--dsw-alias-label-primary, #f0f6fc);
}
`;
export function injectStyles() {
    var styleId = "dsh-plugin-github-styles";
    var existing = document.getElementById(styleId);
    if (existing) {
        existing.textContent = GITHUB_PANEL_CSS;
        return () => { };
    }
    var style = document.createElement("style");
    style.id = styleId;
    style.textContent = GITHUB_PANEL_CSS;
    document.head.appendChild(style);
    return () => style.remove();
}
