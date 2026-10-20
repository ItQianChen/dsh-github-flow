/**
 * 仓库卡片徽章推导（纯函数，无 React 依赖，可被单测直接覆盖）。
 *
 * 为什么独立成模块：`client.ts` 是近 2000 行的巨石，其中的 UI 判定逻辑
 * 只能靠「bundle 里有没有这个字符串」这类弱断言覆盖。把判定规则抽成纯函数后，
 * 「什么情况出什么徽章」可以被真实断言，而不是靠人工目测。
 */
/** 徽章语义色调，映射到既有 .dsh-badge-* 样式 */
export type RepoBadgeTone = 'green' | 'red' | 'yellow' | 'blue' | 'purple' | 'gray';
export interface RepoBadge {
    /** 徽章文案（含图标字符） */
    text: string;
    tone: RepoBadgeTone;
    /** hover 提示：说明「是什么」+「该怎么办」 */
    title: string;
}
export interface RepoPresentation {
    badges: RepoBadge[];
    /** fork 血缘行；非 fork 或拿不到上游时为 null */
    forkLine: {
        parentNameWithOwner: string;
        parentUrl: string;
    } | null;
}
/**
 * 依据仓库元数据推导展示信息。
 *
 * 三条规则（与上位方案 S4 展示契约对齐，但**不含上游 star**）：
 *   1. `isFork` 为 true → `⑂ fork` 徽章；有 parent 时附带血缘行
 *   2. `viewerPermission` 为 READ / TRIAGE → `🔒 只读` 徽章
 *   3. 其余一律零徽章（保持现有外观）
 *
 * 为什么权限未知时不显示任何徽章：离线数据没有该字段，此时既不能说
 * 「可写」也不能说「只读」——沉默优于猜测。显示一个可能错误的徽章，
 * 比不显示更糟。
 *
 * 为什么不展示上游 star：`parent` 只返回骨架，拿不到 stargazerCount
 * （`--json` 不支持嵌套子字段，实测）；补一次网络往返实测 3~6 秒，
 * 而 star 数不是决策信息。详见 s4 执行方案 §2.1。
 *
 * @param repo RepoMetadata 或 null/undefined（离线、非 Git 工作区）
 */
export declare function resolveRepoBadges(repo: any): RepoPresentation;
