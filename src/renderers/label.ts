import { sanitizeCell } from './common.js';

/**
 * Label 领域渲染器：负责 GitHub Labels 列表、创建、编辑、克隆与删除的 Markdown 格式化
 */
export function renderLabelMarkdown(args: any, value: any): string {
  if (!value) return '无返回内容';

  // 1. 高危操作确认拦截报告
  if (value.status === 'AWAITING_CONFIRMATION') {
    return [
      `> ### ${value.warning || '⚠️ 操作确认拦截'}`,
      `> - **影响评估**: ${value.impact || ''}`,
      `> - **确认指引**: ${value.requiredAction || '如确认继续，请在参数中附加 \`confirm: true\` 重新调用。'}`,
    ].join('\n');
  }

  if (typeof value.result === 'string') return value.result;

  // 2. 单操作消息提示（create, edit, delete, clone 等）
  if (typeof value.message === 'string' && !value.items) {
    const extra = value.detail || value.output;
    return `**${value.message}**` + (extra ? `\n\`\`\`\n${extra}\n\`\`\`` : '');
  }

  // 3. 标签列表展示
  if (Array.isArray(value.items)) {
    const list = value.items.filter(Boolean);
    if (list.length === 0) {
      return args?.search
        ? `📭 未检索到匹配关键词 "${args.search}" 的标签。`
        : '📭 仓库中尚未创建任何标签。';
    }

    const rows = list.map((item: any) => {
      const name = item.name ? `\`${sanitizeCell(item.name, 40)}\`` : '-';
      const colorRaw = item.color ? String(item.color).replace(/^#/, '') : '';
      const color = colorRaw ? `\`#${colorRaw.toLowerCase()}\`` : '-';
      const desc = sanitizeCell(item.description, 60);
      return `| ${name} | ${color} | ${desc} |`;
    });

    const searchHint = args?.search ? ` (过滤关键词: "${args.search}")` : '';
    return [
      `**仓库标签列表 (${list.length} 个)${searchHint}:**\n`,
      '| 标签 | 颜色 | 描述 |',
      '| :--- | :--- | :--- |',
      ...rows,
    ].join('\n');
  }

  // 4. 兜底降级
  return JSON.stringify(value, null, 2);
}
