import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { GhExecutor } from './executor.js';
import { createPrTool } from './tools/pr.js';
import { createIssueTool } from './tools/issue.js';
import { createRunTool } from './tools/run.js';
import { createRepoTool } from './tools/repo.js';
import { createApiTool } from './tools/api.js';
import { createReleaseTool } from './tools/release.js';
import { createSecretTool } from './tools/secret.js';
import { createSkillTool } from './tools/skill.js';
import { createLabelTool } from './tools/label.js';
import { createRulesetTool } from './tools/ruleset.js';
import { createCacheTool } from './tools/cache.js';
import { createGistTool } from './tools/gist.js';
import { createStatusTool } from './tools/status.js';
import { createAgentTaskTool } from './tools/agent-task.js';
import { createDiscussionTool } from './tools/discussion.js';
import { createProjectTool } from './tools/project.js';
import { createCodespaceTool } from './tools/codespace.js';
import { createHelpTool } from './tools/help.js';
import { createTaskTool } from './tools/task.js';
import { defaultTelemetryCollector } from './telemetry.js';
import { AuditStore, resolveScopeFromExec } from './audit.js';
import { createApprovalGate } from './approval-gate.js';
import { forgetApproved } from './destructive.js';
import { createTargetInfoResolver, stashTargetTitle } from './target-title.js';
import { registerGhCommand } from './commands/gh.js';
import { registerApiRoutes } from './api/routes.js';
import { UpdateChecker } from './updater.js';
import { UpgradeManager } from './upgrade-manager.js';
import { ProxyManager } from './proxy.js';
import { NPM_PACKAGE_URL } from './version.js';
import { loadUpdateSettings } from './update-settings.js';
import { applyTier } from './tool-tiers.js';
// 引用即生效：加载本模块以挂上 declare module '@deepseek-ai/cordis' 的 ctx.github 类型声明，
// 并随下面 `export * from './github-service.js'` 一起传给消费方。
import './github-service.js';
import type { PluginConfig } from './types.js';

export const name = 'dsh-github-flow';

/**
 * 服务依赖声明：只声明唯一的硬依赖 `tools`。
 *
 * 为什么其余三个服务降级为可选（`ctx.inject` 等待）：
 * - `webServer` 由 `@deepseek-ai/dsh-web-app` 组合提供。`dsh-tui` 与纯 CLI profile 只装
 *   `dsh-base`，没有这个服务——写成硬依赖会让插件在这些 profile 里**永久 PENDING**，
 *   用户一个工具都拿不到（README 明确支持 CLI 安装）。
 * - `commands` 由 `dsh-commands` 提供，同样不保证所有组合都有。
 *
 * cordis 的语义是：`inject` 里的服务缺席 ⇒ 插件不激活。因此"声明了就必须真存在"，
 * 声明硬依赖却按可选写 `if (ctx.X)` 是最坏组合：既让可选服务变成了硬门槛，
 * 又让降级分支永远走不到。
 */
export const inject = ['tools'] as const;

/**
 * 本插件向宿主提供的服务名。
 * cordis loader 读取该元数据（registry.d.ts），与 `ctx.provide('github', …)` 必须同名。
 */
export const provide = 'github';

/**
 * 插件配置 Schema（Schemastery）。
 *
 * 与旧的手写 `'~standard'.validate()` 相比，这里拿到的是**真校验**：类型不符直接抛
 * `ValidationError`（旧实现对脏配置静默回落到默认值，配错了永远不报错）。
 * 未知键仍原样透传，与旧行为一致。
 *
 * `.volatile()` 的三个字段是「运行期可热改、不触发插件 reload」的稳定引用：
 * 读取点必须走 `.get()`，否则拿到的是引用对象本身（详见 `resolvePluginConfig`）。
 *
 * 为什么 `checkUpdate` 刻意**不** volatile：`UpdateChecker.enabled` 是构造期只读字段，
 * 它同时决定轮询定时器与启动横幅是否建立。标成 volatile 只会得到「配置改了、行为没变」
 * 的假热更新；让它保持普通字段，改动时插件整体重载，语义才是对的。
 */
