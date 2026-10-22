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
/**
 * 锚点识别（行首特征）。
 *
 * 为什么分两条正则：
 * 多数框架的失败标记在**行首**（pytest 的 `FAILED path::test`、node 的
 * `AssertionError`、Go 的 `panic:`），但 TypeScript 编译器的真实输出是
 * `src/file.ts(3,5): error TS2322: ...` —— 前面带 `文件(行,列):` 前缀，
 * 行首锚定会一条都命中不了。所以 TS 单独用「行内出现」判定。
 *
 * `❌` 单列：本项目自己的 CI 测试输出就是 `❌ FAIL: xxx`，不加这一条
 * 等于对自己仓库的失败日志完全失明。
 */
const ANCHOR_LINE_RE = /^(?:FAIL|FAILED|ERROR|--- FAIL|AssertionError|Error:|panic:|Traceback \(most recent call last\)|npm ERR!|✖|❌)/;
const ANCHOR_INLINE_RE = /\berror TS\d+:/;
/**
 * `gh run view --log-failed` 的每行前缀：`<job>\t<step>\t<ISO8601>Z <正文>`。
 *
 * 这是**实测**出来的（不是猜的）：不打掉这个前缀，所有行首都变成 job 名，
 * 上面两条正则一条也命中不了——锚点萃取会整体退化成「尾部 200 行回退」，
 * 功能等于不存在。剥离只用于**匹配**，块正文仍保留原始行（job/step 是有用上下文）。
 */
const GH_LOG_PREFIX_RE = /^[^\t]*\t[^\t]*\t\d{4}-\d{2}-\d{2}T[0-9:.]+Z\s?/;
/** 去掉 gh 的 `job\tstep\ttimestamp ` 前缀（没有前缀时原样返回） */
export function stripLogPrefix(line) {
    const src = typeof line === 'string' ? line : '';
    const m = GH_LOG_PREFIX_RE.exec(src);
    return m ? src.slice(m[0].length) : src;
}
/**
 * 从日志文本中萃取失败块。
 *
 * 合并规则：相邻锚点相距不超过 `radius` 行时并入同一块——同一个异常常常先打
 * `FAIL` 再打 `AssertionError`，拆成两块等于把一次失败说两遍。
 * 每块长度上限 `2*radius+1` 行，保证单块不会因为连续堆栈而无限膨胀。
 */
export function extractFailureAnchors(text, options = {}) {
    const radius = Number.isFinite(options.radius) && options.radius > 0 ? Math.floor(options.radius) : 15;
    const maxBlocks = Number.isFinite(options.maxBlocks) && options.maxBlocks > 0 ? Math.floor(options.maxBlocks) : 8;
    const src = typeof text === 'string' ? text : '';
    if (!src)
        return { blocks: [], totalBlocks: 0, droppedBlocks: 0 };
    const lines = src.split(/\r?\n/);
    const anchors = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // 先剥 gh 的 job/step/timestamp 前缀，再按行首特征匹配（见 GH_LOG_PREFIX_RE 注释）
        const body = stripLogPrefix(line).trim();
        if (ANCHOR_LINE_RE.test(body) || ANCHOR_INLINE_RE.test(body))
            anchors.push(i);
    }
    if (anchors.length === 0)
        return { blocks: [], totalBlocks: 0, droppedBlocks: 0 };
    // 分组：相邻锚点间距 > radius 才开新块
    const groups = [];
    for (const idx of anchors) {
        const cur = groups[groups.length - 1];
        if (!cur || idx - cur.last > radius)
            groups.push({ start: idx, last: idx });
        else
            cur.last = idx;
    }
    const maxLines = 2 * radius + 1;
    const all = groups.map((g) => {
        const end = Math.min(lines.length, g.last + radius + 1);
        const slice = lines.slice(g.start, end).slice(0, maxLines);
        const anchorRaw = lines[g.start].trim();
        return {
            anchor: anchorRaw.length > 160 ? anchorRaw.slice(0, 160) + '…' : anchorRaw,
            startLine: g.start + 1,
            text: slice.join('\n'),
        };
    });
    const blocks = all.slice(0, maxBlocks);
    return { blocks, totalBlocks: all.length, droppedBlocks: all.length - blocks.length };
}
/** 把萃取结果渲染成 Markdown（人可读、模型可读，行号显式） */
export function renderFailureAnchors(result) {
    if (!result || result.blocks.length === 0)
        return '';
    const parts = [];
    parts.push(`**共命中 ${result.totalBlocks} 个失败块**，以下为前 ${result.blocks.length} 个：`);
    result.blocks.forEach((b, i) => {
        parts.push(`\n### 失败块 ${i + 1}（日志第 ${b.startLine} 行起）\n\`\`\`\n${b.text}\n\`\`\``);
    });
    if (result.droppedBlocks > 0) {
        parts.push(`\n> ⚠️ 已省略 ${result.droppedBlocks} 个失败块（共 ${result.totalBlocks} 个）。需要时可用更小的范围重跑，或到 Actions 页面查看完整日志。`);
    }
    return parts.join('\n');
}
/**
 * 无锚点时的回退：取尾部若干行。
 *
 * 为什么取尾部而不是头部：日志的失败结论在末尾（构建工具通常先刷编译输出、
 * 最后才打印错误汇总），取头部基本只能拿到环境准备信息。
 */
export function tailLines(text, count = 200) {
    const src = typeof text === 'string' ? text : '';
    if (!src)
        return '';
    const lines = src.split(/\r?\n/);
    if (lines.length <= count)
        return src;
    return lines.slice(lines.length - count).join('\n');
}
