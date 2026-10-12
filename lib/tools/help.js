const KNOWLEDGE_BASE = {
    overview: `### 🧭 DSH GitHub Flow 工具箱全景导航

本插件提供面向 DeepSeek Harness 的原生 GitHub 协作与智能体基础设施工具矩阵：

| 工具名称 | 核心职责 | 典型调用场景 |
| :--- | :--- | :--- |
| \`github_pr\` | Pull Request 管理、审查与本地检出 | 查看 PR 列表/详情、比对 diff、本地检出代码验证、检查 CI 状态、执行带确认合并 |
| \`github_issue\` | Issue 任务追踪与分支开发关联 | 筛选待办议题、追加评论、编辑标题/标签、从 Issue 一键切出关联开发分支 |
| \`github_run\` | GitHub Actions 构建排查与工作流管理 | 查看构建列表、提取失败日志 (log_failed)、重新触发、手动触发 workflow_dispatch |
| \`github_repo\` | 仓库元数据、Fork 同步与全局检索 | 查看仓库与 topics、一键拉平 Fork 仓库 (sync)、检索全局代码与仓库 |
| \`github_api\` | 原生 GitHub REST/GraphQL 逃生门 | 调用任意端点、获取原始文件字节 (raw)、支持自动翻页 (paginate) |
| \`github_help\` | 路由导航、官方语法速查与故障自愈 | 遇到不确定的操作、搜索语法或接口报错时查询用法与诊断配方 |

💡 **使用准则**：优先调用高层语义工具（pr / issue / run / repo）；当高层工具无法满足特殊接口需求时，再降级使用 \`github_api\`。`,
    pr: `### 🔀 github_pr 详细操作指南

- **查看列表**: \`github_pr(action: 'list', state: 'open' | 'closed' | 'merged' | 'all', limit: 20, author: '@me')\`
- **本地检出代码**: \`github_pr(action: 'checkout', pr_number: 123)\`
  - 自动切换到本地分支并拉取最新提交，非常适用于 Agent 在本地沙箱中跑单元测试验证 PR 改动。
- **差异比对**: \`github_pr(action: 'diff', pr_number: 123, stat_only: true)\`
  - 对于大 PR，强烈建议先开启 \`stat_only: true\` 查看改动文件概览，防止超大 diff 触发截断或撑爆上下文。
- **检查冲突状态**: \`github_pr(action: 'status')\`
  - 查看当前分支关联 PR 的 merge conflict 状态。
- **安全合并**: \`github_pr(action: 'merge', pr_number: 123, confirm: true, merge_method: 'squash', delete_branch: false)\`
  - 高危操作必须显式附带 \`confirm: true\`；若未传将返回拦截警告与待合并影响报告。`,
    issue: `### 🎯 github_issue 详细操作指南

- **筛选 Issue**: \`github_issue(action: 'list', state: 'open' | 'closed' | 'all', labels: ['bug'], assignees: ['octocat'], limit: 20)\`
- **关联开发分支**: \`github_issue(action: 'develop', issue_number: 42, branch_name: 'fix-login-bug')\`
  - 自动在远端和本地创建带有官方关联关系的开发分支并切换过去，实现“读需求 -> 开分支写代码”的无缝衔接。
- **编辑 Issue**: \`github_issue(action: 'edit', issue_number: 42, title: '新标题', add_labels: ['p1'], remove_labels: ['triage'])\`
- **追加讨论**: \`github_issue(action: 'comment', issue_number: 42, body: '定位到问题原因...')\`
- **安全关闭**: \`github_issue(action: 'close', issue_number: 42, confirm: true)\`
  - 关闭操作必须附带 \`confirm: true\`。`,
    run: `### 🚀 github_run 详细操作指南

- **过滤构建记录**: \`github_run(action: 'list', branch: 'main', status: 'failure', limit: 10)\`
  - 快速定位失败的 CI 构建，排查报错首选 \`status: 'failure'\`。
- **提取失败步骤日志**: \`github_run(action: 'log_failed', run_id: '12345678')\`
  - 专为 Agent 优化的失败信息提取能力，直接定位报错位置；若无失败步骤则优雅提示。
- **主动触发工作流**: \`github_run(action: 'trigger', workflow: 'pr-check.yml', ref: 'main', inputs: { env: 'staging' })\`
  - 提交代码修复后，主动触发远端 CI/CD 验证。
- **重新执行失败任务**: \`github_run(action: 'rerun', run_id: '12345678')\``,
    repo: `### 📦 github_repo 详细操作指南

- **查看元数据与标签**: \`github_repo(action: 'view')\`
  - 返回仓库基本信息、默认分支、Star 计数、许可证以及 \`repositoryTopics\`（用于 DSH 插件合规审查）。
- **一键拉平 Fork 主干 (防止 Stale)**: \`github_repo(action: 'sync', branch: 'main')\`
  - 解决开源项目贡献中因本地 Fork 落后导致上游 CI 门禁失败的顽疾。
- **代码检索**: \`github_repo(action: 'search_code', query: 'filename:package.json dsh.bundle')\``,
    api: `### ⚡ github_api 底层逃生门指南

- **标准 GET 请求带参数**:
  \`github_api(endpoint: 'repos/owner/repo/pulls', fields: { state: 'closed', per_page: 5 })\`
  - 插件会自动追加 \`-X GET\`，将 fields 作为 URL Query String 传递，杜绝被 gh 自动改写为 POST。
- **读取仓库原始文件字节**:
  \`github_api(endpoint: 'repos/owner/repo/contents/path/to/file.yml', raw: true)\`
  - 附加 \`Accept: application/vnd.github.raw\`，返回纯文本而非 base64 包装。
- **全量聚合翻页**:
  \`github_api(endpoint: 'repos/owner/repo/commits', paginate: true)\`
- **GraphQL 请求**:
  \`github_api(endpoint: 'graphql', fields: { query: 'query { viewer { login } }' })\``,
    search_syntax: `### 🔍 GitHub 官方高级检索语法速查手册

在 \`github_repo\`、\`github_api\` 或搜索场景中，请严格遵守 GitHub 官方搜索语法：

1. **日期区间语法 (严格使用两点 .. 表示)**:
   - \`created:2026-10-01..2026-10-12\`（2026年10月1日到10月12日之间）
   - \`created:>2026-10-01\` 或 \`created:<2026-10-12\`
   - ⚠️ **禁忌**：GitHub 搜索**不支持**数字范围 \`6129..6695\`，这会导致静默返回 0 条结果。
2. **状态与类型修饰符**:
   - \`is:pr\`、\`is:issue\`、\`is:open\`、\`is:closed\`、\`is:merged\`、\`is:draft\`
3. **关联者修饰符**:
   - \`author:@me\`、\`author:username\`、\`assignee:@me\`、\`mentions:username\`
4. **CI 状态修饰符**:
   - \`status:success\`、\`status:failure\`、\`status:pending\`
5. **代码搜索范围限制**:
   - \`repo:owner/repo\`、\`path:src/\`、\`filename:package.json\`、\`extension:ts\``,
    troubleshooting: `### 🛠️ 常见故障诊断与自愈配方

1. **报 \`HTTP 422: "base", "head" weren't supplied\`**:
   - *原因*：使用 gh api 传递参数时缺少 \`-X GET\`，导致 gh 隐式将其视作 POST 新建 PR 请求。
   - *解法*：本插件已在底层自动补全 \`-X GET\`；若使用原始端点，确保直接将参数拼接在 URL query 或传递 method: 'GET'。
2. **报 \`HTTP 403: API rate limit exceeded\`**:
   - *原因*：GitHub 账号 API 配额耗尽或短时间内突发高并发被二级风控。
   - *解法*：等待当前小时重置，或减少无意义的循环轮询；使用高层工具的针对性过滤条件减少请求次数。
3. **报 \`Submission gate: stale fork\` 或上游门禁失败**:
   - *原因*：Fork 的仓库落后于主干，合并时带入了过期的配置或删除了近期条目。
   - *解法*：调用 \`github_repo(action: 'sync')\` 自动对齐 upstream 主干代码。
4. **报 \`System cannot find GitHub CLI (gh)\`**:
   - *解法*：宿主机尚未安装 gh。Windows 运行 \`winget install GitHub.cli\`，macOS 运行 \`brew install gh\`，然后执行 \`gh auth login\` 登录。`
};
export function createHelpTool(executor) {
    return {
        name: 'github_help',
        description: 'GitHub 工具箱使用指南与官方命令手册。当你不确定该用哪个工具、需要特定操作的高级语法与示例、或排查 GitHub 报错时调用。',
        parameters: {
            type: 'object',
            properties: {
                topic: {
                    type: 'string',
                    enum: [
                        'overview',
                        'pr',
                        'issue',
                        'run',
                        'repo',
                        'api',
                        'search_syntax',
                        'troubleshooting',
                    ],
                    description: '帮助主题分类。留空则返回全局工具箱导航。',
                },
                gh_command: {
                    type: 'string',
                    description: '可选：直接查询 GitHub CLI 官方原始命令帮助手册（例如 "pr create"、"search code"、"ruleset"）。',
                },
            },
        },
        output: {
            schema: { type: 'object' },
            render(args, value) {
                if (!value)
                    return [{ type: 'text', text: '无返回内容' }];
                if (typeof value.result === 'string') {
                    return [{ type: 'text', text: value.result }];
                }
                return [{ type: 'text', text: JSON.stringify(value, null, 2) }];
            },
        },
        async execute(args, execContext) {
            const cwd = execContext?.cwd || process.cwd();
            const sessionId = execContext?.sessionId || execContext?.session?.id || process.env.DSH_SESSION_ID;
            // 1. 若显式指定了 gh_command，直接透传查询官方离线手册
            if (args.gh_command && typeof args.gh_command === 'string') {
                let parts = args.gh_command.trim().split(/\s+/);
                // 容错调用方输入 "gh pr create" 带有前导 "gh" 的情形
                if (parts[0] === 'gh') {
                    parts.shift();
                }
                const res = await executor.run(['help', ...parts], { cwd, sessionId, rawText: true });
                if (!res.ok) {
                    return {
                        result: `未找到命令「gh ${args.gh_command}」的官方帮助手册：${res.error}\n建议通过 topic 参数查询内置指南。`,
                    };
                }
                return { result: res.rawOutput };
            }
            // 2. 查询内置知识库速查表
            const topic = (args.topic || 'overview').toLowerCase();
            const content = KNOWLEDGE_BASE[topic];
            if (content) {
                return { result: content };
            }
            return {
                result: `未找到主题「${topic}」的指南。可用主题：${Object.keys(KNOWLEDGE_BASE).join(', ')}。`,
            };
        },
    };
}
