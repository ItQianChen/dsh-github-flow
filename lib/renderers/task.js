/**
 * `github_task` 的 Markdown 渲染器。
 *
 * 为什么单独渲染而不是 JSON 直出：原语的返回值是「给模型看的结论包」，
 * 其中 `cost` 与 `truncated` 是审计信息、`facts` 是结构化事实。
 * 直接 JSON.stringify 会把最重要的 `summary` 埋在括号里；
 * 而只渲染 summary 又会丢掉「这次花了多少」——两者都要，但要有主次。
 */
import { appendDegradedNote } from './common.js';
/** 把任意值渲染成紧凑的一行（对象/数组走 JSON，字符串原样） */
function brief(v, max = 120) {
    const text = typeof v === 'string' ? v : JSON.stringify(v);
    const s = String(text ?? '');
    return s.length > max ? s.slice(0, max) + '…' : s;
}
export function renderTaskMarkdown(args, value) {
    if (!value || typeof value !== 'object')
        return String(value ?? '');
    const action = typeof args?.action === 'string' ? args.action : '';
    const lines = [];
    // 闸门拦截载荷必须最先渲染。
    // 为什么：s8 新增 github_task 时漏了这条分支，write:true 但不传 confirm 会被
    // 渲染成「### review_pr 完成」——模型据此向用户汇报「已提交评审」，而实际
    // 一次 gh 调用都没发生（复核报告 C-02）。截断提示同理，都不能被 summary 吞掉。
    if (value.status === 'AWAITING_CONFIRMATION') {
        return [
            `> ### ${value.warning || '⚠️ 高危操作拦截警告'}`,
            `> - **影响评估**: ${value.impact || '该操作将改变远端仓库状态。'}`,
            `> - **确认指引**: ${value.requiredAction || '如确认继续，请向用户核实并在参数中附加 `confirm: true` 重新调用。'}`,
            '> - **副作用**: 已拦截，零 gh 调用。',
        ].join('\n');
    }
    const summary = typeof value.summary === 'string' ? value.summary : '';
    if (summary)
        lines.push(summary);
    else
        lines.push(`### ${action || 'task'} 完成`);
    // 裁剪必须显眼：这是「不要相信你看到的全部」的唯一提示
    const t = value.truncated;
    if (t && typeof t === 'object') {
        lines.push(`\n> ⚠️ 已裁剪字段：${Array.isArray(t.fields) ? t.fields.join('、') : '-'}（${t.reason || '超出预算'}）` +
            (t.totalUnknown ? '\n> ⚠️ 被裁部分连**总数都未知**，不要据此判断「就这些」。' : ''));
    }
    const facts = value.facts && typeof value.facts === 'object' ? value.facts : null;
    if (facts) {
        lines.push('\n**关键事实**');
        if (facts.sha)
            lines.push(`- 审查锚点: \`${facts.sha}\``);
        if (facts.changedFiles !== undefined) {
            lines.push(`- 变动文件: ${facts.files?.length ?? 0} / ${facts.changedFiles}` +
                (facts.filesTruncated ? '（清单被 gh 的 100 条上限截断）' : ''));
        }
        if (facts.checks && typeof facts.checks === 'object') {
            const c = facts.checks;
            lines.push(`- CI: ✅ ${c.pass ?? 0} / ❌ ${c.fail ?? 0} / ⏳ ${c.pending ?? 0}${c.skipped ? ` / ⏭ ${c.skipped}` : ''}`);
        }
        if (Array.isArray(facts.files) && facts.files.length > 0) {
            lines.push('- 已附 diff 的文件:');
            for (const f of facts.files.slice(0, 12)) {
                lines.push(`  - \`${f.path}\` (+${f.additions ?? 0}/-${f.deletions ?? 0})${f.patch ? '' : ' — 仅元信息'}`);
            }
            if (facts.files.length > 12)
                lines.push(`  - …另有 ${facts.files.length - 12} 个`);
        }
        /*
         * diff 正文必须渲染出来。
         *
         * 为什么：`review_pr` 的全部价值就是「让模型看到改动」——只列文件名等于给了目录
         * 不给内容，模型还得再调一次 github_pr(diff) 才能审。预算在服务端已经算过，
         * 这里原样铺开即可（超出预算的文件本来就不带 patch）。
         */
        const withPatch = Array.isArray(facts.files) ? facts.files.filter((f) => typeof f.patch === 'string' && f.patch) : [];
        for (const f of withPatch) {
            lines.push(`\n#### \`${f.path}\` (+${f.additions ?? 0}/-${f.deletions ?? 0})\n\`\`\`diff\n${f.patch}\n\`\`\``);
        }
        if (facts.rules && Array.isArray(facts.rules.sources) && facts.rules.sources.length > 0) {
            lines.push(`- 仓库审查规则: ${facts.rules.sources.map((s) => `\`${s.path}\``).join('、')}`);
        }
        if (Array.isArray(facts.failedJobs) && facts.failedJobs.length > 0) {
            lines.push('- 失败任务:');
            for (const j of facts.failedJobs.slice(0, 8)) {
                lines.push(`  - ${j.name}${j.conclusion ? ` (${j.conclusion})` : ''}${Array.isArray(j.steps) && j.steps.length ? ` — ${j.steps.join(' / ')}` : ''}`);
            }
        }
        if (Array.isArray(facts.excerpts) && facts.excerpts.length > 0) {
            lines.push('- 失败锚点:');
            for (const e of facts.excerpts.slice(0, 8)) {
                lines.push(`  - \`${e.file}:${e.line}\` ${brief(e.message, 160)}`);
            }
        }
        if (Array.isArray(facts.suspectedFiles) && facts.suspectedFiles.length > 0) {
            lines.push(`- 疑似相关文件: ${facts.suspectedFiles.slice(0, 8).map((f) => `\`${f}\``).join('、')}`);
        }
        if (facts.suggestedVersion) {
            lines.push(`- 建议版本: **v${facts.suggestedVersion}**（${facts.bumpReason || ''}）`);
        }
        if (facts.groups && typeof facts.groups === 'object') {
            const g = facts.groups;
            lines.push(`- 提交归类: feat ${g.feat?.length ?? 0} / fix ${g.fix?.length ?? 0} / perf ${g.perf?.length ?? 0} / breaking ${g.breaking?.length ?? 0} / other ${(g.other?.length ?? 0) + (g.refactor?.length ?? 0) + (g.docs?.length ?? 0)}`);
        }
        if (typeof facts.notes === 'string' && facts.notes.trim()) {
            // Release notes 草稿是 prepare_release 的主产物，必须直接可见（而不是藏在 JSON 里）
            lines.push('\n**Release notes 草稿**\n```markdown\n' + facts.notes + '\n```');
        }
        if (facts.health && typeof facts.health === 'object') {
            const h = facts.health;
            lines.push(`- 发版体检: 工作区${h.clean ? '干净' : '**有未提交变更**'} / 同步${h.synced ? '正常' : '**落后远端**'} / CI ${h.ciGreen === true ? '绿' : h.ciGreen === false ? '**红**' : '未知'}`);
        }
    }
    if (Array.isArray(value.nextActions) && value.nextActions.length > 0) {
        lines.push('\n**建议下一步**');
        for (const a of value.nextActions)
            lines.push(`- ${a}`);
    }
    const cost = value.cost;
    if (cost && typeof cost === 'object') {
        lines.push(`\n> cost: ${cost.chars} 字符 · ${cost.ghCalls} 次 gh 调用 · ${cost.elapsedMs}ms`);
    }
    return lines.join('\n') + appendDegradedNote(value);
}
