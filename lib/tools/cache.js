import { renderCacheMarkdown } from '../renderers/markdown.js';
function normalizeOutput(data) {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        return data;
    }
    if (Array.isArray(data)) {
        return { items: data, count: data.length };
    }
    return { result: data !== undefined && data !== null ? data : '' };
}
export function createCacheTool(executor) {
    return {
        name: 'github_cache',
        description: '管理 GitHub Actions 构建缓存 (Caches)：查看缓存列表与占用容量、按 ID 或 Key 删除指定缓存、以及全量清空仓库缓存。全量清空不可逆，需 confirm: true。',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['list', 'delete'],
                    description: 'Cache 操作类型。list 查看缓存列表与体积、delete 删除缓存。',
                },
                repo: {
                    type: 'string',
                    description: '目标仓库 [owner/repo]，留空则识别当前工作区仓库。',
                },
                cache_id: {
                    type: 'string',
                    description: '缓存数字 ID（delete 动作指定单条缓存删除时使用）。',
                },
                key: {
                    type: 'string',
                    description: '缓存 Key 键名前缀或完整键名（list 动作过滤检索，或 delete 动作按键删除时使用）。',
                },
                ref: {
                    type: 'string',
                    description: '分支或 PR Git Ref（如 "refs/heads/main" 或 "refs/pull/42/merge"，用于过滤或定向删除）。',
                },
                limit: {
                    type: 'number',
                    description: '返回缓存数量上限（list 动作使用，默认 30）。',
                },
                sort: {
                    type: 'string',
                    enum: ['created_at', 'last_accessed_at', 'size_in_bytes'],
                    description: '排序字段（list 动作使用，默认 last_accessed_at）。',
                },
                order: {
                    type: 'string',
                    enum: ['asc', 'desc'],
                    description: '排序方向（list 动作使用，默认 desc）。',
                },
                all: {
                    type: 'boolean',
                    description: '是否清空仓库全部缓存（delete 动作使用，高危操作，必需配合 confirm: true）。',
                },
                confirm: {
                    type: 'boolean',
                    description: '高危破坏性操作确认标志（delete 当 all: true 时必需）。未传 true 时输出影响评估报告并拦截。',
                },
            },
            required: ['action'],
        },
        output: {
            schema: { type: 'object' },
            render(args, value) {
                return [{ type: 'text', text: renderCacheMarkdown(args, value) }];
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
            switch (args.action) {
                case 'list': {
                    const listCmd = [
                        'cache',
                        'list',
                        ...repoArgs,
                        '--json',
                        'createdAt,id,key,lastAccessedAt,ref,sizeInBytes,version',
                    ];
                    const limit = typeof args.limit === 'number' && args.limit > 0 ? args.limit : 30;
                    listCmd.push('-L', String(limit));
                    if (args.key) {
                        listCmd.push('-k', String(args.key));
                    }
                    if (args.ref) {
                        listCmd.push('-r', String(args.ref));
                    }
                    if (args.sort) {
                        listCmd.push('--sort', args.sort);
                    }
                    if (args.order) {
                        listCmd.push('--order', args.order);
                    }
                    const res = await executor.run(listCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    let rawData = res.data;
                    if (!rawData && typeof res.rawOutput === 'string') {
                        try {
                            rawData = JSON.parse(res.rawOutput);
                        }
                        catch {
                            rawData = [];
                        }
                    }
                    return normalizeOutput(rawData || []);
                }
                case 'delete': {
                    // 1. 全量清空分支
                    if (args.all === true) {
                        if (args.confirm !== true) {
                            return {
                                status: 'AWAITING_CONFIRMATION',
                                action: 'delete',
                                all: true,
                                repo: repoTarget,
                                warning: `⚠️ 高危破坏性操作：即将清空仓库 ${repoTarget} 的所有 GitHub Actions 构建缓存`,
                                impact: `清空缓存不可逆，会导致后续流水线构建无法复用依赖与构建产物，显著增加 CI 运行耗时。`,
                                requiredAction: `如确认彻底清空，请在参数中附加 \`confirm: true\` 重新调用。示例：\`github_cache(action: 'delete', all: true, confirm: true)\``,
                            };
                        }
                        const delCmd = ['cache', 'delete', '--all', '--succeed-on-no-caches', ...repoArgs];
                        if (args.ref) {
                            delCmd.push('-r', String(args.ref));
                        }
                        const res = await executor.run(delCmd, runOpts);
                        if (!res.ok)
                            throw new Error(res.error);
                        return {
                            success: true,
                            all: true,
                            message: `🗑️ 成功清空仓库 ${repoTarget} 的 Actions 构建缓存` + (args.ref ? ` (Ref: ${args.ref})` : ''),
                            detail: res.rawOutput || '',
                        };
                    }
                    // 2. 按 cache_id 删除
                    if (args.cache_id !== undefined && args.cache_id !== null && String(args.cache_id).trim() !== '') {
                        const delCmd = ['cache', 'delete', String(args.cache_id), ...repoArgs];
                        const res = await executor.run(delCmd, runOpts);
                        if (!res.ok)
                            throw new Error(res.error);
                        return {
                            success: true,
                            cache_id: String(args.cache_id),
                            message: `🗑️ 成功删除仓库 ${repoTarget} 中 ID 为 "${args.cache_id}" 的 Actions 缓存`,
                            detail: res.rawOutput || '',
                        };
                    }
                    // 3. 按 key 删除
                    if (args.key !== undefined && args.key !== null && String(args.key).trim() !== '') {
                        const delCmd = ['cache', 'delete', String(args.key), ...repoArgs];
                        if (args.ref) {
                            delCmd.push('-r', String(args.ref));
                        }
                        const res = await executor.run(delCmd, runOpts);
                        if (!res.ok)
                            throw new Error(res.error);
                        return {
                            success: true,
                            key: String(args.key),
                            message: `🗑️ 成功删除仓库 ${repoTarget} 中 Key 为 "${args.key}" 的 Actions 缓存` + (args.ref ? ` (Ref: ${args.ref})` : ''),
                            detail: res.rawOutput || '',
                        };
                    }
                    throw new Error('删除缓存时必须指定 `cache_id`、`key` 或 `all: true`（全量删除需配合 confirm: true）。');
                }
                default:
                    throw new Error(`不支持的 cache 操作: "${args.action}"。可选值: list, delete。`);
            }
        },
    };
}
