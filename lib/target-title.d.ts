/** 记下这一次调用的目标标题（审核阶段调用） */
export declare function stashTargetTitle(callId: unknown, title: unknown): void;
/** 取出并移除（记录阶段调用，一次性消费） */
export declare function takeTargetTitle(callId: unknown): string | undefined;
/** 清空（测试 / 卸载用） */
export declare function resetTargetTitles(): void;
/**
 * 被操作的 PR / Issue 的"拍板所需信息"。
 *
 * 为什么不止标题：用户实证「只有标题不好判断」。合并 / 重开 / 关闭之前，人真正要看的是
 * **它现在是什么状态、谁提的、改了多少、CI 过没过、正文说了什么**。这些字段都是 GitHub
 * GraphQL 一次查询就能拿全的（2026-11-26 真机核对），不增加往返次数。
 * 全部可选：任何一项取不到都不影响其余项的展示。
 */
export interface TargetInfo {
    title: string;
    body?: string;
    /** `OPEN` / `CLOSED` / `MERGED` */
    state?: string;
    /** Issue 专用：`COMPLETED` / `NOT_PLANNED` / `REOPENED` */
    stateReason?: string;
    isDraft?: boolean;
    author?: string;
    additions?: number;
    deletions?: number;
    changedFiles?: number;
    commentsCount?: number;
    /** PR 专用：`APPROVED` / `CHANGES_REQUESTED` / `REVIEW_REQUIRED` */
    reviewDecision?: string;
    /** 最近一次提交的检查汇总：`SUCCESS` / `FAILURE` / `PENDING` / `ERROR` …；null = 没有检查 */
    checkState?: string | null;
}
/** 被审核的调用里本模块只读这几个字段（宿主 `ToolExecution` 的子集） */
export interface TargetExec {
    name?: unknown;
    arguments?: any;
    callId?: unknown;
}
/** 取目标信息的实际通道（`main.ts` 用 executor 注入，测试用假函数） */
export type TargetFetcher = (kind: 'pr' | 'issue', num: number, scope: {
    cwd?: string;
    repo?: string;
}) => Promise<TargetInfo | undefined>;
export interface TargetInfoResolverDeps {
    fetchTarget: TargetFetcher;
    /** 缓存有效期：同一目标的连续操作不该反复打 gh */
    ttlMs?: number;
    now?: () => number;
}
/**
 * 造一个"从 exec 里认出目标并取信息"的解析器。
 *
 * 认目标的规则刻意保守：**只认 `pr_number` / `issue_number` 而且必须是正整数**。
 * 没有编号（`create`）直接返回 undefined —— 不猜、不多打一次 gh。
 * 任何失败（gh 不通、无权限、编号不存在）都返回 undefined，绝不让它拖慢或阻断审核。
 */
export declare function createTargetInfoResolver(deps: TargetInfoResolverDeps): (exec: TargetExec | undefined) => Promise<TargetInfo | undefined>;
