# DSH GitHub Flow (`dsh-github-flow`)

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-github-flow"><img src="https://img.shields.io/npm/v/dsh-github-flow.svg?style=flat-square&color=0969da" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/dsh-github-flow"><img src="https://img.shields.io/npm/dm/dsh-github-flow.svg?style=flat-square&color=2ea043" alt="npm downloads" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="license" /></a>
  <a href="https://deepseek-harness.github.io/deepseek-harness/"><img src="https://img.shields.io/badge/Cordis-Compatible-8957e5.svg?style=flat-square" alt="Cordis" /></a>
</p>

<p align="center">
  <b>基于 GitHub CLI (<code>gh</code>) 为 DeepSeek Harness (DSH) 打造的现代化原生工作流集成插件。</b><br>
  深度打通本地 Git 仓库开发与远程 GitHub 协作（PR、Issue、Actions CI 诊断与代码审查），兼备 Agent 模型工具、人类 Slash 指令以及原生 Web UI 双重视图。
</p>

<p align="center">
  <b><a href="#-简体中文">简体中文</a></b> | <b><a href="#-english">English</a></b>
</p>

---

## 🇨🇳 简体中文

### 🌟 核心特性

1. **零鉴权配置，开箱即用**：
   - 自动复用宿主机已通过 `gh auth login` 认证的登录凭据（OAuth Token / 系统 Keyring），无需在 DSH 中存储任何明文 GitHub PAT。
2. **工作区目录深度亲和 (CWD 绑定)**：
   - 自动继承当前会话所在的 Workspace 物理目录，`gh` 自动识别当前 Git 仓库与本地工作分支，无需 Agent 每次显式传递 `owner/repo`。
3. **高信噪比与 Token 防溢出治理**：
   - 拒绝 70+ 个碎片化微型工具撑爆上下文，收敛聚合为 **5 大领域核心 Tool**。
   - 所有查询原生采用 `--json <fields>` 按需返回；对 `diff`、`log_failed` 设置安全截断保护（默认 24KB），防止模型上下文窗口溢出崩溃。
4. **原生 Web UI 双重视图**：
   - **全局驾驶舱**（主导航栏 `sidebar.panellist`，Order 20）：透视账号全局仓库、本地工作区矩阵、个人待办 PR 与 Issues；
   - **右侧栏工作区面板**（`sidebarRightTabs`，Order 40）：在会话引导页与右侧抽屉常驻呈现当前仓库的 PR 列表、Checks 状态药丸与快捷操作。
5. **符合 Cordis 官方微内核架构**：
   - 暴露原生 `GitHubService`（`ctx.github`），允许生态其他插件复用；
   - 具备 Schemastery 强类型运行时配置校验（`Config`）；
   - 支持领域事件系统（`github/pr:create`, `github/issue:create`）。

---

### 🚀 快速安装

#### 方式 1：通过 npm 安装（推荐）
在 DSH 终端执行：
```bash
# 安装到当前桌面端 Profile
dsh plugin --profile desktop add dsh-github-flow

# 或者安装到 Web Profile
dsh plugin --profile web add dsh-github-flow
```

#### 方式 2：通过 DSH 插件市场一键安装
在 DSH 客户端界面打开 **「插件市场 (Market)」**，搜索 `dsh-github-flow` 并点击“安装”。

#### 方式 3：直接让 AI Agent 安装（对话式安装）
在 DSH 聊天框中对 Agent 直接说：
> *“帮我安装一下 `dsh-github-flow` 插件。”*

---

### 🛠️ Agent 工具集速查

| 工具名称 | 核心操作 (`action`) | 典型场景 |
|---|---|---|
| `github_pr` | `list`, `view`, `create`, `diff`, `checks`, `review`, `merge` | 让 Agent 查看 PR 详情、检查 CI 状态、执行代码评审、合并 PR |
| `github_issue` | `list`, `view`, `create`, `comment`, `close`, `reopen` | 查看与搜索 Issue、创建 Issue、追加排查进展评论 |
| `github_run` | `list`, `view`, `log_failed`, `rerun`, `cancel` | 查看 CI 构建流水线，特别是 `log_failed` 可直接提取报错日志供 Agent 修复 |
| `github_repo` | `view`, `search_code`, `search_repos` | 查看仓库元数据、跨仓库代码搜索 |
| `github_api` | 任意端点（如 `repos/{owner}/{repo}/releases`） | 底层直接调用 REST / GraphQL API（支持 `--jq` 预过滤） |

---

### 💬 人类 Slash 命令

在 DSH 对话输入框直接使用：
- `/gh status`：检查当前 GitHub CLI 账号登录状态、授权作用域与当前本地目录关联仓库；
- `/gh help`：查看使用帮助与常见语法示例。

