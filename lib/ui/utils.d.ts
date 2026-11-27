/**
 * 面板公共工具函数（纯函数，可被单元测试直接覆盖）
 */
/**
 * 字节 → 人类可读。**只用于展示**：记账与预算判断一律在服务端按字节做
 * （中文 3 字节/字，前端按字符数算会少算 3 倍）。
 *
 * 必须有 KB / B 档：早先「操作记录弹窗」与「设置页」各写了一份 MB-only 的实现，
 * 10 KB 的用量显示成 `0.0 MB`——用户看到的是「占用一直是 0，记了也不涨」
 * （2026-11-27 截图实证：26 行 / 10309 B 显示 `0.0 MB`）。
 * 只修了弹窗那一份，设置页继续错；所以这里收敛成**唯一实现**，两处都调它。
 */
export declare function formatBytes(bytes: any): string;
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
