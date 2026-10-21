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
        description: '管理 GitHub Actions 构建缓存 (Caches)：查看缓存列表与占用容量、按 ID 或 Key 删除指定缓存、以及全量清空仓库缓存。删除不可逆，delete 的三种方式（cache_id / key / all）均需 confirm: true。',
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
                    description: '高危破坏性操作确认标志（delete 的三态 cache_id / key / all 均必需）。未传 true 时输出影响评估报告并拦截。',
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
                    // ---- 第一段：选择器归一化 + 形态校验（在任何执行之前）----
                    const hasAll = args.all === true;
                    const cacheIdStr = args.cache_id !== undefined && args.cache_id !== null ? String(args.cache_id).trim() : '';
                    const keyStr = args.key !== undefined && args.key !== null ? String(args.key).trim() : '';
                    const hasId = cacheIdStr !== '';
                    const hasKey = keyStr !== '';
                    if (!hasAll && !hasId && !hasKey) {
                        throw new Error('删除缓存时必须指定 `cache_id`、`key` 或 `all: true`（三条删除分支均需配合 confirm: true）。');
                    }
                    // 形态校验必须先于执行：不校验时 `cache_id: "--all"` 会被当作 flag 透传，
                    // 等价于清空全仓缓存；而 `gh cache delete --all` 自身没有二次确认，绕过即秒清。
                    if (hasId && !/^\d+$/.test(cacheIdStr)) {
                        throw new Error(`cache_id 必须是纯数字的缓存 ID（实际收到 "${cacheIdStr}"）。按 key 删除请改用 key 参数，全量清空请用 all: true。`);
                    }
                    if (hasKey && (keyStr.startsWith('-') || keyStr.length > 512)) {
                        throw new Error('key 不能以 - 开头（防被当作命令行 flag），且长度不得超过 512 字符。');
                    }
                    // ---- 第二段：三条分支共用同一套 confirm 语义 ----
                    // 此前只有 all 分支有闸门，cache_id / key 两条直穿；三条写法不同正是漏闸的根因。
                    if (args.confirm !== true) {
                        const targetDesc = hasAll
                            ? `清空仓库 ${repoTarget} 的所有 GitHub Actions 构建缓存`
                            : hasId
                                ? `删除仓库 ${repoTarget} 中 ID 为 "${cacheIdStr}" 的构建缓存`
                                : `删除仓库 ${repoTarget} 中 Key 为 "${keyStr}" 的构建缓存`;
                        return {
                            status: 'AWAITING_CONFIRMATION',
                            action: 'delete',
                            ...(hasAll ? { all: true } : hasId ? { cache_id: cacheIdStr } : { key: keyStr }),
                            repo: repoTarget,
                            warning: `⚠️ 高危破坏性操作：即将${targetDesc}`,
                            impact: '删除构建缓存不可逆，会导致后续流水线构建无法复用依赖与构建产物，显著增加 CI 运行耗时。',
                            requiredAction: '如确认删除，请在参数中附加 `confirm: true` 重新调用。',
                        };
                    }
                    // ---- 第三段：执行（argv 形状与改动前保持一致）----
                    if (hasAll) {
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
                    if (hasId) {
                        const delCmd = ['cache', 'delete', cacheIdStr, ...repoArgs];
                        const res = await executor.run(delCmd, runOpts);
                        if (!res.ok)
                            throw new Error(res.error);
                        return {
                            success: true,
                            cache_id: cacheIdStr,
                            message: `🗑️ 成功删除仓库 ${repoTarget} 中 ID 为 "${cacheIdStr}" 的 Actions 缓存`,
                            detail: res.rawOutput || '',
                        };
                    }
                    const delCmd = ['cache', 'delete', keyStr, ...repoArgs];
                    if (args.ref) {
                        delCmd.push('-r', String(args.ref));
                    }
                    const res = await executor.run(delCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return {
                        success: true,
                        key: keyStr,
                        message: `🗑️ 成功删除仓库 ${repoTarget} 中 Key 为 "${keyStr}" 的 Actions 缓存` + (args.ref ? ` (Ref: ${args.ref})` : ''),
                        detail: res.rawOutput || '',
                    };
                }
                default:
                    throw new Error(`不支持的 cache 操作: "${args.action}"。可选值: list, delete。`);
            }
        },
    };
}
