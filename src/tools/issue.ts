import type { GhExecutor } from '../executor.js';

function normalizeOutput(data: any): Record<string, any> {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(data)) {
    return { items: data, count: data.length };
  }
  return { result: data !== undefined && data !== null ? data : '' };
}

export function createIssueTool(executor: GhExecutor) {
  return {
    name: 'github_issue',
    description: '管理 GitHub Issues。支持查看 Issue 列表、详情、创建新 Issue、追加评论以及关闭 Issue。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'view', 'create', 'comment', 'close', 'reopen'],
          description: 'Issue 操作类型。',
        },
        issue_number: {
          type: 'number',
          description: 'Issue 编号（view, comment, close, reopen 时使用）。',
        },
        repo: {
          type: 'string',
          description: '目标仓库 [owner/repo]，留空则识别当前仓库。',
        },
        title: {
          type: 'string',
          description: 'Issue 标题（create 时使用）。',
        },
        body: {
          type: 'string',
          description: 'Issue 描述正文或追加评论内容。',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: '标签名称列表。',
        },
        assignees: {
          type: 'array',
          items: { type: 'string' },
          description: '被指派人的 GitHub 登录名列表。',
        },
      },
      required: ['action'],
    },
    output: {
      schema: { type: 'object' },
      render(args: any, value: any) {
        if (!value) return [{ type: 'text', text: '无返回内容' }];
        if (typeof value.result === 'string') {
          return [{ type: 'text', text: value.result }];
        }
        if (Array.isArray(value.items)) {
          return [{ type: 'text', text: JSON.stringify(value.items, null, 2) }];
        }
        return [{ type: 'text', text: JSON.stringify(value, null, 2) }];
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
          const res = await executor.run(
            ['issue', 'list', ...repoArgs, '--json', 'number,title,state,author,labels,updatedAt', '-L', '20'],
            runOpts
          );
          if (!res.ok) throw new Error(res.error);
          return normalizeOutput(res.data || res.rawOutput);
        }

        case 'view': {
          if (!args.issue_number) throw new Error('view 操作必须提供 issue_number');
          const res = await executor.run(
            ['issue', 'view', String(args.issue_number), ...repoArgs, '--json', 'number,title,body,state,author,labels,assignees,comments,url'],
            runOpts
          );
          if (!res.ok) throw new Error(res.error);
          return normalizeOutput(res.data || res.rawOutput);
        }

        case 'create': {
          const cmd = ['issue', 'create', ...repoArgs, '--title', args.title || '', '--body', args.body || ''];
          if (args.labels && Array.isArray(args.labels) && args.labels.length > 0) {
            cmd.push('--label', args.labels.join(','));
          }
          if (args.assignees && Array.isArray(args.assignees) && args.assignees.length > 0) {
            cmd.push('--assignee', args.assignees.join(','));
          }
          const res = await executor.run(cmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: 'Issue 创建成功', url: res.rawOutput };
        }

        case 'comment': {
          if (!args.issue_number || !args.body) throw new Error('comment 必须提供 issue_number 和 body');
          const res = await executor.run(['issue', 'comment', String(args.issue_number), ...repoArgs, '--body', args.body], runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: '评论发布成功', output: res.rawOutput };
        }

        case 'close': {
          if (!args.issue_number) throw new Error('close 操作必须提供 issue_number');
          const res = await executor.run(['issue', 'close', String(args.issue_number), ...repoArgs], runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: `Issue #${args.issue_number} 已成功关闭` };
        }

        case 'reopen': {
          if (!args.issue_number) throw new Error('reopen 操作必须提供 issue_number');
          const res = await executor.run(['issue', 'reopen', String(args.issue_number), ...repoArgs], runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: `Issue #${args.issue_number} 已重新开启` };
        }

        default:
          throw new Error(`未知的 Issue 操作: ${args.action}`);
      }
    },
  };
}
