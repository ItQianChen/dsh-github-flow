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
│     │   - spawnWithStdin (密文通道: spawn+stdin.end + kill 超时)   │        │
│     └──────┬───────────────────────┬────────────────────────┬──────┘        │
│            │                       │                        │               │
│            ▼                       ▼                        ▼               │
│  ┌──────────────────┐    ┌──────────────────┐    ┌───────────────────────┐  │
│  │  9 大 Agent 工具  │    │  人类 Slash 指令 │    │   Host HTTP WebServer │  │
│  │  (defineTool DSL)│    │  /gh status      │    │ (Effect Disposer 清理)│  │
│  │  - pr (+ready·   │    │  /gh upgrade     │    │ - /api/github/overview│  │
│  │    revert·update)│    │  /gh help        │    │ - /api/github/action  │  │
│  │  - issue (+delete│    └──────────────────┘    │ - /api/github/refresh │  │
│  │    ·transfer·pin·│                            │ - /check-update (并行)│  │
│  │    lock·status)  │                            │ - /upgrade (一键自动) │  │
│  │  - run (+workflow│                            │ - /update-settings    │  │
│  │    系列·download)│  (workflow_enable/disable │  │ - /proxy (全局代理)   │  │
│  │  - repo (+search │   启停·list/view·download) │ - /auth (轻量探针)    │  │
│  │    三域+read_    │                            └──────────┬────────────┘  │
│  │    file &read_dir)│                                       │               │
│  │  - api (逃生门)  │   (search 三域=issues/prs/commits；     │               │
│  │  - release       │    read_file/read_dir 免clone读取)      │               │
│  │  - secret (stdin │                                        │               │
│  │    +variable 域) │                                        │               │
│  │  - skill         │                                        │               │
│  │  - help (元指南) │                                        │               │
│  └────────┬─────────┘                                       │               │
│           │                                                 │               │
│           ▼                                                 │               │
│  ┌──────────────────────────────────┐                       │               │
│  │  Markdown 渲染引擎 (renderers/)  │                       │               │
│  │  - 列表表格化压缩 70%+ Token     │                       │               │
│  │  - 状态徽章/超链接/转义防破损     │                       │               │
│  │  - 高危确认卡片/敏感字段隔离      │                       │               │
│  └──────────────────────────────────┘                       │               │
└─────────────────────────────────────────────────────────────┼───────────────┘
                                                              │
┌─────────────────────────────────────────────────────────────┼───────────────┐
│                        DSH Web Client                       ▼               │
│                                                                             │
│   ┌──────────────────────────────────┐    ┌─────────────────────────────┐   │
│   │       全局驾驶舱 (Main Slot)      │    │  右侧栏面板 (Right Sidebar)  │   │
│   │   - 账号全局所有 GitHub 仓库      │    │  - 当前会话工作区关联仓库   │   │
│   │   - 本地工作区矩阵透视           │    │  - PR 列表与 CI Checks 药丸 │   │
│   │   - 三维待办 Issues (药丸筛选)   │    │  - 仓库 Open Issues 任务列表│   │
│   │   - 用户提单 / 分配待办 / 我发起 │    │  - 快捷操作网格 (直达入口)   │   │
│   │   - 顶部升级通知横幅 (Banner)    │    │  - 紧凑微型升级指示条       │   │
│   │   - 动态数据新鲜度胶囊与 SWR 缓存│    │  - 本地快照胶囊 (对齐规则)  │   │
│   │   - 四分区设置弹窗 (同步/代理/   │    │  - ⚙️ 完整设置入口 (复用    │   │
│   │     更新源/关于)                │    │     主页同一弹窗组件)       │   │
│   │   - 「插件」身份徽章 (关于直达)  │    │  - 「插件」身份徽章 (直达)  │   │
│   └──────────────────────────────────┘    └─────────────────────────────┘   │
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
- 对长文本输出（如大型 PR 的完整 `diff`、CI 失败步骤日志）设置安全截断阈值（默认 24KB），采用码点安全切割与二分查找字节截断，保留头尾关键上下文并添加显式截断标记，杜绝撑爆模型上下文；
- 列表与详情输出经独立 Markdown 渲染引擎（`src/renderers/markdown.ts`）转化为高密度表格与卡片（带状态徽章、可点击超链接与竖线转义防护），实测 20 条 PR 列表输出压缩 70%+ Token；
- 所有 Agent 工具的输出统一经过归一化，列表自动打包为 `{ items, count }`，标量打包为 `{ result }`，100% 严丝合缝契合 DSH 工具网关模式约束；
- **gh 版本守卫降级链（runGuarded）**：preview 命令与新特性按 `minVersion` 门槛路由——版本达标直通主命令、不足走 `fallback` 降级链路（结果携带 `degraded/degradedReason` 结构化标注，**降级不是静默的**，渲染层对 degraded 结果显式追加链路说明）、无降级时报错附平台升级指引；版本探测自身失败 fail-open 直通（守卫是路由优化不是安全边界）。版本比较采用数值分段（杜绝 `'2.96.0' > '2.100.0'` 字典序陷阱），探测结果 30s TTL 缓存且只缓存成功值；
- **AI_AGENT 识别信号注入**：每次 gh 子进程启动注入 `AI_AGENT=dsh`（gh detect.go 最高优先级通用信号）——gh ≥2.99 自动切换 text-only spinner、≥2.100 命令误用时打印完整 help（模型可据此自我纠正）、telemetry 归因到 dsh；旧版 gh 忽略该变量零副作用。经 `agentEnvInjection` 配置开关（默认开启）可恢复 gh 原生行为。

