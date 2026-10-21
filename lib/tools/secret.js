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
/**
 * 渲染 variable 工具输出——与 renderSecretOutput 物理分离（S3 D1 决策）。
 * 为什么必须独立函数而非同一渲染器的分支：variable 的 value 是 CI 明文（可回显，
 * 这正是 get action 的用途），secret 的 value 永不显示。若共用渲染逻辑再
 * 「选择性放开」，未来任一侧的重构都可能意外污染另一侧的安全假设——
 * 两个函数的边界比一个函数的分支更可审。
 */
function renderVariableOutput(args, value) {
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
            return '📭 当前作用域尚未配置任何 Variable。';
        const rows = list.map((v) => {
            const name = `\`${String(v.name || '-')}\``;
            const date = v.createdAt ? String(v.createdAt).slice(0, 10) : '-';
            return `| ${name} | ${date} |`;
        });
        return [
            `**当前已配置 ${list.length} 个 Variable（值为 CI 明文，可经 get 查看）:**\n`,
            '| 变量名 | 创建日期 |',
            '| :--- | :--- |',
            ...rows,
        ].join('\n');
    }
    if (typeof value.result === 'string') {
        return value.result;
    }
    if (typeof value.message === 'string') {
        return `**${value.message}**`;
    }
    return JSON.stringify(value, null, 2);
}
export function createSecretTool(executor) {
    return {
        name: 'github_secret',
        description: '管理 GitHub Actions 仓库密钥 (Secrets) 与变量 (Variables)：查看名称清单、设置/更新/删除值。Secret 密文经标准输入安全传递，绝不出现在命令行参数或输出中；Variable 为 CI 明文，可经 get 查看值。Secret 删除需 confirm: true。',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['list', 'get', 'set', 'delete'],
                    description: '操作类型。get 仅 kind=variable 可用（secret 值写入后 GitHub 侧加密存储，物理不可读取）。',
                },
                kind: {
                    type: 'string',
                    enum: ['secret', 'variable'],
                    description: '操作对象类型，默认 secret（向后兼容）。variable 为 Actions 明文变量：set 走 -b 直传、get 可回显值；secret 走 stdin 密文通道且永不回显。',
                },
                repo: {
                    type: 'string',
                    description: '目标仓库 [owner/repo]，留空则自动识别当前本地 Git 仓库。',
                },
                name: {
                    type: 'string',
                    description: '名称（set/get/delete 动作使用，如 "NPM_TOKEN"、"DEPLOY_ENV"）。',
                },
                value: {
                    type: 'string',
                    description: '值内容（set 动作使用）。secret：经子进程标准输入传递（防进程列表窃取）；variable：经 -b 参数直传（CI 明文，无 stdin 红线）。',
                },
                org: {
                    type: 'string',
                    description: '组织级作用域的组织名（可选，映射 --org）。',
                },
                env: {
                    type: 'string',
                    description: '环境级作用域的部署环境名（可选，映射 --env）。',
                },
                app: {
                    type: 'string',
                    enum: ['actions', 'agents', 'codespaces', 'dependabot'],
                    description: '密钥归属的应用（可选，仅 secret 的 --app，默认 actions；variable 无此维度）。',
                },
                visibility: {
                    type: 'string',
                    enum: ['all', 'private', 'selected'],
                    description: '组织级密钥的可见范围（可选，仅 secret + org 场景有意义）。',
                },
                confirm: {
                    type: 'boolean',
                    description: '删除操作的确认标志。删除不可逆，未传 true 时仅输出影响评估。',
                },
            },
            required: ['action'],
        },
        output: {
            schema: { type: 'object' },
            render(args, value) {
                // 渲染分流即安全边界：variable 与 secret 永不共享渲染路径（见函数注释）
                const renderer = args?.kind === 'variable' ? renderVariableOutput : renderSecretOutput;
                return [{ type: 'text', text: renderer(args, value) }];
            },
        },
        async execute(args, execContext) {
            const cwd = execContext?.cwd || process.cwd();
            const sessionId = execContext?.sessionId || execContext?.session?.id || process.env.DSH_SESSION_ID;
            const isVariable = args.kind === 'variable';
            // org 作用域挂在组织上，与具体仓库无关：既不需要仓库识别，
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
                throw new Error('未能自动识别当前工作区关联的 GitHub 仓库。请通过 `repo` 参数显式指定目标仓库 [owner/repo]，或改用 `org` 参数操作组织级作用域。');
            }
            // app 限定符仅 secret 域存在（variable 命令无 --app）；误传时明确报错而非静默忽略
            if (isVariable && args.app) {
                throw new Error("variable 无 --app 维度（app 仅 secret 域支持），请移除 app 参数。");
            }
            if (isVariable && args.visibility) {
                throw new Error("variable 无 --visibility 维度（visibility 仅组织级 secret 支持），请移除 visibility 参数。");
            }
            const runOpts = { cwd, sessionId };
            // org/env/app 三类作用域标志对所有动作通用；仓库作用域时三项均不追加
            const scopeFlags = [];
            if (args.org) {
                scopeFlags.push('--org', args.org);
                // `--visibility` 只有 `gh secret set` 支持（实测 gh 2.96：list / delete 的 FLAGS
                // 区块里没有它）。早期实现对所有动作都下发，导致带 org 的 list/delete 必然
                // unknown flag——这正是 phase34 契约测试上线第一天抓到的那条。
                if (!isVariable && args.visibility && args.action === 'set') {
                    scopeFlags.push('--visibility', args.visibility);
                }
            }
            else if (args.env) {
                scopeFlags.push('--env', args.env);
            }
            if (!isVariable && args.app)
                scopeFlags.push('--app', args.app);
            const targetArgs = isOrgScope ? [] : ['-R', repoTarget];
            // gh 命令域分流：secret → gh secret …；variable → gh variable …
            // （两级分流：域前缀 + 每个分支内的行为差异——stdin vs -b、get 可用性）
            const domain = isVariable ? 'variable' : 'secret';
            switch (args.action) {
                case 'list': {
                    // 字段集各自实测钉死：secret 有 updatedAt/visibility；variable 仅 4 字段
                    // （createdAt,name,numSelectedRepos,selectedReposURL——无 value，get 才返回）
                    const fields = isVariable ? 'name,createdAt,numSelectedRepos' : 'name,updatedAt,visibility';
                    const res = await executor.run([domain, 'list', ...targetArgs, ...scopeFlags, '--json', fields], runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return normalizeOutput(res.data || res.rawOutput);
                }
                case 'get': {
                    if (!args.name)
                        throw new Error('get 操作必须提供 name');
                    if (!isVariable) {
                        throw new Error('secret 的值写入后由 GitHub 侧加密存储，物理上不可读取（这正是 secret 与 variable 的设计区别）。请改用 kind: \'variable\' 或直接 set 覆盖。');
                    }
                    // gh variable get 输出变量值（纯文本，无 --json）
                    const res = await executor.run(['variable', 'get', args.name, ...targetArgs, ...scopeFlags], { ...runOpts, rawText: true });
                    if (!res.ok)
                        throw new Error(res.error);
                    return { name: args.name, value: res.rawOutput || '' };
                }
                case 'set': {
                    if (!args.name)
                        throw new Error('set 操作必须提供 name');
                    if (typeof args.value !== 'string' || args.value.length === 0) {
                        throw new Error('set 操作必须提供 value，且不允许为空字符串');
                    }
                    if (isVariable) {
                        // variable 是 CI 明文（workflow 中 env 直接引用可见），无 secret 的
                        // stdin 红线；gh variable set 原生支持 -b 直传（实测 help）。
                        const res = await executor.run(['variable', 'set', args.name, '--body', args.value, ...targetArgs, ...scopeFlags], runOpts);
                        if (!res.ok)
                            throw new Error(res.error);
                        return { message: `Variable「${args.name}」已更新（值: ${args.value}）` };
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
                    const kindLabel = isVariable ? 'Variable' : 'Secret';
                    if (args.confirm !== true) {
                        return {
                            status: 'AWAITING_CONFIRMATION',
                            warning: `⚠️ 高危操作拦截：你即将删除 ${kindLabel}「${args.name}」${args.org ? `（组织 ${args.org}）` : ''}。`,
                            impact: isVariable
                                ? '删除后所有引用该变量的工作流将取不到值，运行中的构建立即失败。'
                                : '删除后所有引用该密钥的 CI/CD 工作流将立即无法取到值，运行中的构建会失败。',
                            requiredAction: '如确认删除，请向用户核实并附加 `confirm: true` 重新调用。',
                        };
                    }
                    const res = await executor.run([domain, 'delete', args.name, ...targetArgs, ...scopeFlags], runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return { message: `${kindLabel}「${args.name}」已删除` };
                }
                default:
                    throw new Error(`未知的 Secret/Variable 操作: ${args.action}（kind: ${args.kind || 'secret'}）`);
            }
        },
    };
}
