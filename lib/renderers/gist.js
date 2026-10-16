import { sanitizeCell } from './common.js';
/**
 * 解析 gh gist list 的制表符/多列纯文本输出
 */
export function parseGistListOutput(output) {
    const trimmed = (output || '').trim();
    if (!trimmed)
        return [];
    const lines = trimmed.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
    const results = [];
    for (const line of lines) {
        let parts = line.split('\t');
        if (parts.length < 2) {
            parts = line.split(/\s{2,}/);
        }
        if (parts.length >= 1 && parts[0].length >= 8) {
            results.push({
                id: parts[0].trim(),
                description: (parts[1] || '').trim(),
                filesCount: (parts[2] || '').trim(),
                visibility: (parts[3] || 'secret').trim(),
                updatedAt: (parts[4] || '').trim(),
            });
        }
    }
    return results;
}
/**
 * Gist 领域渲染器：负责 GitHub Gist 列表、代码正文、创建/删除反馈的 Markdown 格式化
 */
export function renderGistMarkdown(args, value) {
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
    // 2. create 操作卡片展示
    if (args?.action === 'create' && value.url) {
        const visBadge = value.public ? '🌐 Public' : '🔒 Secret (Unlisted)';
        const descHint = value.description ? `\n> - **描述**: ${value.description}` : '';
        return [
            `✅ **成功创建 Gist 代码片段**:\n`,
            `- **访问链接**: [${value.url}](${value.url})`,
            `- **Gist ID**: \`${value.gist_id}\``,
            `- **可见性**: ${visBadge}${descHint}`,
            '',
            '> ⚠️ **安全须知**: Secret Gist 属于未列出（Unlisted）公开可寻址资源，拥有链接的任何人均可访问，切勿存放私有凭证或敏感机密。',
        ].join('\n');
    }
    // 3. view 操作展示
    if (args?.action === 'view') {
        const raw = (value.content || value.rawText || '').trim();
        const id = value.gist_id || args?.gist_id || '';
        const fileHint = args?.filename ? ` (${args.filename})` : '';
        return [
            `### 📄 Gist 代码片段: \`${id}\`${fileHint}\n`,
            '```',
            raw || '无代码内容',
            '```',
        ].join('\n');
    }
    // 4. list 操作表格展示
    if (args?.action === 'list') {
        const list = Array.isArray(value.items) ? value.items : [];
        if (list.length === 0) {
            return '📭 当前 GitHub 账号下尚未创建任何 Gist 代码片段。';
        }
        const rows = list.map((g) => {
            const id = g.id ? `\`${g.id}\`` : '-';
            const desc = sanitizeCell(g.description, 35);
            const files = g.filesCount ? `\`${g.filesCount}\`` : '-';
            const vis = g.visibility === 'public' ? '🌐 public' : '🔒 secret';
            const updated = sanitizeCell(g.updatedAt, 20);
            return `| ${id} | ${desc} | ${files} | ${vis} | ${updated} |`;
        });
        return [
            `**Gist 代码片段列表 (${list.length} 个):**\n`,
            '| Gist ID | 描述 / 摘要 | 文件数 | 可见性 | 最近更新 |',
            '| :--- | :--- | :--- | :--- | :--- |',
            ...rows,
            '',
            '> 💡 **查看指南**: 调用 `github_gist(action: \'view\', gist_id: \'...\')` 可查看完整代码正文。',
        ].join('\n');
    }
    // 5. 消息提示（delete, edit 等）
    if (typeof value.message === 'string') {
        const extra = value.detail || value.output;
        return `**${value.message}**` + (extra ? `\n\`\`\`\n${extra}\n\`\`\`` : '');
    }
    // 6. 兜底
    return JSON.stringify(value, null, 2);
}