### 2.3.1 高危操作确认与敏感值安全通道 (Safety Confirmation & Secret stdin Channel)
- 不可逆写操作（`merge` / `close` / `issue delete`（物理删除）/ `issue transfer`（跨仓库迁移）/ `pr revert`（远端创建反向 PR）/ `release delete` / clobber 覆盖上传 / `secret delete` / `skill install`）强制要求 `confirm: true` 显式参数，未确认时仅返回影响评估卡片，不产生任何远端或本地副作用；
- 密钥明文仅经子进程标准输入传递（`spawnWithStdin` 通道：`spawn` + `stdin.end(data)` 半关闭写入——`execFile` 的 `input` 选项在实测环境从不真正写入管道，密文通道此前从未生效过），全程不出现在命令行参数、进程列表与工具输出中；渲染层对 secret 输出采用独立实现，从结构上隔离「绝不渲染 value 字段」这条安全红线。secret 与 variable（CI 明文，get 可回显）的渲染走**两个物理独立的函数**——安全语义靠函数边界而非同一函数的分支隔离，防未来重构互相污染。

### 2.3.2 产物落盘纪律 (Artifact Download Discipline)
- **目录固定派生，永不暴露路径参数**：构建产物下载（`run download` 等）的落盘目录由插件从 `~/.dsh/data/dsh-github-flow/artifacts/<owner>/<repo>/<run_id>/` 三级固定派生，不向调用方暴露任何目录参数——这是 GHSA-39wj-f2f4-978v（gh <2.102 符号链接路径穿越）的核心防线：用户无法注入 `../` 或符号链接目标，攻击面收敛到唯一一个 `mkdirSync(recursive)` 调用点，且目录天然按仓库与 run 隔离、可整体清理；
- **低版本安全提示而非硬拒绝**：gh <2.102 时下载仍可执行（受控仓库场景是合理需求），但返回值携带 `securityNote` 升级指引；需要自定义落盘位置的场景显式引导经 `github_api` 手动拉取；
- **下载后零本地符号化操作**：插件对落盘产物仅做递归枚举（相对路径 + 大小清单），不执行链接、移动或执行类操作。
未来任何新增下载类能力（如 gist 资产）必须引用本节纪律，而非各自重述。

### 2.4 原生浅色/深色主题自适应与快捷操作网格
- 全面对齐 DSH 官方 DSW 语义设计变量，基于 `body[data-ds-dark-theme]` 驱动无闪烁双模式切换；
- 右侧栏快捷操作栏彻底废弃失效的阻塞弹窗，全面采用官方直达模式（查看所有 Issues、查看 PRs、Compare / New Issue），享有 100% 官方富文本体验。

