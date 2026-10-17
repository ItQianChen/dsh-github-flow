import { sanitizeCell } from './common.js';
/**
 * 渲染 GitHub OAuth Scope 权限缺失自愈引导卡片
 */
export function renderScopeRequiredMarkdown(value) {
    const scope = value.scope || '相关权限';
    const command = value.command || `gh auth refresh -s ${scope}`;
    const toolName = value.tool ? `「${value.tool}」` : '';
    return [
        `> ### 🔑 需要补充 GitHub 权限授权 (Token Scope)`,
        `> - **缺少权限**: \`${scope}\``,
        `> - **影响工具**: ${toolName || '当前操作'}`,
        `> - **自愈指引**: 请在宿主终端中执行以下单行命令完成授权：`,
        `>   \`\`\`bash`,
        `>   ${command}`,
        `>   \`\`\``,
        `> - **说明**: 授权完成后无需重启插件，直接重新调用当前工具即可正常执行。`,
    ].join('\n');
}
/**
 * 渲染 Projects 列表表格
 */
export function renderProjectList(items) {
    const list = items.filter(Boolean);
    if (list.length === 0) {
        return '📭 暂无项目规划看板 (Projects)。';
    }
    const rows = list.map((p) => {
        const num = p.number ? `#${p.number}` : '-';
        const link = p.url ? `[${num}](${p.url})` : num;
        const title = sanitizeCell(p.title || '(无标题)', 40);
        const stateBadge = p.closed ? '🟣 CLOSED' : '🔵 OPEN';
        const visibility = p.public ? '🌐 Public' : '🔒 Private';
        const desc = sanitizeCell(p.shortDescription || p.readme || '-', 35);
        return `| ${link} | ${title} | ${stateBadge} | ${visibility} | ${desc} |`;
    });
    return [
        `**项目看板列表 (${list.length} 个):**\n`,
        '| 编号 | 项目标题 | 状态 | 可见性 | 描述 |',
        '| :--- | :--- | :--- | :--- | :--- |',
        ...rows,
    ].join('\n');
}
/**
 * 渲染单个 Project 详情卡片
 */
export function renderProjectView(p) {
    if (!p || typeof p !== 'object') {
        return '无项目详情数据';
    }
    const num = p.number ? `#${p.number}` : '';
    const title = p.title || '(无标题)';
    const stateBadge = p.closed ? '🟣 CLOSED' : '🔵 OPEN';
    const visibility = p.public ? '🌐 Public' : '🔒 Private';
    const link = p.url ? `[打开项目网页](${p.url})` : '';
    const lines = [
        `### 📋 Project ${num}: ${title}\n`,
        `- **状态**: ${stateBadge}`,
        `- **可见性**: ${visibility}`,
        `- **项目 ID**: \`${p.id || '-'}\``,
    ];
    if (link)
        lines.push(`- **项目链接**: ${link}`);
    if (p.shortDescription)
        lines.push(`- **简述**: ${p.shortDescription}`);
    if (p.readme) {
        lines.push('\n**项目 README 说明:**', '---', p.readme.trim(), '---');
    }
    return lines.join('\n');
}
/**
 * 渲染 Project Items 看板条目列表
 */
export function renderProjectItemList(items) {
    const list = items.filter(Boolean);
    if (list.length === 0) {
        return '📭 当前项目看板中暂无任何条目 (Items)。';
    }
    const rows = list.map((item) => {
        const rawId = String(item.id || '-');
        const shortId = rawId.length > 8 ? `\`${rawId.slice(0, 8)}...\`` : `\`${rawId}\``;
        const title = sanitizeCell(item.title || item.content?.title || '(无标题条目)', 45);
        const type = item.type || (item.content?.type ? String(item.content.type) : 'DraftIssue');
        const status = item.status || '-';
        return `| ${shortId} | ${title} | \`${type}\` | ${status} |`;
    });
    return [
        `**项目看板条目 (${list.length} 条):**\n`,
        '| 条目 ID | 标题 / 内容 | 类型 | 状态看板 |',
        '| :--- | :--- | :--- | :--- |',
        ...rows,
    ].join('\n');
}
/**
 * Project 领域综合渲染入口
 */
export function renderProjectMarkdown(args, value) {
    if (!value)
        return '无返回内容';
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
    if (typeof value.result === 'string')
        return value.result;
    if (typeof value.message === 'string' && !value.items && !value.projects) {
        const extra = value.detail || value.output || value.url;
        return `**${value.message}**` + (extra ? `\n\`\`\`\n${extra}\n\`\`\`` : '');
    }
    // 列表渲染（适配 projects 或 items 数组）
    const listData = Array.isArray(value.projects) ? value.projects : (Array.isArray(value.items) ? value.items : null);
    if (listData && args?.action === 'list') {
        return renderProjectList(listData);
    }
    if (listData && args?.action === 'item-list') {
        return renderProjectItemList(listData);
    }
    if (args?.action === 'view' || value.number) {
        return renderProjectView(value);
    }
    return JSON.stringify(value, null, 2);
}
