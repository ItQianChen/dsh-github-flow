import { wrapWithGate } from '../destructive.js';
import { renderProjectMarkdown } from '../renderers/markdown.js';
function normalizeOutput(data) {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        return data;
    }
    if (Array.isArray(data)) {
        return { items: data, count: data.length };
    }
    return { result: data !== undefined && data !== null ? data : '' };
}
/**
 * 检测错误信息是否属于 Scope 权限不足，并返回标准自愈对象
 */
export function checkScopeRequired(errorMsg, scope, command, tool) {
    const lower = (errorMsg || '').toLowerCase();
    if (lower.includes('missing required scopes') || lower.includes('needs the') || lower.includes('scope')) {
        return {
            status: 'SCOPE_REQUIRED',
            scope,
            command,
            tool,
        };
    }
    return null;
}
export function createProjectTool(executor) {
    return wrapWithGate({
        name: 'github_project',
        description: '管理 GitHub Projects v2 项目看板与任务规划：查看项目列表与卡片条目、关联 Issue/PR 到看板、创建草稿任务、删除看板条目。未授权时提供平台感知自愈命令。',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['list', 'view', 'item-list', 'item-add', 'item-create', 'item-delete'],
                    description: 'Project 操作类型。list 查看项目列表、view 查看项目详情、item-list 查看看板条目、item-add 添加现有Issue/PR、item-create 创建草稿条目、item-delete 删除条目。',
                },
                owner: {
                    type: 'string',
                    description: '项目所属用户或组织（缺省为 "@me" 即当前用户）。',
                },
                project_number: {
                    type: 'number',
                    description: '项目数字编号（view, item-list, item-add, item-create 动作必需）。',
                },
                item_id: {
                    type: 'string',
                    description: '项目条目唯一标识 ID（item-delete 动作必需）。',
                },
                url: {
                    type: 'string',
                    description: '要添加到项目的 Issue 或 PR URL（item-add 动作必需）。',
                },
                title: {
                    type: 'string',
                    description: '草稿条目标题（item-create 动作必需）。',
                },
                body: {
                    type: 'string',
                    description: '草稿条目正文描述（item-create 动作可选）。',
                },
                query: {
                    type: 'string',
                    description: '过滤查询语法（item-list 动作可选，如 "is:open assignee:@me"）。',
                },
                closed: {
                    type: 'boolean',
                    description: '是否包含已关闭的项目（list 动作使用，默认 false）。',
                },
                limit: {
                    type: 'number',
                    description: '返回数量上限（list 与 item-list 动作使用，默认 30）。',
                },
                confirm: {
                    type: 'boolean',
                    description: '危险操作确认标记（item-delete 动作必需）。未确认时输出影响评估并拦截。',
                },
            },
            required: ['action'],
        },
        output: {
            schema: { type: 'object' },
            render(args, value) {
                return [{ type: 'text', text: renderProjectMarkdown(args, value) }];
            },
        },
        async execute(args, execContext) {
            const { cwd, sessionId } = executor.resolveExecScope(execContext);
            const owner = typeof args.owner === 'string' && args.owner.trim() ? args.owner.trim() : '@me';
            const runOpts = { cwd, sessionId };
            switch (args.action) {
                case 'list': {
                    const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(args.limit, 100) : 30;
                    const listCmd = [
                        'project', 'list',
                        '--format', 'json',
                        '--owner', owner,
                        '-L', String(limit),
                    ];
                    if (args.closed === true)
                        listCmd.push('--closed');
                    const res = await executor.run(listCmd, runOpts);
                    if (!res.ok) {
                        const scopeFix = checkScopeRequired(res.error || '', 'read:project', 'gh auth refresh -s read:project', 'github_project');
                        if (scopeFix)
                            return scopeFix;
                        throw new Error(res.error);
                    }
                    return normalizeOutput(res.data || res.rawOutput);
                }
                case 'view': {
                    if (!args.project_number || typeof args.project_number !== 'number') {
                        throw new Error('view 操作必须提供 project_number（项目数字编号）');
                    }
                    const viewCmd = [
                        'project', 'view', String(args.project_number),
                        '--format', 'json',
                        '--owner', owner,
                    ];
                    const res = await executor.run(viewCmd, runOpts);
                    if (!res.ok) {
                        const scopeFix = checkScopeRequired(res.error || '', 'read:project', 'gh auth refresh -s read:project', 'github_project');
                        if (scopeFix)
                            return scopeFix;
                        throw new Error(res.error);
                    }
                    return normalizeOutput(res.data || res.rawOutput);
                }
                case 'item-list': {
                    if (!args.project_number || typeof args.project_number !== 'number') {
                        throw new Error('item-list 操作必须提供 project_number（项目数字编号）');
                    }
                    const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(args.limit, 100) : 30;
                    const itemCmd = [
                        'project', 'item-list', String(args.project_number),
                        '--format', 'json',
                        '--owner', owner,
                        '-L', String(limit),
                    ];
                    if (args.query)
                        itemCmd.push('--query', String(args.query).trim());
                    const res = await executor.run(itemCmd, runOpts);
                    if (!res.ok) {
                        const scopeFix = checkScopeRequired(res.error || '', 'read:project', 'gh auth refresh -s read:project', 'github_project');
                        if (scopeFix)
                            return scopeFix;
                        throw new Error(res.error);
                    }
                    return normalizeOutput(res.data || res.rawOutput);
                }
                case 'item-add': {
                    if (!args.project_number || typeof args.project_number !== 'number') {
                        throw new Error('item-add 操作必须提供 project_number（项目数字编号）');
                    }
                    if (!args.url || typeof args.url !== 'string' || !args.url.trim()) {
                        throw new Error('item-add 操作必须提供 url（Issue 或 PR 的完整链接）');
                    }
                    const addCmd = [
                        'project', 'item-add', String(args.project_number),
                        '--owner', owner,
                        '--url', args.url.trim(),
                        '--format', 'json',
                    ];
                    const res = await executor.run(addCmd, runOpts);
                    if (!res.ok) {
                        const scopeFix = checkScopeRequired(res.error || '', 'project', 'gh auth refresh -s project', 'github_project');
                        if (scopeFix)
                            return scopeFix;
                        throw new Error(res.error);
                    }
                    return {
                        message: `已成功将条目添加到项目 #${args.project_number}`,
                        output: res.rawOutput || 'Item added',
                    };
                }
                case 'item-create': {
                    if (!args.project_number || typeof args.project_number !== 'number') {
                        throw new Error('item-create 操作必须提供 project_number（项目数字编号）');
                    }
                    if (!args.title || typeof args.title !== 'string' || !args.title.trim()) {
                        throw new Error('item-create 操作必须提供 title（草稿条目标题）');
                    }
                    const createCmd = [
                        'project', 'item-create', String(args.project_number),
                        '--owner', owner,
                        '--title', args.title.trim(),
                        '--format', 'json',
                    ];
                    if (args.body)
                        createCmd.push('--body', String(args.body).trim());
                    const res = await executor.run(createCmd, runOpts);
                    if (!res.ok) {
                        const scopeFix = checkScopeRequired(res.error || '', 'project', 'gh auth refresh -s project', 'github_project');
                        if (scopeFix)
                            return scopeFix;
                        throw new Error(res.error);
                    }
                    return {
                        message: `已成功在项目 #${args.project_number} 中创建条目「${args.title.trim()}」`,
                        output: res.rawOutput || 'Draft item created',
                    };
                }
                case 'item-delete': {
                    if (!args.item_id || typeof args.item_id !== 'string' || !args.item_id.trim()) {
                        throw new Error('item-delete 操作必须提供 item_id（条目唯一 ID）');
                    }
                    const cleanItemId = args.item_id.trim();
                    const deleteCmd = [
                        'project', 'item-delete',
                        '--owner', owner,
                        '--id', cleanItemId,
                        '--format', 'json',
                    ];
                    const res = await executor.run(deleteCmd, runOpts);
                    if (!res.ok) {
                        const scopeFix = checkScopeRequired(res.error || '', 'project', 'gh auth refresh -s project', 'github_project');
                        if (scopeFix)
                            return scopeFix;
                        throw new Error(res.error);
                    }
                    return {
                        message: `条目「${cleanItemId}」已从项目看板中成功删除`,
                        output: res.rawOutput || 'Item deleted',
                    };
                }
                default:
                    throw new Error(`未知的 Project 操作: ${args.action}`);
            }
        },
    });
}
