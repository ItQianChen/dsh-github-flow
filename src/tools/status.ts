import type { GhExecutor } from '../executor.js';
import { renderStatusMarkdown, parseStatusOutput } from '../renderers/markdown.js';

export function createStatusTool(executor: GhExecutor) {
  return {
    name: 'github_status',
    description: '聚合展示当前登录用户的跨仓库全局待办与动态大盘：包括指派给我的 Issues、指派给我的 PR、等待我评审的 PR、近期 @提及 以及订阅仓库的最新动态。无需指定单仓，账号维度一站式概览。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['view'],
          description: '操作类型，默认为 view（查看全局待办看板）。',
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
