function normalizeOutput(data) {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        return data;
    }
    if (Array.isArray(data)) {
        return { items: data, count: data.length };
    }
    return { result: data !== undefined && data !== null ? data : '' };
}
export function createPrTool(executor) {
    return {
        name: 'github_pr',
        description: '管理与审查 GitHub Pull Request (PR)。支持查看列表、详情、差异比对、CI 检查状态、代码审查与合并操作。默认针对当前工作区关联的仓库。',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['list', 'view', 'create', 'diff', 'checks', 'review', 'merge'],
                    description: 'PR 操作类型。',
                },
                pr_number: {
                    type: 'number',
                    description: 'PR 编号（view, diff, checks, review, merge 时使用；若在 PR 对应分支可不填，自动识别当前分支 PR）。',
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
            },
            required: ['action'],
        },
        output: {
            schema: { type: 'object' },
            render(args, value) {
                if (!value)
                    return [{ type: 'text', text: '无返回内容' }];
                if (typeof value.result === 'string') {
                    return [{ type: 'text', text: value.result }];
                }
                if (Array.isArray(value.items)) {
                    return [{ type: 'text', text: JSON.stringify(value.items, null, 2) }];
                }
                return [{ type: 'text', text: JSON.stringify(value, null, 2) }];
            },
        },
        async execute(args, execContext) {
            const cwd = execContext?.cwd || process.cwd();
            let repoTarget = args.repo;
            if (!repoTarget) {
                const meta = await executor.getRepoMetadata(cwd);
                if (meta?.nameWithOwner) {
                    repoTarget = meta.nameWithOwner;
                }
            }
            const repoArgs = repoTarget ? ['-R', repoTarget] : [];
            switch (args.action) {
                case 'list': {
                    const res = await executor.run(['pr', 'list', ...repoArgs, '--json', 'number,title,author,headRefName,isDraft,state,updatedAt', '-L', '20'], { cwd });
                    if (!res.ok)
                        throw new Error(res.error);
                    return normalizeOutput(res.data || res.rawOutput);
                }
                case 'view': {
                    const target = args.pr_number ? [String(args.pr_number)] : [];
                    const res = await executor.run(['pr', 'view', ...target, ...repoArgs, '--json', 'number,title,body,state,author,labels,assignees,reviewDecision,mergeable,statusCheckRollup,url'], { cwd });
                    if (!res.ok)
                        throw new Error(res.error);
                    return normalizeOutput(res.data || res.rawOutput);
                }
                case 'checks': {
                    const target = args.pr_number ? [String(args.pr_number)] : [];
                    const res = await executor.run(['pr', 'checks', ...target, ...repoArgs, '--json', 'name,state,conclusion,detailsUrl'], { cwd });
                    if (!res.ok)
                        throw new Error(res.error);
                    return normalizeOutput(res.data || res.rawOutput);
                }
                case 'diff': {
                    const target = args.pr_number ? [String(args.pr_number)] : [];
                    const res = await executor.run(['pr', 'diff', ...target, ...repoArgs], { cwd });
                    if (!res.ok)
                        throw new Error(res.error);
                    return { result: res.rawOutput || '无差异内容' };
                }
                case 'create': {
                    const createCmd = ['pr', 'create', ...repoArgs, '--title', args.title || '', '--body', args.body || ''];
                    if (args.base)
                        createCmd.push('--base', args.base);
                    if (args.draft)
                        createCmd.push('--draft');
                    const res = await executor.run(createCmd, { cwd });
                    if (!res.ok)
                        throw new Error(res.error);
                    return { message: 'PR 创建成功', url: res.rawOutput };
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
                    const res = await executor.run(reviewCmd, { cwd });
                    if (!res.ok)
                        throw new Error(res.error);
                    return { message: 'Review 提交成功', detail: res.rawOutput };
                }
                case 'merge': {
                    if (!args.pr_number)
                        throw new Error('merge 操作必须提供 pr_number');
                    const method = args.merge_method === 'merge' ? '--merge' : (args.merge_method === 'rebase' ? '--rebase' : '--squash');
                    const res = await executor.run(['pr', 'merge', String(args.pr_number), ...repoArgs, method, '--delete-branch'], { cwd });
                    if (!res.ok)
                        throw new Error(res.error);
                    return { message: 'PR 合并完成并已清理分支', output: res.rawOutput };
                }
                default:
                    throw new Error(`未知的 PR 操作: ${args.action}`);
            }
        },
    };
}
