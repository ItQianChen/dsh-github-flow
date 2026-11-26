import type { TelemetrySummary } from '../telemetry.js';
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
/**
 * 渲染 DSH GitHub 工具链健康度与降级率审计报表
 *
 * `approvalLine`（可选，s3）：人工审核的 7 天汇总。
 *
 * 为什么它由调用方算好传进来、而不是在这里从遥测推导：遥测是"工具链健康"，
 * 审核是"人机协作"——混在一起会让健康分被"用户今天点了很多次拒绝"拉低。
 * **那是用户认真，不是系统有病。** 所以两者数据源分开，只是恰好印在同一页上。
 */
export declare function renderHealthAuditMarkdown(summary: TelemetrySummary, approvalLine?: string): string;
