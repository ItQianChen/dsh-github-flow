window.__ModuleLoader__.load({
    id: "dsh-github-flow",
    factory: (require) => {
        var module = { exports: {} };
        var exports = module.exports;
        Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
        var React = require("react");

// ---- [Bundled: styles.js] ----
/**
 * DSH GitHub Flow - 主题自适应样式系统 (Light / Dark 动态联动)
 * 遵循 DSH 原生 DSW (DeepSeek Web) 设计语言规范
 */
const GITHUB_PANEL_CSS = `
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
`;
function injectStyles() {
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

// ---- [Bundled: utils.js] ----
/**
 * 面板公共工具函数（纯函数，可被单元测试直接覆盖）
 */
function formatRelativeTime(iso) {
    if (!iso || typeof iso !== "string")
        return "";
    var t = Date.parse(iso);
    if (isNaN(t))
        return "";
    var diff = Date.now() - t;
    if (diff < 0)
        return "刚刚";
    var MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
    if (diff < MIN)
        return "刚刚";
    if (diff < HOUR)
        return Math.floor(diff / MIN) + "分钟前";
    if (diff < DAY)
        return Math.floor(diff / HOUR) + "小时前";
    if (diff < 7 * DAY)
        return Math.floor(diff / DAY) + "天前";
    var d = new Date(t);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function rollupCiStatus(checks) {
    if (!Array.isArray(checks) || checks.length === 0)
        return null;
    var hasFail = false, hasPending = false;
    for (var i = 0; i < checks.length; i++) {
        var c = checks[i] || {};
        var status = String(c.status || "").toLowerCase();
        var conclusion = String(c.conclusion || "").toLowerCase();
        if (conclusion === "failure" || conclusion === "timed_out" || conclusion === "cancelled")
            hasFail = true;
        else if (conclusion === "success" || conclusion === "skipped" || conclusion === "neutral") { }
        else if (status === "in_progress" || status === "queued" || conclusion === "pending" || (!conclusion && status))
            hasPending = true;
    }
    if (hasFail)
        return "fail";
    if (hasPending)
        return "pending";
    return "pass";
}
function reviewDecisionBadge(decision) {
    var d = String(decision || "").toUpperCase();
    if (d === "APPROVED")
        return { text: "✔ 已批准", kind: "green" };
    if (d === "CHANGES_REQUESTED")
        return { text: "✋ 需修改", kind: "red" };
    if (d === "REVIEW_REQUIRED")
        return { text: "👀 待审查", kind: "yellow" };
    return null;
}
function eventLabel(event) {
    var e = String(event || "");
    if (e === "push")
        return "⇡ push";
    if (e === "schedule")
        return "⏰ 定时";
    if (e === "workflow_dispatch")
        return "▶ 手动";
    if (e === "pull_request")
        return "🔀 PR";
    return e || "";
}
/**
 * 确定性失败的特征（客户端侧兜底判定）。
 *
 * 为什么这里还要再写一份：后端 GhExecutor 已统一分类并通过 errorKind 分流，
 * 但浏览器端拿不到 errorKind，只能看到拼接后的错误文本。这类错误重试一万次
 * 也不会变好（仓库就是关着 Issues），必须阻止阶梯退避把 7 秒白白烧掉。
 * 与服务端共用同一组特征串，改动时两边同步。
 */
var DETERMINISTIC_HINT_RE = /repository has disabled|Could not resolve to a Repository|Branch not found|HTTP 403|Not Found \(HTTP 404\)|rate limit/i;
/**
 * 带有阶梯退避重试（Backoff Retry）的通用异步拉取函数
 *
 * 核心设计理由与约束：
 * 1. 应对代理节点不稳定、TLS 握手卡顿、短时网络抖动（半秒至两秒微断流）；
 * 2. 阶梯退避时序：第 1 次失败等 1s (1000ms)，第 2 次等 2s (2000ms)，第 3 次等 4s (4000ms)，附加 0~200ms Jitter；
 * 3. 智能区分软硬错误：401/403/404/400 确定性错误坚决不重试，仅在网络超时、不可达、或带有 networkError 时重试；
 * 4. 严格响应外部 AbortSignal，组件卸载或用户手动打断时立即退出等待，绝无内存泄漏。
 */
async function fetchWithRetry(url, options = {}, config = {}) {
    var maxRetries = config.maxRetries !== undefined ? config.maxRetries : 3;
    var baseDelayMs = config.baseDelayMs !== undefined ? config.baseDelayMs : 1000;
    var signal = config.signal || options.signal;
    var attempt = 0;
    while (true) {
        attempt++;
        var currentRes = null;
        var currentJson = null;
        var failureReason = "";
        var shouldRetry = false;
        try {
            if (signal && signal.aborted) {
                throw new Error("Aborted");
            }
            currentRes = await fetch(url, { ...options, signal });
            // 硬错误守卫：客户端确定性错误（如未授权、权限拒绝、不存在、参数错误）坚决不重试
            if (currentRes.status === 401 || currentRes.status === 403 || currentRes.status === 404 || currentRes.status === 400) {
                currentJson = await currentRes.json().catch(() => ({}));
                return { res: currentRes, json: currentJson };
            }
            if (!currentRes.ok) {
                failureReason = "HTTP " + currentRes.status + " " + currentRes.statusText;
                shouldRetry = true;
            }
            else {
                currentJson = await currentRes.json().catch(() => null);
                // 业务层软错误检测（后端返回了 200，但标记了 networkError 或 partialFailure）
                var isNetworkError = Boolean(currentJson && (currentJson.partialFailure ||
                    currentJson.data?.partialFailure ||
                    currentJson.data?.networkError ||
                    currentJson.data?.auth?.networkError));
                if (isNetworkError) {
                    failureReason = currentJson.error || currentJson.data?.networkErrorReason || "云端接口网络抖动";
                    // 后端已把「确定性失败」（仓库关了 Issues / 仓库不存在 / 无权限）从
                    // networkError 里剥离，只留真正的传输层故障。但历史版本或第三方实现
                    // 仍可能把确定性文本塞进同一条链路，这里再兜一道：命中即放弃重试。
                    shouldRetry = !DETERMINISTIC_HINT_RE.test(String(failureReason));
                }
                else {
                    // 成功获取完整且无网络错误的数据
                    return { res: currentRes, json: currentJson };
                }
            }
        }
        catch (err) {
            if ((signal && signal.aborted) || err.name === "AbortError") {
                throw err;
            }
            failureReason = err.message || "网络连接中断或超时";
            shouldRetry = true;
        }
        // 判断是否已耗尽重试次数
        if (!shouldRetry || attempt > maxRetries) {
            if (currentRes) {
                return { res: currentRes, json: currentJson || {} };
            }
            throw new Error(failureReason || "网络请求失败");
        }
        // 计算阶梯退避等待时间：baseDelayMs * 2^(attempt - 1) + Jitter 自适应微扰
        var exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
        var maxJitter = Math.min(200, Math.floor(exponentialDelay * 0.2));
        var jitter = Math.floor(Math.random() * (maxJitter + 1));
        var totalDelay = exponentialDelay + jitter;
        if (config.onRetry) {
            config.onRetry(attempt, totalDelay, failureReason);
        }
        // 可中断的睡眠等待
        await new Promise((resolve, reject) => {
            var timer = setTimeout(resolve, totalDelay);
            if (signal) {
                signal.addEventListener("abort", () => {
                    clearTimeout(timer);
                    reject(new Error("Aborted"));
                }, { once: true });
            }
        });
    }
}
function parseGitStatText(statText) {
    if (!statText || typeof statText !== "string")
        return null;
    var lines = statText.split("\n");
    var files = [];
    var summary = null;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line)
            continue;
        var summaryMatch = line.match(/(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertions?\(\+\))?(?:,\s+(\d+)\s+deletions?\(-\))?/i);
        if (summaryMatch) {
            summary = {
                filesChanged: parseInt(summaryMatch[1], 10),
                insertions: parseInt(summaryMatch[2] || "0", 10),
                deletions: parseInt(summaryMatch[3] || "0", 10),
            };
            continue;
        }
        var pipeIdx = line.indexOf("|");
        if (pipeIdx > 0) {
            var left = line.slice(0, pipeIdx).trim();
            var right = line.slice(pipeIdx + 1).trim();
            if (left.startsWith('"') && left.endsWith('"') && left.length >= 2) {
                left = left.slice(1, -1);
            }
            if (/^Bin\b/i.test(right)) {
                files.push({ path: left, total: 0, additions: 0, deletions: 0, isBinary: true, rawRight: right });
            }
            else {
                var numMatch = right.match(/^(\d+)(.*)$/);
                if (numMatch) {
                    var total = parseInt(numMatch[1], 10);
                    var graph = numMatch[2].trim();
                    var plusCount = 0;
                    var minusCount = 0;
                    for (var j = 0; j < graph.length; j++) {
                        if (graph[j] === "+")
                            plusCount++;
                        else if (graph[j] === "-")
                            minusCount++;
                    }
                    var additions = 0;
                    var deletions = 0;
                    if (plusCount === 0 && minusCount === 0) {
                        additions = total;
                    }
                    else if (minusCount === 0) {
                        additions = total;
                        deletions = 0;
                    }
                    else if (plusCount === 0) {
                        additions = 0;
                        deletions = total;
                    }
                    else {
                        if (plusCount + minusCount === total) {
                            additions = plusCount;
                            deletions = minusCount;
                        }
                        else {
                            var addExact = Math.round((total * plusCount) / (plusCount + minusCount));
                            additions = addExact;
                            deletions = Math.max(0, total - addExact);
                        }
                    }
                    files.push({ path: left, total, additions, deletions, isBinary: false });
                }
            }
        }
    }
    if (files.length === 0 && !summary)
        return null;
    return { files, summary };
}

// ---- [Bundled: icons.js] ----
/**
 * 官方高清 SVG 矢量组件与图标徽章
 */
function renderOctocat(size = 18, color = "currentColor") {
    return React.createElement("svg", {
        viewBox: "0 0 16 16",
        width: size,
        height: size,
        fill: color,
        style: { flexShrink: 0, display: "inline-block", verticalAlign: "middle" }
    }, React.createElement("path", {
        fillRule: "evenodd",
        clipRule: "evenodd",
        d: "M8 0C3.58 0 0 3.58 0 8C0 11.54 2.29 14.53 5.47 15.59C5.87 15.66 6.02 15.42 6.02 15.21C6.02 15.02 6.01 14.39 6.01 13.72C4 14.09 3.48 13.23 3.32 12.78C3.23 12.55 2.84 11.84 2.5 11.65C2.22 11.5 1.82 11.13 2.49 11.12C3.12 11.11 3.57 11.7 3.72 11.94C4.44 13.15 5.59 12.81 6.05 12.6C6.12 12.08 6.33 11.72 6.56 11.52C4.78 11.32 2.92 10.63 2.92 7.58C2.92 6.71 3.23 5.99 3.74 5.43C3.66 5.23 3.38 4.41 3.82 3.31C3.82 3.31 4.49 3.1 6.02 4.13C6.66 3.95 7.34 3.86 8.02 3.86C8.7 3.86 9.38 3.95 10.02 4.13C11.55 3.09 12.22 3.31 12.22 3.31C12.66 4.41 12.38 5.23 12.3 5.43C12.81 5.99 13.12 6.7 13.12 7.58C13.12 10.65 11.25 11.32 9.47 11.52C9.76 11.77 10.01 12.25 10.01 13C10.01 14.08 10 14.95 10 15.21C10 15.42 10.15 15.67 10.55 15.59C13.71 14.53 16 11.53 16 8C16 3.58 12.42 0 8 0Z"
    }));
}
function renderGitIcon(size = 14, color = "#1296db") {
    return React.createElement("svg", {
        viewBox: "0 0 1024 1024",
        width: size,
        height: size,
        style: { flexShrink: 0, display: "inline-block", verticalAlign: "middle" }
    }, React.createElement("path", {
        fill: color,
        d: "M943.078 472.342L551.076 80.34c-21.859-21.859-57.626-21.859-79.485 0L79.589 472.342c-21.859 21.859-21.859 57.626 0 79.485l392.002 392.002c21.859 21.859 57.626 21.859 79.485 0l392.002-392.002c21.858-21.858 21.858-57.626 0-79.485z m-249.083 113.12c-37.939 0-68.693-30.755-68.693-68.693a68.532 68.532 0 0 1 4.136-23.521l-86.88-86.88v237.369c21.391 11.639 35.908 34.313 35.908 60.378 0 37.939-30.755 68.693-68.693 68.693s-68.693-30.755-68.693-68.693c0-27.314 15.944-50.903 39.03-61.973v-250.25c-23.022-10.642-39.03-33.879-39.03-60.907 0-7.808 1.401-15.272 3.853-22.243L344.061 207.871l44.159-44.159L490.738 266.23c5.58-1.503 11.418-2.378 17.473-2.378 37.076 0 67.132 30.056 67.132 67.132 0 6.055-0.875 11.893-2.378 17.473l102.241 102.241a68.68 68.68 0 0 1 18.789-2.623c37.939 0 68.693 30.755 68.693 68.693s-30.754 68.694-68.693 68.694z"
    }));
}
function renderOctocatBadge(size = 32) {
    return React.createElement("div", {
        className: "dsh-octocat-badge",
        style: {
            width: size + "px",
            height: size + "px",
            borderRadius: Math.round(size * 0.25) + "px",
        }
    }, renderOctocat(Math.round(size * 0.58), "#ffffff"));
}
function renderPluginBadge(hFactory) {
    var h = hFactory;
    return h("button", {
        className: "dsh-github-plugin-badge",
        type: "button",
        title: "本界面由第三方插件 dsh-github-flow 提供（非 DSH / GitHub 官方）。点击查看关于。",
        onClick: function (e) {
            e.stopPropagation();
            e.preventDefault();
            try {
                window.dispatchEvent(new CustomEvent("dsh-github-open-about"));
            }
            catch (err) { }
        },
    }, "插件");
}

// ---- [Bundled: storage.js] ----
/**
 * 本地持久化缓存状态机与偏好配置存储管理
 */
const GLOBAL_OVERVIEW_CACHE_KEY = "dsh_github_global_overview_snapshot_v1";
const SYNC_SETTINGS_STORAGE_KEY = "dsh_github_sync_settings_v1";
const DEFAULT_SYNC_SETTINGS = {
    strategy: "swr", // 'swr' | 'auto' | 'manual'
    cloudSyncIntervalMs: 600000, // 云端定时周期：默认 10 分钟 (600,000ms，下限 5分钟)
    localGitWatch: true, // 本地 .git 改动实时感知 (仅右侧栏当前工作区生效，默认开启)
};
function getLocalSyncSettings() {
    try {
        var raw = localStorage.getItem(SYNC_SETTINGS_STORAGE_KEY);
        if (!raw)
            return DEFAULT_SYNC_SETTINGS;
        var parsed = JSON.parse(raw);
        var merged = Object.assign({}, DEFAULT_SYNC_SETTINGS, parsed);
        if (merged.strategy === "interval" || parsed.cloudAutoSync === true) {
            merged.strategy = "auto";
            saveLocalSyncSettings(merged);
        }
        if (typeof merged.cloudSyncIntervalMs !== "number" || merged.cloudSyncIntervalMs < 300000) {
            merged.cloudSyncIntervalMs = 600000;
        }
        if (typeof parsed.localGitWatch !== "boolean") {
            merged.localGitWatch = true;
        }
        return merged;
    }
    catch (e) {
        return DEFAULT_SYNC_SETTINGS;
    }
}
function saveLocalSyncSettings(settings) {
    try {
        localStorage.setItem(SYNC_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("dsh-github-sync-settings-change", { detail: settings }));
        }
    }
    catch (e) { }
}
function getStoredGlobalOverview() {
    try {
        var raw = localStorage.getItem(GLOBAL_OVERVIEW_CACHE_KEY);
        if (!raw)
            return null;
        var parsed = JSON.parse(raw);
        if (!parsed || !parsed.data) {
            return null;
        }
        if (typeof parsed.savedAt === "number") {
            return parsed;
        }
        return null;
    }
    catch (e) {
        return null;
    }
}
function saveStoredGlobalOverview(data) {
    if (!data || !data.auth || data.auth.networkError) {
        return;
    }
    try {
        localStorage.setItem(GLOBAL_OVERVIEW_CACHE_KEY, JSON.stringify({
            data: data,
            savedAt: Date.now(),
        }));
    }
    catch (e) { }
}
function clearStoredGlobalOverview() {
    try {
        localStorage.removeItem(GLOBAL_OVERVIEW_CACHE_KEY);
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
    }
    catch (e) { }
}
function getCacheStorageMeta() {
    try {
        var raw = localStorage.getItem(GLOBAL_OVERVIEW_CACHE_KEY);
        if (!raw)
            return { exists: false, sizeKb: 0, savedAt: 0 };
        var parsed = JSON.parse(raw);
        var sizeKb = Math.round((raw.length * 2) / 1024 * 10) / 10;
        return { exists: true, sizeKb: sizeKb, savedAt: parsed?.savedAt || 0 };
    }
    catch (e) {
        return { exists: false, sizeKb: 0, savedAt: 0 };
    }
}
function getRightbarStorageKey(cwd) {
    var safe = (cwd || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
    return "dsh_github_rightbar_snapshot_" + safe;
}
function getStoredRightbarSnapshot(cwd) {
    try {
        var key = getRightbarStorageKey(cwd);
        var raw = localStorage.getItem(key);
        if (!raw)
            return null;
        var parsed = JSON.parse(raw);
        if (!parsed || !parsed.data) {
            return null;
        }
        return { data: parsed.data, savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0 };
    }
    catch (e) {
        return null;
    }
}
function saveStoredRightbarData(cwd, data) {
    if (!data || !data.auth || data.auth.networkError)
        return;
    try {
        var key = getRightbarStorageKey(cwd);
        localStorage.setItem(key, JSON.stringify({
            data: data,
            savedAt: Date.now(),
        }));
    }
    catch (e) { }
}
const HEADER_CARDS_STORAGE_KEY = "dsh_github_header_cards_visible_v1";
/**
 * 读取右侧栏上方仓库卡片与快捷操作栏的折叠/展开偏好（默认为 true 展开）
 */
function getStoredHeaderCardsVisible() {
    try {
        var raw = localStorage.getItem(HEADER_CARDS_STORAGE_KEY);
        if (raw === null || raw === undefined)
            return true;
        return raw !== "false";
    }
    catch (e) {
        return true;
    }
}
/**
 * 持久化保存右侧栏上方仓库卡片与快捷操作栏的展开/折叠偏好
 */
function saveStoredHeaderCardsVisible(visible) {
    try {
        localStorage.setItem(HEADER_CARDS_STORAGE_KEY, visible ? "true" : "false");
    }
    catch (e) { }
}

// ---- [Bundled: branch-selector.js] ----
/**
 * 分支查看与快速切换下拉选择器组件
 */
function BranchSelectorDropdown(props) {
    var currentBranch = props.currentBranch || "main";
    var cwd = props.cwd;
    var branchesData = props.branchesData;
    var onBranchSwitched = props.onBranchSwitched || (() => { });
    var showToast = props.showToast || (() => { });
    var [isOpen, setIsOpen] = React.useState(false);
    var [loading, setLoading] = React.useState(false);
    var [switching, setSwitching] = React.useState(false);
    var [branches, setBranches] = React.useState([]);
    var [search, setSearch] = React.useState("");
    var [fetchError, setFetchError] = React.useState(null);
    var containerRef = React.useRef(null);
    React.useEffect(() => {
        if (!isOpen)
            return;
        var handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);
    var toggleOpen = () => {
        if (isOpen) {
            setIsOpen(false);
            return;
        }
        setIsOpen(true);
        setSearch("");
        setFetchError(null);
        if (branchesData && Array.isArray(branchesData.branches) && branchesData.branches.length > 0) {
            setBranches(branchesData.branches);
            setLoading(false);
            return;
        }
        setLoading(true);
        var url = "/api/github/branches" + (cwd ? "?cwd=" + encodeURIComponent(cwd) : "");
        fetch(url)
            .then(async (res) => {
            if (!res.ok) {
                var errText = await res.text().catch(() => "");
                if (res.status === 404 || errText.includes("not found")) {
                    throw new Error("后端分支接口未注册 (404)。请重启 DSH 桌面端以加载新后端服务。");
                }
                throw new Error(`服务响应异常 (${res.status}): ${errText || res.statusText}`);
            }
            return res.json();
        })
            .then((json) => {
            setLoading(false);
            if (json && json.ok && json.data && Array.isArray(json.data.branches)) {
                setBranches(json.data.branches);
            }
            else {
                setFetchError(json.error || "获取分支列表失败");
            }
        })
            .catch((err) => {
            setLoading(false);
            setFetchError(err.message || "读取分支失败");
        });
    };
    var handleSwitch = async (targetBranch) => {
        if (targetBranch === currentBranch || switching)
            return;
        setSwitching(true);
        try {
            var res = await fetch("/api/github/branch-switch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ cwd, branch: targetBranch }),
            }).catch(() => null);
            if (!res || !res.ok) {
                res = await fetch("/api/github/action", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "switch_branch", cwd, branch: targetBranch }),
                });
            }
            if (!res.ok) {
                var errText = await res.text().catch(() => "");
                showToast(`❌ 切换失败：${errText || res.statusText}`);
                return;
            }
            var json = await res.json();
            if (json && json.ok) {
                setIsOpen(false);
                showToast(`✅ 已切换到分支 ${json.currentBranch || targetBranch}`);
                onBranchSwitched(json.currentBranch || targetBranch);
            }
            else {
                showToast(`❌ 切换失败：${json.error || json.message || "未知错误"}`);
            }
        }
        catch (e) {
            showToast(`❌ 切换分支网络请求失败：${e.message || e}`);
        }
        finally {
            setSwitching(false);
        }
    };
    var filtered = branches.filter((b) => !search || b.name.toLowerCase().includes(search.toLowerCase()));
    var localBranches = filtered.filter((b) => !b.isRemote);
    var remoteBranches = filtered.filter((b) => b.isRemote);
    var h = React.createElement;
    return h("div", {
        ref: containerRef,
        style: { position: "relative", display: "inline-block" },
    }, h("button", {
        type: "button",
        className: "dsh-github-branch-btn",
        onClick: toggleOpen,
        title: `当前分支: ${currentBranch}（点击可切换分支）`,
    }, renderGitIcon(12, "currentColor"), h("span", { style: { maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, currentBranch), h("span", { style: { fontSize: "9px", opacity: 0.7, marginLeft: "1px" } }, "▾")), isOpen
        ? h("div", { className: "dsh-github-branch-dropdown" }, h("div", { className: "dsh-github-branch-search" }, h("input", {
            className: "dsh-github-branch-input",
            type: "text",
            placeholder: "搜索分支 (输入关键词)...",
            value: search,
            autoFocus: true,
            onChange: (e) => setSearch(e.target.value),
        })), h("div", { className: "dsh-github-branch-list" }, loading
            ? h("div", { style: { padding: "12px", textAlign: "center", fontSize: "11px", color: "var(--dsw-alias-label-secondary, #656d76)" } }, "⏳ 读取分支中...")
            : fetchError
                ? h("div", { style: { padding: "12px", textAlign: "center", fontSize: "11px", color: "var(--dsw-alias-state-error-primary, #cf222e)" } }, `⚠️ ${fetchError}`)
                : [
                    localBranches.length > 0
                        ? h("div", { key: "hdr-local", style: { padding: "4px 12px", fontSize: "10px", fontWeight: 600, color: "var(--dsw-alias-label-tertiary, #8c8c8c)", textTransform: "uppercase" } }, "本地分支")
                        : null,
                    ...localBranches.map((b) => h("div", {
                        key: b.name,
                        className: "dsh-github-branch-item" + (b.isCurrent ? " active" : ""),
                        onClick: () => handleSwitch(b.name),
                        title: b.subject ? `${b.name}\n${b.subject} (${b.relativeTime})` : b.name,
                    }, h("div", { style: { display: "flex", alignItems: "center", gap: "6px", minWidth: 0 } }, b.isCurrent
                        ? h("span", { style: { color: "var(--dsw-alias-state-success, #2ea043)", fontWeight: 700 } }, "✓")
                        : h("span", { style: { width: "10px" } }), h("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, b.name)), b.relativeTime
                        ? h("span", { style: { fontSize: "10px", color: "var(--dsw-alias-label-tertiary, #8c8c8c)", flexShrink: 0, marginLeft: "6px" } }, b.relativeTime)
                        : null)),
                    remoteBranches.length > 0
                        ? h("div", { key: "hdr-remote", style: { padding: "6px 12px 4px", fontSize: "10px", fontWeight: 600, color: "var(--dsw-alias-label-tertiary, #8c8c8c)", textTransform: "uppercase", borderTop: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.06))", marginTop: "4px" } }, "远程分支 (点击检出)")
                        : null,
                    ...remoteBranches.map((b) => h("div", {
                        key: b.name,
                        className: "dsh-github-branch-item",
                        onClick: () => handleSwitch(b.name),
                        title: b.subject ? `${b.name}\n${b.subject} (${b.relativeTime})` : b.name,
                    }, h("div", { style: { display: "flex", alignItems: "center", gap: "6px", minWidth: 0 } }, h("span", { style: { width: "10px" } }), h("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.85 } }, b.name)), b.relativeTime
                        ? h("span", { style: { fontSize: "10px", color: "var(--dsw-alias-label-tertiary, #8c8c8c)", flexShrink: 0, marginLeft: "6px" } }, b.relativeTime)
                        : null)),
                    filtered.length === 0 && !loading
                        ? h("div", { style: { padding: "12px", textAlign: "center", fontSize: "11px", color: "var(--dsw-alias-label-secondary, #656d76)" } }, "未匹配到任何分支")
                        : null,
                ].filter(Boolean)), switching
            ? h("div", { style: { padding: "6px", textAlign: "center", fontSize: "11px", background: "rgba(9, 105, 218, 0.1)", color: "var(--dsw-alias-link, #0969da)", fontWeight: 500 } }, "正在切换分支...")
            : null)
        : null);
}

// ---- [Bundled: auth-guide-card.js] ----
/**
 * 认证与安装引导卡片组件（响应式自适应中央大面板与右侧栏）
 */
function AuthGuideCard(props) {
    var auth = props ? props.auth : null;
    var onRefresh = props ? props.onRefresh : () => { };
    var isRightbar = Boolean(props && props.isRightbar);
    var [copied, setCopied] = React.useState(false);
    var [launching, setLaunching] = React.useState(false);
    var [toastMsg, setToastMsg] = React.useState(null);
    var isNetwork = Boolean(auth?.networkError);
    var notInstalled = !isNetwork && Boolean(auth && auth.installed === false);
    var notLoggedIn = !isNetwork && !notInstalled && Boolean(!auth?.loggedIn);
    var guide = auth?.installGuide;
    var defaultCmd = isNetwork
        ? "gh auth status"
        : notInstalled
            ? (guide?.command || "winget install --id GitHub.cli")
            : "gh auth login";
    var copyCmd = (cmd) => {
        try {
            if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(cmd);
            }
            else {
                var input = document.createElement("textarea");
                input.value = cmd;
                document.body.appendChild(input);
                input.select();
                document.execCommand("copy");
                document.body.removeChild(input);
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
        catch (e) {
            console.warn("复制失败:", e);
        }
    };
    var launchTerminal = async (cmd) => {
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
                setToastMsg("已唤起系统终端，请在弹出窗口中完成操作；若未弹出，可手动打开终端执行上方命令");
                setTimeout(() => setToastMsg(null), 6000);
            }
            else {
                setToastMsg("❌ " + (json.message || "唤起失败，请手动打开终端执行上方命令"));
            }
        }
        catch (e) {
            setToastMsg("无法连接后台服务，请手动打开终端执行上方命令");
        }
        finally {
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
        }
        catch (e) {
            window.open(url, "_blank", "noopener,noreferrer");
        }
    };
    var openProxySettings = () => {
        try {
            window.dispatchEvent(new CustomEvent("dsh-github-open-proxy"));
        }
        catch (e) { }
    };
    var h = React.createElement;
    return h("div", {
        className: "dsh-github-guide-card " + (isNetwork ? "warning" : notInstalled ? "danger" : "warning"),
        style: isRightbar ? { padding: "12px", marginBottom: "12px" } : undefined
    }, h("div", { className: "dsh-github-guide-header" }, isNetwork
        ? "🌐 无法连接 GitHub 服务器"
        : notInstalled
            ? "⚠️ 未检测到 GitHub CLI (gh)"
            : "🔑 GitHub 账号尚未登录", h("span", { className: "dsh-github-badge " + (isNetwork ? "dsh-badge-yellow" : notInstalled ? "dsh-badge-red" : "dsh-badge-yellow") }, isNetwork ? "网络受限" : notInstalled ? "未安装" : "未认证")), h("div", { className: "dsh-github-guide-desc" }, isNetwork
        ? (auth?.networkErrorReason || "检测到本机已安装 GitHub CLI，但当前无法连接至 api.github.com（网络超时、DNS 无法解析或被系统代理阻断）。")
        : notInstalled
            ? (guide?.description || "DSH GitHub Flow 插件依赖官方 GitHub CLI 工具与云端进行安全交互，当前系统 PATH 中未检测到该工具。")
            : "检测到本机已安装 GitHub CLI，请完成账号授权以解锁仓库管理、PR 审查和 Issues 待办。"), h("div", { className: "dsh-github-cmd-box" }, h("code", null, defaultCmd), h("button", {
        className: "dsh-github-copy-btn " + (copied ? "copied" : ""),
        onClick: () => copyCmd(defaultCmd),
        title: "复制命令到剪贴板"
    }, copied ? "✓ 已复制" : "📋 复制命令")), !notInstalled && !isRightbar
        ? (isNetwork
            ? h("ol", { className: "dsh-github-steps-list" }, h("li", null, "检查系统本地网络连接或 DNS 解析，确认能正常访问 github.com；"), h("li", null, "若使用了网络代理工具，可在下方点击「配置网络代理」填写 HTTP 或 SOCKS5 代理；"), h("li", null, "配置或恢复网络后，切回本面板或点击「重试连接」即可自动同步数据。"))
            : h("ol", { className: "dsh-github-steps-list" }, h("li", null, "打开系统终端（PowerShell / CMD / Terminal），运行上述命令；"), h("li", null, "按提示依次选择「GitHub.com」➜「HTTPS」➜「Login with a web browser」；"), h("li", null, "按回车打开浏览器确认授权后，切回本页面即可自动恢复。")))
        : null, h("div", { className: "dsh-github-guide-actions" }, isNetwork
        ? h("button", {
            className: "dsh-github-action-btn",
            onClick: onRefresh,
            title: "重新发起网络连接校验"
        }, "🔄 重试网络连接")
        : null, isNetwork
        ? h("button", {
            className: "dsh-github-action-btn",
            onClick: openProxySettings,
            title: "打开网络代理设置，配置 HTTP/SOCKS5 代理服务器"
        }, "⚙️ 配置网络代理")
        : null, h("button", {
        className: "dsh-github-action-btn",
        onClick: () => launchTerminal(defaultCmd),
        disabled: launching,
        title: "自动唤起系统终端并执行该命令"
    }, launching ? "正在唤起..." : (isNetwork ? "💻 终端排查状态" : notInstalled ? "💻 唤起终端安装" : "💻 唤起终端登录")), notInstalled
        ? h("button", {
            className: "dsh-github-action-btn",
            onClick: openDownload,
            title: "打开 GitHub CLI 官方下载主页获取安装包"
        }, "🌐 官网安装包 (.msi/.pkg)")
        : null, !isNetwork
        ? h("button", {
            className: "dsh-github-action-btn",
            onClick: function () {
                setToastMsg("正在快速检测登录状态...");
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
                    }
                    else {
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
        }, "🔄 刷新状态")
        : null), toastMsg
        ? h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-link, #0969da)", marginTop: "8px" } }, `ℹ️ ${toastMsg}`)
        : null, h("div", { className: "dsh-github-guide-tip" }, notInstalled
        ? "💡 提示：使用包管理器安装完成后，若未立即识别，可重启 DeepSeek Harness 应用刷新系统环境变量 PATH。"
        : "💡 提示：凭证由官方 GitHub CLI 加密保存在操作系统安全凭据库中，授权完毕切回本窗口将自动识别刷新。"));
}

// ---- [Bundled: upgrade-card.js] ----
/**
 * 通用升级通知与一键升级卡片组件（自适应右侧栏紧凑模式与全景大面板模式）
 */
function UpgradeNotificationCard(props) {
    var updateInfo = props.updateInfo;
    var isRightbar = Boolean(props.isRightbar);
    if (!updateInfo || !updateInfo.hasUpdate)
        return null;
    var storageKey = "dsh_dismissed_update_" + (updateInfo.latestVersion || "latest");
    var [dismissed, setDismissed] = React.useState(function () {
        try {
            return localStorage.getItem(storageKey) === "true";
        }
        catch (e) {
            return false;
        }
    });
    var [status, setStatus] = React.useState("idle");
    var [msg, setMsg] = React.useState("");
    React.useEffect(function () {
        fetch("/api/github/upgrade-status")
            .then(function (res) { return res.json(); })
            .then(function (json) {
            if (json && json.ok && json.data) {
                if (json.data.state === "upgrading") {
                    setStatus("upgrading");
                    setMsg("正在拉取最新版本（约需 5~15 秒）...");
                }
                else if (json.data.state === "success") {
                    setStatus("success");
                    setMsg(json.data.message || "升级成功！已安装最新依赖。");
                }
            }
        })
            .catch(function () { });
    }, []);
    if (dismissed)
        return null;
    var handleUpgrade = async function () {
        if (status === "upgrading")
            return;
        setStatus("upgrading");
        setMsg("正在拉取最新版本（约需 5~15 秒）...");
        try {
            var res = await fetch("/api/github/upgrade", { method: "POST" });
            var json = await res.json().catch(function () { return {}; });
            if (res.ok && json.ok) {
                setStatus("success");
                setMsg(json.message || "升级成功！已安装最新依赖。");
            }
            else {
                setStatus("failed");
                var logText = String(json.log || "");
                var isAgeViolation = json.errorType === "MINIMUM_RELEASE_AGE_VIOLATION" ||
                    logText.includes("ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION") ||
                    logText.includes("minimumReleaseAge") ||
                    (typeof json.message === "string" && (json.message.includes("24 小时安全保护期") || json.message.includes("防投毒")));
                if (isAgeViolation) {
                    // 命中 DSH 内置包管理器 24 小时防投毒策略：收起英文报错堆栈，呈现全中文专业自愈指引
                    setMsg("🛡️ 触发 DSH 新版本 24 小时安全保护期（npm 供应链防投毒策略）。检测到目标版本刚刚发布未满 24 小时，DSH 内置包管理器暂缓了自动升级以保障系统安全。\n\n" +
                        "【推荐操作】：\n" +
                        "1. 立即尝鲜：请先【完全退出关闭 DSH 应用程序】，然后在系统终端执行手动安装命令（点击右侧「📋 复制命令」获取）；\n" +
                        "2. 稍后升级：无需任何操作，发版满 24 小时后直接在此点击「⚡ 一键自动升级」即可平滑完成。");
                }
                else {
                    var logTail = "";
                    if (json.log && typeof json.log === "string") {
                        var lines = json.log.trim().split("\n").filter(function (l) { return l.trim(); });
                        if (lines.length > 0) {
                            logTail = "\n\n📝 日志末尾: " + lines.slice(-4).join(" ⏎ ").slice(0, 400);
                        }
                    }
                    setMsg((json.message || "升级命令执行失败，请在宿主终端手动执行。") + logTail);
                }
            }
        }
        catch (err) {
            setStatus("failed");
            setMsg("无法连接后端执行升级: " + (err.message || err));
        }
    };
    var handleDismiss = function () {
        try {
            localStorage.setItem(storageKey, "true");
        }
        catch (e) { }
        setDismissed(true);
    };
    var handleCopy = function () {
        var cmd = updateInfo.upgradeCommand || "dsh plugin --profile desktop add dsh-github-flow@latest";
        if (navigator.clipboard) {
            navigator.clipboard.writeText(cmd);
            alert("已复制升级命令到剪贴板：\n" + cmd);
        }
        else {
            prompt("请复制升级命令：", cmd);
        }
    };
    var handleReload = function () {
        window.location.reload();
    };
    var h = React.createElement;
    var isAgeViolation = msg.includes("24 小时安全保护期") || msg.includes("防投毒");
    if (isRightbar) {
        return h("div", {
            className: "dsh-github-upgrade-strip",
            style: {
                padding: "10px 12px",
                marginBottom: "12px",
                borderRadius: "8px",
                background: status === "success"
                    ? "var(--dsw-alias-state-success-subtle, rgba(46, 160, 67, 0.12))"
                    : (isAgeViolation
                        ? "rgba(217, 119, 6, 0.12)"
                        : "var(--dsw-alias-bg-module-platform, rgba(9, 105, 218, 0.08))"),
                border: "1px solid " + (status === "success"
                    ? "var(--dsw-alias-state-success-border, rgba(46, 160, 67, 0.35))"
                    : (isAgeViolation
                        ? "rgba(217, 119, 6, 0.35)"
                        : "var(--dsw-alias-border-l2, rgba(9, 105, 218, 0.25))")),
                fontSize: "12px",
            },
        }, h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" } }, h("span", { style: { fontWeight: 600, color: "var(--dsw-alias-label-primary, #1f2328)" } }, status === "success" ? "🎉 升级完成" : (isAgeViolation ? "🛡️ 处于 24h 安全保护期" : "🚀 发现新版 v" + updateInfo.latestVersion)), h("button", {
            onClick: handleDismiss,
            title: "不再提醒此版本",
            style: { background: "none", border: "none", cursor: "pointer", color: "var(--dsw-alias-label-tertiary, #8c8c8c)", fontSize: "14px", padding: 0 },
        }, "✕")), h("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #656d76)", marginBottom: "8px", lineHeight: "1.4" } }, msg || (status === "success"
            ? "需重启 DSH 服务彻底生效后端工具，或刷新网页预览新界面。"
            : "当前: v" + updateInfo.currentVersion + "，推荐升级以获取最新功能。")), h("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } }, status === "success"
            ? h("button", {
                className: "dsh-github-btn-sm",
                onClick: handleReload,
                style: { flex: 1, justifyContent: "center", background: "#2ea043", color: "#fff", borderColor: "#2ea043" },
            }, "🔄 刷新页面")
            : h("button", {
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
            }, status === "upgrading" ? "升级中..." : "⚡ 一键升级"), h("button", {
            className: "dsh-github-btn-sm",
            onClick: handleCopy,
            style: {
                fontSize: "11px",
                padding: "4px 8px",
                ...(status === "failed" ? {
                    background: "var(--dsw-alias-link, #0969da)",
                    color: "#ffffff",
                    borderColor: "var(--dsw-alias-link, #0969da)",
                    fontWeight: 600,
                } : {}),
            },
        }, "📋 复制命令")));
    }
    return h("div", {
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
                : (isAgeViolation
                    ? "linear-gradient(90deg, rgba(217, 119, 6, 0.15) 0%, rgba(245, 158, 11, 0.12) 100%)"
                    : "linear-gradient(90deg, rgba(9, 105, 218, 0.12) 0%, rgba(137, 87, 229, 0.12) 100%)"),
            border: "1px solid " + (status === "success" ? "rgba(46, 160, 67, 0.35)" : (isAgeViolation ? "rgba(217, 119, 6, 0.35)" : "rgba(9, 105, 218, 0.3)")),
            fontSize: "13px",
        },
    }, h("div", { style: { display: "flex", alignItems: "center", gap: "10px" } }, h("span", { style: { fontSize: "20px" } }, status === "success" ? "🎉" : (isAgeViolation ? "🛡️" : "🚀")), h("div", null, h("div", { style: { fontWeight: 600, color: "var(--dsw-alias-label-primary, #1f2328)" } }, status === "success"
        ? "升级完成！新版本 v" + updateInfo.latestVersion + " 已写入"
        : (isAgeViolation
            ? "🛡️ 触发 DSH 新版本 24 小时安全保护期 (供应链防投毒策略)"
            : "发现 dsh-github-flow 新版本 v" + updateInfo.latestVersion + "（当前版本: v" + updateInfo.currentVersion + "）")), h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } }, msg || (status === "success"
        ? "💡 提示：DSH 后端驻留了旧版内存，需重启 DSH 服务彻底生效后端工具；若仅预览界面改动可先刷新网页。"
        : "包含最新 GitHub 工具特性与性能优化，点击右侧可一键自动升级。")))), h("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 } }, status === "success"
        ? h("button", {
            className: "dsh-github-btn-sm",
            onClick: handleReload,
            style: { background: "#2ea043", color: "#fff", borderColor: "#2ea043", padding: "6px 14px", fontWeight: 600 },
        }, "🔄 立即刷新页面")
        : h("button", {
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
        }, status === "upgrading" ? "正在自动升级中..." : "⚡ 一键自动升级"), h("button", {
        className: "dsh-github-btn-sm",
        onClick: handleCopy,
        style: {
            padding: "6px 12px",
            ...(status === "failed" ? {
                background: "var(--dsw-alias-link, #0969da)",
                color: "#ffffff",
                borderColor: "var(--dsw-alias-link, #0969da)",
                fontWeight: 600,
            } : {}),
        },
    }, status === "failed"
        ? (isAgeViolation ? "📋 复制命令 (需先退出DSH)" : "📋 复制命令手动升级")
        : "📋 复制命令"), h("button", {
        onClick: handleDismiss,
        title: "不再提醒此版本",
        style: { background: "none", border: "none", cursor: "pointer", color: "var(--dsw-alias-label-tertiary, #8c8c8c)", fontSize: "16px", padding: "0 4px" },
    }, "✕")));
}

