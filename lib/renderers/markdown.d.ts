/**
 * DSH GitHub Flow - Native Markdown 格式化渲染引擎
 *
 * 核心目标：
 * 1. 终结机械多行 JSON 输出，为列表和详情产出高密度 Markdown 表格与卡片；
 * 2. 节省 70%+ 的会话上下文 Token，极大加速长对话推理速度；
 * 3. 嵌入可点击超链接与直观的状态药丸 Emoji，提升人类与模型阅读体验；
 * 4. 严谨防御 Markdown 表格竖线破坏、缺失值回退与异常对象降级。
 */
/** 安全清洗表格单元格文本：转义竖线，压缩换行，限制最大长度 */
export declare function sanitizeCell(text: any, maxLen?: number): string;
/** 格式化 PR / Issue 状态药丸徽章 */
export declare function formatStateBadge(state?: string, isDraft?: boolean): string;
/** 格式化 CI 工作流状态徽章 */
export declare function formatCiBadge(status?: string, conclusion?: string): string;
/** 格式化合并冲突状态 */
export declare function formatConflictBadge(status?: string): string;
export declare function renderPrMarkdown(args: any, value: any): string;
export declare function renderIssueMarkdown(args: any, value: any): string;
export declare function renderRunMarkdown(args: any, value: any): string;
export declare function renderRepoMarkdown(args: any, value: any): string;
