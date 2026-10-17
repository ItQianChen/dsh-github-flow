/**
 * 格式化 Discussion 状态徽标
 */
export declare function formatDiscussionStateBadge(state?: string, answered?: boolean): string;
/**
 * 渲染 Discussion 列表表格
 */
export declare function renderDiscussionList(items: any[]): string;
/**
 * 渲染单个 Discussion 详情卡片
 */
export declare function renderDiscussionView(d: any): string;
/**
 * Discussion 领域综合渲染入口
 */
export declare function renderDiscussionMarkdown(args: any, value: any): string;