// ---- [Bundled: network-banner.js] ----
/**
 * 网络连接异常与离线状态醒目横幅组件
 */
function NetworkAlertBanner(props) {
    var isRightbar = Boolean(props.isRightbar);
    var reason = props.networkErrorReason || "无法连接至 GitHub API 服务器（网络超时或被防火墙/代理阻断），本次未能获取最新数据。";
    var lastSyncedAt = props.lastSyncedAt || 0;
    var onRefresh = props.onRefresh || (() => { });
    var onOpenProxy = props.onOpenProxy || (() => {
        try {
            window.dispatchEvent(new CustomEvent("dsh-github-open-proxy"));
        }
        catch (e) { }
    });
    var formatTime = function (ts) {
        if (!ts)
            return "未知时间";
        var diff = Date.now() - ts;
        var MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
        if (diff < MIN)
            return "刚刚";
        if (diff < HOUR)
            return Math.floor(diff / MIN) + " 分钟前";
        if (diff < DAY)
            return Math.floor(diff / HOUR) + " 小时前";
        return new Date(ts).toLocaleDateString();
    };
    var h = React.createElement;
    return h("div", {
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
    }, h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px" } }, h("div", { style: { display: "flex", alignItems: "center", gap: "6px", fontWeight: 600, color: "var(--dsw-alias-state-attention-primary, #9a6700)" } }, h("span", null, "⚠️"), h("span", null, "网络连接失败，当前展示离线历史数据")), h("div", { style: { display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 } }, h("button", {
        className: "dsh-github-btn-sm",
        onClick: onRefresh,
        title: "重新发起网络连接刷新",
        style: { padding: "3px 8px", fontSize: "11px", cursor: "pointer" },
    }, "🔄 重试刷新"), h("button", {
        className: "dsh-github-btn-sm",
        onClick: onOpenProxy,
        title: "打开网络代理设置配置 HTTP/SOCKS5 代理",
        style: { padding: "3px 8px", fontSize: "11px", cursor: "pointer" },
    }, "⚙️ 配置代理"))), h("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #656d76)", lineHeight: 1.4 } }, reason + (lastSyncedAt ? `（当前数据快照同步于 ${formatTime(lastSyncedAt)}）` : "")));
}
/**
 * 确定性降级说明条（非错误）。
 *
 * 为什么要与 NetworkAlertBanner 分开：仓库关闭了 Issues、未启用 Discussions
 * 属于仓库的**稳定配置事实**，不是故障。把它塞进「网络连接失败」横幅会产生
 * 三重误导——用户去查网线、客户端启动阶梯重试、自动同步每 5 分钟空转一轮。
 * 这里只做安静陈述：一句话说明为什么列表是空的，不提供重试按钮。
 */
function RepoNoticeBar(props) {
    var notices = Array.isArray(props.notices) ? props.notices.filter(Boolean) : [];
    if (notices.length === 0)
        return null;
    var isRightbar = Boolean(props.isRightbar);
    var h = React.createElement;
    return h("div", {
        className: "dsh-github-repo-notice",
        style: {
            display: "flex",
            flexDirection: "column",
            gap: "3px",
            padding: isRightbar ? "8px 10px" : "10px 14px",
            marginBottom: "10px",
            borderRadius: "8px",
            background: "rgba(84, 174, 255, 0.10)",
            border: "1px solid rgba(84, 174, 255, 0.35)",
            fontSize: "12px",
            color: "var(--dsw-alias-label-primary, #1f2328)",
        },
    }, h("div", { style: { display: "flex", alignItems: "center", gap: "6px", fontWeight: 600 } }, h("span", null, "ℹ️"), h("span", null, "仓库配置提示")), ...notices.map(function (n, i) {
        return h("div", {
            key: "notice-" + i,
            style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #656d76)", lineHeight: 1.5 },
        }, n);
    }));
}

// ---- [Bundled: repo-badges.js] ----
/**
 * 仓库卡片徽章推导（纯函数，无 React 依赖，可被单测直接覆盖）。
 *
 * 为什么独立成模块：`client.ts` 是近 2000 行的巨石，其中的 UI 判定逻辑
 * 只能靠「bundle 里有没有这个字符串」这类弱断言覆盖。把判定规则抽成纯函数后，
 * 「什么情况出什么徽章」可以被真实断言，而不是靠人工目测。
 */
