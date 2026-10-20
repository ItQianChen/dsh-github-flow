/**
 * gh 错误语义分类（确定性配置错误 vs 可重试的传输层故障）。
 *
 * 为什么必须区分：`gh` 失败时一律以非零退出码返回，调用方只能看到一段 stderr
 * 文本。过去上层（Web 概览路由）把所有非零退出统一当成「网络错误」，于是
 * 「仓库关闭了 Issues」这种永久性配置事实被伪装成网络抖动——既弹出误导性的
 * 「网络连接失败」横幅，又触发 3 轮阶梯退避重试与每 5-10 分钟一轮的自动同步，
 * 把确定性失败当成偶发抖动反复空烧。
 *
 * 判据全部来自 gh 2.96 实测 stderr：
 *   - the 'o/r' repository has disabled issues
 *   - the 'o/r' repository has discussions disabled
 *   - GraphQL: Could not resolve to a Repository with the name 'o/r'. (repository)
 *   - HTTP 403 / Not Found (HTTP 404)
 *
 * 纯文本判定，不做任何 I/O——它是 GhResult.errorKind 的唯一事实源。
 */

/** gh 失败结果的语义种类 */
export type GhErrorKind =
  /** 传输层故障（超时、DNS、连接重置、代理阻断）：值得重试，允许回退历史快照 */
  | 'transient'
  /** 确定性失败（仓库关闭 issues、仓库不存在、权限不足）：重试永远无意义 */
  | 'deterministic'
  /** 命令失败但无明确归属，按可重试处理（保守不误杀） */
  | 'unknown';

/**
 * 确定性失败的 stderr 特征表。
 *
 * 为什么用特征串而不是退出码：gh 对上述场景统一返回 exit 1，退出码无法区分
 * 「仓库关了 Issues」与「网线掉了」。文本特征是唯一可用的判据。
 * 每条都必须来自实测输出——误判会把真实网络故障降级成静默空数据，比误报更糟。
 */
const DETERMINISTIC_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  // 仓库级开关关闭（Issues / Discussions / Projects / Wiki）。
  // 注意 gh 的措辞不统一（实测）：
  //   issues      → "repository has disabled issues"
  //   discussions → "repository has discussions disabled"
  // 词序相反，所以两种形态都要覆盖，不能只写一种。
  {
    re: /repository has (?:disabled )?(issues|discussions|projects|wiki)(?: disabled)?/i,
    reason: '该仓库未开启该项协作功能',
  },
  // 仓库不可达（不存在 / 无权限 / 已改名）：GraphQL 与 REST 两条通道
  { re: /Could not resolve to a Repository/i, reason: '仓库不存在或当前账号无权访问' },
  { re: /Not Found \(HTTP 404\)/i, reason: '仓库或资源不存在' },
  // 分支 / PR / Issue 单体不存在
  { re: /Branch not found/i, reason: '分支不存在' },
  // GraphQL 通道的权限不足（实测形态）：
  //   GraphQL: ItQianChen does not have the correct permissions to execute `AddLabelsToLabelable` (addLabelsToLabelable)
  //   GraphQL: ItQianChen does not have the correct permissions to execute `DeleteIssue` (deleteIssue)
  // 这类文本里没有 "HTTP 403"，若不单列会被归为 unknown，进而被当成可重试抖动——
  // 而权限不足重试一万次也不会变。
  { re: /does not have the correct permissions to execute/i, reason: '当前账号对该仓库的权限不足' },
];

/** 把「仓库未开启某项功能」翻译成点名说明（比笼统的“未开启协作功能”有用） */
const DISABLED_FEATURE_LABEL: Record<string, string> = {
  issues: 'Issues',
  discussions: 'Discussions',
  projects: 'Projects',
  wiki: 'Wiki',
};

/**
 * 限流类 403 必须先于通用 403 放行。
 * 为什么单列：GitHub 的 `HTTP 403` 既可能是「无权限」（确定性），也可能是
 * 「API rate limit exceeded / secondary rate limit」（几分钟后可恢复）。
 * 把限流误判成确定性会让学生等一会儿就能好的请求被判死刑。
 */
const RATE_LIMIT_RE = /rate limit|secondary rate limit|abuse detection/i;

/** 传输层故障特征（显式白名单，用于给出「可重试」的准确语义） */
const TRANSIENT_PATTERNS: RegExp[] = [
  /命令执行超时/,
  /\bETIMEDOUT\b/i,
  /\bECONNRESET\b/i,
  /\bECONNREFUSED\b/i,
  /\bENOTFOUND\b/i,
  /\bEAI_AGAIN\b/i,
  /socket hang up/i,
  /TLS handshake/i,
  /proxyconnect/i,
  /spawn EPERM/i,
  /network is unreachable/i,
  /Could not resolve host/i,
  /no such host/i,
];

/**
 * 判定一次 gh 失败的语义种类。
 *
 * 优先级设计：确定性 > 限流放行 > 传输层 > unknown。
 * 为什么不把「同时命中确定性与传输层」判为 transient：若仓库关闭了 Issues，
 * 网络恢复后该命令依然失败。判成 transient 会让调用方每轮回退旧快照、
 * 永远收敛不到正确状态。确定性一旦命中就该立刻停止重试。
 */
