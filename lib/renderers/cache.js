import { sanitizeCell } from './common.js';
/**
 * 友好文件大小换算：B -> KB -> MB -> GB
 */
export function formatBytes(bytes) {
    if (typeof bytes !== 'number' || isNaN(bytes) || bytes <= 0)
        return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
/**
 * Cache 领域渲染器：负责 GitHub Actions 缓存列表、容量盘点与清理操作的 Markdown 格式化
 */
export function renderCacheMarkdown(args, value) {
    if (!value)
        return '无返回内容';
    // 1. 高危操作确认拦截报告
    if (value.status === 'AWAITING_CONFIRMATION') {
        return [
            `> ### ${value.warning || '⚠️ 操作确认拦截'}`,
            `> - **影响评估**: ${value.impact || ''}`,
            `> - **确认指引**: ${value.requiredAction || '如确认继续，请在参数中附加 \\`confirm: true\\` 重新调用。'}`,
        ].join('\n');
    }
    if (typeof value.result === 'string')
        return value.result;
    // 2. 单操作消息提示（delete 等）
    if (typeof value.message === 'string' && !value.items) {
        const extra = value.detail || value.output;
        return `**${value.message}**` + (extra ? `\n\`\`\`\n${extra}\n\`\`\`` : '');
    }
    // 3. 缓存列表展示
    if (Array.isArray(value.items)) {
        const list = value.items.filter(Boolean);
        if (list.length === 0) {
            return args?.key
                ? `📭 未检索到匹配键名 "${args.key}" 的 Actions 缓存。`
                : '📭 仓库中当前未发现任何 Actions 缓存。';
        }
        let totalBytes = 0;
        const rows = list.map((item) => {
            const id = item.id ? `\`${item.id}\`` : '-';
            const key = item.key ? `\`${sanitizeCell(item.key, 35)}\`` : '-';
            const sizeNum = typeof item.sizeInBytes === 'number' ? item.sizeInBytes : 0;
            totalBytes += sizeNum;
            const sizeStr = formatBytes(sizeNum);
            const ref = item.ref ? `\`${sanitizeCell(item.ref, 25)}\`` : '-';
            const lastAccess = item.lastAccessedAt ? item.lastAccessedAt.replace('T', ' ').replace('Z', '') : '-';
            return `| ${id} | ${key} | ${sizeStr} | ${ref} | ${lastAccess} |`;
        });
        const keyHint = args?.key ? ` (过滤键: "${args.key}")` : '';
        const totalSizeStr = formatBytes(totalBytes);
        return [
            `**Actions 缓存列表 (${list.length} 个, 总计占用 ${totalSizeStr})${keyHint}:**\n`,
            '| 缓存 ID | 键名 (Key) | 大小 | 关联 Ref | 最后访问时间 |',
            '| :--- | :--- | :--- | :--- | :--- |',
            ...rows,
            '',
            '> 💡 **缓存治理建议**: 若 Actions 构建耗时变长或缓存过载，可使用 `github_cache(action: \'delete\', cache_id: ...)` 精准清理，或通过 `all: true, confirm: true` 全量清空。',
        ].join('\n');
    }
    // 4. 兜底降级
    return JSON.stringify(value, null, 2);
}