/** 只接受 http/https 的绝对 URL；其余（javascript:、data:、相对路径）一律拒收 */
function safeHttpUrl(raw) {
    if (typeof raw !== 'string' || !raw)
        return null;
    try {
        const u = new URL(raw);
        return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
    }
    catch {
        return null;
    }
}
/**
 * 依据仓库元数据推导展示信息。
 *
 * 三条规则（与上位方案 S4 展示契约对齐，但**不含上游 star**）：
 *   1. `isFork` 为 true → `⑂ fork` 徽章；有 parent 时附带血缘行
 *   2. `viewerPermission` 为 READ / TRIAGE → `🔒 只读` 徽章
 *   3. 其余一律零徽章（保持现有外观）
 *
 * 为什么权限未知时不显示任何徽章：离线数据没有该字段，此时既不能说
 * 「可写」也不能说「只读」——沉默优于猜测。显示一个可能错误的徽章，
 * 比不显示更糟。
 *
 * 为什么不展示上游 star：`parent` 只返回骨架，拿不到 stargazerCount
 * （`--json` 不支持嵌套子字段，实测）；补一次网络往返实测 3~6 秒，
 * 而 star 数不是决策信息。详见 s4 执行方案 §2.1。
 *
 * @param repo RepoMetadata 或 null/undefined（离线、非 Git 工作区）
 */
function resolveRepoBadges(repo) {
    const badges = [];
    let forkLine = null;
    if (!repo || typeof repo !== 'object') {
        return { badges, forkLine };
    }
    // ---- 规则 1：fork ----
    // 用 `=== true` 严格比较：字符串 "true" / 数字 1 都不算——
    // 这类来源不明的真值若被接受，会在数据形态漂移时静默产生错误徽章。
    if (repo.isFork === true) {
        const rawName = typeof repo.parent?.nameWithOwner === 'string' ? repo.parent.nameWithOwner.trim() : '';
        if (rawName) {
            // URL 只信 http/https：parent.url 来自 API 响应，直接塞进 href 会承接
            // 任意协议（javascript:/data:）。校验不过就从 nameWithOwner 重建——
            // 拼出来的地址一定是 https://github.com/<owner>/<repo>，天然安全。
            const parentUrl = safeHttpUrl(repo.parent?.url) || `https://github.com/${rawName}`;
            forkLine = { parentNameWithOwner: rawName, parentUrl };
            badges.push({
                text: '⑂ fork',
                tone: 'purple',
                title: `这是 ${rawName} 的 fork。改动默认提交到你的 fork，需要时再向上游发起 PR。`,
            });
        }
        else {
            // 拿不到上游也必须告诉用户「这是 fork」——那是确定事实
            badges.push({
                text: '⑂ fork',
                tone: 'purple',
                title: '这是一个 fork 仓库（未能解析出上游仓库）。',
            });
        }
    }
    // ---- 规则 2：只读 ----
    // 只认 READ / TRIAGE：这两个档位必然无法写代码。MAINTAIN 及以上均可写。
    const perm = typeof repo.viewerPermission === 'string' ? repo.viewerPermission.toUpperCase() : '';
    if (perm === 'READ' || perm === 'TRIAGE') {
        badges.push({
            text: '🔒 只读',
            tone: 'yellow',
            title: '当前账号对该仓库仅有只读权限，写操作（创建 Issue / PR / 合并等）会被 GitHub 拒绝。' +
                '如需提交改动，请先 fork 到自己的账号（gh repo fork --clone）。',
        });
    }
    return { badges, forkLine };
}

// ---- [Bundled: sync-status-badge.js] ----
/**
 * 数据新鲜度与同步状态微标组件
 */
function SyncStatusBadge(props) {
    var syncStatus = props.syncStatus;
    var lastSyncedAt = props.lastSyncedAt;
    var isRightbar = Boolean(props.isRightbar);
    var text = "";
    var bg = "rgba(101, 109, 118, 0.1)";
    var color = "var(--dsw-alias-label-secondary, #656d76)";
    var formatTimeAgo = function (ts) {
        if (!ts)
            return "刚刚";
        var diffSec = Math.floor((Date.now() - ts) / 1000);
        if (diffSec < 60)
            return "刚刚";
        var diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60)
            return diffMin + "分钟前";
        var diffHour = Math.floor(diffMin / 60);
        if (diffHour < 24)
            return diffHour + "小时前";
        var diffDay = Math.floor(diffHour / 24);
        return diffDay + "天前";
    };
    if (syncStatus === "syncing") {
        text = isRightbar ? "⏳ 同步中..." : "⏳ 后台同步中...";
        bg = "rgba(9, 105, 218, 0.12)";
        color = "var(--dsw-alias-link, #0969da)";
    }
    else if (syncStatus === "fresh") {
        var timeStr = lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : "";
        text = "✅ " + (isRightbar ? "最新" : "已是最新") + (timeStr ? " (" + timeStr + ")" : "");
        bg = "rgba(46, 160, 67, 0.12)";
        color = "var(--dsw-alias-state-success, #2ea043)";
    }
    else if (syncStatus === "cached") {
        text = "📦 本地快照 (" + formatTimeAgo(lastSyncedAt) + ")";
        bg = "rgba(101, 109, 118, 0.12)";
        color = "var(--dsw-alias-label-secondary, #656d76)";
    }
    else if (syncStatus === "failed") {
        text = isRightbar ? "❌ 刷新失败 (离线)" : "❌ 网络断开 (展示离线数据)";
        bg = "rgba(207, 34, 46, 0.12)";
        color = "var(--dsw-alias-state-error-primary, #cf222e)";
    }
    if (!text)
        return null;
    return React.createElement("span", {
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
    }, text);
}

// ---- [Bundled: commit-modal.js] ----
/**
 * 提交详情模态弹窗组件（与设置弹窗同构）
 */
function CommitDetailModal(props) {
    if (!props.commit)
        return null;
    var c = props.commit;
    var h = React.createElement;
    var [fetchedDetail, setFetchedDetail] = React.useState(null);
    var [fetchingDetail, setFetchingDetail] = React.useState(false);
    React.useEffect(function () {
        var onKeyDown = function (e) {
            if (e.key === "Escape" || e.keyCode === 27)
                props.onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return function () { window.removeEventListener("keydown", onKeyDown); };
    }, [props.onClose]);
    React.useEffect(function () {
        setFetchedDetail(null);
        if (c.body || c.stat)
            return;
        setFetchingDetail(true);
        var url = "/api/github/commit-detail?sha=" + encodeURIComponent(c.sha) + (props.cwd ? "&cwd=" + encodeURIComponent(props.cwd) : "");
        fetch(url)
            .then(function (r) { return r.json(); })
            .then(function (j) {
            setFetchingDetail(false);
            if (j && j.ok && j.detail)
                setFetchedDetail(j.detail);
        })
            .catch(function () { setFetchingDetail(false); });
    }, [c.sha, props.cwd]);
    var effectiveBody = c.body;
    var effectiveStat = c.stat;
    if (!effectiveBody && !effectiveStat && fetchedDetail) {
        effectiveStat = fetchedDetail;
    }
    var parsedStat = React.useMemo(() => {
        return effectiveStat && typeof parseGitStatText === "function" ? parseGitStatText(effectiveStat) : null;
    }, [effectiveStat]);
    return h("div", {
        className: "dsh-github-modal-overlay",
        onClick: props.onClose,
        style: { zIndex: 100000 },
    }, h("div", {
        className: "dsh-github-modal-dialog",
        style: { width: "94%", maxWidth: "520px", maxHeight: "86vh", display: "flex", flexDirection: "column", overflow: "hidden" },
        onClick: function (e) { e.stopPropagation(); },
    }, h("div", { className: "dsh-github-modal-header", style: { flexShrink: 0 } }, h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, renderGitIcon(15, "#1296db"), h("h3", { style: { margin: 0, fontSize: "14px", fontWeight: 600 } }, "提交详情")), h("button", {
        style: { background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "var(--dsw-alias-label-secondary, #656d76)", padding: "0 4px" },
        onClick: props.onClose,
        title: "关闭 (Esc)",
    }, "✕")), h("div", {
        className: "dsh-github-modal-body",
        style: { padding: "16px", overflowY: "auto", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: "12px", boxSizing: "border-box" },
    }, h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", opacity: 0.85 } }, h("span", { style: { fontFamily: "monospace", fontWeight: 600, userSelect: "all" }, title: "完整 SHA: " + (c.fullSha || c.sha) }, c.fullSha || c.sha), h("span", null, c.relative)), h("div", { style: { fontSize: "13px", fontWeight: 600, color: "var(--dsw-alias-label-primary, #1f2328)", wordBreak: "break-word", lineHeight: "1.45" } }, c.subject), h("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #656d76)" } }, `提交者: ${c.author}${c.email ? ` <${c.email}>` : ""}${c.date ? ` · ${c.date}` : ""}`), effectiveBody
        ? h("div", {
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
        }, effectiveBody)
        : null, effectiveStat
        ? h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, h("div", {
            style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "11px",
                fontWeight: 600,
            },
        }, h("div", { style: { opacity: 0.85, display: "flex", alignItems: "center", gap: "6px" } }, "📁 文件变更统计", parsedStat?.summary
            ? h("span", { style: { opacity: 0.65, fontWeight: 400 } }, `(${parsedStat.summary.filesChanged} 个文件)`)
            : parsedStat?.files
                ? h("span", { style: { opacity: 0.65, fontWeight: 400 } }, `(${parsedStat.files.length} 个文件)`)
                : null), parsedStat?.summary
            ? h("div", { style: { display: "flex", gap: "6px", fontFamily: "monospace", fontWeight: 600 } }, parsedStat.summary.insertions > 0
                ? h("span", {
                    style: {
                        color: "var(--dsw-alias-state-success-primary, #1a7f37)",
                        backgroundColor: "var(--dsw-alias-state-success-subtle, rgba(46,160,67,0.12))",
                        padding: "1px 6px",
                        borderRadius: "10px",
                    },
                }, `+${parsedStat.summary.insertions}`)
                : null, parsedStat.summary.deletions > 0
                ? h("span", {
                    style: {
                        color: "var(--dsw-alias-state-error-primary, #cf222e)",
                        backgroundColor: "var(--dsw-alias-state-error-subtle, rgba(248,81,73,0.12))",
                        padding: "1px 6px",
                        borderRadius: "10px",
                    },
                }, `-${parsedStat.summary.deletions}`)
                : null)
            : null), parsedStat && parsedStat.files && parsedStat.files.length > 0
            ? h("div", {
                className: "dsh-github-stat-list",
                style: {
                    borderRadius: "6px",
                    border: "1px solid var(--dsw-alias-border-l2, #e1e4e8)",
                    background: "var(--dsw-alias-bg-module-platform, #f6f8fa)",
                    maxHeight: "36vh",
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                },
            }, parsedStat.files.map(function (f, idx) {
                var diffBlocks = [];
                if (!f.isBinary && f.total > 0) {
                    var totalRatio = f.additions + f.deletions;
                    var addBlocks = totalRatio > 0 ? Math.round((f.additions / totalRatio) * 5) : 0;
                    var delBlocks = totalRatio > 0 ? Math.round((f.deletions / totalRatio) * 5) : 0;
                    if (f.additions > 0 && addBlocks === 0)
                        addBlocks = 1;
                    if (f.deletions > 0 && delBlocks === 0)
                        delBlocks = 1;
                    while (addBlocks + delBlocks > 5) {
                        if (addBlocks > delBlocks)
                            addBlocks--;
                        else
                            delBlocks--;
                    }
                    var neutralBlocks = Math.max(0, 5 - addBlocks - delBlocks);
                    for (var bi = 0; bi < addBlocks; bi++) {
                        diffBlocks.push(h("span", { key: "a" + bi, style: { width: "3px", height: "8px", borderRadius: "1px", backgroundColor: "var(--dsw-alias-state-success-primary, #1a7f37)" } }));
                    }
                    for (var bj = 0; bj < delBlocks; bj++) {
                        diffBlocks.push(h("span", { key: "d" + bj, style: { width: "3px", height: "8px", borderRadius: "1px", backgroundColor: "var(--dsw-alias-state-error-primary, #cf222e)" } }));
                    }
                    for (var bk = 0; bk < neutralBlocks; bk++) {
                        diffBlocks.push(h("span", { key: "n" + bk, style: { width: "3px", height: "8px", borderRadius: "1px", backgroundColor: "var(--dsw-alias-border-subtle, rgba(0,0,0,0.15))" } }));
                    }
                }
                return h("div", {
                    key: idx,
                    className: "dsh-github-stat-row",
                    style: {
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "6px 10px",
                        fontSize: "11px",
                        lineHeight: "1.4",
                        borderBottom: idx < parsedStat.files.length - 1 ? "1px solid var(--dsw-alias-border-subtle, rgba(0,0,0,0.06))" : "none",
                        gap: "8px",
                    },
                    title: f.path + (f.isBinary ? " (二进制文件)" : ` (+${f.additions}, -${f.deletions})`),
                }, h("div", {
                    style: {
                        fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                        minWidth: 0,
                        color: "var(--dsw-alias-label-primary, #1f2328)",
                    },
                }, f.path), h("div", {
                    style: {
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        flexShrink: 0,
                        fontFamily: "monospace",
                        fontWeight: 600,
                    },
                }, f.isBinary
                    ? h("span", { style: { opacity: 0.6, fontSize: "10px" } }, "二进制")
                    : [
                        f.additions > 0
                            ? h("span", {
                                key: "add",
                                style: { color: "var(--dsw-alias-state-success-primary, #1a7f37)" },
                            }, `+${f.additions}`)
                            : null,
                        f.deletions > 0
                            ? h("span", {
                                key: "del",
                                style: { color: "var(--dsw-alias-state-error-primary, #cf222e)" },
                            }, `-${f.deletions}`)
                            : null,
                        diffBlocks.length > 0
                            ? h("div", {
                                key: "bar",
                                style: { display: "flex", gap: "1px", marginLeft: "2px", alignItems: "center" },
                            }, ...diffBlocks)
                            : null,
                    ]));
            }))
            : h("pre", {
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
            }, effectiveStat))
        : null, !effectiveBody && !effectiveStat
        ? (fetchingDetail
            ? h("div", { style: { fontSize: "12px", opacity: 0.7, padding: "8px 0" } }, "⏳ 正在获取详细变更说明…")
            : h("div", { style: { fontSize: "11px", opacity: 0.6, fontStyle: "italic", padding: "6px 0" } }, "（该提交未包含多行正文；重启 DSH 桌面端可同步最新格式并直接呈现变更统计）"))
        : null)));
}

// ---- [Bundled: sync-settings-modal.js] ----
/**
 * 全景驾驶舱「⚙️ 设置」模态弹窗组件：左侧分区导航（数据同步 / 网络代理 / 更新设置 / 关于）+ 右侧内容区
 */