export function classifyGhError(errorText: string | undefined | null): GhErrorKind {
  const text = String(errorText || '');
  if (!text) return 'unknown';

  // 限流 403 先放行，避免被下面的通用 403 规则当成确定性失败
  if (RATE_LIMIT_RE.test(text)) return 'transient';

  for (const { re } of DETERMINISTIC_PATTERNS) {
    if (re.test(text)) return 'deterministic';
  }
  // 通用 403 放在确定性表之后、transient 之前：无权限属于确定性
  if (/HTTP 403/i.test(text)) return 'deterministic';

  for (const re of TRANSIENT_PATTERNS) {
    if (re.test(text)) return 'transient';
  }
  return 'unknown';
}

/**
 * 把确定性失败翻译成面向用户的友好说明。
 * 返回 null 表示不属于确定性失败，调用方应走原有网络故障路径。
 */
export function describeDeterministicError(errorText: string | undefined | null): string | null {
  const text = String(errorText || '');
  if (!text) return null;
  if (RATE_LIMIT_RE.test(text)) return null;
  // 先处理「仓库关闭某项功能」：点名到具体功能，比笼统措辞更容易让用户行动
  const disabled = /repository has (?:disabled )?(issues|discussions|projects|wiki)(?: disabled)?/i.exec(text);
  if (disabled) {
    const label = DISABLED_FEATURE_LABEL[disabled[1].toLowerCase()] || disabled[1];
    return `该仓库未开启 ${label}`;
  }
  for (const { re, reason } of DETERMINISTIC_PATTERNS) {
    if (re.test(text)) return reason;
  }
  if (/HTTP 403/i.test(text)) return '当前账号无此操作权限';
  return null;
}

/** 该错误是否值得重试（供 UI 层决定是否走阶梯退避） */
export function isRetryableError(errorText: string | undefined | null): boolean {
  return classifyGhError(errorText) !== 'deterministic';
}

/**
 * 判断一段错误是否属于「权限不足」（而非仓库配置、不存在等确定性错误）。
 *
 * 为什么单独判定：确定性错误里只有权限这一类有「解法路径」（提权 / 换 fork 工作流），
 * 其余（仓库关了 Issues、分支不存在）说再多也没用。
 */
const PERMISSION_RE =
  /does not have the correct permissions to execute|HTTP 403|Resource not accessible|Forbidden|must have (?:admin|push|write|triage|maintain) (?:access|permissions?)/i;

export function isPermissionError(errorText: string | undefined | null): boolean {
  const text = String(errorText || '');
  if (!text) return false;
  // 限流也常以 403 出现，但它不是权限问题——放行会让用户去改权限，做无用功
  if (RATE_LIMIT_RE.test(text)) return false;
  return PERMISSION_RE.test(text);
}

/**
 * 已知操作 → 所需权限档位 的映射。
 *
 * 键取自 GitHub 的 GraphQL mutation 名与 gh 子命令动词（实测捕获）。
 * 为什么不用完整枚举：GitHub 有上百个 mutation，穷举既不可能也没必要——
 * 未命中的一律走默认指引，仍然是对的。
 */
const ACTION_PERMISSION_MAP: Array<{ re: RegExp; level: string; hint: string }> = [
  {
    // 同时覆盖 GraphQL mutation 名（AddLabelsToLabelable）与 CLI 参数形态
    // （--add-label / --remove-label）——两者出现在不同层级的错误文本里。
    re: /AddLabelsToLabelable|RemoveLabelsFromLabelable|UpdateIssue|CloseIssue|TransferIssue|add-?label|remove-?label|close-?issue|issue (?:edit|close|pin|lock|transfer)/i,
    level: 'Triage',
    hint: '管理他人 Issue/PR（加标签、关闭、指派）需要 Triage 及以上权限。可请仓库管理员授予，或改用评论表达意见。',
  },
  {
    re: /mergePullRequest|MergePullRequest|\bmerge\b|CreateRef|createRef|\bpush\b|CreateCommitOnBranch/i,
    level: 'Write',
    hint: '合并 PR / 推送代码需要 Write 及以上权限。若是他人仓库，请先 fork 到自己的账号，在 fork 上提交后向上游发起 PR。',
  },
  {
    re: /DeleteIssue|deleteIssue|DeleteRepository|deleteRepository|TransferRepository|\bdelete\b/i,
    level: 'Admin',
    hint: '物理删除与仓库级操作需要管理员权限。这类操作不可逆，请联系仓库管理员执行。',
  },
];

/**
 * 把「权限不足」翻译成可操作的处置指引。
 *
 * 为什么不能只回一句「无权限」：Agent 与用户都需要知道**下一步做什么**。
 * GitHub 的权限错误有明确解法路径（提权到 Triage/Write、或改用 fork 工作流），
 * 把这条路径说出来，比让用户自己搜错误文本有用得多。
 *
 * @param errorText gh 的 stderr
 * @param action 可选：正在执行的动作标识（如 'merge' / 'close' / 'add_label'），
 *               用于在错误文本特征不足时精准匹配
 * @returns 指引文本；非权限错误返回 null（不产生噪音）
 */
export function permissionRemedy(errorText: string | undefined | null, action?: string): string | null {
  if (!isPermissionError(errorText)) return null;

  const haystack = `${String(errorText || '')} ${String(action || '')}`;
  for (const { re, hint } of ACTION_PERMISSION_MAP) {
    if (re.test(haystack)) return hint;
  }

  // 默认指引：不指定具体档位。
  // 为什么：只知道「权限不足」时猜档位很容易猜错（我们实测就猜错过——
  // READ 用户能建 Issue，而不是处处受限），说错比不说更糟。
  return '当前账号对该仓库的权限不足。可运行 `gh auth status` 查看作用域，或请仓库管理员提升权限。';
}

