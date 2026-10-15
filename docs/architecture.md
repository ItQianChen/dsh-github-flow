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
│  │  9 大 Agent 工具  │    │  人类 Slash 指令 │    │   Host HTTP WebServer │  │
│  │  (defineTool DSL)│    │  /gh status      │    │ (Effect Disposer 清理)│  │
│  │  - pr (+ready·   │    │  /gh upgrade     │    │ - /api/github/overview│  │
│  │    revert·update)│    │  /gh help        │    │ - /api/github/action  │  │
│  │  - issue (+delete│    └──────────────────┘    │ - /api/github/refresh │  │
│  │    ·transfer·pin·│                            │ - /api/github/branches│  │
│  │    lock·status)  │                            │ - /branch-switch      │  │
│  │  - run (+workflow│                            │ - /api/github/git-    │  │
│  │    系列·download)│  (workflow_enable/disable │  │   watch (定向监听)    │  │
│  │  - repo (+search │   启停·list/view·download) │ - /check-update (并行)│  │
│  │    三域+read_    │                            │ - /upgrade (一键自动) │  │
│  │    file &read_dir)│  (search 三域=issues/prs/ │  │ - /update-settings    │  │
│  │  - api (逃生门)  │   commits; read_file/dir)  │ - /proxy (全局代理)   │  │
│  │  - release       │                            │ - /auth (轻量探针)    │  │
│  │  - secret (stdin │                            └──────────┬────────────┘  │
│  │    +variable 域) │                                       │               │
│  │  - skill         │                                       ▼               │
│  │  - help (元指南) │                            ┌───────────────────────┐  │
│  └────────┬─────────┘                            │ git-watcher (独立服务)│  │
│           │                                      │ - .git/HEAD & index   │  │
│           ▼                                      │ - 800ms 防抖/35s 超时 │  │
│  ┌──────────────────────────────────┐            └───────────────────────┘  │
│  │ Markdown 渲染引擎 (renderers/)   │                                       │
│  │ - common.ts: 单元格清洗/通用徽章 │                                       │
│  │ - 6大领域模块: pr/issue/run/repo/│                                       │
│  │   release/skill 各自独立渲染     │                                       │
│  │ - 统一门面出口 markdown.ts 兼容  │                                       │
│  └──────────────────────────────────┘                                       │
└─────────────────────────────────────────────────────────────┬───────────────┘
                                                              │
┌─────────────────────────────────────────────────────────────┼───────────────┐
│                        DSH Web Client                       ▼               │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ 模块化 UI 架构 (src/ui/ ➔ 经 scripts/build.mjs 拓扑聚合单一 Bundle)  │   │
│   │                                                                     │   │
│   │  · styles.ts (1290行自适应 CSS, 构建期紧凑压缩)                      │   │
│   │  · icons.ts (Octocat, Git 官方菱形分支矢量组件, 插件徽标)           │   │
│   │  · storage.ts (LocalStorage SWR 状态机与偏好存储)                   │   │
│   │  · components/ (分支下拉/认证引导/升级通知/离线横幅/状态胶囊)       │   │
│   │  · modals/ (Commit 详情弹窗 / 4分区全局设置弹窗)                    │   │
│   │  · panels/ (首页全景大面板 workspace-panel.ts)                      │   │
│   │                                                                     │   │
│   │ 核心组装入口 (src/client.ts, ~1,260 行高内聚):                      │   │
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
- 对长文本输出（如大型 PR 的完整 `diff`、CI 失败步骤日志）设置安全截断阈值（默认 24KB），采用码点安全切割与二分查找字节截断（`src/executor/process-utils.ts`），保留头尾关键上下文并添加显式截断标记，杜绝撑爆模型上下文；
- 列表与详情输出经独立 Markdown 渲染引擎（`src/renderers/` 7 大领域模块）转化为高密度表格与卡片（带状态徽章、可点击超链接与竖线转义防护），实测 20 条 PR 列表输出压缩 70%+ Token；
- 所有 Agent 工具的输出统一经过归一化，列表自动打包为 `{ items, count }`，标量打包为 `{ result }`，100% 严丝合缝契合 DSH 工具网关模式约束；
- **gh 版本守卫降级链（runGuarded）**：preview 命令与新特性按 `minVersion` 门槛路由——版本达标直通主命令、不足走 `fallback` 降级链路（结果携带 `degraded/degradedReason` 结构化标注，**降级不是静默的**，渲染层对 degraded 结果显式追加链路说明）、无降级时报错附平台升级指引；版本探测自身失败 fail-open 直通（守卫是路由优化不是安全边界）。版本比较采用数值分段（`src/executor/version-utils.ts`，杜绝 `'2.96.0' > '2.100.0'` 字典序陷阱），探测结果 30s TTL 缓存且只缓存成功值；
- **AI_AGENT 识别信号注入**：每次 gh 子进程启动注入 `AI_AGENT=dsh`（gh detect.go 最高优先级通用信号）——gh ≥2.99 自动切换 text-only spinner、≥2.100 命令误用时打印完整 help（模型可据此自我纠正）、telemetry 归因到 dsh；旧版 gh 忽略该变量零副作用。经 `agentEnvInjection` 配置开关（默认开启）可恢复 gh 原生行为。

### 2.3.1 高危操作确认与敏感值安全通道 (Safety Confirmation & Secret stdin Channel)
- 不可逆写操作（`merge` / `close` / `issue delete`（物理删除）/ `issue transfer`（跨仓库迁移）/ `pr revert`（远端创建反向 PR）/ `release delete` / clobber 覆盖上传 / `secret delete` / `skill install`）强制要求 `confirm: true` 显式参数，未确认时仅返回影响评估卡片，不产生任何远端或本地副作用；
- 密钥明文仅经子进程标准输入传递（`spawnWithStdin` 通道：`spawn` + `stdin.end(data)` 半关闭写入），全程不出现在命令行参数、进程列表与工具输出中；渲染层对 secret 输出采用独立实现，从结构上隔离「绝不渲染 value 字段」这条安全红线。