function GlobalSyncSettingsModal(props) {
    if (!props.isOpen)
        return null;
    var [activeSection, setActiveSection] = React.useState(props.initialSection || "sync");
    var [strategy, setStrategy] = React.useState(props.currentSettings.strategy || "swr");
    var [localGitWatch, setLocalGitWatch] = React.useState(props.currentSettings.localGitWatch !== false);
    var [cloudSyncIntervalMs, setCloudSyncIntervalMs] = React.useState(Number(props.currentSettings.cloudSyncIntervalMs) || 600000);
    var [cacheMeta, setCacheMeta] = React.useState(getCacheStorageMeta());
    var [clearTip, setClearTip] = React.useState("");
    React.useEffect(function () {
        if (props.isOpen && props.currentSettings) {
            setStrategy(props.currentSettings.strategy || "swr");
            setLocalGitWatch(props.currentSettings.localGitWatch !== false);
            setCloudSyncIntervalMs(Number(props.currentSettings.cloudSyncIntervalMs) || 600000);
        }
    }, [props.isOpen, props.currentSettings]);
    var [updateMode, setUpdateMode] = React.useState("official");
    var [updateBusy, setUpdateBusy] = React.useState(false);
    var [updateMsg, setUpdateMsg] = React.useState(null);
    var [aboutVersion, setAboutVersion] = React.useState(null);
    React.useEffect(function () {
        if (!props.isOpen)
            return;
        fetch("/api/github/update-settings")
            .then(function (r) { return r.json(); })
            .then(function (j) {
            if (j && j.ok && j.data && j.data.mode) {
                setUpdateMode(j.data.mode);
            }
        })
            .catch(function () { });
        fetch("/api/github/check-update")
            .then(function (r) { return r.json(); })
            .then(function (j) {
            if (j && j.ok && j.data && j.data.currentVersion)
                setAboutVersion(j.data.currentVersion);
        })
            .catch(function () { });
    }, [props.isOpen]);
    var [proxyEnabled, setProxyEnabled] = React.useState(false);
    var [proxyUrl, setProxyUrl] = React.useState("");
    var [proxyNoProxy, setProxyNoProxy] = React.useState("localhost,127.0.0.1");
    var [proxyApplyNpm, setProxyApplyNpm] = React.useState(true);
    var [proxyBusy, setProxyBusy] = React.useState(false);
    var [proxyMsg, setProxyMsg] = React.useState(null);
    var [proxyProbe, setProxyProbe] = React.useState(null);
    React.useEffect(function () {
        if (!props.isOpen)
            return;
        fetch("/api/github/proxy")
            .then(function (r) { return r.json(); })
            .then(function (j) {
            if (j && j.ok && j.state) {
                setProxyEnabled(Boolean(j.state.config && j.state.config.url));
                setProxyUrl((j.state.config && j.state.config.url) || "");
                setProxyNoProxy((j.state.config && j.state.config.noProxy) || "localhost,127.0.0.1");
                setProxyApplyNpm(j.state.config ? j.state.config.applyToPackageManager !== false : true);
                if (j.state.lastProbe)
                    setProxyProbe(j.state.lastProbe);
            }
        })
            .catch(function () { });
    }, [props.isOpen]);
    React.useEffect(function () {
        var onKeyDown = function (e) {
            if (e.key === "Escape" || e.keyCode === 27) {
                props.onClose();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return function () { window.removeEventListener("keydown", onKeyDown); };
    }, [props.onClose]);
    React.useEffect(function () {
        if (props.isOpen && props.initialSection) {
            setActiveSection(props.initialSection);
        }
    }, [props.isOpen, props.initialSection]);
    var handleUpdateSave = function () {
        setUpdateBusy(true);
        setUpdateMsg(null);
        fetch("/api/github/update-settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: updateMode }),
        })
            .then(function (r) { return r.json(); })
            .then(function (j) {
            setUpdateBusy(false);
            if (j && j.ok && j.data) {
                var d = j.data;
                var text = "";
                if (d.mode === "off") {
                    text = "✅ 已关闭自动检查更新（/gh upgrade 与一键升级仍可用），无需重启";
                }
                else if (d.probe && d.probe.latestVersion) {
                    text = "✅ 已切换至" + d.description + "，当前最新版本 v" + d.probe.latestVersion
                        + (d.probe.hasUpdate ? "（有可用更新）" : "（已是最新）") + "，无需重启";
                }
                else {
                    text = "✅ 已切换至" + d.description + "，但新源暂时不可达（版本探测失败，稍后会自动重试）；设置已生效，无需重启";
                }
                if (d.persisted === false) {
                    text += "；⚠️ 设置写盘失败，重启后需重新选择";
                }
                setUpdateMsg({ kind: "ok", text: text });
            }
            else {
                setUpdateMsg({ kind: "err", text: (j && j.message) || "保存失败" });
            }
        })
            .catch(function (e) {
            setUpdateBusy(false);
            setUpdateMsg({ kind: "err", text: "网络请求失败: " + (e && e.message ? e.message : e) });
        });
    };
    var h = React.createElement;
    var handleSave = function () {
        var updated = {
            strategy: strategy,
            localGitWatch: localGitWatch,
            cloudSyncIntervalMs: Number(cloudSyncIntervalMs) || 600000,
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
            .then(function (r) { return r.json(); })
            .then(function (j) {
            setProxyBusy(false);
            if (j && j.ok) {
                setProxyMsg({
                    kind: "ok",
                    text: j.state && j.state.config && j.state.config.url
                        ? "🌐 代理已保存并全局生效（驾驶舱 / 右侧栏 / Agent 工具 / 升级链路），无需重启"
                        : "已切换为系统默认网络（直连或系统环境代理），无需重启",
                });
                if (j.state && j.state.lastProbe)
                    setProxyProbe(j.state.lastProbe);
            }
            else {
                setProxyMsg({ kind: "err", text: (j && j.message) || "保存失败" });
            }
        })
            .catch(function (e) {
            setProxyBusy(false);
            setProxyMsg({ kind: "err", text: "网络请求失败: " + (e && e.message ? e.message : e) });
        });
    };
    var handleProxyProbe = function () {
        setProxyBusy(true);
        setProxyMsg(null);
        fetch("/api/github/proxy/probe", { method: "POST" })
            .then(function (r) { return r.json(); })
            .then(function (j) {
            setProxyBusy(false);
            if (j && j.ok && j.probe) {
                setProxyProbe(j.probe);
                setProxyMsg(j.probe.ok
                    ? { kind: "ok", text: "✅ GitHub API 可达 (" + j.probe.latencyMs + "ms)" }
                    : { kind: "err", text: "❌ " + (j.probe.error || "探测失败") });
            }
            else {
                setProxyMsg({ kind: "err", text: (j && j.message) || "探测失败" });
            }
        })
            .catch(function (e) {
            setProxyBusy(false);
            setProxyMsg({ kind: "err", text: "探测请求失败: " + (e && e.message ? e.message : e) });
        });
    };
    return h("div", { className: "dsh-github-modal-overlay", onClick: props.onClose }, h("div", {
        className: "dsh-github-modal-dialog",
        onClick: function (e) { e.stopPropagation(); },
    }, h("div", { className: "dsh-github-modal-header" }, h("h3", { style: { margin: 0, fontSize: "16px", fontWeight: 600 } }, "⚙️ 设置"), h("button", {
        style: { background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "var(--dsw-alias-label-secondary, #656d76)" },
        onClick: props.onClose,
    }, "✕")), h("div", { className: "dsh-github-modal-body" }, h("div", { className: "dsh-github-settings-nav" }, h("button", {
        className: "dsh-github-settings-nav-item" + (activeSection === "sync" ? " active" : ""),
        onClick: function () { setActiveSection("sync"); },
    }, "🔄 数据同步"), h("button", {
        className: "dsh-github-settings-nav-item" + (activeSection === "proxy" ? " active" : ""),
        onClick: function () { setActiveSection("proxy"); },
    }, "🌐 网络代理"), h("button", {
        className: "dsh-github-settings-nav-item" + (activeSection === "update" ? " active" : ""),
        onClick: function () { setActiveSection("update"); },
    }, "⬆️ 更新设置"), h("button", {
        className: "dsh-github-settings-nav-item" + (activeSection === "about" ? " active" : ""),
        onClick: function () { setActiveSection("about"); },
    }, "ℹ️ 关于")), h("div", { className: "dsh-github-settings-content" }, activeSection === "sync" ? h("div", null, h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginBottom: "14px", lineHeight: "1.5" } }, "配置 GitHub 全景驾驶舱的数据拉取节奏。启用秒开模式可利用本地持久化缓存消除每次打开时的漫长等待。"), h("div", { style: { marginBottom: "16px" } }, h("div", { style: { fontSize: "13px", fontWeight: 600, marginBottom: "8px" } }, "数据刷新策略（三选一）"), h("div", {
        className: "dsh-github-radio-card" + (strategy === "swr" ? " active" : ""),
        onClick: function () { setStrategy("swr"); },
    }, h("input", { type: "radio", name: "sync-strategy", className: "dsh-github-radio", checked: strategy === "swr", readOnly: true }), h("div", null, h("div", { style: { fontWeight: 600, fontSize: "13px" } }, "⚡ 秒开展示旧数据 (SWR, 强烈推荐)"), h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } }, "打开立即展示上次本地缓存（0ms秒开），后台静默同步一次最新状态。"))), h("div", {
        className: "dsh-github-radio-card" + (strategy === "auto" ? " active" : ""),
        onClick: function () { setStrategy("auto"); },
    }, h("input", { type: "radio", name: "sync-strategy", className: "dsh-github-radio", checked: strategy === "auto", readOnly: true }), h("div", { style: { flex: 1 } }, h("div", { style: { fontWeight: 600, fontSize: "13px" } }, "☁️ 云端数据定时自动同步 (SWR + 定时轮询)"), h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } }, "首屏秒开旧数据并立即拉新，拉取完成后开始计时；循环静默更新 PR、Issue 与 Actions。内置窗口息屏自动避让，防止耗尽配额。"), strategy === "auto"
        ? h("div", {
            style: { display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" },
            onClick: function (e) { e.stopPropagation(); },
        }, h("span", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", fontWeight: 500 } }, "同步周期:"), h("select", {
            className: "dsh-github-btn-sm",
            style: { padding: "4px 8px", fontSize: "12px", cursor: "pointer", background: "var(--dsw-alias-bg-base, #fff)" },
            value: cloudSyncIntervalMs,
            onChange: function (e) { setCloudSyncIntervalMs(Number(e.target.value)); },
        }, h("option", { value: 300000 }, "5 分钟 (高频感知)"), h("option", { value: 600000 }, "10 分钟 (标准推荐)"), h("option", { value: 1800000 }, "30 分钟 (轻量节省)"), h("option", { value: 3600000 }, "1 小时 (极低频)")))
        : null)), h("div", {
        className: "dsh-github-radio-card" + (strategy === "manual" ? " active" : ""),
        onClick: function () { setStrategy("manual"); },
    }, h("input", { type: "radio", name: "sync-strategy", className: "dsh-github-radio", checked: strategy === "manual", readOnly: true }), h("div", null, h("div", { style: { fontWeight: 600, fontSize: "13px" } }, "📋 仅在手动点击时拉取 (Manual Only)"), h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } }, "打开只浏览本地缓存，绝不自动触发后台 gh 进程，最省电、最省资源；想更新时点击「🔄 刷新」即可。")))), h("div", { style: { marginBottom: "16px", borderTop: "1px solid var(--dsw-alias-border-l2, #e1e4e8)", paddingTop: "14px" } }, h("div", { style: { fontSize: "13px", fontWeight: 600, marginBottom: "8px" } }, "高级自动化与状态感知"), h("label", {
        style: { display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer", padding: "6px 8px", borderRadius: "6px", background: localGitWatch ? "var(--dsw-alias-bg-module-platform, rgba(9, 105, 218, 0.06))" : "transparent" },
    }, h("input", {
        type: "checkbox",
        style: { marginTop: "3px" },
        checked: localGitWatch,
        onChange: function (e) { setLocalGitWatch(e.target.checked); },
    }), h("div", null, h("div", { style: { fontWeight: 600, fontSize: "12px" } }, "📁 本地 Git 改动实时感知 (仅右侧栏生效)"), h("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } }, "定向监听当前仓库的 .git 核心元数据，代码修改、暂存与分支切换毫秒级自动对齐右侧栏，零网络流量消耗；全景首页不挂载，保持轻量。")))), h("div", {
        className: "dsh-github-cache-info-box",
    }, h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, h("span", null, cacheMeta.exists
        ? `📦 本地缓存: 约 ${cacheMeta.sizeKb} KB (上次保存: ${new Date(cacheMeta.savedAt).toLocaleTimeString()})`
        : "📦 暂无本地持久化缓存"), cacheMeta.exists ? h("button", {
        className: "dsh-github-btn-sm",
        style: { padding: "3px 8px", fontSize: "11px", color: "var(--dsw-alias-state-error-primary, #cf222e)" },
        onClick: handleClear,
    }, "🗑️ 清空缓存") : null), clearTip ? h("div", { style: { color: "var(--dsw-alias-state-success, #2ea043)", marginTop: "4px", fontWeight: 500 } }, clearTip) : null)) : activeSection === "update" ? h("div", null, h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginBottom: "14px", lineHeight: "1.5" } }, "选择插件新版本检测所用的 npm 源。检测与升级流量均遵循「🌐 网络代理」分区设置：启用 http/https 代理时自动经代理访问；socks5 代理下 npm 检测为直连（gh 与升级子进程链路仍走代理）。无论选择哪个源，安装与升级流程本身不受影响。"), h("div", { style: { marginBottom: "16px" } }, h("div", { style: { fontSize: "13px", fontWeight: 600, marginBottom: "8px" } }, "更新源"), h("div", {
        className: "dsh-github-radio-card" + (updateMode === "official" ? " active" : ""),
        onClick: function () { setUpdateMode("official"); },
    }, h("input", { type: "radio", className: "dsh-github-radio", checked: updateMode === "official", readOnly: true }), h("div", null, h("div", { style: { fontWeight: 600, fontSize: "13px" } }, "🌍 npm 官方源 (推荐)"), h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } }, "版本全球首发最及时，刚发布的新版立即可见；国内直连可能较慢。"))), h("div", {
        className: "dsh-github-radio-card" + (updateMode === "mirror" ? " active" : ""),
        onClick: function () { setUpdateMode("mirror"); },
    }, h("input", { type: "radio", className: "dsh-github-radio", checked: updateMode === "mirror", readOnly: true }), h("div", null, h("div", { style: { fontWeight: 600, fontSize: "13px" } }, "🇨🇳 国内镜像 (npmmirror)"), h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } }, "阿里云镜像，国内访问快；同步存在分钟级延迟，刚发布的新版可能暂时查不到。"))), h("div", {
        className: "dsh-github-radio-card" + (updateMode === "off" ? " active" : ""),
        onClick: function () { setUpdateMode("off"); },
    }, h("input", { type: "radio", className: "dsh-github-radio", checked: updateMode === "off", readOnly: true }), h("div", null, h("div", { style: { fontWeight: 600, fontSize: "13px" } }, "⛔ 不检查更新"), h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } }, "关闭自动检查与新版提示横幅；/gh upgrade 命令与一键升级仍然可用。")))), h("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } }, h("button", {
        className: "dsh-github-btn-sm dsh-github-primary-btn",
        disabled: updateBusy,
        onClick: handleUpdateSave,
    }, updateBusy ? "验证中..." : "💾 保存并全局应用"), updateMsg ? h("span", {
        style: {
            fontSize: "12px",
            lineHeight: "1.5",
            color: updateMsg.kind === "ok"
                ? "var(--dsw-alias-state-success, #2ea043)"
                : updateMsg.kind === "err"
                    ? "var(--dsw-alias-state-error-primary, #cf222e)"
                    : "var(--dsw-alias-label-secondary, #656d76)",
        },
    }, updateMsg.text) : null)) : activeSection === "about" ? h("div", null, h("div", { style: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" } }, renderOctocatBadge(40), h("div", null, h("div", { style: { fontSize: "15px", fontWeight: 600 } }, "DSH GitHub Flow"), h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } }, "当前版本: v" + (aboutVersion || "…")))), h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginBottom: "14px", lineHeight: "1.6" } }, "让 DeepSeek Harness Agent 拥有操作 GitHub 的原生手脚。原生复用宿主机 gh CLI 安全凭据，深度打通本地 Git 工作区与云端协作，提供 18 大领域 Agent 工具、人类 Slash 指令、Web 全景驾驶舱与一键跨平台升级。"), h("div", { style: { display: "flex", flexDirection: "column", gap: "8px", marginBottom: "14px" } }, h("div", { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" } }, h("span", { style: { minWidth: "64px", color: "var(--dsw-alias-label-secondary, #656d76)" } }, "仓库地址"), h("a", { href: "https://github.com/ItQianChen/dsh-github-flow", target: "_blank", rel: "noopener noreferrer", style: { color: "var(--dsw-alias-link, #0969da)" } }, "github.com/ItQianChen/dsh-github-flow")), h("div", { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" } }, h("span", { style: { minWidth: "64px", color: "var(--dsw-alias-label-secondary, #656d76)" } }, "npm 包"), h("a", { href: "https://www.npmjs.com/package/dsh-github-flow", target: "_blank", rel: "noopener noreferrer", style: { color: "var(--dsw-alias-link, #0969da)" } }, "npmjs.com/package/dsh-github-flow")), h("div", { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" } }, h("span", { style: { minWidth: "64px", color: "var(--dsw-alias-label-secondary, #656d76)" } }, "开源协议"), h("a", { href: "https://github.com/ItQianChen/dsh-github-flow/blob/master/LICENSE", target: "_blank", rel: "noopener noreferrer", style: { color: "var(--dsw-alias-link, #0969da)" } }, "MIT License"))), h("div", {
        className: "dsh-github-about-star-box",
        style: {
            display: "flex",
            alignItems: "center",
            gap: "10px",
        },
    }, h("span", { style: { fontSize: "18px" } }, "⭐"), h("div", { style: { flex: 1, fontSize: "12px", lineHeight: "1.5" } }, "如果这个插件对你的日常研发有帮助，欢迎到 GitHub 仓库点个 Star 支持一下——你的 Star 是持续迭代的动力！也欢迎提交 Issue 与 PR。"), h("a", {
        target: "_blank",
        href: "https://github.com/ItQianChen/dsh-github-flow",
        rel: "noopener noreferrer",
        className: "dsh-github-btn-sm dsh-github-primary-btn",
    }, "🌟 去点 Star"))) : h("div", null, h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginBottom: "14px", lineHeight: "1.5" } }, "设置后插件的 GitHub 数据链路（本页面、右侧栏、Agent 工具调用、版本升级）全部经代理访问；未启用时默认使用系统环境代理或直连。保存后立即生效，无需重启。"), h("label", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", cursor: "pointer", fontSize: "13px" } }, h("input", {
        type: "checkbox",
        checked: proxyEnabled,
        onChange: function (e) { setProxyEnabled(Boolean(e.target.checked)); },
    }), "启用代理"), proxyEnabled ? h("div", null, h("div", { style: { fontSize: "12px", marginBottom: "4px" } }, "代理地址"), h("input", {
        className: "dsh-github-input",
        style: { width: "100%", boxSizing: "border-box", padding: "6px 10px", fontSize: "13px", marginBottom: "10px" },
        placeholder: "http://127.0.0.1:7890 或 socks5h://127.0.0.1:1080（DNS 由代理解析）",
        value: proxyUrl,
        onChange: function (e) { setProxyUrl(e.target.value); },
    }), h("div", { style: { fontSize: "12px", marginBottom: "4px" } }, "NO_PROXY 排除列表（逗号分隔，localhost 与 127.0.0.1 强制包含）"), h("input", {
        className: "dsh-github-input",
        style: { width: "100%", boxSizing: "border-box", padding: "6px 10px", fontSize: "12px", marginBottom: "10px" },
        value: proxyNoProxy,
        onChange: function (e) { setProxyNoProxy(e.target.value); },
    }), h("label", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", cursor: "pointer", fontSize: "12px" } }, h("input", {
        type: "checkbox",
        checked: proxyApplyNpm,
        onChange: function (e) { setProxyApplyNpm(Boolean(e.target.checked)); },
    }), "同时应用于 npm 版本探测与一键升级")) : null, h("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } }, h("button", {
        className: "dsh-github-btn-sm",
        style: { padding: "5px 12px", fontSize: "12px" },
        disabled: proxyBusy || !proxyEnabled,
        onClick: handleProxyProbe,
        title: "经当前配置探测 GitHub API 连通性（约 2.5 秒）",
    }, "🧪 测试连通性"), h("button", {
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
    }, proxyBusy ? "处理中..." : "💾 保存并全局应用"), proxyProbe ? h("span", {
        style: {
            fontSize: "12px",
            fontWeight: 500,
            color: proxyProbe.ok ? "var(--dsw-alias-state-success, #2ea043)" : "var(--dsw-alias-state-error-primary, #cf222e)",
        },
        title: proxyProbe.error || "",
    }, proxyProbe.ok ? "✅ " + proxyProbe.latencyMs + "ms" : "❌ 探测失败") : null), proxyMsg ? h("div", {
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
    }, proxyMsg.text) : null))), h("div", { className: "dsh-github-modal-footer" }, activeSection === "sync" ? h("button", {
        className: "dsh-github-btn-sm",
        style: {
            padding: "6px 16px",
            background: "var(--dsw-alias-link, #0969da)",
            color: "#ffffff",
            borderColor: "var(--dsw-alias-link, #0969da)",
            fontWeight: 600,
        },
        onClick: handleSave,
    }, "保存同步设置") : null, h("button", {
        className: "dsh-github-btn-sm",
        style: { padding: "6px 14px" },
        onClick: props.onClose,
    }, activeSection === "sync" ? "取消" : "完成"))));
}

// ---- [Bundled: help-modal.js] ----
/**
 * 独立沉浸式指南大窗口组件 (Dedicated Large Reader Modal)
 *
 * 核心设计理由与交互契约：
 * 1. 彻底从设置小窗口剥离，打造 920px 宽屏、85vh 高度的沉浸式阅读视界；
 * 2. 深度适配 DSH 主题系统，全套样式基于 CSS 类与主题变量，支持深色 (data-ds-dark-theme) 与浅色无缝自适应；
 * 3. 拒绝技术自嗨清单，从用户行动视角组织：3分钟快速上手、Agent实战Prompt、双界面图解与常见排错；
 * 4. 宽屏卡片排列，配备 Prompt 一键复制到剪贴板与短暂反馈气泡；
 * 5. 监听键盘 Esc 键与遮罩点击秒关，复制完指令直接回到聊天输入框发送，零打扰、不中断工作流。
 */
