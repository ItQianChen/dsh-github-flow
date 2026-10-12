function normalizeOutput(data) {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        return data;
    }
    if (Array.isArray(data)) {
        return { items: data, count: data.length };
    }
    return { result: data !== undefined && data !== null ? data : '' };
}
/**
 * 渲染 secret 工具输出。
 * 独立于 markdown.ts 渲染器的原因：这里有一条硬性安全规则——任何分支都不允许
 * 渲染 value 字段（哪怕是调试用途）。逻辑集中在本地一眼可审，避免在通用渲染器
 * 里混入「按字段名黑名单过滤」的隐蔽约束。
 */
function renderSecretOutput(args, value) {
    if (!value)
        return '无返回内容';
    if (value.status === 'AWAITING_CONFIRMATION') {
        return [
            `> ### ${value.warning}`,
            `> - **影响评估**: ${value.impact}`,
            `> - **确认指引**: ${value.requiredAction}`,
        ].join('\n');
    }
    if (Array.isArray(value.items) && args?.action === 'list') {
        const list = value.items.filter(Boolean);
        if (list.length === 0)
            return '📭 当前仓库尚未配置任何 Secret。';
        const rows = list.map((s) => {
            const name = `\`${String(s.name || '-')}\``;
            const vis = s.visibility ? String(s.visibility) : '-';
            const date = s.updatedAt ? s.updatedAt.slice(0, 10) : '-';
            return `| ${name} | ${vis} | ${date} |`;
        });
        return [
            `**当前已配置 ${list.length} 个 Secret（仅名称，永不展示明文）:**\n`,
            '| 密钥名称 | 可见性 | 最近更新 |',
            '| :--- | :--- | :--- |',
            ...rows,
        ].join('\n');
    }
    if (typeof value.message === 'string') {
        return `**${value.message}**`;
    }
    return JSON.stringify(value, null, 2);
}
export function createSecretTool(executor) {
    return {
        name: 'github_secret',
        description: '管理 GitHub Actions 仓库密钥 (Secrets)：查看已配置的密钥名称列表、设置/更新密钥值（如 NPM_TOKEN、部署密钥）。密文经标准输入安全传递，绝不出现在命令行参数中，也不会在输出中回显。删除需 confirm: true。',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['list', 'set', 'delete'],
                    description: 'Secret 操作类型。',
                },
                repo: {
                    type: 'string',
                    description: '目标仓库 [owner/repo]，留空则自动识别当前本地 Git 仓库。',
                },
                name: {
                    type: 'string',
                    description: '密钥名称（set/delete 动作使用，如 "NPM_TOKEN"、"DOCKER_PASSWORD"）。',
                },
                value: {
                    type: 'string',
                    description: '密钥明文内容（set 动作使用）。内部通过子进程标准输入传递，避免在进程命令行被 ps/任务管理器窃取。',
                },
                org: {
                    type: 'string',
                    description: '组织级密钥的所属组织名（可选，映射 --org）。',
                },
                env: {
                    type: 'string',
                    description: '环境级密钥的部署环境名（可选，映射 --env）。',
                },
                app: {
                    type: 'string',
                    enum: ['actions', 'agents', 'codespaces', 'dependabot'],
                    description: '密钥归属的应用（可选，映射 --app，默认 actions）。',
                },
                visibility: {
                    type: 'string',
                    enum: ['all', 'private', 'selected'],
                    description: '组织级密钥的可见范围（可选，仅 org 场景有意义）。',
                },
                confirm: {
                    type: 'boolean',
                    description: '删除密钥时的确认标志。删除不可逆，未传 true 时仅输出影响评估。',
                },
            },
            required: ['action'],
        },
        output: {
            schema: { type: 'object' },
            render(args, value) {
                return [{ type: 'text', text: renderSecretOutput(args, value) }];
            },
        },
        async execute(args, execContext) {
            const cwd = execContext?.cwd || process.cwd();
            const sessionId = execContext?.sessionId || execContext?.session?.id || process.env.DSH_SESSION_ID;
            // org 作用域的密钥挂在组织上，与具体仓库无关：既不需要仓库识别，
            // 也不能把 -R 与 --org 同时传给 gh（两者语义冲突，gh 会报错）。
            const isOrgScope = Boolean(args.org);
            let repoTarget = args.repo;
            if (!repoTarget && !isOrgScope) {
                const meta = await executor.getRepoMetadata(cwd, sessionId);
                if (meta?.nameWithOwner) {
                    repoTarget = meta.nameWithOwner;
                }
            }
            if (!repoTarget && !isOrgScope) {
                throw new Error('未能自动识别当前工作区关联的 GitHub 仓库。请通过 `repo` 参数显式指定目标仓库 [owner/repo]，或改用 `org` 参数操作组织级密钥。');
            }
            const runOpts = { cwd, sessionId };
            // org/env/app 三类作用域标志对所有动作通用；仓库作用域时三项均不追加
            const scopeFlags = [];
            if (args.org) {
                scopeFlags.push('--org', args.org);
                if (args.visibility)
                    scopeFlags.push('--visibility', args.visibility);
            }
            else if (args.env) {
                scopeFlags.push('--env', args.env);
            }
            if (args.app)
                scopeFlags.push('--app', args.app);
            const targetArgs = isOrgScope ? [] : ['-R', repoTarget];
            switch (args.action) {
                case 'list': {
                    const res = await executor.run(['secret', 'list', ...targetArgs, ...scopeFlags, '--json', 'name,updatedAt,visibility'], runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return normalizeOutput(res.data || res.rawOutput);
                }
                case 'set': {
                    if (!args.name)
                        throw new Error('set 操作必须提供 name（密钥名称）');
                    if (typeof args.value !== 'string' || args.value.length === 0) {
                        throw new Error('set 操作必须提供 value（密钥明文），且不允许为空字符串');
                    }
                    // 安全红线：密文只走 stdin。严禁退化为 -b <value> —— 那会把明文
                    // 留在进程列表与 shell 历史里，等于密钥泄漏。gh 本地会用仓库公钥
                    // 加密后才上传，明文不落盘、不出本机。
                    const res = await executor.run(['secret', 'set', args.name, ...targetArgs, ...scopeFlags], { ...runOpts, stdin: args.value });
                    if (!res.ok)
                        throw new Error(res.error);
                    return { message: `Secret「${args.name}」已更新（值不回显）` };
                }
                case 'delete': {
                    if (!args.name)
                        throw new Error('delete 操作必须提供 name');
                    if (args.confirm !== true) {
                        return {
                            status: 'AWAITING_CONFIRMATION',
                            warning: `⚠️ 高危操作拦截：你即将删除 Secret「${args.name}」${args.org ? `（组织 ${args.org}）` : ''}。`,
                            impact: '删除后所有引用该密钥的 CI/CD 工作流将立即无法取到值，运行中的构建会失败。',
                            requiredAction: '如确认删除，请向用户核实并附加 `confirm: true` 重新调用。',
                        };
                    }
                    const res = await executor.run(['secret', 'delete', args.name, ...targetArgs, ...scopeFlags], runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return { message: `Secret「${args.name}」已删除` };
                }
                default:
                    throw new Error(`未知的 Secret 操作: ${args.action}`);
            }
        },
    };
}
