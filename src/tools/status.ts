import type { GhExecutor } from '../executor.js';
import { renderStatusMarkdown, parseStatusOutput } from '../renderers/markdown.js';
import { TelemetryCollector, defaultTelemetryCollector } from '../telemetry.js';

export function createStatusTool(executor: GhExecutor, telemetryCollector?: TelemetryCollector) {
  return {
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
        return [{ type: 'text', text: renderStatusMarkdown(args, value) }];
      },
    },
    async execute(args: any, execContext: any) {
      if (args?.action === 'health') {
        const collector = telemetryCollector || defaultTelemetryCollector;
        return collector.getSummary();
      }

      const cwd = execContext?.cwd || process.cwd();
      const sessionId = execContext?.sessionId || execContext?.session?.id || process.env.DSH_SESSION_ID;

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
  };
}