---

### ⚙️ 插件配置项 (Config)

在 `cordis.patch.yml` 或 Profile 配置中自由覆盖如下字段：

```yaml
- insert:
    - id: github-flow
      name: dsh-github-flow
      config:
        ghPath: 'gh'              # GitHub CLI 程序路径（内网或特定环境可指定绝对路径）
        defaultTimeoutMs: 30000   # 命令执行超时时间（毫秒）
        maxOutputChars: 24000     # 单次命令最大返回字符数（防 Token 溢出保护）
        cacheTtlMs: 15000         # 界面概览数据缓存时间（毫秒）
        defaultListLimit: 20      # 默认查询列表返回条数
```

---

### 🔌 生态服务扩展 (Cordis Service)

其他 DSH 插件可通过依赖注入复用本插件的能力：

```ts
import type { Context } from '@deepseek-ai/cordis';

export const inject = ['github'];

export function apply(ctx: Context) {
  // 通过 ctx.github 直接调用底层安全执行引擎
  const auth = await ctx.github.checkAuth();
  const repo = await ctx.github.getRepoMetadata();
}
```

---

## 🇺🇸 English

### 🌟 Key Features

1. **Zero-Configuration Authentication**:
   - Seamlessly reuses existing host credentials from `gh auth login` (OAuth tokens / system Keyrings) without exposing plain-text Personal Access Tokens (PATs) in DSH.
2. **Deep Workspace Affinity (CWD Binding)**:
   - Automatically scopes commands to the active session workspace. `gh` resolves the remote repository and current Git branch automatically, saving model tokens from redundant `owner/repo` arguments.
3. **High Signal-to-Noise Ratio & Token Budget Protection**:
   - Consolidates over 70+ scattered micro-tools into **5 focused domain tools**.
   - Queries use `--json <fields>` projections by default; long diffs and failed CI logs are safely truncated (default 24KB) to protect the model's context window.
4. **Dual Native Web UI Views**:
   - **Global Cockpit** (`sidebar.panellist`, Order 20): Account-wide repository overview, local workspace matrix, and pending personal PRs/issues.
   - **Right Sidebar Panel** (`sidebarRightTabs`, Order 40): Shows current repository status, PR list with CI check pills, and quick action buttons inside the session.
5. **Standard Cordis Microkernel Compliance**:
   - Exposes native `GitHubService` (`ctx.github`) for ecosystem extensibility;
   - Strongly typed runtime validation via Schemastery (`Config`);
   - Domain event broadcasting (`github/pr:create`, `github/issue:create`).

---

### 🚀 Installation

#### Option 1: Via npm (Recommended)
Run in your DSH terminal:
```bash
# Install to desktop profile
dsh plugin --profile desktop add dsh-github-flow

# Or install to web profile
dsh plugin --profile web add dsh-github-flow
```

#### Option 2: Via DSH In-App Marketplace
Open the **Marketplace** tab in DSH, search for `dsh-github-flow`, and click **Install**.

#### Option 3: Conversational Install via AI Agent
Simply ask your DSH Agent in chat:
> *"Please install the `dsh-github-flow` plugin for me."*

---

### 🛠️ Agent Tools Reference

| Tool Name | Actions | Typical Use Cases |
|---|---|---|
| `github_pr` | `list`, `view`, `create`, `diff`, `checks`, `review`, `merge` | Inspect PR details, verify CI checks, conduct code reviews, merge pull requests |
| `github_issue` | `list`, `view`, `create`, `comment`, `close`, `reopen` | Search and view issues, create issues, add comments |
| `github_run` | `list`, `view`, `log_failed`, `rerun`, `cancel` | Monitor Actions workflows; `log_failed` extracts failure logs for automatic fixes |
| `github_repo` | `view`, `search_code`, `search_repos` | Query repository metadata, search cross-repo code |
| `github_api` | Any GitHub REST / GraphQL endpoint | Universal escape hatch for custom queries (supports `--jq`) |

---

### ⚙️ Configuration

Customize options in your `cordis.patch.yml` or profile:

```yaml
- insert:
    - id: github-flow
      name: dsh-github-flow
      config:
        ghPath: 'gh'              # Custom path to gh binary
        defaultTimeoutMs: 30000   # Timeout in milliseconds
        maxOutputChars: 24000     # Maximum characters per output (Token guard)
        cacheTtlMs: 15000         # Web overview cache time
        defaultListLimit: 20      # Default page size
```

---

## 📚 Documentation

- [npm Publishing & Maintenance Guide](./docs/npm-publish-guide.md)
- [Architecture & Design Specifications](./docs/architecture.md)

---

## 📄 License

This project is licensed under the [MIT License](./LICENSE).
