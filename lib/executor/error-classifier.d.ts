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
'transient'
/** 确定性失败（仓库关闭 issues、仓库不存在、权限不足）：重试永远无意义 */
 | 'deterministic'
/** 命令失败但无明确归属，按可重试处理（保守不误杀） */
 | 'unknown';
/**
 * 判定一次 gh 失败的语义种类。
 *
 * 优先级设计：确定性 > 限流放行 > 传输层 > unknown。
 * 为什么不把「同时命中确定性与传输层」判为 transient：若仓库关闭了 Issues，
 * 网络恢复后该命令依然失败。判成 transient 会让调用方每轮回退旧快照、
 * 永远收敛不到正确状态。确定性一旦命中就该立刻停止重试。
 */
export declare function classifyGhError(errorText: string | undefined | null): GhErrorKind;
/**
 * 把确定性失败翻译成面向用户的友好说明。
 * 返回 null 表示不属于确定性失败，调用方应走原有网络故障路径。
 */
export declare function describeDeterministicError(errorText: string | undefined | null): string | null;
/** 该错误是否值得重试（供 UI 层决定是否走阶梯退避） */
export declare function isRetryableError(errorText: string | undefined | null): boolean;
export declare function isPermissionError(errorText: string | undefined | null): boolean;
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
export declare function permissionRemedy(errorText: string | undefined | null, action?: string): string | null;
