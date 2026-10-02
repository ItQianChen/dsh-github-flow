# DSH GitHub 插件实施方案 (PLAN)

> **项目名称**：`dsh-plugin-github`  
> **设计理念**：遵循务实工程思维（面向数据流与状态归属、最小破坏性、零过度抽象、全链路安全防注入与上下文 Token 保护）。  
> **执行底座**：DeepSeek Harness (Cordis 微内核体系) + 宿主机原生 GitHub CLI (`gh`)。  
> **双端联动**：Host 侧提供 Agent Tools / Slash 命令 / HTTP 后端路由；Client 侧提供原生 UI 面板，常驻展示 GitHub 仓库、PR、CI 与 Issue 状态。

---

## 一、需求背景与架构定位

### 1.1 核心痛点与解决思路
- **传统 MCP Server 方案痛点**：必须手动申请并配置 GitHub Personal Access Token (PAT)，容易过期且配置门槛高；暴露出 70+ 个分散工具，严重挤占 Agent 上下文空间；且无法感知开发者当前本地的 Git 仓库和分支。
- **基于 `gh` 的核心优势**：
  1. **零配置开箱即用**：直接复用宿主机已有的 `gh auth` 鉴权上下文（OAuth Token / 系统 Keyring），无需在 DSH 中存储任何明文密钥。
  2. **工作区环境自感知 (CWD 亲和)**：命令直接在当前 Session 工作区目录执行，`gh` 自动识别当前仓库的 remote 与当前正在开发的分支，无需 Agent 每次显式传递 `owner/repo`。
  3. **结构化 JSON 投影与 Token 防溢出**：所有 `gh` 查询原生使用 `--json <fields>`，按需获取字段；内置长文本（如 Diff、CI 失败日志）安全截断策略，防止撑爆上下文。
  4. **页面级直观透视（新增）**：在 DSH Web 侧边栏及主视图提供原生 UI 面板，随时查看当前仓库、待审 PR、CI 状态和未解决 Issue，让开发者无需切出终端或浏览器。

---

## 二、项目骨架与目录组织

项目建立在 `D:\Desktop\AgentWork\DSHQuestion\dsh-plugin-github` 目录下：

```text
dsh-plugin-github/
├── package.json              # 模块定义、Cordis bundle 声明、双端入口 (main, client) 及 peerDependencies
├── cordis.patch.yml          # DSH Profile 自动装配补丁（插入 id & name）
├── tsconfig.json             # TypeScript 配置（ESM, Node16/NodeNext）
├── PLAN.md                   # 架构与实施方案（本文档）
├── README.md                 # 插件使用与配置文档
├── src/
│   ├── index.ts              # Host 插件主入口：apply(ctx) 生命周期、服务注入、Tool、Command、API 路由注册
│   ├── types.ts              # 通用数据结构与类型定义
│   ├── executor.ts           # 底层 gh 执行引擎（进程安全隔离、超时、cwd 绑定、错误归一化）
│   ├── commands/             # 人类交互斜杠命令
│   │   └── gh.ts             # /gh 命令（快速查看认证状态、账号切换指引）
│   ├── api/                  # 面向 Client 页面展示的 Host HTTP 路由
│   │   └── routes.ts         # GET /api/github/overview 等数据接口
│   ├── tools/                # 模型工具集（按业务领域收敛为 5 个核心 Tool）
│   │   ├── pr.ts             # github_pr（PR 查看、比对、Checks、评审与合并）
│   │   ├── issue.ts          # github_issue（Issue 检索、详情、创建、追加评论、关闭）
│   │   ├── run.ts            # github_run（GitHub Actions 监控与 --log-failed 故障诊断）
│   │   ├── repo.ts           # github_repo（仓库信息、分支探索与跨仓库代码搜索）
│   │   └── api.ts            # github_api（以 gh api 为底座的万能 REST/GraphQL 逃生门）
│   └── client/               # Client 端 UI 视图扩展（基于 DSH Slot 体系）
│       ├── index.ts          # 注册 sidebar.panellist 与 main slot
│       ├── icons.ts          # GitHub SVG 图标集（适配主题色）
│       ├── components/       # 视图组件
│       │   ├── GithubPanel.tsx   # GitHub 综合工作台主面板
│       │   ├── RepoCard.tsx      # 当前仓库元数据卡片
│       │   ├── PrList.tsx        # PR 列表与 Checks/Mergeable 状态卡片
│       │   ├── IssueList.tsx     # Issue 列表卡片
│       │   └── RunList.tsx       # CI/Actions 构建运行流水线卡片
│       └── style.css         # UI 样式（完全对齐 DSH 原生 Theme 变量）
└── dist/                     # 编译输出产物（Host: lib/index.js, Client: lib/client.js）
```

---

## 三、页面显示与 Slot 挂载设计 (Client UI Architecture)

### 3.1 侧边栏精准锚点（“自动任务下面，工作区上面”）
通过对 DSH Client Slot 树拓扑分析（`Slots.listSubTree`），侧边栏按钮列表由 `sidebar.panellist` 统一管理：
- **现存注册序列**：
  - `plugins`（插件市场）：`order: 0`
  - `schedules`（自动任务）：`order: 10`
- **GitHub 插件挂载策略**：
  - 注册目标 Slot：`sidebar.panellist`
  - 参数：`id: 'github'`, `order: 20`, `label: 'GitHub'`
  - **位置效果**：严格排列在 **“自动任务（schedules, order: 10）下面”** 并且位于 **“工作区列表（sidebar.workspaces）上方”**，完美满足定位要求。
  - **图标呈现**：当侧边栏展开或折叠成 Rail 时，均呈现统一的高清 GitHub Mark，带微交互悬浮态。

