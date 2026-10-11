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
│     │                                                              │        │
│     │   - UpdateChecker (双源极速探测 + 24h 缓存 + Fail-Safe)        │        │
│     │   - UpgradeManager (跨平台自适应 + 互斥锁 + macOS PATH 补全)   │        │
│     └──────┬───────────────────────┬────────────────────────┬──────┘        │
│            │                       │                        │               │
│            ▼                       ▼                        ▼               │
│  ┌──────────────────┐    ┌──────────────────┐    ┌───────────────────────┐  │
│  │  5 大 Agent 工具  │    │  人类 Slash 指令 │    │   Host HTTP WebServer │  │
│  │  (defineTool DSL)│    │  /gh status      │    │ (Effect Disposer 清理)│  │
│  │  - pr            │    │  /gh upgrade     │    │ - /api/github/overview│  │
│  │  - issue         │    │  /gh help        │    │ - /api/github/action  │  │
│  │  - run           │    └──────────────────┘    │ - /api/github/refresh │  │
│  │  - repo          │                            │ - /check-update (闲时)│  │
│  │  - api (逃生门)  │                            │ - /upgrade (一键自动) │  │
│  └──────────────────┘                            └──────────┬────────────┘  │
│                                                             │               │
│                                                             │ HTTP API      │
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
- 所有 Agent 工具的输出统一经过归一化，列表自动打包为 `{ items, count }`，标量打包为 `{ result }`，100% 严丝合缝契合 DSH 工具网关模式约束。

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
- **业务优先与闲时解耦**：
  - 核心业务接口 `/overview` 仅读取内存缓存，耗时 0ms，绝不阻塞首屏；
  - 前端在 gh 数据完全加载就绪后，延迟 1.5 秒通过 `requestIdleCallback` 触发独立更新探针 `/check-update`，对主流程零干扰。
- **国内双 Registry 极速容灾**：
  - 默认第一顺位请求国内淘宝镜像 `https://registry.npmmirror.com`（2.5 秒超短超时，50~150ms 响应）；
  - 失败时自动静默回退官方 npmjs 兜底，并支持配置私有源；网络故障 100% Fail-Safe 吸收。
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
