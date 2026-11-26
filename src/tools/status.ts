import type { GhExecutor } from '../executor.js';
import { wrapWithGate } from '../destructive.js';
import { renderStatusMarkdown, parseStatusOutput } from '../renderers/markdown.js';
import { TelemetryCollector, defaultTelemetryCollector } from '../telemetry.js';
import type { AuditStore } from '../audit.js';

/**
 * 把审核统计拼成一行人话（s3）。
 *
 * 全零时不显示这一行：一个从来没触发过审核的用户看到"审核：0 次"只会以为功能坏了，
 * 而事实是"这段时间没有任何写操作需要问"。
 */
function approvalLineOf(store: AuditStore | undefined): string | undefined {
  if (!store) return undefined;
  try {
    const s = store.approvalStats(7);
    if (s.total === 0) return undefined;
    // 「待决」不准确：total 含已批准/已拒绝，另有单独的超时项。说"需人工确认 N 次"才与事实一致。
    const parts = [`需人工确认 ${s.total} 次`, `批准 ${s.approved} / 拒绝 ${s.rejected}`];
    // `no-client` 单独列：它是"根本没有客户端可问"（部署缺陷），不是"用户拒绝"
    if (s.noClient > 0) parts.push(`无客户端 ${s.noClient}`);
    if (s.cancelled > 0) parts.push(`取消 ${s.cancelled}`);
    if (s.pending > 0) parts.push(`超时 ${s.pending}`);
    if (s.avgWaitMs !== null) parts.push(`平均等待 ${(s.avgWaitMs / 1000).toFixed(0)}s`);
    return parts.join(' · ');
  } catch {
    return undefined;
  }
}

export function createStatusTool(executor: GhExecutor, telemetryCollector?: TelemetryCollector, auditStore?: AuditStore) {
  return wrapWithGate({
    name: 'github_status',
    description: '聚合展示当前登录用户的跨仓库全局待办与动态大盘（view），或审计当前工具链运行时健康度、API 降级率与自愈建议（health）。无需指定单仓，账号与系统维度一站式概览。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['view', 'health'],
          description: '操作类型。view 查看个人全局待办与动态看板（默认）、health 查看工具链健康度与 API 降级率审计报表。',
        },
        org: {
          type: 'string',
          description: '组织名称（可选，限定仅汇报指定组织内部的待办与动态）。',
        },
        exclude: {
          type: 'array',
          items: { type: 'string' },
          description: '要排除的仓库名称列表 [owner/repo]（可选，支持排除噪音仓库）。',
        },
      },
    },
    output: {
      schema: { type: 'object' },
      render(args: any, value: any) {
        // 审核行由工具侧算好放进载荷（渲染器是纯函数，不该知道 store 存在）
        return [{ type: 'text', text: renderStatusMarkdown(args, value) }];
      },
    },
    async execute(args: any, execContext: any) {
      if (args?.action === 'health') {
        const collector = telemetryCollector || defaultTelemetryCollector;
        const summary = collector.getSummary();
        /*
         * 审核行**附加在载荷上**而不是塞进 TelemetrySummary。
         *
         * 为什么：`TelemetrySummary` 是"工具链健康"的数据契约，往里加人机协作字段
         * 会让所有消费方（渲染器、phase20 断言、未来可能的导出）都要理解一个不属于
         * 它的概念。附加字段只在 health 视图里被渲染器读一次，边界清楚。
         */
        const approvalLine = approvalLineOf(auditStore);
        return approvalLine ? { ...summary, approvalLine } : summary;
      }

      const { cwd, sessionId } = executor.resolveExecScope(execContext);

      const statusCmd = ['status'];
      if (args?.org) {
        statusCmd.push('-o', String(args.org));
      }
      if (args?.exclude && Array.isArray(args.exclude)) {
        for (const ex of args.exclude) {
          statusCmd.push('-e', String(ex));
        }
      }

      const res = await executor.run(statusCmd, { cwd, sessionId, rawText: true });
      if (!res.ok) throw new Error(res.error);
      const parsed = parseStatusOutput(res.rawOutput || '');
      return {
        parsed,
        rawText: res.rawOutput || '',
      };
    },
  });
}
