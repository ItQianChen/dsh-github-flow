const KNOWLEDGE_BASE = {
    overview: `### 🧭 DSH GitHub Flow 工具箱全景导航

本插件提供面向 DeepSeek Harness 的原生 GitHub 协作与智能体基础设施工具矩阵：

| 工具名称 | 核心职责 | 典型调用场景 |
| :--- | :--- | :--- |
| \`github_pr\` | Pull Request 管理、审查与本地检出 | 查看 PR 列表/详情、比对 diff、本地检出代码验证、检查 CI 状态、执行带确认合并 |
| \`github_issue\` | Issue 任务追踪与分支开发关联 | 筛选待办议题、追加评论、编辑标题/标签、从 Issue 一键切出关联开发分支 |
| \`github_run\` | Actions 构建排查与工作流管理 | 查看构建列表、提取失败日志 (log_failed)、重新触发、手动触发 workflow_dispatch、启停工作流、下载构建产物 |
| \`github_repo\` | 仓库元数据、Fork 同步与全局检索 | 查看仓库与 topics、一键拉平 Fork (sync)、检索代码/仓库/Issue/PR/提交、免 clone 读取任意文件与目录 |
| \`github_api\` | 原生 GitHub REST/GraphQL 逃生门 | 调用任意端点、获取原始文件字节 (raw)、支持自动翻页 (paginate) |
| \`github_release\` | 版本发布与构建资产交付 | 查看发版历史、自动生成 Release Notes、上传 .tgz 等构建产物 |
| \`github_secret\` | CI/CD 密钥与变量管理 | 查看 NPM_TOKEN 等密钥清单、经 stdin 安全写入密文、删除密钥；kind:'variable' 管理明文变量（set/get/delete） |
| \`github_skill\` | 跨 Agent 开源 Skills 生态发现 | 检索/预览/安装 GitHub 上的 Agent Skills (gh preview 特性) |
| \`github_help\` | 路由导航、官方语法速查与故障自愈 | 遇到不确定的操作、搜索语法或接口报错时查询用法与诊断配方 |

💡 **使用准则**：优先调用高层语义工具（pr / issue / run / repo / release / secret）；当高层工具无法满足特殊接口需求时，再降级使用 \`github_api\`。
🗺️ **命令对照**：不确定某 gh 命令对应哪个工具？\`github_help(topic: 'mapping')\` 查询完整映射表（含未覆盖域的 API 引导）。`,
    pr: `### 🔀 github_pr 详细操作指南

- **查看列表**: \`github_pr(action: 'list', state: 'open' | 'closed' | 'merged' | 'all', limit: 20, author: '@me')\`
- **下载并查看 PR 图片**: \`github_pr(action: 'view_images', pr_number: 123)\`
  - 提取范围覆盖 PR 正文 + 评论，经 gh api 下载（UI 变更对比图、复现截图等）到本地并以图片内容块返回，Agent 审查时可直接看图；魔数校验 + 字节护栏与 Issue 侧一致。
  - **按 URL 精准获取**: 附加 \`image_urls: [...]\` 只下载指定图片；触达目录上限时返回 remaining 清单可分批续传（与 Issue 侧用法完全一致）。
- **本地检出代码**: \`github_pr(action: 'checkout', pr_number: 123)\`
  - 自动切换到本地分支并拉取最新提交，非常适用于 Agent 在本地沙箱中跑单元测试验证 PR 改动。
- **差异比对**: \`github_pr(action: 'diff', pr_number: 123, stat_only: true)\`
  - 对于大 PR，强烈建议先开启 \`stat_only: true\` 查看改动文件概览，防止超大 diff 触发截断或撑爆上下文。
- **检查冲突状态**: \`github_pr(action: 'status')\`
  - 查看当前分支关联 PR 的 merge conflict 状态。
- **安全合并**: \`github_pr(action: 'merge', pr_number: 123, confirm: true, merge_method: 'squash', delete_branch: false)\`
  - 高危操作必须显式附带 \`confirm: true\`；若未传将返回拦截警告与待合并影响报告。
- **Draft 切换**: \`github_pr(action: 'ready', pr_number: 123)\`；反向转回 Draft 附加 \`undo: true\`
- **反向提交**: \`github_pr(action: 'revert', pr_number: 123, confirm: true)\`
  - 在远端创建反向提交与新 PR（非本地操作），需 confirm。
- **分支落后自愈**: \`github_pr(action: 'update_branch', pr_number: 123)\`
  - 将基准分支最新提交同步进 PR 分支，解决「分支落后需更新」的 CI 门禁失败。`,
    issue: `### 🎯 github_issue 详细操作指南

- **筛选 Issue**: \`github_issue(action: 'list', state: 'open' | 'closed' | 'all', labels: ['bug'], assignees: ['octocat'], limit: 20)\`
- **查看 Issue 附带截图**: \`github_issue(action: 'view', issue_number: 42)\`
  - 返回正文中的图片 URL 清单（用户拖拽上传的报障截图等）；需要"看图"时执行下方 view_images。
- **下载并查看 Issue 图片**: \`github_issue(action: 'view_images', issue_number: 42)\`
  - 经 gh api 下载正文+评论图片到本地（~/.dsh/data/dsh-github-flow/images/，内容寻址去重），以图片内容块返回，Agent 可直接查看用户报障截图；魔数校验 + 字节护栏（单图 5MB、目录 15MB）。
  - **按 URL 精准获取**: 附加 \`image_urls: ['<view 返回清单中的 URL>']\` 只下载指定图片（可单张可批量）；传入 URL 必须在清单内（防任意下载）。
  - 触达目录上限时返回 \`remaining\` 结构化清单，直接作为下一批 image_urls 续传即可。
- **关联开发分支**: \`github_issue(action: 'develop', issue_number: 42, branch_name: 'fix-login-bug')\`
  - 自动在远端和本地创建带有官方关联关系的开发分支并切换过去，实现“读需求 -> 开分支写代码”的无缝衔接。
- **编辑 Issue**: \`github_issue(action: 'edit', issue_number: 42, title: '新标题', add_labels: ['p1'], remove_labels: ['triage'])\`
- **追加讨论**: \`github_issue(action: 'comment', issue_number: 42, body: '定位到问题原因...')\`
- **安全关闭**: \`github_issue(action: 'close', issue_number: 42, confirm: true)\`
  - 关闭操作必须附带 \`confirm: true\`。
- **物理删除**: \`github_issue(action: 'delete', issue_number: 42, confirm: true)\`
  - 与 close 有本质区别：编号永久消失、评论湮灭、GraphQL 层无法恢复——拦截级别高于 close。
- **跨仓库迁移**: \`github_issue(action: 'transfer', issue_number: 42, target_repo: 'other/repo', confirm: true)\`
  - 原 URL 301 重定向，归属改变不可静默撤回。
- **置顶**: \`github_issue(action: 'pin'/'unpin', issue_number: 42)\`（可逆状态位）
- **锁定对话**: \`github_issue(action: 'lock', issue_number: 42, lock_reason: 'resolved')\`
  - reason 合法值：off_topic / resolved / spam / too_heated；解锁用 \`action: 'unlock'\`（独立命令）。
- **我的分配议题**: \`github_issue(action: 'status')\`（账号维度面板）`,
    run: `### 🚀 github_run 详细操作指南

- **过滤构建记录**: \`github_run(action: 'list', branch: 'main', status: 'failure', limit: 10)\`
  - 快速定位失败的 CI 构建，排查报错首选 \`status: 'failure'\`。
- **提取失败步骤日志**: \`github_run(action: 'log_failed', run_id: '12345678')\`
  - 专为 Agent 优化的失败信息提取能力，直接定位报错位置；若无失败步骤则优雅提示。
- **主动触发工作流**: \`github_run(action: 'trigger', workflow: 'pr-check.yml', ref: 'main', inputs: { env: 'staging' })\`
  - 提交代码修复后，主动触发远端 CI/CD 验证。
- **重新执行失败任务**: \`github_run(action: 'rerun', run_id: '12345678')\`
- **工作流查询**: \`github_run(action: 'workflow_list', all: true)\`
  - 默认仅 active；\`all: true\` 含 disabled（排查「工作流为何不跑」时 disabled 本身就是答案）。
- **工作流详情**: \`github_run(action: 'workflow_view', workflow: 'npm-publish.yml')\`（名称/ID/文件名均可定位）
- **启停工作流**: \`github_run(action: 'workflow_enable'/'workflow_disable', workflow: '…')\`
  - disable 后 trigger 将静默失败，直至重新 enable——输出会显式警告这一点。
- **下载构建产物**: \`github_run(action: 'download', run_id: '12345678', name: '构建产物名'?)\`
  - 落盘目录由插件固定管理（\`~/.dsh/data/dsh-github-flow/artifacts/\` 下按仓库与 run 隔离），返回文件清单。`,
    repo: `### 📦 github_repo 详细操作指南

- **查看元数据与标签**: \`github_repo(action: 'view')\`
  - 返回仓库基本信息、默认分支、Star 计数、许可证以及 \`repositoryTopics\`（用于 DSH 插件合规审查）。
- **读取 README 及截图**: \`github_repo(action: 'readme', repo: 'owner/repo')\`
  - 返回 README 原文与图片 URL 清单（仓库内相对路径自动解析为 raw 链接；默认过滤徽章小图标，\`include_badges: true\` 保留）。
  - **下载图片查看**: 附加 \`image_urls: [...]\` 精准下载指定图（留空下载全部截图）；护栏与 Issue/PR 图片一致，触顶返回 remaining 可续传。
- **一键拉平 Fork 主干 (防止 Stale)**: \`github_repo(action: 'sync', branch: 'main')\`
  - 解决开源项目贡献中因本地 Fork 落后导致上游 CI 门禁失败的顽疾。
- **代码检索**: \`github_repo(action: 'search_code', query: 'filename:package.json dsh.bundle')\`
- **Issue/PR/Commit 检索**: \`github_repo(action: 'search_issues'/'search_prs'/'search_commits', query: 'repo:o/r state:open')\`
  - 限定符直接写进 query（gh 惯例）；注意 commits 必须含搜索文本，纯限定符会被 gh 拒绝。
- **免 clone 读单文件**: \`github_repo(action: 'read_file', path: 'src/index.ts', ref: 'dev'?)\`
  - gh ≥2.95 直连；低版本自动降级 contents API（输出带降级标注）。二进制文件会被拒绝并引导 github_api。
- **免 clone 列目录**: \`github_repo(action: 'read_dir', path: '.github/workflows'?)\`
  - 返回目录清单（dir 置顶 + 大小），降级链路同上。`,
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
    release: `### 🏷️ github_release 版本发布指南

- **查看发版历史**: \`github_release(action: 'list', limit: 10)\`
- **查看某个版本详情**: \`github_release(action: 'view', tag: 'v0.1.9')\`（留空 tag 查看最新）
- **创建 Release（自动生成说明）**:
  \`github_release(action: 'create', tag: 'v0.1.9', generate_notes: true, prerelease: false)\`
  - 若远端尚无该 Tag，gh 会自动从 target 分支（默认主分支）最新提交打 Tag。
- **上传构建资产**:
  \`github_release(action: 'upload', tag: 'v0.1.9', assets: ['./dsh-github-flow-0.1.9.tgz'])\`
  - 覆盖同名旧资产必须附加 \`clobber: true, confirm: true\`（旧资产删除后不可恢复）。
- **下载资产**: \`github_release(action: 'download', tag: 'v0.1.9', pattern: '*.tgz', dir: './dist')\`
- **删除 Release**: \`github_release(action: 'delete', tag: 'v0.1.9', confirm: true)\`
  - 高危不可逆操作，必须显式确认。`,
    secret: `### 🔐 github_secret 密钥与变量管理指南

支持两类对象（kind 分流）：**Secret**（密文，默认）与 **Variable**（CI 明文变量）。

- **查看密钥清单**: \`github_secret(action: 'list')\`
  - 仅返回名称、可见性与更新时间；GitHub API 设计上就不允许读取密文。
- **设置/更新密钥（安全通道）**:
  \`github_secret(action: 'set', name: 'NPM_TOKEN', value: 'npm_xxxx')\`
  - 密文经子进程标准输入传递，绝不出现在命令行参数（防 ps 窃取），输出永不回显。
  - gh 在本地用仓库公钥加密后才上传，明文不落盘。
- **组织/环境级密钥**: 附加 \`org: 'my-org'\` 或 \`env: 'production'\` 参数切换作用域。
- **删除密钥**: \`github_secret(action: 'delete', name: 'NPM_TOKEN', confirm: true)\`
  - 删除后引用该密钥的 CI 工作流会立即失败，务必先确认无工作流依赖。
- **变量操作（CI 明文）**: 附加 \`kind: 'variable'\`
  - \`github_secret(action: 'set', kind: 'variable', name: 'DEPLOY_ENV', value: 'staging')\`——经 -b 直传（明文无 stdin 红线）。
  - \`github_secret(action: 'get', kind: 'variable', name: 'DEPLOY_ENV')\`——可回显值（这正是变量与密钥的设计区别：secret 写入后 GitHub 侧加密，物理不可读取）。
  - list/delete 与 secret 同形（delete 需 confirm）。`,
    skill: `### 🧠 github_skill Agent Skills 生态指南

基于 GitHub CLI 的 \`gh skill\` preview 特性（需 gh >= 2.9x），跨仓库发现与安装开源 Agent Skills：

- **检索 Skills**: \`github_skill(action: 'search', query: 'code-review', limit: 15)\`
  - 可附加 \`owner: 'github'\` 限定作者组织。
- **预览 Skill 内容**: \`github_skill(action: 'preview', repository: 'github/awesome-copilot', skill_name: 'code-review')\`
  - 只读不落盘，适合安装前审阅 SKILL.md 行为约束。
- **安装 Skill**:
  \`github_skill(action: 'install', repository: 'github/awesome-copilot', skill_name: 'code-review', agent: 'claude-code', scope: 'project', confirm: true)\`
  - install 会写本地磁盘，必须 \`confirm: true\`；scope 默认 project（当前 git 仓库）。
  - 支持的 agent 值：claude-code / cursor / github-copilot / codex / gemini-cli 等。
- **查看已安装**: \`github_skill(action: 'list')\`
- ⚠️ 若报「unknown command」，说明宿主机 gh 版本过低，需升级到 2.9x 以上。`,
    mapping: `### 🗺️ gh 命令 ↔ 插件工具映射总表

#### 一、已覆盖域映射（语义化 action 精确对照）

**PR（github_pr，13 action）**
| gh 命令 | 插件调用 | 备注 |
| :--- | :--- | :--- |
| \`gh pr list/view/create/diff/edit/comment\` | \`github_pr(action:'list'/'view'/'create'/'diff'/'edit'/'comment')\` | 高频基础操作 |
| \`gh pr close\` | 暂无专用 action——用 \`github_pr(action:'edit')\` 或 \`github_api(endpoint:'repos/{o}/{r}/pulls/{n}', method:'PATCH', fields:{state:'closed'})\` | 插件侧未覆盖 |
| \`gh pr checks\` | \`github_pr(action:'checks', pr_number:n)\` | CI 状态药丸 |
| \`gh pr review\` | \`github_pr(action:'review', review_decision:'APPROVE'…)\` | |
| \`gh pr merge\` | \`github_pr(action:'merge', confirm:true)\` | 高危确认 |
| \`gh pr checkout\` | \`github_pr(action:'checkout')\` | 本地检出 |
| \`gh pr status\` | \`github_pr(action:'status')\` | 当前分支关联 PR |
| \`gh pr ready [--undo]\` | \`github_pr(action:'ready', undo:true?)\` | Draft↔Ready 可逆 |
| \`gh pr revert\` | \`github_pr(action:'revert', confirm:true)\` | 远端创建反向 PR |
| \`gh pr update-branch\` | \`github_pr(action:'update_branch')\` | 分支落后自愈 |

**Issue（github_issue，16 action）**
| gh 命令 | 插件调用 | 备注 |
| :--- | :--- | :--- |
| \`gh issue list/view/create/comment/close/reopen/edit\` | \`github_issue(action:…)\` | 基础操作 |
| \`gh issue develop\` | \`github_issue(action:'develop', branch_name:…)\` | 关联开发分支 |
| \`gh issue delete\` | \`github_issue(action:'delete', confirm:true)\` | 物理删除（非 close） |
| \`gh issue transfer\` | \`github_issue(action:'transfer', target_repo:…, confirm:true)\` | 跨仓库迁移 |
| \`gh issue pin/unpin\` | \`github_issue(action:'pin'/'unpin')\` | 置顶状态位 |
| \`gh issue lock/unlock\` | \`github_issue(action:'lock', lock_reason:'resolved'…)\` | reason 四枚举 |
| \`gh issue status\` | \`github_issue(action:'status')\` | 我的分配议题面板 |

**Actions（github_run，11 action）——注意 workflow 域也在此工具**
| gh 命令 | 插件调用 | 备注 |
| :--- | :--- | :--- |
| \`gh run list/view/rerun/cancel\` | \`github_run(action:…)\` | |
| \`gh run view --log-failed\` | \`github_run(action:'log_failed', run_id:…)\` | 失败日志提取 |
| \`gh run download\` | \`github_run(action:'download', run_id:…)\` | 落盘插件管理目录 |
| \`gh workflow run\` | \`github_run(action:'trigger', workflow:…)\` | workflow_dispatch |
| \`gh workflow list/view\` | \`github_run(action:'workflow_list'/'workflow_view')\` | all:true 含 disabled |
| \`gh workflow enable/disable\` | \`github_run(action:'workflow_enable'/'workflow_disable')\` | disable 后 trigger 静默失败 |

**Repo（github_repo，10 action）——注意 search 域也在此工具**
| gh 命令 | 插件调用 | 备注 |
| :--- | :--- | :--- |
| \`gh repo view\` | \`github_repo(action:'view')\` | 元数据 |
| （README 读取，gh 无专用命令） | \`github_repo(action:'readme', repo:…)\` | 原文 + 图片清单/下载（插件独有） |
| \`gh repo sync\` | \`github_repo(action:'sync', force:true?)\` | Fork 对齐 |
| \`gh repo read-file\` | \`github_repo(action:'read_file', path:…)\` | 免 clone 读文件，gh<2.95 自动降级 API |
| \`gh repo read-dir\` | \`github_repo(action:'read_dir', path:?)\` | 目录清单，同上降级 |
| \`gh search code/repos\` | \`github_repo(action:'search_code'/'search_repos')\` | |
| \`gh search issues/prs/commits\` | \`github_repo(action:'search_issues'/'search_prs'/'search_commits')\` | 限定符写进 query |

**Release（github_release，6 action）**
\`gh release list/view/create/upload/download/delete\` → \`github_release(action:…)\`；delete/clobber 需 confirm。

**Secret 与 Variable（github_secret，kind 分流）——注意 variable 域也在此工具**
| gh 命令 | 插件调用 | 备注 |
| :--- | :--- | :--- |
| \`gh secret list/set/delete\` | \`github_secret(action:…)\` | 密文走 stdin，永不回显 |
| \`gh variable list/set/get/delete\` | \`github_secret(action:…, kind:'variable')\` | CI 明文：-b 直传、get 可回显 |
| （gh secret get 不存在） | — | GitHub 侧加密存储，物理不可读取 |

**Skill（github_skill，4 action）**
\`gh skill search/preview/install/list\` → \`github_skill(action:…)\`；install 需 confirm（写磁盘）。

#### 二、归属提示（命令域与工具名不同构）

- \`gh workflow …\` / \`gh search …\` / \`gh variable …\` 分别归 **github_run / github_repo / github_secret**（不是独立工具）
- \`gh api\` 的等价物是 \`github_api\`（全端点逃生门，支持 raw/paginate/jq）
- 图片查看：\`github_issue\`/\`github_pr\` 的 \`view_images\`、\`github_repo\` 的 \`readme\` + image_urls（插件独有能力，gh 无对应命令）

#### 三、未覆盖域引导（经 github_api 调用）

| gh 域 | 用途 | 推荐 REST 端点 |
| :--- | :--- | :--- |
| \`gh label\` | 标签管理 | \`repos/{o}/{r}/labels\` |
| \`gh cache\` | Actions 缓存 | \`repos/{o}/{r}/actions/caches\` |
| \`gh gist\` | 代码片段 | \`gists\` |
| \`gh ruleset\` | 分支保护规则 | \`repos/{o}/{r}/rulesets\` |
| \`gh project\` | Projects v2 | \`graphql\`（Projects API 仅 GraphQL） |
| \`gh discussion\` | 讨论 | \`graphql\`（需仓库开启 discussions） |
| \`gh codespace\` | 云端开发环境 | \`user/codespaces\` |
| \`gh org\` | 组织信息 | \`orgs/{org}\` |
| \`gh auth/config/extension/alias\` | 本机配置类 | 多数无需 API（本机文件/命令） |
| \`gh browse\` | 打开浏览器 | 直接给用户 URL 即可 |
| \`gh attestation/gpg-key/ssh-key\` | 签名与密钥 | \`repos/{o}/{r}/attestations\` 等 |
| \`gh agent-task\` | Copilot 会话 | \`graphql\`（需 Copilot 授权） |

> 用法示例：\`github_api(endpoint: 'repos/owner/repo/labels', method: 'POST', fields: { name: 'bug', color: 'ff0000' })\``,
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
   - *解法*：宿主机尚未安装 gh。Windows 运行 \`winget install GitHub.cli\`，macOS 运行 \`brew install gh\`，然后执行 \`gh auth login\` 登录。
 5. **报 \`unknown command "skill" for "gh"\`**:
    - *原因*：\`gh skill\` 是 GitHub CLI 2.9x 引入的 preview 特性，宿主机版本过低。
    - *解法*：升级 gh（Windows: \`winget upgrade GitHub.cli\`；macOS: \`brew upgrade gh\`）后重试；升级前可改用 \`github_api\` 检索 \`SKILL.md\` 文件路径作为替代。`
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
                        'release',
                        'secret',
                        'skill',
                        'mapping',
                        'search_syntax',
                        'troubleshooting',
                    ],
                    description: '帮助主题分类。mapping 提供 gh 命令与插件工具的完整对照表（不确定某 gh 命令对应哪个工具时查询）。留空则返回全局工具箱导航。',
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
            // 类型防护：DSH 网关对 enum 参数的拦截强度依赖实现，Agent 仍可能传非字符串
            // （数字/对象/数组）。`-1 || 'overview'` 真值短路挡不住负数，会炸 toLowerCase。
            // 与上方 gh_command 分支的 typeof 防护保持同一强度。
            const rawTopic = typeof args.topic === 'string' && args.topic.trim() ? args.topic : 'overview';
            const topic = rawTopic.toLowerCase().trim();
            const content = KNOWLEDGE_BASE[topic];
            if (content) {
                return { result: content };
            }
            return {
                result: `未找到主题「${rawTopic}」的指南。可用主题：${Object.keys(KNOWLEDGE_BASE).join(', ')}。`,
            };
        },
    };
}