### 3.2 中央主视图工作台 (`main` Slot)
当用户在侧边栏点击 GitHub 图标时，DSH 的中央区域（`main` slot，`key: 'github'`）呈现 **GitHub 综合工作台**：

1. **顶部仓库概览（Repository Header）**：
   - 远程仓库全名：`owner/repo`（附带一键直达 GitHub Web 链接）；
   - 本地分支与对齐状态：当前本地 Git 分支名、是否落后/超前远程默认分支（main/master）；
   - 当前登录身份：GitHub 账号名、头像徽标、已授权的 Token scopes。
2. **Pull Request 专属看板（PR / rq 视图）**：
   - Open / Merged / Closed 状态切换标签栏；
   - PR 基础信息：PR 编号、标题、作者、分支对（`head -> base`）；
   - **CI Checks 实时药丸徽章**：
     - 全部通过：绿色对勾（`Checks Passed`）；
     - 存在失败：红色感叹号（`Checks Failed`）；
     - 运行中：黄色旋转圈（`Running`）。
   - **可合并性状态**：`Mergeable`（可安全合并）或 `Conflicting`（有代码冲突）；
   - **一键快捷联动**：
     - `打开浏览器`（Native Open）；
     - `派发给 Agent 审查`（一键在当前对话中唤起 Agent 对该 PR 进行深度 Review）。
3. **未解决 Issue 列表（Issues View）**：
   - 展示当前仓库分配给“我”或处于 Open 状态的 Issue；
   - 显示标签（Bug, Feature, Docs 等）与创建时间；
   - 提供“派发给 Agent 修复”的快捷交互入口。
4. **GitHub Actions / CI 运行流水线（Actions View）**：
   - 展示最近 5 次 Workflow 运行状态；
   - 针对失败的运行，高亮突出显示，并提供“一键提取报错日志”按钮。

### 3.3 前后端数据交互链路
1. **Host 端 API 暴露**：
   - Host 侧注入 `ctx.webServer`，注册轻量级专用 HTTP 端点：
     - `GET /api/github/overview`：自动定位当前工作区物理路径，执行 `gh` 命令聚合返回当前仓库信息、PR 列表、CI 列表与登录状态；
     - `POST /api/github/refresh`：清除临时缓存，强制重新拉取最新 GitHub 状态。
2. **Client 端数据驱动**：
   - Client 组件挂载后通过标准 `fetch('/api/github/overview')` 加载数据；
   - 支持自动按需定时轮询（如 60s）或手动一键刷新；
   - 完全适配 DSH 原生主题变量（无缝支持浅色/深色主题动态跟随）。

---

## 四、Agent 模型工具集规范 (Host Tool Architecture)

保持 5 大高内聚领域工具，杜绝过多碎片工具挤爆 Agent 上下文：

1. **`github_pr`**（PR 闭环）：`list`, `view`, `create`, `diff`, `checks`, `review`, `merge`。
2. **`github_issue`**（任务管理）：`list`, `view`, `create`, `comment`, `close`, `reopen`。
3. **`github_run`**（CI/CD 诊断）：`list`, `view`, `log_failed`, `rerun`。（重点强化 `--log-failed` 精准截取失败步骤错误栈）。
4. **`github_repo`**（仓库探索）：`view`, `clone`, `fork`, `search`。
5. **`github_api`**（万能逃生门）：直接透传调用任意 REST/GraphQL 端点，内置 `--jq` 过滤。

---

## 五、安全与稳定性保障机制

1. **防止命令注入（Command Injection）**：
   - 严格采用 `node:child_process.execFile` 数组形式传参，绝不拼接任何 Shell 字符串。
2. **会话目录穿透（CWD 亲和性）**：
   - 无论是 Agent 调工具还是 Web 页面请求，均绑定当前 Workspace 物理路径，天然获取本地 `.git` 配置，多工程切换互不干扰。
3. **Token 防溢出治理**：
   - 对 `pr diff`、`run log_failed` 等潜在巨型输出，强制设置 20KB（约 5,000 tokens）智能截断阈值，并在返回中指引 Agent 按需缩小范围。

---

## 六、实施路线图 (Milestones)

| 阶段 | 核心任务目标 | 交付物 |
|---|---|---|
| **Phase 1** | 初始化双端脚手架：`package.json`（声明 `main` 与 `client`）、`cordis.patch.yml`、`tsconfig.json` | 工程基础设施配置 |
| **Phase 2** | 实现 Host 底层安全执行引擎 `GhExecutor` 与数据接口 `/api/github/overview` | `src/executor.ts`, `src/api/routes.ts` |
| **Phase 3** | 实现 5 大领域 Agent Tools（PR, Issue, Run, Repo, API）与人类 Slash 命令 `/gh` | `src/tools/*.ts`, `src/commands/*.ts` |
| **Phase 4** | 实现 Client 前端 UI：在 `sidebar.panellist` 挂载图标，在 `main` 挂载 GitHub 综合工作台 | `src/client/*.ts`, `src/client/components/*` |
| **Phase 5** | 编译打包（生成 Host 与 Client 产物），挂载到 DSH Desktop Profile 进行全流程端到端验收 | 插件打包、页面呈现验收、Agent 调用验收 |

---

## 七、审核卡点与确认

请您审核加入页面展示后的完整实施方案：
1. **页面位置**：确认采用 `sidebar.panellist`（`order: 20`），呈现于“自动任务下面、工作区上面”，点击展开中央工作台；
2. **展示信息**：涵盖仓库基础信息、PR 列表（含 Checks / 冲突检测）、未解决 Issue、CI 构建流水线及当前 GitHub 登录账号；
3. **确认推进**：若方案符合您的预期，我将立即进入 **Phase 1 & Phase 2** 启动核心代码编写！
