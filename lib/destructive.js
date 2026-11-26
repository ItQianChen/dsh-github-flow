/**
 * 破坏性操作声明表 + 统一闸门。
 *
 * 为什么要有这张表：同一个「拦截 → 返回影响评估 → 要求 confirm: true」的模式在
 * 16 个 (工具, action) 上各写了一遍。任何一处忘写就是漏洞，而漏洞是**看不见的**
 * （工具照常返回成功，没人知道本该拦一次）。表化之后「没有条目 = 没有闸门」可以
 * 一眼审完，并且能被测试穷举。
 *
 * 拦截点收在一处实现（`wrapWithGate`），由每个工具的工厂函数返回时套上——见文件末尾该函数的注释。`src/tools/` 里不再保留任何一行闸门代码。
 *
 * ⚠️ 与旧实现的一处已知差异：`cache delete` / `issue transfer` / `label delete` 的
 * 旧文案里内插了**运行时解析出的仓库名**（`repoTarget`）。注册期拿不到它（要额外打
 * 一次 `gh repo view`），因此文案改为不内插仓库名。渲染层只消费
 * warning/impact/requiredAction 三个字段，不消费 repo，故输出形态无变化。
 */
/** 闸门状态字面量的唯一来源：工具层与渲染层都引用它，不再各写一遍字符串。 */
export const GATE_BLOCKED = 'AWAITING_CONFIRMATION';
const str = (v) => (v === undefined || v === null ? '' : String(v).trim());
/** 有值即认为「调用方已经给到了定位参数」，可以进入拦截而不是先报缺参。 */
const has = (v) => str(v) !== '';
export const DESTRUCTIVE_ACTIONS = {
    github_pr: {
        // 默认检出不带 -f；只有显式 force 才需要二次确认（会丢弃本地未推送提交）
        checkout: {
            when: (a) => a.force === true,
            describe: (a) => ({
                status: GATE_BLOCKED,
                warning: `⚠️ force 会把本地分支重置到 PR #${str(a.pr_number)} 的最新状态，丢弃本地未推送的提交。`,
                impact: '重置后本地分支与 PR 头一致，本地独有提交只能通过 git reflog 找回。',
                requiredAction: '如确认重置，请附加 `force: true, confirm: true` 重新调用。',
            }),
        },
        merge: {
            // 缺 pr_number 时旧实现先抛「merge 操作必须提供 pr_number」；闸门前移后必须自己把
            // 这条前置校验编码进 when，否则会返回一个「PR #」空号的确认载荷（实测）。
            when: (a) => has(a.pr_number),
            describe: (a) => ({
                status: GATE_BLOCKED,
                warning: `⚠️ 高危操作拦截：你即将合并 PR #${str(a.pr_number)}（合并策略: ${a.merge_method || 'squash'}${a.delete_branch ? '，且删除源分支' : ''}）。`,
                impact: '合并操作将直接向基准分支写入代码并更新远端 PR 状态。',
                requiredAction: '如确认执行合并，请向用户明确确认并附加 `confirm: true` 重新调用。',
            }),
        },
        revert: {
            when: (a) => has(a.pr_number),
            describe: (a) => ({
                status: GATE_BLOCKED,
                warning: `⚠️ 高危操作拦截：你即将对 PR #${str(a.pr_number)} 创建反向提交（revert）。`,
                impact: '将在远端创建反向提交并生成新的 revert PR——这是新增远端实体，不是本地操作。',
                requiredAction: '如确认执行，请向用户明确确认并附加 `confirm: true` 重新调用。',
            }),
        },
    },
    github_issue: {
        close: {
            // 缺 issue_number 时旧实现先抛「close 操作必须提供 issue_number」
            when: (a) => has(a.issue_number),
            describe: (a) => ({
                status: GATE_BLOCKED,
                warning: `⚠️ 高危操作拦截：你即将关闭 Issue #${str(a.issue_number)}。`,
                impact: '关闭后该议题状态将变更为 CLOSED，请与用户确认是否确实已解决或需要关闭。',
                requiredAction: '如确认关闭，请在参数中附加 `confirm: true` 重新调用。',
            }),
        },
        delete: {
            // 缺 issue_number 时旧实现先抛「delete 操作必须提供 issue_number」
            when: (a) => has(a.issue_number),
            describe: (a) => ({
                status: GATE_BLOCKED,
                warning: `⚠️ 高危操作拦截：你即将**物理删除** Issue #${str(a.issue_number)}（非 close，不可恢复）。`,
                impact: 'Issue 编号将永久消失，全部评论与附件随之湮灭，GraphQL 层无法恢复——这与 close（可 reopen 逆转）有本质区别。',
                requiredAction: '如确认删除，请与用户核实后附加 `confirm: true` 重新调用。',
            }),
        },
        transfer: {
            // 旧实现按 issue_number → target_repo → 同仓 的顺序抛错；前两条要在这里保住，
            // 同仓校验依赖运行时解析出的 repoTarget，只能在工具内（confirm 之后）暴露。
            when: (a) => has(a.issue_number) && has(a.target_repo),
            describe: (a) => ({
                status: GATE_BLOCKED,
                warning: `⚠️ 高危操作拦截：你即将把 Issue #${str(a.issue_number)} 迁移到 ${str(a.target_repo)}。`,
                impact: `迁移后 Issue 归属 ${str(a.target_repo)}（原 URL 301 重定向），标签/里程碑不随迁，操作不可静默撤回。需要目标仓库的写权限。`,
                requiredAction: '如确认迁移，请与用户核实后附加 `confirm: true` 重新调用。',
            }),
        },
    },
    github_release: {
        // 原实现先校验 tag / assets 再判 clobber，条件里一并带上，避免缺参时先拿到确认提示
        upload: {
            when: (a) => a.clobber === true && has(a.tag) && Array.isArray(a.assets) && a.assets.length > 0,
            describe: (a) => ({
                status: GATE_BLOCKED,
                warning: `⚠️ 高危操作拦截：你即将覆盖上传 Release ${str(a.tag)} 的同名旧资产（clobber 模式）。`,
                impact: 'clobber 会先删除既有同名资产再上传；若上传中途失败，旧资产已丢失且无法恢复。',
                requiredAction: '如确认覆盖，请向用户核实并附加 `confirm: true` 重新调用。',
            }),
        },
        delete: {
            when: (a) => has(a.tag),
            describe: (a) => ({
                status: GATE_BLOCKED,
                warning: `⚠️ 高危操作拦截：你即将删除 Release ${str(a.tag)}${a.cleanup_tag ? ' 及其 Git Tag' : ''}。`,
                impact: '删除 Release 不可逆；若同时清理 Tag，引用该 Tag 的历史版本入口将全部失效。',
                requiredAction: '如确认删除，请与用户核实并附加 `confirm: true` 重新调用。',
            }),
        },
    },
    github_secret: {
        delete: {
            when: (a) => has(a.name),
            describe: (a) => {
                // 与旧实现同口径：kind === 'variable' 时按 Variable 措辞，否则按 Secret
                const isVariable = a.kind === 'variable';
                const kindLabel = isVariable ? 'Variable' : 'Secret';
                return {
                    status: GATE_BLOCKED,
                    warning: `⚠️ 高危操作拦截：你即将删除 ${kindLabel}「${str(a.name)}」${a.org ? `（组织 ${str(a.org)}）` : ''}。`,
                    impact: isVariable
                        ? '删除后所有引用该变量的工作流将取不到值，运行中的构建立即失败。'
                        : '删除后所有引用该密钥的 CI/CD 工作流将立即无法取到值，运行中的构建会失败。',
                    requiredAction: '如确认删除，请向用户核实并附加 `confirm: true` 重新调用。',
                };
            },
        },
    },
    github_label: {
        delete: {
            when: (a) => has(a.name),
            describe: (a) => ({
                status: GATE_BLOCKED,
                action: 'delete',
                name: a.name,
                warning: `⚠️ 高危破坏性操作：即将删除仓库标签 "${str(a.name)}"`,
                impact: '删除标签不可逆，且会导致目标仓库内所有已打上该标签的 Issue 与 PR 自动解绑该标记。',
                requiredAction: `如确认彻底删除，请在参数中附加 \`confirm: true\` 重新调用。示例：\`github_label(action: 'delete', name: '${str(a.name)}', confirm: true)\``,
            }),
        },
    },
    github_cache: {
        // 三条删除分支共用一套 confirm 语义。选择器缺失时原实现会抛「必须指定…」，
        // 这里 predicate 为 false，把精确报错留给工具本体，不用泛化文案顶替。
        delete: {
            when: (a) => a.all === true || has(a.cache_id) || has(a.key),
            describe: (a) => {
                const cacheIdStr = str(a.cache_id);
                const keyStr = str(a.key);
                const hasAll = a.all === true;
                // 分支判定与工具本体的归一化同口径：cache_id 非空即按 ID 删除，否则按 key
                const byId = cacheIdStr !== '';
                const targetDesc = hasAll
                    ? '清空该仓库的所有 GitHub Actions 构建缓存'
                    : byId
                        ? `删除仓库中 ID 为 "${cacheIdStr}" 的构建缓存`
                        : `删除仓库中 Key 为 "${keyStr}" 的构建缓存`;
                return {
                    status: GATE_BLOCKED,
                    action: 'delete',
                    ...(hasAll ? { all: true } : byId ? { cache_id: cacheIdStr } : { key: keyStr }),
                    warning: `⚠️ 高危破坏性操作：即将${targetDesc}`,
                    impact: '删除构建缓存不可逆，会导致后续流水线构建无法复用依赖与构建产物，显著增加 CI 运行耗时。',
                    requiredAction: '如确认删除，请在参数中附加 `confirm: true` 重新调用。',
                };
            },
        },
    },
    github_codespace: {
        delete: {
            when: (a) => has(a.codespace),
            describe: (a) => ({
                status: GATE_BLOCKED,
                warning: `⚠️ 销毁确认拦截：你即将永久删除云端开发环境「${str(a.codespace)}」。`,
                impact: '物理销毁 Codespace 将永久释放云端计算资源，环境中任何未提交并推送到远端 Git 的临时修改都将无法找回。',
                requiredAction: '如确认销毁该实例，请核对环境名称并在参数中附加 `confirm: true` 重新调用。',
            }),
        },
    },
    github_gist: {
        delete: {
            when: (a) => has(a.gist_id),
            describe: (a) => ({
                status: GATE_BLOCKED,
                action: 'delete',
                gist_id: str(a.gist_id),
                warning: `⚠️ 高危破坏性操作：即将永久删除 Gist 代码片段 "${str(a.gist_id)}"`,
                impact: '删除 Gist 为物理删除，无法通过 GitHub API 恢复，所有引用该 Gist URL 的外部链接将失效并返回 404。',
                requiredAction: `如确认彻底删除，请在参数中附加 \`confirm: true\` 重新调用。示例：\`github_gist(action: 'delete', gist_id: '${str(a.gist_id)}', confirm: true)\``,
            }),
        },
    },
    github_project: {
        'item-delete': {
            when: (a) => has(a.item_id),
            describe: (a) => ({
                status: GATE_BLOCKED,
                warning: `⚠️ 删除确认拦截：你即将从看板中删除条目（ID: ${str(a.item_id)}）。`,
                impact: '该操作将从项目看板中物理移除该条目（若是关联的 Issue/PR，实体不会被删除，仅解除看板关联）。',
                requiredAction: '如确认删除，请在参数中附加 `confirm: true` 重新调用。',
            }),
        },
    },
    github_skill: {
        install: {
            when: (a) => has(a.repository),
            describe: (a) => ({
                status: GATE_BLOCKED,
                warning: `⚠️ 安装确认拦截：你即将从仓库「${str(a.repository)}」安装 Skill${a.skill_name ? `「${str(a.skill_name)}」` : ''}到本地${a.scope === 'user' ? '用户主目录（全局）' : '当前项目'}。`,
                impact: '安装会在本地磁盘写入 SKILL.md 及附属文件，并可能影响目标 Agent 宿主的默认行为。',
                requiredAction: '如确认安装，请向用户核实并附加 `confirm: true` 重新调用。',
            }),
        },
        // 只在「正式发布」分支拦截：dry_run 缺省为真（预演），fix 模式也是本地产物修复。
        // 原实现先校验 tag，这里一并带上，缺 tag 仍由工具本体抛出「必须提供版本 tag」。
        publish: {
            when: (a) => a.dry_run === false && a.fix !== true && has(a.tag),
            describe: (a) => {
                const cleanTag = str(a.tag);
                return {
                    status: GATE_BLOCKED,
                    warning: `⚠️ 发布确认拦截：你即将正式发布 Agent Skill 并创建 GitHub Release（Tag: ${cleanTag}）。`,
                    impact: `该操作将在仓库中打上「agent-skills」Topic、创建 Git Tag「${cleanTag}」并发布正式 GitHub Release，向所有用户公开提供该版本。`,
                    requiredAction: `如确认发布，请核实版本号并在参数中附加 \`confirm: true\` 重新调用。`,
                };
            },
        },
    },
    /*
     * 任务级原语（s8）：默认只读，唯一会写远端的是 review_pr 的 write 模式。
     *
     * 为什么 when 要判 `write === true`：`review_pr` 默认只产出上下文包（不写回），
     * 若恒拦，Agent 连"看一眼这个 PR 该审什么"都要先确认一次，闸门就变成了噪音。
     */
    github_task: {
        review_pr: {
            when: (a) => a.write === true && has(a.pr_number),
            describe: (a) => ({
                status: GATE_BLOCKED,
                warning: `⚠️ 写回拦截：你即将向 PR #${str(a.pr_number)} 提交一条公开可见的 Review（含行级评注）。`,
                impact: '该 Review 会立即出现在 PR 时间线上并通知相关人，删除只能逐条进行。',
                requiredAction: '如确认写回，请附加 `write: true, confirm: true` 重新调用；只想看结论请去掉 `write`。',
            }),
        },
    },
};
/**
 * 统一闸门：命中则返回拦截载荷，否则返回 undefined。
 *
 * `confirm === true` 的判定放在这里而不是每个 describe 里——15 份重复的
 * `if (args.confirm !== true)` 正是这次要消掉的东西。
 */
