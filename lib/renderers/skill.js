import { sanitizeCell } from './common.js';
/**
 * Skill 领域渲染器：负责 Agent Skills 跨仓检索结果、已安装列表与预览说明
 */
export function renderSkillMarkdown(args, value) {
    if (!value)
        return '无返回内容';
    if (value.status === 'AWAITING_CONFIRMATION') {
        return [
            `> ### ${value.warning || '⚠️ 操作确认拦截'}`,
            `> - **影响评估**: ${value.impact || ''}`,
            `> - **确认指引**: ${value.requiredAction || '如确认继续，请在参数中附加 `confirm: true` 重新调用。'}`,
        ].join('\n');
    }
    if (typeof value.result === 'string')
        return value.result;
    if (typeof value.message === 'string' && !value.items) {
        const extra = value.detail || value.output;
        return `**${value.message}**` + (extra ? `\n\`\`\`\n${extra}\n\`\`\`` : '');
    }
    // 6.1 Skill 检索列表
    if (Array.isArray(value.items) && args?.action === 'search') {
        const list = value.items.filter(Boolean);
        if (list.length === 0)
            return '📭 未检索到匹配的 Agent Skill。';
        const rows = list.map((s) => {
            const name = s.skillName ? `\`${s.skillName}\`` : '-';
            const repo = s.repo ? `[${s.repo}](https://github.com/${s.repo})` : '-';
            const stars = typeof s.stars === 'number' ? `⭐ ${s.stars}` : '-';
            const desc = sanitizeCell(s.description, 50);
            return `| ${name} | ${repo} | ${stars} | ${desc} |`;
        });
        return [
            `**Skills 检索结果 (${list.length} 个):**\n`,
            '| Skill | 仓库 | Stars | 描述 |',
            '| :--- | :--- | :--- | :--- |',
            ...rows,
        ].join('\n');
    }
    // 6.2 已安装 Skills 列表
    if (Array.isArray(value.items) && args?.action === 'list') {
        const list = value.items.filter(Boolean);
        if (list.length === 0)
            return '📭 当前环境尚未安装任何 Agent Skill。';
        const rows = list.map((s) => {
            const name = s.skillName ? `\`${s.skillName}\`` : '-';
            const ver = s.version ? String(s.version) : '-';
            const scope = s.scope ? String(s.scope) : '-';
            const source = s.sourceURL ? `[来源](${s.sourceURL})` : (s.path ? `\`${sanitizeCell(s.path, 40)}\`` : '-');
            return `| ${name} | ${ver} | ${scope} | ${source} |`;
        });
        return [
            `**已安装 ${list.length} 个 Agent Skill:**\n`,
            '| Skill | 版本 | 范围 | 来源 |',
            '| :--- | :--- | :--- | :--- |',
            ...rows,
        ].join('\n');
    }
    // 兜底降级
    return JSON.stringify(value, null, 2);
}
