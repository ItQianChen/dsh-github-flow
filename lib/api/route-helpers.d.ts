import type { IssueCategory, IssueStats } from '../types.js';
/**
 * 依据当前登录账号判定 Issue 的归属身份维度 (可多选):
 * - reported: 用户提起的 (属于当前账号名下仓库，但作者不是本人)
 * - assigned: 被分配的 (指派列表中包含当前账号)
 * - created: 我创建的 (作者是当前账号)
 *
 * 为什么这样划分：
 * 在真实工程实践中，Maintainer 不仅要关注自己创建的任务，更要对社区/用户提交的 Bug 反馈负责，
 * 同时还要处理他人指派的待办任务。这三个维度互补且可能重叠。
 */
export declare function resolveIssueCategories(issue: {
    author?: {
        login?: string;
    } | null;
    assignees?: Array<{
        login?: string;
    }> | null;
    repository?: {
        nameWithOwner?: string;
    } | null;
}, currentUser?: string, explicitRepoOwner?: string): IssueCategory[];
export declare function calculateIssueStats(issues: Array<{
    categories?: IssueCategory[];
}>): IssueStats;
/** path.basename 在空串/异常输入上会抛错，工作区路径来自磁盘文件，必须防御 */
export declare function basenameSafe(p: string): string;
/**
 * 由用户配置推导全局驾驶舱的缓存时长。
 * 抽成导出的纯函数：TTL 的推导规则是测试断言的对象，埋在闭包里就只能靠猜。
 */
export declare function globalCacheTtlMs(cacheTtlMs: number): number;
/** open_browser 只允许 http/https，杜绝 file:// 与自定义协议被当作打开目标 */
export declare function isSafeExternalUrl(raw: unknown): raw is string;
/** JSON 响应统一出口：no-store 防代理/浏览器缓存干扰面板数据新鲜度语义 */
export declare function sendJson(res: any, status: number, data: any): void;
/**
 * 读取并解析请求 JSON body（带默认 256KB 上限防护）。
 * 集中处理超限/畸形 JSON 的错误语义，避免每个 handler 复制流收集样板。
 */
export declare function readJsonBody(req: any, maxBytes?: number): Promise<any>;
/**
 * 本地 HTTP 写端点的跨站门禁。
 *
 * 威胁模型：任意网页可以用 simple request（`Content-Type: text/plain`，不触发预检）
 * 向 `127.0.0.1:<port>` 发 POST，触发 `create_pr` / `switch_branch` / 一键升级这类写操作。
 * 两道门：
 *   1) `Origin` 必须为空（同源导航或非浏览器客户端）或与 `Host` 同源；
 *   2) 需要读 JSON body 的端点额外要求 `Content-Type: application/json`——它不在
 *      simple request 白名单里，浏览器会强制先发预检，跨站站点伪造不过去。
 *
 * 为什么允许 Origin 为空：同源 fetch 在部分场景下不带 Origin，非浏览器客户端
 * （curl / 脚本）也不带。这两类不构成跨站威胁，拦掉只会误伤自家前端。
 */
export declare function guardLocalWrite(req: any, res: any, opts?: {
    requireJson?: boolean;
}): boolean;
/** 各路由分组共享的依赖包类型：注册器装配时一次性注入，分组内不再触碰全局 */
export interface RouteDeps {
    bindRoute: (route: any) => void;
    sendJson: typeof sendJson;
    readJsonBody: typeof readJsonBody;
}
