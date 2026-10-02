export function createRepoTool(executor) {
    return {
        name: 'github_repo',
        description: '查看 GitHub 仓库元数据与跨仓库检索代码、Issue。默认查询当前工作区关联的仓库。',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['view', 'search_code', 'search_repos'],
                    description: '仓库操作类型。',
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
            },
            required: ['action'],
        },
        output: {
            schema: { type: 'object' },
            render(args, value) {
                return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }];
            },
        },
        async execute(args, execContext) {
            const cwd = execContext?.cwd || process.cwd();
            const limitStr = String(args.limit || 10);
            switch (args.action) {
                case 'view': {
                    const repoArgs = args.repo ? [args.repo] : [];
                    const res = await executor.run(['repo', 'view', ...repoArgs, '--json', 'nameWithOwner,description,defaultBranchRef,isPrivate,stargazerCount,forkCount,url'], { cwd });
                    if (!res.ok)
                        throw new Error(res.error);
                    return res.data || res.rawOutput;
                }
                case 'search_code': {
                    if (!args.query)
                        throw new Error('search_code 必须提供 query');
                    const repoArgs = args.repo ? ['--repo', args.repo] : [];
                    const res = await executor.run(['search', 'code', args.query, ...repoArgs, '--json', 'path,repository,textMatches', '-L', limitStr], { cwd });
                    if (!res.ok)
                        throw new Error(res.error);
                    return res.data || res.rawOutput;
                }
                case 'search_repos': {
                    if (!args.query)
                        throw new Error('search_repos 必须提供 query');
                    const res = await executor.run(['search', 'repos', args.query, '--json', 'fullName,description,stargazersCount,updatedAt', '-L', limitStr], { cwd });
                    if (!res.ok)
                        throw new Error(res.error);
                    return res.data || res.rawOutput;
                }
                default:
                    throw new Error(`未知的 Repo 操作: ${args.action}`);
            }
        },
    };
}
