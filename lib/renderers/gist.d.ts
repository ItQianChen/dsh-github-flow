export interface ParsedGistSummary {
    id: string;
    description: string;
    filesCount: string;
    visibility: string;
    updatedAt: string;
}
/**
 * 解析 gh gist list 的制表符/多列纯文本输出
 */
export declare function parseGistListOutput(output: string): ParsedGistSummary[];
/**
 * Gist 领域渲染器：负责 GitHub Gist 列表、代码正文、创建/删除反馈的 Markdown 格式化
 */
export declare function renderGistMarkdown(args: any, value: any): string;
