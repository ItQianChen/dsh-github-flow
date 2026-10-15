import { sanitizeCell, formatStateBadge } from './common.js';

/**
 * Issue 领域渲染器：负责 Issue 列表多标签表格、单卡详情、指派人与图片附件提示
 */
export function renderIssueMarkdown(args: any, value: any): string {
  if (!value) return '无返回内容';
  if (value.status === 'AWAITING_CONFIRMATION') {
    return [
      `> ### ${value.warning || '⚠️ 高危操作拦截警告'}`,
      `> - **影响评估**: ${value.impact || '该操作将改变远端仓库状态。'}`,
      `> - **确认指引**: ${value.requiredAction || '如确认继续，请向用户核实并在参数中附加 `confirm: true` 重新调用。'}`,
    ].join('\n');
  }
  if (typeof value.result === 'string') return value.result;
  if (typeof value.message === 'string' && !value.items) {
    const extra = value.detail || value.output;
    return `**${value.message}**` + (value.url ? `\n🔗 链接: ${value.url}` : '') + (extra ? `\n\`\`\`\n${extra}\n\`\`\`` : '');
  }

  // 2.1 Issue 列表
  if (Array.isArray(value.items) && args?.action === 'list') {
    const list = value.items.filter(Boolean);
    if (list.length === 0) return '📭 当前仓库暂无匹配的 Issue。';
    const rows = list.map((i: any) => {
      const numLink = i.url ? `[#${i.number}](${i.url})` : `#${i.number}`;
      const badge = formatStateBadge(i.state);
      const title = sanitizeCell(i.title, 60);
      const labels = Array.isArray(i.labels) && i.labels.length > 0
        ? i.labels.map((l: any) => `\`${sanitizeCell(l.name || l, 15)}\``).join(' ')
        : '-';
      const author = i.author?.login ? `@${i.author.login}` : (typeof i.author === 'string' ? `@${i.author}` : '-');
      const date = i.updatedAt ? i.updatedAt.slice(0, 10) : '-';
      return `| ${numLink} | ${badge} | ${title} | ${labels} | ${author} | ${date} |`;
    });
    return [
      `**找到 ${list.length} 个 Issue:**\n`,
      '| 编号 | 状态 | 标题 | 标签 | 作者 | 更新日期 |',
      '| :--- | :--- | :--- | :--- | :--- | :--- |',
      ...rows,
    ].join('\n');
  }

  // 2.2 Issue View 详情
  if (args?.action === 'view' && value.number) {
    const link = value.url ? `[#${value.number}](${value.url})` : `#${value.number}`;
    const badge = formatStateBadge(value.state);
    const author = value.author?.login ? `@${value.author.login}` : '-';
    const lines = [
      `### ${badge} ${value.title} (${link})`,
      `- **作者**: ${author} | **更新时间**: ${value.updatedAt?.slice(0, 16) || '-'}`,
    ];
    if (Array.isArray(value.labels) && value.labels.length > 0) {
      lines.push(`- **标签**: ${value.labels.map((l: any) => `\`${l.name || l}\``).join(' ')}`);
    }
    if (Array.isArray(value.assignees) && value.assignees.length > 0) {
      lines.push(`- **指派人**: ${value.assignees.map((a: any) => `@${a.login || a}`).join(' ')}`);
    }
    if (value.body) {
      lines.push('\n**议题正文:**\n```markdown\n' + sanitizeCell(value.body, 300) + '\n```');
    }
    // 图片附件清单（view 附带 URL 清单，view_images 按需下载查看）
    if (Array.isArray(value.images) && value.images.length > 0) {
      lines.push(`- **📎 图片附件 (${value.images.length}):** 调用 \`github_issue(action: 'view_images', issue_number: ${value.number})\` 可下载查看`);
    }
    return lines.join('\n');
  }

  // 兜底降级
  return JSON.stringify(value, null, 2);
}