### 2.3.2 产物落盘纪律 (Artifact Download Discipline)
- **目录固定派生，永不暴露路径参数**：构建产物下载（`run download` 等）的落盘目录由插件从 `~/.dsh/data/dsh-github-flow/artifacts/<owner>/<repo>/<run_id>/` 三级固定派生，不向调用方暴露任何目录参数——这是 GHSA-39wj-f2f4-978v（gh <2.102 符号链接路径穿越）的核心防线；
- **低版本安全提示而非硬拒绝**：gh <2.102 时下载仍可执行，但返回值携带 `securityNote` 升级指引；需要自定义落盘位置的场景显式引导经 `github_api` 手动拉取；
- **下载后零本地符号化操作**：插件对落盘产物仅做递归枚举（相对路径 + 大小清单），不执行链接、移动或执行类操作。

---

## 3. 工程解耦与单文件瘦身规范 (Modularization Specs)

为彻底解决单文件臃肿过长（如旧版 `client.ts` 超过 5,200 行、`executor.ts` 超过 1,100 行）的技术债，项目已全面落地分层解耦与自包含构建规范：

### 3.1 后端执行引擎分层 (`src/executor/`)
- [src/executor.ts](../src/executor.ts)（瘦身至 ~820 行）：保留 `GhExecutor` 类核心编排（命令白名单、执行通道、认证与版本缓存），完整 Re-export 子模块符号，保持 100% 向后兼容；
- [src/executor/git-parser.ts](../src/executor/git-parser.ts)：纯文本解析器（`status -sb`、`log`、`branch -a`），无 I/O、无副作用；
- [src/executor/version-utils.ts](../src/executor/version-utils.ts)：语义化版本数值分段比对纯算法；
- [src/executor/process-utils.ts](../src/executor/process-utils.ts)：`spawnWithStdin` 进程管道流控与 UTF-8 字符边界截断算法；
- [src/executor/platform-guide.ts](../src/executor/platform-guide.ts)：跨平台 CLI 安装引导与升级命令文本生成。

### 3.2 渲染层领域化细分 (`src/renderers/`)
- [src/renderers/markdown.ts](../src/renderers/markdown.ts)（瘦身至 14 行）：门面出口，统一聚合导出全部领域子模块；
- [src/renderers/common.ts](../src/renderers/common.ts)：表格单元格字符净化、各类状态药丸 Emoji 徽章、API 降级透明注解；
- `pr.ts` / `issue.ts` / `run.ts` / `repo.ts` / `release.ts` / `skill.ts`：6 大领域独立渲染格式化，避免跨工具改动合并冲突。

### 3.3 本地 Git 元数据监听服务 (`src/git-watcher.ts`)
- 独立底层服务模块，彻底剥离路由控制器内部的物理文件系统监听与定时器杂糅；
- 靶向非递归监听 `.git/HEAD` 与 `.git/index`，内置 800ms 防抖合并、35s 超时熔断与物理句柄安全释放；
- 使 [src/api/routes-actions.ts](../src/api/routes-actions.ts) 彻底移除对 `node:fs` 与 `node:path` 的直接依赖，路由函数回归纯粹的 HTTP 请求接收与响应。

### 3.4 前端客户端解耦与自包含 Bundle 机制 (`src/ui/` + `src/client.ts`)
- **源码物理剥离**：
  - [src/client.ts](../src/client.ts)（由 5,290 行直降至 **1,263 行，瘦身 76%**）：仅保留右侧栏核心协同 `renderGithubRepoView` 与 `GithubRightbarBody` 及插件入口；
  - 12 个独立子模块下沉至 [src/ui/](../src/ui/) 目录（样式 1,295 行、全景大面板 732 行、设置弹窗 561 行、业务卡片 60~290 行）；
- **命名空间防护**：
  - 严禁在与 `package.json` 的 `exports["./client"]` 同级创建名为 `client/` 的目录，统一命名为 `src/ui/` 与编译产物 `lib/ui/`，彻底杜绝模块解析器产生“同名文件 vs 目录”的歧义报错；
- **自包含 Bundle 聚合器 (`scripts/build.mjs`)**：
  - 构建脚本按严格拓扑顺序将 `lib/ui/` 子模块内联注入 `lib/client.js` 的 `window.__ModuleLoader__.load` 闭包中，移除 `export` 关键字；
  - 保证 `GithubRightbarBody` 位于 `GithubWorkspacePanel` 之前（满足切片测试断言）；
  - 对嵌入的 1,290 行纯 CSS 实施紧凑压缩，消除空行与多余注释，使编译产物从 5,282 行减至 4,008 行；
- **React Hook 时序安全防线**：
  - 组件内引用的 `useRef`（如 `containerRef`）必须在组件声明最前列初始化，严禁跨行下置引发变量提升 `undefined`；所有的 Ref 访问点必须配备 `containerRef && containerRef.current` 守卫，杜绝运行时渲染崩溃。

---

## 4. 自动化测试体系 (Test Suite)

项目配备了 13 个独立阶段的全量自动化回归测试套件（`test/run-all.mjs`），覆盖 **562 项全量自动化测试断言**：
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
- `phase13`：云端定时自动同步生命周期、三选一互斥设置模型与右侧栏独占本地 git-watch 监听。
