import type { GhExecutor } from '../executor.js';
import { wrapWithGate } from '../destructive.js';
import { renderDiscussionMarkdown } from '../renderers/markdown.js';

function normalizeOutput(data: any): Record<string, any> {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(data)) {
    return { items: data, count: data.length };
  }
  return { result: data !== undefined && data !== null ? data : '' };
}

const DISCUSSION_LIST_FIELDS = 'number,title,body,category,author,closed,createdAt,updatedAt,url,labels,answered,stateReason';
const DISCUSSION_VIEW_FIELDS = 'number,title,body,category,author,state,createdAt,updatedAt,url,labels,answered,comments';

export function createDiscussionTool(executor: GhExecutor) {
  return wrapWithGate({
    name: 'github_discussion',
    description: '管理 GitHub Discussions 讨论区：浏览社区讨论、检视讨论详情与回复楼层、发起新讨论议题、编辑现有讨论以及追加评论回复。基于 gh CLI preview 特性。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'view', 'create', 'edit', 'comment'],
          description: 'Discussion 操作类型。list 查阅讨论列表、view 查看正文与评论、create 发起新讨论、edit 修改讨论、comment 发表评论。',
        },
        repo: {
          type: 'string',
          description: '目标仓库 [owner/repo]，留空则识别当前工作区仓库。',
        },
        discussion_number: {
          type: 'number',
          description: '讨论编号（view, edit, comment 动作必需，如 123）。',
        },
        title: {
          type: 'string',
          description: '讨论标题（create 动作必需，edit 动作修改标题时可选）。',
        },
        body: {
          type: 'string',
          description: '讨论正文或评论正文（create, comment 必需，edit 动作修改正文时可选）。',
        },
        category: {
          type: 'string',
          description: '讨论分类名称（create 动作必需，list 动作按分类筛选使用，如 "General"、"Q&A"、"Ideas"）。',
        },
        state: {
          type: 'string',
          enum: ['open', 'closed', 'all'],
          description: '讨论状态过滤（list 动作使用，默认 open）。',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: '按标签筛选（list 动作使用）。',
        },
        search: {
          type: 'string',
          description: '搜索过滤关键词（list 动作使用，映射 -S/--search）。',
        },
        comments: {
          type: 'boolean',
          description: '是否一并拉取评论列表（view 动作使用，默认 true）。',
        },
        limit: {
          type: 'number',
          description: '返回讨论数量上限（list 动作使用，默认 30）。',
        },
      },
      required: ['action'],
    },
    output: {
      schema: { type: 'object' },
      render(args: any, value: any) {
        return [{ type: 'text', text: renderDiscussionMarkdown(args, value) }];
      },
    },
    async execute(args: any, execContext: any) {
      const { cwd, sessionId } = executor.resolveExecScope(execContext);
      const repoArgs = args.repo ? ['-R', args.repo] : [];
      const runOpts = { cwd, sessionId };

      switch (args.action) {
        case 'list': {
          const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(args.limit, 100) : 30;
          const listCmd = [
            'discussion', 'list',
            '-L', String(limit),
            '--json', DISCUSSION_LIST_FIELDS,
            ...repoArgs,
          ];

          if (args.category) listCmd.push('-c', String(args.category).trim());
          if (args.state) listCmd.push('-s', args.state);
          if (args.search) listCmd.push('-S', String(args.search).trim());
          if (Array.isArray(args.labels) && args.labels.length > 0) {
            args.labels.forEach((l: string) => {
              if (l) listCmd.push('-l', String(l).trim());
            });
          }

          const res = await executor.run(listCmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return normalizeOutput(res.data || res.rawOutput);
        }

        case 'view': {
          if (!args.discussion_number || typeof args.discussion_number !== 'number') {
            throw new Error('view 操作必须提供 discussion_number（讨论数字编号），以防止进入交互式挂起');
          }
          const numStr = String(args.discussion_number);
          const viewCmd = [
            'discussion', 'view', numStr,
            '--json', DISCUSSION_VIEW_FIELDS,
            ...repoArgs,
          ];
          if (args.comments !== false) {
            viewCmd.push('-c');
          }

          const res = await executor.run(viewCmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return normalizeOutput(res.data || res.rawOutput);
        }

        case 'create': {
          if (!args.title || typeof args.title !== 'string' || !args.title.trim()) {
            throw new Error('create 操作必须提供 title（讨论标题）');
          }
          if (!args.body || typeof args.body !== 'string' || !args.body.trim()) {
            throw new Error('create 操作必须提供 body（讨论正文）');
          }
          if (!args.category || typeof args.category !== 'string' || !args.category.trim()) {
            throw new Error('create 操作必须提供 category（讨论分类，例如 "General"、"Q&A"、"Ideas"）');
          }

          const createCmd = [
            'discussion', 'create',
            '-t', args.title.trim(),
            '-b', args.body.trim(),
            '-c', args.category.trim(),
            ...repoArgs,
          ];

          const res = await executor.run(createCmd, { ...runOpts, rawText: true, timeoutMs: 60_000 });
          if (!res.ok) throw new Error(res.error);
          return {
            message: '讨论已成功发起',
            url: res.rawOutput ? res.rawOutput.trim() : undefined,
          };
        }

        case 'edit': {
          if (!args.discussion_number || typeof args.discussion_number !== 'number') {
            throw new Error('edit 操作必须提供 discussion_number（讨论数字编号）');
          }
          if (!args.title && !args.body) {
            throw new Error('edit 操作至少需提供 title 或 body 中的一项进行修改');
          }

          const editCmd = ['discussion', 'edit', String(args.discussion_number), ...repoArgs];
          if (args.title) editCmd.push('-t', String(args.title).trim());
          if (args.body) editCmd.push('-b', String(args.body).trim());

          const res = await executor.run(editCmd, { ...runOpts, rawText: true, timeoutMs: 60_000 });
          if (!res.ok) throw new Error(res.error);
          return {
            message: `讨论 #${args.discussion_number} 已更新成功`,
            output: res.rawOutput || 'Updated',
          };
        }

        case 'comment': {
          if (!args.discussion_number || typeof args.discussion_number !== 'number') {
            throw new Error('comment 操作必须提供 discussion_number（讨论数字编号）');
          }
          if (!args.body || typeof args.body !== 'string' || !args.body.trim()) {
            throw new Error('comment 操作必须提供 body（评论正文）');
          }

          const commentCmd = [
            'discussion', 'comment', String(args.discussion_number),
            '-b', args.body.trim(),
            ...repoArgs,
          ];

          const res = await executor.run(commentCmd, { ...runOpts, rawText: true, timeoutMs: 60_000 });
          if (!res.ok) throw new Error(res.error);
          return {
            message: `已向讨论 #${args.discussion_number} 成功发表评论`,
            url: res.rawOutput ? res.rawOutput.trim() : undefined,
          };
        }

        default:
          throw new Error(`未知的 Discussion 操作: ${args.action}`);
      }
    },
  });
}
