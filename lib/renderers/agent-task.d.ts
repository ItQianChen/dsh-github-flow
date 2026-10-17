/**
 * 格式化 Agent Task 状态徽标
 */
export declare function formatAgentTaskStateBadge(state?: string): string;
/**
 * 渲染 Agent Tasks 列表表格
 */
export declare function renderAgentTaskList(items: any[]): string;
/**
 * 渲染单个 Agent Task 详情卡片
 */
export declare function renderAgentTaskView(task: any): string;
/**
 * Agent Task 领域综合渲染入口
 */
export declare function renderAgentTaskMarkdown(args: any, value: any): string;
