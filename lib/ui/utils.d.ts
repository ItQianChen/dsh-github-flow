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
