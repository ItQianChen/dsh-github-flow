/**
 * GitHub 正文上限（Issue/PR/评论/讨论统一口径 65,536 字符）。
 * 抽成常量而不是散落字面量：这是上游约束，将来调整只改一处。
 */
export declare const GITHUB_BODY_MAX_CHARS = 65536;
/**
 * 单个正文文件的字节硬上限（4MB）。
 * 字符上限只管正文语义，管不住「模型指了一个 200MB 日志文件」——先按字节拦住，
 * 避免 readFileSync 把整个文件拉进内存再判定。
 */
export declare const BODY_FILE_MAX_BYTES: number;
/** 入参归一化的产出：argv 片段 + 需要注入的 stdin + 权威文本 */
export interface BodySource {
    /** 交给 gh 的 argv 片段：`[]` | `[flag, text]` | `[fileFlag, '-']` */
    argv: string[];
    /** `[fileFlag, '-']` 时需要经 stdin 注入的正文；其余情况为 undefined */
    stdin?: string;
    /** 权威正文（REST/GraphQL 通道直接用它；调用方做必填判定也看它） */
    text: string;
    /** `text` 的字符数（按 UTF-16 单元近似 GitHub 的字符口径） */
    chars: number;
    fromFile: boolean;
    /** 文件来源时解析后的绝对路径（仅用于回执与错误诊断） */
    file?: string;
}
export interface BodySourceOptions {
    /** 相对路径的解析基准（工具层传 `executor.resolveExecScope` 得到的工作区） */
    cwd: string;
    /** 内联 flag，缺省 `--body`（discussion 用 `-b`） */
    flag?: string;
    /** 文件 flag，缺省 `--body-file`（release 用 `--notes-file`，api/agent-task 用各自 flag） */
    fileFlag?: string;
    /** 内联字段名，仅用于错误文案（缺省 `body`） */
    inlineField?: string;
    /** 文件字段名，仅用于错误文案（缺省 `body_file`） */
    fileField?: string;
    /** 无正文时仍下发 `[flag, '']`：create 需要它保持非交互（否则 gh 会打开编辑器） */
    keepEmptyInline?: boolean;
    /** 字符上限覆盖；传 0 关闭字符校验（`gh api --input` 的请求体不受正文口径约束） */
    maxChars?: number;
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
export declare function resolveBodySource(input: {
    inline?: unknown;
    file?: unknown;
}, options?: BodySourceOptions): BodySource;
