import type { GhExecutor } from '../executor.js';
import { renderRunMarkdown } from '../renderers/markdown.js';

function normalizeOutput(data: any): Record<string, any> {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(data)) {
    return { items: data, count: data.length };
  }
  return { result: data !== undefined && data !== null ? data : '' };
}

export function createRunTool(executor: GhExecutor) {
  return {
    name: 'github_run',
    description: '排查和诊断 GitHub Actions 工作流构建状态。特别优化了获取失败步骤日志能力（log_failed），专供 Agent 快速定位 CI 报错，并支持手动触发工作流 (trigger)。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'view', 'log_failed', 'rerun', 'cancel', 'trigger'],
          description: 'Actions 操作类型。新增 trigger (主动触发 workflow_dispatch)。',
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
        branch: {
          type: 'string',
          description: '按分支筛选运行记录（list 动作使用，例如 "main" 或当前分支）。',
        },
        status: {
          type: 'string',
          enum: ['queued', 'completed', 'in_progress', 'failure', 'success'],
          description: '按状态筛选运行记录（list 动作使用，排查报错推荐 failure）。',
        },
        workflow: {
          type: 'string',
          description: '工作流名称或文件名（trigger 动作使用，例如 "pr-check.yml" 或 "CI"）。',
        },
        ref: {
          type: 'string',
          description: '触发工作流的目标分支或 tag（trigger 动作使用，默认当前工作区分支）。',
        },
        inputs: {
          type: 'object',
          description: '传递给工作流的自定义参数键值对（trigger 动作使用）。',
        },
      },
      required: ['action'],
    },
    output: {
      schema: { type: 'object' },
      render(args: any, value: any) {
        return [{ type: 'text', text: renderRunMarkdown(args, value) }];
      },
    },
    async execute(args: any, execContext: any) {
      const cwd = execContext?.cwd || process.cwd();
      const sessionId = execContext?.sessionId || execContext?.session?.id || process.env.DSH_SESSION_ID;
      let repoTarget = args.repo;
      if (!repoTarget) {
        const meta = await executor.getRepoMetadata(cwd, sessionId);
        if (meta?.nameWithOwner) {
          repoTarget = meta.nameWithOwner;
        }
      }

      if (!repoTarget) {
        throw new Error(
          '未能自动识别当前工作区关联的 GitHub 仓库。请通过 `repo` 参数显式指定目标仓库 [owner/repo]（例如: "ItQianChen/dsh-github-flow"），或在当前工作区目录下关联 Git 远程仓库。'
        );
      }

      const repoArgs = ['-R', repoTarget];
      const runOpts = { cwd, sessionId };

      switch (args.action) {
        case 'list': {
          const listCmd = [
            'run', 'list', ...repoArgs,
            '--json', 'databaseId,name,status,conclusion,event,headBranch,createdAt,url',
            // 显式 limit 优先；缺省回退 executor.defaultListLimit（用户可在插件配置中调整）
            '-L', String(typeof args.limit === 'number' && args.limit > 0 ? args.limit : Math.min(executor.defaultListLimit ?? 10, 50))
          ];
          if (args.branch) {
            listCmd.push('--branch', args.branch);
          }
          if (args.status) {
            listCmd.push('--status', args.status);
          }
          const res = await executor.run(listCmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return normalizeOutput(res.data || res.rawOutput);
        }

        case 'view': {
          if (!args.run_id) throw new Error('view 操作必须提供 run_id');
          const res = await executor.run(
            ['run', 'view', String(args.run_id), ...repoArgs, '--json', 'databaseId,name,status,conclusion,jobs,url'],
            runOpts
          );
          if (!res.ok) throw new Error(res.error);
          return normalizeOutput(res.data || res.rawOutput);
        }

        case 'log_failed': {
          if (!args.run_id) throw new Error('log_failed 操作必须提供 run_id');
          // gh 原生支持仅提取失败的日志！对 Agent 故障诊断价值极高
          const res = await executor.run(['run', 'view', String(args.run_id), ...repoArgs, '--log-failed'], {
            ...runOpts,
            timeoutMs: 60_000,
            rawText: true,
          });
          if (!res.ok) {
            // 当工作流未失败时，gh 会非零退出提示 "no failed jobs in run"
            const err = String(res.error || '');
            if (err.includes('no failed jobs') || err.includes('not failed')) {
              return { result: `工作流 Run #${args.run_id} 中未检测到任何失败的任务步骤 (状态正常)。` };
            }
            throw new Error(res.error);
          }
          return { result: res.rawOutput || '未找到失败步骤的日志' };
        }

        case 'trigger': {
          if (!args.workflow) throw new Error('trigger 操作必须提供 workflow（工作流名称或文件名，例如 "pr-check.yml"）');
          const trigCmd = ['workflow', 'run', args.workflow, ...repoArgs];
          if (args.ref) {
            trigCmd.push('--ref', args.ref);
          }
          if (args.inputs && typeof args.inputs === 'object') {
            for (const [k, v] of Object.entries(args.inputs)) {
              if (v !== undefined && v !== null) {
                trigCmd.push('-f', `${k}=${String(v)}`);
              }
            }
          }
          const res = await executor.run(trigCmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: `已成功触发工作流「${args.workflow}」运行`, output: res.rawOutput || 'Workflow dispatched' };
        }

        case 'rerun': {
          if (!args.run_id) throw new Error('rerun 操作必须提供 run_id');
          const res = await executor.run(['run', 'rerun', String(args.run_id), ...repoArgs, '--failed'], runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: '已成功重新触发失败任务', output: res.rawOutput };
        }

        case 'cancel': {
          if (!args.run_id) throw new Error('cancel 操作必须提供 run_id');
          const res = await executor.run(['run', 'cancel', String(args.run_id), ...repoArgs], runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: '已取消该工作流任务', output: res.rawOutput };
        }

        default:
          throw new Error(`未知的 Run 操作: ${args.action}`);
      }
    },
  };
}
