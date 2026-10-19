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
/**
 * 确定性失败的 stderr 特征表。
 *
 * 为什么用特征串而不是退出码：gh 对上述场景统一返回 exit 1，退出码无法区分
 * 「仓库关了 Issues」与「网线掉了」。文本特征是唯一可用的判据。
 * 每条都必须来自实测输出——误判会把真实网络故障降级成静默空数据，比误报更糟。
 */
const DETERMINISTIC_PATTERNS = [
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
];
/** 把「仓库未开启某项功能」翻译成点名说明（比笼统的“未开启协作功能”有用） */
const DISABLED_FEATURE_LABEL = {
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
const TRANSIENT_PATTERNS = [
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
export function classifyGhError(errorText) {
    const text = String(errorText || '');
    if (!text)
        return 'unknown';
    // 限流 403 先放行，避免被下面的通用 403 规则当成确定性失败
    if (RATE_LIMIT_RE.test(text))
        return 'transient';
    for (const { re } of DETERMINISTIC_PATTERNS) {
        if (re.test(text))
            return 'deterministic';
    }
    // 通用 403 放在确定性表之后、transient 之前：无权限属于确定性
    if (/HTTP 403/i.test(text))
        return 'deterministic';
    for (const re of TRANSIENT_PATTERNS) {
        if (re.test(text))
            return 'transient';
    }
    return 'unknown';
}
/**
 * 把确定性失败翻译成面向用户的友好说明。
 * 返回 null 表示不属于确定性失败，调用方应走原有网络故障路径。
 */
export function describeDeterministicError(errorText) {
    const text = String(errorText || '');
    if (!text)
        return null;
    if (RATE_LIMIT_RE.test(text))
        return null;
    // 先处理「仓库关闭某项功能」：点名到具体功能，比笼统措辞更容易让用户行动
    const disabled = /repository has (?:disabled )?(issues|discussions|projects|wiki)(?: disabled)?/i.exec(text);
    if (disabled) {
        const label = DISABLED_FEATURE_LABEL[disabled[1].toLowerCase()] || disabled[1];
        return `该仓库未开启 ${label}`;
    }
    for (const { re, reason } of DETERMINISTIC_PATTERNS) {
        if (re.test(text))
            return reason;
    }
    if (/HTTP 403/i.test(text))
        return '当前账号无此操作权限';
    return null;
}
/** 该错误是否值得重试（供 UI 层决定是否走阶梯退避） */
export function isRetryableError(errorText) {
    return classifyGhError(errorText) !== 'deterministic';
}
