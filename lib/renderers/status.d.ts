export interface StatusSectionItem {
    repo?: string;
    number?: string;
    title?: string;
    detail?: string;
    raw: string;
}
export interface ParsedStatusReport {
    assignedIssues: StatusSectionItem[];
    assignedPrs: StatusSectionItem[];
    reviewRequests: StatusSectionItem[];
    mentions: StatusSectionItem[];
    activity: StatusSectionItem[];
    rawText: string;
}
/**
 * 解析 gh status 的输出，提取待办 Issue、待办 PR、评审请求、提及与近期动态
 */
export declare function parseStatusOutput(output: string): ParsedStatusReport;
/**
 * Status 领域渲染器：负责用户跨仓待办大盘的 Markdown 格式化
 */
export declare function renderStatusMarkdown(args: any, value: any): string;
