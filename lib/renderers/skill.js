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
    // 6.3 Skill 校验与发布报告
    if (args?.action === 'publish' || value?.mode === 'dry-run' || value?.mode === 'fix' || value?.mode === 'publish') {
        return renderSkillPublishMarkdown(value);
    }
    // 兜底降级
    return JSON.stringify(value, null, 2);
}
/**
 * 解析 gh skill publish 命令输出的 TSV 诊断行与状态汇总
 *
 * 核心设计理由与约束：
 * 1. gh skill publish 命令无论成功还是失败，均采用制表符 `\t` 分隔的 TSV 纯文本行输出；
 * 2. 诊断行格式：`error\t<skill>\t<msg>`、`warning\t<skill>\t<msg>`、`fixed\t<skill>\t<msg>` 或 `warning\t\t<repo_rule>`；
 * 3. 校验失败时 exitCode 为 1，但其 stdout 中携带精准的错误项列表，需提取后结构化呈现，绝不能当作盲目异常吞没；
 * 4. 若未匹配到有效技能或遇到无技能目录，从 stderr 提取根因提示。
 */
export function parseSkillPublishOutput(rawStdout, rawStderr, exitOk, mode, directory, tag) {
    const items = [];
    const repoWarnings = [];
    let summary = '';
    const combined = `${rawStdout || ''}\n${rawStderr || ''}`;
    const lines = combined.split(/\r?\n/).map(l => l.trimEnd()).filter(Boolean);
    for (const line of lines) {
        // 匹配 TSV 诊断行：error/warning/fixed + \t + skillName + \t + message
        const tsvMatch = line.match(/^(error|warning|fixed)\t([^\t]*)\t(.*)$/i);
        if (tsvMatch) {
            const type = tsvMatch[1].toLowerCase();
            const skillName = tsvMatch[2].trim();
            const message = tsvMatch[3].trim();
            if (!skillName) {
                // 技能名为空通常是仓库级规则警告（如 ruleset 缺少 tag 保护）
                repoWarnings.push(message);
            }
            else {
                items.push({ type, skillName, message });
            }
            continue;
        }
        // 汇总与特征行识别
        if (/validation failed with \d+ error\(s\)/i.test(line)) {
            summary = line.trim();
        }
        else if (/Dry run complete/i.test(line)) {
            if (!summary)
                summary = line.trim();
        }
        else if (/Fixed \d+ file\(s\)/i.test(line)) {
            summary = line.trim();
        }
        else if (/no skills found in/i.test(line)) {
            summary = line.trim();
        }
        else if (/Released/i.test(line) && mode === 'publish') {
            if (!summary)
                summary = line.trim();
        }
    }
    // 判定最终业务成功态：
    // 1. 若 items 中存在任一 error，则判定为失败；
    // 2. 若 exitOk 为 false，即使没有 TSV 行也判定为失败；
    // 3. dry-run 模式下无 error 且正常跑完判定为成功；
    // 4. 若没有找到 skill（summary 包含 no skills found），视作失败并在 items 中追加说明项。
    const hasErrors = items.some(i => i.type === 'error');
    const noSkillsFound = summary.includes('no skills found in');
    let success = exitOk && !hasErrors && !noSkillsFound;
    if (noSkillsFound && items.length === 0) {
        items.push({
            type: 'error',
            skillName: '-',
            message: summary || '在目标目录下未检索到符合规范的 Agent Skill（需满足 skills/*/SKILL.md 等路径约束）',
        });
        success = false;
    }
    else if (!exitOk && items.length === 0 && rawStderr) {
        // 其它非零退出且无 TSV 诊断行的情况，将 stderr 作为通用错误提示
        items.push({
            type: 'error',
            skillName: '-',
            message: rawStderr.trim(),
        });
        success = false;
    }
    return {
        mode,
        success,
        directory,
        items,
        repoWarnings,
        summary,
        tag,
        rawText: rawStdout.trim() || rawStderr.trim(),
    };
}
/**
 * Skill Publish 结构化 Markdown 渲染器
 * 将体检报告、自动修复明细与正式发布结果转化为紧凑、清晰的表格与指引
 */
