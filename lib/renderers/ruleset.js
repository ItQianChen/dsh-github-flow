import { sanitizeCell } from './common.js';
/**
 * Ruleset 领域渲染器：负责 GitHub Rulesets 列表、详情与分支策略 check 的 Markdown 格式化
 */
export function renderRulesetMarkdown(args, value) {
    if (!value)
        return '无返回内容';
    if (typeof value.result === 'string')
        return value.result;
    // 1. check 操作格式化展示（策略视角 PR 无法合并的核心排障答案）
    if (args?.action === 'check') {
        const branch = value.branch || args?.branch || '当前分支';
        const repo = value.repo || args?.repo || '-';
        const ruleCount = typeof value.ruleCount === 'number' ? value.ruleCount : 0;
        if (ruleCount === 0) {
            return [
                `🟢 分支 \`${branch}\`（仓库 \`${repo}\`）当前**未受任何 Ruleset 规则保护或策略限制**。`,
                '',
                '> 💡 **PR 合并排障指南**: 该分支无策略规则阻断。若 PR 依然无法合并，通常是因为：',
                '> 1. **CI 未通过**: 请调用 \\`github_pr(action: \'checks\')\\` 审查 CI 检查项，若有失败调用 \\`github_run(action: \'log_failed\')\\`；',
                '> 2. **代码冲突**: 请检查 PR 的 \\`mergeable\\` 状态；',
                '> 3. **Draft 状态**: 若为草稿，请使用 \\`github_pr(action: \'ready\')\\` 转为可评审状态。',
            ].join('\n');
        }
        const items = Array.isArray(value.rules) ? value.rules : [];
        const ruleRows = items.map((r) => {
            const name = r.name ? `🔒 **${r.name}**` : '-';
            const params = r.params ? `\`${sanitizeCell(r.params, 50)}\`` : '-';
            const source = r.source ? sanitizeCell(r.source, 40) : '-';
            return `| ${name} | ${params} | ${source} |`;
        });
        const tablePart = items.length > 0
            ? [
                '| 规则类型 | 约束详情 | 规则集来源 |',
                '| :--- | :--- | :--- |',
                ...ruleRows,
            ].join('\n')
            : (value.rawText ? `\`\`\`\n${value.rawText}\n\`\`\`` : '');
        return [
            `⚠️ 分支 \`${branch}\`（仓库 \`${repo}\`）受到 **${ruleCount}** 项策略规则保护与约束:\n`,
            tablePart,
            '',
            '> 💡 **PR 合并策略排障**: PR 合并必须满足上述硬性规则（如必审批准人数、指定 CI 门禁、线性历史、签名提交等）。与 \\`github_pr(action: \'checks\')\\` 配合可完整诊断“PR 为何无法合并”。',
        ].join('\n');
    }
    // 2. list 操作格式化展示
    if (args?.action === 'list') {
        const raw = (value.rawText || value.output || '').trim();
        if (!raw) {
            return '📭 目标仓库/组织当前未配置任何规则集 (Rulesets)。';
        }
        return [
            `**规则集列表 (Rulesets):**\n`,
            '```',
            raw,
            '```',
        ].join('\n');
    }
    // 3. view 操作格式化展示
    if (args?.action === 'view') {
        const raw = (value.rawText || value.output || '').trim();
        const idHint = value.ruleset_id ? ` (ID: ${value.ruleset_id})` : '';
        return [
            `### 🛡️ 规则集详情${idHint}\n`,
            '```',
            raw || '无详细规则内容',
            '```',
        ].join('\n');
    }
    // 4. 兜底
    if (typeof value.message === 'string')
        return value.message;
    return JSON.stringify(value, null, 2);
}
