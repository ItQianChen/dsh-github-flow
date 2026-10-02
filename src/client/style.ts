export const GITHUB_PANEL_CSS = `
.dsh-github-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  cursor: pointer;
  color: var(--dsw-alias-label-secondary, #8c8c8c);
  transition: color 0.15s ease;
}
.dsh-github-icon:hover {
  color: var(--dsw-alias-label-primary, #ffffff);
}
.dsh-github-icon svg {
  width: 18px;
  height: 18px;
  fill: currentColor;
}

/* 主面板容器 */
.dsh-github-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding: 24px 32px;
  box-sizing: border-box;
  background: var(--dsw-alias-bg-primary, #1e1e20);
  color: var(--dsw-alias-label-primary, #ececec);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

/* 顶部标题与工具栏 */
.dsh-github-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #333336);
}
.dsh-github-title {
  display: flex;
  align-items: center;
  gap: 12px;
}
.dsh-github-title h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}
.dsh-github-refresh-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 13px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l1, #444);
  background: var(--dsw-alias-bg-secondary, #2a2a2e);
  color: var(--dsw-alias-label-primary, #fff);
  cursor: pointer;
  transition: all 0.15s ease;
}
.dsh-github-refresh-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover, #3a3a3e);
}

/* 概览卡片区 */
.dsh-github-overview-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
.dsh-github-card {
  padding: 16px 20px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1, #333336);
  background: var(--dsw-alias-bg-secondary, #252528);
}
.dsh-github-card-title {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--dsw-alias-label-tertiary, #888);
  margin-bottom: 8px;
}
.dsh-github-card-value {
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}
.dsh-github-badge {
  display: inline-block;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 12px;
  font-weight: 500;
}
.dsh-badge-green { background: rgba(46, 160, 67, 0.2); color: #3fb950; }
.dsh-badge-red { background: rgba(248, 81, 73, 0.2); color: #f85149; }
.dsh-badge-yellow { background: rgba(210, 153, 34, 0.2); color: #d29922; }
.dsh-badge-purple { background: rgba(163, 113, 247, 0.2); color: #a371f7; }

/* 模块分栏区 */
.dsh-github-section {
  margin-bottom: 28px;
}
.dsh-github-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.dsh-github-section-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

/* 列表条目 */
.dsh-github-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dsh-github-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l1, #333336);
  background: var(--dsw-alias-bg-secondary, #252528);
  transition: border-color 0.15s ease;
}
.dsh-github-item:hover {
  border-color: var(--dsw-alias-border-l2, #555);
}
.dsh-github-item-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dsh-github-item-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary, #fff);
  text-decoration: none;
}
.dsh-github-item-title:hover {
  text-decoration: underline;
}
.dsh-github-item-meta {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #8c8c8c);
  display: flex;
  gap: 12px;
}
.dsh-github-item-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dsh-github-btn-sm {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid var(--dsw-alias-border-l1, #444);
  background: transparent;
  color: var(--dsw-alias-label-primary, #fff);
  cursor: pointer;
}
.dsh-github-btn-sm:hover {
  background: var(--dsw-alias-interactive-bg-hover, #333);
}
.dsh-github-empty {
  padding: 24px;
  text-align: center;
  font-size: 13px;
  color: var(--dsw-alias-label-tertiary, #666);
  border: 1px dashed var(--dsw-alias-border-l1, #333);
  border-radius: 6px;
}
`;
