/**
 * 格式化 Codespace 状态徽标
 */
export declare function formatCodespaceStateBadge(state?: string): string;
/**
 * 渲染 Codespaces 列表表格
 */
export declare function renderCodespaceList(items: any[]): string;
/**
 * 渲染单个 Codespace 详情卡片
 */
export declare function renderCodespaceView(cs: any): string;
/**
 * Codespace 领域综合渲染入口
 */
export declare function renderCodespaceMarkdown(args: any, value: any): string;
