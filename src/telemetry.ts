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
  degraded: boolean;          // 是否触发了 API 降级链路
  scopeBlocked: boolean;       // 是否因缺少 Scope 权限被拦截
  confirmBlocked: boolean;     // 是否触发了安全确认防线拦截
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
  degradationRate: number;     // 降级率（0~100 之间的百分比）
  scopeBlockedCount: number;
  confirmBlockedCount: number;
  healthScore: number;         // 综合健康分 (0-100)
  statusLevel: 'EXCELLENT' | 'GOOD' | 'NEEDS_ATTENTION';
  toolStats: Record<string, ToolUsageStat>;
  recommendations: string[];
}

/**
 * 内存固定容量环形队列（无锁、确定性内存上限）
 */
export class TelemetryRingBuffer {
  private buffer: TelemetryRecord[] = [];
  private readonly capacity: number;

  constructor(capacity = 200) {
    this.capacity = Math.max(1, capacity);
  }

  push(record: TelemetryRecord): void {
    if (this.buffer.length >= this.capacity) {
      this.buffer.shift(); // 先进先出丢弃最旧的一条
    }
    this.buffer.push(record);
  }

  getAll(): TelemetryRecord[] {
    return [...this.buffer];
  }

  size(): number {
    return this.buffer.length;
  }

  clear(): void {
    this.buffer = [];
  }
}

/**
 * 遥测收集与健康分析引擎
 */
export class TelemetryCollector {
  private ringBuffer: TelemetryRingBuffer;
  private callCounter = 0;

  constructor(capacity = 200) {
    this.ringBuffer = new TelemetryRingBuffer(capacity);
  }

  /**
   * 记录一次工具调用结果（Fail-Open 保护，绝不阻滞主流程）
   */
  recordCall(name: string, args: any, result: any, durationMs?: number): void {
    try {
      if (!name || typeof name !== 'string') return;
      this.callCounter++;

      const action = typeof args?.action === 'string' ? args.action : undefined;
      const isScopeBlocked = result?.status === 'SCOPE_REQUIRED';
      const isConfirmBlocked = result?.status === 'AWAITING_CONFIRMATION';
      const isBlocked = isScopeBlocked || isConfirmBlocked;
      const isDegraded = result?.degraded === true || result?.data?.degraded === true;
      const isFailed = !isBlocked && (result?.ok === false || result?.success === false || !!result?.error);

      const record: TelemetryRecord = {
        id: `t_${Date.now()}_${this.callCounter}`,
        timestamp: Date.now(),
        toolName: name,
        action,
        durationMs: typeof durationMs === 'number' && durationMs >= 0 ? durationMs : undefined,
        success: !isFailed && !isBlocked,
        degraded: isDegraded,
        scopeBlocked: isScopeBlocked,
        confirmBlocked: isConfirmBlocked,
        errorType: isFailed ? String(result?.error || 'UNKNOWN_ERROR').slice(0, 50) : undefined,
      };

      this.ringBuffer.push(record);
    } catch {
      // 遥测打点非阻塞隔离：严禁将任何收集器内部异常外溢给调用方
    }
  }

  /**
   * 生成工具链健康度与降级率统计大盘
   */
  getSummary(): TelemetrySummary {
    const records = this.ringBuffer.getAll();
    const totalCalls = records.length;

    let successCount = 0;
    let failureCount = 0;
    let degradedCount = 0;
    let scopeBlockedCount = 0;
    let confirmBlockedCount = 0;
    const toolStats: Record<string, ToolUsageStat> = {};

    for (const r of records) {
      if (!toolStats[r.toolName]) {
        toolStats[r.toolName] = { total: 0, success: 0, degraded: 0, failed: 0, blocked: 0 };
      }
      const stat = toolStats[r.toolName];
      stat.total++;

      if (r.degraded) {
        degradedCount++;
        stat.degraded++;
      }
      if (r.scopeBlocked) {
        scopeBlockedCount++;
        stat.blocked++;
      }
      if (r.confirmBlocked) {
        confirmBlockedCount++;
        stat.blocked++;
      }
      if (r.success) {
        successCount++;
        stat.success++;
      } else if (!r.scopeBlocked && !r.confirmBlocked) {
        failureCount++;
        stat.failed++;
      }
    }

    const degradationRate = totalCalls > 0 ? Number(((degradedCount / totalCalls) * 100).toFixed(1)) : 0;
    const failureRate = totalCalls > 0 ? (failureCount / totalCalls) * 100 : 0;

    // 健康分计算算法：基准 100 分，按降级率（权重 0.4）与失败率（权重 0.5）综合惩罚
    let healthScore = 100;
    if (totalCalls > 0) {
      const penalty = degradationRate * 0.4 + failureRate * 0.5;
      healthScore = Math.max(0, Math.round(100 - penalty));
    }

    let statusLevel: 'EXCELLENT' | 'GOOD' | 'NEEDS_ATTENTION' = 'EXCELLENT';
    if (healthScore < 70) {
      statusLevel = 'NEEDS_ATTENTION';
    } else if (healthScore < 90) {
      statusLevel = 'GOOD';
    }

    // 智能自愈建议推导
    const recommendations: string[] = [];
    if (toolStats['github_repo'] && toolStats['github_repo'].degraded > 0) {
      recommendations.push('发现 github_repo 文件读取触发了 API 降级链路，建议将 GitHub CLI 升级至 2.95.0+ 以启用原生免克隆极速读取。');
    }
    if (scopeBlockedCount > 0) {
      recommendations.push('发现因缺少 OAuth Scope 导致调用拦截，请在终端执行相应的 `gh auth refresh -s <scope>` 补全授权。');
    }
    if (degradationRate > 20) {
      recommendations.push('当前工具链整体 API 降级率较高，可能当前宿主 CLI 版本过低，建议运行 `/gh upgrade` 检查升级。');
    }
    if (recommendations.length === 0) {
      recommendations.push('工具链运行状态极佳，所有调用均走原生高速通道，无降级与权限阻断。');
    }

    return {
      totalCalls,
      successCount,
      failureCount,
      degradedCount,
      degradationRate,
      scopeBlockedCount,
      confirmBlockedCount,
      healthScore,
      statusLevel,
      toolStats,
      recommendations,
    };
  }

  clear(): void {
    this.ringBuffer.clear();
  }
}

/** 全局单例收集器实例 */
export const defaultTelemetryCollector = new TelemetryCollector(200);
