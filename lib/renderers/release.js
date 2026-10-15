import { sanitizeCell, formatReleaseBadge } from './common.js';
/**
 * Release 领域渲染器：负责版本发布历史列表与详情卡片（含资产清单、发布说明预览）
 */
export function renderReleaseMarkdown(args, value) {
    if (!value)
        return '无返回内容';
    if (value.status === 'AWAITING_CONFIRMATION') {
        return [
            `> ### ${value.warning || '⚠️ 高危操作拦截警告'}`,
            `> - **影响评估**: ${value.impact || '该操作将改变远端仓库状态。'}`,
            `> - **确认指引**: ${value.requiredAction || '如确认继续，请向用户核实并在参数中附加 `confirm: true` 重新调用。'}`,
        ].join('\n');
    }
    if (typeof value.result === 'string')
        return value.result;
    if (typeof value.message === 'string' && !value.items) {
        const extra = value.detail || value.output;
        return `**${value.message}**` + (value.url ? `\n🔗 链接: ${value.url}` : '') + (extra ? `\n\`\`\`\n${extra}\n\`\`\`` : '');
    }
    // 5.1 Release 列表
    if (Array.isArray(value.items) && args?.action === 'list') {
        const list = value.items.filter(Boolean);
        if (list.length === 0)
            return '📭 当前仓库暂无任何 Release。';
        const rows = list.map((r) => {
            const tag = r.tagName ? `\`${r.tagName}\`` : '-';
            const name = sanitizeCell(r.name || r.tagName, 40);
            const badge = formatReleaseBadge(r.isDraft, r.isPrerelease);
            const date = (r.publishedAt || r.createdAt || '').slice(0, 10) || '-';
            return `| ${tag} | ${badge} | ${name} | ${date} |`;
        });
        return [
            `**最近 ${list.length} 个 Release:**\n`,
            '| Tag | 类型 | 名称 | 发布日期 |',
            '| :--- | :--- | :--- | :--- |',
            ...rows,
        ].join('\n');
    }
    // 5.2 Release 详情卡片
    if (args?.action === 'view' && value.tagName) {
        const badge = formatReleaseBadge(value.isDraft, value.isPrerelease);
        const lines = [
            `### 🏷️ Release \`${value.tagName}\` ${badge}`,
        ];
        // 元信息压缩成一段（硬换行分隔），避免逐行 filter 空串把段落分隔也滤掉。
        // Markdown 的列表/段落渲染依赖空行：若标题、资产列表、正文之间没有空行，
        // 列表语法会失效并连成一段——所以这里改为「分段数组 + 空行 join」。
        const meta = [];
        if (value.name)
            meta.push(`**${value.name}**`);
        if (value.url)
            meta.push(`🔗 ${value.url}`);
        if (value.publishedAt)
            meta.push(`📅 发布于 ${value.publishedAt.slice(0, 10)}`);
        if (meta.length > 0)
            lines.push(meta.join('  \n'));
        if (Array.isArray(value.assets) && value.assets.length > 0) {
            const assetLines = value.assets.map((a) => {
                const size = typeof a.size === 'number' ? ` (${(a.size / 1024).toFixed(1)} KB)` : '';
                return `- \`${a.name || '-'}\`${size}`;
            });
            lines.push(`**📎 附属资产 (${value.assets.length}):**\n${assetLines.join('\n')}`);
        }
        if (value.body) {
            // 发版说明可能非常长，只保留前 600 字符做快速预览，避免单次调用撑爆上下文
            const preview = value.body.length > 600 ? value.body.slice(0, 600) + '\n…(已截断，完整内容见 Release 页面)' : value.body;
            lines.push(`**📝 发版说明摘要:**\n\n${preview}`);
        }
        return lines.join('\n\n');
    }
    // 兜底降级
    return JSON.stringify(value, null, 2);
}
