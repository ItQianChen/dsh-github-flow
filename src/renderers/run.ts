import { sanitizeCell, formatCiBadge } from './common.js';

/**
 * Actions Run 领域渲染器：负责工作流运行列表、工作流清单、工作流详情与单次 Run 状态渲染
 */
export function renderRunMarkdown(args: any, value: any): string {
  if (!value) return '无返回数据';
  if (typeof value.result === 'string') return value.result;
  if (typeof value.message === 'string' && !value.items) {
    return `**${value.message}**` + (value.output ? `\n\`\`\`\n${value.output}\n\`\`\`` : '');
  }

  // 3.1 Run 列表
  if (Array.isArray(value.items) && args?.action === 'list') {
    const list = value.items.filter(Boolean);
    if (list.length === 0) return '📭 暂无匹配的工作流运行记录。';
    const rows = list.map((r: any) => {
      const idLink = r.url ? `[${r.databaseId}](${r.url})` : `\`${r.databaseId}\``;
      const badge = formatCiBadge(r.status, r.conclusion);
      const name = sanitizeCell(r.name, 35);
      const branch = r.headBranch ? `\`${r.headBranch}\`` : '-';
      const event = r.event || '-';
      const time = r.createdAt ? r.createdAt.slice(0, 16).replace('T', ' ') : '-';
      return `| ${idLink} | ${badge} | ${name} | ${branch} | ${event} | ${time} |`;
    });
    return [
      `**最近 ${list.length} 次工作流运行:**\n`,
      '| Run ID | 结论 / 状态 | 工作流名称 | 触发分支 | 触发事件 | 运行时间 |',
      '| :--- | :--- | :--- | :--- | :--- | :--- |',
      ...rows,
    ].join('\n');
  }

  // 3.2 Workflow 清单（字段集为 gh 2.96 实测合法全集 4 个）
  if (Array.isArray(value.items) && args?.action === 'workflow_list') {
    const list = value.items.filter(Boolean);
    if (list.length === 0) return args?.all === true ? '📭 该仓库没有任何工作流。' : '📭 暂无 active 工作流（可能全部 disabled，传 all: true 查看）。';
    const rows = list.map((w: any) => {
      const badge = w.state === 'active' ? '🟢 active' : (w.state === 'disabled' ? '🔴 disabled' : String(w.state || '-'));
      return `| \`${w.id}\` | ${sanitizeCell(w.name, 40)} | ${badge} | \`${sanitizeCell(w.path, 45)}\` |`;
    });
    return [
      `**工作流清单 (${list.length} 个${args?.all === true ? '，含 disabled' : ''}):**\n`,
      '| ID | 名称 | 状态 | 文件 |',
      '| :--- | :--- | :--- | :--- |',
      ...rows,
    ].join('\n');
  }

  // 3.3 Workflow 详情（gh 无 --json，头部结构化 + Recent runs 原文引用块——D4 决策）
  if (args?.action === 'workflow_view' && value.workflow) {
    const lines = [
      `### 🔄 ${value.workflow}`,
      `- **ID**: \`${value.id || '-'}\`${value.totalRuns ? ` | **累计运行**: ${value.totalRuns} 次` : ''}`,
    ];
    if (value.recentRuns) {
      lines.push('', '**最近运行:**', '```', value.recentRuns, '```');
    }
    return lines.join('\n');
  }

  // 3.4 Run View 详情
  if (args?.action === 'view' && value.databaseId) {
    const idLink = value.url ? `[${value.databaseId}](${value.url})` : `\`${value.databaseId}\``;
    const badge = formatCiBadge(value.status, value.conclusion);
    const lines = [
      `### 工作流: ${value.name} (Run: ${idLink})`,
      `- **状态**: ${badge}`,
    ];
    if (Array.isArray(value.jobs) && value.jobs.length > 0) {
      lines.push('\n**Jobs 步骤明细:**\n| Job 名称 | 结论 / 状态 | 详情 |', '| :--- | :--- | :--- |');
      for (const j of value.jobs) {
        lines.push(`| ${sanitizeCell(j.name, 30)} | ${formatCiBadge(j.status, j.conclusion)} | ${j.url ? `[链接](${j.url})` : '-'} |`);
      }
    }
    return lines.join('\n');
  }

  // 兜底降级
  return JSON.stringify(value, null, 2);
}
