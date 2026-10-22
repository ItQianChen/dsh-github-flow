/**
 * 状态 → 徽章的唯一映射（服务端 Markdown 与客户端 UI 共用）。
 *
 * 为什么必须共用：同一个状态（OPEN / MERGED / CI failure …）在 CLI 输出与右侧栏
 * 面板上必须是同一套颜色与同一套文案。此前这条映射在 9 个文件里各写了一遍
 * （服务端 5 个 `format*Badge`、客户端 6 处内联三元式），新增一个状态要改 12 处，
 * 漏一处就出现「同一个 PR 在两处显示不同颜色」。
 *
 * 约束（构建期强依赖）：本文件必须**零依赖**。scripts/build.mjs 会把它的 import
 * 行剥掉、整体内联进客户端 bundle；一旦这里 import 了别的东西，那些符号在 bundle
 * 作用域里就是 undefined，表现是整个驾驶舱白屏。
 *
 * `tone` 直接就是 CSS class 后缀（`dsh-badge-${tone}`），客户端不再需要映射表。
 */

export type BadgeTone = 'green' | 'purple' | 'red' | 'yellow' | 'neutral';

export interface StateBadge {
  /** 前缀 Emoji；服务端 Markdown 用，客户端通常只用 tone+label */
  icon: string;
  /** 便于阅读的短标签（大写状态名或小写结论词） */
  label: string;
  /** 直接拼进 `dsh-badge-${tone}` 的色调名 */
  tone: BadgeTone;
}

/** 服务端 Markdown 渲染用：`🟢 OPEN` / `OPEN` / `-` */
export function badgeText(badge: StateBadge | null): string {
  if (!badge) return '-';
  return badge.icon ? `${badge.icon} ${badge.label}` : badge.label;
}

/** PR / Issue 状态（空 state 优先于 draft，与旧实现判定顺序一致） */
export function prStateBadge(state?: string, isDraft?: boolean): StateBadge | null {
  const s = String(state || '').toUpperCase();
  // 旧实现把 `if (!state) return '-'` 放在最前、draft 判定在其后。
  // 顺序反了会让 formatStateBadge(undefined, true) 从 '-' 变成 '⚪ DRAFT'——那是行为变化。
  if (!s) return null;
  if (isDraft) return { icon: '⚪', label: 'DRAFT', tone: 'yellow' };
  if (s === 'OPEN') return { icon: '🟢', label: 'OPEN', tone: 'green' };
  if (s === 'MERGED') return { icon: '🟣', label: 'MERGED', tone: 'purple' };
  if (s === 'CLOSED') return { icon: '🔴', label: 'CLOSED', tone: 'red' };
  return genericStateBadge(s);
}

/** Issue 状态（没有 MERGED 这一档） */
export function issueStateBadge(state?: string): StateBadge | null {
  const s = String(state || '').toUpperCase();
  if (s === 'OPEN') return { icon: '🟢', label: 'OPEN', tone: 'green' };
  if (s === 'CLOSED') return { icon: '🔴', label: 'CLOSED', tone: 'red' };
  return genericStateBadge(s);
}

/**
 * CI 状态。
 * 第二参数按调用域语义不同：run 域传 conclusion（success/failure/…），
 * pr checks 域传 bucket（pass/fail/pending/…）——取值族不同但映射到同一组徽章；
 * 第一参数兜底（in_progress/queued 等进行中态）。
 */
export function ciBadge(status?: string, conclusion?: string): StateBadge | null {
  const conc = String(conclusion || '').toLowerCase();
  const st = String(status || '').toLowerCase();
  if (conc === 'success' || conc === 'pass') return { icon: '✅', label: conc, tone: 'green' };
  if (conc === 'failure' || conc === 'fail') return { icon: '❌', label: conc, tone: 'red' };
  if (conc === 'cancelled' || conc === 'cancel') return { icon: '🚫', label: conc, tone: 'red' };
  if (conc === 'skipped' || conc === 'skipping') return { icon: '⏭️', label: conc, tone: 'neutral' };
  if (conc === 'pending') return { icon: '⏳', label: 'pending', tone: 'yellow' };
  if (st === 'in_progress') return { icon: '⏳', label: 'running', tone: 'yellow' };
  if (st === 'queued') return { icon: '⏱️', label: 'queued', tone: 'yellow' };
  const fallback = conc || st;
  if (!fallback) return null;
  return { icon: '', label: fallback, tone: 'neutral' };
}

/** 合并冲突状态 */
export function conflictBadge(status?: string): StateBadge | null {
  const s = String(status || '').toUpperCase();
  if (s === 'CLEAN') return { icon: '✅', label: 'CLEAN', tone: 'green' };
  if (s === 'DIRTY' || s === 'CONFLICT') return { icon: '⚠️', label: 'CONFLICT', tone: 'yellow' };
  if (s === 'BLOCKED') return { icon: '⛔', label: 'BLOCKED', tone: 'red' };
  if (!s) return null;
  return { icon: '', label: s, tone: 'neutral' };
}

/** Release 状态（Draft > Prerelease > Stable） */
export function releaseBadge(isDraft?: boolean, isPrerelease?: boolean): StateBadge {
  if (isDraft) return { icon: '⚪', label: 'DRAFT', tone: 'yellow' };
  if (isPrerelease) return { icon: '🍼', label: 'PRE', tone: 'yellow' };
  return { icon: '✅', label: 'STABLE', tone: 'green' };
}

/** 兜底：任意状态字符串转徽章（未知状态给 neutral，不猜颜色） */
export function genericStateBadge(state?: string): StateBadge | null {
  const s = String(state || '').toUpperCase();
  if (!s) return null;
  return { icon: '', label: s, tone: 'neutral' };
}
