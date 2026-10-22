/**
 * `github_task`：任务级原语（s8）。
 *
 * 为什么需要它：现有 18 个工具是**动词表**（list / view / diff / checks / review…），
 * 而用户真正说的是**任务**（"帮我审一下这个 PR" / "CI 为什么挂" / "该发什么版本"）。
 * 一个任务要 Agent 自己串 5–10 个动词，每一步都可能选错参数。
 *
 * 三条纪律（写在最前面，因为它们是这个工具能存在的前提）：
 * 1. **不自己拼 gh 命令**：全部经 executor 与既有工具函数，`phase34` 的 argv 契约网
 *    因此能覆盖到这里的每一次调用；
 * 2. **默认零写回**：三个原语里只有 `review_pr` 会写远端，且必须 `write: true` +
 *    `confirm: true` 双门（闸门见 `destructive.ts` 的 `github_task` 段）；
 * 3. **任何裁剪都显式**：装不下就写进 `truncated`，并区分「裁了多少」与「连总数都不知道」。
 */
import { wrapWithGate } from '../destructive.js';
import { readReviewRules } from '../review-rules.js';
import { extractFailureAnchors } from '../executor/failure-anchors.js';
import { renderTaskMarkdown } from '../renderers/markdown.js';
import { classifyCommits, extractFileAnchors, finalizeEnvelope, renderReleaseNotes, selectFilesByBudget, suggestVersion, } from '../task-primitives.js';
/**
 * 把 `pr checks` 的 bucket/state 归并成四态计数。
 *
 * 为什么是四态而不是三态：gh 的 bucket 有 `skipping` / `cancel` 两个值，
 * 把它们算进 pass 会让结论显示「CI 全绿」——而实际是「跳过/取消」，两者对
 * 「这个 PR 能不能合」的含义完全不同。宁可多一个 ⏭ 计数，也不能谎报绿。
 */
