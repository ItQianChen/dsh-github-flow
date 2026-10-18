/**
 * 面板公共工具函数（纯函数，可被单元测试直接覆盖）
 */
export declare function formatRelativeTime(iso: any): string;
export declare function rollupCiStatus(checks: any): "pass" | "fail" | "pending" | null;
export declare function reviewDecisionBadge(decision: any): {
    text: string;
    kind: "green" | "red" | "yellow";
} | null;
export declare function eventLabel(event: any): string;
export interface FetchRetryConfig {
    maxRetries?: number;
    baseDelayMs?: number;
    onRetry?: (attempt: number, delayMs: number, reason: string) => void;
    signal?: AbortSignal;
}
/**
 * 带有阶梯退避重试（Backoff Retry）的通用异步拉取函数
 *
 * 核心设计理由与约束：
 * 1. 应对代理节点不稳定、TLS 握手卡顿、短时网络抖动（半秒至两秒微断流）；
 * 2. 阶梯退避时序：第 1 次失败等 1s (1000ms)，第 2 次等 2s (2000ms)，第 3 次等 4s (4000ms)，附加 0~200ms Jitter；
 * 3. 智能区分软硬错误：401/403/404/400 确定性错误坚决不重试，仅在网络超时、不可达、或带有 networkError 时重试；
 * 4. 严格响应外部 AbortSignal，组件卸载或用户手动打断时立即退出等待，绝无内存泄漏。
 */
export declare function fetchWithRetry(url: string, options?: RequestInit, config?: FetchRetryConfig): Promise<{
    res: Response;
    json: any;
}>;
export interface GitStatItem {
    path: string;
    total: number;
    additions: number;
    deletions: number;
    isBinary: boolean;
    rawRight?: string;
}
export declare function parseGitStatText(statText: string): {
    files: GitStatItem[];
    summary: {
        filesChanged: number;
        insertions: number;
        deletions: number;
    } | null;
} | null;
