import { sanitizeCell } from './common.js';
/**
 * 格式化 Discussion 状态徽标
 */
export function formatDiscussionStateBadge(state, answered, closed) {
    if (answered)
        return '🟢 ANSWERED';
    const effective = state ? String(state).toUpperCase() : (closed ? 'CLOSED' : 'OPEN');
    if (effective === 'OPEN')
        return '🔵 OPEN';
    if (effective === 'CLOSED')
        return '🟣 CLOSED';
    return `⚪ ${effective}`;
}
/**
 * 渲染 Discussion 列表表格
 */
export function renderDiscussionList(items) {
    const list = items.filter(Boolean);
    if (list.length === 0) {
        return '📭 暂无讨论主题 (Discussions)。';
    }
    const rows = list.map((d) => {
        const num = d.number ? `#${d.number}` : '-';
        const link = d.url ? `[${num}](${d.url})` : num;
        const title = sanitizeCell(d.title || '(无标题)', 45);
        const category = sanitizeCell(d.category?.name || d.category || 'General', 15);
        const stateBadge = formatDiscussionStateBadge(d.state, d.answered, d.closed);
        const author = d.author?.login || d.author || '-';
        const updated = d.updatedAt ? d.updatedAt.split('T')[0] : (d.createdAt ? d.createdAt.split('T')[0] : '-');
        return `| ${link} | ${title} | \`${category}\` | ${stateBadge} | @${author} | ${updated} |`;
    });
    return [
        `**讨论主题列表 (${list.length} 条):**\n`,
        '| 编号 | 标题 | 分类 | 状态 | 作者 | 更新日期 |',
        '| :--- | :--- | :--- | :--- | :--- | :--- |',
        ...rows,
    ].join('\n');
}
/**
 * 渲染单个 Discussion 详情卡片
 */
export function renderDiscussionView(d) {
    if (!d || typeof d !== 'object') {
        return '无讨论详情数据';
    }
    const num = d.number ? `#${d.number}` : '';
    const title = d.title || '(无标题)';
    const stateBadge = formatDiscussionStateBadge(d.state, d.answered, d.closed);
    const category = d.category?.name || d.category || 'General';
    const author = d.author?.login || d.author || '-';
    const created = d.createdAt || '-';
    const link = d.url ? `[查看原始讨论](${d.url})` : '';
    const lines = [
        `### 💬 Discussion ${num}: ${title}\n`,
        `- **状态**: ${stateBadge}`,
        `- **分类**: \`${category}\``,
        `- **发起人**: @${author}`,
        `- **创建时间**: ${created}`,
    ];
    if (link)
        lines.push(`- **链接**: ${link}`);
    if (Array.isArray(d.labels) && d.labels.length > 0) {
        const labelBadges = d.labels.map((l) => `\`${l.name || l}\``).join(' ');
        lines.push(`- **标签**: ${labelBadges}`);
    }
    if (d.body) {
        lines.push('\n**正文内容:**', '---', d.body.trim(), '---');
    }
    // 渲染关联评论列表
    if (Array.isArray(d.comments) && d.comments.length > 0) {
        lines.push(`\n**讨论回复 (${d.comments.length} 条):**`);
        d.comments.forEach((c, index) => {
            const cAuthor = c.author?.login || c.author || '匿名';
            const cTime = c.createdAt ? c.createdAt.replace('T', ' ').slice(0, 19) : '';
            const cBody = (c.body || '').trim();
            lines.push(`\n> **#${index + 1} 楼 @${cAuthor}** (${cTime}):\n> ${cBody.replace(/\n/g, '\n> ')}`);
        });
    }
    return lines.join('\n');
}
/**
 * Discussion 领域综合渲染入口
 */
export function renderDiscussionMarkdown(args, value) {
    if (!value)
        return '无返回内容';
    if (typeof value.result === 'string')
        return value.result;
    if (typeof value.message === 'string' && !value.items) {
        const extra = value.detail || value.output || value.url;
        return `**${value.message}**` + (extra ? `\n\`\`\`\n${extra}\n\`\`\`` : '');
    }
    if (Array.isArray(value.items) && args?.action === 'list') {
        return renderDiscussionList(value.items);
    }
    if (args?.action === 'view' || value.number) {
        return renderDiscussionView(value);
    }
    return JSON.stringify(value, null, 2);
}
