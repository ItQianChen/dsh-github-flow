/**
 * PR 行级评注写入：payload 构造、校验与 422 降级（纯函数）。
 *
 * 为什么单独一个模块：
 * 1. `gh pr review` 没有行级参数（`gh pr review --help` 里 line/side/path 零命中），
 *    只能走 `POST /repos/{owner}/{repo}/pulls/{n}/reviews` 的 `comments[]`；
 * 2. 「哪些错误可以在发请求前拦住」「422 怎么降级」是纯逻辑，必须能脱离网络单测；
 * 3. executor 只负责发请求，校验与降级策略放在这里，避免 executor 继续膨胀。
 *
 * 严格按 REST 文档字段构造请求体，未自造任何键。
 */
/** 单次 review 的行级评注上限。超过就拆多次，一次一个请求 = 通知只发一轮 */
export declare const MAX_REVIEW_COMMENTS = 50;
export type PrReviewEvent = 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES';
/** 调用方传入的单条行级评注（宽松类型，校验后才是 REST 形状） */
export interface PrReviewCommentInput {
    path?: unknown;
    line?: unknown;
    side?: unknown;
    start_line?: unknown;
    start_side?: unknown;
    body?: unknown;
}
/** REST 形状的单条评注（全部字段已归一化） */
export interface PrReviewCommentPayload {
    path: string;
    line?: number;
    side?: 'LEFT' | 'RIGHT';
    start_line?: number;
    start_side?: 'LEFT' | 'RIGHT';
    /**
     * `file` = 文件级评论（不挂行），`line` = 行级评论。
     *
     * 为什么需要它：REST 的 `comments[]` 里 `line` 是**实际必填**的（缺了就 422），
     * 想只评论某个文件必须显式声明 `subject_type: 'file'`。不写这个字段时，
     * 「只给 path 不给 line」会被 GitHub 判为非法行级评论——那正是「明明参数合法却 422」的成因。
     */
    subject_type?: 'file' | 'line';
    body: string;
}
/** REST 形状的 review 请求体 */
export interface PrReviewPayload {
    commit_id?: string;
    event: PrReviewEvent;
    body?: string;
    comments?: PrReviewCommentPayload[];
}
export interface BuildResult {
    ok: boolean;
    payload?: PrReviewPayload;
    /** 校验失败时的**全部**问题（一次说完，不要让调用方改一条试一次） */
    errors?: string[];
}
/** `createPrReview` 的返回形状 */
export interface PrReviewResult {
    ok: boolean;
    error?: string;
    /** 是否走了 422 降级（行级评注被折叠进正文） */
    degraded?: boolean;
    /** 降级原因，供渲染层用 appendDegradedNote 显式呈现 */
    degradedReason?: string;
    data?: any;
}
/**
 * 构造 REST review 请求体。
 *
 * @param input.event    review 判定，缺省 COMMENT
 * @param input.body     整体说明
 * @param input.comments 行级评注（空数组等价于不传 → 调用方应走原 gh pr review 路径）
 * @param input.commit_id 可选锚点 SHA
 */
export declare function buildPrReviewPayload(input: {
    event?: unknown;
    body?: unknown;
    comments?: unknown;
    commit_id?: unknown;
}): BuildResult;
/**
 * 422 降级：把行级评注折叠进 review 正文。
 *
 * 为什么必须降级而不是直接失败：422 的典型原因是「该行不在 diff 的 RIGHT 侧」
 * （纯删除行、未变更的上下文行）。内容本身是对的，只是挂不到那一行上——
 * 丢掉它等于让 Agent 白干一轮，而把内容塞进正文至少保证意见送达。
 *
 * 每条降级项都带 `path:line` 前缀，人能在正文里定位；调用方另需回传
 * `degraded: true` + `degradedReason`，让「这是降级结果」显式可见。
 */
export declare function foldCommentsIntoBody(comments: PrReviewCommentPayload[], baseBody?: string): string;
/**
 * 判定失败是否属于「行级评注被拒绝」这一类（值得降级重试）。
 *
 * 判据来自 gh 实测 stderr：REST 422 会以 `HTTP 422` 或 `Validation Failed` 出现；
 * 403/404/网络错误**不在**此列——那些降级也没用，必须原样抛给调用方。
 */
export declare function isLineCommentRejected(errorText: string): boolean;