export function guardDestructive(toolName, args) {
    const table = DESTRUCTIVE_ACTIONS[toolName];
    if (!table)
        return undefined;
    const action = typeof args?.action === 'string' ? args.action : '';
    // 必须挡原型链：`action: "toString"` 会让 table[action] 命中原型上的函数，
    // spec.describe 不是函数直接 TypeError（复核报告 C-05，11 工具 × 16 组合全崩）。
    const spec = Object.prototype.hasOwnProperty.call(table, action) ? table[action] : undefined;
    if (!spec)
        return undefined;
    if (args?.confirm === true)
        return undefined;
    if (spec.when && !spec.when(args))
        return undefined;
    return spec.describe(args);
}
/**
 * 用闸门包一层 execute（注册期唯一入口）。
 *
 * 为什么包在注册期而不是 `executor.run()`：`run()` 只看得见 argv，看不见
 * `action` / `confirm` 语义。把语义解析塞进 argv 层就是把简单问题复杂化。
 *
 * 保持 `name` / `description` / `parameters` / `output` 原样，只替换 `execute`，
 * 宿主侧的 schema 校验与渲染链路完全不受影响。
 */
export function wrapWithGate(tool) {
    return {
        ...tool,
        async execute(args, ctx) {
            const gate = guardDestructive(tool.name, args);
            if (gate)
                return gate;
            return tool.execute(args, ctx);
        },
    };
}
