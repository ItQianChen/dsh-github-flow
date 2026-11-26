/**
 * DSH GitHub Flow - 运行时遥测审计与降级率收集器
 *
 * 遵循 /dsh-plugin-dev-skill 规范，利用 Cordis 的 tools/result 事件总线
 * 建立内存中固定容量的轻量无锁环形队列，实现零外部数据库依赖、常驻内存严格 <200KB
 * 的工业级运行时可观测性，量化分析 18 大工具矩阵的 API 降级率与健康度指标。
 */
/**
 * 内存固定容量环形队列（无锁、确定性内存上限）
 */
export class TelemetryRingBuffer {
    buffer = [];
    capacity;
    constructor(capacity = 200) {
        this.capacity = Math.max(1, capacity);
    }
    push(record) {
        if (this.buffer.length >= this.capacity) {
            this.buffer.shift(); // 先进先出丢弃最旧的一条
        }
        this.buffer.push(record);
    }
    getAll() {
        return [...this.buffer];
    }
    size() {
        return this.buffer.length;
    }
    clear() {
        this.buffer = [];
    }
}
/**
 * 遥测收集与健康分析引擎
 */
export class TelemetryCollector {
    ringBuffer;
    callCounter = 0;
    constructor(capacity = 200) {
        this.ringBuffer = new TelemetryRingBuffer(capacity);
    }
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
    recordCall(name, args, result, durationMs) {
        try {
            if (!name || typeof name !== 'string')
                return;
            this.callCounter++;
            // 归一化：有 isError 字段即视为宿主包装形状
            const wrapped = Boolean(result) && typeof result === 'object' && 'isError' in result;
            const payload = wrapped ? result.value : result;
            const wrappedError = wrapped ? result.error : undefined;
            const action = typeof args?.action === 'string' ? args.action : undefined;
            const isScopeBlocked = payload?.status === 'SCOPE_REQUIRED';
            const isConfirmBlocked = payload?.status === 'AWAITING_CONFIRMATION';
            const isBlocked = isScopeBlocked || isConfirmBlocked;
            const isDegraded = payload?.degraded === true || payload?.data?.degraded === true;
            const isFailed = !isBlocked &&
                (wrappedError !== undefined ||
                    payload?.ok === false ||
                    payload?.success === false ||
                    !!payload?.error);
            /*
             * 「用户拒绝审核」的识别。
             *
             * 审核闸门返回 `{ kind:'deny', info:{ code:'APPROVAL_REJECTED' } }`，宿主把它转成
             * 工具错误结果，因此这里从 error 的 code / message 上认。用正则而不是全等，是因为
             * 不同链路（包装形状 / 原始载荷）落到 errorType 的字段不完全一致。
             */
            const rawErrorCode = String(wrappedError?.info?.code || '');
            const rawErrorText = String(wrappedError?.message || payload?.error || '');
            const isUserRejected = isFailed && /APPROVAL_REJECTED|用户拒绝/.test(rawErrorCode + ' ' + rawErrorText);
            const record = {
                id: `t_${Date.now()}_${this.callCounter}`,
                timestamp: Date.now(),
                toolName: name,
                action,
                durationMs: typeof durationMs === 'number' && durationMs >= 0 ? durationMs : undefined,
                // 拒绝既不算成功也不算失败：success=false 保留（没成功就是没成功），
                // 但下游统计会靠 userRejected 把它从失败里摘出去。
                success: !isFailed && !isBlocked,
                degraded: isDegraded,
                scopeBlocked: isScopeBlocked,
                confirmBlocked: isConfirmBlocked,
                userRejected: isUserRejected,
                errorType: isUserRejected
                    ? 'APPROVAL_REJECTED'
                    : (isFailed
                        ? String(rawErrorCode || rawErrorText || 'UNKNOWN_ERROR').slice(0, 50)
                        : undefined),
            };
            this.ringBuffer.push(record);
        }
        catch {
            // 遥测打点非阻塞隔离：严禁将任何收集器内部异常外溢给调用方
        }
    }
    /**
     * 生成工具链健康度与降级率统计大盘
     */
    getSummary() {
        const records = this.ringBuffer.getAll();
        const totalCalls = records.length;
        let successCount = 0;
        let failureCount = 0;
        let rejectedCount = 0;
        let degradedCount = 0;
        let scopeBlockedCount = 0;
        let confirmBlockedCount = 0;
        const toolStats = {};
        for (const r of records) {
            if (!toolStats[r.toolName]) {
                toolStats[r.toolName] = { total: 0, success: 0, degraded: 0, failed: 0, blocked: 0, rejected: 0 };
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
            }
            else if (r.userRejected) {
                // 用户拒绝：单独计数，**不计入失败**（人的决定 ≠ 工具链故障）
                rejectedCount++;
                stat.rejected = (stat.rejected || 0) + 1;
            }
            else if (!r.scopeBlocked && !r.confirmBlocked) {
                failureCount++;
                stat.failed++;
            }
        }
        /*
         * 健康分的**分母要排除用户拒绝**。
         *
         * 只把 rejected 从 failureCount 里摘掉还不够：它仍留在 totalCalls 里，
         * 于是 failureRate 的分母被撑大、成功率被拉低。一个认真逐条审核的用户
         * 会看到健康分一路掉——那不是工具链的信号，是他自己的行为。
         */
        const effectiveTotal = Math.max(0, totalCalls - rejectedCount);
        const degradationRate = totalCalls > 0 ? Number(((degradedCount / totalCalls) * 100).toFixed(1)) : 0;
        const failureRate = effectiveTotal > 0 ? (failureCount / effectiveTotal) * 100 : 0;
        // 健康分计算算法：基准 100 分，按降级率（权重 0.4）与失败率（权重 0.5）综合惩罚
        let healthScore = 100;
        if (effectiveTotal > 0) {
            const penalty = degradationRate * 0.4 + failureRate * 0.5;
            healthScore = Math.max(0, Math.round(100 - penalty));
        }
        let statusLevel = 'EXCELLENT';
        if (healthScore < 70) {
            statusLevel = 'NEEDS_ATTENTION';
        }
        else if (healthScore < 90) {
            statusLevel = 'GOOD';
        }
        // 智能自愈建议推导
        const recommendations = [];
        if (toolStats['github_repo'] && toolStats['github_repo'].degraded > 0) {
            recommendations.push('发现 github_repo 文件读取触发了 API 降级链路，建议将 GitHub CLI 升级至 2.95.0+ 以启用原生免克隆极速读取。');
        }
        if (scopeBlockedCount > 0) {
            recommendations.push('发现因缺少 OAuth Scope 导致调用拦截，请在终端执行相应的 `gh auth refresh -s <scope>` 补全授权。');
        }
        if (degradationRate > 20) {
            recommendations.push('当前工具链整体 API 降级率较高，可能当前宿主 CLI 版本过低，建议运行 `/gh upgrade` 检查升级。');
        }
        /*
         * 真有失败时必须说出来。
         *
         * 早先这里只看降级率，于是一屏里会同时出现「健康分 67 / 需关注」和
         * 「运行状态极佳」——两个结论互相打脸。健康分被扣了，就必须给出扣分的原因；
         * 而被用户拒绝的那部分已经排除在失败之外，能走到这里的都是真失败。
         */
        if (failureCount > 0) {
            recommendations.push(`最近有 ${failureCount} 次调用真实失败（不含用户拒绝审核），请用 \`github_status(action:'health')\` 查看工具分布，或检查 gh 登录态与网络。`);
        }
        if (rejectedCount > 0) {
            recommendations.push(`另有 ${rejectedCount} 次调用因你拒绝审核而未执行——这是正常操作，已从健康分中排除；想减少打断可在设置里调整审核档位或写放行规则。`);
        }
        if (recommendations.length === 0) {
            recommendations.push('工具链运行状态极佳，所有调用均走原生高速通道，无降级与权限阻断。');
        }
        return {
            totalCalls,
            successCount,
            failureCount,
            rejectedCount,
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
    clear() {
        this.ringBuffer.clear();
    }
}
/** 全局单例收集器实例 */
export const defaultTelemetryCollector = new TelemetryCollector(200);