export function renderSkillPublishMarkdown(report) {
    if (!report)
        return '无返回内容';
    if (report.status === 'AWAITING_CONFIRMATION') {
        return [
            `> ### ${report.warning || '⚠️ 操作确认拦截'}`,
            `> - **影响评估**: ${report.impact || ''}`,
            `> - **确认指引**: ${report.requiredAction || ''}`,
        ].join('\n');
    }
    const sections = [];
    const dirHint = report.directory ? ` (目录: \`${report.directory}\`)` : '';
    if (report.mode === 'dry-run') {
        const errorCount = report.items.filter(i => i.type === 'error').length;
        const warningCount = report.items.filter(i => i.type === 'warning').length;
        if (report.success && errorCount === 0) {
            sections.push(`### ✅ Agent Skills 合规校验通过！${dirHint}\n`);
            sections.push('受检 Skill 均符合 agentskills.io 规范（命名规范、目录匹配、必需 frontmatter 字段均通过）。');
            if (warningCount > 0) {
                sections.push(`\n**建议优化项 (${warningCount} 项):**`);
            }
        }
        else {
            sections.push(`### ⚠️ Agent Skills 校验发现问题 (${errorCount} 项错误${warningCount > 0 ? `，${warningCount} 项警告` : ''})${dirHint}\n`);
        }
        if (report.items.length > 0) {
            const rows = report.items.map(item => {
                let badge = 'ℹ️ 提示';
                if (item.type === 'error')
                    badge = '❌ 错误';
                else if (item.type === 'warning')
                    badge = '⚠️ 建议';
                else if (item.type === 'fixed')
                    badge = '🛠️ 已修复';
                return `| ${badge} | \`${sanitizeCell(item.skillName, 30)}\` | ${sanitizeCell(item.message, 80)} |`;
            });
            sections.push('| 级别 | Skill 名称 | 问题详情与指引 |\n| :--- | :--- | :--- |\n' + rows.join('\n'));
        }
        if (report.repoWarnings && report.repoWarnings.length > 0) {
            sections.push('\n**仓库策略提醒:**\n' + report.repoWarnings.map(w => `- 💡 ${w}`).join('\n'));
        }
        if (report.success && errorCount === 0) {
            sections.push('\n> 💡 **正式发版指引**: 若需创建 GitHub Release 正式发布技能，请指定版本 Tag 并附带 `confirm: true`：\n> `github_skill(action: "publish", tag: "v1.0.0", dry_run: false, confirm: true)`');
        }
        else {
            sections.push('\n> 🔍 **修复提示**: 若存在安装元数据残留，可先调用 `github_skill(action: "publish", fix: true)` 自动剥离清洗。');
        }
    }
    else if (report.mode === 'fix') {
        const fixedItems = report.items.filter(i => i.type === 'fixed');
        sections.push(`### 🛠️ Agent Skills 元数据自动修复${report.success ? '完成' : '结果'}${dirHint}\n`);
        if (fixedItems.length > 0) {
            sections.push(`已自动清洗 **${fixedItems.length}** 处技能文件中的安装残留元数据（如 \`metadata.github-*\`）：\n`);
            const rows = fixedItems.map(item => `| \`${sanitizeCell(item.skillName, 30)}\` | ${sanitizeCell(item.message, 80)} |`);
            sections.push('| Skill 名称 | 修复操作 |\n| :--- | :--- |\n' + rows.join('\n'));
            sections.push('\n> 📌 **后续步骤**: 请使用 `git diff` 审查本地文件变更，提交 Git 后再重新运行合规体检或发布。');
        }
        else {
            sections.push(report.summary || '未检测到需要修复的元数据残留。');
        }
    }
    else if (report.mode === 'publish') {
        if (report.success) {
            sections.push(`### 🚀 Agent Skill 发布成功！${dirHint}\n`);
            sections.push(`- **版本 Tag**: \`${report.tag || '-'}\``);
            sections.push('- **发布状态**: 已自动附加 `agent-skills` 仓库 Topic，并创建了关联 GitHub Release。');
            if (report.summary)
                sections.push(`\n${report.summary}`);
        }
        else {
            sections.push(`### ❌ Agent Skill 发布失败${dirHint}\n`);
            if (report.summary)
                sections.push(`- **原因**: ${report.summary}`);
            if (report.items.length > 0) {
                const rows = report.items.map(item => `| ${item.type} | \`${sanitizeCell(item.skillName, 30)}\` | ${sanitizeCell(item.message, 80)} |`);
                sections.push('\n| 级别 | Skill 名称 | 详情 |\n| :--- | :--- | :--- |\n' + rows.join('\n'));
            }
        }
    }
    return sections.join('\n');
}
