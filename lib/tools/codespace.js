import { wrapWithGate } from '../destructive.js';
import { renderCodespaceMarkdown } from '../renderers/markdown.js';
import { checkScopeRequired } from './project.js';
function normalizeOutput(data) {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        return data;
    }
    if (Array.isArray(data)) {
        return { items: data, count: data.length };
    }
    return { result: data !== undefined && data !== null ? data : '' };
}
const CODESPACE_LIST_FIELDS = 'name,displayName,repository,owner,state,gitStatus,lastUsedAt,createdAt,machineName';
const CODESPACE_VIEW_FIELDS = 'name,displayName,repository,owner,state,gitStatus,lastUsedAt,createdAt,machineName,devcontainerPath,recentFolders,idleTimeoutMinutes';
export function createCodespaceTool(executor) {
    return wrapWithGate({
        name: 'github_codespace',
        description: '管理 GitHub Codespaces 云端远程开发环境：查阅实例列表与运行状态、检视实例配置详情、停止运行中的环境防计费、安全销毁实例。未授权时提供平台感知自愈命令。',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['list', 'view', 'stop', 'delete'],
                    description: 'Codespace 操作类型。list 查看环境列表、view 检视详情、stop 停止运行（防持续计费）、delete 销毁实例（需 confirm）。',
                },
                codespace: {
                    type: 'string',
                    description: 'Codespace 实例名称（view, stop, delete 动作必需，如 "fuzzy-spoon-69vj"；防交互式挂起）。',
                },
                repo: {
                    type: 'string',
                    description: '按目标仓库筛选 [owner/repo]（list 动作可选）。',
                },
                org: {
                    type: 'string',
                    description: '组织管理员按组织筛选（list, stop, delete 动作可选）。',
                },
                limit: {
                    type: 'number',
                    description: '返回数量上限（list 动作使用，默认 30）。',
                },
                confirm: {
                    type: 'boolean',
                    description: '危险操作确认标记（delete 动作必需）。销毁云端环境不可逆，未确认时输出影响评估并拦截。',
                },
            },
            required: ['action'],
        },
        output: {
            schema: { type: 'object' },
            render(args, value) {
                return [{ type: 'text', text: renderCodespaceMarkdown(args, value) }];
            },
        },
        async execute(args, execContext) {
            const { cwd, sessionId } = executor.resolveExecScope(execContext);
            const runOpts = { cwd, sessionId };
            switch (args.action) {
                case 'list': {
                    const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(args.limit, 100) : 30;
                    const listCmd = [
                        'codespace', 'list',
                        '-L', String(limit),
                        '--json', CODESPACE_LIST_FIELDS,
                    ];
                    if (args.repo)
                        listCmd.push('-R', String(args.repo).trim());
                    if (args.org)
                        listCmd.push('-o', String(args.org).trim());
                    const res = await executor.run(listCmd, runOpts);
                    if (!res.ok) {
                        const scopeFix = checkScopeRequired(res.error || '', 'codespace', 'gh auth refresh -h github.com -s codespace', 'github_codespace');
                        if (scopeFix)
                            return scopeFix;
                        throw new Error(res.error);
                    }
                    return normalizeOutput(res.data || res.rawOutput);
                }
                case 'view': {
                    if (!args.codespace || typeof args.codespace !== 'string' || !args.codespace.trim()) {
                        throw new Error('view 操作必须提供 codespace 名称，以防止 CLI 打开交互式选择器导致挂起');
                    }
                    const cleanName = args.codespace.trim();
                    const viewCmd = [
                        'codespace', 'view',
                        '-c', cleanName,
                        '--json', CODESPACE_VIEW_FIELDS,
                    ];
                    if (args.repo)
                        viewCmd.push('-R', String(args.repo).trim());
                    const res = await executor.run(viewCmd, runOpts);
                    if (!res.ok) {
                        const scopeFix = checkScopeRequired(res.error || '', 'codespace', 'gh auth refresh -h github.com -s codespace', 'github_codespace');
                        if (scopeFix)
                            return scopeFix;
                        throw new Error(res.error);
                    }
                    return normalizeOutput(res.data || res.rawOutput);
                }
                case 'stop': {
                    if (!args.codespace || typeof args.codespace !== 'string' || !args.codespace.trim()) {
                        throw new Error('stop 操作必须提供 codespace 名称，以防止 CLI 进入交互式挂起');
                    }
                    const cleanName = args.codespace.trim();
                    const stopCmd = ['codespace', 'stop', '-c', cleanName];
                    if (args.org)
                        stopCmd.push('-o', String(args.org).trim());
                    const res = await executor.run(stopCmd, { ...runOpts, rawText: true, timeoutMs: 45_000 });
                    if (!res.ok) {
                        const scopeFix = checkScopeRequired(res.error || '', 'codespace', 'gh auth refresh -h github.com -s codespace', 'github_codespace');
                        if (scopeFix)
                            return scopeFix;
                        throw new Error(res.error);
                    }
                    return {
                        message: `云端开发环境「${cleanName}」已成功发送停止指令（已避免继续占用算力计费）`,
                        output: res.rawOutput || 'Stopped',
                    };
                }
                case 'delete': {
                    if (!args.codespace || typeof args.codespace !== 'string' || !args.codespace.trim()) {
                        throw new Error('delete 操作必须提供 codespace 名称');
                    }
                    const cleanName = args.codespace.trim();
                    const deleteCmd = ['codespace', 'delete', '-c', cleanName, '-f'];
                    if (args.org)
                        deleteCmd.push('-o', String(args.org).trim());
                    const res = await executor.run(deleteCmd, { ...runOpts, rawText: true, timeoutMs: 60_000 });
                    if (!res.ok) {
                        const scopeFix = checkScopeRequired(res.error || '', 'codespace', 'gh auth refresh -h github.com -s codespace', 'github_codespace');
                        if (scopeFix)
                            return scopeFix;
                        throw new Error(res.error);
                    }
                    return {
                        message: `云端开发环境「${cleanName}」已成功销毁释放`,
                        output: res.rawOutput || 'Deleted',
                    };
                }
                default:
                    throw new Error(`未知的 Codespace 操作: ${args.action}`);
            }
        },
    });
}
