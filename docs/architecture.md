# DSH GitHub Flow 架构与设计规范 (Architecture & Specs)

`dsh-github-flow` 是为 DeepSeek Harness (DSH) 打造的原生 GitHub 工作流集成插件，基于底层 Cordis 微内核架构与宿主机原生 GitHub CLI (`gh`) 构建。

---

## 1. 架构全景图

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                             DeepSeek Harness Host                           │
│                                                                             │
│  ┌────────────────────────┐                   ┌──────────────────────────┐  │
│  │   Cordis Context (ctx) │                   │      PluginConfig        │  │
│  │   - inject: tools, cmd │                   │(Schemastery 运行时校验)   │  │
│  └───────────┬────────────┘                   └─────────────┬────────────┘  │
│              │                                              │               │
│              ▼                                              ▼               │
│     ┌──────────────────────────────────────────────────────────────┐        │
│     │               GitHubService (ctx.github 原生服务)             │        │
│     │   - checkAuth(cwd)      - getRepoMetadata(cwd)               │        │
│     │   - run<T>(args, opts)  [execFile 数组隔离 + 24KB 智能截断]     │        │
│     │   - runGuarded({minVersion,fallback})  [gh 版本守卫降级链]      │        │
│     │   - getGhVersion() [30s TTL 缓存·只存成功值]                    │        │
│     │   - AI_AGENT=dsh 注入 [gh 官方 agent 识别·可配置开关]            │        │
│     │   - UpdateChecker (源可选探测 + 24h 缓存 + Fail-Safe)          │        │
│     │   - UpgradeManager (跨平台自适应 + 互斥锁 + macOS PATH 补全)   │        │
│     │   - ProxyManager (环境变量集中路由 + 统一网络分发)             │        │
│     │   - 模块化子系统 (src/executor/):                             │        │
│     │     · git-parser.ts (无 I/O 纯文本解析纯函数)                 │        │
│     │     · version-utils.ts (语义化版本比较纯函数)                 │        │
│     │     · process-utils.ts (spawnWithStdin 密文流控与字节截断)    │        │
│     │     · platform-guide.ts (跨平台安装引导与升级建议)            │        │
│     └──────┬───────────────────────┬────────────────────────┬──────┘        │
│            │                       │                        │               │
│            ▼                       ▼                        ▼               │
│  ┌──────────────────┐    ┌──────────────────┐    ┌───────────────────────┐  │
│  │  19 大 Agent 工具 │    │  人类 Slash 指令 │    │   Host HTTP WebServer │  │
│  │  (手写descriptor)│    │  /gh status      │    │ (Effect Disposer 清理)│  │
│  │  - pr (+attach)  │    │  /gh upgrade     │    │ - /api/github/overview│  │
│  │  - issue (+attach│    │  /gh help        │    │ - /api/github/action  │  │
│  │  - run (workflow)│    └──────────────────┘    │ - /api/github/refresh │  │
│  │  - repo (read/sr)│                            │ - /api/github/branches│  │
│  │  - api (逃生门)  │  (workflow_enable/disable │  │ - /branch-switch      │  │
│  │  - release       │   启停·list/view·download) │ - /api/github/git-    │  │
│  │  - secret & var  │                            │   watch (定向监听)    │  │
│  │  - skill (+pub/up│  (search 三域=issues/prs/ │ - /check-update (并行)│  │
│  │  - label (CRUD/cl│   commits; read_file/dir)  │ - /upgrade (一键自动) │  │
│  │  - ruleset(check)│                            │ - /update-settings    │  │
│  │  - cache (治理)  │                            │ - /proxy (全局代理)   │  │
│  │  - gist (分享)   │                            │ - /auth (轻量探针)    │  │
│  │  - status (健康) │                            │ - /issue-detail       │  │
│  │  - agent_task    │                            │ - /pr-detail (PR 审阅)│  │
│  │  - discussion    │                            │ - /run-detail (Run)   │  │
│  │  - project (v2)  │                            └──────────┬────────────┘  │
│  │  - codespace(MVP)│                        ┌───────────────────────────┐  │
│  │  - help (元指南) │                        │ git-watcher (独立服务)    │  │
│  └────────┬─────────┘                        │ - .git/HEAD & index       │  │
│           │                                  │ - 800ms 防抖/35s 超时     │  │
│           │                                  └───────────────────────────┘  │
│           ▼                                                 │               │
│  ┌──────────────────────────────────┐                       │               │
│  │ Markdown 渲染引擎 (renderers/)   │                       │               │
│  │ - common.ts: 单元格清洗/通用徽章 │                       │               │
│  │ - 15领域模块: pr/issue/run/repo/ │                       │               │
│  │   release/skill/label/ruleset/   │                       │               │
│  │   cache/gist/status/agent-task/  │                       │               │
│  │   discussion/project/codespace   │                       │               │
│  │ - 统一门面出口 markdown.ts 兼容  │                       │               │
│  └──────────────────────────────────┘                       │               │
│           │                                                 │               │
│           ▼                                                 ▼               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ 遥测审计系统 (src/telemetry.ts ➔ Cordis tools/result 事件切面)        │  │
│  │ - TelemetryRingBuffer (固定 200 条无锁环形队列，常驻内存 <200KB)      │  │
│  │ - 实时计算 API 降级率 (Degradation Rate) 与工具链健康分 (0-100 分)     │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┬───────────────┘
                                                              │
┌─────────────────────────────────────────────────────────────┼───────────────┐
│                        DSH Web Client                       ▼               │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ 模块化 UI 架构 (src/ui/ ➔ 经 scripts/build.mjs 拓扑聚合单一 Bundle)  │   │
│   │                                                                     │   │
│   │  · styles.ts (自适应 CSS, 构建期紧凑压缩)                          │   │
│   │  · icons.ts (Octocat, Git 官方菱形分支矢量组件, 插件徽标)           │   │
│   │  · storage.ts (LocalStorage SWR 状态机与偏好存储)                   │   │
│   │  · components/ (分支下拉/认证引导/升级通知/离线横幅/状态胶囊)       │   │
│   │  · modals/ (Commit 详情弹窗 / PR 审阅工作台 / Issue 在线查看 / 全局设置弹窗)  │   │
│   │  · panels/ (首页全景大面板 workspace-panel.ts)                      │   │
│   │                                                                     │   │
│   │ 核心组装入口 (src/client.ts, 高内聚):                              │   │
│   │  - applyTabState (纯 DOM 互斥状态应用, 满足单测白盒契约)            │   │
│   │  - renderGithubRepoView (五 Tab 核心视图: Git/未提交/PR/Issue/Run)   │   │
│   │  - GithubRightbarBody (右侧栏主体, 状态引用解耦与时序安全守护)       │   │
│   │  - apply(ctx) (Cordis Client 插件安装入口与槽位注入)                │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 核心设计原则

### 2.1 零凭证侵入 (Zero-Credential Store)
- 严禁在 DSH 内部配置或持久化存储任何 GitHub PAT 明文密钥；
- 直接复用宿主机由 `gh auth login` 认证的安全凭证（系统 Keychain / Windows Credential Manager / 系统的加密存储）；
- 天然支持多账号、企业 GitHub (GH Enterprise) 以及各种 OAuth 作用域。

### 2.2 工作区深度亲和与零参数探测 (Workspace Affinity & Auto-Binding)
- 结合 `$env:DSH_SESSION_ID` 逆向解析 `~/.dsh/storages/workspace.json`，自动锁定当前活跃会话物理工作区；
- 原生免子进程直接读取工作区 `.git/config`，自动识别远程仓库，免去大模型或人类每次传递 `owner/repo` 的繁重上下文负担；
- 具备离线优雅兜底机制，无论在何种受限环境下调用均不崩溃。

### 2.3 上下文 Token 保护与防御性输出包装 (Token Budget Guard)
- 所有的 `gh` 查询原生采用 `--json <fields>` 结构化投影；
- 对长文本输出（如大型 PR 的完整 `diff`、CI 失败步骤日志）设置安全截断阈值（默认 24KB），采用码点安全切割与二分查找字节截断（`src/executor/process-utils.ts`），保留头尾关键上下文并添加显式截断标记，杜绝撑爆模型上下文；**程序化消费的大载荷可按调用点显式放宽**（PR diff 与 Issue 详情放宽至 2MB 字符 / 8MB 字节），因为这两类数据只在服务端切片后渲染，不进入模型上下文；**且一旦真的被截断必须显式失败**——截断会让 `JSON.parse` 被跳过、`data` 变 `undefined`，静默降级会渲染出「元数据全空 + 零评论」的假详情；
- 列表与详情输出经独立 Markdown 渲染引擎（`src/renderers/` 15 大领域模块 + `common.ts` + `markdown.ts` 门面）转化为高密度表格与卡片（带状态徽章、可点击超链接与竖线转义防护），实测 20 条 PR 列表输出压缩 70%+ Token；
- 所有 Agent 工具的输出统一经过归一化，列表自动打包为 `{ items, count }`，标量打包为 `{ result }`，100% 严丝合缝契合 DSH 工具网关模式约束；
- **gh 版本守卫降级链（runGuarded）**：preview 命令与新特性按 `minVersion` 门槛路由——版本达标直通主命令、不足走 `fallback` 降级链路（结果携带 `degraded/degradedReason` 结构化标注，**降级不是静默的**，渲染层对 degraded 结果显式追加链路说明）、无降级时报错附平台升级指引；版本探测自身失败 fail-open 直通（守卫是路由优化不是安全边界）。版本比较采用数值分段（`src/executor/version-utils.ts`，杜绝 `'2.96.0' > '2.100.0'` 字典序陷阱），探测结果 30s TTL 缓存且只缓存成功值；
- **AI_AGENT 识别信号注入**：每次 gh 子进程启动注入 `AI_AGENT=dsh`（gh detect.go 最高优先级通用信号）——gh ≥2.99 自动切换 text-only spinner、≥2.100 命令误用时打印完整 help（模型可据此自我纠正）、telemetry 归因到 dsh；旧版 gh 忽略该变量零副作用。经 `agentEnvInjection` 配置开关（默认开启）可恢复 gh 原生行为。

### 2.3.1 高危操作确认与敏感值安全通道 (Safety Confirmation & Secret stdin Channel)
- 不可逆写操作（`merge` / `close` / `issue delete`（物理删除）/ `issue transfer`（跨仓库迁移）/ `pr revert`（远端创建反向 PR）/ `release delete` / clobber 覆盖上传 / `secret delete` / `skill install` / `skill publish`（创建 Release）/ `label delete`（物理删除且解绑）/ `cache delete all`（全量清空缓存）/ `gist delete`（代码片段永久删除）/ `codespace delete`（销毁开发机）/ `project item-delete`（移除看板条目））强制要求 `confirm: true` 显式参数，未确认时仅返回影响评估卡片，不产生任何远端或本地副作用；
- 密钥明文仅经子进程标准输入传递（`spawnWithStdin` 通道：`spawn` + `stdin.end(data)` 半关闭写入），全程不出现在命令行参数、进程列表与工具输出中；渲染层对 secret 输出采用独立实现，从结构上隔离「绝不渲染 value 字段」这条安全红线。

### 2.3.2 产物落盘纪律 (Artifact Download Discipline)
- **目录固定派生，永不暴露路径参数**：构建产物下载（`run download` 等）的落盘目录由插件从 `~/.dsh/data/dsh-github-flow/artifacts/<owner>/<repo>/<run_id>/` 三级固定派生，不向调用方暴露任何目录参数——这是 GHSA-39wj-f2f4-978v（gh <2.102 符号链接路径穿越）的核心防线；
- **低版本安全提示而非硬拒绝**：gh <2.102 时下载仍可执行，但返回值携带 `securityNote` 升级指引；需要自定义落盘位置的场景显式引导经 `github_api` 手动拉取；
- **下载后零本地符号化操作**：插件对落盘产物仅做递归枚举（相对路径 + 大小清单），不执行链接、移动或执行类操作。

### 2.3.3 本地文件入参 (Local File Inputs)
- **与 §2.3.2 方向相反，但不放松那条防线**：§2.3.2 管的是**产出写盘**——落盘路径由插件派生、绝不接受调用方给的路径（GHSA-39wj-f2f4-978v 防线）；本节管的是**输入读盘**——路径由调用方显式给出，插件只读。两条控制流不共享任何代码路径：读进来的字节只进正文，不落盘、不回写、不参与任何目录派生，因此不会把「路径参数」重新引进下载/写盘通道；
- **统一入口与统一校验**：`src/tools/body-input.ts` 的 `resolveBodySource` 是唯一实现（纯函数、零 gh 依赖），issue / pr / discussion / release / task / api / agent-task 只传各自的 flag 与字段名，杜绝「某条通道忘了校验」。相对路径按当前工作区解析、绝对路径原样使用；文件必须存在且是普通文件、不超过 4MB、严格 UTF-8 解码（GBK/ANSI 存的中文 md 直接报错而不是产出乱码）、含 NUL 字节视为二进制拒绝、BOM 剥除；
- **长度口径分层**：GitHub 正文（Issue / PR / 评论 / 讨论）统一 65,536 字符上限，超限显式拒绝并提示拆分；**发版说明（`notes_file`）与 `github_api` 的 `input_file` 不套用这条口径**——前者在 GitHub 侧的上限宽得多，后者是请求体不是正文，两者都只保留 4MB 字节护栏，真正超限交由 GitHub 报错（错误信息带字段名，可定位）；
- **二选一而非优先级**：`body` 与 `body_file`（`notes` 与 `notes_file`、`prompt` 与 `prompt_file`）同时出现即报错，不做静默覆盖——模型拿到一次明确失败，远好过「不知道哪一份真正生效」；空文件等同于没有正文。内联旧路径的 argv 与引入本能力前**逐字节一致**，新通道只在真的传了 `*_file` 时才改变 argv；
- **为什么不让 gh 自己读文件**：`gh pr review` 没有行级参数，行级评注的唯一通道是 `POST /pulls/{n}/reviews`（REST），那条链路根本没有 `--body-file` 一类 flag，只能插件侧读文件后写进 JSON 请求体。若 CLI 走 `--body-file -`、REST 各写一份，必然漂移成「带 comments 时 body_file 静默失效」；因此统一为**插件读一次** → CLI 通道 `[fileFlag, '-']` + stdin、REST/GraphQL 通道直接用文本。

---

## 3. 工程解耦与单文件瘦身规范 (Modularization Specs)

为彻底解决单文件臃肿过长（如旧版 `client.ts` 超过 5,200 行、`executor.ts` 超过 1,100 行）的技术债，项目已全面落地分层解耦与自包含构建规范：

### 3.1 后端执行引擎分层 (`src/executor/`)
- [src/executor.ts](../src/executor.ts)（瘦身至只保留编排层）：保留 `GhExecutor` 类核心编排（命令白名单、执行通道、认证与版本缓存），完整 Re-export 子模块符号，保持 100% 向后兼容；
- [src/executor/git-parser.ts](../src/executor/git-parser.ts)：纯文本解析器（`status -sb`、`log`、`branch -a`），无 I/O、无副作用；
- [src/executor/version-utils.ts](../src/executor/version-utils.ts)：语义化版本数值分段比对纯算法；
- [src/executor/process-utils.ts](../src/executor/process-utils.ts)：`spawnWithStdin` 进程管道流控与 UTF-8 字符边界截断算法；
- [src/executor/platform-guide.ts](../src/executor/platform-guide.ts)：跨平台 CLI 安装引导与升级命令文本生成；
- [src/tools/body-input.ts](../src/tools/body-input.ts)：正文入参解析纯函数（工具层共享，非执行引擎模块）——`resolveBodySource` 与 `GITHUB_BODY_MAX_CHARS` / `BODY_FILE_MAX_BYTES`，供 issue / pr / discussion / release / task / api / agent-task 复用，零 gh 依赖、无副作用，纪律见 §2.3.3。

### 3.2 渲染层领域化细分 (`src/renderers/`)
- [src/renderers/markdown.ts](../src/renderers/markdown.ts)：门面出口，统一聚合 Re-export 全部领域子模块；
- [src/renderers/common.ts](../src/renderers/common.ts)：表格单元格字符净化、各类状态药丸 Emoji 徽章、API 降级透明注解；
- 15 大领域独立渲染模块：`pr.ts` / `issue.ts` / `run.ts` / `repo.ts` / `release.ts` / `skill.ts` / `label.ts` / `ruleset.ts` / `cache.ts` / `gist.ts` / `status.ts` / `agent-task.ts` / `discussion.ts` / `project.ts` / `codespace.ts`，彻底实现高内聚低耦合，避免跨工具改动冲突。

### 3.3 本地 Git 元数据监听服务 (`src/git-watcher.ts`)
- 独立底层服务模块，彻底剥离路由控制器内部的物理文件系统监听与定时器杂糅；
- 靶向非递归监听 `.git/HEAD` 与 `.git/index`，内置 800ms 防抖合并、35s 超时熔断与物理句柄安全释放；
- 使 [src/api/routes-actions.ts](../src/api/routes-actions.ts) 彻底移除对 `node:fs` 与 `node:path` 的直接依赖，路由函数回归纯粹的 HTTP 请求接收与响应。

### 3.4 前端客户端解耦与自包含 Bundle 机制 (`src/ui/` + `src/client.ts`)
- **源码物理剥离**：
  - [src/client.ts](../src/client.ts)（保留右侧栏协同层与插件入口）：保留右侧栏核心协同 `renderGithubRepoView` 与 `GithubRightbarBody` 及插件入口；新增 UI 优先下沉到 `src/ui/`，不在入口文件里堆叠；
  - **21 个独立子模块**下沉至 [src/ui/](../src/ui/) 目录：样式（最大的单模块）、全景大面板、PR 审阅弹窗、Issue 查看弹窗、Run 详情弹窗、设置弹窗、使用指南；文件 Diff 能力拆成两个模块——`diff-utils.ts`（整包 Unified patch 的切分/重命名归一纯函数，零 React 依赖、可独立单测）与 `file-diff-modal.ts`（提交详情与未提交清单共用的 Diff 弹窗）；
    > 这里刻意不写绝对行数。行数会随每次重构变化，而本文档没人会跟着改——历史上同一个 `client.ts` 在本文件里同时存在「~1,260 行」与「约 2,400 行」两个互斥数字，`executor.ts` 也写着早已失效的「~820 行」。需要精确数字请直接看文件。
- **命名空间防护**：
  - 严禁在与 `package.json` 的 `exports["./client"]` 同级创建名为 `client/` 的目录，统一命名为 `src/ui/` 与编译产物 `lib/ui/`，彻底杜绝模块解析器产生“同名文件 vs 目录”的歧义报错；
- **自包含 Bundle 聚合器 (`scripts/build.mjs`)**：
  - 构建脚本按严格拓扑顺序将 `lib/ui/` 子模块内联注入 `lib/client.js` 的 `window.__ModuleLoader__.load` 闭包中，移除 `export` 关键字；
  - **顺序即依赖**：`markdown-lite → pr-modal → issue-modal → …` 不可随意重排（`issue-modal` 复用了 `pr-modal` 的 `CollapsibleBody`）；`workspace-panel` 置于后置列表，保证 `GithubRightbarBody` 位于 `GithubWorkspacePanel` 之前；
  - 对嵌入的纯 CSS 实施紧凑压缩；压缩后强制校验「无注释定界符残留 / 无行首 `*` 悬空段 / 花括号配平」，任一项不过直接构建失败——非法 CSS 会被浏览器**静默丢弃整条规则**，只表现为「样式莫名不生效」，极难排查；
- **React Hook 时序安全防线**：
  - 全部 Hook（含 `useEffect`）必须位于任何 early return 之前，否则「参数由空变有值」时两次渲染的 Hook 数量不一致，触发 `Rendered fewer hooks than expected` 崩溃；
  - `renderGithubRepoView` 这类每次渲染都重新执行的普通函数内**禁止**调用 Hook，状态必须住在有 Hook 的组件体内再传参；
  - 组件内引用的 `useRef`（如 `containerRef`）必须在组件声明最前列初始化，严禁跨行下置引发变量提升 `undefined`；所有的 Ref 访问点必须配备 `containerRef && containerRef.current` 守卫。

### 3.5 客户端加载器：对宿主 client 契约的适配层

`src/client.ts` 里的 `window.__ModuleLoader__.load({ id, factory })` **不是本插件的设计，而是宿主客户端的加载契约**：

- 全局声明在 `src/client.ts` 顶部（`Window.__ModuleLoader__`），唯一调用点在文件末尾的 `load({ id: "dsh-github-flow", factory })`；
- `factory` 收到的 `require` 是**宿主注入的模块解析器**（`react`、`react-dom` 等由宿主提供，插件不打包也不得打包自己的副本），`id` 必须与 `package.json` 的 `dsh.client.entry` 归属一致；
- 该 API **不是官方公开文档化的稳定接口**，语义由宿主实现决定。一旦宿主调整加载方式，**只改这一层**，`src/ui/` 下的 19 个子模块一行都不用动；
- 因为它是"适配层"，`test/phase36-host-contract.test.mjs` 对它的**形状**做了断言（入口存在、id 固定、`apply`/`inject` 已导出、20 个子模块全部内联、闭包内无残留 ESM `export`），而不是只靠"跑起来没报错"来验证。

### 3.6 本地开发联调机制 (Local Development & Junction Linking)

当开发者在本地克隆代码库进行定制与二次开发时，需严格遵循本地联调机制：

1. **Junction 目录联接直通机制**：
   - DSH 宿主环境的各个 Profile（如 `~/.dsh/profiles/web`、`~/.dsh/profiles/desktop`）采用 pnpm 管理依赖。若通过 `file:` 协议安装插件，pnpm 会将其作为独立快照拷贝到 `node_modules` 中，并在后续操作中直接复用内容缓存哈希（`resolved 0, reused 1`）；
   - 同时，DSH 内置的 pnpm (v11.x) 默认开启严格构建拦截策略，当检测到本地依赖包含 `prepare: "pnpm run build"` 脚本时，会直接抛出 `ERR_PNPM_IGNORED_BUILDS` 阻断安装；
   - **解法**：在 Windows 环境下将 Profile 的 `node_modules\dsh-github-flow` 替换为指向本地 Git 工作区根目录的原生 **Junction（目录联接）**，直接消除拷贝过程，实现工作区产物与宿主运行时的物理同一性。
2. **两阶段生效边界（编译与热刷新）**：
   - 宿主加载的入口为编译后的 `lib/main.js` 与 `lib/client.js`，修改 `src/` 源码后必须执行 `pnpm run build` 生成最新产物；
   - **纯前端 UI / 样式变更**（`src/client.ts`、`src/ui/`）：由于 DSH Web 客户端在页面载入时实时读取静态资源，按 **Ctrl + F5 强制刷新浏览器**即可即时呈现最新视图，**无需重启 DSH 进程**；
   - **后端服务 / 执行引擎 / 工具实现**（`src/tools/`、`src/api/`、`src/executor.ts`、`src/main.ts`）：受 Node.js 底层 ESM 模块缓存机制限制，必须**重启 DSH 进程**才能完成服务重载。
3. **联接保护与自愈**：
   - 切勿在已建立 Junction 的 Profile 目录下执行 `dsh plugin install` 或 `pnpm install`，以防包管理器抹除联接并退化为静态拷贝；
   - 若联接失效或被覆盖，可使用以下命令一键恢复直通：
     ```powershell
     New-Item -ItemType Junction -Path "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-github-flow" -Target "D:\Desktop\AgentWork\DSHQuestion\dsh-github-flow" -Force
     ```

---

## 4. 自动化测试体系 (Test Suite)

项目配备了 **57 个独立阶段的全量自动化回归测试套件（`test/run-all.mjs`）**，合计 **3400+ 项断言**（精确条数以 `node test/run-all.mjs` 末尾的汇总输出为准，此处只给量级）：
- 阶段数与 `test/run-all.mjs` 的 `phases` 数组由 `test/phase35-doc.test.mjs` 对账，改一处漏一处会直接红；
- `phase1`：Issue / Run / PR / Repo / Help 命令装配与确认门禁；
- `phase2`：Native Markdown 渲染与 Token 压缩率实测（>60% 降幅）；
- `phase3`：Release 资产交付、Secret 密文管道与 Skills 检索；
- `phase4`：工具装配完整性、版本一致性拦截与模糊边界防护；
- `phase5`：网络代理配置有效性校验、环境注入与容灾降级；
- `phase6`：插件版本更新检测、多源选择与跨平台自升级调度；
- `phase7`：终端唤起真实反馈、更新源设置 UI 锚点与 45s 数据链路超时保护；
- `phase8`：图片链接提取与图片下载；
- `phase9`：README 提取与相对路径解析；
- `phase10`：版本守卫降级链（runGuarded）、AI_AGENT 注入与命令白名单；
- `phase11`：右侧栏五 Tab 响应式互斥、Git 提交记录与滑动分页；
- `phase12`：工作区物理所有权隔离、SWR 离线快照防抹杀与安全分支切换；
- `phase13`：云端定时自动同步生命周期、三选一互斥设置模型与右侧栏独占本地 git-watch 监听；
- `phase14`：github_label（标签体系CRUD与克隆）与 github_ruleset（保护策略排障）；
- `phase15`：github_cache（构建缓存治理）与 github_gist（代码片段与排障留痕）；
- `phase16`：github_status（全局待办大盘）与 attach_images（图片附件上传通道）；
- `phase17`：github_skill publish（agentskills.io 规范自检、--fix 修复与发布闭环）；
- `phase18`：github_agent_task（云端编码智能体会话）与 github_discussion（社区讨论与RFC）；
- `phase19`：github_project（Projects v2 看板）、github_codespace（云端开发机）与 skill update；
- `phase20`：TelemetryRingBuffer、Cordis tools/result 事件总线运行时遥测、降级率统计与健康度看板；
- `phase21`：未提交数据滚动分页、文件级 Diff 二级下钻与 DSH 原生打开文件联动；
- `phase22`：remote 配置指纹与缓存失效契约（parseRemoteUrls 段扫描、指纹对书写顺序/命名免疫、worktree `.git` 指针解析、TtlCache 指纹命中与保守失效）；
- `phase23`：离线身份解析对齐 git 规则（branch.<当前分支>.remote → origin → 首个三级回落、`.` 特殊值、六种 URL 形态、worktree HEAD/config 分居、旧「取第一个 github.com」正则移除断言）；
- `phase24`：仓库拓扑与权限字段（isFork / parent 拼接 / viewerPermission 五档白名单）、远程布局四分类（github-only / mixed / no-github / no-remote）与混合布局的顺序免疫选择、默认分支从 refs/remotes/<remote>/HEAD 符号引用动态推断；
- `phase25`：右侧栏仓库徽章可视化（resolveRepoBadges 纯函数：fork 徽章与血缘行、READ/TRIAGE 只读徽章、可写与未知权限零徽章、parent.url 协议白名单防 javascript:/data: 注入）、bundle 内联断言与「零新增网络往返」静态约束；
- `phase26`：写操作权限自愈（GraphQL 权限错误补入确定性分类、permissionRemedy 按 Triage/Write/Admin 三档给出可操作指引并拼入 error 供模型自愈、限流 403 不误判、非权限错误零噪音、前端快捷按钮保持可用的防回退断言）；
- `phase27`：关联仓库自由切换（getAssociatedRepos 双 remote / Fork+Parent 纯本地多仓推导、RepoSelectorDropdown 下拉组件、setDefaultRepo 官方 set-default 对齐与防注入白名单、Fork 血缘行一键双向快捷切换）；
- `phase28`：PR 在线审阅工作台与主面板标签页解耦（splitUnifiedDiff 按文件切片索引、core.quotePath 八进制转义还原、含 ` b/` 路径的等值分割判定、删除文件路径回退、getPrDetail 参数白名单与 diff 阈值放宽不被截断、响应体不回传 fullDiff 防膨胀、**行级审查评论独立 API 通道 + original_line 回退 + 失败降级**、/api/github/pr-detail 路由真实调用与 405/400/500 错误路径、**action/branch-switch 请求体 256KB 上限与 413 行为验证**、主面板 mywork 拆为 prs/issues 四标签页、React Hooks 顺序静态防回退）；
- `phase29`：数据可见性与 PR 弹窗交互（PR/Issue 查询移除 `--state=open` 硬过滤并补齐 state 字段、clampFilePaneWidth 纯函数边界与容器极窄保下限、文件区布局偏好 localStorage 往返与脏数据回退、分隔条拖拽 document 级监听与卸载兜底清理、折叠双恢复入口、**PR 标题行与 GitHub 跳转按钮同行（min-width:0 + flex-shrink:0 防长标题挤出）**、空态区分「筛选为空」与「账号无记录」）；
- `phase30`：PR 弹窗 Markdown 渲染与滚动适配（markdown-lite 零依赖解析器：标题/粗斜体/行内码/围栏代码块/列表/引用/分隔线/任务列表；链接协议白名单拒绝 javascript:/data:/vbscript:/协议相对；HTML 标签降级为纯文本；**正文图片按 URL 直连渲染、不下载落盘**——只内联 GitHub 资产域（user-attachments / user-images / private-user-images / raw / camo），并强制 `referrerPolicy="no-referrer"` 与 `loading="lazy"`，非白名单域与 http 图退化为可点外链，既看得到图又不把宿主来源漏给第三方图床；estimateContentLines 折叠阈值估算；卡片 flex:0 0 auto 修复「长内容无法滚动」；CollapsibleBody 提升到模块顶层避免内联组件导致展开状态被重置）。
- `phase31`：Issue 在线查看工作台（getIssueDetail 参数白名单含小数/负数拒绝、**2MB 字符阈值防长讨论被截断成假空详情**、老版本 gh `Unknown JSON field` 的 BASE 字段降级链与 fieldsDegraded 标记、非字段类失败不重试、截断与解析缺失显式失败并给出浏览器直达链接、state/author/labels/milestone/subIssuesSummary/closedByPullRequestsReferences 归一化、SPAM 隐藏评论标记保留、图片清单正文+评论合并去重、/api/github/issue-detail 路由 200/400/405/500 全路径、action 通道 issue_detail 对称可用、主面板与右侧栏 Issue 卡片改点击进弹窗 + 同行 GitHub ↗ 外跳 stopPropagation + 卡片禁内联 flex 布局、onSelectIssue 追加在形参末尾、React Hooks 顺序与 bundle 三模块拓扑顺序防回退）。
- `phase32`：右侧栏 PR/Issue 状态筛选（**单仓库查询显式 `--state all`**，修复「只显示已打开」根因——gh 默认 state 就是 open，数据在到达浏览器前已被过滤；条数上限 10→20 并抽成 RIGHTBAR_LIST_LIMIT 常量，依据 `gh pr list` 按 number 降序而非 updatedAt，取 10 条时非 OPEN 仅剩 5 条；触顶下发 prsTruncated/issuesTruncated 并渲染提示；PR 四档 all/open/merged/closed 与 Issue 三档 all/open/closed 胶囊复用既有样式类、计数先于过滤保证数字反映全量；偏好按 cwd 隔离存储、非法值与脏 JSON 归一回退、大写输入归一；空态区分「仓库无记录」与「筛选无结果」并给切换引导；Hook 位置（不可落在 renderGithubRepoView 内）、切仓库对齐只依赖 cwd、**作用域键无碰撞（/a/b 与 /a_b 不得压成同一个键）**、卡片布局纪律防回退）。
- `phase33`：使用指南内容与代码事实对账（help-modal 从 4 Tab 扩到 5 Tab，新增「18 大工具速查」；**工具数量对 src/main.ts 的工具工厂注册语句数量、action 总数对 src/tools 的 enum 累计、Tab 名称对 TAB_DEFS 与 workspace-panel 逐个核对**，代码演进而指南没跟上即失败；覆盖 PR/Issue 在线弹窗、状态筛选三档、Markdown 渲染、仓库切换器、提交详情、Diff 下钻、view_images 等近期能力；FAQ 扩至 6 条含「列表为空但网页有记录」与「为何需重启 DSH」；**防编造断言：指南中每条 `gh auth refresh -s <scope>` 必须能在源码找到出处**；**github_help 知识库同步对账：mapping 表声明的每组 action 数逐个对 src/tools 的 enum 长度、每个业务 action 必须在知识库有落点、规模口径统一为「18 工具 / 103 业务 action」（排除 help 的 21 查询主题与 api 的 4 HTTP method），Agent 侧知识库与 UI 侧使用指南必须同口径**）。
- `phase34`：**gh CLI 契约测试**（离线采集 18 工具 × 103 action 的全部 argv，逐条校验下发的每个 flag 与 `--json` 字段都真实存在于缓存下来的 `gh <cmd> --help` 里；`scripts/cache-gh-help.mjs` 抓取 124 个子命令的帮助并裁剪成 fixture；覆盖 124 argv / 317 flag / 256 个 `--json` 字段，SKIP 白名单显式登记「需真实凭证或真实文件」的少数条目）。
- `phase35`：**文档数字派生测试**（README / README.en / help.ts / help-modal.ts 里的「工具数 / 业务 action 数」全部从 `src/main.ts` 与 `lib/tools/*.js` 派生，一个都不手写；同时守卫三条历史漂移：不再出现 `104`、不再出现不可复现的「87%（104/120）」、README 的 `ctx.github` 示例必须是 `async`；并对账 `docs/architecture.md` 声明的测试阶段数与 `run-all.mjs` 的 `phases` 数组长度）。
- `phase36`：**宿主契约测试**（① 客户端 Bundle 形状：loader 入口 / id / apply+inject 导出 / 19 个 Bundle 子模块内联（18 UI + 1 shared）/ 闭包内无残留 ESM `export`；② 插件元数据：`inject` 收敛为唯一硬依赖 `tools`、`provide='github'`、无 `ctx.github` 裸赋值兜底、Config 已迁 Schemastery、`peerDependencies` 只声明宿主 cordis、`exports["./host"]` 指向的产物真实存在；③ 18 个工具的 descriptor 逐个复刻宿主 enforced JSON Schema 子集规则——关键字白名单、`type` 取值域、`properties`/`required`/`items`/`additionalProperties` 的归属约束、`required ⊆ properties`、`enum` 标量性，以及 `output.schema`/`output.render`/`execute` 的必备性；④ **真实 cordis Context 加载冒烟**——只 provide `tools` 时插件必须 ACTIVE 且 18 工具可用（这条专抓 mock 抓不到的缺陷：cordis 的 Context 是 Proxy，读未 inject 的服务属性会**抛错**而不是返回 undefined）、`commands`/`webServer` 晚于插件就绪仍能补注册、volatile 热更新不得冲掉显式配置的 `maxOutputBytes`）。
- `phase37`：**工具档位契约测试**（`applyTier` 纯函数：默认零破坏——18 工具 / 24,043 字符实测不变；`core` 5 / 8,534（−64.5%）、`ci` 7 / 9,943、`maintain` 8 / 13,274；裸工具名与预设可混用、未知档位 `console.warn` 一次后忽略而非静默清空；`read_only` 17 / 22,761——`github_api` 整体剔除、14 个混合工具剪 action enum 且**交集为空**、description 前置 `[只读模式]`；纯函数性质：`Object.freeze` 入参不抛错、重复调用结果一致、剪枝产物与入参解引用）。
- `phase38`：**破坏性操作闸门契约测试**（声明表覆盖 16 个 `(tool, action)`；`cache delete` 五条分支真值表——`all`/`cache_id`/`key` 三条都拦、无选择器不拦仍抛精确错、`list` 不误伤；条件闸门不**过度**拦截——`release upload` 不带 clobber、`skill publish` 带 `dry_run`/`fix`、`pr checkout` 不带 force、`issue transfer` 缺 `target_repo` 全部放行；9 条主文案逐字快照；`wrapWithGate` 只替换 `execute`，`name`/`parameters`/`output` 保持同一引用，拦截时**零副作用**不触达工具本体）。
- `phase39`：**状态徽章共享映射契约测试**（`src/shared/state-badges.ts` 必须零 import——构建期会被整体内联，有依赖就会在 bundle 作用域里变 undefined 导致白屏；六个纯函数的状态→图标/色调覆盖表；服务端 `format*Badge` 22 条输出与旧实现**逐字一致**；`lib/client.js` 内每个共享函数恰好 1 份定义、无残留 `shared/` import；`build.mjs` 把共享模块排在内联顺序最前且剥 import 的正则覆盖 `ui|shared` 两族）。
- `phase42`：**审阅锚点契约测试**（s7：`getPrDetail` 必须取回 40 位十六进制的 `headRefOid`/`baseRefOid`——分支会移动，SHA 才是可钉住的审查锚点；`renderers/pr.ts` 的分支行渲染成 `feat/x@a1b2c3d`，缺 SHA 时**不得**出现 `@undefined`；`changedFiles`/`filesTruncated`/`diffIncomplete` 三个截断字段各自成立且互不复用）。
- `phase43`：**行级评注写入契约测试**（s7：`gh pr review` 没有行级参数，唯一通道是 `POST /pulls/{n}/reviews`；`buildPrReviewPayload` 的 REST 字段形状与「一次说完所有校验错误」；`createPrReview` 的 argv 严格等于 `['api','--method','POST','repos/o/r/pulls/12/reviews','--input','-']` 且 stdin 含 event/comments[].side；**422 降级**把评注折叠进 body（内容不丢、显式 `degraded`）；403 不降级；**不传 comments 时 argv 与改前逐字节一致**）。
- `phase44`：**仓库规则与严重度契约测试**（s7：`extractSection` 的标题边界——代码围栏内的 `##` 不算标题、一级标题同样终止截取；`normalizeSeverity` 只补不删、幂等、`[P0]` 永不降级；`readReviewRules` 无 `AGENTS.md` 时返回 `null` 且 `pr view` 输出**不含** `reviewRules` 键）。
- `phase45`：**CI 失败日志锚点萃取测试**（s7：pytest `FAILED` / node `AssertionError` / Go `panic:` / tsc `error TSxxxx` 四类锚点命中；相邻锚点合并成一块；单块行数 ≤ `2*radius+1`；`maxBlocks` 与 `droppedBlocks` 显式计数；无锚点走尾部 200 行回退；`log_failed` 已把输出预算放开到 2MB 字符/8MB 字节——否则截断发生在萃取之前）。
- `phase46`：**任务级原语契约测试**（s8：`classifyCommits` 的 `feat!:` 必须归 breaking（否则版本少跳一级）；`suggestVersion` 的 auto 推导（breaking→major / feat→minor / 其余→patch）与无 tag 时从 0.1.0 起步；`selectFilesByBudget` 超预算只给元信息不硬塞；`finalizeEnvelope` 的 `cost.chars` 由信封体积计算而非手写；`github_task` 三个原语的端到端行为（review_pr 读模式零写回、写模式必须 confirm 且 commit_id 钉在 head SHA、diagnose_ci 只挑失败 job 并在日志截断时 `totalUnknown=true`、prepare_release **绝不自动发版**）；档位层面 core=3 个工具、只读模式剪掉 review_pr 保留另两个原语）。
- `phase47`：**Actions Run 在线详情契约测试**（`getRunDetail` 的 `run_id` 只认纯数字——它是 `gh run view` 的位置参数，`--force`/`--web` 必须在触达子进程前拒绝且 argv 零产出；repo 白名单额外拒 `-` 开头与 `..`；`--json` 字段集含 `jobs` 且预算 2MB/8MB；缺 `steps` 归一化为空数组、`failedJobs`/`failedSteps` 只在服务端算一次；`truncated` 或解析缺失显式失败并给浏览器直达；`Unknown JSON field` 走 BASE 字段集重试且只重试一次；`getRunLogExcerpts` 用 `-j <jobId> --log-failed` **定向**拉取、最多 3 个 job、绝不使用 `--log` 整包、单 job 失败进 `errors[]` 而整体仍 `ok:true`；`run-log.ts` 的纯文本摘要（锚点块 / 尾部 200 行回退 / 两道截断声明 / 不产生 Markdown 围栏）；`/api/github/run-detail` 与 `/api/github/run-logs` 的 200/400/405/500 与 `job_id` 逗号/重复参数两种写法；前端 `onSelectRun` 追加在形参末尾、Actions 卡片标题行拆分 + 外跳 `stopPropagation` + 禁内联 `display:flex`；弹窗 Hook 先于 early return、日志必须走 `<pre>` 且不接 markdown-lite；bundle 内联顺序 `issue-modal → run-modal` 与当时的子模块计数）。
- `phase41`：**侧栏入口图标契约测试**（issue #9 回归网：宿主 `renderSlot("sidebar.panellist", { size: wide ? 16 : 18, active })` 注入的 `size` 必须被透传——从 `lib/client.js` 抽出 `GithubSidebarIcon` 函数体、在沙箱里真调，断言 16/18 两档尺寸、根节点必须是裸 `svg`（有 wrapper 就会把图标格撑宽、标签右移 12px）、`fill` 用 `currentColor` 继承行颜色、缺省/非数字 `size` 兜底 16、`active` 不改变输出结构）。
- `phase48`：**本地文件入参契约测试**（`resolveBodySource` 的语义表逐行对账：文件来源走 `[fileFlag, '-']` + stdin、内联来源的 argv 与改造前**逐字节一致**、`body` 与 `body_file` 同时给出直接报错而不是静默选一个、空文件等同无正文；相对路径按工作区解析、严格 UTF-8 拒绝 GBK/ANSI 与 NUL 二进制、BOM 剥除、4MB 字节与 65,536 字符双上限（`input_file` 与 `notes_file` 关闭字符校验）；七个工具的 flag 接线——`--body-file -` / `--notes-file -` / `--input -` / `--from-file -`，`review` 写回走 REST 请求体而非 flag）。
- `phase49`：**提交详情 / 未提交清单的文件 Diff 弹窗契约测试**（`diff-utils.ts` 四个纯函数：`parseDiffGitLine` 对含空格路径按**最后一个** `" b/"` 切出 b 侧（截错就点开是空的）、`normalizeRenamePath` 把 `src/{old => new}.ts` 与 `old => new` 两种 `--stat` 写法归一成新路径、`splitUnifiedPatch` 按 `diff --git` 边界切段并**丢弃首个 `diff --git` 之前的提交头**（否则第一段会渲染成幽灵差异）、`Binary files` 判二进制、`rename from`/`rename to` 定新旧路径、**按「首个 `@@` 之前才算文件头」的状态机解析**（正文里以 `---`/`+++` 开头的行是 Markdown 分隔线，按行首前缀判会把它们当文件头，导致增删计数为 0 且染错颜色）、`findPatchSection` 支持新路径 / 旧路径 / `{old => new}` 原文三态命中；`executor.getCommitDiff` 在临时 git 仓库真跑——两文件提交切出两段且 `truncated=false`、`git mv` 提交的 patch 含 `rename from`/`rename to`、非法 sha 在触达子进程前拒绝；整包 patch 超过 400k 字符时在**最后一个 `diff --git` 边界**截断（绝不切半个 hunk，只有单文件巨型 diff 找不到边界才硬切）并置 `truncated`；`/api/github/commit-diff` 路由与 `get_commit_diff` action 双向可用；`lib/client.js` 内联 `FileDiffModal`/`splitUnifiedPatch`、`commit-modal.ts` 的文件变更统计行绑 `onClick` 弹窗）。
- `phase50`：**系统代理自动跟随契约测试**（`parseProxyServer` 覆盖注册表 ProxyServer 的实测形态——单一地址补 `http://`、分协议取 https 兜底 http、`socks=` 映射 `socks5://`、空 proto 的 `=host:port` 按单一地址；`detectSystemProxy` 对 ProxyEnable=0 / ProxyServer 缺失 / reader 抛错返回关闭态或 null 而非抛错，并**按 `supported` + `reason` 四态区分** unsupported-platform / disabled / pac（读了 `AutoConfigURL`，企业 PAC 不再被误报成「已关闭」）/ unparsable；平台门禁只约束真实注册表路径，注入 reader 优先，因此同一套断言在 Linux CI 上同样成立；**模式互斥裁决**：自动跟随开 + 系统开 → 系统地址无视手动 url、系统关 → 直连零 env、自动跟随关 → 手动 url 生效，gh 与 npm 两条链路的 env 注入各自断言；**probe 必须携带 dispatcher**（mock `globalThis.fetch` 校验 + 源码契约双保险，防止「移除全局劫持后探测退化为直连」复发），socks5 明确拒绝用 Node fetch 直连探测并改由 gh 链路回填 `recordProbe`；轮询**懒启停 + dispose**（未开跟随不起定时器、非 Windows 空转不启动、卸载后不清理则热重载叠定时器），dispose 后在途检测不得重建连接池；`snapshot` 带 `systemProxy` + `effectiveUrl` 供 UI 展示；NO_PROXY 恒含 `127.0.0.1` 防回环劫持的不变量在两种模式下都成立；UI 提交 `autoFollowSystem`、按 reason 分支给提示、静默保存失败回滚开关、`fetchProxyAvailable=false` 时明示 npm 探测直连差异）；
- `phase51`：**Organizations 只读浏览契约测试**（issue #17 的「查看」诉求：组织列表 `/api/github/orgs` + 组织聚合/单仓库下钻 `/api/github/org-overview`；组织名与仓库全名白名单防 argv 注入——放行空白/分号/路径穿越会让 gh 把它们当 flag；只读静态契约：源码中不得出现 create/edit/merge/delete/comment/close/reopen/transfer 任一写子命令；组织聚合用 `--owner=<org>`、下钻用 `--repo=<owner/name>`，两者不得串味；**组织视图缓存**键为 `org|repo|limit`——下钻与 limit 变化不得复用聚合缓存，失败结果不进缓存，刷新按钮必须一并清空；组织列表用 `user/orgs?per_page=100` 并如实回传 truncated（不用 `--paginate`：gh 会逐页输出 jq 结果拼接成非法 JSON）；PR 满页标记 truncated、单路失败不拖垮整体；前端组织 Tab 的序号守卫（概览/列表各一个 seq）、渲染期作用域键守卫（失败不得展示上一个组织的数据）、错误态重试与回退、下钻与回退接线；本分支不含 svg-icons，面板不得调用 iconWithText/renderIcon/renderDot）；
- `phase52`：**Agent 操作记录契约测试**（`AuditStore` 的 append-only 事件流：`intent`/`decision`/`result`/`delete` 四种行折叠成一条记录——写操作落 intent+result 两行（崩溃时 intent 仍在），读操作只落一行且自带身份（省一半行数且不留"发起但没结果"的假象），只有 intent 没有 result 时如实标 `unknown` 而不是假装成功；**分类真源唯一**：`classifyWrite` 表驱动遍历 `WRITE_ACTIONS`（18 条工具清单 / 15 个有具名写 action / 3 个纯只读），`classifyRisk` 遍历 `DESTRUCTIVE_ACTIONS` 的 17 对且不被原型链上的名字命中；摘要表覆盖 PR/Issue 的读写 action、缺编号显示 `#?`、长标题裁剪、未知工具兜底不抛；**删除是真删除**——先追加墓碑保证崩溃可读，压实前必须折叠墓碑再重写字节（`compactRows`），因此断言"压实后文件字节不含被删 id"而不是只看列表；`maxRows` 上限裁剪与 `dispose` 后不再落盘；**Fail-Open**：目录被文件占住时构造不抛、降级为 no-op 并给出可见原因（`apply()` 抛错会让 Fiber FAILED、19 个工具全丢），写盘失败只 warn；**结果双形状兼容**：`tools/result` 运行时传归一化 `ToolExecutionResult`（原始值在 `.value`）而老测试直接传原始载荷，两者都认——同一处修复也让遥测的 `confirmBlocked`/`degraded`/失败计数从"恒为假"恢复正确（`src/telemetry.ts` 曾长期读错层级）；仓库解析走 `resolveExecScope` + `getRepoIdentityFromLocal`（同步、不 spawn `gh`，宿主的 `exec.agent` 只有 `{id}`）；**作用域**：记录同时带 `repo` 与 `cwd`（`resolveScopeFromExec` 走 `resolveExecScope` 同步解析、不 spawn `gh`；比较前归一化分隔符与尾斜杠、Windows 折小写、**不做前缀匹配**——`/repo` 与 `/repo-old` 是两个工作区），驾驶舱入口传 `scope:'global'`、右栏入口传 `scope:'workspace'`+当前 cwd，`GET /audit/records?cwd=` 精确过滤并在响应里回显 `scope`；拿不到 cwd 时弹窗显式提示「已退化为全局」而不是静默串数据；**保留预算与开关（s1b）**：只暴露字节一个旋钮——默认 **8 MB**、可设 1–64 MB、`0` 非法（关闭走 `auditEnabled`）；行数上限由预算派生 `clamp(预算/120B, 1 000, 200 000)`，正常永不触发（8 MB 算出 7 万行，实际只装 3.2 万行），只在"全是极短行"时兜住折叠退化。记账必须用 `Buffer.byteLength(json,'utf8')`——中文 3 字节/字，用 `String.length` 会低估 3 倍（界面说 8 MB、实际写 24 MB）；淘汰时从头部整批 `slice`（逐条 `shift` 是 O(n²)）。`setBudget()`/`setEnabled()` **热生效**（改小当场淘汰 + 同步压实；关闭时不加载历史、不写盘、不动文件，历史可用 `clear()` 删）。设置落 `audit-settings.json`，优先级 **文件（UI 改的） > cordis 静态配置 > 默认值**；前端 `audit-modal.js` 必须登记进 `scripts/build.mjs` 的 `leadingModules` 且函数内声明 `var h`（漏登记 = 浏览器 undefined = 白屏，而 `tsc`/`build`/测试全绿））；
- `phase53`：**执行前人工审核闸门契约测试**（s2 v2：判定落 `tools/pre-execute`、问答全交宿主 `ctx.approval`，插件零自建弹窗/队列/路由。作用域与记录同源 `AUDITED_TOOLS`（只 PR / Issue），档位 `off` / `destructive` / `all-writes` 分别覆盖 0 / 6 / 21 条；**`destructive` 档必须跟闸门表的 `when` 条件走**——`pr checkout` 不带 `force`、`issue transfer` 缺 `target_repo`、`merge` 缺 `pr_number` 一律不问（用 `classifyRisk` 会把它们全问一遍）；**`confirm: true` 不豁免审核**，否则模型带上它就永久绕过弹窗。官方四态逐态钉死：`allowed-once` → 放行且给工具体打一次性批准旁路（`markApproved` + `approvedCalls.delete`，不旁路就是一次操作问两遍），`rejected` → `kind:'deny'` + `ApprovalError`/`APPROVAL_REJECTED` 且 `next()` 零次，`cancelled` → `kind:'cancel'` 交宿主产出规范结果，**`unavailable` → 退回 `next()` 走既有 `confirm` 闸门**（无 answerer ≠ 用户说不，否则 headless 部署把写操作全判死）。**`policy === 'never'` 必须短路**：宿主在派发前就把 ask 判成 `rejected`（`dsh-user-approval` 的 `decide()`），不短路则 `danger-full-access` 预设下插件完全不可用；策略读取公式 `overrideOf(session) ?? config.policy ?? 'ask'` 与宿主 `derive()` 逐字一致，读不出来时降级为「不判、照常问」+ 一条 warn（绝不把读不到当 `never`）。无 `approval` 服务（CLI / TUI profile）、服务形状不对、`request()` 抛错（无开启轮次）三条路径都必须放行且不阻塞工具；`request` 入参 `toolName`/`callId`/`agent`/`signal`/`reason` 逐个断言（`signal` 透传才能让停止键结算成 `cancelled`，v1 的 180s 定时器与 `onDisabled` 结算因此全部消失）。**记录折叠改顺序无关**：s2 的落盘顺序是 decision（`pre-execute`）→ intent + result（`tools/result`），旧折叠"边走边贴"会把先到的决策静默丢弃，表现为"明明拒绝过、审核列却写着自动"，故决策行改为先收集后回贴；**fail-closed 不得被兜成放行**：cordis 的 `next` 是 `cbs.shift()` 共享队列（`cordis/lib/index.js:317-325`），下游监听器的**同步**抛错若被闸门 catch 后再调一次 `next()`，会跳过抛错者一路落到内置 `{kind:'allow'}` —— 等于把别人的拒绝降级成权限提权，故用 `forwarded` 标记区分"已转发则原样上抛 / 从未转发才兜底放行"（测试用同步 throw 复现；早先把下游包成异步只能造出"rejection 天然穿透"，会得到全绿的假断言）；**接线本身也有契约**：整套功能只挂在 `main.ts` 的 `onHostEvent(ctx,'tools/pre-execute',…)` 一行上，故断言它真的注册了、由 `createApprovalGate` 造、`approval` 走 `ctx.get` 机会式探测、决策写回同一个 `AuditStore` 实例、并在 `tools/result` 回收"批准了但 body 从未执行"的残留标记）；
- `phase54`：**设置页问号说明的真实渲染与交互测试**（本仓 2026-11-26 白屏事故的教训：tsc 通过、build 成功、静态断言全绿也挡不住"一点就炸"，只有真渲一次才现形。本阶段用 jsdom + 真 React 加载 `lib/ui/sync-settings-modal.js`，并用 `with(Proxy)` 接管自由变量——未定义的全局立刻以变量名抛错，而不是被 `typeof` 静默吞掉。覆盖两轮真机踩过的坑：**① 悬停浮层撑开滚动区**——旧的绝对定位浮层在靠底部的选项上打开时会撑开横向滚动条、自己被弹窗边缘裁掉，现已改为 fixed 遮罩里的二级弹窗，断言 `.dsh-github-help-overlay` 是 `position:fixed` 且旧 `.dsh-github-help-pop` 样式被彻底移除；**② Esc 被窗口级监听器吃掉**——问号上的 Esc 曾冒泡到"关闭设置页"的监听器，导致收起说明时整个设置窗口一起关（真机表现为 `props.onClose is not a function`），现由设置页的窗口级监听器统一分发（`helpTopic` 进依赖数组），断言"说明开着时 Esc 只关说明且 `onClose` 零调用 / 说明关了才轮到设置页"。另断言：6 个问号各自可键盘聚焦（`role=button` + `tabIndex=0`）、Enter 可打开、点问号既不触发保存也不改变选中档位（对照：点卡片本身仍会保存）、点遮罩与点关闭按钮都能关、21 项清单排成药丸而非一坨长文本、样式真的进了 `lib/client.js`。**依赖 jsdom/react/react-dom 不是本项目依赖**，找不到时显式 SKIP 并打印原因（返回码 0），不静默通过——与 `phase34` 的 SKIP 白名单同口径）；
- `phase55`：**审核策略化与记录硬化契约测试**（s3 的四类增量，全部"失效也不会让主功能崩、只会看起来在工作"——正因如此才必须逐条钉住。**① 策略求值**：`approvalRules` 是 `维度:值=档位` 的字符串数组，维度 `repo` / `action` / `tool`，多维用 `|` 连接表示 AND；**规则之间是首条匹配即返回，不是取最严格**（用户写下两条相反规则时，最严格会让"我想放行"永远失效且无法解释；反向验证：改成最严格后冲突用例必红）；`action` 支持 `action:github_issue:comment`（精确到工具）与 `action:comment`（跨工具）两种写法——只留精确形态会让简写**静默永不命中**，那是本功能最坏的失效形态；未知维度 / 缺档位 / 档位非法 / 维度重复逐条**忽略并带原因回显**（`ParsedRules.ignored`，设置页显示"解析出 N 条，忽略 M 条"，绝不静默失效）。`repo` 比较折大小写（GitHub 的 owner/name 本身大小写不敏感，不折会让"我配了规则却不生效"最难解释）。`resolveApprovalMode`（吃原始字符串）与 `AuditStore.resolveModeFor`（吃缓存解析结果）**共用 `evaluateRules`**——两处各写一遍必然漂移，后果是"设置页说命中、闸门说不命中"。`read_only` 优先级更高（注册期就剪掉写 action，策略没机会跑），这条是文档边界而非函数行为。**② 多段存储**：每进程一个段文件 `audit.<pid>-<ts>-<seq>.jsonl`（`<seq>` 是同进程内序号——同一毫秒内两次构造会撞名，后一个覆盖前一个的段，表现为"刚写的记录莫名消失"），读取按 mtime 升序合并、折叠与墓碑跨段生效；**`writeSnapshotSync` 只能写自己那段**（按 `rowSeg` 过滤）——把合并进来的别人的行一起写进本段就是跨进程复制，每重启一次记录翻一倍而界面一切正常；段数上限 8 是"最多几个进程写过"的护栏、不承担保留策略，超限段**只删已经沉寂的**（mtime > 60s），正在被写的段删掉会让对方的 `append` 落到孤儿 inode 上——那是静默数据丢失。预算口径不变：`Σ 各段字节 ≤ 预算`，超预算**先整段丢最旧**（一次 `unlink`，不必逐行读改写），最后才在自己段内按行淘汰。**旧单文件迁移**：s1/s1b/s2 的 `audit.jsonl` 当作最旧的一段读入、迁进本进程段后再删（先落盘再删，任一步失败都不丢历史）。**③ 自愈**：坏行跳过 + 计数，坏行率 >5% 且总行数 >50 才重写该段（只写回能解析的行）——但**必须能重写"别人的段"**：本进程每次启动都新建段文件，只重写本段的自愈在分段世界里等于死代码，坏行会永远留在旧段被反复跳过；因此加两道护栏（沉寂窗口 60s + 复用 `.lock` 互斥），抢不到锁就如实告警并放弃。**④ 导出与跨段清空**：`POST /audit/export` 只回传字符串（服务端不落文件——落盘就得管清理，而用户要的只是"带走"），json 可解析且条数 = 当前保留条数（不写死 2000），md 决策列**显式区分 `approved` / `rejected` / `no-client`**（导出件最常见的用途就是事后对账，模糊"用户拒绝"与"根本没有可用的审核端"等于让导出件撒谎），被拒绝条目的留言原文用引用块单列；非法 `format` → 400 且复用 `guardLocalWrite` 的 CSRF 门。清空要删多个进程的段，抢不到 `.lock` 时只能清本段并返回 `partial: true` + `remainingSegments`，UI 显式提示「其他进程的 N 条未清空」——**宁可如实报告没删干净，也不假装删干净**（用户以为文件干净了、实际字节还在磁盘上，那是隐私问题不是显示问题）；过期锁（30s）会被抢过来，崩溃遗留不会让清空永久失效。另断言：设置页规则框失焦才保存且不把 split 结果回写进受控文本框（会把空行吃掉）、边界说明那句「本开关与 DSH 的权限预设无关」真的进了客户端产物、`/gh status health` 的审核行与健康分**分属两个数据源**（遥测是工具链健康、审核是人机协作，混在一起会让健康分被"用户认真点了很多次拒绝"拉低）且全零时不显示、`no-client` 在统计里单独计数；**⑤ 文档同口径**（本仓最贵的漂移源）：`github_help` 新增 `audit` 主题并被断言「知识库里每个主题都在 enum 中、enum 里每个主题都有正文」（消灭"写了但调不到"与"能调但没内容"两种半成品）；查询主题数 23 在知识库与使用指南**两处人类入口同口径**；知识库里写出的维度（repo/action/tool）与档位逐字等于 `APPROVAL_MODES`，且**文档里的每个规则示例都必须能被 `parseApprovalRules` 解析**（写一个解析不了的例子比不写更糟）；「仅高危 6 条 / 全部写操作 21 条」对回 `DESTRUCTIVE_ACTIONS` 与 `WRITE_ACTIONS` 的实算值；使用指南的 8 大场景与 Q11/Q12 新增 FAQ 断言进了 `lib/client.js`（只在源码里等于没生效）。`phase33` 的 enum 总数口径改为**派生式**（`业务 action + help 主题 + api method = 总数`，并断言查询主题数 = enum 实际长度），`phase37` 的 schema 基线同理（`phase48 基线 + 实测 audit 增量`，让"+8"真的被验证而不是被抄写）；
- `phase56`：**操作记录弹窗的真实渲染与交互测试**（s3 审查暴露的教训：`phase55` 对 partial 提示 / 导出按钮 / 底栏布局只做了**源码正则**检查，而其中两件实际是坏的——partial 文案塞进 `error`，被紧随其后的 `load() → setError(null)` 当场擦掉，界面上一个字都不显示，三条断言却照样全绿。本阶段用 jsdom + 真 React 加载 `lib/ui/audit-modal.js` 并真点一遍：**① partial 必须进 DOM**（断言"其他进程的记录未被清空"+ 未清空段数 + `role=status` + 「知道了」可收起）；**② 清空失败必须留在 DOM**（危险动作失败不能看起来像成功）；**③ 导出真的产出**（请求体 `format` 正确、Blob 生成、下载文件名来自服务端、`URL.revokeObjectURL` 被调用、导出 `filter` 带上当前工具筛选——否则导出件与看到的列表不是一个范围）；**④ 工具下拉恰好 2 项**且数据里出现 `github_api` 也不被补进候选；**⑤ 底栏允许换行**（640px 下状态+分页+4 个按钮挤不下）；**⑥ 空态与副标题口径一致**（"对 PR / Issue 发起写操作"，不再说"调用 GitHub 工具"）；**⑦ 别名 import 被落成显式绑定**（2026-11-26 白屏事故的同形约束）。附带修了测试桩自身的一个坑：路由按 `includes` 匹配会把 `/audit/records/clear` 错配成 `/audit/records`，导致 partial 永远测不出来——改为**最长键优先**。依赖 jsdom/react/react-dom 非本项目依赖，找不到时显式 SKIP 并打印原因（与 phase34/54 同口径）；
- `phase57`：**设置页「操作记录与审核」的用量口径测试**（2026-11-27 用户截图实证：设置页写着「当前已用 0.0 MB / 8.0 MB · 26 条」，同屏的记录窗口写着「共 8 条」——两个数都错在口径，且都不是记账算错。`26` 是 JSONL **行数**（一次写操作固定 intent + result 两行，走过人工审核再多一行 decision），拿它当条数会产出三个现象：每做一次操作数字 +3（"累加"）、删光 8 条后仍剩 2 条折叠不出来也删不到的孤儿 result 行（"删了也不减"）、以及只看 MB 一位小数导致的「0.0 MB」（真实 10309 B ≈ 10.1 KB）。这一屏此前**零测试覆盖**——phase56 只测记录弹窗，于是"弹窗改好了、设置页继续错"能安静地活一个月。三组断言：**① 服务端同源**：`/settings` 的 GET 与 POST 都回传 `records = list().total`，且 `records !== usage.rows`（`usage.rows` 保留"行数"原义供健康看板用）；删 1 条后 `records` 减 1 而 `rows` 减 3，清空后两者同时归零——把"行 vs 条"的差异钉成断言，而不是靠注释约定。**② bundle 约束**：`lib/client.js` 里 `formatBytes` 只有一份定义（两个弹窗共用），不残留 `auditMb(` / `mbText(`，设置页不出现 `auditUsage.rows`——两份实现必然只修一处，这类漂移只能靠"唯一实现"来防。**③ 真实渲染**：jsdom + 真 React 加载 `lib/ui/sync-settings-modal.js`（与 phase54 同一条加载路径），断言 `10309 B → 10.1 KB`、不出现 `0.0 MB`、条数显示「全部 8 条记录」而不是 26；旧服务端缺 `records` 时**不显示条数**（宁缺勿错，绝不回退成行数）；保存后条数立刻跟上服务端（8 → 7）。依赖 jsdom/react/react-dom 非本项目依赖，第 3 组找不到时显式 SKIP 并打印原因（返回码 0），与 phase34/54/56 同口径。

