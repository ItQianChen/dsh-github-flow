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
│  │                        │                   │(Schemastery 运行时校验)   │  │
│  └───────────┬────────────┘                   └─────────────┬────────────┘  │
│              │                                              │               │
│              ▼                                              ▼               │
│     ┌──────────────────────────────────────────────────────────────┐        │
│     │               GitHubService (ctx.github 原生服务)             │        │
│     │   - checkAuth(cwd)      - getRepoMetadata(cwd)               │        │
│     │   - run<T>(args, opts)  [execFile 数组隔离 + 24KB 智能截断]     │        │
│     └──────┬───────────────────────┬────────────────────────┬──────┘        │
│            │                       │                        │               │
│            ▼                       ▼                        ▼               │
│  ┌──────────────────┐    ┌──────────────────┐    ┌───────────────────────┐  │
│  │  5 大 Agent 工具  │    │  人类 Slash 指令 │    │   Host HTTP WebServer │  │
│  │  (defineTool DSL)│    │  /gh status|help │    │ (Effect Disposer 清理)│  │
│  │  - pr            │    └──────────────────┘    │ - /api/github/overview│  │
│  │  - issue         │                            │ - /api/github/action  │  │
│  │  - run           │                            │ - /api/github/refresh │  │
│  │  - repo          │                            └──────────┬────────────┘  │
│  │  - api (逃生门)  │                                       │               │
│  └──────────────────┘                                       │ HTTP API      │
└─────────────────────────────────────────────────────────────┼───────────────┘
                                                              │
┌─────────────────────────────────────────────────────────────┼───────────────┐
│                        DSH Web Client                       ▼               │
│                                                                             │
│   ┌──────────────────────────────────┐    ┌─────────────────────────────┐   │
│   │       全局驾驶舱 (Main Slot)      │    │  右侧栏面板 (Right Sidebar)  │   │
│   │   - 账号全局所有 GitHub 仓库      │    │  - 当前会话工作区关联仓库   │   │
│   │   - 本地工作区矩阵透视           │    │  - PR 列表与 CI Checks 药丸 │   │
│   │   - 个人待办 PRs & Issues        │    │  - 快速创建 PR / Issue      │   │
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
- 对长文本输出（如大型 PR 的完整 `diff`、CI 失败步骤日志）设置安全截断阈值（默认 24KB），保留头尾关键上下文并添加显式截断标记，杜绝撑爆模型上下文；
- 所有 Agent 工具的输出统一经过 `normalizeOutput` 归一化，列表自动打包为 `{ items, count }`，标量打包为 `{ result }`，100% 严丝合缝契合 DSH 工具网关模式约束。

### 2.4 原生浅色/深色主题自适应与 2x2 黄金操作栏
- 全面对齐 DSH 官方 DSW 语义设计变量，基于 `body[data-ds-dark-theme]` 驱动无闪烁双模式切换；
- 右侧栏 2x2 快捷操作栏彻底废弃失效的 Electron `prompt()` 阻塞弹窗，全面采用官方直达模式（Compare / New Issue），享有 100% 官方富文本体验。

### 2.5 Cordis 微内核标准规范
- **服务依赖就绪**：声明 `['tools', 'commands', 'webServer', 'workspaceRegistry']`，确保 Web 路由与命令服务在环境就绪后激活；
- **生命周期 Effect 闭环**：所有 HTTP 路由与命令注册均持有 Disposer 清理函数，插件热重载或重新挂载时自动彻底注销，零内存泄漏；
- **配置自校验与服务暴露**：基于 Standard Schema 规范实现强类型校验与默认值注入，通过 `ctx.provide('github', executor)` 向生态插件暴露单例服务。
