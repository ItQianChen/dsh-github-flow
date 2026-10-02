# DSH GitHub Flow (`dsh-github-flow`)

基于 GitHub CLI (`gh`) 为 DeepSeek Harness (DSH) 打造的现代化原生集成插件。  
深度打通本地 Git 仓库开发与远程 GitHub 协作（PR、Issue、Actions CI 诊断与代码审查），兼备 Agent 模型工具、人类 Slash 指令以及原生 Web UI 工作台。

---

## 🌟 核心特性

1. **零鉴权配置，开箱即用**：
   - 自动复用宿主机已通过 `gh auth login` 认证的登录凭据（OAuth Token / 系统 Keyring），无需在 DSH 中存储任何明文 GitHub PAT。
2. **工作区目录深度亲和 (CWD 绑定)**：
   - 自动继承当前会话所在的 Workspace 物理目录，`gh` 自动识别当前 Git 仓库与本地工作分支，无需 Agent 每次传参 `owner/repo`。
3. **高信噪比与 Token 防溢出治理**：
   - 拒绝 70+ 个碎片化微型工具撑爆上下文，聚合为 **5 大领域核心 Tool**。
   - 所有查询原生采用 `--json <fields>` 按需返回；对 `diff`、`log_failed` 设置 24KB 智能截断保护，防止上下文窗口溢出。
4. **原生页面工作台（工作区上方，自动任务下方）**：
   - 在 DSH 侧边栏（`sidebar.panellist`, `order: 20`）常驻呈现 GitHub Mark 图标；
   - 点击在中央视口（`main` slot, `key: "github"`）展开 GitHub 综合工作台，实时呈现仓库状态、待审 PR（含 CI Checks 药丸徽章）、Issues 以及 Actions 构建流水线。

---

## 📦 项目结构

```text
dsh-github-flow/
├── package.json              # 模块定义、Cordis bundle 声明及 exports
├── cordis.patch.yml          # DSH Profile 自动装配补丁
├── tsconfig.json             # TypeScript 编译配置
├── README.md                 # 插件说明文档
├── PLAN.md                   # 详细架构与实施方案设计书
├── src/
│   ├── index.ts              # Host 插件主入口：apply(ctx) 生命周期与服务注入
│   ├── types.ts              # 数据结构与接口类型定义
│   ├── executor.ts           # 底层 gh 执行引擎（execFile 参数数组隔离、防注入、超时与截断）
│   ├── commands/
│   │   └── gh.ts             # 人类交互斜杠命令 (/gh status, /gh help)
│   ├── api/
│   │   └── routes.ts         # 面向 Web 视口的 Host HTTP 路由 (/api/github/overview)
│   ├── tools/                # Agent 模型工具集
│   │   ├── pr.ts             # github_pr: PR 查看、比对、Checks、评审与合并
│   │   ├── issue.ts          # github_issue: Issue 检索、创建、追加评论、关闭
│   │   ├── run.ts            # github_run: Actions CI 监控与 --log-failed 报错定位
│   │   ├── repo.ts           # github_repo: 仓库元数据与跨仓库搜索
│   │   └── api.ts            # github_api: 万能 REST/GraphQL 逃生门
│   └── client/               # Client 页面扩展 (DSH Slot 体系)
│       ├── index.ts          # Client 插件入口：注册 sidebar.panellist 与 main slot
│       ├── style.ts          # 原生主题自适应样式
│       └── panel.ts          # GitHub 综合工作台视图组件
└── lib/                      # TypeScript 编译输出产物（双端 ESM）
```

---

## 🛠️ Agent 工具集速查

| 工具名称 | 核心操作 (`action`) | 典型场景 |
|---|---|---|
| `github_pr` | `list`, `view`, `create`, `diff`, `checks`, `review`, `merge` | 让 Agent 查看 PR 详情、检查 CI 状态、执行代码评审、合并 PR |
| `github_issue` | `list`, `view`, `create`, `comment`, `close`, `reopen` | 查看与搜索 Issue、创建 Issue、追加排查进展评论 |
| `github_run` | `list`, `view`, `log_failed`, `rerun`, `cancel` | 查看 CI 构建流水线，特别是 `log_failed` 可直接提取报错日志供 Agent 修复 |
| `github_repo` | `view`, `search_code`, `search_repos` | 查看仓库元数据、跨仓库代码搜索 |
| `github_api` | 任意端点（如 `repos/{owner}/{repo}/releases`） | 底层直接调用 REST / GraphQL API（支持 `--jq` 预过滤） |

---

## 💬 人类 Slash 命令

在 DSH 对话输入框直接使用：
- `/gh status`：查看当前 GitHub CLI 登录身份、授权作用域与当前关联仓库；
- `/gh help`：查看使用帮助与常见语法示例。

---

## 🖥️ 页面显示安装与体验

1. **依赖前提**：
   宿主机已安装 GitHub CLI (`gh`) 并已登录：
   ```bash
   gh auth status
   ```
2. **在 DSH 中安装与挂载**：
   通过 DSH Profile 配置或在插件管理中载入本插件 bundle：
   ```yaml
   # cordis.patch.yml
   - insert:
       - id: github-flow
         name: dsh-github-flow
   ```
3. **界面体验**：
   - 启动 DSH 后，侧边栏将在“自动任务”图标下方出现 **GitHub 图标**；
   - 点击该图标即可在主区域展开 GitHub 综合工作台，实时管理 PR、Issues 与 CI 流水线。
