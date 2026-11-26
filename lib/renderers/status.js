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
    if (value?.healthScore !== undefined || value?.degradationRate !== undefined || args?.action === 'health') {
        // 审核行由 `github_status` 的 health 分支附加在载荷上（`approvalLine`）。
        // 它不是 `TelemetrySummary` 的一部分：遥测是工具链健康，审核是人机协作。
        return renderHealthAuditMarkdown(value, value?.approvalLine);
    }
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
/**
 * 渲染 DSH GitHub 工具链健康度与降级率审计报表
 *
 * `approvalLine`（可选，s3）：人工审核的 7 天汇总。
 *
 * 为什么它由调用方算好传进来、而不是在这里从遥测推导：遥测是"工具链健康"，
 * 审核是"人机协作"——混在一起会让健康分被"用户今天点了很多次拒绝"拉低。
 * **那是用户认真，不是系统有病。** 所以两者数据源分开，只是恰好印在同一页上。
 */
export function renderHealthAuditMarkdown(summary, approvalLine) {
    if (!summary)
        return '无遥测健康度数据';
    let badge = '🟢 极佳';
    if (summary.statusLevel === 'NEEDS_ATTENTION') {
        badge = '🔴 需关注';
    }
    else if (summary.statusLevel === 'GOOD') {
        badge = '🟡 良好';
    }
    const successRate = summary.totalCalls > 0
        ? `${((summary.successCount / summary.totalCalls) * 100).toFixed(1)}%`
        : '100%';
    const rejected = summary.rejectedCount ?? 0;
    /*
     * 成功率 / 样本量要把"用户拒绝"从分母里摘掉。
     *
     * 拒绝是人的决定，不是工具链故障：把它留在分母里，一个认真逐条审核的用户
     * 会看到成功率一路下滑、健康分掉到"需关注"，而实际上什么都没坏。
     * 这也正是"健康分 67 + 建议说极佳"那处矛盾的根。
     */
    const effectiveTotal = Math.max(0, summary.totalCalls - rejected);
    const effectiveSuccessRate = effectiveTotal > 0
        ? `${((summary.successCount / effectiveTotal) * 100).toFixed(1)}%`
        : (summary.successCount > 0 ? '100%' : '—');
    const lines = [
        '### 🩺 DSH GitHub 工具链健康度与降级率审计报表\n',
        `- **综合健康分**: ${badge} (${summary.healthScore} / 100 分)`,
        `- **统计样本量**: 最近 ${summary.totalCalls} 次 Agent 工具调用` +
            (rejected > 0 ? `（其中 ${rejected} 次因你拒绝审核未执行，已从健康分与成功率中排除）` : ''),
        `- **API 降级率**: \`${summary.degradationRate}%\` (${summary.degradedCount} 次触发降级链路)`,
        `- **安全防御拦截**: ${summary.confirmBlockedCount + summary.scopeBlockedCount} 次 (含 ${summary.scopeBlockedCount} 次权限缺失，${summary.confirmBlockedCount} 次确认防线)`,
        `- **执行成功率**: \`${effectiveSuccessRate}\` (${summary.successCount} 成功, ${summary.failureCount} 失败` +
            (rejected > 0 ? `, ${rejected} 次审核拒绝` : '') + ')',
    ];
    // 审核行与上面的健康指标**分属两个数据源**（见函数头注释），用空行断开，
    // 避免被读成"健康分的一部分"（列表在 Markdown 里遇空行会另起一段）
    if (approvalLine)
        lines.push('', `- **审核（近 7 天）**: ${approvalLine}`);
    // 工具调用分布表
    const toolNames = Object.keys(summary.toolStats || {});
    if (toolNames.length > 0) {
        const sorted = toolNames.sort((a, b) => summary.toolStats[b].total - summary.toolStats[a].total);
        const rows = sorted.map((name) => {
            const s = summary.toolStats[name];
            const rej = s.rejected ?? 0;
            const eff = Math.max(0, s.total - rej);
            const rate = eff > 0 ? `${((s.success / eff) * 100).toFixed(0)}%` : (s.success > 0 ? '100%' : '—');
            let toolBadge = '🟢 正常';
            if (s.degraded > 0)
                toolBadge = '🟡 存在降级';
            if (s.failed > 0 && s.success === 0)
                toolBadge = '🔴 异常';
            // 全是拒绝、没有失败也没有成功：既不是"正常"也不是"异常"，如实标成拒绝
            if (rej > 0 && s.failed === 0 && s.success === 0 && s.degraded === 0)
                toolBadge = '⚪ 已拒绝';
            const rejCell = rej > 0 ? String(rej) : '—';
            return `| \`${name}\` | ${s.total} | ${rate} | ${rejCell} | ${s.degraded} | ${toolBadge} |`;
        });
        lines.push('\n**核心工具调用分布:**', '| 工具名称 | 调用次数 | 成功率 | 审核拒绝 | 降级次数 | 状态 |', '| :--- | :---: | :---: | :---: | :---: | :--- |', ...rows);
    }
    // 自愈优化建议
    if (Array.isArray(summary.recommendations) && summary.recommendations.length > 0) {
        lines.push('\n> 💡 **优化与自愈建议:**');
        summary.recommendations.forEach((rec) => {
            lines.push(`> - ${rec}`);
        });
    }
    return lines.join('\n');
}