function GithubHelpModal(props) {
    if (!props.isOpen)
        return null;
    var [activeTab, setActiveTab] = React.useState(props.initialTab || "quickstart");
    var [copiedIdx, setCopiedIdx] = React.useState(-1);
    React.useEffect(function () {
        if (props.isOpen && props.initialTab) {
            setActiveTab(props.initialTab);
        }
    }, [props.isOpen, props.initialTab]);
    React.useEffect(function () {
        var onKeyDown = function (e) {
            if (e.key === "Escape" || e.keyCode === 27) {
                props.onClose();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return function () { window.removeEventListener("keydown", onKeyDown); };
    }, [props.onClose]);
    var handleCopy = function (text, idx) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text);
            setCopiedIdx(idx);
            setTimeout(function () { setCopiedIdx(-1); }, 2000);
        }
        else {
            prompt("请复制提示词：", text);
        }
    };
    var h = React.createElement;
    // 1. 顶部 Tab 导航项
    var tabs = [
        { id: "quickstart", label: "🚀 3分钟极速上手" },
        { id: "prompts", label: "🤖 Agent 提示词实战" },
        { id: "panels", label: "🖥️ 两大界面操作图解" },
        { id: "faq", label: "🔑 常见自愈排错" },
    ];
    // 2. 渲染各 Tab 独立视图
    var renderContent = function () {
        if (activeTab === "quickstart") {
            return h("div", null, h("div", { className: "dsh-github-help-desc", style: { fontSize: "13px", marginBottom: "16px" } }, "欢迎使用 DSH GitHub Flow！本插件让 DeepSeek Harness Agent 具备直接操作 GitHub 仓库的能力，同时为你提供沉浸式的本地与云端协作工作台。跟着下面 3 步即可快速跑通你的第一个人机协作研发闭环："), [
                {
                    step: "1",
                    title: "确认 GitHub CLI 登录状态",
                    desc: "本插件直接复用宿主机已有的安全登录态，绝不触碰任何明文 Token。",
                    actionText: "操作方式：在 DSH 任意聊天框输入 /gh 直接按回车；或查看右侧栏抽屉顶部的账号徽标。若显示未登录，在系统终端执行单行命令 gh auth login 即可完成授权。",
                },
                {
                    step: "2",
                    title: "打开你的代码仓库",
                    desc: "在 DSH 中打开任何包含 .git 的项目文件夹，插件将自动毫秒级绑定当前仓库上下文。",
                    actionText: "无需每次告诉 Agent 仓库叫什么名字，插件底层已自动完成 CWD 工作区绑定，提单与审查均精准面向当前项目。",
                },
                {
                    step: "3",
                    title: "直接向 Agent 下达工作指令",
                    desc: "像和资深研发搭档协作一样，在聊天输入框中直接吩咐 Agent 处理日常 GitHub 任务。",
                    actionText: "初次体验试一试直接对 Agent 说：\n👉 \"查看当前仓库有哪些开放的 PR，总结下改动要点\"",
                },
            ].map(function (s, i) {
                return h("div", { key: i, className: "dsh-github-help-card", style: { display: "flex", gap: "14px", alignItems: "flex-start" } }, h("div", { className: "dsh-github-help-step-badge" }, s.step), h("div", { style: { flex: 1 } }, h("div", { className: "dsh-github-help-title", style: { marginBottom: "4px" } }, s.title), h("div", { className: "dsh-github-help-desc", style: { marginBottom: "6px" } }, s.desc), h("div", { style: { fontSize: "12px", lineHeight: "1.6", whiteSpace: "pre-line", color: "inherit" } }, s.actionText)));
            }));
        }
        if (activeTab === "prompts") {
            var promptCards = [
                {
                    title: "🔀 场景一：自动创建 PR 并发起代码审查",
                    desc: "本地写完代码或实现新功能后，无需打开浏览器手动点点点，让 Agent 自主完成端到端提单。",
                    prompt: "帮我把当前分支创建一个 PR，标题简明概括改动要点，附带详细描述",
                    aiAction: "Agent 自动检查本地当前分支、比对与主干的 diff、推送到远程仓库并创建 GitHub PR，附带优雅的改动说明与关联标记。",
                },
                {
                    title: "🚨 场景二：CI / Actions 门禁报错秒级排查与自动修复",
                    desc: "构建挂了不用在网页反复翻几十页日志，直接吩咐 Agent 定位报错步骤并就地改代码。",
                    prompt: "检查当前仓库最近一次 CI 失败的原因，精确定位报错步骤并帮我尝试修复代码",
                    aiAction: "Agent 自动调用失败日志探测工具，秒级提取具体挂掉的构建步骤输出，精准定位语法/单测异常并就地修改本地代码。",
                },
                {
                    title: "📌 场景三：早会与每日任务待办盘点",
                    desc: "晨会前或开始工作时，一键拉取名下所有关联事项，做到心中有数。",
                    prompt: "帮我看看今天在 GitHub 上分配给我的 Issue 待办与等待我评审的 PR，汇总近期动态",
                    aiAction: "Agent 自动在账号维度跨仓库聚合所有分配给你的议题、等待评审的拉取请求以及提及你的动态，输出整洁紧凑的待办看板。",
                },
                {
                    title: "🛡️ 场景四：代码差异 (Diff) 安全审查与重构建议",
                    desc: "合并前把好最后一关，让大模型充当资深 Tech Lead 开展多维度代码走查。",
                    prompt: "审查当前分支与主干的代码差异 (diff)，检查是否存在潜在 Bug 或安全隐患并给出重构建议",
                    aiAction: "Agent 自动获取改动文件与行级差异，结合工程最佳实践逐项排查边界条件、内存泄漏、空指针与安全漏洞。",
                },
                {
                    title: "💬 场景五：团队方案提案与开源 RFC 研讨",
                    desc: "需要和团队讨论架构思路或征集想法时，直接将讨论沉淀在 GitHub Discussions 知识库中。",
                    prompt: "在当前仓库发起一个关于 '优化前端构建性能' 的 RFC 讨论方案",
                    aiAction: "Agent 自动调用 Discussions 工具在指定分类下发起主题，格式化排版技术方案正文，并返回可供团队直达探讨的链接。",
                },
            ];
            return h("div", null, h("div", { className: "dsh-github-help-desc", style: { fontSize: "13px", marginBottom: "14px" } }, "以下精选了开发者日常研发中最高频的 5 大真实协作场景。点击卡片右侧的「📋 一键复制」按钮，直接粘贴到聊天输入框发给 Agent 即可："), promptCards.map(function (c, idx) {
                var isCopied = copiedIdx === idx;
                return h("div", { key: idx, className: "dsh-github-help-card" }, h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" } }, h("div", { className: "dsh-github-help-title" }, c.title), h("button", {
                    className: "dsh-github-btn-sm",
                    onClick: function () { handleCopy(c.prompt, idx); },
                    style: {
                        padding: "4px 10px",
                        fontSize: "12px",
                        background: isCopied ? "#2ea043" : "var(--dsw-alias-link, #0969da)",
                        color: "#ffffff",
                        borderColor: isCopied ? "#2ea043" : "var(--dsw-alias-link, #0969da)",
                        fontWeight: 600,
                        transition: "all 0.2s ease",
                    },
                }, isCopied ? "✅ 已复制到剪贴板！" : "📋 一键复制 Prompt")), h("div", { className: "dsh-github-help-desc", style: { marginBottom: "10px" } }, c.desc), h("div", { className: "dsh-github-prompt-box" }, `"${c.prompt}"`), h("div", { style: { fontSize: "11px", color: "var(--dsw-alias-state-attention-primary, #d29922)", lineHeight: "1.4" } }, "💡 " + c.aiAction));
            }));
        }
        if (activeTab === "panels") {
            return h("div", null, h("div", { className: "dsh-github-help-desc", style: { fontSize: "13px", marginBottom: "16px" } }, "插件为人类开发者量身打造了两套互补的可视化工作台，消灭频繁在 VS Code、终端与浏览器切屏的上下文丢失痛点："), [
                {
                    title: "1. 全景驾驶舱 (Main Dashboard) —— 掌控全局资产",
                    items: [
                        "打开入口：点击 DSH 最左侧主导航栏的 Octocat 猫咪徽标，瞬间全屏展开；",
                        "SWR 0ms 瞬间秒开：采用本地持久化快照体系，打开界面零转圈、零等待；",
                        "名下仓库一览：一屏透视名下所有 GitHub 仓库、默认分支与 Star 状态，支持一键切换工作区；",
                        "三维待办 Issue 矩阵：智能划分「📥 用户提单（反馈到我名下仓库）」、「🎯 指派待办（分配给我）」与「✍️ 我发起的」，一键药丸筛选；",
                        "全局配置中心：右上方提供数据同步节奏、网络代理与更新源的集中配置弹窗。",
                    ],
                },
                {
                    title: "2. 会话右侧栏面板 (Sidebar Panel) —— 深度协同当前工作区",
                    items: [
                        "打开入口：位于每个会话工作区的右侧抽屉栏，深度锁定当前会话的物理 Git 仓库；",
                        "未提交改动 (Dirty Tab)：实时监听本地未提交文件列表与改动数量，开发改代码一目了然；",
                        "分支查看与安全切换：点击分支名称下拉秒级搜索本地/远程分支；具备未提交变更安全拦截，杜绝代码被冲掉；",
                        "Git 提交时间线 (Git Tab)：清晰三段式呈现待推送（领先）、待拉取（落后）与最近提交，点击任意提交行可弹出 Commit 完整详情弹窗；",
                        "动静解耦架构：修改本地代码只定向查询本地 .git 核心元数据（耗时仅 5ms），绝对不发起远端网络请求，杜绝网络风暴。",
                    ],
                },
            ].map(function (sec, idx) {
                return h("div", { key: idx, className: "dsh-github-help-card" }, h("div", { className: "dsh-github-help-title", style: { marginBottom: "8px" } }, sec.title), h("ul", { style: { margin: 0, paddingLeft: "18px", fontSize: "12px", lineHeight: "1.7", color: "var(--dsw-alias-label-secondary, #8b949e)" } }, sec.items.map(function (it, i) { return h("li", { key: i }, it); })));
            }));
        }
        if (activeTab === "faq") {
            var faqs = [
                {
                    q: "Q1: 界面提示「未登录 GitHub」或「Authentication Required」怎么办？",
                    a: "插件直接复用宿主系统的 GitHub CLI 登录态。请打开系统终端运行命令 `gh auth login`，依次选择 GitHub.com ➔ HTTPS ➔ 网页回车授权，一分钟内即可完成登录。登录完成后刷新界面即可自动识别。",
                },
                {
                    q: "Q2: 提示「缺少权限 (Scope)」或「SCOPE_REQUIRED」怎么办？",
                    a: "当调用项目看板（Projects v2）或云端开发机（Codespaces）时，GitHub 要求专有的 Token Scope。在系统终端执行对应的一键自愈命令完成增量授权即可（无需重新登录）：\n- 项目看板：`gh auth refresh -s read:project`\n- 云端开发机：`gh auth refresh -h github.com -s codespace`",
                },
                {
                    q: "Q3: 点击一键升级提示「处于 24h 安全保护期 (防投毒策略)」怎么办？",
                    a: "这是 DSH 官方内置包管理器针对刚发布未满 24 小时新版本的供应链防投毒安全锁机制。\n- 立即体验：请先【完全退出关闭 DSH 应用程序】，然后在系统终端执行复制的手动安装命令；\n- 稍后升级：无需任何操作，新版本发版满 24 小时后，再次点击一键升级即可自动安装。",
                },
                {
                    q: "Q4: 使用代理节点时偶尔出现网络波动怎么办？",
                    a: "插件内置了 1s ➔ 2s ➔ 4s 的阶梯指数退避重试机制。代理节点若发生短时抖动断流，系统会自动在后台静默发起自愈重试，在节点恢复后瞬间平滑拉取最新数据，不会立刻亮出大红横幅打扰你。同时电脑联网恢复瞬间也会自动触发静默更新。",
                },
            ];
            return h("div", null, h("div", { className: "dsh-github-help-desc", style: { fontSize: "13px", marginBottom: "14px" } }, "常见环境、权限与网络问题的排查与自愈指引："), faqs.map(function (f, idx) {
                return h("div", { key: idx, className: "dsh-github-help-card" }, h("div", { className: "dsh-github-help-title", style: { marginBottom: "6px", fontSize: "13px" } }, f.q), h("div", { className: "dsh-github-help-desc", style: { lineHeight: "1.6", whiteSpace: "pre-line" } }, f.a));
            }));
        }
        return null;
    };
    return h("div", { className: "dsh-github-modal-overlay", onClick: props.onClose }, h("div", {
        className: "dsh-github-help-dialog",
        onClick: function (e) { e.stopPropagation(); },
    }, 
    // 顶部标题栏
    h("div", { className: "dsh-github-help-header" }, h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, h("span", { style: { fontSize: "20px" } }, "📖"), h("h3", { style: { margin: 0, fontSize: "16px", fontWeight: 600, color: "inherit" } }, "DSH GitHub Flow · 使用指南与实战手册")), h("button", {
        style: { background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "var(--dsw-alias-label-secondary, #8b949e)", padding: "0 4px" },
        onClick: props.onClose,
        title: "关闭 (Esc)",
    }, "✕")), 
    // 顶部四分类 Segment 导航栏
    h("div", { className: "dsh-github-help-nav" }, tabs.map(function (t) {
        var isActive = activeTab === t.id;
        return h("button", {
            key: t.id,
            className: "dsh-github-help-tab-btn" + (isActive ? " active" : ""),
            onClick: function () { setActiveTab(t.id); },
        }, t.label);
    })), 
    // 主内容滚动区
    h("div", { className: "dsh-github-help-scroll-body" }, renderContent()), 
    // 底部工具栏
    h("div", { className: "dsh-github-help-footer" }, h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary, #8c959f)" } }, "💡 提示：按键盘 Esc 键可随时快速关闭大窗口返回会话"), h("button", {
        className: "dsh-github-btn-sm",
        style: { padding: "6px 16px", fontWeight: 600 },
        onClick: props.onClose,
    }, "关闭窗口"))));
}


        var currentPluginCtx = null;
        /**
         * 按容器记录的 Tab 键应用互斥显示状态（hidden 页 + active 按钮）。
         * 模块级纯 DOM 操作：渲染函数（switchTab 点击路径）与宿主组件的 effect
         * （SWR 重渲染校正路径）共用——后者是必须的：React 重渲染会按 VDOM 初值
         * 重设 hidden/active，用户手动切的 Tab 会被一次后台数据同步拽回默认页。
         */
        function applyTabState(container, tabKey) {
            container.setAttribute("data-active-tab", tabKey);
            var rightbar = container.closest(".dsh-github-rightbar-container");
            if (rightbar) {
                rightbar.setAttribute("data-active-tab", tabKey);
            }
            var pages = container.querySelectorAll("[data-tab-page]");
            pages.forEach(function (page) {
                page.hidden = page.getAttribute("data-tab-page") !== tabKey;
            });
            var btns = container.querySelectorAll("[data-tab-btn]");
            btns.forEach(function (btn) {
                var active = btn.getAttribute("data-tab-btn") === tabKey;
                btn.classList.toggle("active", active);
                btn.setAttribute("aria-selected", active ? "true" : "false");
            });
        }
        /**
         * 未提交文件原生二级 Git Diff 下钻视图组件（右侧栏内就地渲染，零模态遮罩）
         */
        function UncommittedDiffView(props) {
            var f = props.file;
            var h = React.createElement;
            var [diffData, setDiffData] = React.useState(null);
            var [loading, setLoading] = React.useState(true);
            var [error, setError] = React.useState(null);
            var [copied, setCopied] = React.useState(false);
            React.useEffect(function () {
                var onKeyDown = function (e) {
                    if (e.key === "Escape" || e.keyCode === 27) {
                        props.onBack();
                    }
                };
                window.addEventListener("keydown", onKeyDown);
                return function () { window.removeEventListener("keydown", onKeyDown); };
            }, [props.onBack]);
            React.useEffect(function () {
                setLoading(true);
                setError(null);
                setDiffData(null);
                var fetchDiff = async function () {
                    var primaryUrl = "/api/github/file-diff?file=" + encodeURIComponent(f.path) + (props.cwd ? "&cwd=" + encodeURIComponent(props.cwd) : "");
                    var tryParseResponse = async function (res) {
                        var text = await res.text().catch(function () { return ""; });
                        var json = null;
                        if (text && (text.trim().startsWith("{") || text.trim().startsWith("["))) {
                            try {
                                json = JSON.parse(text);
                            }
                            catch (e) { }
                        }
                        return { ok: res.ok, status: res.status, text: text, json: json };
                    };
                    try {
                        var r1 = await fetch(primaryUrl);
                        var p1 = await tryParseResponse(r1);
                        if (p1.ok && p1.json && p1.json.ok && p1.json.data) {
                            setDiffData(p1.json.data);
                            setLoading(false);
                            return;
                        }
                        // 若主路由遇到 404 (后端常驻进程未重启)，自动降级请求常驻的 /api/github/action 端点
                        if (p1.status === 404) {
                            var r2 = await fetch("/api/github/action", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    action: "get_file_diff",
                                    file: f.path,
                                    cwd: props.cwd || undefined,
                                }),
                            }).catch(function () { return null; });
                            if (r2) {
                                var p2 = await tryParseResponse(r2);
                                if (p2.ok && p2.json && p2.json.data) {
                                    setDiffData(p2.json.data);
                                    setLoading(false);
                                    return;
                                }
                            }
                            setLoading(false);
                            setError("后端对比接口未激活 (404)。请重启 DSH 桌面主程序以载入最新对比引擎；您也可点击上方「在 DSH 中打开」直接预览文件源码。");
                            return;
                        }
                        setLoading(false);
                        setError(p1.json?.error || p1.text || ("查询差异失败 (HTTP " + p1.status + ")"));
                    }
                    catch (err) {
                        setLoading(false);
                        setError(err?.message || "网络请求异常");
                    }
                };
                fetchDiff();
            }, [f.path, props.cwd]);
            var copyDiff = function () {
                if (!diffData?.diff)
                    return;
                if (navigator?.clipboard?.writeText) {
                    navigator.clipboard.writeText(diffData.diff).then(function () {
                        setCopied(true);
                        setTimeout(function () { setCopied(false); }, 2000);
                    }).catch(function () { });
                }
            };
            var statusColor = f.status === "??" ? "var(--dsw-alias-state-success-primary, #1a7f37)"
                : f.status.indexOf("D") >= 0 ? "var(--dsw-alias-state-error-primary, #cf222e)"
                    : "var(--dsw-alias-state-attention-primary, #9a6700)";
            var statusText = f.status === "??" ? "未跟踪新增"
                : f.status.indexOf("D") >= 0 ? "已删除"
                    : f.status.indexOf("R") >= 0 ? "已重命名"
                        : "已修改";
            return h("div", {
                className: "dsh-github-inline-diff-view",
                style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    minHeight: "260px",
                    padding: "4px 0",
                },
            }, 
            // 顶部操作与状态栏
            h("div", {
                style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "6px",
                    paddingBottom: "8px",
                    borderBottom: "1px solid var(--dsw-alias-border-subtle, rgba(0,0,0,0.1))",
                },
            }, h("div", { style: { display: "flex", alignItems: "center", gap: "6px" } }, h("button", {
                className: "dsh-github-btn-sm",
                style: { padding: "3px 8px", cursor: "pointer", fontWeight: 600, fontSize: "11px" },
                onClick: props.onBack,
                title: "返回未提交文件清单 (Esc)",
            }, "← 返回列表"), h("span", {
                className: "dsh-github-badge",
                style: {
                    backgroundColor: statusColor + "22",
                    color: statusColor,
                    fontWeight: 600,
                    fontSize: "11px",
                },
            }, `${f.status} ${statusText}`), diffData && diffData.additions !== undefined
                ? h("div", { style: { display: "flex", gap: "4px", fontSize: "11px", fontFamily: "monospace" } }, h("span", { style: { color: "var(--dsw-alias-state-success-primary, #1a7f37)", fontWeight: 600 } }, `+${diffData.additions}`), h("span", { style: { color: "var(--dsw-alias-state-error-primary, #cf222e)", fontWeight: 600 } }, `-${diffData.deletions}`))
                : null), h("div", { style: { display: "flex", alignItems: "center", gap: "6px" } }, diffData?.diff
                ? h("button", {
                    className: "dsh-github-btn-sm",
                    style: { padding: "3px 8px", fontSize: "11px", cursor: "pointer" },
                    onClick: copyDiff,
                    title: "复制 Unified Diff 原文",
                }, copied ? "✓ 已复制" : "📋 复制 Diff")
                : null, props.onOpenInDsh
                ? h("button", {
                    className: "dsh-github-btn-sm",
                    style: { padding: "3px 8px", fontSize: "11px", cursor: "pointer" },
                    onClick: function () {
                        if (props.onOpenInDsh)
                            props.onOpenInDsh(f.path);
                    },
                    title: "在 DSH 侧边栏打开查看该文件完整源码",
                }, "📄 在 DSH 中打开")
                : null)), 
            // 文件路径栏
            h("div", {
                style: {
                    fontSize: "11px",
                    fontFamily: "monospace",
                    color: "var(--dsw-alias-label-secondary, #656d76)",
                    wordBreak: "break-all",
                    padding: "3px 6px",
                    backgroundColor: "var(--dsw-alias-bg-subtle, rgba(0,0,0,0.03))",
                    borderRadius: "4px",
                },
                title: f.path,
            }, f.path), 
            // Diff 主体内容
            loading
                ? h("div", { style: { padding: "32px 0", textAlign: "center", opacity: 0.65, fontSize: "12px" } }, "⏳ 正在计算 Git 代码比对差异...")
                : error
                    ? h("div", {
                        style: {
                            padding: "16px",
                            color: "var(--dsw-alias-label-primary, #1f2328)",
                            fontSize: "12px",
                            lineHeight: "1.6",
                            backgroundColor: "var(--dsw-alias-bg-subtle, rgba(0,0,0,0.03))",
                            borderRadius: "6px",
                        },
                    }, h("div", { style: { color: "var(--dsw-alias-state-error-primary, #cf222e)", fontWeight: 600, marginBottom: "6px" } }, `⚠️ ${error}`), h("div", { style: { fontSize: "11px", opacity: 0.75 } }, "💡 提示：重启 DSH 桌面主程序即可激活本地比对路由；在此期间您也可点击上方「📄 在 DSH 中打开」直接预览文件源码。"))
                    : diffData?.isBinary
                        ? h("div", { style: { padding: "32px 0", textAlign: "center", opacity: 0.8, fontSize: "12px" } }, "📦 该文件为二进制格式（图片或编译产物），无法直接展示文本差异。")
                        : h("div", {
                            className: "dsh-github-inline-diff-content",
                            style: {
                                margin: 0,
                                padding: "4px 0",
                                fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace",
                                fontSize: "11px",
                                lineHeight: "1.5",
                                overflowX: "auto",
                                maxHeight: "68vh",
                                borderRadius: "6px",
                                border: "1px solid var(--dsw-alias-border-subtle, rgba(0,0,0,0.08))",
                                backgroundColor: "var(--dsw-alias-bg-canvas, #ffffff)",
                            },
                        }, (diffData?.diff || "").split("\n").map(function (line, idx) {
                            var isAdd = line.startsWith("+") && !line.startsWith("+++");
                            var isDel = line.startsWith("-") && !line.startsWith("---");
                            var isHunk = line.startsWith("@@");
                            var isHeader = line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++");
                            var lineStyle = {
                                display: "flex",
                                padding: "0 8px",
                                whiteSpace: "pre",
                                minWidth: "100%",
                                boxSizing: "border-box",
                            };
                            if (isAdd) {
                                lineStyle.backgroundColor = "var(--dsw-alias-state-success-subtle, rgba(46,160,67,0.15))";
                                lineStyle.color = "var(--dsw-alias-state-success-primary, #1a7f37)";
                            }
                            else if (isDel) {
                                lineStyle.backgroundColor = "var(--dsw-alias-state-error-subtle, rgba(248,81,73,0.15))";
                                lineStyle.color = "var(--dsw-alias-state-error-primary, #cf222e)";
                            }
                            else if (isHunk) {
                                lineStyle.backgroundColor = "var(--dsw-alias-bg-subtle, rgba(0,0,0,0.04))";
                                lineStyle.color = "var(--dsw-alias-label-secondary, #656d76)";
                                lineStyle.fontWeight = 600;
                                lineStyle.margin = "2px 0";
                            }
                            else if (isHeader) {
                                lineStyle.color = "var(--dsw-alias-label-muted, #8c959f)";
                                lineStyle.fontSize = "10px";
                            }
                            else {
                                lineStyle.color = "var(--dsw-alias-label-primary, #1f2328)";
                            }
                            return h("div", { key: idx, style: lineStyle }, line || " ");
                        })));
        }
        function renderGithubRepoView(h, data, loading, error, onRefresh, isRightbar = false, updateInfo = null, syncStatus = "", lastSyncedAt = 0, onOpenSettings = null, cwd = null, onSelectCommit = null, gitLogPagination = null, onShowToast = null, onOpenHelp = null, onOpenFile = null, dirtyPagination = null, activeDiffFile = null, onSelectDiffFile = null, onCloseDiff = null, onOpenInDsh = null, headerCardsVisible = true, onToggleHeaderCards = null) {
            var auth = data ? data.auth : null;
            var repo = data ? data.repo : null;
            var prs = (data && data.pullRequests) || [];
            var issues = (data && data.issues) || [];
            var runs = (data && data.runs) || [];
            var effectiveUpdateInfo = updateInfo || data?.updateInfo;
            var upgradeBannerEl = effectiveUpdateInfo && effectiveUpdateInfo.hasUpdate
                ? h(UpgradeNotificationCard, { updateInfo: effectiveUpdateInfo, isRightbar })
                : null;
            var networkAlertBannerEl = (syncStatus === "failed" || auth?.networkError || (error && data))
                ? h(NetworkAlertBanner, {
                    isRightbar,
                    networkErrorReason: auth?.networkErrorReason || error || "连接 GitHub API 超时或网络不可达，本次未能获取最新数据。",
                    lastSyncedAt,
                    onRefresh,
                    onOpenProxy: function () {
                        try {
                            window.dispatchEvent(new CustomEvent("dsh-github-open-proxy"));
                        }
                        catch (e) { }
                    },
                })
                : null;
            // 仓库配置提示条：与网络告警互斥展示。
            // 仓库关了 Issues 时不该同时出现「网络连接失败」——那是两件性质相反的事
            // （一个是稳定配置事实，一个是瞬时传输故障）。有真网络错误时以错误优先。
            var repoNoticeBarEl = networkAlertBannerEl
                ? null
                : h(RepoNoticeBar, { isRightbar, notices: data?.notices });
            var headerEl = h("div", { className: "dsh-github-header" }, h("div", { className: "dsh-github-title" }, renderOctocatBadge(isRightbar ? 26 : 30), h("h2", null, isRightbar ? "GitHub 仓库" : "GitHub 工作台"), renderPluginBadge(h), syncStatus ? h(SyncStatusBadge, { syncStatus, lastSyncedAt, isRightbar }) : null), h("div", { style: { display: "flex", alignItems: "center", gap: "6px" } }, isRightbar && onToggleHeaderCards ? h("button", {
                className: "dsh-github-btn-sm" + (!headerCardsVisible ? " active" : ""),
                onClick: onToggleHeaderCards,
                title: headerCardsVisible ? "收起上方仓库信息与快捷操作栏（增加下方工作区高度）" : "展开上方仓库信息与快捷操作栏",
                style: {
                    padding: "4px 8px",
                    fontSize: "11px",
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                    cursor: "pointer",
                },
                "aria-expanded": headerCardsVisible ? "true" : "false",
            }, headerCardsVisible ? "🔼 收起" : "🔽 展开") : null, h("button", {
                className: "dsh-github-refresh-btn",
                onClick: onRefresh,
                disabled: loading,
            }, loading ? "刷新中..." : "🔄 刷新"), (onOpenHelp || onOpenSettings) ? h("button", {
                className: "dsh-github-btn-sm",
                onClick: () => (onOpenHelp ? onOpenHelp() : (onOpenSettings && onOpenSettings("help"))),
                title: "打开使用帮助与实战手册大窗口（Esc 可退出）",
                style: { padding: "4px 8px", fontSize: "12px" },
            }, "❓") : null, onOpenSettings ? h("button", {
                className: "dsh-github-btn-sm",
                onClick: () => onOpenSettings("sync"),
                title: "配置数据同步节奏、本地缓存、网络代理与插件信息",
                style: { padding: "4px 10px" },
            }, "⚙️") : null));
            var gitSt = data && data.gitStatus;
            var relInfo = data && data.releaseInfo;
            var branchPr = data && data.branchPr;
            // 徽章推导交给纯函数（src/ui/repo-badges.ts）：
            // 判定规则需要可断言，而写在 JSX 里只能靠「bundle 里有没有这个词」检查。
            var repoPresentation = resolveRepoBadges(repo);
            var toneClass = function (tone) {
                return tone === "yellow" ? "dsh-badge-readonly" : "dsh-badge-" + tone;
            };
            var repoBadgesEl = repoPresentation.badges.length > 0
                ? repoPresentation.badges.map(function (b, i) {
                    return h("span", {
                        key: "repo-badge-" + i,
                        className: "dsh-github-badge " + toneClass(b.tone),
                        style: { fontSize: "10px", padding: "0 6px", lineHeight: "16px", flexShrink: 0 },
                        title: b.title,
                    }, b.text);
                })
                : null;
            var repoCardEl = h("div", { className: "dsh-github-card" }, h("div", { className: "dsh-github-card-title", style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, h("span", null, "当前工作区 GitHub 仓库"), repo && repo.stargazerCount !== undefined
                ? h("a", {
                    href: `${repo.url}/stargazers`,
                    target: "_blank",
                    className: "dsh-github-badge",
                    style: {
                        textDecoration: "none",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "3px",
                        fontWeight: 600,
                        fontSize: "11px",
                        cursor: "pointer",
                        padding: "1px 6px",
                    },
                    title: `当前仓库 Star 数量: ${repo.stargazerCount}（点击前往 GitHub 查看）`,
                }, "⭐ ", String(repo.stargazerCount))
                : null), h("div", { className: "dsh-github-card-value" }, repo
                ? h("a", { href: repo.url, target: "_blank", className: "dsh-github-repo-link" }, repo.nameWithOwner)
                : h("span", { style: { color: "var(--dsw-alias-state-error-primary, #cf222e)" } }, "未检测到关联的 GitHub 仓库"), repoBadgesEl, repo
                ? h(BranchSelectorDropdown, {
                    currentBranch: gitSt?.branch || repo.defaultBranch || "main",
                    cwd,
                    branchesData: data?.branches,
                    onBranchSwitched: () => onRefresh(),
                    showToast: onShowToast || (() => { }),
                })
                : null), 
            // fork 血缘行：告诉用户「这个 fork 的上游是谁」，上游名可点击
            repoPresentation.forkLine
                ? h("div", { className: "dsh-github-fork-line" }, "⑂ fork 自 ", h("a", {
                    href: repoPresentation.forkLine.parentUrl,
                    target: "_blank",
                    rel: "noopener noreferrer",
                    title: `打开上游仓库 ${repoPresentation.forkLine.parentNameWithOwner}`,
                }, repoPresentation.forkLine.parentNameWithOwner))
                : null, repo && repo.description
                ? h("div", { className: "dsh-github-card-desc" }, repo.description)
                : null, auth && auth.loggedIn
                ? h("div", { className: "dsh-github-card-subtext" }, `CLI 认证账号: ${auth.user} (${auth.scopes?.join(", ") || "已登录"})`)
                : null, !repo
                ? h("div", { className: "dsh-github-card-subtext" }, "若本地已有 git 仓库，请运行 `git remote add github <url>` 或 `git remote add origin <url>` 关联远程仓库。")
                : null);
            var commitLog = data && data.commitLog;
            var renderCommitRow = function (c, tone) {
                return h("div", {
                    style: { display: "flex", alignItems: "baseline", gap: "8px", padding: "3px 6px", fontSize: "12px", cursor: "pointer", borderRadius: "4px" },
                    className: "dsh-github-commit-row",
                    title: `${c.subject}\n— ${c.author} · ${c.relative} · ${c.sha}\n（点击查看提交详情）`,
                    onClick: function () {
                        if (typeof onSelectCommit === "function") {
                            onSelectCommit(c);
                        }
                    },
                }, h("span", {
                    style: {
                        fontFamily: "monospace",
                        fontSize: "11px",
                        color: tone === "ahead" ? "var(--dsw-alias-state-success-primary, #1a7f37)"
                            : tone === "behind" ? "var(--dsw-alias-state-attention-primary, #9a6700)"
                                : "var(--dsw-alias-label-secondary, #656d76)",
                        flexShrink: 0,
                    },
                }, c.sha), h("span", {
                    style: {
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    },
                }, c.subject), h("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #656d76)", whiteSpace: "nowrap", flexShrink: 0 } }, `${c.author} · ${c.relative}`));
            };
            var gitSectionEl = h("div", { className: "dsh-github-section" }, h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" } }, h("h3", { style: { margin: 0, display: "flex", alignItems: "center", gap: "6px" } }, renderGitIcon(16, "#1296db"), "Git 记录"), relInfo
                ? h(relInfo.url ? "a" : "span", {
                    ...(relInfo.url ? { href: relInfo.url, target: "_blank" } : {}),
                    className: "dsh-github-badge" + (relInfo.isPrerelease ? " dsh-badge-purple" : " dsh-badge-green"),
                    style: { fontSize: "10px", textDecoration: "none", flexShrink: 0 },
                    title: `最新 Release: ${relInfo.tagName}${relInfo.isPrerelease ? "（预发布）" : ""}${formatRelativeTime(relInfo.publishedAt) ? ` · ${formatRelativeTime(relInfo.publishedAt)}发布` : ""}\n点击打开 Release 页`,
                }, `🏷️ ${relInfo.tagName}`)
                : null), gitSt
                ? h("div", {
                    style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", fontSize: "13px", marginBottom: "8px" },
                    title: "ahead/behind 相对上次 git fetch 的快照（非实时）",
                }, h(BranchSelectorDropdown, {
                    currentBranch: gitSt.branch,
                    cwd,
                    branchesData: data?.branches,
                    onBranchSwitched: () => onRefresh(),
                    showToast: onShowToast || (() => { }),
                }), gitSt.hasUpstream
                    ? h("span", null, `${gitSt.ahead > 0 ? "↑" + gitSt.ahead + " " : ""}${gitSt.behind > 0 ? "↓" + gitSt.behind : ""}${gitSt.ahead === 0 && gitSt.behind === 0 ? "✓ 与远程同步" : ""}`)
                    : h("span", { style: { opacity: 0.7 } }, "↑? ↓?（无 upstream）"), gitSt.dirtyCount > 0
                    ? h("span", null, `· ${gitSt.dirtyCount} 文件未提交`)
                    : h("span", null, "· 工作区干净"))
                : null, commitLog && commitLog.aheadCommits && commitLog.aheadCommits.length > 0
                ? h("div", { style: { marginBottom: "10px" } }, h("div", { style: { fontSize: "12px", fontWeight: 600, marginBottom: "4px", color: "var(--dsw-alias-state-success-primary, #1a7f37)" } }, `↑ 本地领先远程 ${commitLog.aheadCommits.length} 个提交（待 push）`), commitLog.aheadCommits.map(function (c, i) { return h("div", { key: "a" + i }, renderCommitRow(c, "ahead")); }))
                : null, commitLog && commitLog.behindCommits && commitLog.behindCommits.length > 0
                ? h("div", { style: { marginBottom: "10px" } }, h("div", { style: { fontSize: "12px", fontWeight: 600, marginBottom: "4px", color: "var(--dsw-alias-state-attention-primary, #9a6700)" } }, `↓ 远程领先本地 ${commitLog.behindCommits.length} 个提交（待 pull · 快照口径）`), commitLog.behindCommits.map(function (c, i) { return h("div", { key: "b" + i }, renderCommitRow(c, "behind")); }))
                : null, (() => {
                var baseRecent = (commitLog && commitLog.recent) || [];
                var extraRecent = (gitLogPagination && gitLogPagination.extraCommits) || [];
                var allRecentCommits = baseRecent.concat(extraRecent);
                var totalCommits = commitLog && commitLog.totalCount;
                var loadingMore = Boolean(gitLogPagination && gitLogPagination.loadingMore);
                var hasMore = Boolean(gitLogPagination && gitLogPagination.hasMore);
                var onLoadMore = gitLogPagination ? gitLogPagination.onLoadMore : null;
                if (allRecentCommits.length === 0)
                    return null;
                return h("div", null, h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" } }, h("div", { style: { fontSize: "12px", fontWeight: 600, opacity: 0.85 } }, "🕘 最近提交"), totalCommits
                    ? h("div", { style: { fontSize: "11px", opacity: 0.6 } }, `${allRecentCommits.length} / ${totalCommits}`)
                    : null), allRecentCommits.map(function (c, i) { return h("div", { key: "r" + (c.sha || i) }, renderCommitRow(c, "recent")); }), h("div", { style: { marginTop: "10px", textAlign: "center" } }, loadingMore
                    ? h("div", { style: { fontSize: "11px", opacity: 0.75, padding: "6px 0" } }, "⏳ 正在加载更多提交…")
                    : (hasMore && onLoadMore)
                        ? h("button", {
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
                        }, `⬇️ 下滑或点击加载更多 (${allRecentCommits.length}${totalCommits ? " / " + totalCommits : ""})`)
                        : (allRecentCommits.length >= 15)
                            ? h("div", { style: { fontSize: "11px", opacity: 0.5, padding: "4px 0" } }, `✓ 已加载全部 ${allRecentCommits.length} 条提交`)
                            : null));
            })(), !commitLog || ((commitLog.aheadCommits || []).length === 0 && (commitLog.behindCommits || []).length === 0 && (commitLog.recent || []).length === 0)
                ? h("div", { className: "dsh-github-empty" }, "无提交记录")
                : null, branchPr
                ? h("div", { className: "dsh-github-item", style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginTop: "8px" } }, h("span", null, "🔀"), branchPr.url
                    ? h("a", { className: "dsh-github-item-title", href: branchPr.url, target: "_blank" }, `PR #${branchPr.number} ${branchPr.title}`)
                    : h("span", { className: "dsh-github-item-title" }, `PR #${branchPr.number} ${branchPr.title}`), branchPr.isDraft ? h("span", { className: "dsh-github-badge dsh-badge-yellow" }, "DRAFT") : null)
                : null);
            var baseDirty = (gitSt && gitSt.dirtyFiles) || [];
            var extraDirty = (dirtyPagination && dirtyPagination.extraDirtyFiles) || [];
            var allDirtyFiles = [];
            var seenDirtyPaths = new Set();
            baseDirty.concat(extraDirty).forEach(function (f) {
                if (f && f.path && !seenDirtyPaths.has(f.path)) {
                    seenDirtyPaths.add(f.path);
                    allDirtyFiles.push(f);
                }
            });
            var visibleDirtyLimit = (dirtyPagination && dirtyPagination.visibleCount) || 15;
            var displayedDirty = allDirtyFiles.slice(0, visibleDirtyLimit);
            var totalDirtyCount = gitSt ? gitSt.dirtyCount : allDirtyFiles.length;
            var hasMoreDirtyToLoad = displayedDirty.length < totalDirtyCount;
            var dirtyHeaderTitle = gitSt && totalDirtyCount > displayedDirty.length
                ? `📁 未提交清单 (${displayedDirty.length} / ${totalDirtyCount})`
                : `📁 未提交清单 (${gitSt ? gitSt.dirtyCount : 0})`;
            var dirtySectionEl = activeDiffFile
                ? h(UncommittedDiffView, {
                    file: activeDiffFile,
                    onBack: onCloseDiff || (() => { }),
                    cwd: cwd,
                    onOpenInDsh: onOpenInDsh,
                })
                : h("div", { className: "dsh-github-section" }, h("div", { className: "dsh-github-section-header" }, h("h3", null, dirtyHeaderTitle)), !gitSt || gitSt.dirtyCount === 0
                    ? h("div", { className: "dsh-github-empty" }, "工作区干净，没有未提交的变更 ✓")
                    : h("div", { style: { fontSize: "12px", lineHeight: "1.9" } }, displayedDirty.map(function (f, i) {
                        var statusColor = f.status === "??" ? "var(--dsw-alias-state-success-primary, #1a7f37)"
                            : f.status.indexOf("D") >= 0 ? "var(--dsw-alias-state-error-primary, #cf222e)"
                                : f.status.indexOf("M") >= 0 || f.status.indexOf("R") >= 0 ? "var(--dsw-alias-state-attention-primary, #9a6700)"
                                    : "inherit";
                        var statusText = f.status === "??" ? "未跟踪新增"
                            : f.status.indexOf("D") >= 0 ? "已删除"
                                : f.status.indexOf("R") >= 0 ? "已重命名"
                                    : "已修改";
                        return h("div", {
                            key: f.path || i,
                            className: "dsh-github-dirty-item",
                            title: `${f.path} (${statusText} [${f.status}])\n点击查看代码改动对比 (Unified Diff)`,
                            onClick: function () {
                                if (typeof onSelectDiffFile === "function") {
                                    onSelectDiffFile(f);
                                }
                            },
                        }, h("span", {
                            style: {
                                minWidth: "24px",
                                textAlign: "center",
                                opacity: 0.85,
                                fontSize: "11px",
                                fontFamily: "monospace",
                                color: statusColor,
                                fontWeight: 600,
                            },
                        }, f.status === "??" ? "??" : f.status), h("span", { style: { wordBreak: "break-all", flex: 1, fontSize: "12px" } }, f.path));
                    }), hasMoreDirtyToLoad
                        ? h("div", { style: { marginTop: "10px", textAlign: "center" } }, dirtyPagination?.loadingMore
                            ? h("div", { style: { fontSize: "11px", opacity: 0.75, padding: "6px 0" } }, "⏳ 正在加载更多未提交变更…")
                            : h("div", {
                                style: {
                                    fontSize: "11px",
                                    opacity: 0.7,
                                    padding: "6px 0",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: "6px",
                                    cursor: "pointer",
                                    borderRadius: "4px",
                                },
                                title: "向下滑动滚轮或点击加载更多",
                                onClick: function () {
                                    if (dirtyPagination && typeof dirtyPagination.onLoadMore === "function") {
                                        dirtyPagination.onLoadMore();
                                    }
                                },
                            }, h("span", null, "⬇️ 向下滑动自动加载"), h("span", { style: { fontFamily: "monospace" } }, `(${displayedDirty.length} / ${totalDirtyCount})`)))
                        : totalDirtyCount > 15
                            ? h("div", { style: { textAlign: "center", fontSize: "11px", opacity: 0.5, padding: "6px 0", marginTop: "8px" } }, `✓ 已加载全部 ${totalDirtyCount} 个未提交变更`)
                            : null));
            // 快捷操作栏 (仅在检测到关联仓库时展示，未绑定仓库时不展示虚假按钮)
            var actionsBarEl = repo ? h("div", { className: "dsh-github-quick-actions" }, h("button", {
                className: "dsh-github-action-btn",
                title: "在系统默认浏览器中打开当前仓库主页",
                onClick: () => {
                    if (repo?.url) {
                        window.open(repo.url, "_blank", "noopener,noreferrer");
                    }
                },
            }, "🌐 浏览器打开"), h("button", {
                className: "dsh-github-action-btn",
                title: "在系统默认浏览器中查看所有 Pull Requests",
                onClick: () => {
                    if (repo?.url) {
                        window.open(`${repo.url}/pulls`, "_blank", "noopener,noreferrer");
                    }
                },
            }, "🔀 查看所有 PRs"), h("button", {
                className: "dsh-github-action-btn",
                title: "在系统默认浏览器中打开 GitHub 官方对比与创建 Pull Request 页面",
                onClick: () => {
                    if (repo?.url) {
                        window.open(`${repo.url}/compare`, "_blank", "noopener,noreferrer");
                    }
                },
            }, "🚀 快速创建 PR"), h("button", {
                className: "dsh-github-action-btn",
                title: "在系统默认浏览器中查看当前仓库所有 Issues",
                onClick: () => {
                    if (repo?.url) {
                        window.open(`${repo.url}/issues`, "_blank", "noopener,noreferrer");
                    }
                },
            }, "📋 查看所有 Issues"), h("button", {
                className: "dsh-github-action-btn",
                title: "在系统默认浏览器中打开 GitHub 官方新建 Issue 页面",
                onClick: () => {
                    if (repo?.url) {
                        window.open(`${repo.url}/issues/new`, "_blank", "noopener,noreferrer");
                    }
                },
            }, "📝 新建 Issue")) : null;
            var prSectionEl = h("div", { className: "dsh-github-section" }, h("div", { className: "dsh-github-section-header" }, h("h3", null, `🔀 Pull Requests (${prs.length})`)), prs.length === 0
                ? h("div", { className: "dsh-github-empty" }, "当前无开放中的 PR")
                : h("div", { className: "dsh-github-list" }, prs.map((pr) => {
                    var ci = rollupCiStatus(pr.statusCheckRollup);
                    var rv = reviewDecisionBadge(pr.reviewDecision);
                    var relTime = formatRelativeTime(pr.updatedAt);
                    return h("div", { key: pr.number, className: "dsh-github-item" }, h("a", {
                        className: "dsh-github-item-title",
                        href: pr.url,
                        target: "_blank",
                        title: relTime ? `更新于 ${pr.updatedAt}` : undefined,
                    }, `${pr.isDraft ? "⚪ " : ""}#${pr.number} ${pr.title}`), h("div", { className: "dsh-github-item-meta" }, h("span", null, `${pr.headRefName} → ${pr.baseRefName}`), pr.mergeable === "CONFLICTING"
                        ? h("span", { className: "dsh-github-badge dsh-badge-red" }, "代码冲突")
                        : h("span", { className: "dsh-github-badge dsh-badge-green" }, "可合并"), ci === "fail"
                        ? h("span", { className: "dsh-github-badge dsh-badge-red" }, "❌ CI 失败")
                        : ci === "pending"
                            ? h("span", { className: "dsh-github-badge dsh-badge-yellow" }, "⏳ CI 运行中")
                            : ci === "pass"
                                ? h("span", { className: "dsh-github-badge dsh-badge-green" }, "✅ CI 通过")
                                : null, rv
                        ? h("span", { className: `dsh-github-badge dsh-badge-${rv.kind}` }, rv.text)
                        : null, relTime ? h("span", null, relTime) : null));
                })));
            var issueSectionEl = h("div", { className: "dsh-github-section" }, h("div", { className: "dsh-github-section-header" }, h("h3", null, `📋 仓库 Issues (${issues.length})`), repo?.url
                ? h("a", {
                    href: `${repo.url}/issues`,
                    target: "_blank",
                    style: { fontSize: "11px", color: "var(--dsw-alias-link, #0969da)", textDecoration: "none" },
                }, "全部 ↗")
                : null), issues.length === 0
                ? h("div", { className: "dsh-github-empty" }, "当前无开放中的 Issue")
                : h("div", { className: "dsh-github-list" }, issues.map((issue) => {
                    var cats = issue.categories || [];
                    var badges = [];
                    if (cats.includes("reported")) {
                        badges.push(h("span", { key: "rep", className: "dsh-github-badge dsh-badge-purple" }, "用户反馈"));
                    }
                    if (cats.includes("assigned")) {
                        badges.push(h("span", { key: "asn", className: "dsh-github-badge dsh-badge-blue" }, "已分配"));
                    }
                    if (cats.includes("created")) {
                        badges.push(h("span", { key: "crt", className: "dsh-github-badge dsh-badge-green" }, "我发起的"));
                    }
                    return h("div", { key: issue.number, className: "dsh-github-item" }, h("div", { style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" } }, h("a", { className: "dsh-github-item-title", href: issue.url, target: "_blank" }, `#${issue.number} ${issue.title}`), ...badges), h("div", { className: "dsh-github-item-meta" }, h("span", null, `由 ${issue.author?.login || "未知"} 提出`), issue.assignees && issue.assignees.length > 0
                        ? h("span", null, `指派: ${issue.assignees.map((a) => a.login).join(", ")}`)
                        : null, issue.labels && issue.labels.length > 0
                        ? issue.labels.map((lbl) => h("span", { key: lbl.name, className: "dsh-github-badge dsh-badge-yellow" }, lbl.name))
                        : null));
                })));
            var runSectionEl = h("div", { className: "dsh-github-section" }, h("div", { className: "dsh-github-section-header" }, h("h3", null, `⚡ 最近 Actions 流水线 (${runs.length})`)), runs.length === 0
                ? h("div", { className: "dsh-github-empty" }, "暂无工作流记录")
                : h("div", { className: "dsh-github-list" }, runs.map((r) => h("div", { key: r.databaseId, className: "dsh-github-item" }, h("a", {
                    className: "dsh-github-item-title",
                    href: r.url,
                    target: "_blank",
                    title: r.createdAt ? `始于 ${r.createdAt}` : undefined,
                }, r.name), h("div", { className: "dsh-github-item-meta" }, h("span", null, `分支: ${r.headBranch}`), r.event ? h("span", null, eventLabel(r.event)) : null, formatRelativeTime(r.createdAt) ? h("span", null, formatRelativeTime(r.createdAt)) : null, r.conclusion === "success"
                    ? h("span", { className: "dsh-github-badge dsh-badge-green" }, "✓ 成功")
                    : r.conclusion === "failure"
                        ? h("span", { className: "dsh-github-badge dsh-badge-red" }, "✕ 失败")
                        : h("span", { className: "dsh-github-badge dsh-badge-yellow" }, r.status)), r.conclusion === "failure"
                    ? h("div", {
                        className: "dsh-github-card-subtext",
                        style: { fontSize: "11px", marginTop: "2px" },
                    }, `💡 让 Agent 调用 github_run(action:'log_failed', run_id:'${r.databaseId}') 提取失败日志定位原因`)
                    : null))));
            var authGuideEl = (!auth?.loggedIn && !auth?.networkError && syncStatus !== "failed")
                ? h(AuthGuideCard, { auth, onRefresh, isRightbar })
                : null;
            var TAB_DEFS = [
                { key: "git", label: "Git", count: null, icon: renderGitIcon(13, "#1296db") },
                { key: "dirty", label: "📁 未提交", count: gitSt ? gitSt.dirtyCount : null },
                { key: "prs", label: "🔀 PR", count: prs.length },
                { key: "issues", label: "📋 Issues", count: issues.length },
                { key: "runs", label: "⚡ Actions", count: runs.length },
            ].filter(function (t) {
                if ((t.key === "git" || t.key === "dirty") && !gitSt)
                    return false;
                return true;
            });
            var defaultTab = gitSt ? "git" : (prs.length === 0 && issues.length > 0 ? "issues" : "prs");
            var switchTab = function (container, tabKey) {
                container.setAttribute("data-active-tab", tabKey);
                applyTabState(container, tabKey);
                var rightbar = container.closest(".dsh-github-rightbar-container");
                if (rightbar) {
                    rightbar.setAttribute("data-active-tab", tabKey);
                }
            };
            var tabsBarEl = h("div", { className: "dsh-github-tabs", style: { marginBottom: "12px" } }, ...TAB_DEFS.map(function (t) {
                var labelText = t.count !== null ? `${t.label} (${t.count})` : t.label;
                return h("button", {
                    key: t.key,
                    className: "dsh-github-tab-btn" + (t.key === defaultTab ? " active" : ""),
                    "data-tab-btn": t.key,
                    style: t.icon ? { display: "inline-flex", alignItems: "center", gap: "5px" } : undefined,
                    onClick: function (e) {
                        var container = e.target.closest("[data-active-tab]");
                        if (container)
                            switchTab(container, t.key);
                    },
                }, t.icon ? [t.icon, " ", labelText] : labelText);
            }));
            var tabbedContentEl = h("div", { "data-active-tab": defaultTab }, tabsBarEl, h("div", { "data-tab-page": "prs", hidden: defaultTab !== "prs" }, prSectionEl), h("div", { "data-tab-page": "issues", hidden: defaultTab !== "issues" }, issueSectionEl), h("div", { "data-tab-page": "runs", hidden: defaultTab !== "runs" }, runSectionEl), gitSt ? h("div", { "data-tab-page": "git", hidden: defaultTab !== "git" }, gitSectionEl) : null, gitSt ? h("div", { "data-tab-page": "dirty", hidden: defaultTab !== "dirty" }, dirtySectionEl) : null);
            return [
                headerEl,
                networkAlertBannerEl,
                repoNoticeBarEl,
                upgradeBannerEl,
                authGuideEl,
                headerCardsVisible ? repoCardEl : null,
                headerCardsVisible ? actionsBarEl : null,
                tabbedContentEl,
            ].filter(Boolean);
        }
        // 1. 右侧栏专属视图 (Right Sidebar Tab Body)
        function GithubRightbarBody(props) {
            var sessionId = props ? props.sessionId : null;
            var cwd = null;
            if (props && typeof props.useSessions === "function" && sessionId) {
                try {
                    cwd = props.useSessions((sessions) => sessions?.byId?.[sessionId]?.cwd) || null;
                }
                catch (e) { }
            }
            var initialSettings = React.useMemo(() => getLocalSyncSettings(), []);
            var [syncSettings, setSyncSettings] = React.useState(initialSettings);
            var initialSnapshot = React.useMemo(() => getStoredRightbarSnapshot(cwd), [cwd]);
            var [data, setData] = React.useState(initialSnapshot?.data || null);
            var [syncStatus, setSyncStatus] = React.useState(initialSnapshot ? "cached" : "loading");
            var [lastSyncedAt, setLastSyncedAt] = React.useState(initialSnapshot?.savedAt || 0);
            var [loading, setLoading] = React.useState(false);
            var [error, setError] = React.useState(null);
            var [updateInfo, setUpdateInfo] = React.useState(null);
            var [toastMsg, setToastMsg] = React.useState(null);
            var cloudTimerRef = React.useRef(null);
            var dataRef = React.useRef(data);
            dataRef.current = data;
            var lastCwdRef = React.useRef(cwd);
            var containerRef = React.useRef(null);
            var showToast = (msg) => {
                setToastMsg(msg);
                setTimeout(() => setToastMsg(null), 5000);
            };
            React.useEffect(() => {
                if (lastCwdRef.current === cwd)
                    return;
                lastCwdRef.current = cwd;
                var snap = getStoredRightbarSnapshot(cwd);
                setData(snap?.data || null);
                setSyncStatus(snap ? "cached" : "loading");
                setLastSyncedAt(snap?.savedAt || 0);
                setError(null);
            }, [cwd]);
            React.useEffect(function () {
                var onSettingsChange = function (e) {
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
            React.useEffect(() => {
                var timer = setTimeout(function () {
                    fetch("/api/github/check-update")
                        .then(function (res) { return res.json(); })
                        .then(function (json) {
                        if (json && json.ok && json.data) {
                            setUpdateInfo(json.data);
                        }
                    })
                        .catch(function () { });
                }, 300);
                return function () { clearTimeout(timer); };
            }, []);
            var loadData = React.useCallback(async (forceRefresh = false) => {
                if (!forceRefresh && syncSettings.strategy === "manual" && dataRef.current) {
                    return;
                }
                if (forceRefresh || !dataRef.current) {
                    setLoading(true);
                }
                setSyncStatus(dataRef.current ? "syncing" : "loading");
                setError(null);
                var controller = new AbortController();
                var timedOut = false;
                var timer = setTimeout(function () { timedOut = true; controller.abort(); }, 45000);
                try {
                    if (forceRefresh) {
                        await fetch("/api/github/refresh", { method: "POST", signal: controller.signal }).catch(() => { });
                    }
                    var url = "/api/github/overview";
                    var params = [];
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
                    // 接入 1s/2s/4s 阶梯退避重试，平滑吸收代理节点与网络的偶发抖动断流
                    var { res, json } = await fetchWithRetry(url, {}, {
                        signal: controller.signal,
                        maxRetries: 3,
                        baseDelayMs: 1000,
                        onRetry: (attempt) => {
                            setSyncStatus("syncing");
                            setError(`网络抖动，正在自愈重试 (${attempt}/3)...`);
                        },
                    });
                    if (!res.ok) {
                        var errText = (typeof json === "string" ? json : JSON.stringify(json)) || res.statusText;
                        var msg = `后端服务未就绪 (${res.status}): ${errText}`;
                        setSyncStatus("failed");
                        setError(msg);
                        if (forceRefresh) {
                            showToast("❌ 刷新失败：" + msg);
                        }
                        return;
                    }
                    if (json.ok && json.data) {
                        var isFail = Boolean(json.partialFailure ||
                            json.data.partialFailure ||
                            json.data.networkError ||
                            json.data.auth?.networkError ||
                            json.error);
                        var failReason = String(json.error ||
                            json.fetchError ||
                            json.data.networkErrorReason ||
                            json.data.auth?.networkErrorReason ||
                            "拉取云端数据失败");
                        if (isFail) {
                            setSyncStatus("failed");
                            setError(failReason);
                            // 失败响应也可能携带「本次新鲜解析」的仓库身份与认证态（后端在
                            // 回退旧快照时已用新鲜 repo 覆盖旧值）。身份字段永远采纳，
                            // 业务列表才走「非空才覆盖」的防冲刷策略。
                            //
                            // 为什么必须拆开：旧逻辑把「要不要整体替换」和「列表是否有内容」
                            // 绑在一起，于是仓库身份修正会被空列表连坐否决——用户换了 remote
                            // 之后面板永远显示旧仓库，刷新也救不回来。
                            var curData = dataRef.current;
                            if (curData) {
                                var hasFreshList = (json.data.pullRequests?.length > 0 || json.data.issues?.length > 0);
                                setData(function (prev) {
                                    if (!prev)
                                        return json.data;
                                    var merged = {
                                        ...prev,
                                        // 身份 / 认证 / 通知：始终采纳最新（这些字段不可能是「空数据假象」）
                                        repo: json.data.repo || prev.repo,
                                        auth: json.data.auth || prev.auth,
                                        notices: json.data.notices,
                                        updateInfo: json.data.updateInfo || prev.updateInfo,
                                        lastUpdated: json.data.lastUpdated || prev.lastUpdated,
                                    };
                                    // 业务列表：仅有新内容时才替换，防止把「好数据」冲刷成空数组
                                    if (hasFreshList) {
                                        merged.pullRequests = json.data.pullRequests;
                                        merged.issues = json.data.issues;
                                        merged.issueStats = json.data.issueStats;
                                    }
                                    if (json.data.runs?.length > 0) {
                                        merged.runs = json.data.runs;
                                    }
                                    return merged;
                                });
                            }
                            else {
                                setData(json.data);
                            }
                            if (forceRefresh) {
                                showToast("❌ 刷新失败：" + failReason);
                            }
                        }
                        else {
                            setData(json.data);
                            // 落快照前统一判定：带离线标记的数据不写（saveStoredRightbarData 内部还有一道），
                            // 且身份变更后的快照会覆盖旧键——localStorage 的 key 是 cwd，天然随路径对齐。
                            saveStoredRightbarData(cwd, json.data);
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
                    }
                    else if (dataRef.current) {
                        setSyncStatus("failed");
                        var failMsg = json.error || "获取状态失败";
                        setError(failMsg);
                        if (forceRefresh) {
                            showToast("❌ 刷新失败：" + failMsg);
                        }
                    }
                    else {
                        setError(json.error || "获取状态失败");
                    }
                }
                catch (err) {
                    setSyncStatus("failed");
                    var catchFailReason = (timedOut || err.name === "AbortError")
                        ? "网络连接超时 (45 秒)：请检查网络或在代理设置中放行 127.0.0.1"
                        : (err.message || "网络异常");
                    setError(catchFailReason);
                    if (forceRefresh) {
                        showToast("❌ 刷新失败：" + catchFailReason);
                    }
                }
                finally {
                    clearTimeout(timer);
                    setLoading(false);
                    if (syncSettings.strategy === "auto") {
                        scheduleNextCloudSync();
                    }
                }
            }, [cwd, sessionId, syncSettings.strategy]);
            var scheduleNextCloudSync = React.useCallback(() => {
                if (cloudTimerRef.current)
                    clearTimeout(cloudTimerRef.current);
                if (syncSettings.strategy !== "auto")
                    return;
                var interval = Math.max(300000, Number(syncSettings.cloudSyncIntervalMs) || 600000);
                cloudTimerRef.current = setTimeout(() => {
                    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
                        var onVisible = () => {
                            if (document.visibilityState === "visible") {
                                document.removeEventListener("visibilitychange", onVisible);
                                loadData(false);
                            }
                        };
                        document.addEventListener("visibilitychange", onVisible);
                        return;
                    }
                    loadData(false);
                }, interval);
            }, [syncSettings.strategy, syncSettings.cloudSyncIntervalMs, loadData]);
            React.useEffect(() => {
                if (cloudTimerRef.current)
                    clearTimeout(cloudTimerRef.current);
                if (syncSettings.strategy === "swr" || syncSettings.strategy === "auto") {
                    var timer = setTimeout(function () { loadData(false); }, 300);
                    return function () {
                        clearTimeout(timer);
                        if (cloudTimerRef.current)
                            clearTimeout(cloudTimerRef.current);
                    };
                }
                else if (!dataRef.current) {
                    loadData(false);
                }
                return function () {
                    if (cloudTimerRef.current)
                        clearTimeout(cloudTimerRef.current);
                };
            }, [cwd, sessionId, syncSettings.strategy, syncSettings.cloudSyncIntervalMs, loadData]);
            // 纯本地 Git 状态局部刷新：只更新未提交改动(Dirty)、分支与提交记录，彻底切断连带远端网络风暴
            var refreshLocalGit = React.useCallback(async () => {
                if (!cwd)
                    return;
                try {
                    var res = await fetch("/api/github/local-git-status?cwd=" + encodeURIComponent(String(cwd)));
                    if (!res.ok)
                        return;
                    var json = await res.json().catch(() => null);
                    if (json && json.ok && json.data) {
                        setData((prev) => {
                            if (!prev)
                                return prev;
                            var next = {
                                ...prev,
                                gitStatus: json.data.gitStatus !== undefined ? json.data.gitStatus : prev.gitStatus,
                                commitLog: json.data.commitLog !== undefined ? json.data.commitLog : prev.commitLog,
                                branches: json.data.branches !== undefined ? json.data.branches : prev.branches,
                            };
                            saveStoredRightbarData(cwd, next);
                            return next;
                        });
                    }
                }
                catch {
                    // 纯本地静默更新，网络异常或组件卸载不打扰用户
                }
            }, [cwd]);
            React.useEffect(() => {
                if (!syncSettings.localGitWatch || !cwd || !data?.repo)
                    return;
                var aborted = false;
                var watchController = new AbortController();
                var pollWatch = async () => {
                    while (!aborted) {
                        try {
                            var res = await fetch("/api/github/git-watch?cwd=" + encodeURIComponent(String(cwd)), {
                                signal: watchController.signal,
                            });
                            if (!res.ok) {
                                await new Promise((r) => setTimeout(r, 6000));
                                continue;
                            }
                            var json = await res.json().catch(() => null);
                            if (aborted)
                                break;
                            if (json && json.changed) {
                                // 仅局部刷新本地未提交文件、分支与提交记录，零网络流量，彻底切断连带远端网络风暴！
                                refreshLocalGit();
                            }
                        }
                        catch (err) {
                            if (aborted || err.name === "AbortError")
                                break;
                            await new Promise((r) => setTimeout(r, 6000));
                        }
                    }
                };
                pollWatch();
                return () => {
                    aborted = true;
                    watchController.abort();
                };
            }, [cwd, data?.repo, syncSettings.localGitWatch, refreshLocalGit]);
            React.useEffect(() => {
                var container = containerRef && containerRef.current;
                if (!container)
                    return;
                var active = container.getAttribute("data-active-tab");
                if (active)
                    applyTabState(container, active);
            }, [data]);
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
                            .catch(function () { });
                    }
                    else if (syncSettings.localGitWatch && data?.repo) {
                        // 聚焦时若开启了本地 Git 监听，仅局部刷新本地状态，杜绝多余远端请求
                        refreshLocalGit();
                    }
                };
                var onOnline = () => {
                    // 监听网络由断网恢复连接瞬间，自动静默发起一次全量同步，消除离线警告横幅并拉新
                    loadData(false);
                };
                window.addEventListener("focus", onFocus);
                window.addEventListener("online", onOnline);
                return () => {
                    window.removeEventListener("focus", onFocus);
                    window.removeEventListener("online", onOnline);
                };
            }, [data, loadData, refreshLocalGit, syncSettings.localGitWatch]);
            var [aboutModalOpen, setAboutModalOpen] = React.useState(false);
            var [rightbarModalOpen, setRightbarModalOpen] = React.useState(false);
            var [rightbarModalSection, setRightbarModalSection] = React.useState("sync");
            var [helpModalOpen, setHelpModalOpen] = React.useState(false);
            var [selectedCommit, setSelectedCommit] = React.useState(null);
            var [extraCommits, setExtraCommits] = React.useState([]);
            var [loadingMore, setLoadingMore] = React.useState(false);
            var [hasMoreCommits, setHasMoreCommits] = React.useState(true);
            var [visibleDirtyCount, setVisibleDirtyCount] = React.useState(15);
            var [extraDirtyFiles, setExtraDirtyFiles] = React.useState([]);
            var [loadingMoreDirty, setLoadingMoreDirty] = React.useState(false);
            var [hasMoreDirty, setHasMoreDirty] = React.useState(true);
            var [activeDiffFile, setActiveDiffFile] = React.useState(null);
            var [headerCardsVisible, setHeaderCardsVisible] = React.useState(() => getStoredHeaderCardsVisible());
            var toggleHeaderCards = React.useCallback(() => {
                setHeaderCardsVisible(function (prev) {
                    var next = !prev;
                    saveStoredHeaderCardsVisible(next);
                    return next;
                });
            }, []);
            React.useEffect(function () {
                setExtraCommits([]);
                setHasMoreCommits(true);
                setExtraDirtyFiles([]);
                setVisibleDirtyCount(15);
                setHasMoreDirty(true);
                setActiveDiffFile(null);
            }, [cwd, data]);
            var loadMoreCommits = function () {
                if (loadingMore || !hasMoreCommits)
                    return;
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
                    .then(function (r) { return r.json(); })
                    .then(function (j) {
                    setLoadingMore(false);
                    if (j && j.ok && j.data && Array.isArray(j.data.commits)) {
                        if (j.data.commits.length === 0) {
                            setHasMoreCommits(false);
                        }
                        else {
                            setExtraCommits(function (prev) { return prev.concat(j.data.commits); });
                            if (j.data.totalCount !== undefined && (currentCount + j.data.commits.length) >= j.data.totalCount) {
                                setHasMoreCommits(false);
                            }
                        }
                    }
                    else {
                        setHasMoreCommits(false);
                    }
                })
                    .catch(function () {
                    setLoadingMore(false);
                });
            };
            var loadMoreDirtyFiles = function () {
                if (loadingMoreDirty)
                    return;
                var total = data?.gitStatus?.dirtyCount || 0;
                var baseFiles = data?.gitStatus?.dirtyFiles || [];
                var loadedCount = baseFiles.length + extraDirtyFiles.length;
                // 若当前已持有的文件列表中还有未展示的内容，按 15 条步长递增展示窗口（0ms 纯前端瞬时响应）
                if (visibleDirtyCount < loadedCount) {
                    setVisibleDirtyCount(function (prev) {
                        return Math.min(prev + 15, loadedCount);
                    });
                    return;
                }
                // 若当前已展示数已经达到总数，说明全量全部展示完毕，无需发起请求
                if (visibleDirtyCount >= total && total > 0) {
                    setHasMoreDirty(false);
                    return;
                }
                // 仅在当前已知条数小于总数时向后端增量拉取后续条目
                setLoadingMoreDirty(true);
                var skip = loadedCount;
                var limit = 15;
                var url = "/api/github/uncommitted-files?limit=" + limit + "&skip=" + skip + (cwd ? "&cwd=" + encodeURIComponent(cwd) : "");
                var fetchWithFallback = async function () {
                    try {
                        var r = await fetch(url);
                        if (r.status === 404) {
                            // 自动无缝降级走常驻端点 /api/github/action
                            r = await fetch("/api/github/action", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    action: "get_uncommitted_files",
                                    limit: limit,
                                    skip: skip,
                                    cwd: cwd || undefined,
                                }),
                            });
                        }
                        if (!r.ok) {
                            setLoadingMoreDirty(false);
                            return;
                        }
                        var j = await r.json().catch(function () { return null; });
                        setLoadingMoreDirty(false);
                        if (j && j.ok && j.data && Array.isArray(j.data.items)) {
                            if (j.data.items.length === 0) {
                                setHasMoreDirty(false);
                            }
                            else {
                                setExtraDirtyFiles(function (prev) {
                                    return prev.concat(j.data.items);
                                });
                                setVisibleDirtyCount(function (prev) {
                                    return prev + j.data.items.length;
                                });
                                if (!j.data.hasMore || (loadedCount + j.data.items.length) >= total) {
                                    setHasMoreDirty(false);
                                }
                            }
                        }
                        else {
                            setHasMoreDirty(false);
                        }
                    }
                    catch (e) {
                        setLoadingMoreDirty(false);
                    }
                };
                fetchWithFallback();
            };
            React.useEffect(function () {
                var el = containerRef && containerRef.current;
                if (!el)
                    return;
                var onScroll = function () {
                    var activeBtn = el.querySelector(".dsh-github-tab-btn.active");
                    var activeTab = activeBtn ? activeBtn.getAttribute("data-tab-btn") : (el.getAttribute("data-active-tab") || "git");
                    var threshold = 120;
                    if (el.scrollHeight - el.scrollTop - el.clientHeight < threshold) {
                        if (activeTab === "git") {
                            loadMoreCommits();
                        }
                        else if (activeTab === "dirty") {
                            loadMoreDirtyFiles();
                        }
                    }
                };
                // 监听鼠标滚轮向下滚事件（即使用户收起卡片导致内容暂未撑出滚动条，只要向下滚轮也能瞬间响应！）
                var onWheel = function (e) {
                    if (!e || e.deltaY <= 0)
                        return;
                    var activeBtn = el.querySelector(".dsh-github-tab-btn.active");
                    var activeTab = activeBtn ? activeBtn.getAttribute("data-tab-btn") : (el.getAttribute("data-active-tab") || "git");
                    var threshold = 120;
                    var atBottom = (el.scrollHeight - el.scrollTop - el.clientHeight < threshold) || (el.scrollHeight <= el.clientHeight + 40);
                    if (atBottom) {
                        if (activeTab === "git") {
                            loadMoreCommits();
                        }
                        else if (activeTab === "dirty") {
                            loadMoreDirtyFiles();
                        }
                    }
                };
                el.addEventListener("scroll", onScroll, { passive: true });
                el.addEventListener("wheel", onWheel, { passive: true });
                return function () {
                    el.removeEventListener("scroll", onScroll);
                    el.removeEventListener("wheel", onWheel);
                };
            }, [data, extraCommits, loadingMore, hasMoreCommits, cwd, extraDirtyFiles, loadingMoreDirty, hasMoreDirty, visibleDirtyCount, headerCardsVisible]);
            // 视口充盈智能自适应：当用户点击收起卡片导致页面变矮、未能产生滚动条时，自动将后续条目拉取补齐！
            React.useEffect(function () {
                var el = containerRef && containerRef.current;
                if (!el)
                    return;
                var timer = setTimeout(function () {
                    var activeBtn = el.querySelector(".dsh-github-tab-btn.active");
                    var activeTab = activeBtn ? activeBtn.getAttribute("data-tab-btn") : (el.getAttribute("data-active-tab") || "git");
                    if (activeTab === "dirty") {
                        var total = data?.gitStatus?.dirtyCount || 0;
                        var hasMore = total > 0 && visibleDirtyCount < total;
                        if (hasMore && el.scrollHeight <= el.clientHeight + 60) {
                            loadMoreDirtyFiles();
                        }
                    }
                }, 120);
                return function () { clearTimeout(timer); };
            }, [headerCardsVisible, visibleDirtyCount, data]);
            React.useEffect(() => {
                var onOpenAbout = () => {
                    var el = containerRef && containerRef.current;
                    if (!el)
                        return;
                    var rect = el.getBoundingClientRect();
                    var visible = rect.width > 0 && rect.height > 0;
                    if (visible)
                        setAboutModalOpen(true);
                };
                var onOpenProxy = () => {
                    var el = containerRef && containerRef.current;
                    if (!el)
                        return;
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
            var openRightbarSettings = (section) => {
                if (section) {
                    setRightbarModalSection(section);
                }
                else {
                    setRightbarModalSection("sync");
                }
                setRightbarModalOpen(true);
            };
            var h = React.createElement;
            var toastEl = toastMsg
                ? h("div", {
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
                }, h("span", null, toastMsg), h("button", { onClick: () => setToastMsg(null), style: { background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: "14px" } }, "✕"))
                : null;
            var openFileInDsh = function (f) {
                if (!f || !f.path)
                    return;
                try {
                    var rel = f.path.replace(/\\/g, "/");
                    var address = "dsh-resource://file/session/" + encodeURIComponent(sessionId || "") + "/" + encodeURIComponent(rel);
                    var activeCtx = props?.ctx || currentPluginCtx;
                    if (activeCtx && activeCtx.sidebarRight && typeof activeCtx.sidebarRight.openResource === "function") {
                        activeCtx.sidebarRight.openResource(address);
                    }
                    else {
                        window.dispatchEvent(new CustomEvent("dsh-open-file", { detail: { path: f.path, cwd: cwd, sessionId: sessionId } }));
                    }
                }
                catch (e) { }
            };
            return h("div", { className: "dsh-github-rightbar-container", ref: containerRef }, toastEl, ...renderGithubRepoView(h, data, loading, error, () => loadData(true), true, updateInfo, syncStatus, lastSyncedAt, openRightbarSettings, cwd, (c) => setSelectedCommit(c), {
                extraCommits: extraCommits,
                loadingMore: loadingMore,
                hasMore: hasMoreCommits,
                onLoadMore: loadMoreCommits,
            }, showToast, () => setHelpModalOpen(true), openFileInDsh, {
                visibleCount: visibleDirtyCount,
                extraDirtyFiles: extraDirtyFiles,
                loadingMore: loadingMoreDirty,
                hasMore: hasMoreDirty,
                onLoadMore: loadMoreDirtyFiles,
            }, activeDiffFile, (f) => setActiveDiffFile(f), () => setActiveDiffFile(null), openFileInDsh, headerCardsVisible, toggleHeaderCards), h(GlobalSyncSettingsModal, {
                isOpen: aboutModalOpen,
                initialSection: "about",
                onClose: () => setAboutModalOpen(false),
                currentSettings: syncSettings,
                onSave: function () { },
                onClearCache: function () { setData(null); },
            }), h(GlobalSyncSettingsModal, {
                isOpen: rightbarModalOpen,
                initialSection: rightbarModalSection,
                onClose: () => setRightbarModalOpen(false),
                currentSettings: syncSettings,
                onSave: function (newSettings) { setSyncSettings(newSettings); },
                onClearCache: function () {
                    setData(null);
                    setLastSyncedAt(0);
                    setSyncStatus("loading");
                },
            }), h(GithubHelpModal, {
                isOpen: helpModalOpen,
                onClose: () => setHelpModalOpen(false),
            }), selectedCommit
                ? h(CommitDetailModal, {
                    commit: selectedCommit,
                    onClose: function () { setSelectedCommit(null); },
                    cwd: cwd,
                })
                : null);
        }
        // 2. 右侧栏 Tab 标题组件
        function GithubRightbarTitle() {
            var h = React.createElement;
            return h("span", { style: { display: "flex", alignItems: "center", gap: "6px" } }, renderOctocat(15, "#58a6ff"), h("span", null, "GitHub"));
        }
        // 3. 右侧栏“开始”引导页的大图标 (Artwork)
        function GithubArtwork() {
            return renderOctocatBadge(32);
        }
        // 4. 左侧栏全局入口与中央大面板
        function GithubSidebarIcon(props) {
            const active = Boolean(props && props.active);
            return React.createElement("div", {
                className: "dsh-github-icon" + (active ? " active" : ""),
                title: "GitHub 全景驾驶舱（dsh-github-flow 插件）",
            }, React.createElement("div", {
                className: "dsh-github-icon-inner" + (active ? " active" : "")
            }, renderOctocat(18, "currentColor")));
        }
        var inject = ["slots", "sidebarRightTabs", "sessions", "layout", "theme", "sidebarRight"];
        
// ---- [Bundled: workspace-panel.js] ----
/**
 * 全局工作区仪表盘主面板组件 (Dashboard View)
 */
function GithubWorkspacePanel() {
    var initialSettings = React.useMemo(() => getLocalSyncSettings(), []);
    var initialSnapshot = React.useMemo(() => getStoredGlobalOverview(), []);
    var [syncSettings, setSyncSettings] = React.useState(initialSettings);
    var [data, setData] = React.useState(initialSnapshot?.data || null);
    var [loading, setLoading] = React.useState(!initialSnapshot);
    var [syncStatus, setSyncStatus] = React.useState(initialSnapshot ? "cached" : "loading");
    var [lastSyncedAt, setLastSyncedAt] = React.useState(initialSnapshot?.savedAt || 0);
    var [isSettingsModalOpen, setIsSettingsModalOpen] = React.useState(false);
    var [settingsInitialSection, setSettingsInitialSection] = React.useState("sync");
    var [isHelpModalOpen, setIsHelpModalOpen] = React.useState(false);
    var [error, setError] = React.useState(null);
    var [updateInfo, setUpdateInfo] = React.useState(null);
    var [activeTab, setActiveTab] = React.useState("workspaces");
    var [searchQuery, setSearchQuery] = React.useState("");
    var [issueFilter, setIssueFilter] = React.useState("all");
    var [toastMsg, setToastMsg] = React.useState(null);
    var cloudTimerRef = React.useRef(null);
    var dataRef = React.useRef(data);
    dataRef.current = data;
    var showToast = (msg) => {
        setToastMsg(msg);
        setTimeout(() => setToastMsg(null), 5000);
    };
    var [proxyActive, setProxyActive] = React.useState(null);
    var refreshProxyBadge = React.useCallback(function () {
        fetch("/api/github/proxy")
            .then(function (r) { return r.json(); })
            .then(function (j) {
            if (j && j.ok && j.state && j.state.config) {
                setProxyActive({ enabled: Boolean(j.state.config.url), url: j.state.config.url || "" });
            }
            else {
                setProxyActive({ enabled: false, url: "" });
            }
        })
            .catch(function () { });
    }, []);
    React.useEffect(function () { refreshProxyBadge(); }, [refreshProxyBadge]);
    React.useEffect(() => {
        var timer = setTimeout(function () {
            fetch("/api/github/check-update")
                .then(function (res) { return res.json(); })
                .then(function (json) {
                if (json && json.ok && json.data) {
                    setUpdateInfo(json.data);
                }
            })
                .catch(function () { });
        }, 300);
        return function () { clearTimeout(timer); };
    }, []);
    var panelRef = React.useRef(null);
    React.useEffect(() => {
        var onOpenAbout = () => {
            var el = panelRef && panelRef.current;
            if (!el)
                return;
            var rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                setSettingsInitialSection("about");
                setIsSettingsModalOpen(true);
            }
        };
        var onOpenProxy = () => {
            var el = panelRef && panelRef.current;
            if (!el)
                return;
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
    var openSettingsDefault = () => {
        setSettingsInitialSection("sync");
        setIsSettingsModalOpen(true);
    };
    var loadData = React.useCallback(async (forceRefresh = false) => {
        if (!forceRefresh && syncSettings.strategy === "manual" && dataRef.current) {
            return;
        }
        if (forceRefresh || !dataRef.current) {
            setLoading(true);
        }
        setSyncStatus(dataRef.current ? "syncing" : "loading");
        setError(null);
        var controller = new AbortController();
        var timedOut = false;
        var timer = setTimeout(function () { timedOut = true; controller.abort(); }, 45000);
        try {
            if (forceRefresh)
                await fetch("/api/github/refresh", { method: "POST", signal: controller.signal }).catch(() => { });
            var url = "/api/github/global-overview";
            if (forceRefresh) {
                url += "?force=true";
            }
            // 接入 1s/2s/4s 阶梯退避重试，平滑吸收代理节点与网络的偶发抖动断流
            var { res, json } = await fetchWithRetry(url, {}, {
                signal: controller.signal,
                maxRetries: 3,
                baseDelayMs: 1000,
                onRetry: (attempt) => {
                    setSyncStatus("syncing");
                    setError(`网络抖动，正在自愈重试 (${attempt}/3)...`);
                },
            });
            if (!res.ok) {
                var errText = (typeof json === "string" ? json : JSON.stringify(json)) || res.statusText;
                var failMsg = `获取全局数据失败（HTTP ${res.status}）${errText ? ": " + errText : ""}`;
                setSyncStatus("failed");
                setError(failMsg);
                if (forceRefresh)
                    showToast("❌ 刷新失败：" + failMsg);
                return;
            }
            if (json.ok && json.data) {
                var isFail = Boolean(json.partialFailure ||
                    json.data.partialFailure ||
                    json.data.networkError ||
                    json.data.auth?.networkError ||
                    json.error);
                var failReason = String(json.error ||
                    json.fetchError ||
                    json.data.networkErrorReason ||
                    json.data.auth?.networkErrorReason ||
                    "拉取全局数据失败");
                if (isFail) {
                    setSyncStatus("failed");
                    setError(failReason);
                    var curData = dataRef.current;
                    if (curData && (curData.userRepos?.length > 0 || curData.myPrs?.length > 0 || curData.myIssues?.length > 0)) {
                        if (json.data.userRepos?.length > 0 || json.data.myPrs?.length > 0) {
                            setData(json.data);
                        }
                    }
                    else {
                        setData(json.data);
                    }
                    if (forceRefresh)
                        showToast("❌ 刷新失败：" + failReason);
                }
                else {
                    setData(json.data);
                    saveStoredGlobalOverview(json.data);
                    var syncTs = json.fromCache && json.data.lastUpdated
                        ? (Date.parse(json.data.lastUpdated) || Date.now())
                        : Date.now();
                    setLastSyncedAt(syncTs);
                    setSyncStatus(json.fromCache ? "cached" : "fresh");
                    setError(null);
                    if (forceRefresh)
                        showToast("✅ 刷新成功，已同步最新数据");
                }
                if (json.data.updateInfo) {
                    setUpdateInfo(json.data.updateInfo);
                }
                if (json.data.workspaceError) {
                    setError("工作区列表读取失败：" + json.data.workspaceError);
                }
            }
            else {
                setSyncStatus("failed");
                var errPayload = String(json?.error || "获取全局数据失败");
                setError(errPayload);
                if (forceRefresh)
                    showToast("❌ 刷新失败：" + errPayload);
            }
        }
        catch (err) {
            setSyncStatus("failed");
            var failReason = (timedOut || err.name === "AbortError")
                ? "获取超时（45 秒）：本机 gh 命令响应过慢或网络代理劫持了回环请求。可稍后重试，或在「⚙️ 设置 → 🌐 网络代理」确认代理已放行 127.0.0.1。"
                : ("无法连接后端服务：" + (err.message || err));
            setError(failReason);
            if (forceRefresh)
                showToast("❌ 刷新失败：" + failReason);
        }
        finally {
            clearTimeout(timer);
            setLoading(false);
            if (syncSettings.strategy === "auto") {
                scheduleNextCloudSync();
            }
        }
    }, [syncSettings.strategy]);
    // 云端定时自动同步：拉取结算后才启动计时器，倒计时到期后再执行下一次，并做息屏避让
    var scheduleNextCloudSync = React.useCallback(() => {
        if (cloudTimerRef.current)
            clearTimeout(cloudTimerRef.current);
        if (syncSettings.strategy !== "auto")
            return;
        var interval = Math.max(300000, Number(syncSettings.cloudSyncIntervalMs) || 600000);
        cloudTimerRef.current = setTimeout(() => {
            if (typeof document !== "undefined" && document.visibilityState === "hidden") {
                var onVisible = () => {
                    if (document.visibilityState === "visible") {
                        document.removeEventListener("visibilitychange", onVisible);
                        loadData(false);
                    }
                };
                document.addEventListener("visibilitychange", onVisible);
                return;
            }
            loadData(false);
        }, interval);
    }, [syncSettings.strategy, syncSettings.cloudSyncIntervalMs, loadData]);
    // 挂载加载调度：开启 SWR 或 开启云端定时时，首屏均立即静默拉新；
    // 云端定时在首屏拉取结算后自动启动下一次倒计时。首页坚决不挂载任何文件监控！
    React.useEffect(() => {
        if (cloudTimerRef.current)
            clearTimeout(cloudTimerRef.current);
        if (syncSettings.strategy === "swr" || syncSettings.strategy === "auto") {
            var timer = setTimeout(function () { loadData(false); }, 300);
            return function () {
                clearTimeout(timer);
                if (cloudTimerRef.current)
                    clearTimeout(cloudTimerRef.current);
            };
        }
        else if (!dataRef.current) {
            loadData(false);
        }
        return function () {
            if (cloudTimerRef.current)
                clearTimeout(cloudTimerRef.current);
        };
    }, [syncSettings.strategy, syncSettings.cloudSyncIntervalMs, loadData]);
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
                    .catch(function () { });
            }
        };
        var onOnline = () => {
            // 监听网络由断网恢复连接瞬间，自动静默发起一次全量同步，消除离线警告横幅并拉新
            loadData(false);
        };
        window.addEventListener("focus", onFocus);
        window.addEventListener("online", onOnline);
        return () => {
            window.removeEventListener("focus", onFocus);
            window.removeEventListener("online", onOnline);
        };
    }, [data, loadData]);
    var h = React.createElement;
    var headerEl = h("div", { className: "dsh-github-header" }, h("div", { className: "dsh-github-title" }, renderOctocatBadge(32), h("h2", null, "GitHub 全景驾驶舱"), renderPluginBadge(h), h(SyncStatusBadge, { syncStatus, lastSyncedAt }), proxyActive && proxyActive.enabled
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
        : null), h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, h("button", {
        className: "dsh-github-refresh-btn",
        onClick: () => loadData(true),
        disabled: loading,
    }, loading ? "同步中..." : "🔄 刷新全局数据"), h("button", {
        className: "dsh-github-btn-sm",
        onClick: () => setIsHelpModalOpen(true),
        title: "打开使用帮助与实战手册大窗口（Esc 可退出）",
        style: { padding: "6px 12px" },
    }, "📖 使用指南"), h("button", {
        className: "dsh-github-btn-sm",
        onClick: openSettingsDefault,
        title: "配置数据同步节奏、本地缓存、网络代理与插件信息",
        style: { padding: "6px 12px" },
    }, "⚙️ 设置")));
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
            refreshProxyBadge();
        },
        currentSettings: syncSettings,
        onSave: (newSettings) => {
            setSyncSettings(newSettings);
        },
        onClearCache: () => {
            setSyncStatus("loading");
            setData(null);
            setLastSyncedAt(0);
        },
    });
    if (!data && error) {
        return h("div", { className: "dsh-github-panel", ref: panelRef }, headerEl, upgradeBannerEl, h("div", {
            style: {
                padding: "24px",
                borderRadius: "8px",
                background: "rgba(248, 81, 73, 0.08)",
                border: "1px solid rgba(248, 81, 73, 0.3)",
                margin: "16px 0",
                textAlign: "center",
            },
        }, h("div", { style: { fontSize: "16px", fontWeight: 600, color: "#f85149", marginBottom: "8px" } }, "⚠️ 后端服务加载异常"), h("div", { style: { fontSize: "13px", color: "var(--dsw-alias-label-secondary, #656d76)", marginBottom: "16px" } }, error), h("button", {
            className: "dsh-github-btn-sm",
            onClick: () => loadData(true),
            style: { padding: "6px 18px", background: "var(--dsw-alias-link, #0969da)", color: "#ffffff", borderColor: "var(--dsw-alias-link, #0969da)" },
        }, "🔄 重新请求")), settingsModalEl);
    }
    var auth = data ? data.auth : null;
    var userRepos = (data && data.userRepos) || [];
    var workspaceMatrix = (data && data.workspaceMatrix) || [];
    var myPrs = (data && data.myPrs) || [];
    var myIssues = (data && data.myIssues) || [];
    var errorEl = error ? h("div", { style: { color: "#f85149", background: "rgba(248,81,73,0.1)", border: "1px solid rgba(248,81,73,0.3)", padding: "8px 12px", borderRadius: "6px", marginBottom: "16px", fontSize: "12px" } }, `⚠️ 加载失败: ${error}`) : null;
    var statsCardsEl = h("div", { className: "dsh-github-overview-cards" }, h("div", { className: "dsh-github-card" }, h("div", { className: "dsh-github-card-title" }, "CLI 认证账号"), h("div", { className: "dsh-github-card-value" }, auth?.networkError
        ? (auth.user ? `👤 ${auth.user} (离线)` : "🌐 网络连接受限")
        : auth?.loggedIn
            ? `👤 ${auth.user}`
            : !auth?.installed
                ? "❌ 未安装 CLI"
                : "⚠️ 未登录", auth?.networkError
        ? h("span", { className: "dsh-github-badge dsh-badge-yellow" }, "Offline")
        : auth?.loggedIn
            ? h("span", { className: "dsh-github-badge dsh-badge-green" }, "Active")
            : !auth?.installed
                ? h("span", { className: "dsh-github-badge dsh-badge-red" }, "Missing")
                : h("span", { className: "dsh-github-badge dsh-badge-yellow" }, "Required"))), h("div", { className: "dsh-github-card" }, h("div", { className: "dsh-github-card-title" }, "账号云端仓库"), h("div", { className: "dsh-github-card-value" }, `${userRepos.length} 个 Repositories`)), h("div", { className: "dsh-github-card" }, h("div", { className: "dsh-github-card-title" }, "本地工作区联动"), h("div", { className: "dsh-github-card-value" }, `${workspaceMatrix.length} 个工作区 (${workspaceMatrix.filter((w) => w.repo).length} 个已关联)`)), h("div", { className: "dsh-github-card" }, h("div", { className: "dsh-github-card-title" }, "📥 待处理 Issues"), (data && data.issueStats && (data.issueStats.reported || data.issueStats.assigned || data.issueStats.created))
        ? h("div", { className: "dsh-github-card-value", style: { fontSize: "14px" } }, `📥 用户提单 ${data.issueStats.reported || 0} · 🎯 分配给我 ${data.issueStats.assigned || 0} · ✍️ 我创建 ${data.issueStats.created || 0}`)
        : h("div", { className: "dsh-github-card-value" }, "无待办 ✓")));
    var authGuideEl = (!auth?.loggedIn && !auth?.networkError && syncStatus !== "failed")
        ? h(AuthGuideCard, { auth, onRefresh: () => loadData(true), isRightbar: false })
        : null;
    var tabsEl = h("div", { className: "dsh-github-tabs" }, h("button", { className: `dsh-github-tab-btn ${activeTab === 'workspaces' ? 'active' : ''}`, onClick: () => setActiveTab('workspaces') }, `📂 本地工作区矩阵 (${workspaceMatrix.length})`), h("button", { className: `dsh-github-tab-btn ${activeTab === 'repos' ? 'active' : ''}`, onClick: () => setActiveTab('repos') }, `☁️ 我的 GitHub 仓库 (${userRepos.length})`), h("button", { className: `dsh-github-tab-btn ${activeTab === 'mywork' ? 'active' : ''}`, onClick: () => setActiveTab('mywork') }, `📋 任务与待办 (PR: ${myPrs.length} · Issue: ${myIssues.length})`));
    var contentEl = null;
    if (activeTab === 'workspaces') {
        contentEl = h("div", { className: "dsh-github-list" }, workspaceMatrix.map((ws) => h("div", { key: ws.id, className: "dsh-github-card dsh-github-workspace-card" }, h("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } }, h("div", { className: "dsh-github-ws-title" }, ws.title), h("div", { className: "dsh-github-ws-path" }, ws.path), h("div", { style: { fontSize: "12px", marginTop: "4px", display: "flex", gap: "8px", alignItems: "center" } }, ws.repo
            ? h("span", { className: "dsh-github-ws-repo-link" }, renderOctocat(13, "currentColor"), `关联远程: ${ws.repo.nameWithOwner} (${ws.repo.defaultBranch})`)
            : h("span", { className: "dsh-github-ws-path" }, ws.hasGit ? "本地有 Git，未关联 GitHub 远程" : "本地无 Git 仓库"), ws.repo ? h("span", { className: "dsh-github-badge dsh-badge-green" }, "已关联") : null), ws.gitStatus
            ? h("div", {
                style: { fontSize: "11px", display: "flex", gap: "8px", alignItems: "center", opacity: 0.85 },
                title: "ahead/behind 相对上次 git fetch 的快照（非实时）",
            }, h("span", { style: { display: "inline-flex", alignItems: "center", gap: "4px" } }, renderGitIcon(12, "#1296db"), ws.gitStatus.branch), ws.gitStatus.hasUpstream
                ? h("span", null, `${ws.gitStatus.ahead > 0 ? "↑" + ws.gitStatus.ahead + " " : ""}${ws.gitStatus.behind > 0 ? "↓" + ws.gitStatus.behind : ""}${ws.gitStatus.ahead === 0 && ws.gitStatus.behind === 0 ? "✓ 同步" : ""}`)
                : h("span", { style: { opacity: 0.7 } }, "↑? ↓?"), ws.gitStatus.dirtyCount > 0
                ? h("span", null, `${ws.gitStatus.dirtyCount} 文件未提交`)
                : h("span", null, "干净"))
            : null, ws.gitStatus && ws.gitStatus.dirtyFiles && ws.gitStatus.dirtyFiles.length > 0
            ? h("details", { style: { fontSize: "11px" } }, h("summary", { style: { cursor: "pointer", opacity: 0.8 } }, `未提交清单（${ws.gitStatus.dirtyFiles.length}）`), h("div", { style: { padding: "4px 8px", borderRadius: "6px", background: "var(--dsw-alias-bg-module-platform, #f6f8fa)", lineHeight: "1.6", marginTop: "4px" } }, ws.gitStatus.dirtyFiles.map(function (f, i) {
                return h("div", { key: i }, h("span", { style: { opacity: 0.7, marginRight: "6px" } }, f.status === "??" ? "??" : f.status), f.path);
            })))
            : null), h("div", { style: { display: "flex", gap: "8px" } }, ws.repo
            ? h("a", { className: "dsh-github-btn-sm", href: ws.repo.url, target: "_blank" }, "在 GitHub 打开")
            : null))));
    }
    else if (activeTab === 'repos') {
        if (!auth?.loggedIn) {
            contentEl = h("div", { className: "dsh-github-empty" }, "当前尚未认证登录 GitHub 账号，无法读取云端仓库列表。请先完成上方的安装或登录指引。");
        }
        else {
            var filteredRepos = userRepos.filter((r) => !searchQuery || r.nameWithOwner.toLowerCase().includes(searchQuery.toLowerCase()) || r.description?.toLowerCase().includes(searchQuery.toLowerCase()));
            contentEl = h("div", null, h("input", {
                className: "dsh-github-search-input",
                placeholder: "🔍 搜索我的 GitHub 仓库...",
                value: searchQuery,
                onChange: (e) => setSearchQuery(e.target.value)
            }), h("div", { className: "dsh-github-list" }, filteredRepos.map((r) => h("div", { key: r.nameWithOwner, className: "dsh-github-item" }, h("a", { className: "dsh-github-item-title", href: r.url, target: "_blank" }, r.nameWithOwner), r.description ? h("div", { className: "dsh-github-item-desc" }, r.description) : null, h("div", { className: "dsh-github-item-meta" }, h("span", null, `默认分支: ${r.defaultBranch}`), r.isPrivate ? h("span", { className: "dsh-github-badge dsh-badge-yellow" }, "Private") : h("span", { className: "dsh-github-badge dsh-badge-green" }, "Public"), h("span", null, `⭐ ${r.stargazerCount}`), formatRelativeTime(r.updatedAt)
                ? h("span", { title: `更新于 ${r.updatedAt}` }, `活跃于 ${formatRelativeTime(r.updatedAt)}`)
                : null)))));
        }
    }
    else {
        if (!auth?.loggedIn) {
            contentEl = h("div", { className: "dsh-github-empty" }, "当前尚未认证登录 GitHub 账号，无法读取个人待办 PR 与 Issues。请先完成上方的安装或登录指引。");
        }
        else {
            var issueStats = (data && data.issueStats) || {
                total: myIssues.length,
                reported: myIssues.filter((i) => (i.categories || []).includes('reported')).length,
                assigned: myIssues.filter((i) => (i.categories || []).includes('assigned')).length,
                created: myIssues.filter((i) => (i.categories || []).includes('created')).length,
            };
            var filteredIssues = myIssues.filter((is) => {
                if (issueFilter === 'all')
                    return true;
                var cats = is.categories || [];
                return cats.includes(issueFilter);
            });
            var issuePillsEl = h("div", { className: "dsh-github-pills" }, h("button", {
                className: `dsh-github-pill-btn ${issueFilter === 'all' ? 'active' : ''}`,
                onClick: () => setIssueFilter('all'),
            }, `全部 (${issueStats.total || myIssues.length})`), h("button", {
                className: `dsh-github-pill-btn ${issueFilter === 'reported' ? 'active' : ''}`,
                onClick: () => setIssueFilter('reported'),
            }, `📥 用户提起的 (${issueStats.reported || 0})`), h("button", {
                className: `dsh-github-pill-btn ${issueFilter === 'assigned' ? 'active' : ''}`,
                onClick: () => setIssueFilter('assigned'),
            }, `🎯 分配给我的 (${issueStats.assigned || 0})`), h("button", {
                className: `dsh-github-pill-btn ${issueFilter === 'created' ? 'active' : ''}`,
                onClick: () => setIssueFilter('created'),
            }, `✍️ 我创建的 (${issueStats.created || 0})`));
            contentEl = h("div", null, h("h3", { className: "dsh-github-subheading" }, `🔀 我发起的 PR (${myPrs.length})`), myPrs.length === 0 ? h("div", { className: "dsh-github-empty", style: { marginBottom: "16px" } }, "暂无开放中的 PR") : h("div", { className: "dsh-github-list", style: { marginBottom: "16px" } }, myPrs.map((pr) => h("div", { key: pr.number, className: "dsh-github-item", style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } }, h("a", {
                className: "dsh-github-item-title",
                href: pr.url,
                target: "_blank",
                title: pr.updatedAt ? `更新于 ${pr.updatedAt}` : undefined,
            }, `${pr.isDraft ? "⚪ " : ""}[${pr.repository?.nameWithOwner || 'Repo'}] #${pr.number} ${pr.title}`), pr.isDraft ? h("span", { className: "dsh-github-badge dsh-badge-yellow" }, "DRAFT") : null, formatRelativeTime(pr.updatedAt)
                ? h("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #656d76)", whiteSpace: "nowrap" } }, formatRelativeTime(pr.updatedAt))
                : null))), h("h3", { className: "dsh-github-subheading" }, `📝 任务与待办 Issues (${filteredIssues.length})`), issuePillsEl, filteredIssues.length === 0 ? h("div", { className: "dsh-github-empty" }, "当前分类下暂无开放中的 Issue") : h("div", { className: "dsh-github-list" }, filteredIssues.map((is) => {
                var cats = is.categories || [];
                var badges = [];
                if (cats.includes("reported")) {
                    badges.push(h("span", { key: "rep", className: "dsh-github-badge dsh-badge-purple" }, "用户提单"));
                }
                if (cats.includes("assigned")) {
                    badges.push(h("span", { key: "asn", className: "dsh-github-badge dsh-badge-blue" }, "分配待办"));
                }
                if (cats.includes("created")) {
                    badges.push(h("span", { key: "crt", className: "dsh-github-badge dsh-badge-green" }, "我发起的"));
                }
                return h("div", { key: is.url || is.number, className: "dsh-github-item" }, h("div", { style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" } }, h("a", { className: "dsh-github-item-title", href: is.url, target: "_blank" }, `[${is.repository?.nameWithOwner || 'Repo'}] #${is.number} ${is.title}`), ...badges), h("div", { className: "dsh-github-item-meta" }, is.author ? h("span", null, `由 @${is.author.login} 提出`) : null, is.assignees && is.assignees.length > 0
                    ? h("span", null, `指派: ${is.assignees.map((a) => '@' + a.login).join(', ')}`)
                    : null, is.labels && is.labels.length > 0
                    ? is.labels.map((lbl) => h("span", { key: lbl.name, className: "dsh-github-badge dsh-badge-yellow" }, lbl.name))
                    : null, is.updatedAt ? h("span", null, `更新于: ${new Date(is.updatedAt).toLocaleDateString()}`) : null));
            })));
        }
    }
    var toastEl = toastMsg
        ? h("div", {
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
        }, h("span", null, toastMsg), h("button", { onClick: () => setToastMsg(null), style: { background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: "14px" } }, "✕"))
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
    return h("div", { className: "dsh-github-panel", ref: panelRef }, toastEl, headerEl, networkAlertBannerEl, upgradeBannerEl, errorEl, statsCardsEl, authGuideEl, tabsEl, contentEl, settingsModalEl, h(GithubHelpModal, {
        isOpen: isHelpModalOpen,
        onClose: () => setIsHelpModalOpen(false),
    }));
}


    function apply(ctx) {
            currentPluginCtx = ctx;
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
            }
            else {
                injectStyles();
            }
            if (ctx.on) {
                ctx.on("theme/change", () => {
                    injectStyles();
                });
            }
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
                                description: () => "查看与操作当前工作区目录下的 GitHub 仓库（由 dsh-github-flow 插件提供）",
                                icon: GithubArtwork,
                            },
                        ],
                    });
                }, "github: sidebar right tab definition");
            }
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
