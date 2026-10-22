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
export declare function badgeText(badge: StateBadge | null): string;
/** PR / Issue 状态（空 state 优先于 draft，与旧实现判定顺序一致） */
export declare function prStateBadge(state?: string, isDraft?: boolean): StateBadge | null;
/** Issue 状态（没有 MERGED 这一档） */
export declare function issueStateBadge(state?: string): StateBadge | null;
/**
 * CI 状态。
 * 第二参数按调用域语义不同：run 域传 conclusion（success/failure/…），
 * pr checks 域传 bucket（pass/fail/pending/…）——取值族不同但映射到同一组徽章；
 * 第一参数兜底（in_progress/queued 等进行中态）。
 */
export declare function ciBadge(status?: string, conclusion?: string): StateBadge | null;
/** 合并冲突状态 */
export declare function conflictBadge(status?: string): StateBadge | null;
/** Release 状态（Draft > Prerelease > Stable） */
export declare function releaseBadge(isDraft?: boolean, isPrerelease?: boolean): StateBadge;
/** 兜底：任意状态字符串转徽章（未知状态给 neutral，不猜颜色） */
export declare function genericStateBadge(state?: string): StateBadge | null;