const ConfigSchema = Schema.object({
  ghPath: Schema.string().default('gh'),
  defaultTimeoutMs: Schema.number().default(30_000).volatile(),
  maxOutputChars: Schema.number().default(24_000).volatile(),
  // 不设默认值：缺省时由 maxOutputChars × 4 推导（executor 构造期），
  // 显式给默认值会让「随 maxOutputChars 联动」这条语义失效。
  maxOutputBytes: Schema.number(),
  cacheTtlMs: Schema.number().default(15_000),
  defaultListLimit: Schema.number().default(20).volatile(),
  checkUpdate: Schema.boolean().default(true),
  updateCheckIntervalMs: Schema.number().default(86_400_000),
  registryUrl: Schema.string(),
  agentEnvInjection: Schema.boolean().default(true),
  proxyUrl: Schema.string(),
  // 档位：缺省键直接缺席 → 下游按 full / 非只读处理，默认零破坏。
  // 不设 default，是为了让「用户没配」与「用户显式配了 full」在诊断时仍可区分。
  toolsets: Schema.array(Schema.string()),
  read_only: Schema.boolean(),
  // 操作记录：默认全开（被动、无打扰），可在设置里关掉；预算只暴露字节一个旋钮
  auditEnabled: Schema.boolean().default(true),
  auditBudgetMB: Schema.number().default(8),
});

/** 校验并补齐默认值后的运行期配置（volatile 字段为稳定引用，非普通值）。 */
export type Config = ReturnType<typeof ConfigSchema>;

/** Cordis loader 消费的配置 Schema。 */
export const Config = ConfigSchema;

/**
 * 把 Schema 输出摊平为执行引擎消费的普通配置对象。
 *
 * 为什么必须显式摊平而不是 `{...config}`：volatile 字段是 `{ get(), [write]() }` 引用对象，
 * 展开后仍是引用。`GhExecutor` 把它当数字用（`length > maxOutputChars`）不会报错，
 * 只会让截断阈值变成 NaN 比较——静默失效，属于最难排查的一类回归。
 * 逐字段列举而非遍历：新增配置项时这里会漏，但漏了 `tsc` 立刻报错，不会静默。
 */
function resolvePluginConfig(config: Config): PluginConfig {
  return {
    ghPath: config.ghPath,
    defaultTimeoutMs: config.defaultTimeoutMs.get(),
    maxOutputChars: config.maxOutputChars.get(),
    maxOutputBytes: config.maxOutputBytes,
    cacheTtlMs: config.cacheTtlMs,
    defaultListLimit: config.defaultListLimit.get(),
    checkUpdate: config.checkUpdate,
    updateCheckIntervalMs: config.updateCheckIntervalMs,
    // 可选字符串字段在 Schema 里没有 default，缺省时键直接缺席，显式 null 也会被放行；
    // 统一归一成 undefined，下游 `if (x)` 语义才不会被 null 误伤。
    registryUrl: config.registryUrl ?? undefined,
    agentEnvInjection: config.agentEnvInjection,
    proxyUrl: config.proxyUrl ?? undefined,
    toolsets: config.toolsets,
    read_only: config.read_only,
    auditEnabled: config.auditEnabled,
    auditBudgetMB: config.auditBudgetMB,
  };
}

/** 本插件真正消费的 `tools` 服务面。 */
interface ToolRegistryLike {
  register(definition: unknown): () => void;
}

/**
 * 监听宿主事件。
 *
 * 为什么要这层收窄：`ctx.on` 的类型参数是 `keyof Events`，而本插件依赖的两个事件
 * 声明都在本仓之外——`tools/result` 来自 `@deepseek-ai/dsh-tools`，
 * `loader/volatile-update` 来自 `@deepseek-ai/cordis-plugin-loader`。
 * 本仓不能直接依赖前者：它的 peer 闭包引用了未发布的 `@deepseek-ai/dsh-type-meta`
 * （npm 404），`pnpm install` 直接失败。
 *
 * 为什么不用 `declare module '@deepseek-ai/cordis'` 自行合并 `Events`：消费方若同时加载
 * dsh-tools，两份方法签名会合成重载，而本仓这份 `any` 签名会把对方的精确类型盖掉。
 * 只在本文件内收窄，不污染全局契约。
 */
function onHostEvent(ctx: Context, name: string, listener: (...args: any[]) => any): void {
  (ctx.on as unknown as (n: string, l: (...a: any[]) => any) => () => boolean)(name, listener);
}

