import { compareGhVersions } from '../executor.js';
import { renderPrMarkdown } from '../renderers/markdown.js';
import { extractImageUrls, downloadImages, buildImageBlocks, filterRequestedUrls, validateAttachPaths } from './image-utils.js';
function normalizeOutput(data) {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        return data;
    }
    if (Array.isArray(data)) {
        return { items: data, count: data.length };
    }
    return { result: data !== undefined && data !== null ? data : '' };
}
// 共享图片工具链的同名再导出：保持路径与单测稳定
export { extractImageUrls as extractPrImageUrls, validateAttachPaths } from './image-utils.js';
export function createPrTool(executor) {
    return {
        name: 'github_pr',
        description: '管理与审查 GitHub Pull Request (PR)。支持查看列表、详情、差异比对、CI 检查状态、代码审查、合并操作、本地代码检出 (checkout) 与冲突状态检测 (status)。默认针对当前工作区关联的仓库。',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['list', 'view', 'create', 'diff', 'checks', 'review', 'merge', 'checkout', 'status', 'view_images', 'ready', 'revert', 'update_branch', 'comment', 'edit'],
                    description: 'PR 操作类型。view_images 下载正文与评论中的图片到本地；create/edit/comment 支持 attach_images 附件上传；merge/revert 需 confirm: true。',
                },
                pr_number: {
                    type: 'number',
                    description: 'PR 编号（view, diff, checks, review, merge, checkout 时使用；若在 PR 对应分支可不填，自动识别当前分支 PR）。',
                },
                repo: {
                    type: 'string',
                    description: '目标仓库 [owner/repo]，留空则自动识别当前本地 Git 仓库。',
                },
                title: {
                    type: 'string',
                    description: '创建 PR 时的标题。',
                },
                body: {
                    type: 'string',
                    description: '创建 PR 或提交 Review 时的内容描述。',
                },
                base: {
                    type: 'string',
                    description: '目标基准分支（默认主分支，如 main）。',
                },
                head: {
                    type: 'string',
                    description: '源分支，跨 fork 提 PR 时必填，格式 forkOwner:branch（如 ItQianChen:fix-bug）；同仓库分支可直接写分支名。',
                },
                draft: {
                    type: 'boolean',
                    description: '是否创建为草稿 PR。',
                },
                review_decision: {
                    type: 'string',
                    enum: ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'],
                    description: '代码审查意见判定（review 操作时使用）。',
                },
                merge_method: {
                    type: 'string',
                    enum: ['merge', 'squash', 'rebase'],
                    description: '合并策略（merge 操作时使用，默认 squash）。',
                },
                delete_branch: {
                    type: 'boolean',
                    description: '合并后是否删除源分支（仅 merge 动作生效，默认 false）。gh pr revert 没有该 flag，传了也不会生效。删除分支不可撤销，只在确认该分支已无用后再开启。',
                },
                undo: {
                    type: 'boolean',
                    description: 'ready 动作可选：反向操作，把 PR 转回 Draft（gh 原生 --undo）。',
                },
                state: {
                    type: 'string',
                    enum: ['open', 'closed', 'merged', 'all'],
                    description: 'PR 状态过滤（list 操作时使用，可选 open, closed, merged, all，默认 open）。',
                },
                limit: {
                    type: 'number',
                    description: '返回 PR 数量上限（list 操作时使用，默认 20，建议最大不超过 100）。',
                },
                author: {
                    type: 'string',
                    description: '按作者筛选（list 动作使用，支持 "@me" 或 GitHub 用户名）。',
                },
                stat_only: {
                    type: 'boolean',
                    description: '是否仅输出文件变动概览（diff 动作使用，改走 gh pr view --json files，防止大 PR 爆 Token）。',
                },
                confirm: {
                    type: 'boolean',
                    description: '高危破坏性操作确认标志（merge 动作或 delete_branch 时必需）。若为 false 则仅输出合并预演警告。',
                },
                dry_run: {
                    type: 'boolean',
                    description: '是否只预演不真正创建（create 操作时使用，默认 false）。透传 gh --dry-run：打印将要创建的 PR 详情而不落库，用于提交前确认 head/base/title 是否正确。',
                },
                image_urls: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'view_images 可选：仅下载指定 URL 的图片（从 view 返回的 images 清单中选取，不在清单内的会被拒绝）。留空下载全部（正文+评论）。',
                },
                attach_images: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '本地图片/附件路径列表（create, edit, comment 动作使用，需 gh ≥ 2.99；禁止 URL，单批上限 50 个）。',
                },
            },
            required: ['action'],
        },
        output: {
            schema: { type: 'object' },
            render(args, value) {
                return [{ type: 'text', text: renderPrMarkdown(args, value) }, ...buildImageBlocks(value)];
            },
        },
        async execute(args, execContext) {
            const cwd = execContext?.cwd || process.cwd();
            const sessionId = execContext?.sessionId || execContext?.session?.id || process.env.DSH_SESSION_ID;
            let repoTarget = args.repo;
            if (!repoTarget) {
                const meta = await executor.getRepoMetadata(cwd, sessionId);
                if (meta?.nameWithOwner) {
                    repoTarget = meta.nameWithOwner;
                }
            }
            if (!repoTarget) {
                throw new Error('未能自动识别当前工作区关联的 GitHub 仓库。请通过 `repo` 参数显式指定目标仓库 [owner/repo]（例如: "ItQianChen/dsh-github-flow"），或在当前工作区目录下关联 Git 远程仓库。');
            }
            const repoArgs = ['-R', repoTarget];
            const runOpts = { cwd, sessionId };
            const appendAttachFlags = async (cmd, attachImages) => {
                const attachPaths = validateAttachPaths(attachImages, cwd);
                if (attachPaths.length > 0) {
                    const version = await executor.getGhVersion();
                    if (version && compareGhVersions(version, '2.99.0') < 0) {
                        throw new Error(`附件上传能力 (\`--attach\`) 需要 GitHub CLI 版本 ≥ 2.99.0，当前版本为: ${version}。\n请升级 gh（Windows: \`winget upgrade GitHub.cli\`，macOS: \`brew upgrade gh\`）后再试。`);
                    }
                    for (const p of attachPaths) {
                        cmd.push('--attach', p);
                    }
                }
            };
            switch (args.action) {
                case 'list': {
                    const listCmd = ['pr', 'list', ...repoArgs, '--json', 'number,title,author,headRefName,isDraft,state,updatedAt,mergedAt,url'];
                    if (args.state) {
                        listCmd.push('--state', args.state);
                    }
                    if (args.author) {
                        listCmd.push('--author', args.author);
                    }
                    // 显式 limit 优先；缺省回退 executor.defaultListLimit（用户可在插件配置中调整）
                    const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(args.limit, 100) : Math.min(executor.defaultListLimit ?? 20, 100);
                    listCmd.push('-L', String(limit));
                    const res = await executor.run(listCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return normalizeOutput(res.data || res.rawOutput);
                }
                case 'view': {
                    const target = args.pr_number ? [String(args.pr_number)] : [];
                    const res = await executor.run(['pr', 'view', ...target, ...repoArgs, '--json', 'number,title,body,state,author,labels,assignees,reviewDecision,mergeable,statusCheckRollup,url,comments'], runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    const out = normalizeOutput(res.data || res.rawOutput);
                    // 附带图片 URL 清单（正文+评论，与 view_images 提取范围同源）：
                    // Agent 按正文里的原始 URL 决策，需要看图时用 image_urls 精准选取
                    const bodies = [typeof out.body === 'string' ? out.body : ''];
                    if (Array.isArray(out.comments)) {
                        for (const c of out.comments) {
                            if (c && typeof c.body === 'string')
                                bodies.push(c.body);
                        }
                    }
                    out.images = Array.from(new Set(bodies.flatMap((b) => extractImageUrls(b))));
                    return out;
                }
                case 'view_images': {
                    if (!args.pr_number)
                        throw new Error('view_images 操作必须提供 pr_number');
                    // PR 与 Issue 图片机制同构；评论走同一 issues-comments API（实测 PR 评论
                    // 的 <img> 形态与 issue 完全一致），正文 + 评论合并提取一次覆盖全部
                    const detail = await executor.run(['pr', 'view', String(args.pr_number), ...repoArgs, '--json', 'body,comments'], runOpts);
                    if (!detail.ok)
                        throw new Error(detail.error);
                    const d = detail.data && typeof detail.data === 'object' ? detail.data : {};
                    const bodies = [];
                    if (typeof d.body === 'string')
                        bodies.push(d.body);
                    if (Array.isArray(d.comments)) {
                        for (const c of d.comments) {
                            if (c && typeof c.body === 'string')
                                bodies.push(c.body);
                        }
                    }
                    // 多来源合并去重（Set 语义由 extractImageUrls 内部保证）
                    const extracted = Array.from(new Set(bodies.flatMap((b) => extractImageUrls(b))));
                    if (extracted.length === 0) {
                        return { message: `PR #${args.pr_number} 正文与评论中未发现图片附件。` };
                    }
                    // 目标选择：不传 image_urls 下载全部；传入则与清单严格交集
                    //（防幻觉/诱导的任意 URL 下载），空数组视为误传明确报错
                    let targets = extracted;
                    const rejections = [];
                    if (args.image_urls !== undefined) {
                        if (!Array.isArray(args.image_urls) || args.image_urls.length === 0) {
                            throw new Error('image_urls 为空数组：如需下载全部请省略该参数，如需指定请传入 view 返回清单中的 URL。');
                        }
                        const filtered = filterRequestedUrls(args.image_urls, extracted);
                        targets = filtered.matched;
                        for (const bad of filtered.rejected) {
                            rejections.push(`${String(bad).slice(-24)}: 不在本 PR 图片清单中，已拒绝（防任意下载）`);
                        }
                    }
                    const { images, failures: dlFailures, remaining } = await downloadImages(targets, (url) => executor.run(['api', url], { ...runOpts, binary: true, timeoutMs: 30_000 }));
                    const failures = [...rejections, ...dlFailures];
                    if (images.length === 0 && rejections.length === 0 && !remaining) {
                        return { message: `PR #${args.pr_number} 的图片全部下载失败：`, failures };
                    }
                    if (images.length === 0) {
                        return { message: `PR #${args.pr_number} 未能获取任何图片（请求 ${targets.length} 张，被拒 ${rejections.length} 张）`, failures, remaining };
                    }
                    return {
                        message: `PR #${args.pr_number} 成功获取 ${images.length} 张图片（正文+评论）${failures.length ? `（${failures.length} 条失败/提示）` : ''}：`,
                        images,
                        failures: failures.length ? failures : undefined,
                        // 续传清单：触顶时 Agent 直接 image_urls: remaining 发起下一批
                        remaining,
                    };
                }
                case 'checks': {
                    const target = args.pr_number ? [String(args.pr_number)] : [];
                    // 字段集为 gh pr checks 的合法九字段子集（v2.50.0 引入 --json 起从未变更）。
                    // 旧字段集的 conclusion/detailsUrl 是 REST API 字段名，pr checks 从未支持——
                    // 初版误搬导致该 action 在所有 gh 版本上必然报 Unknown JSON field（Issue #3）。
                    // bucket 是 state 的分类视图（pass/fail/pending/skipping/cancel），link 即详情页。
                    const res = await executor.run(['pr', 'checks', ...target, ...repoArgs, '--json', 'name,state,bucket,link,workflow,startedAt,completedAt'], runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return normalizeOutput(res.data || res.rawOutput);
                }
                case 'diff': {
                    const target = args.pr_number ? [String(args.pr_number)] : [];
                    // gh pr diff 不提供 --stat（实测 gh 2.96.0 直接 unknown flag / exit 1）。
                    // 文件变更概览的合法来源是 pr view --json files（字段含 path/additions/deletions）。
                    // 返回值保持 { result: string } 形状——renderPrMarkdown 对 result 字符串直出
                    // （src/renderers/pr.ts:15），因此这条路渲染层零改动。
                    if (args.stat_only === true) {
                        const statRes = await executor.run(['pr', 'view', ...target, ...repoArgs, '--json', 'files,additions,deletions'], runOpts);
                        if (!statRes.ok)
                            throw new Error(statRes.error);
                        const detail = statRes.data || {};
                        // executor.run 在输出被 24KB 阈值截断时会跳过 JSON.parse（executor.ts:341），
                        // 此时 data 为空、rawOutput 是被切断的半截 JSON。绝不能把「没解析出来」说成「0 个文件」。
                        if (!Array.isArray(detail.files)) {
                            return {
                                result: '未能解析文件变更清单：gh 输出可能被 24KB 截断阈值切断。请改用 github_pr 的完整 diff 动作，或缩小范围后重试。',
                            };
                        }
                        const rows = detail.files;
                        // 只说是"本次取到的文件"：gh 的 --json files 在超过 100 个文件时静默截断
                        // （cli/cli#12522），不能对外声称是完整清单。
                        const cell = (v) => String(v ?? '').replace(/\|/g, '\\|');
                        const lines = [
                            `本次取到 ${rows.length} 个变更文件（+${detail.additions ?? 0} / -${detail.deletions ?? 0}）`,
                            '',
                            '| 文件 | 增 | 删 |',
                            '| :--- | ---: | ---: |',
                            ...rows.map((f) => `| ${cell(f.path)} | ${f.additions ?? 0} | ${f.deletions ?? 0} |`),
                        ];
                        return { result: lines.join('\n') };
                    }
                    const res = await executor.run(['pr', 'diff', ...target, ...repoArgs], runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return { result: res.rawOutput || '无差异内容' };
                }
                case 'checkout': {
                    if (!args.pr_number)
                        throw new Error('checkout 操作必须提供 pr_number');
                    const checkoutCmd = ['pr', 'checkout', String(args.pr_number), ...repoArgs, '-f'];
                    const res = await executor.run(checkoutCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return { message: `已成功将 PR #${args.pr_number} 检出至本地分支`, output: res.rawOutput || 'Checked out' };
                }
                case 'status': {
                    const statusCmd = ['pr', 'status', ...repoArgs, '-c', '--json', 'number,title,state,mergeStateStatus,url'];
                    const res = await executor.run(statusCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return normalizeOutput(res.data || res.rawOutput);
                }
                case 'create': {
                    const createCmd = ['pr', 'create', ...repoArgs, '--title', args.title || '', '--body', args.body || ''];
                    if (args.base)
                        createCmd.push('--base', args.base);
                    // 跨 fork 提 PR 必须显式给出 --head（形如 forkOwner:branch）。
                    // 为什么不能省：当 -R 指向的仓库不是当前 origin 时，gh 无法推断拿哪个分支开 PR，
                    // 会逐级回退去问本地 git，最终报出与真实原因无关的 "not a git repository"。
                    if (args.head)
                        createCmd.push('--head', args.head);
                    if (args.draft)
                        createCmd.push('--draft');
                    const dryRun = args.dry_run === true;
                    if (dryRun)
                        createCmd.push('--dry-run');
                    await appendAttachFlags(createCmd, args.attach_images);
                    const res = await executor.run(createCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return dryRun
                        ? { message: 'PR 预演完成（未真正创建）', detail: res.rawOutput }
                        : { message: 'PR 创建成功', url: res.rawOutput };
                }
                case 'review': {
                    if (!args.pr_number)
                        throw new Error('review 操作必须提供 pr_number');
                    const reviewCmd = ['pr', 'review', String(args.pr_number), ...repoArgs];
                    if (args.review_decision === 'APPROVE')
                        reviewCmd.push('--approve');
                    else if (args.review_decision === 'REQUEST_CHANGES')
                        reviewCmd.push('--request-changes');
                    else
                        reviewCmd.push('--comment');
                    if (args.body)
                        reviewCmd.push('--body', args.body);
                    const res = await executor.run(reviewCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return { message: 'Review 提交成功', detail: res.rawOutput };
                }
                case 'merge': {
                    if (!args.pr_number)
                        throw new Error('merge 操作必须提供 pr_number');
                    if (args.confirm !== true) {
                        return {
                            status: 'AWAITING_CONFIRMATION',
                            warning: `⚠️ 高危操作拦截：你即将合并 PR #${args.pr_number}（合并策略: ${args.merge_method || 'squash'}${args.delete_branch ? '，且删除源分支' : ''}）。`,
                            impact: '合并操作将直接向基准分支写入代码并更新远端 PR 状态。',
                            requiredAction: '如确认执行合并，请向用户明确确认并附加 `confirm: true` 重新调用。',
                        };
                    }
                    const method = args.merge_method === 'merge' ? '--merge' : (args.merge_method === 'rebase' ? '--rebase' : '--squash');
                    const mergeCmd = ['pr', 'merge', String(args.pr_number), ...repoArgs, method];
                    // 删分支默认关闭：合并他人仓库的 PR 时删掉源分支是不可撤销的破坏性动作，
                    // 而 gh 默认不删。替用户做掉它违背「可撤销的直接做、不可撤销的先问」。
                    if (args.delete_branch === true)
                        mergeCmd.push('--delete-branch');
                    const res = await executor.run(mergeCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return { message: 'PR 合并完成', output: res.rawOutput };
                }
                // ---- 变更面新增（S3）----
                case 'ready': {
                    if (!args.pr_number)
                        throw new Error('ready 操作必须提供 pr_number');
                    // Draft→Ready；gh 原生支持 --undo 反向（转回 draft），完整可逆，免 confirm
                    const cmd = ['pr', 'ready', String(args.pr_number), ...repoArgs];
                    if (args.undo === true)
                        cmd.push('--undo');
                    const res = await executor.run(cmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return { message: `PR #${args.pr_number} 已${args.undo === true ? '转回 Draft' : '从 Draft 转为 Ready（进入正式评审）'}` };
                }
                case 'revert': {
                    if (!args.pr_number)
                        throw new Error('revert 操作必须提供 pr_number');
                    // revert 在远端创建反向提交与新 PR——虽不碰原 PR，但产生新实体，按 merge 级 confirm（D5）
                    if (args.confirm !== true) {
                        return {
                            status: 'AWAITING_CONFIRMATION',
                            warning: `⚠️ 高危操作拦截：你即将对 PR #${args.pr_number} 创建反向提交（revert）。`,
                            impact: '将在远端创建反向提交并生成新的 revert PR——这是新增远端实体，不是本地操作。',
                            requiredAction: '如确认执行，请向用户明确确认并附加 `confirm: true` 重新调用。',
                        };
                    }
                    const revertCmd = ['pr', 'revert', String(args.pr_number), ...repoArgs];
                    // 注意：gh pr revert 没有 --delete-branch（实测 2.96.0 unknown flag），
                    // 不在这里推该 flag；删分支只在 merge 通道支持。
                    const res = await executor.run(revertCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return { message: `PR #${args.pr_number} 的反向提交已创建`, url: res.rawOutput };
                }
                case 'update_branch': {
                    if (!args.pr_number)
                        throw new Error('update_branch 操作必须提供 pr_number');
                    // 等价 repo sync 的单 PR 版（push merge commit 到 PR 分支）；恰是「分支落后」
                    // 的自愈动作，confirm 摩擦会阻碍 Agent 自愈闭环（D6），输出同步摘要即可
                    const res = await executor.run(['pr', 'update-branch', String(args.pr_number), ...repoArgs], runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return { message: `PR #${args.pr_number} 分支已从基准分支同步更新`, output: res.rawOutput };
                }
                case 'comment': {
                    if (!args.pr_number || !args.body)
                        throw new Error('comment 必须提供 pr_number 和 body');
                    const commentCmd = ['pr', 'comment', String(args.pr_number), ...repoArgs, '--body', args.body];
                    await appendAttachFlags(commentCmd, args.attach_images);
                    const res = await executor.run(commentCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return { message: 'PR 评论发布成功', output: res.rawOutput };
                }
                case 'edit': {
                    if (!args.pr_number)
                        throw new Error('edit 操作必须提供 pr_number');
                    const editCmd = ['pr', 'edit', String(args.pr_number), ...repoArgs];
                    if (args.title)
                        editCmd.push('--title', args.title);
                    if (args.body)
                        editCmd.push('--body', args.body);
                    await appendAttachFlags(editCmd, args.attach_images);
                    const res = await executor.run(editCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return { message: `PR #${args.pr_number} 更新成功`, output: res.rawOutput };
                }
                default:
                    throw new Error(`未知的 PR 操作: ${args.action}`);
            }
        },
    };
}