### 2.5 Cordis 微内核标准规范
- **按需依赖声明**：显式声明核心必需服务 `['tools', 'commands']`，防止因无头运行环境缺少 `webServer` 或 `workspaceRegistry` 导致插件陷入 `PENDING` 假死状态；
- **优雅动态探测**：通过 `if (ctx.webServer)` 探测环境，有 Web UI 服务时动态挂载路由，无 Web 环境时无缝降级为纯 CLI 工具；
- **生命周期 Effect 闭环**：所有 HTTP 路由与命令注册均持有 Disposer 清理函数，插件热重载或重新挂载时自动彻底注销，零内存泄漏；
- **配置自校验与服务暴露**：基于 Standard Schema 规范实现强类型校验与默认值注入，通过 `ctx.provide('github', executor)` 向生态插件暴露单例服务。

### 2.6 三态环境诊断与交互引导状态机 (Setup & Authentication Lifecycle Guard)
- **三态状态模型 (Three-State Machine)**：将环境就绪判定严格划分为 `NOT_INSTALLED`（未安装 CLI）、`NOT_LOGGED_IN`（已安装未登录）、`AUTHENTICATED`（已认证）三态，彻底消除“把未安装当作未登录”的状态屏蔽隐患；
- **平台自适应安装策略**：后端探测到 `ENOENT` 时根据 `process.platform` 组装对应平台的安装命令（Windows: `winget`，macOS: `brew`，Linux: `apt/dnf`）与官方安装包地址；
- **安全辅助与白名单终端唤起**：Web 端提供一键命令复制，后端 `/api/github/action` 提供安全白名单唤起接口，避免在前端模拟复杂交互式 PTY 的脆弱性；
- **焦点感知自愈 (Focus Auto-Recovery)**：前端挂载 `window.focus` 事件监听，用户在外部浏览器或终端完成认证后切回 DSH 界面，自动静默重新探测并无缝更新 UI，实现零摩擦闭环体验。

### 2.7 多维 Issue 身份判定与并发聚合引擎 (Multi-Dimensional Issue Engine)
- **多重身份决策矩阵**：基于当前登录用户 `currentUser`（`auth.user`）对 Issue 执行身份归类：
  - `reported`（用户提单）：`repoOwner === currentUser && author != currentUser`（外部访客在本人维护的仓库中提出的反馈）；
  - `assigned`（分配待办）：`assignees.includes(currentUser)`（指派给本人的任务，跨仓库通用）；
  - `created`（我发起的）：`author === currentUser`（本人亲自创建的 Issue）。
- **三路并发搜索与 URL 去重**：后端在 `/api/github/global-overview` 中通过 `Promise.all` 同时发起 `--owner=@me`、`--assignee=@me`、`--author=@me` 检索，按 URL 唯一性合并去重并按最后更新时间统一降序排列；
- **双端视图无缝打标**：驾驶舱提供四态响应式药丸筛选（全部/用户提单/指派待办/我发起的），右侧栏直接常驻展现当前工作区所属 Issue 任务清单与状态徽章。

### 2.8 智能版本检测与跨平台一键升级引擎 (Update & Upgrade Engine)
- **检查与 gh 链路完全并行**：
  - 前端版本检查与 gh 环境探测（安装/登录/业务数据）**零依赖并行发起**（挂载即触发，仅 300ms 微延迟避让首屏），不串行等待概览返回，gh 环境异常时升级横幅照常展示；
  - 服务端 `inFlightPromise` 请求合流 + 24 小时缓存，多面板同时挂载零请求风暴。
- **更新源三态可选（UI 持久化 store 优先）**：
  - 三态单选：官方源（默认）/ 国内镜像 npmmirror / 关闭自动检查；
  - 持久化于 `~/.dsh/data/dsh-github-flow/update-settings.json`，保存即热切换并失效 24h 缓存（防"切换无效"感知）；
  - **单源严格不互备**：显式选择的源不静默回落——镜像同步滞后正是选官方的理由，探测失败如实返回；
  - 「关闭检查」语义为关自动提示不关能力：`/gh upgrade`（force）与一键升级路由不受熔断；
  - 一键升级的 `NPM_CONFIG_REGISTRY` 跟随所选源（注入查询函数而非静态值，切源实时生效）。