export function apply(ctx: Context, config: Config = Config({})) {
  const plain = resolvePluginConfig(config);
  const executor = new GhExecutor(plain);
  // 代理管理器：优先读取用户在驾驶舱保存的 proxy.json，回落 cordis.patch.yml 的
  // proxyUrl 预置值；两者皆无时保持直连（gh 自然继承宿主系统环境变量）。
  // 装配后 executor/upgradeManager/updater 三条外联链路全部经它路由。
  const proxyManager = new ProxyManager(plain.proxyUrl);
  // 生命周期纳管：ProxyManager 内部持有系统代理轮询定时器与 undici ProxyAgent 连接池。
  // 不挂 ctx.effect 的话，插件热重载/禁用后旧实例的定时器会继续跑——
  // N 次重载 = N 个定时器，每个每 30s spawn 两次 reg.exe，且代理连接池永不释放。
  if (typeof (ctx as any).effect === 'function') {
    (ctx as any).effect(() => () => {
      try { proxyManager.dispose(); } catch { /* 释放失败不阻断卸载 */ }
    }, 'github-flow: proxy manager lifecycle');
  }
  executor.attachProxyManager(proxyManager);
  /*
   * 操作记录存储。
   *
   * 创建顺序必须早于 `tools/result` 切面（写入方）与 webServer 路由（读取方）：
   * 两个消费方共用同一个实例，否则内存队列与查询视图是两份。
   *
   * AuditStore 构造期自带 try/catch 降级（目录不可写、JSONL 损坏时变 no-op），
   * 因此这一行不会把 apply() 打崩——Cordis 里 apply 抛错 = Fiber FAILED = 19 个工具全丢。
   */
  const auditStore = new AuditStore({
    // 静态配置只是"文件不存在时的种子"：用户在 UI 里改过之后以 audit-settings.json 为准
    enabled: plain.auditEnabled,
    maxBytes: Math.round((plain.auditBudgetMB ?? 8) * 1024 * 1024),
    scopeResolver: (exec, args) => resolveScopeFromExec(executor, exec, args),
  });
  // 生命周期纳管：内部有攒批刷盘定时器，不挂 effect 的话热重载会留下跑着的定时器
  // （与 proxyManager 的 30s 轮询同一类问题）。
  if (typeof (ctx as any).effect === 'function') {
    (ctx as any).effect(() => () => {
      void auditStore.dispose();
    }, 'github-flow: audit store lifecycle');
  }
  const updateChecker = new UpdateChecker({
    intervalMs: plain.updateCheckIntervalMs,
    customRegistry: plain.registryUrl,
    // checkUpdate: false 熔断全部探测入口（路由/命令/启动横幅共用此实例）
    enabled: plain.checkUpdate,
  });
  // 更新源设置（UI 持久化 store 优先于 Cordis 静态配置）：
  // 启动时读取并应用到 checker；UI 保存时经路由直接调 applySettings 热切换。
  const updateMode = loadUpdateSettings();
  updateChecker.applySettings(updateMode);
  updateChecker.applyProxy(proxyManager);
  const upgradeManager = new UpgradeManager();
  upgradeManager.attachProxyManager(proxyManager);
  // 注入查询函数而非静态值：用户切源后，下一次一键升级的 registry 实时跟随
  upgradeManager.attachUpdateModeQuery(() => updateChecker.getSourceMode());

  // 1. 兑现生态服务契约：将 GitHub 执行引擎作为服务暴露给其他 DSH 插件 (ctx.github)
  // 服务注册由当前 fiber 拥有：返回的 disposer 或 fiber 卸载时自动注销（cordis reflect.d.ts:29-43），
  // 因此不需要 `ctx.github = executor` 这类裸赋值兜底——它绕过 inject 语义且永不清理。
  ctx.provide('github', executor);

  // 2. 注册 Cordis tools/result 事件切面（无侵入全量工具审计与降级率打点）
  onHostEvent(ctx, 'tools/result', (exec: any, result: any) => {
    try {
      const toolName = exec?.name || exec?.tool?.name || '';
      if (typeof toolName === 'string' && toolName.startsWith('github_')) {
        const args = exec?.arguments || exec?.args || {};
        defaultTelemetryCollector.recordCall(toolName, args, result);
        /*
         * 操作记录与遥测共用**同一个监听器**：宿主对同一事件的多个监听器顺序无保证，
         * 各解包一次会出现「遥测说失败、记录说成功」这类无法自我解释的不一致。
         *
         * recordCall 内部自带全部兜底（Fail-Open + 双载荷形状兼容），因此这里
         * 不需要再套一层 try——它不会抛。
         */
        auditStore.recordCall(toolName, args, result, exec);
        /*
         * 回收审核批准标记。
         *
         * 正常路径上 `guardDestructive` 已经用 `delete` 消费掉它；这里兜的是
         * "批准了但工具体从未执行"（被下游 pre-execute 监听器 deny / cancel、工具名解析失败）。
         * 放在 `tools/result` 是因为它对该调用**一定**会触发（含 deny 与 cancel 的终态）。
         */
        forgetApproved(exec?.callId);
      }
    } catch {
      // Fail-Open 非阻塞防线：严禁打点逻辑异常影响主工具调用
    }
  });

  // 2b. 注册执行前人工审核闸门（s2）：宿主 `tools/pre-execute` 瀑布 + 官方 `ctx.approval`。
  // 为什么不用 `inject: ['approval']`：本插件支持纯 CLI / TUI profile，那里没有审核 UI，
  // 也就没人提供这个服务。写进 inject 会让插件在这些 profile 里永久 PENDING——一个工具都
  // 拿不到（与第 3/5 步同一个理由）。改用 `ctx.get('approval')` 机会式探测（宿主 pipeline
  // 自己也是这么做的），拿不到就退回工具体既有的 `confirm` 闸门，不阻塞、不判失败。
  /*
   * 目标信息解析器：只认 `pr_number` / `issue_number`，用**一条 GraphQL 查询**把
   * "拍板所需"的字段一次拿全（标题 / 状态 / 作者 / 增删行数 / 改动文件数 / CI / 评审 / 评论数 / 正文），
   * 同一目标 15s 内不重复打。
   *
   * 为什么走 `gh api graphql` 而不是 `gh pr view --json`：后者要拿评论数得把整个 comments
   * 数组（含正文）拉回来，大 PR 一下就是几十 KB；GraphQL 只取 `totalCount`，输出恒定很小。
   * 字段集 2026-11-26 真机核对过（Issue #17 / PR #20 均正常返回）。
   * 为什么不直接用 `executor.getPrDetail`：那个会三路并发拉 diff + 评论 + 检查，
   * 还带 2MB 输出预算 —— 为了弹窗里几行信息用它，等于把审核延迟放大一个数量级。
   *
   * 超时 4s：这些信息是"锦上添花"，网络慢时宁可弹窗少几行，也不能让用户干等。
   * 输出预算放到 70K 字符：GitHub 正文上限 65536 字符，默认的 24K 会把长正文的 JSON 截成非法的。
   */
  const resolveTarget = createTargetInfoResolver({
    fetchTarget: async (kind, num, scope) => {
      const execScope = executor.resolveExecScope({ cwd: scope.cwd });
      const repo = executor.resolveRepoFullName(scope.repo, execScope.cwd);
      if (!repo) return undefined;
      // repo 已经过白名单校验（仅 [A-Za-z0-9_.-]），可安全内插进查询串
      const [owner, name] = repo.split('/');
      const common = 'title body state author { login } comments { totalCount }';
      const query = kind === 'pr'
        ? `query { repository(owner:"${owner}", name:"${name}") { pullRequest(number:${num}) { ${common} isDraft additions deletions changedFiles reviewDecision commits(last:1) { nodes { commit { statusCheckRollup { state } } } } } } }`
        : `query { repository(owner:"${owner}", name:"${name}") { issue(number:${num}) { ${common} stateReason } } }`;
      const r = await executor.run<any>(['api', 'graphql', '-f', 'query=' + query], {
        cwd: execScope.cwd,
        timeoutMs: 4_000,
        maxOutputChars: 70_000,
      });
      const node = r.ok ? r.data?.data?.repository?.[kind === 'pr' ? 'pullRequest' : 'issue'] : undefined;
      if (!node || typeof node.title !== 'string') return undefined;
      const login: string | undefined = typeof node.author?.login === 'string' ? node.author.login : undefined;
      const count = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
      if (kind === 'pr') {
        return {
          title: node.title,
          body: typeof node.body === 'string' ? node.body : undefined,
          state: node.state,
          isDraft: node.isDraft === true,
          author: login,
          additions: count(node.additions),
          deletions: count(node.deletions),
          changedFiles: count(node.changedFiles),
          commentsCount: count(node.comments?.totalCount),
          reviewDecision: typeof node.reviewDecision === 'string' ? node.reviewDecision : undefined,
          // null 是有意义的："这次提交没有配置检查"，不能和"没取到"混为一谈
          checkState: node.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state ?? null,
        };
      }
      return {
        title: node.title,
        body: typeof node.body === 'string' ? node.body : undefined,
        state: node.state,
        stateReason: typeof node.stateReason === 'string' ? node.stateReason : undefined,
        author: login,
        commentsCount: count(node.comments?.totalCount),
      };
    },
  });
  const approvalGate = createApprovalGate({
    /*
     * 每次调用现读档位（含 s3 的规则覆盖）：设置页改完立刻生效，无需重启。
     *
     * 为什么规则在**这里**算而不是在闸门里：闸门是纯判定函数（`shouldAsk`），
     * 它只回答"这个档位下要不要问"；档位从哪来（全局三档 / 按仓库 / 按 action）
     * 是设置层的职责。混在一起会让"规则写错了"和"判定写错了"变成同一个 bug。
     *
     * repo 的取值与记录同源（`resolveScopeFromExec`）：用户在规则里写的仓库名
     * 必须与他在记录列表里看到的那个名字是同一个，否则规则会"看起来不生效"。
     */
    getMode: (exec: any) => {
      /*
       * 没有生效规则时直接返回全局档位，**不做仓库解析**。
       *
       * 为什么这条短路必须写在最前面：`resolveScopeFromExec` 要读 `.git/config`
       * 并可能反查会话工作区，都在 `tools/pre-execute` 这条热路径上。默认配置下
       * 规则是空的（绝大多数用户），为一次"必然不分流"的判定去读盘是纯浪费。
       */
      if (!auditStore.hasApprovalRules()) return auditStore.approvalMode();
      try {
        const scope = resolveScopeFromExec(executor, exec, exec?.arguments);
        return auditStore.resolveModeFor({
          tool: String(exec?.name || ''),
          action: typeof exec?.arguments?.action === 'string' ? exec.arguments.action : '',
          repo: scope.repo,
        });
      } catch {
        // 解析失败就退回全局档位：策略出问题最多是"多问一次"，绝不能变成"不问"
        return auditStore.approvalMode();
      }
    },
    getApproval: () => (ctx as any).get?.('approval'),
    recordDecision: (callId, decision, askedAt) => auditStore.recordDecision(callId, decision, undefined, askedAt),
    resolveTarget,
    stashTitle: stashTargetTitle,
    warn: (message) => console.warn(`[dsh-github-flow] ${message}`),
  });
  onHostEvent(ctx, 'tools/pre-execute', (exec: any, next: any) => approvalGate(exec, next));

  // 3. 注册人类 Slash 命令 (/gh status, /gh upgrade, /gh help)
  // 用 ctx.inject 声明式等待，而不是一次性 ctx.get 探测：服务若晚于本插件就绪，
  // 一次性探测拿到的是 undefined，且**永远没有第二次机会**，/gh 就此消失。
  // ctx.inject 的嵌套 fiber 在服务出现时补触发；服务始终不出现则它自己保持 PENDING，
  // 外层插件照常 ACTIVE（18 个工具不受影响）。这就是「可选依赖」在 cordis 里的正确写法。
  ctx.inject(['commands'], (c) => {
    registerGhCommand(c.get('commands'), executor, updateChecker, defaultTelemetryCollector);
  });

  // 4. 注册 Agent 模型工具集（核心领域工具 + 元指南）
  // `tools` 在 inject 内，运行期必然存在；其权威类型声明在 @deepseek-ai/dsh-tools，
  // 本仓不重复 declare module（会与消费方的同一份声明冲突），故在此局部收窄。
  const tools = (ctx as Context & { tools: ToolRegistryLike }).tools;
  // 先建全量数组再统一过档位与闸门：过滤点唯一，且 applyTier / wrapWithGate 都是纯函数，
  // 可以完全离线单测（见 test/phase37-toolset / phase38-gate）。
  const allTools = [
    createPrTool(executor),
    createIssueTool(executor),
    createRunTool(executor),
    createRepoTool(executor),
    createApiTool(executor),
    createReleaseTool(executor),
    createSecretTool(executor),
    createSkillTool(executor),
    createLabelTool(executor),
    createRulesetTool(executor),
    createCacheTool(executor),
    createGistTool(executor),
    // 操作记录存储一并传入：health 看板的「审核」行从它聚合（与记录同源，不另存一份统计）
    createStatusTool(executor, defaultTelemetryCollector, auditStore),
    createAgentTaskTool(executor),
    createDiscussionTool(executor),
    createProjectTool(executor),
    createCodespaceTool(executor),
    createHelpTool(executor),
    // 任务级原语（s8）：与 18 个领域工具并存，档位里用 core 预设二选一
    createTaskTool(executor),
  ];
  const tier = applyTier(allTools as any, { toolsets: plain.toolsets, read_only: plain.read_only });
  if (tier.dropped.length > 0) {
    // 不静默：档位/只读模式剪掉的工具要能从日志里看到，否则"模型看不见某工具"无法排查
    console.log(`[dsh-github-flow] 按档位配置未注册 ${tier.dropped.length} 个工具：${tier.dropped.join(', ')}`);
  }
  // 闸门已在各工具工厂内部经 wrapWithGate 生效，这里只做档位过滤后的注册。
  for (const tool of tier.kept) tools.register(tool as any);

  // 5. 注册面向 Client 端的 WebServer HTTP 路由
  // 同样用 ctx.inject 等待 webServer（理由同第 3 步）。
  // 关键：绝不能在外层 `ctx.get('webServer')` 之后又让 routes 内部去读 `ctx.webServer`——
  // 未 inject 时那个属性读会抛 `cannot get property "webServer" without inject`，
  // 让 CLI/TUI profile 从「PENDING」变成「加载失败」。
  // 这里把 webServer 显式作为末位参数传下去，routes 内部不再做属性读回退。
  ctx.inject(['webServer'], (c) => {
    registerApiRoutes(
      c,
      executor,
      plain.cacheTtlMs || 15_000,
      updateChecker,
      upgradeManager,
      proxyManager,
      c.get('webServer'),
      // 操作记录存储：与上方 tools/result 切面是**同一个实例**
      auditStore
    );
  });

  // 6. volatile 字段热更新：loader 把新值提交进运行中的 fiber（不 reload），
  // 这里把它推给执行引擎。事件由 @deepseek-ai/cordis-plugin-loader 派发，
  // 只在「该字段确实声明了 .volatile()」时触发。
  // 只推 GhExecutor.updateConfig 真正认的字段：认了不改的字段等于假热更新。
  onHostEvent(ctx, 'loader/volatile-update', () => {
    executor.updateConfig({
      defaultTimeoutMs: config.defaultTimeoutMs.get(),
      maxOutputChars: config.maxOutputChars.get(),
      defaultListLimit: config.defaultListLimit.get(),
      // maxOutputBytes 不是 volatile（它不该被单独热改），但**必须一起推**：
      // updateConfig 收到 maxOutputChars 就会把 maxOutputBytes 重算成 ×4
      // （executor.ts:218-222）。不带上用户显式配置的硬上限，一次热更新就会把它冲掉
      // ——实测 {maxOutputChars:1000, maxOutputBytes:500} 会变成 4000。
      maxOutputBytes: config.maxOutputBytes,
    });
  });

  // 7. 启动后低优先级后台闲时静默探测：若有新版本，仅输出一次友好的控制台提示
  if (plain.checkUpdate) {
    // 包裹在 ctx.effect 中（Cordis 规范）：热重载/卸载发生在 3 秒延迟窗口内时，
    // 取消挂起的定时器，避免旧实例在新实例加载后仍向控制台打印升级横幅。
    ctx.effect(() => {
      const timer = setTimeout(() => {
        updateChecker.check(false).then((info) => {
          if (info.hasUpdate) {
            console.log(`
┌────────────────────────────────────────────────────────────────────────┐
│  🚀 dsh-github-flow 插件有新版本可用: ${info.currentVersion} -> ${info.latestVersion}              │
│  升级命令: ${info.upgradeCommand.padEnd(58, ' ')}│
│  更新主页: ${NPM_PACKAGE_URL.padEnd(58, ' ')}│
└────────────────────────────────────────────────────────────────────────┘
`);
          }
        }).catch(() => {});
      }, 3_000);
      return () => clearTimeout(timer);
    });
  }
}

export type GitHubService = GhExecutor;

export * from './types.js';
export * from './version.js';
export * from './updater.js';
export * from './upgrade-manager.js';
export * from './executor.js';
export * from './proxy.js';
// 让 `ctx.github` 的类型声明随包一起被消费方加载（声明合并在 './github-service.js' 内）
export * from './github-service.js';
