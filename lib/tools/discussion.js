import { wrapWithGate } from '../destructive.js';
import { renderDiscussionMarkdown } from '../renderers/markdown.js';
import { resolveBodySource } from './body-input.js';
function normalizeOutput(data) {
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
export function createDiscussionTool(executor) {
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
                    description: '讨论正文或评论正文（create, comment 必需，edit 动作修改正文时可选）。与 body_file 二选一。',
                },
                body_file: {
                    type: 'string',
                    description: '正文来源：本地 Markdown 文件路径（相对路径按当前工作区解析）。与 body 二选一；长正文用本参数，无需把全文读进上下文。',
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
            render(args, value) {
                return [{ type: 'text', text: renderDiscussionMarkdown(args, value) }];
            },
        },
        async execute(args, execContext) {
            const { cwd, sessionId } = executor.resolveExecScope(execContext);
            const repoArgs = args.repo ? ['-R', args.repo] : [];
            const runOpts = { cwd, sessionId };
            // 正文来自本地文件时经 stdin 注入（`--body-file -`）：绕开 Windows 约 32K 的命令行上限
            const stdinPatch = (body) => (body.stdin === undefined ? {} : { stdin: body.stdin });
            /*
             * 内联正文沿用改造前的 trim 口径（旧代码是 `-b args.body.trim()`）：discussion 历史上
             * 就按去空白下发，改成原样会动到既有调用方的 argv。文件来源不 trim——那是用户排好版的
             * Markdown，首尾空行/缩进可能有意义，strip 掉等于替用户改稿。
             */
            const trimInline = (v) => (typeof v === 'string' ? v.trim() : v);
            switch (args.action) {
                case 'list': {
                    const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(args.limit, 100) : 30;
                    const listCmd = [
                        'discussion', 'list',
                        '-L', String(limit),
                        '--json', DISCUSSION_LIST_FIELDS,
                        ...repoArgs,
                    ];
                    if (args.category)
                        listCmd.push('-c', String(args.category).trim());
                    if (args.state)
                        listCmd.push('-s', args.state);
                    if (args.search)
                        listCmd.push('-S', String(args.search).trim());
                    if (Array.isArray(args.labels) && args.labels.length > 0) {
                        args.labels.forEach((l) => {
                            if (l)
                                listCmd.push('-l', String(l).trim());
                        });
                    }
                    const res = await executor.run(listCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
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
                    if (!res.ok)
                        throw new Error(res.error);
                    return normalizeOutput(res.data || res.rawOutput);
                }
                case 'create': {
                    if (!args.title || typeof args.title !== 'string' || !args.title.trim()) {
                        throw new Error('create 操作必须提供 title（讨论标题）');
                    }
                    const body = resolveBodySource({ inline: trimInline(args.body), file: args.body_file }, { cwd, flag: '-b' });
                    // 判空只看解析后的权威正文：文件来源时 args.body 恒为空，拿它判定会误杀
                    if (body.chars === 0) {
                        throw new Error('create 操作必须提供 body 或 body_file（讨论正文）');
                    }
                    if (!args.category || typeof args.category !== 'string' || !args.category.trim()) {
                        throw new Error('create 操作必须提供 category（讨论分类，例如 "General"、"Q&A"、"Ideas"）');
                    }
                    const createCmd = [
                        'discussion', 'create',
                        '-t', args.title.trim(),
                        ...body.argv,
                        '-c', args.category.trim(),
                        ...repoArgs,
                    ];
                    const res = await executor.run(createCmd, { ...runOpts, rawText: true, timeoutMs: 60_000, ...stdinPatch(body) });
                    if (!res.ok)
                        throw new Error(res.error);
                    return {
                        message: '讨论已成功发起',
                        url: res.rawOutput ? res.rawOutput.trim() : undefined,
                    };
                }
                case 'edit': {
                    if (!args.discussion_number || typeof args.discussion_number !== 'number') {
                        throw new Error('edit 操作必须提供 discussion_number（讨论数字编号）');
                    }
                    const body = resolveBodySource({ inline: trimInline(args.body), file: args.body_file }, { cwd, flag: '-b' });
                    if (!args.title && body.chars === 0) {
                        throw new Error('edit 操作至少需提供 title 或 body 中的一项进行修改');
                    }
                    const editCmd = ['discussion', 'edit', String(args.discussion_number), ...repoArgs];
                    if (args.title)
                        editCmd.push('-t', String(args.title).trim());
                    editCmd.push(...body.argv);
                    const res = await executor.run(editCmd, { ...runOpts, rawText: true, timeoutMs: 60_000, ...stdinPatch(body) });
                    if (!res.ok)
                        throw new Error(res.error);
                    return {
                        message: `讨论 #${args.discussion_number} 已更新成功`,
                        output: res.rawOutput || 'Updated',
                    };
                }
                case 'comment': {
                    if (!args.discussion_number || typeof args.discussion_number !== 'number') {
                        throw new Error('comment 操作必须提供 discussion_number（讨论数字编号）');
                    }
                    const body = resolveBodySource({ inline: trimInline(args.body), file: args.body_file }, { cwd, flag: '-b' });
                    if (body.chars === 0) {
                        throw new Error('comment 操作必须提供 body 或 body_file（评论正文）');
                    }
                    const commentCmd = [
                        'discussion', 'comment', String(args.discussion_number),
                        ...body.argv,
                        ...repoArgs,
                    ];
                    const res = await executor.run(commentCmd, { ...runOpts, rawText: true, timeoutMs: 60_000, ...stdinPatch(body) });
                    if (!res.ok)
                        throw new Error(res.error);
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
