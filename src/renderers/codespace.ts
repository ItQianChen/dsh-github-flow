import { sanitizeCell } from './common.js';
import { renderScopeRequiredMarkdown } from './project.js';

/**
 * 格式化 Codespace 状态徽标
 */
export function formatCodespaceStateBadge(state?: string): string {
  if (!state) return '⚪ UNKNOWN';
  const lower = state.toLowerCase();
  if (lower === 'available') return '🟢 AVAILABLE';
  if (lower === 'shutdown') return '⚪ SHUTDOWN';
  if (lower.includes('start') || lower.includes('rebuild')) return '🟡 STARTING';
  if (lower.includes('updat') || lower.includes('export')) return '🟡 BUSY';
  return `⚪ ${state.toUpperCase()}`;
}

/**
 * 渲染 Codespaces 列表表格
 */
export function renderCodespaceList(items: any[]): string {
  const list = items.filter(Boolean);
  if (list.length === 0) {
    return '📭 暂无云端开发环境 (Codespaces)。';
  }

  const rows = list.map((cs: any) => {
    const name = `\`${sanitizeCell(cs.name || '-', 25)}\``;
    const displayName = sanitizeCell(cs.displayName || cs.name || '-', 25);
    const repo = cs.repository ? `[${cs.repository}](https://github.com/${cs.repository})` : '-';
    const stateBadge = formatCodespaceStateBadge(cs.state);
    const machine = sanitizeCell(cs.machineDisplayName || cs.machineName || '-', 20);
    const lastUsed = cs.lastUsedAt ? cs.lastUsedAt.split('T')[0] : '-';

    return `| ${name} | ${displayName} | ${repo} | ${stateBadge} | ${machine} | ${lastUsed} |`;
  });

  return [
    `**云端开发环境列表 (${list.length} 台):**\n`,
    '| 实例标识 | 显示名称 | 关联仓库 | 运行状态 | 机器规格 | 上次使用 |',
    '| :--- | :--- | :--- | :--- | :--- | :--- |',
    ...rows,
  ].join('\n');
}

/**
 * 渲染单个 Codespace 详情卡片
 */
export function renderCodespaceView(cs: any): string {
  if (!cs || typeof cs !== 'object') {
    return '无云端环境详情数据';
  }

  const name = cs.displayName || cs.name || '未命名实例';
  const stateBadge = formatCodespaceStateBadge(cs.state);
  const repo = cs.repository ? `[${cs.repository}](https://github.com/${cs.repository})` : '-';
  const owner = cs.owner || cs.billableOwner || '-';
  const machine = cs.machineDisplayName || cs.machineName || '-';
  const created = cs.createdAt || '-';
  const lastUsed = cs.lastUsedAt || '-';

  const lines = [
    `### ☁️ Codespace: ${name}\n`,
    `- **实例标识**: \`${cs.name || '-'}\``,
    `- **运行状态**: ${stateBadge}`,
    `- **关联仓库**: ${repo}`,
    `- **所有者**: @${owner}`,
    `- **机器规格**: ${machine}`,
    `- **空闲停机**: ${cs.idleTimeoutMinutes ? `${cs.idleTimeoutMinutes} 分钟` : '默认'}`,
    `- **创建时间**: ${created}`,
    `- **上次活跃**: ${lastUsed}`,
  ];

  if (cs.devcontainerPath) {
    lines.push(`- **容器配置**: \`${cs.devcontainerPath}\``);
  }

  return lines.join('\n');
}

/**
 * Codespace 领域综合渲染入口
 */
export function renderCodespaceMarkdown(args: any, value: any): string {
  if (!value) return '无返回内容';
  if (value.status === 'SCOPE_REQUIRED') {
    return renderScopeRequiredMarkdown(value);
  }
  if (value.status === 'AWAITING_CONFIRMATION') {
    return [
      `> ### ${value.warning || '⚠️ 操作确认拦截'}`,
      `> - **影响评估**: ${value.impact || ''}`,
      `> - **确认指引**: ${value.requiredAction || '如确认继续，请在参数中附加 `confirm: true` 重新调用。'}`,
    ].join('\n');
  }
  if (typeof value.result === 'string') return value.result;
  if (typeof value.message === 'string' && !value.items) {
    const extra = value.detail || value.output;
    return `**${value.message}**` + (extra ? `\n\`\`\`\n${extra}\n\`\`\`` : '');
  }

  if (Array.isArray(value.items) && args?.action === 'list') {
    return renderCodespaceList(value.items);
  }

  if (args?.action === 'view' || value.name) {
    return renderCodespaceView(value);
  }

  return JSON.stringify(value, null, 2);
}
