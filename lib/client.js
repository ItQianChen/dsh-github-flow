// 状态→徽章映射与服务端 CLI 输出共用同一份实现（构建期被内联进本 bundle 的作用域）


















window.__ModuleLoader__.load({
    id: "dsh-github-flow",
    factory: (require) => {
        var module = { exports: {} };
        var exports = module.exports;
        Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
        var React = require("react");

// ---- [Bundled: state-badges.js] ----
/**
 * 状态 → 徽章的唯一映射（服务端 Markdown 与客户端 UI 共用）。
 *
 * 为什么必须共用：同一个状态（OPEN / MERGED / CI failure …）在 CLI 输出与右侧栏
 * 面板上必须是同一套颜色与同一套文案。此前这条映射在 9 个文件里各写了一遍
 * （服务端 5 个 `format*Badge`、客户端 6 处内联三元式），新增一个状态要改 12 处，
 * 漏一处就出现「同一个 PR 在两处显示不同颜色」。
 *
 * 约束（构建期强依赖）：本文件必须**零依赖**。scripts/build.mjs 会把它的 import
 * 行剥掉、整体内联进客户端 bundle；一旦这里 import 了别的东西，那些符号在 bundle
 * 作用域里就是 undefined，表现是整个驾驶舱白屏。
 *
 * `tone` 直接就是 CSS class 后缀（`dsh-badge-${tone}`），客户端不再需要映射表。
 */
/** 服务端 Markdown 渲染用：`🟢 OPEN` / `OPEN` / `-` */
function badgeText(badge) {
    if (!badge)
        return '-';
    return badge.icon ? `${badge.icon} ${badge.label}` : badge.label;
}
/** PR / Issue 状态（空 state 优先于 draft，与旧实现判定顺序一致） */
function prStateBadge(state, isDraft) {
    const s = String(state || '').toUpperCase();
    // 旧实现把 `if (!state) return '-'` 放在最前、draft 判定在其后。
    // 顺序反了会让 formatStateBadge(undefined, true) 从 '-' 变成 '⚪ DRAFT'——那是行为变化。
    if (!s)
        return null;
    if (isDraft)
        return { icon: '⚪', label: 'DRAFT', tone: 'yellow' };
    if (s === 'OPEN')
        return { icon: '🟢', label: 'OPEN', tone: 'green' };
    if (s === 'MERGED')
        return { icon: '🟣', label: 'MERGED', tone: 'purple' };
    if (s === 'CLOSED')
        return { icon: '🔴', label: 'CLOSED', tone: 'red' };
    return genericStateBadge(s);
}
/** Issue 状态（没有 MERGED 这一档） */
function issueStateBadge(state) {
    const s = String(state || '').toUpperCase();
    if (s === 'OPEN')
        return { icon: '🟢', label: 'OPEN', tone: 'green' };
    if (s === 'CLOSED')
        return { icon: '🔴', label: 'CLOSED', tone: 'red' };
    return genericStateBadge(s);
}
/**
 * CI 状态。
 * 第二参数按调用域语义不同：run 域传 conclusion（success/failure/…），
 * pr checks 域传 bucket（pass/fail/pending/…）——取值族不同但映射到同一组徽章；
 * 第一参数兜底（in_progress/queued 等进行中态）。
 */
function ciBadge(status, conclusion) {
    const conc = String(conclusion || '').toLowerCase();
    const st = String(status || '').toLowerCase();
    if (conc === 'success' || conc === 'pass')
        return { icon: '✅', label: conc, tone: 'green' };
    if (conc === 'failure' || conc === 'fail')
        return { icon: '❌', label: conc, tone: 'red' };
    if (conc === 'cancelled' || conc === 'cancel')
        return { icon: '🚫', label: conc, tone: 'red' };
    if (conc === 'skipped' || conc === 'skipping')
        return { icon: '⏭️', label: conc, tone: 'neutral' };
    if (conc === 'pending')
        return { icon: '⏳', label: 'pending', tone: 'yellow' };
    if (st === 'in_progress')
        return { icon: '⏳', label: 'running', tone: 'yellow' };
    if (st === 'queued')
        return { icon: '⏱️', label: 'queued', tone: 'yellow' };
    const fallback = conc || st;
    if (!fallback)
        return null;
    return { icon: '', label: fallback, tone: 'neutral' };
}
/** 合并冲突状态 */
function conflictBadge(status) {
    const s = String(status || '').toUpperCase();
    if (s === 'CLEAN')
        return { icon: '✅', label: 'CLEAN', tone: 'green' };
    if (s === 'DIRTY' || s === 'CONFLICT')
        return { icon: '⚠️', label: 'CONFLICT', tone: 'yellow' };
    if (s === 'BLOCKED')
        return { icon: '⛔', label: 'BLOCKED', tone: 'red' };
    if (!s)
        return null;
    return { icon: '', label: s, tone: 'neutral' };
}
/** Release 状态（Draft > Prerelease > Stable） */
function releaseBadge(isDraft, isPrerelease) {
    if (isDraft)
        return { icon: '⚪', label: 'DRAFT', tone: 'yellow' };
    if (isPrerelease)
        return { icon: '🍼', label: 'PRE', tone: 'yellow' };
    return { icon: '✅', label: 'STABLE', tone: 'green' };
}
/** 兜底：任意状态字符串转徽章（未知状态给 neutral，不猜颜色） */
function genericStateBadge(state) {
    const s = String(state || '').toUpperCase();
    if (!s)
        return null;
    return { icon: '', label: s, tone: 'neutral' };
}

// ---- [Bundled: styles.js] ----
/**
 * DSH GitHub Flow - 主题自适应样式系统 (Light / Dark 动态联动)
 * 遵循 DSH 原生 DSW (DeepSeek Web) 设计语言规范
 */
const GITHUB_PANEL_CSS = `
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
overscroll-behavior: contain;
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
flex: 0 0 auto;
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
flex: 0 0 auto;
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
.dsh-github-pr-splitter {
position: relative;
flex-shrink: 0;
width: 6px;
cursor: col-resize;
background: var(--dsw-alias-border-l2, #e1e4e8);
transition: background 0.15s ease;
display: flex;
align-items: center;
justify-content: center;
}
.dsh-github-pr-splitter:hover {
background: var(--dsw-alias-link, #0969da);
}
body[data-ds-dark-theme] .dsh-github-pr-splitter {
background: var(--dsw-alias-border-l1, #30363d);
}
body[data-ds-dark-theme] .dsh-github-pr-splitter:hover {
background: #58a6ff;
}
.dsh-github-pr-splitter-toggle {
position: absolute;
top: 50%;
transform: translateY(-50%);
width: 16px;
height: 32px;
padding: 0;
border: 1px solid var(--dsw-alias-border-l2, #d0d7de);
border-radius: 3px;
background: var(--dsw-alias-bg-base, #ffffff);
color: var(--dsw-alias-label-secondary, #656d76);
font-size: 8px;
line-height: 1;
cursor: pointer;
display: flex;
align-items: center;
justify-content: center;
z-index: 2;
}
.dsh-github-pr-splitter-toggle:hover {
background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06));
color: var(--dsw-alias-label-primary, #1f2328);
}
body[data-ds-dark-theme] .dsh-github-pr-splitter-toggle {
border-color: var(--dsw-alias-border-l1, #30363d);
background: var(--dsw-alias-bg-layer-2, #1e1e22);
color: var(--dsw-alias-label-secondary, #8b949e);
}
body[data-ds-dark-theme] .dsh-github-pr-splitter-toggle:hover {
background: rgba(255, 255, 255, 0.08);
color: #f0f6fc;
}
.dsh-github-pr-title-row {
display: flex;
align-items: center;
gap: 10px;
width: 100%;
min-width: 0;
}
.dsh-github-pr-title-row .dsh-github-item-title {
flex: 0 1 auto;
min-width: 0;
white-space: nowrap;
overflow: hidden;
text-overflow: ellipsis;
text-decoration: none;
}
.dsh-github-pr-gh-btn {
flex-shrink: 0;
margin-left: auto;
display: inline-flex;
align-items: center;
justify-content: center;
gap: 4px;
font-size: 12px;
font-weight: 500;
line-height: 18px;
padding: 3px 10px;
border-radius: 6px;
border: 1px solid var(--dsw-alias-border-l2, #d0d7de);
background: var(--dsw-alias-bg-module-platform, #f6f8fa);
color: var(--dsw-alias-label-secondary, #57606a);
text-decoration: none;
white-space: nowrap;
transition: all 0.15s ease;
}
.dsh-github-pr-gh-btn:hover {
color: var(--dsw-alias-link, #0969da);
border-color: var(--dsw-alias-link, #0969da);
background: var(--dsw-alias-interactive-bg-hover, #eaeef2);
}
body[data-ds-dark-theme] .dsh-github-pr-gh-btn {
border-color: var(--dsw-alias-border-l1, #30363d);
background: var(--dsw-alias-bg-layer-2, #1e1e22);
color: var(--dsw-alias-label-secondary, #8b949e);
}
body[data-ds-dark-theme] .dsh-github-pr-gh-btn:hover {
color: #58a6ff;
border-color: #58a6ff;
background: rgba(56, 139, 253, 0.15);
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
.dsh-github-md-body {
padding: 12px;
font-size: 12px;
line-height: 1.7;
word-break: break-word;
color: var(--dsw-alias-label-primary, #1f2328);
}
body[data-ds-dark-theme] .dsh-github-md-body {
color: var(--dsw-alias-label-primary, #f0f6fc);
}
.dsh-github-md-body .dsh-github-md-heading {
margin: 14px 0 8px 0;
font-weight: 600;
line-height: 1.4;
}
.dsh-github-md-body h1.dsh-github-md-heading { font-size: 17px; }
.dsh-github-md-body h2.dsh-github-md-heading { font-size: 15px; }
.dsh-github-md-body h3.dsh-github-md-heading { font-size: 14px; }
.dsh-github-md-body h4.dsh-github-md-heading { font-size: 13px; }
.dsh-github-md-body h5.dsh-github-md-heading,
.dsh-github-md-body h6.dsh-github-md-heading { font-size: 12px; opacity: 0.9; }
.dsh-github-md-body > .dsh-github-md-heading:first-child {
margin-top: 0;
}
.dsh-github-md-body .dsh-github-md-p {
margin: 0 0 10px 0;
}
.dsh-github-md-body .dsh-github-md-p:last-child {
margin-bottom: 0;
}
.dsh-github-md-body .dsh-github-md-inline-code {
font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace;
font-size: 0.92em;
padding: 1px 5px;
border-radius: 4px;
background: var(--dsw-alias-bg-subtle, rgba(0, 0, 0, 0.06));
border: 1px solid var(--dsw-alias-border-subtle, rgba(0, 0, 0, 0.08));
word-break: break-all;
}
body[data-ds-dark-theme] .dsh-github-md-body .dsh-github-md-inline-code {
background: rgba(255, 255, 255, 0.1);
border-color: rgba(255, 255, 255, 0.12);
}
.dsh-github-md-body .dsh-github-md-pre {
margin: 10px 0;
padding: 10px 12px;
border-radius: 6px;
overflow-x: auto;
max-height: 420px;
background: var(--dsw-alias-bg-subtle, rgba(0, 0, 0, 0.04));
border: 1px solid var(--dsw-alias-border-l2, #e1e4e8);
}
body[data-ds-dark-theme] .dsh-github-md-body .dsh-github-md-pre {
background: rgba(0, 0, 0, 0.3);
border-color: var(--dsw-alias-border-l1, #30363d);
}
.dsh-github-md-body .dsh-github-md-pre code {
font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace;
font-size: 11px;
line-height: 1.55;
white-space: pre;
display: block;
}
.dsh-github-md-body .dsh-github-md-list {
margin: 8px 0;
padding-left: 22px;
}
.dsh-github-md-body .dsh-github-md-list li {
margin: 4px 0;
}
.dsh-github-md-body .dsh-github-md-task {
list-style: none;
margin-left: -18px;
display: flex;
align-items: flex-start;
gap: 6px;
}
.dsh-github-md-body .dsh-github-md-checkbox {
flex-shrink: 0;
opacity: 0.8;
}
.dsh-github-md-body .dsh-github-md-quote {
margin: 10px 0;
padding: 6px 12px;
border-left: 3px solid var(--dsw-alias-border-l3, #d0d7de);
color: var(--dsw-alias-label-secondary, #656d76);
background: var(--dsw-alias-bg-subtle, rgba(0, 0, 0, 0.02));
border-radius: 0 4px 4px 0;
}
.dsh-github-md-body .dsh-github-md-hr {
margin: 14px 0;
border: none;
border-top: 1px solid var(--dsw-alias-border-l2, #e1e4e8);
}
body[data-ds-dark-theme] .dsh-github-md-body .dsh-github-md-hr {
border-top-color: var(--dsw-alias-border-l1, #30363d);
}
.dsh-github-md-body .dsh-github-md-link {
color: var(--dsw-alias-link, #0969da);
text-decoration: none;
}
.dsh-github-md-body .dsh-github-md-link:hover {
text-decoration: underline;
}
body[data-ds-dark-theme] .dsh-github-md-body .dsh-github-md-link {
color: #58a6ff;
}
.dsh-github-md-expand-btn {
display: inline-flex;
align-items: center;
gap: 4px;
margin: 0 0 4px 12px;
padding: 3px 8px;
font-size: 11px;
font-weight: 500;
border-radius: 5px;
border: 1px solid var(--dsw-alias-border-l2, #d0d7de);
background: var(--dsw-alias-bg-module-platform, #f6f8fa);
color: var(--dsw-alias-label-secondary, #57606a);
cursor: pointer;
transition: all 0.15s ease;
}
.dsh-github-md-expand-btn:hover {
color: var(--dsw-alias-link, #0969da);
border-color: var(--dsw-alias-link, #0969da);
}
body[data-ds-dark-theme] .dsh-github-md-expand-btn {
border-color: var(--dsw-alias-border-l1, #30363d);
background: var(--dsw-alias-bg-layer-2, #1e1e22);
color: var(--dsw-alias-label-secondary, #8b949e);
}
body[data-ds-dark-theme] .dsh-github-md-expand-btn:hover {
color: #58a6ff;
border-color: #58a6ff;
}
.dsh-github-issue-modal-dialog {
width: 92% !important;
max-width: 880px !important;
height: 84vh !important;
max-height: 84vh !important;
display: flex !important;
flex-direction: column !important;
overflow: hidden !important;
padding: 0 !important;
}
.dsh-github-issue-modal-header {
padding: 12px 16px !important;
border-bottom: 1px solid var(--dsw-alias-border-l2, #e1e4e8);
background: var(--dsw-alias-bg-layer-1, #f6f8fa);
flex-shrink: 0;
}
body[data-ds-dark-theme] .dsh-github-issue-modal-header {
border-bottom-color: var(--dsw-alias-border-l1, #30363d);
background: var(--dsw-alias-bg-layer-1, #16161a);
}
.dsh-github-issue-conversation-pane {
padding: 16px !important;
overflow-y: auto !important;
flex: 1;
min-height: 0;
display: flex;
flex-direction: column;
gap: 12px;
overscroll-behavior: contain;
}
.dsh-github-issue-meta {
display: flex;
flex-wrap: wrap;
align-items: center;
gap: 6px;
flex: 0 0 auto;
}
.dsh-github-issue-chip {
display: inline-flex;
align-items: center;
gap: 5px;
padding: 2px 8px;
border-radius: 999px;
border: 1px solid var(--dsw-alias-border-l2, #d0d7de);
background: var(--dsw-alias-bg-module-platform, #f6f8fa);
color: var(--dsw-alias-label-secondary, #57606a);
font-size: 11px;
line-height: 18px;
white-space: nowrap;
max-width: 100%;
overflow: hidden;
text-overflow: ellipsis;
}
.dsh-github-issue-label-chip {
color: var(--dsw-alias-label-primary, #1f2328);
}
.dsh-github-issue-chip-overdue {
border-color: rgba(207, 34, 46, 0.5);
color: var(--dsw-alias-state-error-primary, #cf222e);
}
body[data-ds-dark-theme] .dsh-github-issue-chip-overdue {
border-color: rgba(248, 81, 73, 0.5);
color: #f85149;
}
.dsh-github-issue-label-dot {
width: 7px;
height: 7px;
border-radius: 50%;
flex-shrink: 0;
}
.dsh-github-issue-chip-btn,
.dsh-github-issue-chip-link {
cursor: pointer;
text-decoration: none;
font-family: inherit;
transition: border-color 0.15s ease, color 0.15s ease;
}
.dsh-github-issue-chip-btn:hover,
.dsh-github-issue-chip-link:hover {
color: var(--dsw-alias-link, #0969da);
border-color: var(--dsw-alias-link, #0969da);
}
body[data-ds-dark-theme] .dsh-github-issue-chip {
border-color: var(--dsw-alias-border-l1, #30363d);
background: var(--dsw-alias-bg-layer-2, #1e1e22);
color: var(--dsw-alias-label-secondary, #8b949e);
}
body[data-ds-dark-theme] .dsh-github-issue-label-chip {
color: var(--dsw-alias-label-primary, #f0f6fc);
}
body[data-ds-dark-theme] .dsh-github-issue-chip-btn:hover,
body[data-ds-dark-theme] .dsh-github-issue-chip-link:hover {
color: #58a6ff;
border-color: #58a6ff;
}
.dsh-github-issue-image-badge {
display: inline-flex;
flex-direction: column;
gap: 6px;
max-width: 100%;
}
.dsh-github-issue-image-links {
display: flex;
flex-direction: column;
gap: 3px;
padding: 6px 8px;
border-radius: 6px;
border: 1px solid var(--dsw-alias-border-l2, #e1e4e8);
background: var(--dsw-alias-bg-base, #ffffff);
}
body[data-ds-dark-theme] .dsh-github-issue-image-links {
border-color: var(--dsw-alias-border-l1, #30363d);
background: var(--dsw-alias-bg-layer-2, #1e1e22);
}
.dsh-github-issue-image-link {
font-size: 11px;
font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace;
color: var(--dsw-alias-link, #0969da);
text-decoration: none;
overflow: hidden;
text-overflow: ellipsis;
white-space: nowrap;
}
.dsh-github-issue-image-link:hover {
text-decoration: underline;
}
.dsh-github-issue-body-card,
.dsh-github-issue-comment-card {
border: 1px solid var(--dsw-alias-border-l2, #e1e4e8);
border-radius: 6px;
background: var(--dsw-alias-bg-base, #ffffff);
overflow: hidden;
flex: 0 0 auto;
}
.dsh-github-issue-comment-card {
margin-bottom: 10px;
}
body[data-ds-dark-theme] .dsh-github-issue-body-card,
body[data-ds-dark-theme] .dsh-github-issue-comment-card {
border-color: var(--dsw-alias-border-l1, #30363d);
background: var(--dsw-alias-bg-layer-2, #1e1e22);
}
.dsh-github-issue-comment-header {
display: flex;
justify-content: space-between;
align-items: center;
gap: 8px;
padding: 6px 12px;
background: var(--dsw-alias-bg-module-platform, #f6f8fa);
border-bottom: 1px solid var(--dsw-alias-border-l2, #e1e4e8);
font-size: 11px;
}
body[data-ds-dark-theme] .dsh-github-issue-comment-header {
background: var(--dsw-alias-bg-layer-1, #16161a);
border-bottom-color: var(--dsw-alias-border-l1, #30363d);
}
.dsh-github-issue-body-content {
padding: 0;
}
.dsh-github-issue-timeline-title {
margin: 4px 0 0 0;
font-size: 13px;
font-weight: 600;
color: var(--dsw-alias-label-primary, #1f2328);
flex: 0 0 auto;
}
body[data-ds-dark-theme] .dsh-github-issue-timeline-title {
color: var(--dsw-alias-label-primary, #f0f6fc);
}
.dsh-github-issue-empty-timeline {
padding: 16px 0;
text-align: center;
font-size: 12px;
opacity: 0.6;
flex: 0 0 auto;
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
/** PR 审阅弹窗文件区布局偏好（宽度 + 折叠态） */
const PR_FILE_PANE_STORAGE_KEY = "dsh_github_pr_file_pane_v1";
/** 文件区默认宽度与边界（px）。下限保证路径可读，上限由容器宽度动态收敛 */
const PR_FILE_PANE_DEFAULT_WIDTH = 280;
const PR_FILE_PANE_MIN_WIDTH = 160;
/** 文件区最多占容器宽度的比例——再宽就没地方看 diff 了 */
const PR_FILE_PANE_MAX_RATIO = 0.6;
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
/** 右侧栏 PR / Issue 状态筛选偏好（按 cwd 隔离，不同仓库各自记住选择） */
const RIGHTBAR_STATE_FILTER_KEY = "dsh_github_rightbar_state_filter_v1";
/** 合法筛选值；任何非法输入一律回落 all，绝不让脏数据把列表筛成空白 */
const PR_STATE_FILTERS = ["all", "open", "merged", "closed"];
const ISSUE_STATE_FILTERS = ["all", "open", "closed"];
function sanitizeFilter(value, allowed) {
    var v = typeof value === "string" ? value.trim().toLowerCase() : "";
    return allowed.indexOf(v) >= 0 ? v : "all";
}
/**
 * 把 cwd 映射为存储作用域键。
 *
 * 为什么不能只用 `replace(/[^a-zA-Z0-9_-]/g, "_")`：那是把不同路径**压成同一个键**
 * （实测 `/a/b` 与 `/a_b` 都会变成 `_a_b`），两个仓库的筛选会互相覆盖。
 * 这里改为「可读前缀 + 全路径哈希后缀」：既保留排查时可辨认的目录名，
 * 又让任意两条路径都落在不同键上。
 *
 * 散列只用于去重，不需要密码学强度；FNV-1a 足够且零依赖。
 */
function scopeKeyForCwd(cwd) {
    var raw = typeof cwd === "string" && cwd ? cwd : "default";
    var hash = 0x811c9dc5;
    for (var i = 0; i < raw.length; i++) {
        hash ^= raw.charCodeAt(i);
        // FNV-1a 32 位：Math.imul 保证不丢精度
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    var readable = raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(-24);
    return readable + "~" + hash.toString(36);
}
/**
 * 读取右侧栏 PR / Issue 的状态筛选偏好。
 *
 * 为什么按 cwd 分开存：同一个浏览器可能同时开着多个工作区，
 * PR 集中在 A 仓库、Issue 集中在 B 仓库时，用户对两者的关注档位不同，
 * 共用一个 key 会导致切仓库后筛选被另一个仓库的选择覆盖。
 */
function getStoredRightbarStateFilter(cwd) {
    var fallback = { pr: "all", issue: "all" };
    try {
        var raw = localStorage.getItem(RIGHTBAR_STATE_FILTER_KEY);
        if (!raw)
            return fallback;
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object")
            return fallback;
        var entry = parsed[scopeKeyForCwd(cwd)];
        if (!entry || typeof entry !== "object")
            return fallback;
        return {
            pr: sanitizeFilter(entry.pr, PR_STATE_FILTERS),
            issue: sanitizeFilter(entry.issue, ISSUE_STATE_FILTERS),
        };
    }
    catch (e) {
        return fallback;
    }
}
/** 保存右侧栏状态筛选偏好（写入失败静默——纯 UI 偏好不值得弹错） */
function saveStoredRightbarStateFilter(cwd, next) {
    try {
        var raw = localStorage.getItem(RIGHTBAR_STATE_FILTER_KEY);
        var parsed = {};
        if (raw) {
            try {
                var p = JSON.parse(raw);
                if (p && typeof p === "object")
                    parsed = p;
            }
            catch (e) {
                // 历史脏数据：整体重置，避免一条坏记录永久污染全部仓库的筛选
                parsed = {};
            }
        }
        var scope = scopeKeyForCwd(cwd);
        var prev = parsed[scope] && typeof parsed[scope] === "object" ? parsed[scope] : {};
        parsed[scope] = {
            pr: sanitizeFilter(next.pr !== undefined ? next.pr : prev.pr, PR_STATE_FILTERS),
            issue: sanitizeFilter(next.issue !== undefined ? next.issue : prev.issue, ISSUE_STATE_FILTERS),
        };
        localStorage.setItem(RIGHTBAR_STATE_FILTER_KEY, JSON.stringify(parsed));
    }
    catch (e) { }
}
/**
 * 把期望宽度收敛到合法区间。
 *
 * 抽成纯函数的原因：边界逻辑（未超限/低于下限/超过上限）是被单测断言的规则，
 * 埋在事件回调里就只能靠人工点点看。dnd 拖拽最容易出的 bug 就是能拖成负数
 * 或把 diff 区域挤成 0 宽度——这里一次性挡住。
 *
 * @param next 拖拽得到的候选宽度
 * @param containerWidth 容器实际宽度（未知时传 0，此时只做下限保护）
 */
function clampFilePaneWidth(next, containerWidth) {
    const min = PR_FILE_PANE_MIN_WIDTH;
    const max = containerWidth > 0
        ? Math.max(min, Math.floor(containerWidth * PR_FILE_PANE_MAX_RATIO))
        : Number.MAX_SAFE_INTEGER;
    const value = Number.isFinite(next) ? Math.round(next) : PR_FILE_PANE_DEFAULT_WIDTH;
    return Math.min(Math.max(value, min), max);
}
/** 读取文件区偏好；任何异常或脏数据都退回默认值，绝不因偏好损坏打挂弹窗 */
function getPrFilePanePrefs() {
    const fallback = { width: PR_FILE_PANE_DEFAULT_WIDTH, hidden: false };
    try {
        var raw = localStorage.getItem(PR_FILE_PANE_STORAGE_KEY);
        if (!raw)
            return fallback;
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object")
            return fallback;
        var w = Number(parsed.width);
        return {
            width: Number.isFinite(w) ? clampFilePaneWidth(w, 0) : fallback.width,
            hidden: parsed.hidden === true,
        };
    }
    catch (e) {
        return fallback;
    }
}
/** 持久化文件区偏好（写入失败静默——布局偏好不值得弹错） */
function savePrFilePanePrefs(prefs) {
    try {
        localStorage.setItem(PR_FILE_PANE_STORAGE_KEY, JSON.stringify({
            width: clampFilePaneWidth(prefs.width, 0),
            hidden: prefs.hidden === true,
        }));
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

// ---- [Bundled: repo-selector.js] ----
/**
 * 关联仓库（上游源仓库 ↔ 个人复刻 Fork）切换下拉组件。
 *
 * 为什么单仓库时返回 null：单仓库场景没有切换意义，保持现有卡片外观 100% 纯净零噪音；
 * 仅在检测到当前工作区存在双 remote 或 Fork 关联拓扑时激活。
 */
function RepoSelectorDropdown(props) {
    var associatedRepos = Array.isArray(props.associatedRepos) ? props.associatedRepos : [];
    var currentRepo = (props.currentRepo || '').toLowerCase();
    var cwd = props.cwd;
    var onRepoSwitched = props.onRepoSwitched || (() => { });
    var showToast = props.showToast || (() => { });
    // 严格遵守 React Hooks 铁律：所有 useState / useRef / useEffect 必须无条件在顶层执行，
    // 严禁在任何条件分支/early return 之后调用 Hooks，杜绝触发
    // "Rendered fewer hooks than expected" 的致命运行时崩溃。
    var [isOpen, setIsOpen] = React.useState(false);
    var [switching, setSwitching] = React.useState(false);
    var containerRef = React.useRef(null);
    React.useEffect(() => {
        if (!isOpen)
            return;
        var handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);
    // Hooks 执行完毕后再进行单仓库零噪音短路返回
    if (associatedRepos.length <= 1) {
        return null;
    }
    var toggleOpen = (e) => {
        e.stopPropagation();
        setIsOpen(!isOpen);
    };
    var handleSwitch = async (targetRepo, targetRemote) => {
        if (switching)
            return;
        setSwitching(true);
        try {
            var res = await fetch('/api/github/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'set_default_repo',
                    cwd,
                    repo: targetRepo,
                    remote: targetRemote,
                }),
            });
            var json = await res.json().catch(() => ({}));
            if (!res.ok || !json.ok) {
                showToast(`❌ 切换基准仓库失败：${json.error || json.message || res.statusText}`);
                return;
            }
            setIsOpen(false);
            showToast(`✅ 已将基准仓库切换为 ${targetRepo}`);
            onRepoSwitched(targetRepo);
        }
        catch (err) {
            showToast(`❌ 切换请求异常：${err?.message || err}`);
        }
        finally {
            setSwitching(false);
        }
    };
    var roleLabel = (role) => {
        switch (role) {
            case 'fork': return '我的复刻';
            case 'upstream': return '上游源仓库';
            case 'parent': return '上游主干';
            case 'origin': return 'origin';
            default: return '远程关联';
        }
    };
    var roleBadgeTone = (role) => {
        switch (role) {
            case 'fork': return 'dsh-badge-purple';
            case 'upstream':
            case 'parent': return 'dsh-badge-readonly';
            default: return 'dsh-badge-blue';
        }
    };
    var h = React.createElement;
    return h('div', {
        ref: containerRef,
        style: { position: 'relative', display: 'inline-flex', alignItems: 'center' },
        className: 'dsh-github-repo-selector-container',
    }, h('button', {
        type: 'button',
        className: 'dsh-github-repo-switch-trigger',
        onClick: toggleOpen,
        title: `当前关联 ${associatedRepos.length} 个远程仓库（点击切换基准）`,
        disabled: switching,
    }, h('span', null, switching ? '⏳' : '⇄'), h('span', { style: { fontSize: '11px', fontWeight: 500 } }, '切换仓库'), h('span', { style: { fontSize: '9px', opacity: 0.7 } }, '▾')), isOpen
        ? h('div', { className: 'dsh-github-repo-dropdown' }, h('div', { className: 'dsh-github-repo-dropdown-header' }, h('span', null, '选择当前工作区基准仓库'), h('span', { style: { fontSize: '11px', opacity: 0.6 } }, `${associatedRepos.length} 可用`)), h('div', { className: 'dsh-github-repo-dropdown-list' }, associatedRepos.map(function (item) {
            var isSelected = item.isCurrent || item.nameWithOwner.toLowerCase() === currentRepo;
            return h('div', {
                key: item.nameWithOwner,
                className: 'dsh-github-repo-item' + (isSelected ? ' selected' : ''),
                title: isSelected ? '当前正在使用的基准仓库' : `点击切换基准为 ${item.nameWithOwner}`,
                onClick: function () {
                    if (!isSelected && !switching) {
                        handleSwitch(item.nameWithOwner, item.remoteName);
                    }
                },
            }, h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' } }, h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 } }, h('span', { style: { color: isSelected ? 'var(--dsw-alias-link, #0969da)' : 'inherit', fontWeight: isSelected ? 600 : 400 } }, item.nameWithOwner), h('span', { className: 'dsh-github-badge ' + roleBadgeTone(item.role), style: { fontSize: '10px', padding: '0 5px' } }, roleLabel(item.role))), isSelected ? h('span', { style: { color: 'var(--dsw-alias-state-success, #1a7f37)', fontWeight: 600 } }, '✓') : null));
        })), h('div', { className: 'dsh-github-repo-dropdown-footer' }, '💡 切换后系统将自动调用 gh repo set-default 对齐终端与面板'))
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

// ---- [Bundled: markdown-lite.js] ----
/**
 * 轻量 Markdown 解析与 React 渲染（零依赖）。
 *
 * 为什么必须自己写：本插件没有前端 dependencies，bundle 机制只内联
 * lib/ui/*.js 且不做 import 解析，因此 marked / markdown-it 都无法引入。
 * 服务端的 src/renderers/* 只产出给模型看的 Markdown 文本，不能复用为 DOM。
 *
 * 设计取舍：
 * - 只支持 GitHub PR/Issue 实际会用到的语法子集（标题/粗斜体/行内码/
 *   围栏代码块/列表/引用/分隔线/链接）。表格、图片、内嵌 HTML 明确不做。
 * - 无法识别的语法**降级为纯文本**，绝不抛错——弹窗是只读展示，
 *   因为一段奇怪文本崩掉整块内容是不可接受的。
 * - 全程 React.createElement，**从不使用 dangerouslySetInnerHTML**：
 *   用户写的 <script> 会被当作纯文本渲染，天然免疫 XSS。
 */
/**
 * 链接协议白名单。
 *
 * 为什么必须白名单：Markdown 的链接目标是**用户可控文本**。
 * `[点我](javascript:alert(1))` 若直接渲染成 href，点击即执行脚本。
 * 只放行 http/https/mailto，其余降级为纯文本（保留文字，不生成 <a>）。
 */
function isSafeHref(href) {
    if (typeof href !== 'string')
        return false;
    const trimmed = href.trim();
    if (!trimmed)
        return false;
    if (/^(https?:\/\/|mailto:)/i.test(trimmed))
        return true;
    // 站内相对路径（如 /owner/repo/issues/1）视为安全，但必须以单个 / 开头
    if (/^\/(?!\/)/.test(trimmed))
        return true;
    return false;
}
/**
 * 解析行内语法：`code` / **strong** / *em* / [text](url)。
 *
 * 用单遍扫描而非多次 replace 的原因：
 * 行内代码里的内容**不应再被解析**（`**a**` 是字面量），
 * 分段替换很容易把代码块内的星号也吃掉。手写扫描能保证优先级正确：
 * 行内代码 > 链接 > 粗体 > 斜体。
 */
function parseInline(src) {
    const out = [];
    const text = String(src ?? '');
    let buf = '';
    let i = 0;
    const flush = () => {
        if (buf) {
            out.push({ type: 'text', text: buf });
            buf = '';
        }
    };
    while (i < text.length) {
        const ch = text[i];
        // ---- 行内代码：最高优先级，内部不再解析任何语法 ----
        if (ch === '`') {
            const close = text.indexOf('`', i + 1);
            if (close > i) {
                flush();
                out.push({ type: 'code', text: text.slice(i + 1, close) });
                i = close + 1;
                continue;
            }
        }
        // ---- 链接：[text](url) ----
        if (ch === '[') {
            const closeBracket = text.indexOf(']', i + 1);
            if (closeBracket > i && text[closeBracket + 1] === '(') {
                const closeParen = text.indexOf(')', closeBracket + 2);
                if (closeParen > closeBracket) {
                    const label = text.slice(i + 1, closeBracket);
                    const href = text.slice(closeBracket + 2, closeParen);
                    flush();
                    if (isSafeHref(href)) {
                        out.push({ type: 'link', href: href.trim(), children: [{ type: 'text', text: label }] });
                    }
                    else {
                        // 不安全协议：保留可见文字，但不生成可点链接
                        out.push({ type: 'text', text: label });
                    }
                    i = closeParen + 1;
                    continue;
                }
            }
        }
        // ---- 粗体：**text** 或 __text__ ----
        if ((ch === '*' && text[i + 1] === '*') || (ch === '_' && text[i + 1] === '_')) {
            const mark = ch + ch;
            const close = text.indexOf(mark, i + 2);
            if (close > i + 2) {
                flush();
                out.push({ type: 'strong', children: parseInline(text.slice(i + 2, close)) });
                i = close + 2;
                continue;
            }
        }
        // ---- 斜体：*text* 或 _text_（单字符，且不能被上面粗体规则截获） ----
        if (ch === '*' || ch === '_') {
            // 避免把列表标记或孤立的 * 当斜体：要求闭合符前后都不是同一字符
            const close = text.indexOf(ch, i + 1);
            if (close > i + 1 && text[close + 1] !== ch && text[close - 1] !== ch) {
                flush();
                out.push({ type: 'em', children: parseInline(text.slice(i + 1, close)) });
                i = close + 1;
                continue;
            }
        }
        buf += ch;
        i++;
    }
    flush();
    return out;
}
/** 判断一行是否是围栏代码块标记，返回 { fence, lang } 或 null */
function matchFence(line) {
    const m = /^\s*(```+|~~~+)\s*([A-Za-z0-9_+-]*)\s*$/.exec(line);
    if (!m)
        return null;
    return { fence: m[1], lang: m[2] || '' };
}
/** 判断一行是否是列表项，返回 { marker, content, ordered } 或 null */
function matchListItem(line) {
    const m = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(line);
    if (!m)
        return null;
    return { marker: m[2], content: m[3], ordered: /\d+\./.test(m[2]) };
}
/**
 * 把 Markdown 源文本解析为块级 AST。
 *
 * 纯函数、无 I/O，可被单测直接覆盖——这是把「渲染正确性」从浏览器里
 * 剥离出来断言的关键。任何异常输入都返回空数组，绝不抛错。
 */
function parseMarkdownBlocks(src) {
    const blocks = [];
    if (typeof src !== 'string' || !src.trim())
        return blocks;
    const lines = src.replace(/\r\n/g, '\n').split('\n');
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        // ---- 空行 ----
        if (!line.trim()) {
            i++;
            continue;
        }
        // ---- 围栏代码块 ----
        const fence = matchFence(line);
        if (fence) {
            const codeLines = [];
            i++;
            // 一直读到同种围栏闭合；未闭合时读到末尾（容错，不报错）
            while (i < lines.length) {
                const maybeClose = matchFence(lines[i]);
                if (maybeClose && maybeClose.fence[0] === fence.fence[0] && maybeClose.fence.length >= fence.fence.length) {
                    i++;
                    break;
                }
                codeLines.push(lines[i]);
                i++;
            }
            blocks.push({ type: 'code', lang: fence.lang, text: codeLines.join('\n') });
            continue;
        }
        // ---- 标题 ----
        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        if (heading) {
            blocks.push({ type: 'heading', level: heading[1].length, children: parseInline(heading[2].trim()) });
            i++;
            continue;
        }
        // ---- 分隔线 ----
        if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
            blocks.push({ type: 'hr' });
            i++;
            continue;
        }
        // ---- 引用：连续 > 行合并为一个 blockquote ----
        if (/^\s*>\s?/.test(line)) {
            const quoteLines = [];
            while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
                quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
                i++;
            }
            blocks.push({ type: 'quote', children: parseInline(quoteLines.join('\n').trim()) });
            continue;
        }
        // ---- 列表：连续同类型（有序/无序）合并为一个 list ----
        const firstItem = matchListItem(line);
        if (firstItem) {
            const ordered = firstItem.ordered;
            const items = [];
            while (i < lines.length) {
                const item = matchListItem(lines[i]);
                if (!item || item.ordered !== ordered)
                    break;
                items.push({ marker: item.marker, children: parseInline(item.content) });
                i++;
            }
            blocks.push({ type: 'list', ordered, items });
            continue;
        }
        // ---- 段落：连续非空行合并 ----
        const paraLines = [];
        while (i < lines.length) {
            const cur = lines[i];
            if (!cur.trim())
                break;
            // 遇到块级语法起始就停下，交给下一轮解析
            if (matchFence(cur) || /^(#{1,6})\s+/.test(cur) || /^\s*>\s?/.test(cur) || matchListItem(cur) || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(cur)) {
                break;
            }
            paraLines.push(cur);
            i++;
        }
        // 段落内的硬换行保留为 text 中的 \n，渲染时用 white-space: pre-wrap 呈现
        if (paraLines.length > 0) {
            blocks.push({ type: 'paragraph', children: parseInline(paraLines.join('\n')) });
        }
        else {
            // 兜底：当前行以某种方式无法消费时跳过，防止死循环
            i++;
        }
    }
    return blocks;
}
/**
 * 把 AST 渲染为 React 元素数组。
 *
 * @param h React.createElement
 * @param blocks parseMarkdownBlocks 的产物
 */
function renderMarkdownBlocks(h, blocks) {
    if (!Array.isArray(blocks))
        return [];
    const renderInline = (nodes, keyPrefix) => {
        if (!Array.isArray(nodes))
            return [];
        return nodes.map((n, idx) => {
            const key = `${keyPrefix}-${idx}`;
            switch (n.type) {
                case 'code':
                    return h('code', { key, className: 'dsh-github-md-inline-code' }, n.text ?? '');
                case 'strong':
                    return h('strong', { key }, renderInline(n.children, key));
                case 'em':
                    return h('em', { key }, renderInline(n.children, key));
                case 'link':
                    return h('a', {
                        key,
                        href: n.href,
                        target: '_blank',
                        rel: 'noopener noreferrer',
                        className: 'dsh-github-md-link',
                    }, renderInline(n.children, key));
                default:
                    return h('span', { key }, n.text ?? '');
            }
        });
    };
    return blocks.map((b, idx) => {
        const key = `md-${idx}`;
        switch (b.type) {
            case 'heading': {
                const tag = `h${Math.min(Math.max(b.level || 1, 1), 6)}`;
                return h(tag, { key, className: 'dsh-github-md-heading' }, renderInline(b.children, key));
            }
            case 'code':
                return h('pre', { key, className: 'dsh-github-md-pre' }, h('code', { className: b.lang ? `language-${b.lang}` : undefined }, b.text ?? ''));
            case 'list': {
                const tag = b.ordered ? 'ol' : 'ul';
                return h(tag, { key, className: 'dsh-github-md-list' }, (b.items || []).map((item, ii) => {
                    const itemKey = `${key}-${ii}`;
                    // 任务列表：- [ ] / - [x]
                    const raw = (item.children || []).map((c) => c.text || '').join('');
                    const task = /^\[( |x|X)\]\s*/.exec(raw);
                    if (task) {
                        const checked = task[1].toLowerCase() === 'x';
                        const rest = raw.replace(/^\[( |x|X)\]\s*/, '');
                        return h('li', { key: itemKey, className: 'dsh-github-md-task' }, h('span', { className: 'dsh-github-md-checkbox' }, checked ? '☑' : '☐'), h('span', null, rest));
                    }
                    return h('li', { key: itemKey }, renderInline(item.children, itemKey));
                }));
            }
            case 'quote':
                return h('blockquote', { key, className: 'dsh-github-md-quote' }, renderInline(b.children, key));
            case 'hr':
                return h('hr', { key, className: 'dsh-github-md-hr' });
            default:
                return h('p', { key, className: 'dsh-github-md-p' }, renderInline(b.children, key));
        }
    });
}
/**
 * 估算一段 Markdown 渲染后的行数，用于决定是否折叠。
 *
 * 为什么用估算而不是测量 DOM：getBoundingClientRect 需要 ref + 二次渲染，
 * 在弹窗内会造成可见的布局抖动。按换行数 + 长行折行数估算已足够准确，
 * 且成本为零。阈值取保守值——宁可多折一次，也不要漏折导致内容淹没页面。
 */
function estimateContentLines(src, charsPerLine = 80) {
    if (typeof src !== 'string' || !src)
        return 0;
    let lines = 0;
    for (const raw of src.replace(/\r\n/g, '\n').split('\n')) {
        const len = raw.length;
        lines += len === 0 ? 1 : Math.ceil(len / charsPerLine);
    }
    return lines;
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

// ---- [Bundled: pr-modal.js] ----
/**
 * 可折叠的 Markdown 内容块。
 *
 * 【为什么必须定义在模块顶层，不能写在 PrDetailModal 函数体内】
 * 函数体内定义的组件每次父级渲染都会产生**新的函数引用**，
 * React 按引用比较类型，会把 h(CollapsibleBody, ...) 当成**另一个组件**，
 * 于是卸载重建、useState 的展开状态被重置。
 * 表现就是：用户刚点开一条长评论，一拖分隔条（触发父级重渲染）评论又缩回去了。
 * 提到模块级后引用恒定，状态才能跨父级渲染存活。
 */
function CollapsibleBody(props) {
    var h = React.createElement;
    var raw = typeof props.text === "string" ? props.text : "";
    var totalLines = estimateContentLines(raw);
    // 阈值取保守值（8 行 / 400 字符）：宁可多给一个展开按钮，
    // 也不要让长评论把后续内容淹掉。
    var collapsible = totalLines > 8 || raw.length > 400;
    var st = React.useState(props.defaultExpanded);
    var expanded = st[0];
    var setExpanded = st[1];
    var inner = null;
    if (raw.trim()) {
        inner = renderMarkdownBlocks(h, parseMarkdownBlocks(raw));
    }
    if (!inner || inner.length === 0) {
        return h("div", { style: { padding: "10px 12px", fontSize: "12px", opacity: 0.5, fontStyle: "italic" } }, "（无正文）");
    }
    if (!collapsible) {
        return h("div", { className: "dsh-github-md-body" }, inner);
    }
    return h("div", null, h("div", {
        className: "dsh-github-md-body",
        style: {
            maxHeight: expanded ? "none" : "132px",
            overflow: expanded ? "visible" : "hidden",
            position: "relative",
        },
    }, inner, 
    // 折叠时底部渐隐，暗示内容被截断而不是到此为止
    !expanded
        ? h("div", {
            style: {
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: "24px",
                pointerEvents: "none",
                background: "linear-gradient(to bottom, transparent, var(--dsw-alias-bg-base, #ffffff))",
            },
        })
        : null), h("button", {
        type: "button",
        className: "dsh-github-md-expand-btn",
        onClick: function (e) {
            e.stopPropagation();
            setExpanded(!expanded);
        },
        title: expanded ? "收起内容" : "展开全部内容",
    }, expanded ? "⌃ 收起" : "⌄ 展开全部（约 " + totalLines + " 行）"));
}
/**
 * PR 在线完整审阅与代码比对工作台模态弹窗组件。
 *
 * 架构设计：
 * 1. 单次网络往返拉取元数据与 Diff 切片，按文件切换比对 0ms 瞬间响应；
 * 2. 覆盖作者卡片、状态徽章、分支流向、正文描述、CI 与审查决定；
 * 3. 评论回复流 Timeline（Issue Comments + Review 评注）；
 * 4. 变动文件清单与行级高保真 Unified Diff 比对（绿色新增、红色删除、灰底 Hunk）。
 */
function PrDetailModal(props) {
    var prNumber = props.prNumber;
    var repoNameWithOwner = props.repoNameWithOwner || "";
    var cwd = props.cwd;
    var onClose = props.onClose;
    var showToast = props.showToast || (() => { });
    // 严格遵守 React Hooks 铁律：所有 Hooks 必须无条件在顶层执行，
    // 严禁在 early return 之后调用。否则「prNumber 由空变有值」时
    // 两次渲染的 Hook 数量不一致，会触发
    // "Rendered fewer hooks than expected" 的致命运行时崩溃。
    var [data, setData] = React.useState(null);
    var [loading, setLoading] = React.useState(true);
    var [error, setError] = React.useState(null);
    var [activeTab, setActiveTab] = React.useState("conversation");
    var [selectedFilePath, setSelectedFilePath] = React.useState(null);
    var [copied, setCopied] = React.useState(false);
    // 文件区布局：宽度可拖拽、可整块折叠。初值从 localStorage 偏好恢复。
    // 同样必须无条件在顶层执行（与上面几个 Hook 一并满足调用顺序铁律）。
    var initialPanePrefs = getPrFilePanePrefs();
    var [filePaneWidth, setFilePaneWidth] = React.useState(initialPanePrefs.width);
    var [filePaneHidden, setFilePaneHidden] = React.useState(initialPanePrefs.hidden);
    var paneContainerRef = React.useRef(null);
    // 宽度镜像 ref：供异步回调（如 setState updater）读取最新值，
    // 避免闭包捕获渲染期快照导致的偏好回跳。
    var widthRef = React.useRef(initialPanePrefs.width);
    widthRef.current = filePaneWidth;
    // 拖拽起点存 ref 而非 state：mousemove 每秒触发几十次，
    // 把起点塞进 state 会引发无意义的重渲染风暴。
    var dragStateRef = React.useRef(null);
    // 拖拽进行中的清理函数：组件卸载（如拖到一半按 Esc）时必须兜底解绑，
    // 否则 document 上的 mousemove 与 body 的 col-resize 光标会永久残留。
    var cleanupDragRef = React.useRef(null);
    // Hooks 执行完毕后再做空值短路
    if (!prNumber)
        return null;
    // 卸载兜底：拖拽中途关闭弹窗（Esc / 点遮罩）时清理 document 监听与 body 光标
    React.useEffect(() => {
        return () => {
            if (cleanupDragRef.current) {
                cleanupDragRef.current();
                cleanupDragRef.current = null;
            }
        };
    }, []);
    // Esc 键监听关闭
    React.useEffect(() => {
        var onKeyDown = (e) => {
            if (e.key === "Escape" || e.keyCode === 27)
                onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onClose]);
    // 拉取 PR 详情与差异数据
    React.useEffect(() => {
        // 无有效编号时不发请求（Hooks 已无条件执行，这里只做副作用守卫）
        if (!prNumber) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        var url = "/api/github/pr-detail?number=" +
            encodeURIComponent(String(prNumber)) +
            (repoNameWithOwner ? "&repo=" + encodeURIComponent(repoNameWithOwner) : "") +
            (cwd ? "&cwd=" + encodeURIComponent(cwd) : "");
        fetch(url)
            .then(async (res) => {
            if (!res.ok) {
                var errText = await res.text().catch(() => "");
                var j = null;
                try {
                    j = JSON.parse(errText);
                }
                catch (e) { }
                throw new Error(j?.error || j?.message || errText || `服务响应异常 (${res.status})`);
            }
            return res.json();
        })
            .then((json) => {
            setLoading(false);
            if (json && json.ok && json.data) {
                setData(json.data);
                // 默认选中第一个修改的文件
                if (Array.isArray(json.data.files) && json.data.files.length > 0) {
                    setSelectedFilePath(json.data.files[0].path);
                }
            }
            else {
                setError(json?.error || "获取 PR 详情失败");
            }
        })
            .catch((err) => {
            setLoading(false);
            setError(err?.message || "网络请求异常");
        });
    }, [prNumber, repoNameWithOwner, cwd]);
    var h = React.createElement;
    /**
     * 开始拖拽分隔条。
     *
     * 为什么把监听挂到 document 而不是分隔条自身：鼠标移动速度快于元素跟随速度时，
     * 指针会脱离分隔条，挂在元素上的 mousemove 立刻丢失，拖拽表现为"卡住"。
     * 这也是必须成对解绑（mouseup 里 removeEventListener）的原因，否则监听泄漏。
     */
    var beginResize = (e) => {
        if (filePaneHidden)
            return;
        e.preventDefault();
        dragStateRef.current = { startX: e.clientX, startWidth: filePaneWidth };
        var onMove = (ev) => {
            var drag = dragStateRef.current;
            if (!drag)
                return;
            var container = paneContainerRef.current;
            var containerWidth = container ? container.getBoundingClientRect().width : 0;
            // 宽度收敛统一走纯函数，避免在事件回调里散落边界判断
            setFilePaneWidth(clampFilePaneWidth(drag.startWidth + (ev.clientX - drag.startX), containerWidth));
        };
        var onUp = () => {
            dragStateRef.current = null;
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            // 拖拽真正的清理函数置空，避免卸载时重复清理
            cleanupDragRef.current = null;
            // 只在松手时落盘一次：拖拽过程中每像素写一次 localStorage 既慢又无意义
            setFilePaneWidth((current) => {
                savePrFilePanePrefs({ width: current, hidden: false });
                return current;
            });
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        // 拖拽期间禁用文本选择并统一光标，否则会意外选中 diff 文本、光标闪烁
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        // 登记清理函数供组件卸载时兜底调用。
        // 为什么必须有：拖拽过程中按下 Esc 会直接卸载整个弹窗，此时 mouseup 永远不会触发，
        // 挂在 document 上的 mousemove 与 body 上的 col-resize 光标会永久残留——
        // 表现为「弹窗关了，但整个页面鼠标仍是拖拽光标、选中文本失效」。
        cleanupDragRef.current = () => {
            dragStateRef.current = null;
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
    };
    /**
     * 折叠/展开文件区，并立即持久化（这是低频操作，无需等松手）。
     *
     * 为什么宽度要从 ref 读而不是直接闭包捕获 filePaneWidth：
     * setFilePaneHidden 的回调执行时机由 React 调度，此时闭包里的 filePaneWidth
     * 是**渲染时的快照**。若用户刚拖完宽度、紧接着点折叠，
     * 落盘的会是拖动前的旧宽度，下次打开弹窗宽度回跳。
     * ref 始终指向最新值，避免这类「看起来偶发」的偏好丢失。
     */
    var toggleFilePane = () => {
        setFilePaneHidden((prev) => {
            var next = !prev;
            savePrFilePanePrefs({ width: widthRef.current, hidden: next });
            return next;
        });
    };
    /**
     * 渲染一段 Markdown 为 React 元素。
     *
     * 用 useMemo 按原文缓存：解析结果只依赖输入文本，
     * 而弹窗内的拖拽/折叠会触发大量重渲染，不缓存等于每次都重新解析整个 PR 描述。
     */
    var renderMd = function (src) {
        var text = typeof src === "string" ? src : "";
        if (!text.trim())
            return null;
        var blocks = parseMarkdownBlocks(text);
        return renderMarkdownBlocks(h, blocks);
    };
    var copyText = (text, label) => {
        if (navigator?.clipboard?.writeText) {
            navigator.clipboard
                .writeText(text)
                .then(() => {
                setCopied(true);
                showToast(`✅ ${label} 已复制到剪贴板`);
                setTimeout(() => setCopied(false), 2000);
            })
                .catch(() => { });
        }
    };
    // 渲染单行 Diff 高亮
    var renderDiffContent = (diffText) => {
        if (!diffText) {
            return h("div", { style: { padding: "32px 0", textAlign: "center", opacity: 0.65, fontSize: "12px" } }, "该文件未产生可识别的文本差异，或已被清空。");
        }
        return h("div", {
            className: "dsh-github-inline-diff-content",
            style: {
                margin: 0,
                padding: "4px 0",
                fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace",
                fontSize: "11px",
                lineHeight: "1.5",
                overflowX: "auto",
                borderRadius: "6px",
                border: "1px solid var(--dsw-alias-border-subtle, rgba(0,0,0,0.08))",
                backgroundColor: "var(--dsw-alias-bg-canvas, #ffffff)",
            },
        }, diffText.split("\n").map(function (line, idx) {
            var isAdd = line.startsWith("+") && !line.startsWith("+++");
            var isDel = line.startsWith("-") && !line.startsWith("---");
            var isHunk = line.startsWith("@@");
            var isHeader = line.startsWith("diff --git") ||
                line.startsWith("index ") ||
                line.startsWith("---") ||
                line.startsWith("+++");
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
        }));
    };
    return h("div", {
        className: "dsh-github-modal-overlay",
        onClick: onClose,
        style: { zIndex: 100000 },
    }, h("div", {
        className: "dsh-github-modal-dialog dsh-github-pr-modal-dialog",
        onClick: (e) => e.stopPropagation(),
    }, 
    // 头部 Header
    h("div", { className: "dsh-github-modal-header dsh-github-pr-modal-header" }, h("div", { style: { display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: 1 } }, renderOctocat(18, "#8250df"), h("div", { style: { display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 } }, h("div", { style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" } }, h("h3", {
        style: {
            margin: 0,
            fontSize: "14px",
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
        },
    }, data ? `#${data.number} ${data.title}` : `PR #${prNumber}`), data
        ? h("span", {
            // 色调来自 shared/state-badges（与右侧栏 / CLI 输出同一份映射）；
            // 文案保持原样（Draft 用大驼峰、其余直接展示 GitHub 原始 state）。
            // 未知状态沿用旧实现的绿色兜底（旧代码的 else 分支就是 green）。
            className: "dsh-github-badge " +
                (function () {
                    var b = prStateBadge(data.state, data.isDraft);
                    return "dsh-badge-" + (b && b.tone !== "neutral" ? b.tone : "green");
                })(),
            style: { fontSize: "10px", padding: "1px 6px" },
        }, data.isDraft ? "Draft" : data.state)
        : null), data
        ? h("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #656d76)", display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" } }, h("span", null, `👤 @${data.author.login}`), data.createdAt ? h("span", null, `· 提单于 ${formatRelativeTime(data.createdAt)}`) : null, h("span", { style: { fontFamily: "monospace", opacity: 0.85 } }, `(${data.headRefName} → ${data.baseRefName})`), 
        /*
         * 审查锚点：分支名会移动，SHA 不会。
         * 点开这个弹窗时先看这一枚 chip，就能确认「我看到的是不是最新一次推送」；
         * title 里放完整 SHA，方便复制去精确引用。老服务端没有该字段时不渲染。
         */
        typeof data.headRefOid === "string" && data.headRefOid.length >= 7
            ? h("span", {
                title: `headRefOid: ${data.headRefOid}`,
                style: {
                    fontFamily: "monospace",
                    fontSize: "10px",
                    padding: "1px 6px",
                    borderRadius: "10px",
                    border: "1px solid var(--dsw-alias-border-l2, rgba(31,35,40,0.15))",
                    opacity: 0.9,
                },
            }, `🔖 ${data.headRefOid.slice(0, 7)}`)
            : null)
        : null)), h("div", { style: { display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 } }, data?.url
        ? h("button", {
            className: "dsh-github-btn-sm",
            style: { padding: "4px 8px", fontSize: "11px" },
            onClick: () => copyText(data.url, "PR 链接"),
            title: "复制该 Pull Request 网页链接",
        }, copied ? "✓ 已复制" : "📋 复制链接")
        : null, data?.url
        ? h("a", {
            href: data.url,
            target: "_blank",
            rel: "noopener noreferrer",
            className: "dsh-github-btn-sm",
            style: { padding: "4px 8px", fontSize: "11px", textDecoration: "none", color: "inherit" },
            title: "在系统默认浏览器中打开该 PR 官方页面",
        }, "↗ 浏览器打开")
        : null, h("button", {
        style: {
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "18px",
            color: "var(--dsw-alias-label-secondary, #656d76)",
            padding: "0 6px",
        },
        onClick: onClose,
        title: "关闭 (Esc)",
    }, "✕"))), 
    // 状态加载或异常
    loading
        ? h("div", { style: { padding: "64px 0", textAlign: "center", fontSize: "13px", opacity: 0.7 } }, "⏳ 正在加载 PR 详情与变更代码比对…")
        : error
            ? h("div", { style: { padding: "24px", margin: "16px", borderRadius: "8px", background: "rgba(248,81,73,0.08)", border: "1px solid rgba(248,81,73,0.3)" } }, h("div", { style: { fontWeight: 600, color: "#f85149", marginBottom: "6px" } }, "⚠️ 读取 PR 详情失败"), h("div", { style: { fontSize: "12px", opacity: 0.85 } }, error))
            : data
                ? h("div", { style: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" } }, 
                // Tab 切换导航
                h("div", { className: "dsh-github-pr-modal-tabs" }, h("button", {
                    className: `dsh-github-pr-tab-btn ${activeTab === "conversation" ? "active" : ""}`,
                    onClick: () => setActiveTab("conversation"),
                }, `💬 描述与讨论 (${data.comments ? data.comments.length : 0})`), h("button", {
                    className: `dsh-github-pr-tab-btn ${activeTab === "files" ? "active" : ""}`,
                    onClick: () => setActiveTab("files"),
                }, 
                // 截断时显示 N/M：M 来自 changedFiles（权威总数），N 是 gh 实际返回的条数。
                // 只显示 N 会让「被截断」看起来像「就这么多」——这是 cli/cli#12522 的静默截断。
                `📁 变动文件 (${data.files ? data.files.length : 0}${data.filesTruncated && data.changedFiles ? '/' + data.changedFiles : ''} 文件 · +${data.additions || 0} / -${data.deletions || 0})${data.filesTruncated ? ' ⚠️' : ''}`)), 
                // Tab 1: 描述与讨论
                activeTab === "conversation"
                    ? h("div", { className: "dsh-github-modal-body dsh-github-pr-conversation-pane" }, 
                    // 审查与 CI 门禁卡片
                    h("div", { className: "dsh-github-pr-checks-bar" }, h("div", { style: { display: "flex", alignItems: "center", gap: "6px" } }, h("span", { style: { fontWeight: 600 } }, "审查状态:"), h("span", {
                        className: "dsh-github-badge " +
                            (data.reviewDecision === "APPROVED"
                                ? "dsh-badge-green"
                                : data.reviewDecision === "CHANGES_REQUESTED"
                                    ? "dsh-badge-red"
                                    : "dsh-badge-yellow"),
                    }, data.reviewDecision || "REVIEW_REQUIRED")), h("div", { style: { display: "flex", alignItems: "center", gap: "6px", fontFamily: "monospace" } }, h("span", { style: { color: "var(--dsw-alias-state-success-primary, #1a7f37)", fontWeight: 600 } }, `+${data.additions}`), h("span", { style: { color: "var(--dsw-alias-state-error-primary, #cf222e)", fontWeight: 600 } }, `-${data.deletions}`))), 
                    // PR 正文描述
                    h("div", { className: "dsh-github-pr-body-card" }, h("div", { className: "dsh-github-pr-comment-header" }, h("strong", null, `@${data.author.login}`), h("span", { style: { fontSize: "11px", opacity: 0.6 } }, "提单说明 (PR Body)")), h("div", { style: { padding: "12px" } }, data.body
                        ? h(CollapsibleBody, { text: data.body, defaultExpanded: true, idPrefix: "pr-body" })
                        : h("span", { style: { opacity: 0.5, fontStyle: "italic" } }, "（该 PR 未填写描述正文）"))), 
                    // 讨论与评审评论流
                    h("h4", { style: { margin: "14px 0 8px 0", fontSize: "13px", fontWeight: 600 } }, `讨论与评论时间线 (${(data.comments?.length || 0) + (data.reviews?.filter((r) => r.body)?.length || 0)})`), data.comments && data.comments.length > 0
                        ? data.comments.map(function (c) {
                            return h("div", { key: c.id, className: "dsh-github-pr-comment-card" }, h("div", { className: "dsh-github-pr-comment-header" }, h("div", { style: { display: "flex", alignItems: "center", gap: "6px" } }, h("strong", null, `@${c.author.login}`), c.authorAssociation && c.authorAssociation !== "NONE"
                                ? h("span", { className: "dsh-github-badge dsh-badge-blue", style: { fontSize: "9px" } }, c.authorAssociation)
                                : null), h("span", { style: { fontSize: "11px", opacity: 0.6 } }, formatRelativeTime(c.createdAt))), h("div", { style: { padding: "10px 12px" } }, h(CollapsibleBody, { text: c.body, defaultExpanded: false, idPrefix: "cmt-" + c.id })));
                        })
                        : h("div", { style: { textAlign: "center", padding: "16px 0", fontSize: "12px", opacity: 0.6 } }, "💬 暂无讨论与评论"))
                    : null, 
                // Tab 2: 变动文件与 Diff 比对
                activeTab === "files"
                    ? h("div", { className: "dsh-github-pr-files-pane", ref: paneContainerRef }, 
                    // 左/上侧：变动文件列表（可拖拽调宽、可整块折叠）
                    filePaneHidden
                        ? null
                        : h("div", {
                            className: "dsh-github-pr-file-list",
                            style: { width: filePaneWidth + "px", flexShrink: 0 },
                        }, data.files && data.files.length > 0
                            ? data.files.map(function (f) {
                                var isSelected = f.path === selectedFilePath;
                                return h("div", {
                                    key: f.path,
                                    className: "dsh-github-pr-file-item" + (isSelected ? " selected" : ""),
                                    onClick: () => setSelectedFilePath(f.path),
                                    title: `${f.path} (+${f.additions}, -${f.deletions})`,
                                }, h("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 } }, f.path), h("div", { style: { display: "flex", gap: "4px", fontFamily: "monospace", fontSize: "10px", flexShrink: 0 } }, f.additions > 0 ? h("span", { style: { color: "var(--dsw-alias-state-success-primary, #1a7f37)" } }, `+${f.additions}`) : null, f.deletions > 0 ? h("span", { style: { color: "var(--dsw-alias-state-error-primary, #cf222e)" } }, `-${f.deletions}`) : null));
                            })
                            : h("div", { style: { padding: "16px", opacity: 0.6 } }, "暂无变动文件记录")), 
                    // 拖拽分隔条：仅文件区展开时出现。折叠按钮常驻于此，
                    // 保证「折叠后一定找得到恢复入口」——否则一旦折叠就再也点不回来。
                    h("div", {
                        className: "dsh-github-pr-splitter",
                        onMouseDown: beginResize,
                        title: filePaneHidden ? "点击展开文件列表" : "拖动调整文件列表宽度（双击可折叠）",
                        onDoubleClick: toggleFilePane,
                    }, h("button", {
                        type: "button",
                        className: "dsh-github-pr-splitter-toggle",
                        onMouseDown: (e) => e.stopPropagation(),
                        onClick: (e) => { e.stopPropagation(); toggleFilePane(); },
                        title: filePaneHidden ? "展开文件列表" : "折叠文件列表",
                    }, filePaneHidden ? "▶" : "◀")), 
                    // 右/下侧：当前选中文件的代码 Diff 视图
                    h("div", { className: "dsh-github-pr-diff-viewer" }, selectedFilePath
                        ? h("div", { style: { display: "flex", flexDirection: "column", height: "100%" } }, h("div", { className: "dsh-github-pr-diff-toolbar" }, 
                        // 文件区折叠后，这里是恢复入口的第一触点（分隔条上的
                        // ◀/▶ 按钮是第二触点）。两个入口都保留，避免用户找不到。
                        filePaneHidden
                            ? h("button", {
                                className: "dsh-github-btn-sm",
                                onClick: toggleFilePane,
                                style: { padding: "2px 8px", fontSize: "10px", flexShrink: 0 },
                                title: "展开左侧文件列表",
                            }, 
                            // 折叠态同样要透出截断事实（N/M），否则展开前的第一眼就被骗了
                            `📁 文件列表 (${(data.files && data.files.length) || 0}${data.filesTruncated && data.changedFiles ? '/' + data.changedFiles : ''})`)
                            : null, h("span", { style: { fontFamily: "monospace", fontWeight: 600, fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, selectedFilePath), data.fileDiffs && data.fileDiffs[selectedFilePath]
                            ? h("button", {
                                className: "dsh-github-btn-sm",
                                onClick: () => copyText(data.fileDiffs[selectedFilePath], "文件 Diff"),
                                style: { padding: "2px 8px", fontSize: "10px" },
                            }, copied ? "✓ 已复制" : "📋 复制文件 Diff")
                            : null), h("div", { style: { flex: 1, overflowY: "auto", minHeight: 0 } }, 
                        // 两种「看不到 diff」的原因必须分开说，否则用户不知道该做什么：
                        // ① diffTruncated：整段 diff 被输出阈值裁掉（去 GitHub 看完整内容）
                        // ② diffIncomplete：这个文件在清单里但没取到切片（换一个文件/重试）
                        data.diffTruncated
                            ? h("div", {
                                style: {
                                    margin: "8px",
                                    padding: "8px 12px",
                                    borderRadius: "6px",
                                    fontSize: "11px",
                                    lineHeight: 1.5,
                                    background: "rgba(210, 153, 34, 0.12)",
                                    border: "1px solid rgba(210, 153, 34, 0.35)",
                                    color: "var(--dsw-alias-state-attention-primary, #9a6700)",
                                },
                            }, "⚠️ 该 PR 的 diff 体量过大已触达输出上限，部分文件可能无法展示差异。可点击右上角「↗ 浏览器打开」查看完整内容。")
                            : null, data.diffIncomplete
                            ? h("div", {
                                style: {
                                    margin: "8px",
                                    padding: "8px 12px",
                                    borderRadius: "6px",
                                    fontSize: "11px",
                                    lineHeight: 1.5,
                                    background: "rgba(210, 153, 34, 0.12)",
                                    border: "1px solid rgba(210, 153, 34, 0.35)",
                                    color: "var(--dsw-alias-state-attention-primary, #9a6700)",
                                },
                            }, "⚠️ 有文件未能取到 diff 正文（二进制、重命名或超出切片范围）。这些文件显示为空不代表没有改动，请到 GitHub 核对。")
                            : null, data.fileDiffs && data.fileDiffs[selectedFilePath]
                            ? renderDiffContent(data.fileDiffs[selectedFilePath])
                            : renderDiffContent(""), 
                        // 行级审查评论：挂在具体代码行上的 review comment。
                        // comments 字段只含对话区，这些必须来自独立通道；
                        // 放在文件 diff 下方并按行号标注——不嵌进 hunk 中间，
                        // 避免多行/折叠上下文下错位到错误的代码行。
                        (() => {
                            var fileComments = (Array.isArray(data.lineComments) ? data.lineComments : []).filter((c) => c.path === selectedFilePath);
                            if (fileComments.length === 0)
                                return null;
                            return h("div", { className: "dsh-github-pr-line-comments" }, h("div", { className: "dsh-github-pr-line-comments-title" }, `💬 该文件的行级审查评论 (${fileComments.length})`), fileComments.map(function (c) {
                                return h("div", { key: c.id, className: "dsh-github-pr-line-comment-item" }, h("div", { className: "dsh-github-pr-line-comment-head" }, h("strong", null, `@${c.author?.login || "unknown"}`), c.line
                                    ? h("span", {
                                        style: {
                                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                                            fontSize: "10px",
                                            padding: "0 5px",
                                            borderRadius: "8px",
                                            background: "rgba(130, 80, 223, 0.12)",
                                            color: "#8250df",
                                        },
                                        title: `评论锚定在${c.side === "LEFT" ? "旧" : "新"}文件第 ${c.line} 行`,
                                    }, `L${c.line}${c.side === "LEFT" ? " (旧)" : ""}`)
                                    : null, h("span", { style: { fontSize: "10px", opacity: 0.6 } }, formatRelativeTime(c.createdAt))), h("div", { className: "dsh-github-pr-line-comment-body" }, h(CollapsibleBody, { text: c.body, defaultExpanded: false, idPrefix: "lc-" + c.id })));
                            }));
                        })()))
                        : h("div", { style: { padding: "32px 0", textAlign: "center", opacity: 0.6 } }, "请从左侧选择需要审阅的文件")))
                    : null)
                : null));
}

// ---- [Bundled: issue-modal.js] ----
/**
 * GitHub 关闭原因的状态语义映射。
 * 实测 `stateReason` 取值域：COMPLETED / NOT_PLANNED / REOPENED / ''（空串）。
 * 空串在关闭态下表示「未给出原因」，不渲染徽章即可。
 */
var ISSUE_STATE_REASON_LABEL = {
    COMPLETED: '已完成',
    NOT_PLANNED: '不计划处理',
    REOPENED: '已重开',
};
/** `#d73a4a` 形态的标签色转 rgba；非法色值退回中性灰，绝不让颜色拼错导致整块渲染失败 */
function labelRgba(hex, alpha) {
    var raw = typeof hex === 'string' ? hex.replace('#', '').trim() : '';
    if (!/^[0-9a-fA-F]{6}$/.test(raw))
        return 'rgba(140, 149, 159, ' + alpha + ')';
    var r = parseInt(raw.slice(0, 2), 16);
    var g = parseInt(raw.slice(2, 4), 16);
    var b = parseInt(raw.slice(4, 6), 16);
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
}
/**
 * 格式化里程碑截止日（未来 / 过去双向）。
 *
 * 为什么不能直接用 formatRelativeTime：它把**所有未来时间**都归一成「刚刚」
 * （见 utils.ts 的 `if (diff < 0) return "刚刚"`，那是为更新时间/创建时间这类
 * 永不为未来的字段设计的）。而里程碑 dueOn 绝大多数都在未来，
 * 直接套用会把「30 天后到期」渲染成「刚刚截止」——语义完全反过来。
 */
function formatDueDate(iso) {
    var t = typeof iso === 'string' ? Date.parse(iso) : NaN;
    if (isNaN(t))
        return '';
    var diff = t - Date.now();
    var DAY = 86400000;
    var days = Math.ceil(Math.abs(diff) / DAY);
    if (diff >= 0) {
        if (days <= 0)
            return '今天到期';
        if (days === 1)
            return '明天到期';
        if (days < 30)
            return days + ' 天后到期';
        if (days < 365)
            return Math.round(days / 30) + ' 个月后到期';
        return Math.round(days / 365) + ' 年后到期';
    }
    if (days <= 0)
        return '今天已到期';
    if (days === 1)
        return '昨天已到期';
    if (days < 30)
        return '已逾期 ' + days + ' 天';
    if (days < 365)
        return '已逾期 ' + Math.round(days / 30) + ' 个月';
    return '已逾期 ' + Math.round(days / 365) + ' 年';
}
/**
 * 图片附件清单。
 *
 * 为什么不在弹窗里直接 <img src>：图片可能来自任意 https 外域，直连会把
 * 宿主页面的 Referer 与来源暴露给第三方，也绕过插件的域名白名单防线。
 * 这里只给可点外链，由用户显式决定是否打开。
 */
function IssueImageList(props) {
    var h = React.createElement;
    var urls = Array.isArray(props.urls) ? props.urls : [];
    var st = React.useState(false);
    var open = st[0];
    var setOpen = st[1];
    if (urls.length === 0)
        return null;
    return h("span", { className: "dsh-github-issue-image-badge" }, h("button", {
        type: "button",
        className: "dsh-github-issue-chip dsh-github-issue-chip-btn",
        onClick: function () { setOpen(!open); },
        title: open ? "收起图片清单" : "展开图片链接清单（不在面板内直连渲染）",
        "aria-expanded": open ? "true" : "false",
    }, "📎 " + urls.length + " 张图片"), open
        ? h(
        // 用 span 而非 div：整个元数据条本身是 span 级 content 容器，
        // div 嵌在 span 里虽然浏览器会容错，但属于非法嵌套。
        "span", { className: "dsh-github-issue-image-links" }, urls.map(function (u) {
            var name = u.split("?")[0].split("/").pop() || u;
            return h("a", {
                key: u,
                href: u,
                target: "_blank",
                rel: "noopener noreferrer",
                className: "dsh-github-issue-image-link",
                title: u,
            }, "🖼 " + (name.length > 42 ? name.slice(0, 42) + "…" : name));
        }))
        : null);
}
/**
 * 单条评论卡片。
 *
 * 为什么提到模块顶层：函数体内定义的组件每次父级渲染都会产生新引用，
 * React 按引用比较类型会卸载重建，CollapsibleBody 的展开状态随之重置。
 * 这是 pr-modal 上已经踩过的坑，Issue 侧不走第二遍。
 */
function IssueCommentCard(props) {
    var h = React.createElement;
    var c = props.comment;
    var author = c && c.author ? c.author.login : "ghost";
    var hidden = Boolean(c && c.isMinimized);
    return h("div", { className: "dsh-github-issue-comment-card" }, h("div", { className: "dsh-github-issue-comment-header" }, h("div", { style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", minWidth: 0 } }, h("strong", null, "@" + author), c && c.authorAssociation && c.authorAssociation !== "NONE"
        ? h("span", { className: "dsh-github-badge dsh-badge-blue", style: { fontSize: "9px" } }, c.authorAssociation)
        : null, c && c.includesCreatedEdit ? h("span", { style: { fontSize: "10px", opacity: 0.6 } }, "· 已编辑") : null, hidden
        ? h("span", {
            className: "dsh-github-badge dsh-badge-red",
            style: { fontSize: "9px" },
            title: "GitHub 判定该评论被折叠（常见原因：垃圾信息 / 攻击性内容）",
        }, "已隐藏" + (c.minimizedReason ? "(" + c.minimizedReason + ")" : ""))
        : null), h("span", { style: { fontSize: "11px", opacity: 0.6, flexShrink: 0 } }, formatRelativeTime(c.createdAt))), h("div", { style: { padding: "10px 12px" } }, h(CollapsibleBody, { text: c.body, defaultExpanded: false, idPrefix: "ic-" + c.id })));
}
/**
 * Issue 在线查看弹窗（详情 + 元数据 + 评论时间线）。
 *
 * 与 PrDetailModal 的差异：Issue 没有 diff 载荷，因此不做双栏文件区，
 * 单列纵向滚动即可——多出来的宽度全部让给 Markdown 正文，可读性更好。
 */
function IssueDetailModal(props) {
    var issueNumber = props.issueNumber;
    var repoNameWithOwner = props.repoNameWithOwner || "";
    var cwd = props.cwd;
    var onClose = props.onClose;
    var showToast = props.showToast || (function () { });
    // Hooks 必须先于任何 early return 无条件执行（见 pr-modal 的同类注释）：
    // 否则「issueNumber 由空变有值」时两次渲染的 Hook 数量不一致，直接崩。
    // 注意 useState 与 useEffect 都必须在这个位置之前——early return 卡在两者
    // 中间时，首帧（无编号）会跳过全部 effect，有编号的首帧却多出两个 effect，
    // 同样违反「每次渲染 Hook 序列一致」。
    var [data, setData] = React.useState(null);
    var [loading, setLoading] = React.useState(true);
    var [error, setError] = React.useState(null);
    var [copied, setCopied] = React.useState(false);
    React.useEffect(function () {
        var onKeyDown = function (e) {
            if (e.key === "Escape" || e.keyCode === 27)
                onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return function () { window.removeEventListener("keydown", onKeyDown); };
    }, [onClose]);
    React.useEffect(function () {
        if (!issueNumber) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        var url = "/api/github/issue-detail?number=" +
            encodeURIComponent(String(issueNumber)) +
            (repoNameWithOwner ? "&repo=" + encodeURIComponent(repoNameWithOwner) : "") +
            (cwd ? "&cwd=" + encodeURIComponent(cwd) : "");
        fetch(url)
            .then(async function (res) {
            if (!res.ok) {
                var errText = await res.text().catch(function () { return ""; });
                var j = null;
                try {
                    j = JSON.parse(errText);
                }
                catch (e) { }
                throw new Error((j && j.error) || errText || ("服务响应异常 (" + res.status + ")"));
            }
            return res.json();
        })
            .then(function (json) {
            setLoading(false);
            if (json && json.ok && json.data) {
                setData(json.data);
            }
            else {
                setError((json && json.error) || "获取 Issue 详情失败");
            }
        })
            .catch(function (err) {
            setLoading(false);
            setError((err && err.message) || "网络请求异常");
        });
    }, [issueNumber, repoNameWithOwner, cwd]);
    if (!issueNumber)
        return null;
    var h = React.createElement;
    var copyLink = function (text) {
        if (!text)
            return;
        if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard
                .writeText(text)
                .then(function () {
                setCopied(true);
                showToast("✅ Issue 链接已复制到剪贴板");
                setTimeout(function () { setCopied(false); }, 2000);
            })
                .catch(function () { });
        }
    };
    var stateBadge = function (d) {
        if (!d)
            return null;
        // 状态→色调来自 shared/state-badges（与右侧栏 / CLI 输出同一份映射）
        var b = issueStateBadge(d.state);
        if (!b)
            return null;
        return h("span", {
            className: "dsh-github-badge dsh-badge-" + b.tone,
            style: { fontSize: "10px", padding: "1px 6px", flexShrink: 0 },
        }, b.label);
    };
    /**
     * 元数据条：只渲染真实存在的字段。
     * 空的「无标签 / 无指派 / 无里程碑」占位没有信息量，只会把正文推得更远。
     */
    var metaChips = function (d) {
        var chips = [];
        var reason = d.stateReason ? ISSUE_STATE_REASON_LABEL[String(d.stateReason).toUpperCase()] : "";
        if (reason) {
            chips.push(h("span", {
                key: "reason",
                className: "dsh-github-issue-chip",
                title: "关闭原因 (stateReason): " + d.stateReason,
            }, "✓ " + reason));
        }
        if (d.isPinned) {
            chips.push(h("span", { key: "pin", className: "dsh-github-issue-chip" }, "📌 置顶"));
        }
        if (d.issueType) {
            chips.push(h("span", { key: "type", className: "dsh-github-issue-chip" }, "🏷️ " + d.issueType));
        }
        (Array.isArray(d.labels) ? d.labels : []).forEach(function (l, i) {
            chips.push(h("span", {
                key: "label-" + i + "-" + l.name,
                className: "dsh-github-issue-chip dsh-github-issue-label-chip",
                style: {
                    background: labelRgba(l.color, 0.14),
                    borderColor: labelRgba(l.color, 0.45),
                },
                title: l.description || l.name,
            }, h("span", {
                className: "dsh-github-issue-label-dot",
                style: { background: labelRgba(l.color, 0.9) },
            }), l.name));
        });
        (Array.isArray(d.assignees) ? d.assignees : []).forEach(function (a, i) {
            chips.push(h("span", { key: "asg-" + i, className: "dsh-github-issue-chip" }, "👤 " + a.login));
        });
        if (d.milestone && d.milestone.title) {
            var dueText = d.milestone.dueOn ? formatDueDate(d.milestone.dueOn) : '';
            chips.push(h("span", {
                key: "milestone",
                className: "dsh-github-issue-chip" + (dueText.indexOf('已逾期') >= 0 ? " dsh-github-issue-chip-overdue" : ""),
                title: d.milestone.dueOn ? "截止 " + d.milestone.dueOn : "未设置截止日期",
            }, "🏁 " + d.milestone.title + (dueText ? " · " + dueText : "")));
        }
        if (d.subIssues && Number(d.subIssues.total) > 0) {
            chips.push(h("span", { key: "sub", className: "dsh-github-issue-chip" }, "🧩 子议题 " + d.subIssues.completed + "/" + d.subIssues.total));
        }
        (Array.isArray(d.linkedPrs) ? d.linkedPrs : []).forEach(function (p, i) {
            chips.push(h("a", {
                key: "pr-" + i,
                className: "dsh-github-issue-chip dsh-github-issue-chip-link",
                href: p.url,
                target: "_blank",
                rel: "noopener noreferrer",
                title: "该 Issue 被此 Pull Request 关联/关闭",
            }, "🔗 PR #" + p.number));
        });
        chips.push(h(IssueImageList, { key: "images", urls: d.images || [] }));
        return chips.length > 0 ? h("div", { className: "dsh-github-issue-meta" }, ...chips) : null;
    };
    var bodyCard = function (d) {
        return h("div", { className: "dsh-github-issue-body-card" }, h("div", { className: "dsh-github-issue-comment-header" }, h("strong", null, "@" + d.author.login), h("span", { style: { fontSize: "11px", opacity: 0.6 } }, "提单说明 (Issue Body)")), h("div", { className: "dsh-github-issue-body-content" }, d.body
            ? h(CollapsibleBody, { text: d.body, defaultExpanded: true, idPrefix: "issue-body" })
            : h("span", { style: { opacity: 0.5, fontStyle: "italic" } }, "（该 Issue 未填写正文）")));
    };
    return h("div", { className: "dsh-github-modal-overlay", onClick: onClose, style: { zIndex: 100000 } }, h("div", {
        className: "dsh-github-modal-dialog dsh-github-issue-modal-dialog",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": "Issue #" + issueNumber + " 详情",
        onClick: function (e) { e.stopPropagation(); },
    }, 
    // 头部
    h("div", { className: "dsh-github-modal-header dsh-github-issue-modal-header" }, h("div", { style: { display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: 1 } }, renderOctocat(18, "#1f883d"), h("div", { style: { display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 } }, h("div", { style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" } }, h("h3", {
        style: {
            margin: 0,
            fontSize: "14px",
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
        },
        title: data ? "#" + data.number + " " + data.title : "Issue #" + issueNumber,
    }, data ? "#" + data.number + " " + data.title : "Issue #" + issueNumber), stateBadge(data)), data
        ? h("div", {
            style: {
                fontSize: "11px",
                color: "var(--dsw-alias-label-secondary, #656d76)",
                display: "flex",
                gap: "6px",
                alignItems: "center",
                flexWrap: "wrap",
            },
        }, h("span", null, "👤 @" + data.author.login), data.createdAt ? h("span", null, "· 提单于 " + formatRelativeTime(data.createdAt)) : null, data.closedAt ? h("span", null, "· 关闭于 " + formatRelativeTime(data.closedAt)) : null, repoNameWithOwner
            ? h("span", { style: { fontFamily: "monospace", opacity: 0.85 } }, repoNameWithOwner)
            : null)
        : null)), h("div", { style: { display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 } }, data && data.url
        ? h("button", {
            type: "button",
            className: "dsh-github-btn-sm",
            style: { padding: "4px 8px", fontSize: "11px" },
            onClick: function () { copyLink(data.url); },
            title: "复制该 Issue 网页链接",
        }, copied ? "✓ 已复制" : "📋 复制链接")
        : null, data && data.url
        ? h("a", {
            href: data.url,
            target: "_blank",
            rel: "noopener noreferrer",
            className: "dsh-github-btn-sm",
            style: { padding: "4px 8px", fontSize: "11px", textDecoration: "none", color: "inherit" },
            title: "在系统默认浏览器中打开该 Issue",
        }, "↗ 浏览器打开")
        : null, h("button", {
        type: "button",
        "aria-label": "关闭 (Esc)",
        style: {
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "18px",
            color: "var(--dsw-alias-label-secondary, #656d76)",
            padding: "0 6px",
        },
        onClick: onClose,
        title: "关闭 (Esc)",
    }, "✕"))), 
    // 主体
    loading
        ? h("div", { style: { padding: "64px 0", textAlign: "center", fontSize: "13px", opacity: 0.7 } }, "⏳ 正在加载 Issue 详情与讨论…")
        : error
            ? h("div", {
                style: {
                    padding: "24px",
                    margin: "16px",
                    borderRadius: "8px",
                    background: "rgba(248,81,73,0.08)",
                    border: "1px solid rgba(248,81,73,0.3)",
                },
            }, h("div", { style: { fontWeight: 600, color: "#f85149", marginBottom: "6px" } }, "⚠️ 读取 Issue 详情失败"), h("div", { style: { fontSize: "12px", opacity: 0.85, lineHeight: 1.6 } }, error), repoNameWithOwner
                ? h("a", {
                    href: "https://github.com/" + repoNameWithOwner + "/issues/" + issueNumber,
                    target: "_blank",
                    rel: "noopener noreferrer",
                    className: "dsh-github-btn-sm",
                    style: { display: "inline-block", marginTop: "12px", padding: "4px 10px", fontSize: "11px", textDecoration: "none" },
                }, "↗ 在浏览器中查看")
                : null)
            : data
                ? h("div", { className: "dsh-github-issue-conversation-pane" }, metaChips(data), bodyCard(data), h("div", { className: "dsh-github-issue-timeline-title" }, "💬 讨论与评论时间线 (" + (data.comments ? data.comments.length : 0) + ")"), data.comments && data.comments.length > 0
                    ? data.comments.map(function (c) {
                        return h(IssueCommentCard, { key: c.id || c.createdAt, comment: c });
                    })
                    : h("div", { className: "dsh-github-issue-empty-timeline" }, "💬 暂无讨论与评论——这是一个还没有人回复的议题。"))
                : null));
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
 *
 * 【内容与代码同步的纪律】
 * 本文件里出现的工具数量、action 数量、Tab 名称、按钮文案，全部以当前代码为准：
 * 工具矩阵 = src/main.ts 的 19 处 ctx.tools.register；
 * Tab 布局 = src/client.ts 的 TAB_DEFS 与 src/ui/workspace-panel.ts 的四个标签；
 * 若后续增删工具或 Tab，必须同步改这里，否则用户会照着过时说明去找不存在的入口。
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
        { id: "tools", label: "🧰 19 大工具速查" },
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
                    actionText: "无需每次告诉 Agent 仓库叫什么名字，插件底层已自动完成 CWD 工作区绑定，提单与审查均精准面向当前项目。\n若当前是 Fork 仓库，右侧栏顶部会显示血缘行，可一键在「我的复刻」与「上游主干」之间切换基准仓库。",
                },
                {
                    step: "3",
                    title: "直接向 Agent 下达工作指令",
                    desc: "像和资深研发搭档协作一样，在聊天输入框中直接吩咐 Agent 处理日常 GitHub 任务。",
                    actionText: "初次体验试一试直接对 Agent 说：\n👉 \"查看当前仓库有哪些开放的 PR，总结下改动要点\"",
                },
            ].map(function (s, i) {
                return h("div", { key: i, className: "dsh-github-help-card", style: { display: "flex", gap: "14px", alignItems: "flex-start" } }, h("div", { className: "dsh-github-help-step-badge" }, s.step), h("div", { style: { flex: 1 } }, h("div", { className: "dsh-github-help-title", style: { marginBottom: "4px" } }, s.title), h("div", { className: "dsh-github-help-desc", style: { marginBottom: "6px" } }, s.desc), h("div", { style: { fontSize: "12px", lineHeight: "1.6", whiteSpace: "pre-line", color: "inherit" } }, s.actionText)));
            }), 
            // 能力总览：让用户三秒钟知道这插件到底能干什么，而不是去翻 README
            h("div", { className: "dsh-github-help-card", style: { marginTop: "4px" } }, h("div", { className: "dsh-github-help-title", style: { marginBottom: "8px" } }, "📦 能力总览：19 大工具 · 106 个业务动作 · 2 套可视化工作台"), h("div", { style: { fontSize: "12px", lineHeight: "1.8", color: "var(--dsw-alias-label-secondary, #8b949e)" } }, "Agent 侧可直接调用 19 个 github_* 工具（PR 审查合并、Issue 任务流转、Actions 排障、免 clone 读文件、发版交付、Secrets 管理、Skills 生态、标签与规则集、构建缓存、Gist、跨仓待办大盘、Copilot 智能体、Discussions、Projects v2、Codespaces、运行时遥测与元指南）。", h("br"), "人类侧在每个会话右侧栏拥有 5 个 Tab（Git / 未提交 / PR / Issues / Actions），在最左侧 Octocat 入口拥有 4 个标签的全景驾驶舱。")));
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
                    title: "📝 场景五：从用户报障截图直接定位问题",
                    desc: "用户提的 Issue 里贴了崩溃截图，Agent 可以直接「看」图，不用你手抄报错信息。",
                    prompt: "查看 Issue #42 的正文与截图，判断是哪个模块出的问题并给出修复方案",
                    aiAction: "Agent 调用 github_issue(view_images) 把正文与评论里的图片下载到本地并转为可读图像内容块，结合文字描述一起分析。",
                },
                {
                    title: "🏷️ 场景六：批量标签治理与跨仓库同步",
                    desc: "新仓库要配一套和主仓库一致的标签体系，手点太慢。",
                    prompt: "把 A 仓库的标签体系克隆到当前仓库，然后给所有 open 的 bug Issue 打上 triage 标签",
                    aiAction: "Agent 调用 github_label(clone) 复制标签颜色与描述，再按条件批量追加标签；删除类高危操作前会先返回影响评估要求你确认。",
                },
                {
                    title: "💬 场景七：团队方案提案与开源 RFC 研讨",
                    desc: "需要和团队讨论架构思路或征集想法时，直接将讨论沉淀在 GitHub Discussions 知识库中。",
                    prompt: "在当前仓库发起一个关于 '优化前端构建性能' 的 RFC 讨论方案",
                    aiAction: "Agent 自动调用 Discussions 工具在指定分类下发起主题，格式化排版技术方案正文，并返回可供团队直达探讨的链接。",
                },
            ];
            return h("div", null, h("div", { className: "dsh-github-help-desc", style: { fontSize: "13px", marginBottom: "14px" } }, "以下精选了开发者日常研发中最高频的 7 大真实协作场景。点击卡片右侧的「📋 一键复制」按钮，直接粘贴到聊天输入框发给 Agent 即可："), promptCards.map(function (c, idx) {
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
                    title: "1. 全景驾驶舱 (Main Dashboard) —— 掌控全局资产 · 4 个标签",
                    items: [
                        "打开入口：点击 DSH 最左侧主导航栏的 Octocat 猫咪徽标，瞬间全屏展开；",
                        "SWR 0ms 瞬间秒开：采用本地持久化快照体系，打开界面零转圈、零等待；",
                        "📂 本地工作区矩阵：一屏透视本机所有项目与远程仓库的关联状态、分支领先/落后、未提交文件数；",
                        "☁️ 我的 GitHub 仓库：名下全部仓库、默认分支与 Star 状态，支持关键词搜索；",
                        "🔀 Pull Requests：默认展示「全部」，顶部胶囊可切 🟢 Open / 🟣 Merged / ⚪ Closed 并显示各档计数；点击任一卡片在线唤起 PR 审阅工作台；",
                        "📝 任务与待办 Issues：三维分类（📥 用户提单 / 🎯 指派待办 / ✍️ 我发起的），点击卡片在线查看 Issue 详情；",
                        "右下角长期驻留 使用指南 / ⚙️ 设置 两个入口，设置内含数据同步、网络代理、更新源与关于四个分区。",
                    ],
                },
                {
                    title: "2. 会话右侧栏面板 (Sidebar Panel) —— 深度协同当前工作区 · 5 个 Tab",
                    items: [
                        "打开入口：位于每个会话工作区的右侧抽屉栏，深度锁定当前会话的物理 Git 仓库；",
                        "仓库身份与切换：顶部展示当前关联仓库、Fork 血缘行与权限徽章（只读/可写）；若配置了多个 remote，可通过 RepoSelectorDropdown 下拉一键切换基准仓库；", "Git Tab：三段式提交时间线（待推送 / 待拉取 / 最近），默认 15 条、下滑触底自动加载；点任意提交行弹出完整 Commit 详情；",
                        "未提交 Tab：实时监听本地未提交文件与状态码（?? 新增 / M 修改 / D 删除 / R 重命名），点击文件可就地下钻查看该文件的 Unified Diff；",
                        "PR Tab：展示全部 PR 并按状态过滤；带三态 CI 门禁、冲突检测、审核判定与 Draft 标示；点击卡片在线唤起 PR 审阅工作台（描述 / 评论 / 文件 Diff 双栏比对）；",
                        "Issues Tab：展示全部 Issue 并按状态过滤；点击卡片在线查看详情（Markdown 正文 / 评论时间线 / 标签色块 / 里程碑 / 关联 PR / 隐藏评论标注）；",
                        "Actions Tab：最近工作流运行记录与触发方式，失败时给出可直接交给 Agent 的诊断指引；",
                        "动静解耦架构：修改本地代码只定向查询本地 .git 核心元数据（耗时仅 5ms），绝对不发起远端网络请求，杜绝网络风暴。",
                    ],
                },
                {
                    title: "3. 两个弹窗的通用操作习惯",
                    items: [
                        "PR / Issue 弹窗都支持：按 Esc 或点击遮罩关闭、右上角「📋 复制链接」、「↗ 浏览器打开」直达 GitHub；",
                        "列表卡片上的「GitHub ↗」按钮是独立的浏览器外跳入口，点它不会触发弹窗（已做事件隔离）；",
                        "PR 弹窗的文件区可拖拽分隔条调宽、双击或点 ◀ 折叠；布局偏好会记在本地，下次打开保持原样；",
                        "长评论默认折叠（显示「⌄ 展开全部」），PR/Issue 正文默认展开——避免一屏被一段超长文字占满。",
                    ],
                },
            ].map(function (sec, idx) {
                return h("div", { key: idx, className: "dsh-github-help-card" }, h("div", { className: "dsh-github-help-title", style: { marginBottom: "8px" } }, sec.title), h("ul", { style: { margin: 0, paddingLeft: "18px", fontSize: "12px", lineHeight: "1.7", color: "var(--dsw-alias-label-secondary, #8b949e)" } }, sec.items.map(function (it, i) { return h("li", { key: i }, it); })));
            }));
        }
        if (activeTab === "tools") {
            var toolGroups = [
                {
                    group: "日常研发主力",
                    items: [
                        { name: "github_pr", desc: "PR 全生命周期：列表/详情/diff/checks/create/merge/review/ready/update_branch/revert/preview/checkout，含行级评论与附件上传" },
                        { name: "github_issue", desc: "Issue 任务流转：list/view/create/comment/edit/close/reopen/develop/transfer/pin/lock/delete/status，含截图查看 view_images" },
                        { name: "github_run", desc: "Actions 排障：list/view/log_failed（失败步骤日志秒级提取）/rerun/cancel/trigger/download 与 workflow 启停" },
                        { name: "github_repo", desc: "仓库元数据、免 clone 读文件（read_file/read_dir）、跨仓检索（code/issues/prs/commits）、Fork 同步" },
                    ],
                },
                {
                    group: "交付与配置",
                    items: [
                        { name: "github_release", desc: "发版历史、自动生成说明、创建 Release、上传/下载构建资产" },
                        { name: "github_secret", desc: "Actions Secrets 与 Variables：列表/设置/删除（密文经 stdin 通道，绝不进命令行）" },
                        { name: "github_label", desc: "标签体系 CRUD 与跨仓库一键克隆（删除需 confirm）" },
                        { name: "github_ruleset", desc: "分支保护规则集查看与「为什么这个 PR 不能合」的策略排障" },
                        { name: "github_cache", desc: "Actions 构建缓存盘点、按 Key/ID 删除与全量清空（高危需 confirm）" },
                    ],
                },
                {
                    group: "生态与协作",
                    items: [
                        { name: "github_skill", desc: "Agent Skills 生态：跨仓检索/预览/安装/发布自检/批量更新" },
                        { name: "github_status", desc: "账号维度跨仓待办大盘 + 运行时健康度与 API 降级率审计" },
                        { name: "github_agent_task", desc: "Copilot 云端编码智能体：派活、查状态、拉会话日志" },
                        { name: "github_discussion", desc: "社区讨论与 RFC：列表/详情/发起/编辑/评论" },
                        { name: "github_project", desc: "Projects v2 看板：项目列表、条目增删与草稿任务" },
                        { name: "github_codespace", desc: "云端开发机：列表/详情/停止（防计费）/销毁" },
                        { name: "github_gist", desc: "代码片段与排障留痕：创建 Secret Gist、查看、编辑、删除" },
                    ],
                },
                {
                    group: "兜底与元能力",
                    items: [
                        { name: "github_api", desc: "REST / GraphQL 逃生门，支持 --jq 过滤与 raw 原文模式" },
                        { name: "github_help", desc: "全景命令映射、官方语法速查与 gh 报错自愈指引" },
                    ],
                },
            ];
            return h("div", null, h("div", { className: "dsh-github-help-desc", style: { fontSize: "13px", marginBottom: "14px" } }, "19 个 Agent 工具、合计 106 个业务动作（不含元指南的 22 个查询主题与 api 逃生门的 4 个 HTTP method）。你不必记住工具名——直接用自然语言描述目标，Agent 会自己挑工具。下表用于你了解能力边界，以及排查「为什么 Agent 说做不到」："), toolGroups.map(function (g, gi) {
                return h("div", { key: gi, className: "dsh-github-help-card" }, h("div", { className: "dsh-github-help-title", style: { marginBottom: "8px" } }, g.group), g.items.map(function (t, ti) {
                    return h("div", { key: ti, style: { display: "flex", gap: "10px", alignItems: "flex-start", padding: "5px 0", borderTop: ti === 0 ? "none" : "1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.06))" } }, h("code", {
                        style: {
                            flexShrink: 0,
                            width: "132px",
                            fontSize: "11px",
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                            color: "var(--dsw-alias-link, #0969da)",
                        },
                    }, t.name), h("span", { style: { fontSize: "12px", lineHeight: "1.6", color: "var(--dsw-alias-label-secondary, #8b949e)" } }, t.desc));
                }));
            }), h("div", { className: "dsh-github-help-card" }, h("div", { className: "dsh-github-help-title", style: { marginBottom: "8px" } }, "⌨️ 人类 Slash 指令"), h("div", { style: { fontSize: "12px", lineHeight: "1.9", color: "var(--dsw-alias-label-secondary, #8b949e)" } }, h("code", { className: "dsh-github-md-inline-code" }, "/gh"), " 或 ", h("code", { className: "dsh-github-md-inline-code" }, "/gh status"), " —— 账号与仓库健康度诊断（登录态、权限、网络、版本）；", h("br"), h("code", { className: "dsh-github-md-inline-code" }, "/gh upgrade"), " —— 一键跨平台自动升级插件；", h("br"), h("code", { className: "dsh-github-md-inline-code" }, "/gh help"), " —— 在聊天流中打印精简版指令与范例；", h("br"), "想看点状图文说明，就是当前这个窗口：右下角「📖 使用指南」。")));
        }
        if (activeTab === "faq") {
            var faqs = [
                {
                    q: "Q1: 界面提示「未登录 GitHub」或「Authentication Required」怎么办？",
                    a: "插件直接复用宿主系统的 GitHub CLI 登录态。请打开系统终端运行命令 `gh auth login`，依次选择 GitHub.com ➔ HTTPS ➔ 网页回车授权，一分钟内即可完成登录。登录完成后刷新界面即可自动识别。",
                },
                {
                    q: "Q2: 提示「缺少权限 (Scope)」或「SCOPE_REQUIRED」怎么办？",
                    a: "当调用项目看板（Projects v2）或云端开发机（Codespaces）时，GitHub 要求专有的 Token Scope。在系统终端执行对应的一键自愈命令完成增量授权即可（无需重新登录）：\n- 项目看板（只读）：`gh auth refresh -s read:project`\n- 项目看板（读写）：`gh auth refresh -s project`\n- 云端开发机：`gh auth refresh -h github.com -s codespace`",
                },
                {
                    q: "Q3: 点了一键升级提示「处于 24h 安全保护期 (防投毒策略)」怎么办？",
                    a: "这是 DSH 官方内置包管理器针对刚发布未满 24 小时新版本的供应链防投毒安全锁机制。\n- 立即体验：请先【完全退出关闭 DSH 应用程序】，然后在系统终端执行复制的手动安装命令；\n- 稍后升级：无需任何操作，新版本发版满 24 小时后，再次点击一键升级即可自动安装。",
                },
                {
                    q: "Q4: 使用代理节点时偶尔出现网络波动怎么办？",
                    a: "插件内置了 1s ➔ 2s ➔ 4s 的阶梯指数退避重试机制。代理节点若发生短时抖动断流，系统会自动在后台静默发起自愈重试，在节点恢复后瞬间平滑拉取最新数据，不会立刻亮出大红横幅打扰你。同时电脑联网恢复瞬间也会自动触发静默更新。",
                },
                {
                    q: "Q5: 右侧栏 PR / Issues 列表是空的，但 GitHub 网页上明明有记录？",
                    a: "先看顶部状态胶囊是不是停在某个具体档位（例如「Merged」）而该档确实为零——点「全部」即可看到所有记录。\n若「全部」也是空的，通常是两类原因：\n- 仓库关闭了 Issues 功能：面板会给出「该仓库未开启 Issues」的确定性提示，这不是故障；\n- 当前工作区没绑定对仓库：看右侧栏顶部显示的是哪个仓库，若不对可在仓库下拉里切换基准，或检查 `.git/config` 的 remote 配置。",
                },
                {
                    q: "Q6: 为什么改了代码，插件界面要重启 DSH 才生效？",
                    a: "如果你是在开发这个插件本身：后端 HTTP 路由是在插件 `apply()` 时一次性注册到宿主的 WebServer 上的，`pnpm run build` 只更新磁盘产物，不会给已运行的进程热注册新路由。改完代码需重启 DSH 才能挂上新端点。\n若只是普通使用，请忽略此条——正常升级走一键升级即可。",
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
        "aria-label": "关闭 (Esc)",
        title: "关闭 (Esc)",
    }, "✕")), 
    // 顶部分类 Segment 导航栏
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
        /** 列表分页步长：与服务端 parseListLimit 的默认页大小保持一致（15） */
        var OVERVIEW_PAGE_SIZE = 15;
        function renderGithubRepoView(h, data, loading, error, onRefresh, isRightbar = false, updateInfo = null, syncStatus = "", lastSyncedAt = 0, onOpenSettings = null, cwd = null, onSelectCommit = null, gitLogPagination = null, onShowToast = null, onOpenHelp = null, onOpenFile = null, dirtyPagination = null, activeDiffFile = null, onSelectDiffFile = null, onCloseDiff = null, onOpenInDsh = null, headerCardsVisible = true, onToggleHeaderCards = null, onSelectPr = null, 
        // 必须追加在形参末尾：该函数有 17 个位置参数，插在中间会静默错位
        onSelectIssue = null, 
        /**
         * 状态筛选（默认 all）。
         * 为什么由组件传入而不是在本函数内 useState：本函数是每次渲染都重新执行的
         * 普通函数，内部调用 useState 会被 React 当成新的 Hook 序列直接抛错。
         * 状态必须住在 GithubRightbarBody 组件体内，这里只接收值与 setter。
         */
        prStateFilter = "all", issueStateFilter = "all", onChangePrFilter = null, onChangeIssueFilter = null, 
        /**
         * PR / Issue / Actions 三个列表的「加载更多」回调（按 tab 独立触发）。
         */
        onLoadMoreLists = null, 
        /**
         * 各 Tab 的「正在加载更多」标记。
         *
         * 为什么需要它：请求往返几百毫秒到数秒，页脚不变化的话用户会以为点击没生效而连点，
         * 触发重复请求（服务端虽然有 loadingMoreListsRef 兜底，但界面必须有反馈）。
         */
        listLoading = null) {
            var auth = data ? data.auth : null;
            var repo = data ? data.repo : null;
            var prs = (data && data.pullRequests) || [];
            var issues = (data && data.issues) || [];
            var runs = (data && data.runs) || [];
            /**
             * 列表「加载更多」页脚：与「未提交变更 / Git 提交记录」两个已有分页同视觉同交互。
             * 触发条件是服务端下发的 `*Truncated`（= 本次拉满，可能还有更早记录），不是本地条数比较——
             * 本地比不出「还有没有」。
             */
            /**
             * 列表「加载更多」页脚：与「未提交变更 / Git 提交记录」两个已有分页同视觉同交互。
             * 触发条件是服务端下发的 `*Truncated`（= 本次拉满，可能还有更早记录），不是本地条数比较——
             * 本地比不出「还有没有」。
             *
             * `loading` 为真时切换成「正在加载中」并禁用点击：请求往返可能几百毫秒到数秒，
             * 不反馈的话用户会以为点击没生效而连点，触发重复请求。
             */
            var renderListMore = function (kind, hasMore, count, loading) {
                if (!hasMore || typeof onLoadMoreLists !== "function")
                    return null;
                return h("div", {
                    key: "load-more-" + kind,
                    style: {
                        fontSize: "11px",
                        opacity: loading ? 1 : 0.8,
                        padding: "8px 0",
                        textAlign: "center",
                        cursor: loading ? "default" : "pointer",
                    },
                    onClick: function () { if (!loading)
                        onLoadMoreLists(kind); },
                    title: loading ? "正在加载更多…" : "点击加载更多（滚动到底部也会自动加载）",
                    "aria-busy": loading ? "true" : "false",
                }, loading
                    ? "⏳ 正在加载中…"
                    : "⬇️ 下滑或点击加载更多（已显示 " + count + " 条）");
            };
            /**
             * 列表「到底了」终态提示。
             *
             * 只在「服务端说不能再加载了，但仓库里确实还有更早记录」时出现——
             * 触发条件是 `parseListLimit` 的 100 条硬上限被顶满（或搜索索引与列表口径不一致）。
             * 此时若什么都不说，用户看到「已加载 100 / 共 323」却没有入口，会以为界面坏了；
             * 说清楚「更早记录请到 GitHub 查看」才是诚实的收尾。
             */
            var renderListEnd = function (kind, hasMore, count, total) {
                if (hasMore)
                    return null;
                if (typeof total !== "number" || count >= total)
                    return null;
                return h("div", {
                    key: "list-end-" + kind,
                    style: { fontSize: "11px", opacity: 0.6, padding: "8px 0", textAlign: "center" },
                    title: "单次最多加载 100 条，更早的记录请在 GitHub 查看",
                }, "已加载 " + count + " / 共 " + total + " 条，更早记录请到 GitHub 查看");
            };
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
            var forkLine = repoPresentation.forkLine;
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
            var associatedRepos = repo && Array.isArray(repo.associatedRepos) ? repo.associatedRepos : [];
            var myForkCandidate = associatedRepos.find(function (r) {
                return !r.isCurrent && r.role === 'fork';
            });
            var quickSwitchForkEl = myForkCandidate
                ? h("div", { className: "dsh-github-fork-line", style: { color: "var(--dsw-alias-link, #0969da)" } }, "⑂ 本地复刻仓库: ", h("strong", { style: { color: "inherit" } }, myForkCandidate.nameWithOwner), h("a", {
                    href: "#",
                    className: "dsh-github-switch-quicklink",
                    title: `切换默认基准仓库为 ${myForkCandidate.nameWithOwner}`,
                    onClick: function (e) {
                        e.preventDefault();
                        fetch("/api/github/action", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                action: "set_default_repo",
                                cwd,
                                repo: myForkCandidate.nameWithOwner,
                                remote: myForkCandidate.remoteName,
                            }),
                        })
                            .then(function (r) { return r.json(); })
                            .then(function (j) {
                            if (j && j.ok) {
                                if (typeof onShowToast === "function")
                                    onShowToast(`✅ 已切换为我的复刻: ${myForkCandidate.nameWithOwner}`);
                                onRefresh();
                            }
                            else {
                                if (typeof onShowToast === "function")
                                    onShowToast(`❌ 切换失败: ${j.error || j.message || "未知错误"}`);
                            }
                        })
                            .catch(function (err) {
                            if (typeof onShowToast === "function")
                                onShowToast(`❌ 切换请求异常: ${err?.message || err}`);
                        });
                    },
                }, "⇄ 设为当前基准仓库"))
                : null;
            var repoCardEl = (function () {
                const activeForkLine = forkLine;
                return h("div", { className: "dsh-github-card" }, h("div", { className: "dsh-github-card-title", style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, h("span", null, "当前工作区 GitHub 仓库"), repo && repo.stargazerCount !== undefined
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
                    ? h(RepoSelectorDropdown, {
                        associatedRepos: repo.associatedRepos,
                        currentRepo: repo.nameWithOwner,
                        cwd,
                        onRepoSwitched: () => onRefresh(),
                        showToast: onShowToast || (() => { }),
                    })
                    : null, repo
                    ? h(BranchSelectorDropdown, {
                        currentBranch: gitSt?.branch || repo.defaultBranch || "main",
                        cwd,
                        branchesData: data?.branches,
                        onBranchSwitched: () => onRefresh(),
                        showToast: onShowToast || (() => { }),
                    })
                    : null), 
                // 快捷切换行：针对“当前展示源仓库但本地检测到个人复刻”的一键切换交互
                quickSwitchForkEl, 
                // fork 血缘行：告诉用户「这个 fork 的上游是谁」，上游名可点击
                activeForkLine
                    ? h("div", { className: "dsh-github-fork-line" }, "⑂ fork 自 ", h("a", {
                        href: activeForkLine.parentUrl,
                        target: "_blank",
                        rel: "noopener noreferrer",
                        title: `打开上游仓库 ${activeForkLine.parentNameWithOwner}`,
                    }, activeForkLine.parentNameWithOwner), associatedRepos.some((r) => !r.isCurrent && r.nameWithOwner.toLowerCase() === activeForkLine.parentNameWithOwner.toLowerCase())
                        ? h("a", {
                            href: "#",
                            className: "dsh-github-switch-quicklink",
                            title: `切换为上游基准仓库 ${activeForkLine.parentNameWithOwner}`,
                            onClick: function (e) {
                                e.preventDefault();
                                fetch("/api/github/action", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        action: "set_default_repo",
                                        cwd,
                                        repo: activeForkLine.parentNameWithOwner,
                                        remote: "upstream",
                                    }),
                                })
                                    .then(function (r) { return r.json(); })
                                    .then(function (j) {
                                    if (j && j.ok) {
                                        if (typeof onShowToast === "function")
                                            onShowToast(`✅ 已切为上游视角: ${activeForkLine.parentNameWithOwner}`);
                                        onRefresh();
                                    }
                                    else {
                                        if (typeof onShowToast === "function")
                                            onShowToast(`❌ 切换失败: ${j.error || j.message || "未知错误"}`);
                                    }
                                })
                                    .catch(function (err) {
                                    if (typeof onShowToast === "function")
                                        onShowToast(`❌ 切换请求异常: ${err?.message || err}`);
                                });
                            },
                        }, "⇄ 切为基准")
                        : null)
                    : null, repo && repo.description
                    ? h("div", { className: "dsh-github-card-desc" }, repo.description)
                    : null, auth && auth.loggedIn
                    ? h("div", { className: "dsh-github-card-subtext" }, `CLI 认证账号: ${auth.user} (${auth.scopes?.join(", ") || "已登录"})`)
                    : null, !repo
                    ? h("div", { className: "dsh-github-card-subtext" }, "若本地已有 git 仓库，请运行 `git remote add github <url>` 或 `git remote add origin <url>` 关联远程仓库。")
                    : null);
            })();
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
            /*
             * PR 状态分组统计与筛选。
             *
             * 为什么计数必须在过滤之前算：胶囊上的数字要让用户知道「切过去有几条」，
             * 用过滤后的列表长度会得到「点了 Merged 之后 Open 显示 0」这种废信息。
             */
            var prByState = { open: 0, merged: 0, closed: 0 };
            prs.forEach(function (pr) {
                var s = String(pr.state || "").toLowerCase();
                if (s === "open" || s === "merged" || s === "closed")
                    prByState[s]++;
            });
            var filteredPrs = prs.filter(function (pr) {
                if (prStateFilter === "all")
                    return true;
                // 未知状态（旧快照缺 state）只出现在「全部」里，不会被误塞进具体档
                return String(pr.state || "").toLowerCase() === prStateFilter;
            });
            // 空态文案要给人看，不能把内部档位键（merged）直接抛给用户
            var PR_STATE_LABEL = { all: "全部", open: "Open", merged: "Merged", closed: "Closed" };
            var prFilterLabel = PR_STATE_LABEL[prStateFilter] || "全部";
            /*
             * 计数口径：**优先用仓库真实总数**（服务端 GraphQL `search.issueCount` 下发），
             * 只有拿不到总数时才回落到「已加载条数」。
             *
             * 为什么不能直接用 prs.length：列表按页拉，prs.length 是「已加载」，
             * 用户每下滑一次它就从 15 → 30 → 45，看起来像仓库总数在变——这是 bug。
             */
            var prTotalCount = typeof data?.prTotal === "number" ? data.prTotal : prs.length;
            // Actions 总数来自 REST actions/runs.total_count；拿不到才回落已加载条数
            var runTotalCount = typeof data?.runTotal === "number" ? data.runTotal : runs.length;
            var prOpenCount = typeof data?.prOpenTotal === "number" ? data.prOpenTotal : prByState.open;
            var prMergedCount = typeof data?.prMergedTotal === "number" ? data.prMergedTotal : prByState.merged;
            var prClosedCount = typeof data?.prClosedTotal === "number" ? data.prClosedTotal : prByState.closed;
            var prPillsEl = h("div", { className: "dsh-github-pills" }, h("button", { className: `dsh-github-pill-btn ${prStateFilter === "all" ? "active" : ""}`, "aria-pressed": prStateFilter === "all" ? "true" : "false", onClick: () => onChangePrFilter && onChangePrFilter("all") }, `全部 (${prTotalCount})`), h("button", { className: `dsh-github-pill-btn ${prStateFilter === "open" ? "active" : ""}`, "aria-pressed": prStateFilter === "open" ? "true" : "false", onClick: () => onChangePrFilter && onChangePrFilter("open") }, `🟢 Open (${prOpenCount})`), h("button", { className: `dsh-github-pill-btn ${prStateFilter === "merged" ? "active" : ""}`, "aria-pressed": prStateFilter === "merged" ? "true" : "false", onClick: () => onChangePrFilter && onChangePrFilter("merged") }, `🟣 Merged (${prMergedCount})`), h("button", { className: `dsh-github-pill-btn ${prStateFilter === "closed" ? "active" : ""}`, "aria-pressed": prStateFilter === "closed" ? "true" : "false", onClick: () => onChangePrFilter && onChangePrFilter("closed") }, `⚪ Closed (${prClosedCount})`));
            // 空态必须区分「仓库确实没有」与「当前筛选下没有」——否则用户会把筛空当成数据丢失
            var prEmptyEl = prs.length === 0
                ? h("div", { className: "dsh-github-empty" }, "该仓库暂无 Pull Request 记录")
                : h("div", { className: "dsh-github-empty" }, `当前筛选「${prFilterLabel}」下无结果，共 ${prs.length} 条记录（切换到「全部」查看）`);
            var prSectionEl = h("div", { className: "dsh-github-section" }, h("div", { className: "dsh-github-section-header" }, h("h3", null, `🔀 Pull Requests（${prs.length} / 共 ${prTotalCount}）`)), prPillsEl, filteredPrs.length === 0
                ? prEmptyEl
                : h("div", { className: "dsh-github-list" }, filteredPrs.map((pr) => {
                    var ci = rollupCiStatus(pr.statusCheckRollup);
                    var rv = reviewDecisionBadge(pr.reviewDecision);
                    var relTime = formatRelativeTime(pr.updatedAt);
                    // 点击卡片 → 在线审阅弹窗；标题旁 ↗ 保留浏览器直达（stopPropagation 防冒泡）
                    return h("div", {
                        key: pr.number,
                        className: "dsh-github-item",
                        style: onSelectPr ? { cursor: "pointer" } : undefined,
                        title: onSelectPr ? "点击在线审阅该 PR（描述 / 评论 / 文件 Diff）" : undefined,
                        onClick: onSelectPr
                            ? function () {
                                onSelectPr({ number: Number(pr.number), repo: repo?.nameWithOwner || "" });
                            }
                            : undefined,
                    }, 
                    // 标题与跳转按钮必须同行：.dsh-github-item 本身是竖排 flex，
                    // 直接放按钮会让它独占一行、只剩一个裸 ↗ 字符（曾经的丑样）。
                    h("div", { className: "dsh-github-pr-title-row" }, h("span", {
                        className: "dsh-github-item-title",
                        title: relTime ? `更新于 ${pr.updatedAt}（点击在线审阅）` : "点击在线审阅该 PR",
                    }, `${pr.isDraft ? "⚪ " : ""}#${pr.number} ${pr.title}`), 
                    // 独立的浏览器直达入口：文字标签 + 边框，明确表达「外部跳转」
                    h("a", {
                        className: "dsh-github-pr-gh-btn",
                        href: pr.url,
                        target: "_blank",
                        rel: "noopener noreferrer",
                        onClick: (e) => e.stopPropagation(),
                        title: "在浏览器打开该 PR（不进入在线审阅）",
                    }, "GitHub ↗")), h("div", { className: "dsh-github-item-meta" }, h("span", null, `${pr.headRefName} → ${pr.baseRefName}`), 
                    // 状态徽章：与主面板保持一致，否则同一 PR 在两处显示不同信息。
                    // 状态→色调的映射来自 src/shared/state-badges.ts（服务端 CLI 输出用同一份），
                    // tone 直接就是 CSS 后缀，这里不再自己判 state。
                    (() => {
                        var b = prStateBadge(pr.state);
                        // neutral = 未知状态：旧实现对这些值不渲染徽章，保持一致
                        if (!b || b.tone === "neutral")
                            return null;
                        return h("span", { className: "dsh-github-badge dsh-badge-" + b.tone }, b.label);
                    })(), pr.mergeable === "CONFLICTING"
                        ? h("span", { className: "dsh-github-badge dsh-badge-red" }, "代码冲突")
                        : h("span", { className: "dsh-github-badge dsh-badge-green" }, "可合并"), (() => {
                        // 命中判定保持旧白名单（只有 fail/pending/pass 渲染），
                        // 色调与文案则复用共享映射，避免同一状态两处颜色不一致
                        if (ci !== "fail" && ci !== "pending" && ci !== "pass")
                            return null;
                        var cb = ciBadge(undefined, ci);
                        if (!cb)
                            return null;
                        var text = ci === "fail" ? "❌ CI 失败" : ci === "pending" ? "⏳ CI 运行中" : "✅ CI 通过";
                        return h("span", { className: "dsh-github-badge dsh-badge-" + cb.tone }, text);
                    })(), rv
                        ? h("span", { className: `dsh-github-badge dsh-badge-${rv.kind}` }, rv.text)
                        : null, relTime ? h("span", null, relTime) : null));
                })));
            // Issue 状态分组统计与筛选（与 PR 同一套口径：先统计全量再过滤）
            var issueByState = { open: 0, closed: 0 };
            issues.forEach(function (issue) {
                var s = String(issue.state || "").toLowerCase();
                if (s === "open" || s === "closed")
                    issueByState[s]++;
            });
            var filteredIssues = issues.filter(function (issue) {
                if (issueStateFilter === "all")
                    return true;
                return String(issue.state || "").toLowerCase() === issueStateFilter;
            });
            var ISSUE_STATE_LABEL = { all: "全部", open: "Open", closed: "Closed" };
            var issueFilterLabel = ISSUE_STATE_LABEL[issueStateFilter] || "全部";
            // Issue 计数同 PR 口径：优先仓库真实总数，拿不到才回落已加载条数
            var issueTotalCount = typeof data?.issueTotal === "number" ? data.issueTotal : issues.length;
            var issueOpenCount = typeof data?.issueOpenTotal === "number" ? data.issueOpenTotal : issueByState.open;
            var issueClosedCount = typeof data?.issueClosedTotal === "number" ? data.issueClosedTotal : issueByState.closed;
            var issuePillsEl = h("div", { className: "dsh-github-pills" }, h("button", { className: `dsh-github-pill-btn ${issueStateFilter === "all" ? "active" : ""}`, "aria-pressed": issueStateFilter === "all" ? "true" : "false", onClick: () => onChangeIssueFilter && onChangeIssueFilter("all") }, `全部 (${issueTotalCount})`), h("button", { className: `dsh-github-pill-btn ${issueStateFilter === "open" ? "active" : ""}`, "aria-pressed": issueStateFilter === "open" ? "true" : "false", onClick: () => onChangeIssueFilter && onChangeIssueFilter("open") }, `🟢 Open (${issueOpenCount})`), h("button", { className: `dsh-github-pill-btn ${issueStateFilter === "closed" ? "active" : ""}`, "aria-pressed": issueStateFilter === "closed" ? "true" : "false", onClick: () => onChangeIssueFilter && onChangeIssueFilter("closed") }, `⚪ Closed (${issueClosedCount})`));
            var issueEmptyEl = issues.length === 0
                ? h("div", { className: "dsh-github-empty" }, "该仓库暂无 Issue 记录")
                : h("div", { className: "dsh-github-empty" }, `当前筛选「${issueFilterLabel}」下无结果，共 ${issues.length} 条记录（切换到「全部」查看）`);
            var issueSectionEl = h("div", { className: "dsh-github-section" }, h("div", { className: "dsh-github-section-header" }, h("h3", null, `📋 仓库 Issues（${issues.length} / 共 ${issueTotalCount}）`), repo?.url
                ? h("a", {
                    href: `${repo.url}/issues`,
                    target: "_blank",
                    style: { fontSize: "11px", color: "var(--dsw-alias-link, #0969da)", textDecoration: "none" },
                }, "全部 ↗")
                : null), issuePillsEl, filteredIssues.length === 0
                ? issueEmptyEl
                : h("div", { className: "dsh-github-list" }, filteredIssues.map((issue) => {
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
                    return h("div", {
                        key: issue.number,
                        className: "dsh-github-item",
                        // 只加 cursor：内联 display:flex 会顶掉 .dsh-github-item 的 column 布局
                        style: onSelectIssue ? { cursor: "pointer" } : undefined,
                        title: onSelectIssue ? "点击在线查看该 Issue（正文 / 评论时间线 / 标签与里程碑）" : undefined,
                        onClick: onSelectIssue
                            ? function () {
                                onSelectIssue({ number: Number(issue.number), repo: repo?.nameWithOwner || "" });
                            }
                            : undefined,
                    }, 
                    // 标题行：标题 → 分类徽章 → 状态徽章 → GitHub 外跳，同一行
                    h("div", { className: "dsh-github-pr-title-row" }, h("span", {
                        className: "dsh-github-item-title",
                        title: onSelectIssue ? "点击在线查看该 Issue" : undefined,
                    }, `#${issue.number} ${issue.title}`), ...badges, (() => {
                        var s = String(issue.state || "").toUpperCase();
                        if (s === "CLOSED")
                            return h("span", { className: "dsh-github-badge dsh-badge-red" }, "CLOSED");
                        if (s === "OPEN")
                            return h("span", { className: "dsh-github-badge dsh-badge-green" }, "OPEN");
                        return null;
                    })(), h("a", {
                        className: "dsh-github-pr-gh-btn",
                        href: issue.url,
                        target: "_blank",
                        rel: "noopener noreferrer",
                        onClick: (e) => e.stopPropagation(),
                        title: "在浏览器打开该 Issue（不进入在线查看）",
                    }, "GitHub ↗")), h("div", { className: "dsh-github-item-meta" }, h("span", null, `由 ${issue.author?.login || "未知"} 提出`), issue.assignees && issue.assignees.length > 0
                        ? h("span", null, `指派: ${issue.assignees.map((a) => a.login).join(", ")}`)
                        : null, issue.labels && issue.labels.length > 0
                        ? issue.labels.map((lbl) => h("span", { key: lbl.name, className: "dsh-github-badge dsh-badge-yellow" }, lbl.name))
                        : null));
                })));
            var runSectionEl = h("div", { className: "dsh-github-section" }, h("div", { className: "dsh-github-section-header" }, h("h3", null, `⚡ 最近 Actions 流水线（${runs.length} / 共 ${runTotalCount}）`)), runs.length === 0
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
                // Tab 上的数字是**仓库总数**（不是已加载条数）：下滑加载更多时它必须纹丝不动
                { key: "prs", label: "🔀 PR", count: prTotalCount },
                { key: "issues", label: "📋 Issues", count: issueTotalCount },
                // Actions 没有可用的总数接口（gh/GraphQL 都不提供），保持已加载条数
                { key: "runs", label: "⚡ Actions", count: runTotalCount },
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
            var tabbedContentEl = h("div", { "data-active-tab": defaultTab }, tabsBarEl, h("div", { "data-tab-page": "prs", hidden: defaultTab !== "prs" }, prSectionEl, renderListMore("prs", data && data.prsTruncated, prs.length, Boolean(listLoading && listLoading.prs)), renderListEnd("prs", data && data.prsTruncated, prs.length, data && data.prTotal)), h("div", { "data-tab-page": "issues", hidden: defaultTab !== "issues" }, issueSectionEl, renderListMore("issues", data && data.issuesTruncated, issues.length, Boolean(listLoading && listLoading.issues)), renderListEnd("issues", data && data.issuesTruncated, issues.length, data && data.issueTotal)), h("div", { "data-tab-page": "runs", hidden: defaultTab !== "runs" }, runSectionEl, renderListMore("runs", data && data.runsTruncated, runs.length, Boolean(listLoading && listLoading.runs)), renderListEnd("runs", data && data.runsTruncated, runs.length, data && data.runTotal)), gitSt ? h("div", { "data-tab-page": "git", hidden: defaultTab !== "git" }, gitSectionEl) : null, gitSt ? h("div", { "data-tab-page": "dirty", hidden: defaultTab !== "dirty" }, dirtySectionEl) : null);
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
            // 列表分页游标按 Tab 独立维护：防止加载更多 PR 顺带把 Issue 和 Actions 也拉满膨胀
            var tabLimitsRef = React.useRef({
                prs: OVERVIEW_PAGE_SIZE,
                issues: OVERVIEW_PAGE_SIZE,
                runs: OVERVIEW_PAGE_SIZE,
            });
            var loadingMoreListsRef = React.useRef(false);
            // 各 Tab 的「正在加载更多」UI 标记（ref 只防重入，界面反馈必须走 state 才能重渲染）
            var [listLoading, setListLoading] = React.useState({ prs: false, issues: false, runs: false });
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
                tabLimitsRef.current = {
                    prs: OVERVIEW_PAGE_SIZE,
                    issues: OVERVIEW_PAGE_SIZE,
                    runs: OVERVIEW_PAGE_SIZE,
                };
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
                    // 分页：PR / Issue / Actions 各自独立游标，避免相互膨胀
                    params.push("prLimit=" + tabLimitsRef.current.prs);
                    params.push("issueLimit=" + tabLimitsRef.current.issues);
                    params.push("runLimit=" + tabLimitsRef.current.runs);
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
            // PR 在线审阅弹窗状态：{ number, repo }；为 null 时不挂载弹窗（零常驻开销）
            var [activePr, setActivePr] = React.useState(null);
            // Issue 在线查看弹窗状态：与 PR 同构
            var [activeIssue, setActiveIssue] = React.useState(null);
            var [extraCommits, setExtraCommits] = React.useState([]);
            var [loadingMore, setLoadingMore] = React.useState(false);
            var [hasMoreCommits, setHasMoreCommits] = React.useState(true);
            var [visibleDirtyCount, setVisibleDirtyCount] = React.useState(15);
            var [extraDirtyFiles, setExtraDirtyFiles] = React.useState([]);
            var [loadingMoreDirty, setLoadingMoreDirty] = React.useState(false);
            var [hasMoreDirty, setHasMoreDirty] = React.useState(true);
            var [activeDiffFile, setActiveDiffFile] = React.useState(null);
            var [headerCardsVisible, setHeaderCardsVisible] = React.useState(() => getStoredHeaderCardsVisible());
            /*
             * 状态筛选：默认 all（= 能看见 closed/merged）。
             * 初值来自按 cwd 隔离的本地偏好，切仓库时在下面的 effect 里重新对齐。
             * 放在这里而不是 renderGithubRepoView 内部：那是普通函数，
             * 每次渲染都会重新执行，函数内 useState 会被当成新的 Hook 序列直接抛错。
             */
            var [prStateFilter, setPrStateFilter] = React.useState(() => getStoredRightbarStateFilter(cwd).pr);
            var [issueStateFilter, setIssueStateFilter] = React.useState(() => getStoredRightbarStateFilter(cwd).issue);
            var changePrFilter = React.useCallback(function (v) {
                if (PR_STATE_FILTERS.indexOf(v) < 0)
                    return;
                setPrStateFilter(v);
                saveStoredRightbarStateFilter(cwd, { pr: v });
            }, [cwd]);
            var changeIssueFilter = React.useCallback(function (v) {
                if (ISSUE_STATE_FILTERS.indexOf(v) < 0)
                    return;
                setIssueStateFilter(v);
                saveStoredRightbarStateFilter(cwd, { issue: v });
            }, [cwd]);
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
            /*
             * 切仓库时把筛选对齐到该仓库自己的偏好。
             *
             * 只依赖 cwd：若依赖 data 会在每次数据刷新时把用户刚点的筛选重置回上次
             * 落盘值——用户点「Merged」后恰逢后台 SWR 拉新，选择立刻跳回「全部」。
             */
            React.useEffect(function () {
                var stored = getStoredRightbarStateFilter(cwd);
                setPrStateFilter(stored.pr);
                setIssueStateFilter(stored.issue);
            }, [cwd]);
            /**
             * PR / Issue / Actions 列表的「加载更多」（独立游标维护）。
             *
             * 针对对应 Tab 单独累加步长，未处于当前焦点的 Tab 不增加 limit，
             * 从源头杜绝并发膨胀触发底层 125KB 截断。
             */
            var loadMoreTabList = function (kind) {
                if (loadingMoreListsRef.current)
                    return;
                var validKey = kind === "prs" ? "prs" : kind === "issues" ? "issues" : kind === "runs" ? "runs" : null;
                if (!validKey)
                    return;
                tabLimitsRef.current[validKey] = tabLimitsRef.current[validKey] + OVERVIEW_PAGE_SIZE;
                loadingMoreListsRef.current = true;
                // 立刻把该 Tab 的页脚切成「正在加载中」，请求结束后再切回来（成功失败都要复位）
                setListLoading(function (prev) {
                    var next = Object.assign({}, prev);
                    next[validKey] = true;
                    return next;
                });
                loadData(true).finally(function () {
                    loadingMoreListsRef.current = false;
                    setListLoading(function (prev) {
                        var next = Object.assign({}, prev);
                        next[validKey] = false;
                        return next;
                    });
                });
            };
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
                        else if (activeTab === "prs" && data?.prsTruncated) {
                            loadMoreTabList("prs");
                        }
                        else if (activeTab === "issues" && data?.issuesTruncated) {
                            loadMoreTabList("issues");
                        }
                        else if (activeTab === "runs" && data?.runsTruncated) {
                            loadMoreTabList("runs");
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
                        else if (activeTab === "prs" && data?.prsTruncated) {
                            loadMoreTabList("prs");
                        }
                        else if (activeTab === "issues" && data?.issuesTruncated) {
                            loadMoreTabList("issues");
                        }
                        else if (activeTab === "runs" && data?.runsTruncated) {
                            loadMoreTabList("runs");
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
            }, activeDiffFile, (f) => setActiveDiffFile(f), () => setActiveDiffFile(null), openFileInDsh, headerCardsVisible, toggleHeaderCards, (target) => setActivePr(target), (target) => setActiveIssue(target), prStateFilter, issueStateFilter, changePrFilter, changeIssueFilter, 
            // 必须追加在形参末尾（该函数 30+ 个位置参数，插中间会静默错位）
            loadMoreTabList, listLoading), h(GlobalSyncSettingsModal, {
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
                : null, activePr
                ? h(PrDetailModal, {
                    prNumber: activePr.number,
                    repoNameWithOwner: activePr.repo,
                    cwd: cwd,
                    onClose: function () { setActivePr(null); },
                    showToast: showToast,
                })
                : null, activeIssue
                ? h(IssueDetailModal, {
                    issueNumber: activeIssue.number,
                    repoNameWithOwner: activeIssue.repo,
                    cwd: cwd,
                    onClose: function () { setActiveIssue(null); },
                    showToast: showToast,
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
        // 4. 左侧栏全局入口
        //
        // 宿主的 sidebar.panellist 行渲染器会向本组件注入 { size, active }：
        //   renderSlot("sidebar.panellist", { size: wide ? 16 : 18, active }, { only: id })
        // 且图标格 .panelGlyph 是 flex:none、不设宽高——宽度完全由内容决定。
        // 因此这里必须：① 用宿主给的 size；② 不再套任何固定宽高的盒子。
        // 早期版本套了 28px 内层盒子 + 深色渐变发光，结果是图标格被撑到 28px
        // （同级 16px）、标签右移 12px、选中态多出一块发光底（issue #9）。
        function GithubSidebarIcon(props) {
            var size = props && typeof props.size === "number" ? props.size : 16;
            // 选中态由宿主 .panelRow.panelActive 负责（行背景 + label-primary），这里不重复绘制；
            // 也不设 title：宿主已提供 aria-label 与 Tooltip，叠加会出现双提示。
            return renderOctocat(size, "currentColor");
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
    // PR 状态筛选：默认「全部」而不是「Open」。
    // 实测账号可能零 open PR（当前账号 7 个 PR 全为 merged/closed），
    // 默认 Open 会让列表恒为空白，等于没修「看不到数据」这个原始问题。
    var [prStateFilter, setPrStateFilter] = React.useState("all");
    var [toastMsg, setToastMsg] = React.useState(null);
    // PR 在线审阅弹窗状态：{ number, repo } 二元组；为 null 时弹窗不渲染
    var [activePrModal, setActivePrModal] = React.useState(null);
    // Issue 在线查看弹窗状态：与 PR 完全同构的 { number, repo } 二元组
    var [activeIssueModal, setActiveIssueModal] = React.useState(null);
    var cloudTimerRef = React.useRef(null);
    var dataRef = React.useRef(data);
    // 全局面板分页游标：PR 与 Issues 独立维护，防止点击加载更多相互膨胀
    var prLimitRef = React.useRef(15);
    var issueLimitRef = React.useRef(15);
    // 「正在加载更多」UI 标记：请求往返期间页脚必须给反馈，否则用户会连点触发重复请求
    var [loadingPrs, setLoadingPrs] = React.useState(false);
    var [loadingIssues, setLoadingIssues] = React.useState(false);
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
            var params = [];
            if (forceRefresh) {
                params.push("force=true");
            }
            params.push("prLimit=" + prLimitRef.current);
            params.push("issueLimit=" + issueLimitRef.current);
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
    // 主面板列表分页：PR 与 Issue 各自独立游标，每页步长 15，避免点击加载更多相互膨胀
    var loadMorePrs = function () {
        if (loadingPrs)
            return;
        prLimitRef.current = prLimitRef.current + 15;
        setLoadingPrs(true);
        loadData(true).finally(function () { setLoadingPrs(false); });
    };
    var loadMoreIssues = function () {
        if (loadingIssues)
            return;
        issueLimitRef.current = issueLimitRef.current + 15;
        setLoadingIssues(true);
        loadData(true).finally(function () { setLoadingIssues(false); });
    };
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
    var tabsEl = h("div", { className: "dsh-github-tabs" }, h("button", { className: `dsh-github-tab-btn ${activeTab === 'workspaces' ? 'active' : ''}`, onClick: () => setActiveTab('workspaces') }, `📂 本地工作区矩阵 (${workspaceMatrix.length})`), h("button", { className: `dsh-github-tab-btn ${activeTab === 'repos' ? 'active' : ''}`, onClick: () => setActiveTab('repos') }, `☁️ 我的 GitHub 仓库 (${userRepos.length})`), h("button", { className: `dsh-github-tab-btn ${activeTab === 'prs' ? 'active' : ''}`, onClick: () => setActiveTab('prs') }, `🔀 Pull Requests (${myPrs.length})`), h("button", { className: `dsh-github-tab-btn ${activeTab === 'issues' ? 'active' : ''}`, onClick: () => setActiveTab('issues') }, `📝 任务与待办 Issues (${myIssues.length})`));
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
    else if (activeTab === 'prs') {
        // ---- PR 独立标签页：完整大屏空间，点击卡片在线唤起审阅工作台 ----
        if (!auth?.loggedIn) {
            contentEl = h("div", { className: "dsh-github-empty" }, "当前尚未认证登录 GitHub 账号，无法读取个人 PR 列表。请先完成上方的安装或登录指引。");
        }
        else {
            // 状态分组统计（供胶囊计数与空态判断）
            var prByState = { open: 0, merged: 0, closed: 0 };
            myPrs.forEach(function (pr) {
                var s = String(pr.state || '').toLowerCase();
                if (s === 'open' || s === 'merged' || s === 'closed')
                    prByState[s]++;
            });
            var filteredPrs = myPrs.filter(function (pr) {
                if (prStateFilter === 'all')
                    return true;
                return String(pr.state || '').toLowerCase() === prStateFilter;
            });
            var prPillsEl = h("div", { className: "dsh-github-pills" }, 
            // 计数优先用账号级真实总数（服务端 GraphQL search.issueCount），拿不到才回落已加载条数
            h("button", { className: `dsh-github-pill-btn ${prStateFilter === 'all' ? 'active' : ''}`, onClick: () => setPrStateFilter('all') }, `全部 (${typeof data?.prTotal === 'number' ? data.prTotal : myPrs.length})`), h("button", { className: `dsh-github-pill-btn ${prStateFilter === 'open' ? 'active' : ''}`, onClick: () => setPrStateFilter('open') }, `🟢 Open (${typeof data?.prOpenTotal === 'number' ? data.prOpenTotal : prByState.open})`), h("button", { className: `dsh-github-pill-btn ${prStateFilter === 'merged' ? 'active' : ''}`, onClick: () => setPrStateFilter('merged') }, `🟣 Merged (${typeof data?.prMergedTotal === 'number' ? data.prMergedTotal : prByState.merged})`), h("button", { className: `dsh-github-pill-btn ${prStateFilter === 'closed' ? 'active' : ''}`, onClick: () => setPrStateFilter('closed') }, `⚪ Closed (${typeof data?.prClosedTotal === 'number' ? data.prClosedTotal : prByState.closed})`));
            // 空态必须区分「账号确实没有」与「当前筛选下没有」——否则用户会把筛空当成数据丢失
            var prEmptyEl = myPrs.length === 0
                ? h("div", { className: "dsh-github-empty" }, "该账号下暂无任何 Pull Request 记录")
                : h("div", { className: "dsh-github-empty" }, `当前筛选「${prStateFilter}」下无结果，共 ${myPrs.length} 条记录（切换到「全部」查看）`);
            contentEl = h("div", null, h("h3", { className: "dsh-github-subheading" }, `🔀 我发起与参与的 Pull Requests（${filteredPrs.length} 条符合筛选 / 共 ${typeof data?.prTotal === 'number' ? data.prTotal : myPrs.length}）`), prPillsEl, 
            // 「加载更多」页脚：服务端说还有更多（本次拉满）时渲染，点击即 +15 重取。
            // 旧文案是「已触及检索上限，请到 GitHub 查看」——那是在没有分页能力时的兜底，
            // 现在数据可以继续拉，改成可点击的入口。
            data && data.prsTruncated
                ? h("div", {
                    onClick: loadingPrs ? undefined : loadMorePrs,
                    title: loadingPrs ? "正在加载更多 PR…" : "点击加载更多（滚动到底部也会自动加载）", "aria-busy": loadingPrs ? "true" : "false",
                    style: {
                        margin: "8px 0",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        lineHeight: 1.5,
                        textAlign: "center",
                        cursor: loadingPrs ? "default" : "pointer",
                        background: "rgba(210, 153, 34, 0.12)",
                        border: "1px solid rgba(210, 153, 34, 0.35)",
                        color: "var(--dsw-alias-state-attention-primary, #9a6700)",
                    },
                }, loadingPrs ? "⏳ 正在加载中…" : `⬇️ 下滑或点击加载更多 PR（已显示 ${myPrs.length} 条）`)
                : (typeof data?.prTotal === 'number' && myPrs.length < data.prTotal
                    // 顶到单次 100 条上限后不再有加载入口，必须说明「更早记录在哪」，否则用户以为界面坏了
                    ? h("div", { style: { margin: "8px 0", fontSize: "11px", opacity: 0.6, textAlign: "center" } }, `已加载 ${myPrs.length} / 共 ${data.prTotal} 条，更早记录请到 GitHub 查看`)
                    : null), filteredPrs.length === 0 ? prEmptyEl : h("div", { className: "dsh-github-list" }, filteredPrs.map((pr) => {
                // 点击卡片主体 → 在线审阅弹窗
                return h("div", {
                    key: pr.number,
                    className: "dsh-github-item",
                    /*
                     * 只加 cursor，绝不覆盖 display/alignItems/flexWrap。
                     * 这里的 inline style 曾写成 display:flex + alignItems:center + flexWrap:wrap，
                     * 直接把 .dsh-github-item 的 flex-direction:column 顶掉，
                     * 导致标题、状态徽章、时间全部横向挤成一行并整体居中——
                     * 卡片布局就是被这一行内联样式毁掉的。
                     */
                    style: { cursor: "pointer" },
                    title: "点击在线审阅该 PR（描述 / 评论 / 文件 Diff）",
                    onClick: () => {
                        setActivePrModal({
                            number: Number(pr.number),
                            repo: pr.repository?.nameWithOwner || '',
                        });
                    },
                }, 
                // 标题行：标题 → 状态徽章 → GitHub 跳转按钮，全部同一行
                h("div", { className: "dsh-github-pr-title-row" }, h("span", { className: "dsh-github-item-title", style: { cursor: "pointer" } }, `${pr.isDraft ? "⚪ " : ""}[${pr.repository?.nameWithOwner || 'Repo'}] #${pr.number} ${pr.title}`), pr.isDraft ? h("span", { className: "dsh-github-badge dsh-badge-yellow", style: { flexShrink: 0 } }, "DRAFT") : null, 
                // 状态徽章：列表含 merged/closed，必须标明才能一眼区分
                (() => {
                    // 状态→色调来自 shared/state-badges（与右侧栏、CLI 输出同一份）
                    var b = prStateBadge(pr.state);
                    if (!b || b.tone === 'neutral')
                        return null;
                    return h("span", { className: "dsh-github-badge dsh-badge-" + b.tone, style: { flexShrink: 0 } }, b.label);
                })(), h("a", {
                    className: "dsh-github-pr-gh-btn",
                    href: pr.url,
                    target: "_blank",
                    rel: "noopener noreferrer",
                    onClick: (e) => e.stopPropagation(),
                    title: "在浏览器打开该 PR（不进入在线审阅）",
                }, "GitHub ↗")), 
                // 第二行只保留时间，避免与标题行的徽章重复
                formatRelativeTime(pr.updatedAt)
                    ? h("div", { className: "dsh-github-item-meta" }, h("span", { style: { whiteSpace: "nowrap" } }, formatRelativeTime(pr.updatedAt)))
                    : null);
            })));
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
            }, `全部 (${myIssues.length})`), h("button", {
                className: `dsh-github-pill-btn ${issueFilter === 'reported' ? 'active' : ''}`,
                onClick: () => setIssueFilter('reported'),
            }, `📥 用户提起的 (${issueStats.reported || 0})`), h("button", {
                className: `dsh-github-pill-btn ${issueFilter === 'assigned' ? 'active' : ''}`,
                onClick: () => setIssueFilter('assigned'),
            }, `🎯 分配给我的 (${issueStats.assigned || 0})`), h("button", {
                className: `dsh-github-pill-btn ${issueFilter === 'created' ? 'active' : ''}`,
                onClick: () => setIssueFilter('created'),
            }, `✍️ 我创建的 (${issueStats.created || 0})`));
            contentEl = h("div", null, 
            // Issue 侧没有可信总数（三路并集无法用单条查询计数），老实标「已加载」，不假装是总数
            h("h3", { className: "dsh-github-subheading" }, `📝 我发起与参与的 Issues（${filteredIssues.length} 条符合筛选 / 已加载 ${myIssues.length}）`), issuePillsEl, 
            // 「加载更多」页脚：与 PR 列表同一口径（服务端 issuesTruncated = 还能继续拉）
            data && data.issuesTruncated
                ? h("div", {
                    onClick: loadingIssues ? undefined : loadMoreIssues,
                    title: loadingIssues ? "正在加载更多 Issue…" : "点击加载更多（滚动到底部也会自动加载）", "aria-busy": loadingIssues ? "true" : "false",
                    style: {
                        margin: "8px 0",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        lineHeight: 1.5,
                        textAlign: "center",
                        cursor: loadingIssues ? "default" : "pointer",
                        background: "rgba(210, 153, 34, 0.12)",
                        border: "1px solid rgba(210, 153, 34, 0.35)",
                        color: "var(--dsw-alias-state-attention-primary, #9a6700)",
                    },
                }, loadingIssues ? "⏳ 正在加载中…" : `⬇️ 下滑或点击加载更多 Issue（已显示 ${myIssues.length} 条）`)
                : null, filteredIssues.length === 0
                ? (myIssues.length === 0
                    ? h("div", { className: "dsh-github-empty" }, "该账号下暂无任何 Issue 记录")
                    : h("div", { className: "dsh-github-empty" }, `当前分类「${issueFilter}」下无结果，共 ${myIssues.length} 条记录（切换到「全部」查看）`))
                : h("div", { className: "dsh-github-list" }, filteredIssues.map((is) => {
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
                    return h("div", {
                        key: is.url || is.number,
                        className: "dsh-github-item",
                        /*
                         * 只加 cursor，绝不覆盖 display/alignItems/flexWrap。
                         * .dsh-github-item 是 flex-direction:column，任何内联 flex 布局
                         * 都会把标题、徽章、元信息横向挤成一行（PR 卡片上踩过的坑）。
                         */
                        style: { cursor: "pointer" },
                        title: "点击在线查看该 Issue（正文 / 评论时间线 / 标签与里程碑）",
                        onClick: () => {
                            setActiveIssueModal({
                                number: Number(is.number),
                                repo: is.repository?.nameWithOwner || '',
                            });
                        },
                    }, 
                    // 标题行：标题 → 分类徽章 → 状态徽章 → GitHub 外跳，全部同一行
                    h("div", { className: "dsh-github-pr-title-row" }, h("span", { className: "dsh-github-item-title", style: { cursor: "pointer" } }, `[${is.repository?.nameWithOwner || 'Repo'}] #${is.number} ${is.title}`), ...badges, (() => {
                        // 状态徽章：全局检索含 closed，不标注会让用户把已关闭议题当成待办
                        var b = issueStateBadge(is.state);
                        if (!b || b.tone === 'neutral')
                            return null;
                        return h("span", { className: "dsh-github-badge dsh-badge-" + b.tone, style: { flexShrink: 0 } }, b.label);
                    })(), h("a", {
                        className: "dsh-github-pr-gh-btn",
                        href: is.url,
                        target: "_blank",
                        rel: "noopener noreferrer",
                        onClick: (e) => e.stopPropagation(),
                        title: "在浏览器打开该 Issue（不进入在线查看）",
                    }, "GitHub ↗")), h("div", { className: "dsh-github-item-meta" }, is.author ? h("span", null, `由 @${is.author.login} 提出`) : null, is.assignees && is.assignees.length > 0
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
    }), 
    // PR 在线审阅工作台：仅在用户点击某个 PR 时挂载，关闭即卸载（零常驻开销）
    activePrModal
        ? h(PrDetailModal, {
            prNumber: activePrModal.number,
            repoNameWithOwner: activePrModal.repo,
            onClose: () => setActivePrModal(null),
            showToast: showToast,
        })
        : null, 
    // Issue 在线查看弹窗：同上，点击即挂载、关闭即卸载
    activeIssueModal
        ? h(IssueDetailModal, {
            issueNumber: activeIssueModal.number,
            repoNameWithOwner: activeIssueModal.repo,
            onClose: () => setActiveIssueModal(null),
            showToast: showToast,
        })
        : null);
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
