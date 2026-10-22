/**
 * Actions run / job / step 的耗时格式化（导出以便单测直接覆盖）。
 *
 * 为什么不用 formatRelativeTime：那个函数答的是「发生在多久前」，这里是「跑了多久」；
 * 而且 run → job → step 三层共用同一套精度规则（<60s → `12s`、<60m → `3m20s`、
 * 其余 `1h05m`），分钟/秒补零才能让三层的列宽稳定对齐。
 * 任一端缺失或不可解析一律返回空串：排队中/已跳过的 job 没有 startedAt/completedAt，
 * 硬算只会渲染出「0s」这种假精确值，比不显示更误导。
 */
export declare function formatRunDuration(startISO?: string, endISO?: string): string;
export interface RunDetailModalProps {
    runId: number;
    repoNameWithOwner?: string;
    cwd?: string | null;
    onClose: () => void;
    showToast?: (msg: string) => void;
}
/**
 * Actions Run 详情弹窗（只读：run 元信息 + job/step 树 + 失败日志片段）。
 *
 * 单列纵向：run 的信息天然是「job 列表 + 一条日志流」的阅读顺序，没有需要并排
 * 对照的第二个信息源（PR 才有 diff 双栏）。
 * 日志刻意渲染成 <pre> 原文而不是 markdown-lite：原始日志里的 `#`、`|`、`---`
 * 是 shell 注释、表格与 diff 分隔符，交给 Markdown 解析会把堆栈与 diff 撕碎。
 */
export declare function RunDetailModal(props: RunDetailModalProps): any;
