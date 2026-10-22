/**
 * CI 失败日志的「锚点萃取」：把整段日志压成若干段带行号的失败上下文。
 *
 * 为什么需要它：
 * 1. 矩阵构建（matrix）下一个 run 会有 N 个 job 的失败日志，动辄几万行；
 *    「整段给模型」必然触顶默认输出上限，而截断发生在**萃取之前**——
 *    结果就是 Agent 只能看到前 24KB，后面的失败根本不存在于上下文里；
 * 2. 模型真正需要的不是全量日志，而是「每个失败的起点 + 之后几十行」；
 * 3. 锚点全部取自各框架日志的首列特征（实测输出），不含猜测。
 *
 * 纯函数、零 I/O：日志文本进，结构化块出。
 */
/** 去掉 gh 的 `job\tstep\ttimestamp ` 前缀（没有前缀时原样返回） */
export declare function stripLogPrefix(line: string): string;
export interface FailureBlock {
    /** 命中的锚点原文（去掉首尾空白，超长截断） */
    anchor: string;
    /** 该块起始行号（1-based，方便人去日志里定位） */
    startLine: number;
    /** 块正文（含锚点行与其后上下文） */
    text: string;
}
export interface FailureAnchorResult {
    blocks: FailureBlock[];
    /** 萃取到的失败块总数（可能大于返回的 blocks.length） */
    totalBlocks: number;
    /** 因 maxBlocks 上限被丢弃的块数 */
    droppedBlocks: number;
}
export interface FailureAnchorOptions {
    /** 每个锚点向后取多少行上下文 */
    radius?: number;
    /** 最多返回多少块 */
    maxBlocks?: number;
}
/**
 * 从日志文本中萃取失败块。
 *
 * 合并规则：相邻锚点相距不超过 `radius` 行时并入同一块——同一个异常常常先打
 * `FAIL` 再打 `AssertionError`，拆成两块等于把一次失败说两遍。
 * 每块长度上限 `2*radius+1` 行，保证单块不会因为连续堆栈而无限膨胀。
 */
export declare function extractFailureAnchors(text: string, options?: FailureAnchorOptions): FailureAnchorResult;
/** 把萃取结果渲染成 Markdown（人可读、模型可读，行号显式） */
export declare function renderFailureAnchors(result: FailureAnchorResult): string;
/**
 * 无锚点时的回退：取尾部若干行。
 *
 * 为什么取尾部而不是头部：日志的失败结论在末尾（构建工具通常先刷编译输出、
 * 最后才打印错误汇总），取头部基本只能拿到环境准备信息。
 */
export declare function tailLines(text: string, count?: number): string;
