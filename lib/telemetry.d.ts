/**
 * DSH GitHub Flow - 运行时遥测审计与降级率收集器
 *
 * 遵循 /dsh-plugin-dev-skill 规范，利用 Cordis 的 tools/result 事件总线
 * 建立内存中固定容量的轻量无锁环形队列，实现零外部数据库依赖、常驻内存严格 <200KB
 * 的工业级运行时可观测性，量化分析 18 大工具矩阵的 API 降级率与健康度指标。
 */
export interface TelemetryRecord {
    id: string;
    timestamp: number;
    toolName: string;
    action?: string;
    durationMs?: number;
    success: boolean;
    degraded: boolean;
    scopeBlocked: boolean;
    confirmBlocked: boolean;
    errorType?: string;
}
export interface ToolUsageStat {
    total: number;
    success: number;
    degraded: number;
    failed: number;
    blocked: number;
}
export interface TelemetrySummary {
    totalCalls: number;
    successCount: number;
    failureCount: number;
    degradedCount: number;
    degradationRate: number;
    scopeBlockedCount: number;
    confirmBlockedCount: number;
    healthScore: number;
    statusLevel: 'EXCELLENT' | 'GOOD' | 'NEEDS_ATTENTION';
    toolStats: Record<string, ToolUsageStat>;
    recommendations: string[];
}
/**
 * 内存固定容量环形队列（无锁、确定性内存上限）
 */
export declare class TelemetryRingBuffer {
    private buffer;
    private readonly capacity;
    constructor(capacity?: number);
    push(record: TelemetryRecord): void;
    getAll(): TelemetryRecord[];
    size(): number;
    clear(): void;
}
/**
 * 遥测收集与健康分析引擎
 */
export declare class TelemetryCollector {
    private ringBuffer;
    private callCounter;
    constructor(capacity?: number);
    /**
     * 记录一次工具调用结果（Fail-Open 保护，绝不阻滞主流程）
     *
     * **两种载荷形状都认**（这是本函数长期读错层级的地方）：
     * - 运行时：宿主 `tools/result` 传的是**归一化后**的 `ToolExecutionResult`
     *   `{ isError, content, value, meta }`（`dsh-tools/src/pipeline.ts:381-425`），
     *   工具的原始返回值在 `value` 里。只读 `result.status` 的话生产环境里
     *   `degraded` / `confirmBlocked` / `success` 全是错的。
     * - 单元测试（`test/phase20`）直接拿**原始载荷**调本函数。
     */
    recordCall(name: string, args: any, result: any, durationMs?: number): void;
    /**
     * 生成工具链健康度与降级率统计大盘
     */
    getSummary(): TelemetrySummary;
    clear(): void;
}
/** 全局单例收集器实例 */
export declare const defaultTelemetryCollector: TelemetryCollector;
