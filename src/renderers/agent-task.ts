import { sanitizeCell } from './common.js';

/**
 * 格式化 Agent Task 状态徽标
 */
export function formatAgentTaskStateBadge(state?: string): string {
  if (!state) return '⚪ UNKNOWN';
  const upper = state.toUpperCase();
  switch (upper) {
    case 'COMPLETED':
    case 'SUCCESS':
      return '🟢 COMPLETED';
    case 'IN_PROGRESS':
    case 'RUNNING':
      return '🟡 RUNNING';
    case 'FAILED':
    case 'FAILURE':
      return '🔴 FAILED';
    case 'CANCELLED':
    case 'CANCELED':
      return '⚪ CANCELLED';
    default:
      return `⚪ ${upper}`;
  }
}

/**
 * 渲染 Agent Tasks 列表表格
 */
export function renderAgentTaskList(items: any[]): string {
  const list = items.filter(Boolean);
  if (list.length === 0) {
    return '📭 暂无智能体任务 (Agent Tasks)。';
  }

  const rows = list.map((t: any) => {
    const rawId = String(t.id || '-');
    const shortId = rawId.length > 8 ? `\`${rawId.slice(0, 8)}...\`` : `\`${rawId}\``;
    const name = sanitizeCell(t.name || '(无描述)', 40);
    const stateBadge = formatAgentTaskStateBadge(t.state);
    
    let prCell = '-';
    if (t.pullRequestNumber) {
      const prText = `#${t.pullRequestNumber}`;
      prCell = t.pullRequestUrl ? `[${prText}](${t.pullRequestUrl})` : prText;
    }

    const created = t.createdAt ? t.createdAt.split('T')[0] : '-';
    return `| ${shortId} | ${name} | ${stateBadge} | ${prCell} | ${created} |`;
  });

  return [
    `**智能体任务列表 (${list.length} 条):**\n`,
    '| 任务 ID | 描述 | 状态 | 关联 PR | 创建日期 |',
    '| :--- | :--- | :--- | :--- | :--- |',
    ...rows,
  ].join('\n');
}

/**
 * 渲染单个 Agent Task 详情卡片
 */
export function renderAgentTaskView(task: any): string {
  if (!task || typeof task !== 'object') {
    return '无任务详情数据';
  }

  const name = task.name || '(未命名任务)';
  const stateBadge = formatAgentTaskStateBadge(task.state);
  const repo = task.repository ? `[${task.repository}](https://github.com/${task.repository})` : '-';
  const user = task.user?.login || task.user || '-';
  const created = task.createdAt || '-';
  const completed = task.completedAt || '-';

  const lines = [
    `### 🤖 Agent Task: ${name}\n`,
    `- **任务 ID**: \`${task.id || '-'}\``,
    `- **状态**: ${stateBadge}`,
    `- **目标仓库**: ${repo}`,
    `- **分派用户**: @${user}`,
    `- **创建时间**: ${created}`,
    `- **完成时间**: ${completed}`,
  ];

  if (task.pullRequestNumber) {
    const prTitle = task.pullRequestTitle ? ` - ${task.pullRequestTitle}` : '';
    const prLink = task.pullRequestUrl
      ? `[#${task.pullRequestNumber}${prTitle}](${task.pullRequestUrl})`
      : `#${task.pullRequestNumber}${prTitle}`;
    lines.push(`- **关联 PR**: ${prLink} (${task.pullRequestState || 'OPEN'})`);
  }

  if (task.logs || task.log) {
    lines.push('\n**会话日志记录:**', '```text', String(task.logs || task.log).trim(), '```');
  }

  return lines.join('\n');
}

/**
 * Agent Task 领域综合渲染入口
 */
export function renderAgentTaskMarkdown(args: any, value: any): string {
  if (!value) return '无返回内容';
  if (typeof value.result === 'string') return value.result;
  if (typeof value.message === 'string' && !value.items) {
    const extra = value.detail || value.output || value.url;
    return `**${value.message}**` + (extra ? `\n\`\`\`\n${extra}\n\`\`\`` : '');
  }

  if (Array.isArray(value.items) && args?.action === 'list') {
    return renderAgentTaskList(value.items);
  }

  if (args?.action === 'view' || value.id) {
    return renderAgentTaskView(value);
  }

  return JSON.stringify(value, null, 2);
}
