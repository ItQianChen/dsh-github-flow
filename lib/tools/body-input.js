/**
 * 「正文/长文本来自本地文件」的统一入参解析（纯函数，零 gh 依赖）。
 *
 * 为什么需要它：Agent 的典型工作流是**先把报告写成 md 文件**，再提交成 Issue / PR 评论 /
 * 讨论 / 发版说明。改造前这些入参只有字符串 `body`，模型只能把整篇正文搬进参数——
 * 既烧上下文，又会在 Windows 约 32K 的命令行上限处炸掉（`E2BIG/EINVAL`，错误还很难懂）。
 * 于是 Agent 会绕开插件直接用 `gh issue create -F report.md`，插件的确认闸门/错误分类/渲染
 * 全部被跳过。
 *
 * 为什么不让 gh 自己去读文件（`--body-file <path>`）：`pr review` 的行级评注走 REST
 * （`POST /pulls/{n}/reviews`），那条通道根本没有 flag，只能插件侧读文件后塞 JSON。
 * 两套通道各写一份，必然漂移成「带 comments 时 body_file 静默失效」。因此统一为：
 * **插件读一次文件** →
 *   - CLI 通道：`[fileFlag, '-']` + `stdin`（`--body-file -` 由 gh 读 stdin，无 argv 长度上限）；
 *   - REST/GraphQL 通道：直接用 `text`。
 *
 * 兼容性纪律：内联来源的 argv 必须与本模块引入前**逐字节一致**（`[flag, text]`），
 * 新通道只在「传了 `*_file`」时才改变 argv。
 */
import fs from 'node:fs';
import path from 'node:path';
/**
 * GitHub 正文上限（Issue/PR/评论/讨论统一口径 65,536 字符）。
 * 抽成常量而不是散落字面量：这是上游约束，将来调整只改一处。
 */
export const GITHUB_BODY_MAX_CHARS = 65_536;
/**
 * 单个正文文件的字节硬上限（4MB）。
 * 字符上限只管正文语义，管不住「模型指了一个 200MB 日志文件」——先按字节拦住，
 * 避免 readFileSync 把整个文件拉进内存再判定。
 */
export const BODY_FILE_MAX_BYTES = 4 * 1024 * 1024;
/** 严格 UTF-8 解码器：GBK/ANSI 存的中文 md 会抛错，而不是静默产出乱码 */
const strictUtf8 = new TextDecoder('utf-8', { fatal: true });
function emptyResult(flag, keepEmptyInline) {
    return { argv: keepEmptyInline ? [flag, ''] : [], text: '', chars: 0, fromFile: false };
}
function inlineResult(flag, text) {
    return { argv: [flag, text], text, chars: text.length, fromFile: false };
}
/**
 * 解析正文来源。
 *
 * 语义表（与计划文档一致，调用方不再各自二次决策）：
 * | 输入 | argv | stdin |
 * | --- | --- | --- |
 * | `file` 有值且文件非空 | `[fileFlag, '-']` | 文件正文 |
 * | `file` 有值但文件为空 | 同「都为空」 | — |
 * | `inline` 非空 | `[flag, inline]` | — |
 * | 都为空 + keepEmptyInline | `[flag, '']` | — |
 * | 都为空 | `[]` | — |
 * | 两者都非空 | 抛错（不做静默优先级） | — |
 */
export function resolveBodySource(input, options = { cwd: process.cwd() }) {
    const flag = options.flag ?? '--body';
    const fileFlag = options.fileFlag ?? '--body-file';
    const inlineField = options.inlineField ?? 'body';
    const fileField = options.fileField ?? 'body_file';
    const maxChars = options.maxChars ?? GITHUB_BODY_MAX_CHARS;
    const rawInline = input.inline;
    if (rawInline !== undefined && rawInline !== null && typeof rawInline !== 'string') {
        throw new Error(`${inlineField} 必须是字符串。`);
    }
    // 不做 trim：内联正文要原样下发，保持与改造前逐字节一致
    const inline = typeof rawInline === 'string' ? rawInline : '';
    const rawFile = input.file;
    if (rawFile === undefined || rawFile === null) {
        return inline.length > 0 ? inlineResult(flag, inline) : emptyResult(flag, options.keepEmptyInline);
    }
    if (typeof rawFile !== 'string') {
        throw new Error(`${fileField} 必须是本地文件路径字符串（绝对路径或相对当前工作区的路径）。`);
    }
    const fileInput = rawFile.trim();
    // 空串视同未提供：调用方（含契约测试的样例表）用一个空串表达「这条路不走」
    if (!fileInput) {
        return inline.length > 0 ? inlineResult(flag, inline) : emptyResult(flag, options.keepEmptyInline);
    }
    // 二选一而非优先级：模型拿到一次明确失败，远好过「不知道哪份真正生效」
    if (inline.length > 0) {
        throw new Error(`${inlineField} 与 ${fileField} 同时提供：请二选一（长正文用 ${fileField}，短文本用 ${inlineField}）。`);
    }
    const abs = path.isAbsolute(fileInput) ? fileInput : path.resolve(options.cwd, fileInput);
    let stat;
    try {
        stat = fs.statSync(abs);
    }
    catch {
        throw new Error(`${fileField} 指向的文件不存在: "${abs}"（输入: "${fileInput}"）。`);
    }
    if (!stat.isFile()) {
        throw new Error(`${fileField} 必须是普通文件，当前指向的不是文件: "${abs}"。`);
    }
    if (stat.size > BODY_FILE_MAX_BYTES) {
        // 用字节数报错而不是 toFixed(1) 的 MB：4MB+1 字节会被四舍五入显示成「4.0MB 超过 4MB」，
        // 看上去像插件算错了，反而增加排查成本
        throw new Error(`${fileField} 文件过大: ${stat.size} 字节，超过 ${BODY_FILE_MAX_BYTES} 字节（4MB）上限。`);
    }
    const buf = fs.readFileSync(abs);
    // 二进制先判、再解码：PNG 之类在 UTF-8 解码阶段会报「不是合法 UTF-8」并给出 GBK 另存建议，
    // 对二进制文件是误导；NUL 字节是更准确的判据（文本文件不会有）
    if (buf.includes(0)) {
        throw new Error(`${fileField} 内容是二进制（含 NUL 字节），不能作为正文: "${abs}"。`);
    }
    let text;
    try {
        text = strictUtf8.decode(buf);
    }
    catch {
        throw new Error(`${fileField} 不是合法 UTF-8 文本: "${abs}"。Windows 上常见 GBK/ANSI 编码，请另存为 UTF-8 后重试。`);
    }
    // 解码头本身会剥 BOM（TextDecoder 的 ignoreBOM 默认 false）；这里显式再剥一次是防御：
    // 一旦有人把上面改成 ignoreBOM: true，正文首字符就会变成零宽 BOM 字符
    if (text.charCodeAt(0) === 0xfeff)
        text = text.slice(1);
    const chars = text.length;
    if (maxChars > 0 && chars > maxChars) {
        throw new Error(`${fileField} 正文过长: ${chars} 字符，超过上限 ${maxChars} 字符。请拆分或精简后再提交。`);
    }
    // 空文件不进 stdin 通道：不依赖 gh 对空 stdin 的处理，语义与「没正文」完全一致
    if (chars === 0)
        return emptyResult(flag, options.keepEmptyInline);
    return { argv: [fileFlag, '-'], stdin: text, text, chars, fromFile: true, file: abs };
}
