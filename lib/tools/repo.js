function normalizeOutput(data) {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        return data;
    }
    if (Array.isArray(data)) {
        return { items: data, count: data.length };
    }
    return { result: data !== undefined && data !== null ? data : '' };
}
export function createRepoTool(executor) {
    return {
        name: 'github_repo',
        description: '查看 GitHub 仓库元数据、同步 Fork 仓库主干 (sync) 与跨仓库检索代码。默认查询当前工作区关联的仓库。',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['view', 'search_code', 'search_repos', 'sync'],
                    description: '仓库操作类型。新增 sync (一键拉平 Fork 仓库与上游主干)。',
                },
                repo: {
                    type: 'string',
                    description: '目标仓库 [owner/repo]，留空则识别当前仓库。',
                },
                query: {
                    type: 'string',
                    description: '检索关键词（search_code 或 search_repos 时使用）。',
                },
                limit: {
                    type: 'number',
                    description: '返回条数，默认 10。',
                },
                branch: {
                    type: 'string',
                    description: '要同步的分支名（sync 动作使用，默认主分支如 main）。',
                },
                source: {
                    type: 'string',
                    description: '上游源仓库 [owner/repo]（sync 动作使用，留空自动匹配 upstream 远程配置）。',
                },
                force: {
                    type: 'boolean',
                    description: '是否强制硬重置同步（sync 动作使用，映射为 --force，解决分叉冲突）。默认 false。',
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
            const sessionId = execContext?.sessionId || execContext?.session?.id || process.env.DSH_SESSION_ID;
            const limitStr = String(args.limit || 10);
            const runOpts = { cwd, sessionId };
            switch (args.action) {
                case 'view': {
                    let repoTarget = args.repo;
                    let meta = null;
                    if (!repoTarget) {
                        meta = await executor.getRepoMetadata(cwd, sessionId);
                        if (meta?.nameWithOwner) {
                            repoTarget = meta.nameWithOwner;
                        }
                    }
                    const repoArgs = repoTarget ? [repoTarget] : [];
                    const res = await executor.run(['repo', 'view', ...repoArgs, '--json', 'nameWithOwner,description,defaultBranchRef,isPrivate,stargazerCount,forkCount,url,repositoryTopics,licenseInfo'], runOpts);
                    if (!res.ok) {
                        // 若执行 gh 失败（如离线或环境限制），但本地已成功识别仓库元数据，进行优雅兜底返回
                        if (meta && meta.nameWithOwner) {
                            return normalizeOutput(meta);
                        }
                        throw new Error(res.error);
                    }
                    return normalizeOutput(res.data || res.rawOutput);
                }
                case 'search_code': {
                    if (!args.query)
                        throw new Error('search_code 必须提供 query');
                    const repoArgs = args.repo ? ['--repo', args.repo] : [];
                    const res = await executor.run(['search', 'code', args.query, ...repoArgs, '--json', 'path,repository,textMatches', '-L', limitStr], runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return normalizeOutput(res.data || res.rawOutput);
                }
                case 'search_repos': {
                    if (!args.query)
                        throw new Error('search_repos 必须提供 query');
                    const res = await executor.run(['search', 'repos', args.query, '--json', 'fullName,description,stargazersCount,updatedAt', '-L', limitStr], runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return normalizeOutput(res.data || res.rawOutput);
                }
                case 'sync': {
                    let repoTarget = args.repo;
                    if (!repoTarget) {
                        const meta = await executor.getRepoMetadata(cwd, sessionId);
                        if (meta?.nameWithOwner) {
                            repoTarget = meta.nameWithOwner;
                        }
                    }
                    const syncCmd = ['repo', 'sync'];
                    if (repoTarget) {
                        syncCmd.push(repoTarget);
                    }
                    if (args.branch) {
                        syncCmd.push('--branch', args.branch);
                    }
                    if (args.source) {
                        syncCmd.push('--source', args.source);
                    }
                    if (args.force === true) {
                        syncCmd.push('--force');
                    }
                    const res = await executor.run(syncCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return { message: 'Fork 仓库同步成功，已与上游主干对齐', output: res.rawOutput || 'Synced' };
                }
                default:
                    throw new Error(`未知的 Repo 操作: ${args.action}`);
            }
        },
    };
}
