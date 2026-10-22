/** 安全清洗表格单元格文本：转义竖线，压缩换行，限制最大长度 */
export declare function sanitizeCell(text: any, maxLen?: number): string;
/** 格式化 PR / Issue 状态药丸徽章 */
export declare function formatStateBadge(state?: string, isDraft?: boolean): string;
/**
 * 格式化 CI 工作流状态徽章。
 * 第二参数按调用域语义不同：run 域传 conclusion（success/failure/cancelled/skipped），
 * pr checks 域传 bucket（pass/fail/pending/skipping/cancel）——取值族不同但映射到
 * 同一组徽章；state 参数兜底（in_progress/queued 等进行中态）。
 */
export declare function formatCiBadge(status?: string, conclusion?: string): string;
/** 格式化合并冲突状态 */
export declare function formatConflictBadge(status?: string): string;
/** 格式化 Release 状态徽章 */
export declare function formatReleaseBadge(isDraft?: boolean, isPrerelease?: boolean): string;
/**
 * 降级链路可见标注（runGuarded 契约的渲染兑现）。
 * 为什么必须可见：降级若是静默的，Agent 就无法感知能力边界（同一 action 在
 * 不同 gh 版本上走不同链路）；一条 blockquote 注释成本一行，换链路透明。
 */
export declare function appendDegradedNote(value: any): string;