function summarizeChecks(items) {
    let pass = 0;
    let fail = 0;
    let pending = 0;
    let skipped = 0;
    const failing = [];
    const FAIL_STATES = new Set(['FAILURE', 'ERROR', 'TIMED_OUT', 'ACTION_REQUIRED']);
    const PENDING_STATES = new Set(['PENDING', 'IN_PROGRESS', 'QUEUED', 'WAITING', 'REQUESTED', 'EXPECTED']);
    const SKIP_STATES = new Set(['SKIPPED', 'CANCELLED', 'NEUTRAL', 'STALE']);
    for (const it of Array.isArray(items) ? items : []) {
        const bucket = String(it?.bucket || '').toLowerCase();
        const state = String(it?.state || '').toUpperCase();
        if (bucket === 'fail' || FAIL_STATES.has(state)) {
            fail++;
            if (it?.name)
                failing.push(String(it.name));
        }
        else if (bucket === 'pending' || PENDING_STATES.has(state)) {
            pending++;
        }
        else if (bucket === 'skipping' || bucket === 'cancel' || SKIP_STATES.has(state)) {
            skipped++;
        }
        else {
            pass++;
        }
    }
    return { pass, fail, pending, skipped, failing };
}
export function createTaskTool(executor) {
    return wrapWithGate({
        name: 'github_task',
        description: '任务级原语：一次调用完成「审一个 PR」「诊断一次 CI 失败」「准备一次发版」三件事，返回已裁剪、可直接执行的结构化结论（summary + facts + nextActions + cost）。默认只读；只有 review_pr 在 write:true 且 confirm:true 时才写回行级评注。需要细粒度控制时请改用对应的原子工具（github_pr / github_run / github_release）。',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['review_pr', 'diagnose_ci', 'prepare_release'],
                    description: '任务类型。review_pr=读 PR 元数据/diff/CI/仓库规则并给出审阅上下文包（可选写回行级评注）；diagnose_ci=定位失败 job/step 并萃取日志锚点；prepare_release=按 Conventional Commits 推导版本并生成 notes 草稿（只准备，不发版）。',
                },
                pr_number: {
                    type: 'number',
                    description: 'PR 编号（review_pr 必填；diagnose_ci 可选，给了就取该 PR 的失败 run）。',
                },
                run_id: {
                    type: 'number',
                    description: 'Actions run id（diagnose_ci 使用；与 pr_number 二选一，同时给时以 run_id 为准）。',
                },
                repo: {
                    type: 'string',
                    description: '目标仓库 [owner/repo]，留空自动识别当前本地 Git 仓库。',
                },
                focus: {
                    type: 'string',
                    enum: ['security', 'correctness', 'perf', 'style'],
                    description: 'review_pr 的审阅侧重，仅影响 summary 的提示语与 nextActions，不改变取数。',
                },
                budget_chars: {
                    type: 'number',
                    description: 'review_pr 的 diff 预算（字符，默认 24000）。超出预算的文件只保留元信息并计入 truncated。',
                },
                write: {
                    type: 'boolean',
                    description: 'review_pr：是否真的写回 review（默认 false=只读）。为 true 时必须同时传 confirm: true。',
                },
                body: {
                    type: 'string',
                    description: 'review_pr 写回时的整体说明（缺省会被补 [P2] 严重度前缀）。',
                },
                comments: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            path: { type: 'string' },
                            line: { type: 'number' },
                            side: { type: 'string', enum: ['LEFT', 'RIGHT'] },
                            start_line: { type: 'number' },
                            body: { type: 'string' },
                        },
                        required: ['path', 'body'],
                    },
                    description: 'review_pr 写回时的行级评注列表（上限 50 条），字段语义与 github_pr(action:"review") 的 comments 完全一致。',
                },
                review_decision: {
                    type: 'string',
                    enum: ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'],
                    description: 'review_pr 写回时的判定，默认 COMMENT。',
                },
                framework: {
                    type: 'string',
                    enum: ['jest', 'vitest', 'go', 'cargo', 'auto'],
                    description: 'diagnose_ci 的框架提示。当前萃取器按日志锚点自适应（auto 即可），该参数用于在 summary 中标注预期。',
                },
                from_tag: {
                    type: 'string',
                    description: 'prepare_release 的起始 tag，缺省取最近一个 tag（没有 tag 时统计全部提交）。',
                },
                bump: {
                    type: 'string',
                    enum: ['auto', 'patch', 'minor', 'major'],
                    description: 'prepare_release 的版本递增规则，auto 时按 breaking→major / feat→minor / 其余→patch 推导。',
                },
                draft: {
                    type: 'boolean',
                    description: 'prepare_release：建议的发布命令是否带 --draft（默认 true）。本原语不会真的发版。',
                },
            },
            required: ['action'],
        },
        output: {
            schema: { type: 'object' },
            render(args, value) {
                return [{ type: 'text', text: renderTaskMarkdown(args, value) }];
            },
        },
        async execute(args, execContext) {
            const { cwd, sessionId } = executor.resolveExecScope(execContext);
            const startedAt = Date.now();
            // 只增计数器 → 取差值即本原语真实的 gh 调用数（不手写、不估算）
            const ghCallsBefore = typeof executor.ghCalls === 'number' ? executor.ghCalls : 0;
            const costMeta = () => ({
                ghCalls: (typeof executor.ghCalls === 'number' ? executor.ghCalls : 0) - ghCallsBefore,
                elapsedMs: Date.now() - startedAt,
            });
            let repoTarget = args.repo;
            if (!repoTarget) {
                const meta = await executor.getRepoMetadata(cwd, sessionId);
                if (meta?.nameWithOwner)
                    repoTarget = meta.nameWithOwner;
            }
            const repoArgs = repoTarget ? ['-R', repoTarget] : [];
            const runOpts = { cwd, sessionId };
            // ---------------------------------------------------------------- review_pr
            if (args.action === 'review_pr') {
                const prNumber = Number(args.pr_number);
                if (!prNumber || !Number.isInteger(prNumber) || prNumber <= 0) {
                    throw new Error('review_pr 需要有效的 pr_number（正整数）');
                }
                const budget = typeof args.budget_chars === 'number' && args.budget_chars > 0 ? args.budget_chars : 24_000;
                // 一次拿齐元数据 + diff + 既有行级评论（getPrDetail 内部 3 路并发）
                const detail = await executor.getPrDetail(cwd, prNumber, repoTarget);
                if (!detail.ok || !detail.data)
                    throw new Error(detail.error || `读取 PR #${prNumber} 失败`);
                const d = detail.data;
                const checksRes = await executor.run(['pr', 'checks', String(prNumber), ...repoArgs, '--json', 'name,state,bucket,link'], { ...runOpts, timeoutMs: 15_000 });
                // checks 失败不算致命：有的仓库没有 check，或 token 无 checks 读权限
                const checks = summarizeChecks(checksRes.ok && Array.isArray(checksRes.data) ? checksRes.data : []);
                const rules = readReviewRules(cwd, d.files.map((f) => f.path));
                const allFiles = d.files.map((f) => ({
                    path: f.path,
                    additions: f.additions,
                    deletions: f.deletions,
                    patch: d.fileDiffs?.[f.path],
                }));
                /*
                 * 预算口径 = **整包**，不是「只算 diff」。
                 *
                 * 为什么：原语的存在意义是「别把上下文撑爆」，如果只约束 diff 而让
                 * summary/facts/nextActions 的固定开销把总量顶到预算之上，那这条约束就是假的
                 * （实测 61 文件 PR：diff 按 24K 选完，整包 28.8K，反而超了 4.8K）。
                 * 所以先按预算选一次，量出整包体积；超了就按超出量回缩再选一次（一次收敛即可）。
                 */
                const buildEnvelope = (budgetUsed) => {
                    const budgeted = selectFilesByBudget(allFiles, budgetUsed);
                    const truncatedFields = [];
                    if (budgeted.omitted > 0)
                        truncatedFields.push('files[].patch');
                    if (d.filesTruncated)
                        truncatedFields.push('files（gh 100 条上限）');
                    if (d.diffTruncated)
                        truncatedFields.push('fileDiffs（输出阈值）');
                    const facts = {
                        pr: prNumber,
                        title: d.title,
                        sha: d.headRefOid,
                        baseSha: d.baseRefOid,
                        changedFiles: d.changedFiles ?? d.files.length,
                        filesTruncated: d.filesTruncated === true,
                        files: budgeted.selected,
                        checks,
                        rules: rules ? { sources: rules.sources.map((s) => ({ path: s.path, content: s.content })), truncated: rules.truncated } : null,
                        existingLineComments: Array.isArray(d.lineComments) ? d.lineComments.length : 0,
                    };
                    const summaryBits = [
                        `PR #${prNumber}「${d.title}」`,
                        `锚点 ${String(d.headRefOid || '').slice(0, 7) || '(无 SHA)'}`,
                        `改动 ${d.changedFiles ?? d.files.length} 文件 (+${d.additions}/-${d.deletions})`,
                        `CI ✅${checks.pass} ❌${checks.fail} ⏳${checks.pending}${checks.skipped > 0 ? ` ⏭${checks.skipped}` : ''}`,
                        `已附 ${budgeted.selected.filter((f) => f.patch).length} 个文件的 diff`,
                    ];
                    if (rules)
                        summaryBits.push(`仓库规则 ${rules.sources.length} 份`);
                    const focusHint = args.focus === 'security'
                        ? '重点看权限校验、输入边界与密钥处理。'
                        : args.focus === 'correctness'
                            ? '重点看分支条件、错误路径与并发。'
                            : args.focus === 'perf'
                                ? '重点看循环内的重复 IO、无界集合与缓存失效。'
                                : args.focus === 'style'
                                    ? '重点看命名、注释与一致性。'
                                    : '';
                    const summary = summaryBits.join('；') + (focusHint ? `\n${focusHint}` : '');
                    const nextActions = [
                        `github_pr(action:"checks", pr_number:${prNumber}) — 逐条看 CI 结论`,
                        `github_pr(action:"diff", pr_number:${prNumber}, stat_only:true) — 全量文件清单`,
                        `github_pr(action:"review", pr_number:${prNumber}, comments:[…], confirm:true) — 写回行级评注`,
                    ];
                    if (checks.failing.length > 0) {
                        nextActions.unshift(`github_task(action:"diagnose_ci", pr_number:${prNumber}) — 先解释失败项：${checks.failing.slice(0, 3).join('、')}`);
                    }
                    return {
                        facts,
                        envelope: finalizeEnvelope(summary, facts, nextActions, {
                            ...costMeta(),
                            ...(truncatedFields.length > 0
                                ? {
                                    truncated: {
                                        fields: truncatedFields,
                                        reason: `结论包预算 ${budget} 字符；未包含的文件可能只有元信息，也可能整条省略（条目上限 40）`,
                                        totalUnknown: false,
                                    },
                                }
                                : {}),
                        }),
                    };
                };
                let built = buildEnvelope(budget);
                /*
                 * 整包超预算 → 按超出量回缩，最多两轮。
                 *
                 * 为什么可能不止一轮：条目元信息本身也是体积（已由 maxEntries=40 封顶，
                 * 但 summary/facts/nextActions 的固定开销仍随 PR 大小浮动）。两轮足够收敛，
                 * 再多就是拿精度换死磕——真要更小，调用方该自己传更小的 budget_chars。
                 */
                for (let round = 0; round < 2 && built.envelope.cost.chars > budget && budget > 2_000; round++) {
                    const shrink = Math.max(1_500, budget - (built.envelope.cost.chars - budget) - 500);
                    if (shrink >= budget)
                        break;
                    built = buildEnvelope(shrink);
                }
                const envelope = built.envelope;
                // 写回：只有显式 write + confirm（闸门已在 wrapWithGate 里挡过一次）才执行
                if (args.write === true) {
                    const res = await executor.createPrReview(cwd, repoTarget, prNumber, {
                        event: args.review_decision,
                        body: args.body,
                        comments: Array.isArray(args.comments) ? args.comments : [],
                        commit_id: d.headRefOid,
                    });
                    if (!res.ok)
                        throw new Error(res.error || 'Review 写回失败');
                    const writeEnvelope = finalizeEnvelope(`${envelope.summary}\n\n✅ 已写回 Review${res.degraded ? '（行级评注降级为正文）' : ''}：${res.data?.htmlUrl || ''}`, { ...built.facts, written: { htmlUrl: res.data?.htmlUrl, state: res.data?.state, degraded: res.degraded === true } }, [`github_pr(action:"view", pr_number:${prNumber}) — 复核已写入的内容`], { ...costMeta(), ...(envelope.truncated ? { truncated: envelope.truncated } : {}) });
                    return { ...writeEnvelope, degraded: res.degraded === true, degradedReason: res.degradedReason };
                }
                return envelope;
            }
            // ---------------------------------------------------------------- diagnose_ci
            if (args.action === 'diagnose_ci') {
                let runId = Number(args.run_id);
                let fromPr = null;
                if ((!runId || !Number.isInteger(runId)) && args.pr_number) {
                    fromPr = Number(args.pr_number);
                    const checksRes = await executor.run(['pr', 'checks', String(fromPr), ...repoArgs, '--json', 'name,state,bucket,link'], { ...runOpts, timeoutMs: 15_000 });
                    if (!checksRes.ok || !Array.isArray(checksRes.data)) {
                        throw new Error(checksRes.error || `读取 PR #${fromPr} 的 checks 失败`);
                    }
                    // 从 check 的 link 里抠 run id：`https://github.com/o/r/actions/runs/123/job/456`
                    for (const it of checksRes.data) {
                        const m = /\/runs\/(\d+)/.exec(String(it?.link || ''));
                        if (m) {
                            runId = Number(m[1]);
                            break;
                        }
                    }
                    if (!runId)
                        throw new Error(`PR #${fromPr} 的 checks 里没有可解析的 Actions run（可能是第三方 CI）`);
                }
                if (!runId || !Number.isInteger(runId) || runId <= 0) {
                    throw new Error('diagnose_ci 需要 run_id 或 pr_number 之一');
                }
                const viewRes = await executor.run(['run', 'view', String(runId), ...repoArgs, '--json', 'databaseId,name,status,conclusion,jobs,url'], { ...runOpts, timeoutMs: 20_000 });
                if (!viewRes.ok || !viewRes.data)
                    throw new Error(viewRes.error || `读取 run #${runId} 失败`);
                const run = viewRes.data;
                const jobs = Array.isArray(run.jobs) ? run.jobs : [];
                const failedJobs = jobs
                    .filter((j) => String(j?.conclusion || '').toLowerCase() === 'failure')
                    .map((j) => ({
                    name: String(j?.name || '(未命名)'),
                    conclusion: String(j?.conclusion || ''),
                    jobId: Number(j?.databaseId) || undefined,
                    steps: Array.isArray(j?.steps)
                        ? j.steps.filter((s) => String(s?.conclusion || '').toLowerCase() === 'failure').map((s) => String(s?.name || ''))
                        : [],
                }));
                // 日志：与 log_failed 同口径放开预算（否则截断发生在萃取之前）
                const logRes = await executor.run(['run', 'view', String(runId), ...repoArgs, '--log-failed'], { ...runOpts, timeoutMs: 60_000, rawText: true, maxOutputChars: 2_000_000, maxOutputBytes: 8 * 1024 * 1024 });
                const rawLog = logRes.ok ? String(logRes.rawOutput || '') : '';
                const anchored = extractFailureAnchors(rawLog);
                const excerpts = anchored.blocks.slice(0, 8).map((b) => {
                    const hit = extractFileAnchors(b.text)[0];
                    const anchorLine = b.text.split('\n')[0] || '';
                    return {
                        file: hit ? hit.file : '(日志)',
                        line: hit ? hit.line : b.startLine,
                        message: anchorLine.replace(/\s+/g, ' ').trim().slice(0, 300),
                    };
                });
                const suspectedFiles = Array.from(new Set(excerpts.map((e) => e.file).filter((f) => f && f !== '(日志)'))).slice(0, 10);
                const summary = [
                    `run #${runId}「${run.name || ''}」${run.conclusion || run.status || ''}`,
                    `失败任务 ${failedJobs.length} 个`,
                    // 日志拉取失败与「没有锚点」是两件事：前者是取数问题，后者是内容问题
                    !logRes.ok
                        ? `日志拉取失败：${String(logRes.error || '').slice(0, 80)}`
                        : anchored.blocks.length > 0
                            ? `萃取 ${anchored.blocks.length} 个失败锚点`
                            : '未匹配到框架锚点（已回退尾部 200 行）',
                    suspectedFiles.length > 0 ? `疑似文件 ${suspectedFiles.slice(0, 3).join('、')}` : '',
                ]
                    .filter(Boolean)
                    .join('；');
                const nextActions = [
                    `github_run(action:"log_failed", run_id:${runId}) — 看完整失败日志`,
                    `github_run(action:"view", run_id:${runId}) — 看 job/step 状态`,
                ];
                if (fromPr)
                    nextActions.push(`github_pr(action:"checks", pr_number:${fromPr}) — 看该 PR 的 CI 汇总`);
                const truncated = logRes.ok && logRes.truncated
                    ? {
                        fields: ['log'],
                        reason: '日志体量超出输出上限（2MB 字符 / 8MB 字节）',
                        // 被裁掉的日志里可能还有别的失败块，所以「总数未知」
                        totalUnknown: true,
                    }
                    : anchored.droppedBlocks > 0
                        ? {
                            fields: ['excerpts'],
                            reason: `仅保留前 ${anchored.blocks.length} 个失败块`,
                            totalUnknown: false,
                        }
                        : undefined;
                return finalizeEnvelope(summary, {
                    runId,
                    name: run.name || '',
                    status: run.status || '',
                    conclusion: run.conclusion || '',
                    url: run.url || '',
                    failedJobs,
                    excerpts,
                    suspectedFiles,
                    framework: args.framework || 'auto',
                    totalBlocks: anchored.totalBlocks,
                    // 日志拉取失败时明确记下来：否则「没锚点」会被误读成「没有失败」
                    ...(logRes.ok ? {} : { logError: String(logRes.error || '').slice(0, 300) }),
                }, nextActions, { ...costMeta(), ...(truncated ? { truncated } : {}) });
            }
            // ---------------------------------------------------------------- prepare_release
            if (args.action === 'prepare_release') {
                // from_tag 必须透传进 range 计算——只当「版本号基数」会让统计区间与标签对不上
                const inputs = await executor.getReleaseInputs(cwd, typeof args.from_tag === 'string' ? args.from_tag : undefined);
                if (!inputs.ok)
                    throw new Error(inputs.error || '读取提交记录失败');
                const fromTag = inputs.fromTag;
                // 正文一起参与归类：BREAKING CHANGE 常写在 body 里，只看标题会漏判 major
                const groups = classifyCommits(inputs.commits.map((c) => c.subject), inputs.commits.map((c) => c.body || ''));
                const suggestion = suggestVersion(fromTag, groups, args.bump || 'auto');
                const notes = renderReleaseNotes(suggestion.version, groups);
                // 体检：本地状态（零 gh 调用）+ 最新 CI 结论（1 次 gh 调用）
                const local = await executor.getLocalGitStatus(cwd);
                const branch = local?.branch || '';
                let ciGreen = null;
                if (branch) {
                    const ciRes = await executor.run(['run', 'list', ...repoArgs, '--branch', branch, '--limit', '1', '--json', 'conclusion,status,url'], { ...runOpts, timeoutMs: 15_000 });
                    if (ciRes.ok && Array.isArray(ciRes.data) && ciRes.data.length > 0) {
                        const c = String(ciRes.data[0]?.conclusion || '').toLowerCase();
                        ciGreen = c === 'success' ? true : c === 'failure' ? false : null;
                    }
                }
                const health = {
                    clean: (local?.dirtyCount ?? 0) === 0,
                    synced: (local?.behind ?? 0) <= 0,
                    ciGreen,
                    branch,
                };
                const draftFlag = args.draft === false ? '' : ' --draft';
                const nextActions = [
                    `git tag v${suggestion.version} && git push origin v${suggestion.version} — 打 tag（人的决定）`,
                    `gh release create v${suggestion.version}${draftFlag} --notes-file <notes.md> — 创建 Release`,
                    `github_release(action:"create", tag:"v${suggestion.version}", draft:${args.draft === false ? 'false' : 'true'}, confirm:true) — 用工具发版`,
                ];
                if (!health.clean)
                    nextActions.unshift('先提交或 stash 未提交变更（发版前工作区必须干净）');
                if (!health.synced)
                    nextActions.unshift('先 git pull 同步远端（本地落后，发出去的 tag 会漏提交）');
                if (health.ciGreen === false)
                    nextActions.unshift('最新 CI 是红的，先修再发版');
                const summary = [
                    `自 ${fromTag || '(无 tag)'} 以来 ${inputs.totalCommits} 个提交`,
                    `建议版本 v${suggestion.version}（${suggestion.reason}）`,
                    `体检：工作区${health.clean ? '干净' : '有变更'} / 同步${health.synced ? '正常' : '落后'} / CI ${health.ciGreen === true ? '绿' : health.ciGreen === false ? '红' : '未知'}`,
                ].join('；');
                return finalizeEnvelope(summary, {
                    fromTag: fromTag || null,
                    commitCount: inputs.totalCommits,
                    suggestedVersion: suggestion.version,
                    bump: suggestion.bump,
                    bumpReason: suggestion.reason,
                    groups,
                    health,
                    notes,
                    commits: inputs.commits.slice(0, 20).map((c) => ({ sha: c.sha, subject: c.subject })),
                }, nextActions, {
                    ...costMeta(),
                    ...(inputs.totalCommits > 20
                        ? {
                            truncated: {
                                fields: ['commits'],
                                reason: `只列出前 20 个提交（共 ${inputs.totalCommits} 个），版本推导基于全部提交`,
                                totalUnknown: false,
                            },
                        }
                        : {}),
                });
            }
            throw new Error(`未知的 action: ${String(args.action)}（支持 review_pr / diagnose_ci / prepare_release）`);
        },
    });
}
