/**
 * 目标实体的标题（PR / Issue 的 title），供**审核弹窗**与**操作记录**共用。
 *
 * 为什么需要这个模块：`merge` / `close` / `delete` 这类操作的参数里只有编号，
 * 而"被操作的那个 PR/Issue 是什么"才是人拍板时唯一有用的信息。标题只能去 gh 读，
 * 但读它有两个硬约束：
 * 1. **只在审核阶段读一次**，结果同时给弹窗和记录（两边各读一次就是两次 gh 往返）；
 * 2. 读的时机在 `tools/pre-execute`（已经是异步），所以记录侧（同步的 `tools/result`）
 *    拿不到异步结果 —— 用一张 `callId → title` 的一次性小表把它递过去。
 *
 * 为什么单独成模块：`audit.ts` 需要**读**、`approval-gate.ts` 需要**写**，
 * 而 approval-gate 已经 import 了 audit（取摘要/分类），audit 再反向 import 就成环。
 * 这张表没有任何依赖，两边都能安全引用。
 */
import { TtlCache } from './cache.js';

/** 一次性标题暂存：key = 宿主 callId */
const pending = new Map<string, string>();

/**
 * 上限保护。理论上 `tools/result` 对每个调用必然触发、会把条目取走；
 * 但"必然"这种东西在热重载 / 宿主异常时不一定成立，所以给个硬上限，
 * 超了丢最早的（标题只是锦上添花，不值得为它无界增长）。
 */
const MAX_PENDING = 64;

/** 记下这一次调用的目标标题（审核阶段调用） */
export function stashTargetTitle(callId: unknown, title: unknown): void {
  if (typeof callId !== 'string' || callId === '') return;
  if (typeof title !== 'string' || title.trim() === '') return;
  if (pending.size >= MAX_PENDING) {
    const oldest = pending.keys().next();
    if (!oldest.done) pending.delete(oldest.value);
  }
  pending.set(callId, title.trim());
}

/** 取出并移除（记录阶段调用，一次性消费） */
export function takeTargetTitle(callId: unknown): string | undefined {
  if (typeof callId !== 'string' || callId === '') return undefined;
  const hit = pending.get(callId);
  if (hit === undefined) return undefined;
  pending.delete(callId);
  return hit;
}

/** 清空（测试 / 卸载用） */
export function resetTargetTitles(): void {
  pending.clear();
}

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
export type TargetFetcher = (
  kind: 'pr' | 'issue',
  num: number,
  scope: { cwd?: string; repo?: string }
) => Promise<TargetInfo | undefined>;

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
export function createTargetInfoResolver(
  deps: TargetInfoResolverDeps
): (exec: TargetExec | undefined) => Promise<TargetInfo | undefined> {
  const ttlMs = deps.ttlMs ?? 15_000;
  const now = deps.now ?? (() => Date.now());
  // 键含 repo：同一编号在不同仓库是不同实体
  const cache = new TtlCache<TargetInfo>(ttlMs, 32);

  return async function resolveTarget(exec) {
    try {
      const name = typeof exec?.name === 'string' ? exec.name : '';
      const kind = name === 'github_pr' ? 'pr' : name === 'github_issue' ? 'issue' : null;
      if (kind === null) return undefined;
      const args = exec?.arguments;
      const raw = kind === 'pr' ? args?.pr_number : args?.issue_number;
      const num = Number(raw);
      if (!Number.isInteger(num) || num <= 0) return undefined;
      const scope = {
        cwd: typeof args?.cwd === 'string' ? args.cwd : undefined,
        repo: typeof args?.repo === 'string' ? args.repo.trim() || undefined : undefined,
      };
      const key = `${kind}|${num}|${scope.repo ?? ''}|${scope.cwd ?? ''}`;
      const at = now();
      const cached = cache.get(key, at);
      if (cached !== undefined) return cached;
      const info = await deps.fetchTarget(kind, num, scope);
      const title = typeof info?.title === 'string' ? info.title.trim() : '';
      if (title === '') return undefined;
      const clean: TargetInfo = { ...info, title };
      cache.set(key, clean, at);
      return clean;
    } catch {
      return undefined;
    }
  };
}
