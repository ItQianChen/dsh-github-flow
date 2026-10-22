import { wrapWithGate } from '../destructive.js';
import { renderAgentTaskMarkdown } from '../renderers/markdown.js';
function normalizeOutput(data) {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        return data;
    }
    if (Array.isArray(data)) {
        return { items: data, count: data.length };
    }
    return { result: data !== undefined && data !== null ? data : '' };
}
const AGENT_TASK_JSON_FIELDS = 'completedAt,createdAt,id,name,pullRequestNumber,pullRequestState,pullRequestTitle,pullRequestUrl,repository,state,updatedAt,user';
export function createAgentTaskTool(executor) {
    return wrapWithGate({
        name: 'github_agent_task',
        description: '管理 GitHub Copilot Coding Agent 云端智能体任务会话：查看已分派任务列表、检视任务状态与会话日志、向云端智能体发起新编码与重构任务。基于 gh CLI preview 特性。',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['list', 'view', 'create'],
                    description: 'Agent Task 操作类型。list 查看任务列表、view 检视任务详情与日志、create 新建智能体任务。',
                },
                repo: {
                    type: 'string',
                    description: '目标仓库 [owner/repo]，留空则识别当前工作区仓库。',
                },
                task_id: {
                    type: 'string',
                    description: '任务标识（view 动作必需，支持 Session ID、PR 编号或任务 URL）。',
                },
                prompt: {
                    type: 'string',
                    description: '任务描述正文或编码指令（create 动作必需，如 "为用户模块增加单元测试"）。',
                },
                base_branch: {
                    type: 'string',
                    description: 'PR 基准分支（create 动作可选，映射 -b/--base，缺省为主干默认分支）。',
                },
                custom_agent: {
                    type: 'string',
                    description: '自定义 Agent 规范名称（create 动作可选，映射 -a/--custom-agent，对应 .github/agents/ 规范）。',
                },
                limit: {
                    type: 'number',
                    description: '返回任务数量上限（list 动作使用，默认 30）。',
                },
                log: {
                    type: 'boolean',
                    description: '是否一并拉取任务会话执行日志（view 动作可选，映射 --log）。',
                },
            },
            required: ['action'],
        },
        output: {
            schema: { type: 'object' },
            render(args, value) {
                return [{ type: 'text', text: renderAgentTaskMarkdown(args, value) }];
            },
        },
        async execute(args, execContext) {
            const { cwd, sessionId } = executor.resolveExecScope(execContext);
            const repoArgs = args.repo ? ['-R', args.repo] : [];
            const runOpts = { cwd, sessionId };
            switch (args.action) {
                case 'list': {
                    const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(args.limit, 100) : 30;
                    // 注意：gh agent-task list 属于账号级任务列表命令，上游 gh CLI 官方不接受 -R/--repo 标志
                    const listCmd = [
                        'agent-task', 'list',
                        '-L', String(limit),
                        '--json', AGENT_TASK_JSON_FIELDS,
                    ];
                    const res = await executor.run(listCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return normalizeOutput(res.data || res.rawOutput);
                }
                case 'view': {
                    // 防线：task_id 必须显式提供，防止 CLI 打开交互式选择器导致无头进程挂死
                    if (!args.task_id || typeof args.task_id !== 'string' || !args.task_id.trim()) {
                        throw new Error('view 操作必须提供 task_id（支持 Session ID、PR 编号或任务 URL），以防止交互式挂起');
                    }
                    const cleanId = args.task_id.trim();
                    const viewCmd = [
                        'agent-task', 'view', cleanId,
                        '--json', AGENT_TASK_JSON_FIELDS,
                        ...repoArgs,
                    ];
                    const res = await executor.run(viewCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    let taskData = res.data;
                    if (!taskData && res.rawOutput) {
                        try {
                            taskData = JSON.parse(res.rawOutput);
                        }
                        catch {
                            taskData = { id: cleanId, result: res.rawOutput };
                        }
                    }
                    // 若调用方需要日志，额外抓取 session log 并挂载
                    if (args.log === true && taskData && typeof taskData === 'object') {
                        const logCmd = ['agent-task', 'view', cleanId, '--log', ...repoArgs];
                        const logRes = await executor.run(logCmd, { ...runOpts, rawText: true, timeoutMs: 45_000 });
                        if (logRes.ok && logRes.rawOutput) {
                            taskData.logs = logRes.rawOutput;
                        }
                    }
                    return taskData || { id: cleanId };
                }
                case 'create': {
                    if (!args.prompt || typeof args.prompt !== 'string' || !args.prompt.trim()) {
                        throw new Error('create 操作必须提供 prompt（任务描述正文或编码指令）');
                    }
                    const createCmd = ['agent-task', 'create', args.prompt.trim(), ...repoArgs];
                    if (args.base_branch)
                        createCmd.push('-b', args.base_branch.trim());
                    if (args.custom_agent)
                        createCmd.push('-a', args.custom_agent.trim());
                    const res = await executor.run(createCmd, { ...runOpts, rawText: true, timeoutMs: 60_000 });
                    if (!res.ok)
                        throw new Error(res.error);
                    return {
                        message: '智能体任务已成功创建并派发',
                        output: res.rawOutput || 'Agent task dispatched',
                    };
                }
                default:
                    throw new Error(`未知的 Agent Task 操作: ${args.action}`);
            }
        },
    });
}
