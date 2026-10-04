import type { GhExecutor } from '../executor.js';

export function createRunTool(executor: GhExecutor) {
  return {
    name: 'github_run',
    description: '排查和诊断 GitHub Actions 工作流构建状态。特别优化了获取失败步骤日志能力（log_failed），专供 Agent 快速定位 CI 报错。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'view', 'log_failed', 'rerun', 'cancel'],
          description: 'Actions 操作类型。',
        },
        run_id: {
          type: 'string',
          description: 'Workflow 运行 ID（view, log_failed, rerun, cancel 时使用）。',
        },
        repo: {
          type: 'string',
          description: '目标仓库 [owner/repo]，留空则识别当前仓库。',
        },
        limit: {
          type: 'number',
          description: '列出 runs 的数量，默认 10。',
        },
      },
      required: ['action'],
    },
    output: {
      schema: { type: 'object' },
      render(args: any, value: any) {
        return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }];
      },
    },
    async execute(args: any, execContext: any) {
      const cwd = execContext?.cwd || process.cwd();
      const repoArgs = args.repo ? ['-R', args.repo] : [];

      switch (args.action) {
        case 'list': {
          const res = await executor.run(
            ['run', 'list', ...repoArgs, '--json', 'databaseId,name,status,conclusion,event,headBranch,createdAt', '-L', String(args.limit || 10)],
            { cwd }
          );
          if (!res.ok) throw new Error(res.error);
          return res.data || res.rawOutput;
        }

        case 'view': {
          if (!args.run_id) throw new Error('view 操作必须提供 run_id');
          const res = await executor.run(
            ['run', 'view', String(args.run_id), ...repoArgs, '--json', 'databaseId,name,status,conclusion,jobs,url'],
            { cwd }
          );
          if (!res.ok) throw new Error(res.error);
          return res.data || res.rawOutput;
        }

        case 'log_failed': {
          if (!args.run_id) throw new Error('log_failed 操作必须提供 run_id');
          // gh 原生支持仅提取失败的日志！对 Agent 故障诊断价值极高
          const res = await executor.run(['run', 'view', String(args.run_id), ...repoArgs, '--log-failed'], {
            cwd,
            timeoutMs: 60_000,
            rawText: true,
          });
          if (!res.ok) throw new Error(res.error);
          return res.rawOutput || '未找到失败步骤的日志';
        }

        case 'rerun': {
          if (!args.run_id) throw new Error('rerun 操作必须提供 run_id');
          const res = await executor.run(['run', 'rerun', String(args.run_id), ...repoArgs, '--failed'], { cwd });
          if (!res.ok) throw new Error(res.error);
          return { message: '已成功重新触发失败任务', output: res.rawOutput };
        }

        case 'cancel': {
          if (!args.run_id) throw new Error('cancel 操作必须提供 run_id');
          const res = await executor.run(['run', 'cancel', String(args.run_id), ...repoArgs], { cwd });
          if (!res.ok) throw new Error(res.error);
          return { message: '已取消该工作流任务', output: res.rawOutput };
        }

        default:
          throw new Error(`未知的 Run 操作: ${args.action}`);
      }
    },
  };
}
