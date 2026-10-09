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

export function createPrTool(executor: GhExecutor) {
  return {
    name: 'github_pr',
    description: '管理与审查 GitHub Pull Request (PR)。支持查看列表、详情、差异比对、CI 检查状态、代码审查与合并操作。默认针对当前工作区关联的仓库。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'view', 'create', 'diff', 'checks', 'review', 'merge'],
          description: 'PR 操作类型。',
        },
        pr_number: {
          type: 'number',
          description: 'PR 编号（view, diff, checks, review, merge 时使用；若在 PR 对应分支可不填，自动识别当前分支 PR）。',
        },
        repo: {
          type: 'string',
          description: '目标仓库 [owner/repo]，留空则自动识别当前本地 Git 仓库。',
        },
        title: {
          type: 'string',
          description: '创建 PR 时的标题。',
        },
        body: {
          type: 'string',
          description: '创建 PR 或提交 Review 时的内容描述。',
        },
        base: {
          type: 'string',
          description: '目标基准分支（默认主分支，如 main）。',
        },
        head: {
          type: 'string',
          description: '源分支，跨 fork 提 PR 时必填，格式 forkOwner:branch（如 ItQianChen:fix-bug）；同仓库分支可直接写分支名。',
        },
        draft: {
          type: 'boolean',
          description: '是否创建为草稿 PR。',
        },
        review_decision: {
          type: 'string',
          enum: ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'],
          description: '代码审查意见判定（review 操作时使用）。',
        },
        merge_method: {
          type: 'string',
          enum: ['merge', 'squash', 'rebase'],
          description: '合并策略（merge 操作时使用，默认 squash）。',
        },
        delete_branch: {
          type: 'boolean',
          description: '合并后是否删除源分支（merge 操作时使用，默认 false）。删除分支不可撤销，只在确认该分支已无用后再开启。',
        },
        dry_run: {
          type: 'boolean',
          description: '是否只预演不真正创建（create 操作时使用，默认 false）。透传 gh --dry-run：打印将要创建的 PR 详情而不落库，用于提交前确认 head/base/title 是否正确。',
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
            ['pr', 'list', ...repoArgs, '--json', 'number,title,author,headRefName,isDraft,state,updatedAt', '-L', '20'],
            runOpts
          );
          if (!res.ok) throw new Error(res.error);
          return normalizeOutput(res.data || res.rawOutput);
        }

        case 'view': {
          const target = args.pr_number ? [String(args.pr_number)] : [];
          const res = await executor.run(
            ['pr', 'view', ...target, ...repoArgs, '--json', 'number,title,body,state,author,labels,assignees,reviewDecision,mergeable,statusCheckRollup,url'],
            runOpts
          );
          if (!res.ok) throw new Error(res.error);
          return normalizeOutput(res.data || res.rawOutput);
        }

        case 'checks': {
          const target = args.pr_number ? [String(args.pr_number)] : [];
          const res = await executor.run(
            ['pr', 'checks', ...target, ...repoArgs, '--json', 'name,state,conclusion,detailsUrl'],
            runOpts
          );
          if (!res.ok) throw new Error(res.error);
          return normalizeOutput(res.data || res.rawOutput);
        }

        case 'diff': {
          const target = args.pr_number ? [String(args.pr_number)] : [];
          const res = await executor.run(['pr', 'diff', ...target, ...repoArgs], runOpts);
          if (!res.ok) throw new Error(res.error);
          return { result: res.rawOutput || '无差异内容' };
        }

        case 'create': {
          const createCmd = ['pr', 'create', ...repoArgs, '--title', args.title || '', '--body', args.body || ''];
          if (args.base) createCmd.push('--base', args.base);
          // 跨 fork 提 PR 必须显式给出 --head（形如 forkOwner:branch）。
          // 为什么不能省：当 -R 指向的仓库不是当前 origin 时，gh 无法推断拿哪个分支开 PR，
          // 会逐级回退去问本地 git，最终报出与真实原因无关的 "not a git repository"。
          if (args.head) createCmd.push('--head', args.head);
          if (args.draft) createCmd.push('--draft');
          const dryRun = args.dry_run === true;
          if (dryRun) createCmd.push('--dry-run');
          const res = await executor.run(createCmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return dryRun
            ? { message: 'PR 预演完成（未真正创建）', detail: res.rawOutput }
            : { message: 'PR 创建成功', url: res.rawOutput };
        }

        case 'review': {
          if (!args.pr_number) throw new Error('review 操作必须提供 pr_number');
          const reviewCmd = ['pr', 'review', String(args.pr_number), ...repoArgs];
          if (args.review_decision === 'APPROVE') reviewCmd.push('--approve');
          else if (args.review_decision === 'REQUEST_CHANGES') reviewCmd.push('--request-changes');
          else reviewCmd.push('--comment');
          if (args.body) reviewCmd.push('--body', args.body);
          const res = await executor.run(reviewCmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: 'Review 提交成功', detail: res.rawOutput };
        }

        case 'merge': {
          if (!args.pr_number) throw new Error('merge 操作必须提供 pr_number');
          const method = args.merge_method === 'merge' ? '--merge' : (args.merge_method === 'rebase' ? '--rebase' : '--squash');
          const mergeCmd = ['pr', 'merge', String(args.pr_number), ...repoArgs, method];
          // 删分支默认关闭：合并他人仓库的 PR 时删掉源分支是不可撤销的破坏性动作，
          // 而 gh 默认不删。替用户做掉它违背「可撤销的直接做、不可撤销的先问」。
          if (args.delete_branch === true) mergeCmd.push('--delete-branch');
          const res = await executor.run(mergeCmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: 'PR 合并完成', output: res.rawOutput };
        }

        default:
          throw new Error(`未知的 PR 操作: ${args.action}`);
      }
    },
  };
}
