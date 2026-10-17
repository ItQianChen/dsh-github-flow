/**
 * Skill 领域渲染器：负责 Agent Skills 跨仓检索结果、已安装列表与预览说明
 */
export declare function renderSkillMarkdown(args: any, value: any): string;
export interface SkillDiagnosticItem {
    type: 'error' | 'warning' | 'fixed';
    skillName: string;
    message: string;
}
export interface SkillPublishReport {
    mode: 'dry-run' | 'fix' | 'publish';
    success: boolean;
    directory?: string;
    items: SkillDiagnosticItem[];
    repoWarnings: string[];
    summary: string;
    tag?: string;
    rawText?: string;
}
/**
 * 解析 gh skill publish 命令输出的 TSV 诊断行与状态汇总
 *
 * 核心设计理由与约束：
 * 1. gh skill publish 命令无论成功还是失败，均采用制表符 `\t` 分隔的 TSV 纯文本行输出；
 * 2. 诊断行格式：`error\t<skill>\t<msg>`、`warning\t<skill>\t<msg>`、`fixed\t<skill>\t<msg>` 或 `warning\t\t<repo_rule>`；
 * 3. 校验失败时 exitCode 为 1，但其 stdout 中携带精准的错误项列表，需提取后结构化呈现，绝不能当作盲目异常吞没；
 * 4. 若未匹配到有效技能或遇到无技能目录，从 stderr 提取根因提示。
 */
export declare function parseSkillPublishOutput(rawStdout: string, rawStderr: string, exitOk: boolean, mode: 'dry-run' | 'fix' | 'publish', directory?: string, tag?: string): SkillPublishReport;
/**
 * Skill Publish 结构化 Markdown 渲染器
 * 将体检报告、自动修复明细与正式发布结果转化为紧凑、清晰的表格与指引
 */
export declare function renderSkillPublishMarkdown(report: SkillPublishReport): string;
