import { sanitizeCell } from './common.js';
/**
 * 解析 gh status 的输出，提取待办 Issue、待办 PR、评审请求、提及与近期动态
 */
export function parseStatusOutput(output) {
    const trimmed = (output || '').trim();
    const report = {
        assignedIssues: [],
        assignedPrs: [],
        reviewRequests: [],
        mentions: [],
        activity: [],
        rawText: trimmed,
    };
    if (!trimmed)
        return report;
    const lines = trimmed.split(/[\r\n]+/);
    let currentSection = null;
    for (const line of lines) {
        const rawLine = line.trim();
        if (!rawLine)
            continue;
        // 检查是否包含版块头
        if (/Assigned Issues/i.test(rawLine)) {
            currentSection = 'assignedIssues';
            // 如果同一行有双列分割
            if (/Assigned Pull Requests/i.test(rawLine)) {
                // 双列行，仅做标记
                continue;
            }
            continue;
        }
        if (/Assigned Pull Requests/i.test(rawLine)) {
            currentSection = 'assignedPrs';
            continue;
        }
        if (/Review Requests/i.test(rawLine)) {
            currentSection = 'reviewRequests';
            continue;
        }
        if (/Mentions/i.test(rawLine)) {
            currentSection = 'mentions';
            continue;
        }
        if (/Repository Activity/i.test(rawLine)) {
            currentSection = 'activity';
            continue;
        }
        // 过滤空状态占位符
        if (rawLine.includes('Nothing here') || rawLine.includes('^_^')) {
            continue;
        }
        // 处理行内容（支持制表符或双列分隔）
        const cleanSegments = rawLine
            .split('│')
            .map((s) => s.trim())
            .filter((s) => s && !s.includes('Nothing here') && !s.includes('^_^'));
        for (const segment of cleanSegments) {
            if (!segment)
                continue;
            // 尝试匹配制表符或 "repo#123\tdesc\tdetail"
            const tabParts = segment.split('\t').map((p) => p.trim());
            const itemMatch = tabParts[0].match(/^([^#\s]+)#(\d+)/);
            const item = {
                raw: segment,
            };
            if (itemMatch) {
                item.repo = itemMatch[1];
                item.number = itemMatch[2];
                item.title = tabParts[1] || '';
                item.detail = tabParts[2] || '';
            }
            else {
                item.detail = segment;
            }
            if (currentSection && report[currentSection]) {
                report[currentSection].push(item);
            }
            else {
                // 未匹配版块默认归入 activity
                report.activity.push(item);
            }
        }
    }
    return report;
}
/**
 * Status 领域渲染器：负责用户跨仓待办大盘的 Markdown 格式化
 */
export function renderStatusMarkdown(args, value) {
    if (!value)
        return '无返回内容';
    const report = value.parsed || parseStatusOutput(value.rawText || value.output || '');
    const renderSection = (title, icon, items, emptyText) => {
        if (!items || items.length === 0) {
            return `#### ${icon} ${title}\n*${emptyText}*\n`;
        }
        const rows = items.map((it) => {
            const repoRef = it.repo && it.number ? `\`${it.repo}#${it.number}\`` : '-';
            const titleText = sanitizeCell(it.title || it.raw, 40);
            const detailText = sanitizeCell(it.detail, 40);
            return `| ${repoRef} | ${titleText} | ${detailText} |`;
        });
        return [
            `#### ${icon} ${title} (${items.length})\n`,
            '| 仓库 & 编号 | 标题 / 动作 | 详情 / 摘要 |',
            '| :--- | :--- | :--- |',
            ...rows,
            '',
        ].join('\n');
    };
    const sections = [
        renderSection('指派给我的 Issue (Assigned Issues)', '📌', report.assignedIssues, '🟢 暂无分配给你的未决 Issue'),
        renderSection('指派给我的 PR (Assigned Pull Requests)', '🔀', report.assignedPrs, '🟢 暂无分配给你的未决 PR'),
        renderSection('等待我评审的 PR (Review Requests)', '👀', report.reviewRequests, '🟢 暂无待你评审的 PR'),
        renderSection('提及我的动态 (Mentions)', '🔔', report.mentions, '🟢 暂无与你相关的近期提及'),
        renderSection('订阅仓库近期动态 (Repository Activity)', '⚡', report.activity, '暂无近期仓库动态'),
    ];
    return [
        '### 🧭 GitHub 个人待办与跨仓动态聚合看板\n',
        ...sections,
        '> 💡 **待办操作建议**: 可通过 `github_issue(action: \'view\')` 或 `github_pr(action: \'checkout\')` 快速检视对应议题并展开工作。',
    ].join('\n');
}
