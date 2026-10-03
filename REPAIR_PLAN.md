# DSH GitHub Flow 插件官方规范修复计划方案 (REPAIR PLAN)

> **目标**：对照 [DeepSeek Harness 官方 Cordis 开发教程](https://deepseek-harness.github.io/deepseek-harness/develop/cordis-tutorial/) 与插件设计原则，彻底解决 `dsh-github-flow` 项目中的架构违规、运行死锁、安全隐患与规范缺失，构建符合 Harness 官方标准的高可用、可扩展、生产级插件。
>
> **版本规划**：按照 **P0（致命阻塞与高危修复）**、**P1（核心规范与发布交付）**、**P2（架构演进与事件解耦）** 分层递进。

---

## 方案总览与分级标准

| 级别 | 核心主题 | 定级依据 | 预估影响 |
| :--- | :--- | :--- | :--- |
| 🔴 **P0** | **致命阻塞与安全漏洞** | 导致特定环境下进程挂死/瘫痪，或存在 Shell 注入与私有文件侵入等安全与稳定性红线。 | **必须立即修复**，否则无法在生产环境和 Headless 模式运行。 |
| 🟡 **P1** | **规范契约与打包分发** | 违背官方标准 DSL、缺失配置校验系统、缺失 `prepare` 脚本导致用户无法通过 Git 安装。 | **核心规范对齐**，确保插件具备完整契约、配置能力与分发能力。 |
| 🟢 **P2** | **架构演进与生态联动** | 能力孤岛未暴露为 Cordis Service，缺少事件系统（Events）解耦，构建后处理需工程化。 | **生态协同升级**，使其他插件可复用 GitHub 能力，支持事件驱动。 |

---

## 🔴 P0 阶段：致命阻塞与高危漏洞修复 (Blocking & Security)

### P0-1. 解耦 `inject` 静态硬依赖，解决 Headless/CLI 模式下插件永久卡死

#### 缺陷分析
- **对应教程**：教程第 3 章《服务》与第 6 章《诊断始终无法加载的插件》。
- **根因**：当前 `src/index.ts` 顶层声明了：
  ```ts
  export const inject = ['tools', 'commands', 'webServer', 'workspaceRegistry'] as const;
  ```
  在 Cordis 运行时中，只要 `inject` 列表中的任意一个服务不存在，插件 Fiber 就会**永久保持在 `PENDING` 状态**，`apply` 函数绝不会被触发。
  而在纯命令行（CLI）、Headless 或无桌面端环境启动 DSH 时，环境中**根本不存在 `webServer` 或 `workspaceRegistry` 服务**。这直接导致整个插件在无 Web 环境下彻底静默瘫痪，连底层的 5 个 Agent Tools 和 `/gh` 命令都无法加载！
- **代码冲突**：代码内部写了 `if (ctx.webServer) { ... }` 试图做兼容，但因为外层硬依赖未满足，代码根本没机会执行到 `if` 分支。

#### 修复方案
1. **收敛核心硬依赖**：仅将必需的 `['tools']` 放在顶层静态 `inject` 中；
2. **可选能力使用动态作用域注入**：使用 `ctx.inject(['webServer'], (ctx) => { ... })` 挂载 HTTP 路由，使用 `ctx.inject(['commands'], (ctx) => { ... })` 挂载斜杠命令。

#### 改造方案对比
```ts
// ❌ 改造前 (src/index.ts)
export const inject = ['tools', 'commands', 'webServer', 'workspaceRegistry'] as const;
export function apply(ctx: any) {
  if (ctx.commands) registerGhCommand(ctx.commands, executor);
  if (ctx.tools) { /* 注册 5 个 tools */ }
  if (ctx.webServer) registerApiRoutes(ctx.webServer, executor, ctx.workspaceRegistry);
}

// ✅ 改造后 (src/index.ts)
export const inject = ['tools'] as const; // 仅核心能力强依赖

export function apply(ctx: Context) {
  const executor = new GhExecutor();

  // 1. 核心 Agent 工具必定可用
  registerTools(ctx, executor);

  // 2. 命令服务存在时动态激活，不阻塞主流程
  ctx.inject(['commands'], (ctx) => {
    registerGhCommand(ctx, executor);
  });

  // 3. WebUI 服务存在时动态激活，纯 CLI 模式下自动跳过
  ctx.inject(['webServer'], (ctx) => {
    registerApiRoutes(ctx, executor);
  });
}
```

---

### P0-2. 根除对宿主内部私有文件 `~/.dsh/storages/workspace.json` 的硬编码侵入

#### 缺陷分析
- **对应教程**：架构设计原则与《能力的三层拆分》。
- **根因**：在 `src/api/routes.ts` 的第 38、59、256 行，代码直接通过 `node:fs` 硬编码读取用户主目录下的宿主私有文件：
  ```ts
  const wsJsonPath = path.join(os.homedir(), '.dsh', 'storages', 'workspace.json');
  const wsData = JSON.parse(fs.readFileSync(wsJsonPath, 'utf8'));
  ```
- **破坏性危害**：
  1. **跨环境失效**：当用户自定义了 `$DSH_HOME`，该硬编码绝对路径直接失效；
  2. **存储耦合风险**：`workspace.json` 属于宿主内部不可控实现细节，一旦 DSH 升级将存储迁移至 SQLite/DuckDB 或调整 Schema，插件将瞬间抛错崩溃；
  3. **阻断事件循环**：在 HTTP 请求处理链路中同步调用 `fs.readFileSync`，若文件较大或并发读取将直接卡死 Node.js 主事件循环。

#### 修复方案
1. **全面废除文件直读**：删除所有操作 `workspace.json` 的文件 IO 代码；
2. **会话级上下文透传**：客户端前端在请求时本就已知自身会话和对应的工作区路径，优先从 URL query 参数 `cwd` 获取；
3. **官方服务接口降级**：若确实需要获取所有工作区列表，通过注入的 `ctx.workspaceRegistry` 或 `ctx.workspaces` 官方服务对象的方法读取（如 `ctx.workspaces?.list()`）；若服务不可用则优雅降级为单项目模式，绝不私自侵入磁盘私有目录。

---

### P0-3. 消除命令注入高危漏洞（`child_process.exec` 安全修复）

#### 缺陷分析
- **对应教程**：安全设计规范与《PowerShell 执行铁律》。
- **根因**：在 `src/api/routes.ts` 的第 180-183 行：
  ```ts
  const { exec } = await import('node:child_process');
  const openCmd = process.platform === 'win32' 
    ? `start "" "${payload.url}"` 
    : (process.platform === 'darwin' ? `open "${payload.url}"` : `xdg-open "${payload.url}"`);
  exec(openCmd);
  ```
  直接将前端传入的 `payload.url` 拼接到系统 Shell 命令行中调用 `exec` 执行！若 `payload.url` 包含双引号、`&`、`|` 等特殊控制符，将引发严重的系统级远程命令执行（RCE）漏洞。
- **架构越界**：在浏览器或客户端中点击链接，本应由 Client 端调用 `window.open(url, '_blank')` 或通过 Electron 原生安全通道打开，宿主后端开一个 HTTP 接口去执行 Shell 是典型的不良架构。

#### 修复方案
1. **前端自闭环**：在 `client.ts` 中直接使用标准的浏览器链接跳转或 Electron 安全协议，彻底移除对后端的 `open_browser` 动作依赖；
2. **后端安全加固与废弃**：从 `routes.ts` 的 action 路由中彻底废弃 `open_browser` 处理分支；若必须保留兜底接口，必须使用 `new URL(payload.url)` 强制校验协议（仅白名单允许 `http:` 和 `https:`），且必须改用无 Shell 环境的 `execFile`。

---

### P0-4. 路由与命令资源泄漏修复（绑定 Cordis Effect / Disposer）

#### 缺陷分析
- **对应教程**：教程第 2 章《生命周期与副作用 (Effect)》。
- **根因**：当前 `registerApiRoutes` 连续调用 4 次 `webServerService.register(...)`，但没有接收其返回的注销函数（Disposer），也没有接入 Cordis 的生命周期管理。当插件因热重载（HMR）或配置更新重新挂载时，原有的 HTTP 路由依然残留在 Web 容器中，导致路由重复注册报错或执行到旧闭包代码。

#### 修复方案
在 `registerApiRoutes` 中使用 `ctx.effect()` 包裹注册过程，并在卸载回调中依次执行 disposer：
```ts
export function registerApiRoutes(ctx: Context, executor: GhExecutor) {
  const webServer = ctx.get('webServer');
  if (!webServer) return;

  ctx.effect(() => {
    const disposers: Array<() => void> = [];

    disposers.push(webServer.register({
      kind: 'exact',
      path: '/api/github/overview',
      handler: async (req, res) => { /* ... */ }
    }));

    // 返回清理函数：在插件卸载或热重载时自动注销所有路由
    return () => {
      disposers.forEach((dispose) => {
        if (typeof dispose === 'function') dispose();
      });
    };
  }, 'github-flow: api routes');
}
```

---

## 🟡 P1 阶段：核心规范对齐与发布交付 (Standardization & Distribution)

### P1-1. 落地 `Config` Schema 与 Schemastery 配置校验体系

#### 缺陷分析
- **对应教程**：教程第 5 章《配置》与《插件配置》。
- **根因**：
  1. 当前没有任何 `Config` 接口与 Schema 声明；
  2. 插件内部充斥着大量不可修改的硬编码参数（`MAX_SAFE_OUTPUT_CHARS = 24_000`、`defaultTimeoutMs = 30_000`、`CACHE_TTL_MS = 15_000`、`--limit 20` 等）；
  3. 用户如果处于内网、或者安装了非标准路径的 GitHub CLI（如 `C:\Tools\gh.exe`），完全无法通过 `cordis.yml` 进行配置。

#### 修复方案
1. 引入 `@deepseek-ai/schemastery` 作为运行时校验器；
2. 导出类型 `Config` 与运行时 `Config` Schema，并在 `apply(ctx: Context, config: Config)` 中接收；
3. 将参数注入到 `GhExecutor` 与路由缓存中。

#### 实施定义
```ts
// src/index.ts
import Schema from '@deepseek-ai/schemastery';

export interface Config {
  ghPath?: string;            // gh 可执行文件路径，默认 'gh'
  defaultTimeoutMs?: number;  // 默认命令超时，默认 30_000 ms
  maxOutputChars?: number;    // 单次输出最大安全字符数，默认 24_000
  cacheTtlMs?: number;        // Web API 缓存时长，默认 15_000 ms
  defaultListLimit?: number;  // 列表默认获取数量，默认 20
}

export const Config: Schema<Config> = Schema.object({
  ghPath: Schema.string().default('gh').description('GitHub CLI (gh) 二进制程序路径'),
  defaultTimeoutMs: Schema.number().default(30000).description('CLI 命令执行超时毫秒数'),
  maxOutputChars: Schema.number().default(24000).description('防止上下文溢出的单次截断安全阈值'),
  cacheTtlMs: Schema.number().default(15000).description('仪表盘数据缓存有效时间 (ms)'),
  defaultListLimit: Schema.number().default(20).description('默认查询列表返回条数'),
});

export function apply(ctx: Context, config: Config) {
  const executor = new GhExecutor({
    ghPath: config.ghPath,
    timeoutMs: config.defaultTimeoutMs,
    maxChars: config.maxOutputChars,
  });
  // ...
}
```

---

### P1-2. 工具注册重构为官方 `defineTool` DSL

#### 缺陷分析
- **对应教程**：教程第 7 章《进入 Harness》与《开发一个 Tool》。
- **根因**：当前的 `createPrTool`、`createIssueTool` 等 5 个工具均直接返回普通 JavaScript 对象。
- **弊端**：
  1. 绕过了 DSH 核心基于 `defineTool` 的严格 Schema 验证；
  2. 缺失编译期对 `args` 和 `output` 的类型安全推导；
  3. 原生 Native Renderer（`output.render`）无法规范注册。

#### 修复方案
引入 `@deepseek-ai/dsh-tools`，用 `defineTool` 规范包装每一个工具：
```ts
// src/tools/pr.ts
import { defineTool } from '@deepseek-ai/dsh-tools';
import type { GhExecutor } from '../executor.js';

export function createPrTool(executor: GhExecutor) {
  return defineTool({
    name: 'github_pr',
    description: '管理与审查 GitHub Pull Request (PR)。支持查看列表、详情、差异比对、CI 检查状态、代码审查与合并操作。',
    parameters: {
      action: {
        type: 'string',
        enum: ['list', 'view', 'create', 'diff', 'checks', 'review', 'merge'],
        required: true,
        description: 'PR 操作类型',
      },
      pr_number: { type: 'number', description: 'PR 编号' },
      repo: { type: 'string', description: '目标仓库 [owner/repo]' },
      title: { type: 'string', description: '标题' },
      body: { type: 'string', description: '描述' },
      base: { type: 'string', description: '基准分支' },
      draft: { type: 'boolean', description: '是否为草稿' },
      review_decision: { type: 'string', enum: ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'], description: '评审判定' },
      merge_method: { type: 'string', enum: ['merge', 'squash', 'rebase'], description: '合并策略' },
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => [
        { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }
      ],
    },
    async execute(args, execContext) {
      // 业务逻辑实现...
    },
  });
}
```

---

### P1-3. 补齐 npm 与 Git 安装规范（`peerDependencies` 与 `prepare` 脚本）

#### 缺陷分析
- **对应教程**：官方文档《打包与安装插件》。
- **根因**：
  1. **缺少 `prepare` 脚本**：官方指出，从 GitHub 直接安装（`dsh plugin add github:user/repo`）拉取的是 Git 源码而非编译后的 `lib/`。由于当前 `package.json` 没有定义 `"prepare": "pnpm run build"`，导致远程安装时没有触发构建，安装后必然直接因找不到入口而报错！
  2. **缺少 `peerDependencies`**：按官方规范，插件与宿主共享实例的 DSH 核心包（`@deepseek-ai/cordis`, `@deepseek-ai/dsh-tools`, `@deepseek-ai/schemastery`）必须同时声明在 `peerDependencies` 与 `devDependencies` 中。

#### 修复方案
更新 `package.json`：
```json
{
  "name": "dsh-github-flow",
  "version": "0.1.0",
  "type": "module",
  "main": "./lib/index.js",
  "scripts": {
    "build": "tsc && node scripts/build.mjs",
    "prepare": "pnpm run build"
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "*",
    "@deepseek-ai/dsh-tools": "*",
    "@deepseek-ai/schemastery": "*"
  },
  "devDependencies": {
    "@deepseek-ai/cordis": "*",
    "@deepseek-ai/dsh-tools": "*",
    "@deepseek-ai/schemastery": "*",
    "@types/node": "^26.6.3",
    "typescript": "^7.0.2"
  }
}
```

---

## 🟢 P2 阶段：架构演进与事件解耦 (Architecture Evolution)

### P2-1. 将 `GhExecutor` 抽象提升为 Cordis 原生 Service

#### 演进目标
- **对应教程**：教程第 3 章《服务》与实战篇《能力的三种角色设计》。
- **意义**：当前 `GhExecutor` 仅作为插件内部的私有对象，其他 DSH 插件（如自动化发版插件、CI 监控插件）完全无法共享使用。将其抽象为 Cordis Service 后，整个宿主生态均可通过 `ctx.github` 直接使用安全的 GitHub CLI 封装。

#### 架构设计
1. **TypeScript 声明合并**：
   ```ts
   // src/service.ts
   import { Service, type Context } from '@deepseek-ai/cordis';

   declare module '@deepseek-ai/cordis' {
     interface Context {
       github: GitHubService;
     }
   }

   export class GitHubService extends Service {
     constructor(ctx: Context, public executor: GhExecutor) {
       super(ctx, 'github');
     }

     run<T>(args: string[], options?: GhExecutionOptions) {
       return this.executor.run<T>(args, options);
     }

     checkAuth(cwd?: string) {
       return this.executor.checkAuth(cwd);
     }

     getRepoMetadata(cwd?: string) {
       return this.executor.getRepoMetadata(cwd);
     }
   }
   ```
2. **在 `apply` 中挂载服务**：
   ```ts
   ctx.plugin(new GitHubService(ctx, executor));
   ```

---

### P2-2. 引入领域事件系统（Cordis Events），打通解耦联动

#### 演进目标
- **对应教程**：教程第 4 章《事件》。
- **意义**：实现“操作执行”与“观察响应”的松耦合。在 PR 创建、评审提交、Issue 处理等关键节点广播事件，支持外部审计、通知流水线与自动归档。

#### 契约设计
```ts
// src/events.ts
import type { PrItem, IssueItem } from './types.js';

declare module '@deepseek-ai/cordis' {
  interface Events {
    'github/pr:create'(repo: string, pr: { title: string; url: string }): void;
    'github/pr:merge'(repo: string, prNumber: number): void;
    'github/issue:create'(repo: string, issue: { title: string; url: string }): void;
    'github/auth:change'(loggedIn: boolean, user?: string): void;
  }
}
```
在工具和 API 触发相应动作后，使用 `ctx.emit('github/pr:create', repo, result)` 广播事件。

---

### P2-3. Client 端构建流水线工程化（消除正则后处理 Hack）

#### 演进目标
- **现状**：目前 `src/client.ts` 编译后会生成末尾的 `export {};`，通过 `scripts/build.mjs` 中的字符串正则替换进行剔除。
- **优化方案**：配置专用的 `tsdown` 或 `esbuild` 双入口配置，在构建时分别输出：
  - 宿主侧：标准 ESM 格式的 `lib/index.js`；
  - 客户端侧：直接输出适配 `window.__ModuleLoader__.load` 的无导出纯模块。

---

## 实施阶段与排期路线表

```text
阶段一：P0 紧急收敛（预计 0.5 天）
 ├── 1. 解构 index.ts 的顶层 inject，转为 tools 硬依赖 + webServer/commands 动态依赖
 ├── 2. 移除 routes.ts 对 ~/.dsh/storages/workspace.json 的直接文件读写
 ├── 3. 彻底移除 routes.ts 的 child_process.exec 调用，转为前端原生导航
 └── 4. 路由注册与命令注册全面接入 ctx.effect() Disposer 闭环

阶段二：P1 规范对齐（预计 0.5 天）
 ├── 1. package.json 补全 peerDependencies 与 prepare 构建钩子
 ├── 2. 引入 @deepseek-ai/schemastery 并导出规范的 Config 接口与校验 Schema
 ├── 3. 将 5 个 Agent Tools 全面重构为 @deepseek-ai/dsh-tools 的 defineTool DSL
 └── 4. 消除 executor.ts 和 routes.ts 中所有写死的超时与缓冲区常量

阶段三：P2 架构演进（预计 0.5 天）
 ├── 1. 将执行引擎封装为 Cordis 原生 Service 并提供 Context 声明合并
 ├── 2. 建立 github/* 领域事件发布体系
 └── 3. 规范化构建脚本与编译流水线
```

---

## 验收卡点与测试清单

1. **Headless / CLI 运行验收**：
   - 执行 `dsh --profile desktop --dump-config`，确认 `github-flow` 插件状态为 `ACTIVE`（非 `PENDING`）；
   - 在无 Web 环境下调用 `github_pr` 工具，验证命令是否正常回传。
2. **配置动态更新（HMR）验收**：
   - 在 `cordis.patch.yml` 中修改 `config.defaultTimeoutMs` 为 `45000`；
   - 验证日志显示插件正常重新挂载，且旧路由没有产生重复绑定报错。
3. **Git 远程安装验收**：
   - 验证通过 `dsh plugin add github:user/dsh-github-flow` 时，`prepare` 脚本能自动完成编译，零报错启动。