- **跨平台 Shell 调度与 macOS PATH 自愈**：
  - **Windows**：采用 `cmd.exe /d /s /c`，彻底规避 PowerShell 5.1 不支持 `||` 导致的语法崩溃，启动仅 ~10ms；
  - **macOS / Linux**：采用用户 Default Shell（`/bin/zsh` 或 `/bin/bash`）；
  - **macOS PATH 智能补全**：针对 Mac 桌面端由 GUI (Finder/Dock) 启动不继承 `.zshrc` 的痛点，自动将当前 Node 目录、Apple Silicon `/opt/homebrew/bin` 及 Intel `/usr/local/bin` 动态注入 PATH 前端，确保 100% 发现 npm/pnpm。
- **环境自省与源码保护防线 (Dev-Link Safe)**：
  - 自动识别当前是否处于本地 Git 源码软链接模式（`link:`），若是则自动阻止 npm 覆盖，保护工作区源码；
  - 自动识别桌面版 Profile 目录，无全局 CLI 时直接在 `~/.dsh/profiles/desktop` 下就地更新，无需用户具备终端知识。
- **并发互斥锁与重启提示闭环**：
  - 内存互斥锁防止连续点击导致包管理器 lockfile 竞争；
  - 升级完成后明确提醒用户重启 DSH 服务以完全加载最新后端模块，同时支持立即刷新页面预览新界面。

### 2.9 客户端持久化与 SWR (Stale-While-Revalidate) 极速直出架构
- **0ms 首屏瞬间直出机制**：
  - 在全景驾驶舱组件挂载时，`data` 初始值直接通过 `React.useMemo` 从 `localStorage` 读取上一次保存的历史快照；
  - 消除传统加载时全屏阻塞卡顿，彻底抹平每次打开等待 8~15 秒的痛点，达到即开即用的丝滑体感。
- **透明数据新鲜度与状态胶囊 (SyncStatusBadge)**：
  - 胶囊状态精准映射：`[⏳ 后台同步中...]`、`[✅ 已是最新 (15:30)]`、`[📦 本地快照 (X分钟前)]`、`[⚠️ 同步超时已保留缓存]`；
  - 支持人性化相对时间推导（刚刚、X分钟前、X小时前、X天前），消除用户对数据时效性的疑虑。
- **设置中心 (GlobalSyncSettingsModal) 四分区**：
  - **🔄 数据同步**：`⚡ 秒开模式 (SWR, 默认)` / `📋 仅手动刷新 (Manual Only)` 两态选择；
  - **🌐 网络代理**：代理配置即时全局生效（写 proxy.json + 重应用 dispatcher，零插件重载）；
  - **⬆️ 更新设置**：更新源三态选择（官方/镜像/关闭），保存即热切换并真实验证；
  - **ℹ️ 关于**：插件身份信息（版本/仓库/npm/协议/求 Star）；
  - 弹窗支持 `initialSection` 直开指定分区——插件徽标点击直开「关于」，齿轮默认「数据同步」。
- **插件身份标识闭环**：
  - 面板标题（驾驶舱/右侧栏）带「插件」徽标，明确标注界面由第三方插件 `dsh-github-flow` 提供（非 DSH / GitHub 官方）；
  - 徽标点击派发全局事件打开「关于」弹窗（不直接跳浏览器）；多宿主同挂载时经可见性守卫防双层弹窗叠层；
  - 右侧栏同样提供 ⚙️ 设置按钮，与主页复用同一弹窗组件，保存经事件总线双侧实时对齐。
- **离线极端容灾保护 (Fail-Safe Offline Guard)**：
  - 后台静默重验若遭遇断网、弱网或进程超时，界面平滑降级，**100% 保持旧数据完整可用**，绝不回退至空白占位或报错中断。
- **数据链路超时防线**：
  - 全部前端数据链路 fetch 绑定 `AbortController`（45s 兜底；登录探测 10s）——代理劫持回环地址等极端场景下用户得到明确超时出口，绝不永久转圈（未安装 gh 用户的刷新卡死修复）；
  - 后端 `gh` 探测毫秒级返回 ENOENT/安装引导，前端安装引导卡（AuthGuideCard）承载唤起终端（stdio ignore，无 profile）等自愈出口。

