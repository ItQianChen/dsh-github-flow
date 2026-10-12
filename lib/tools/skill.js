import { renderSkillMarkdown } from '../renderers/markdown.js';
function normalizeOutput(data) {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        return data;
    }
    if (Array.isArray(data)) {
        return { items: data, count: data.length };
    }
    return { result: data !== undefined && data !== null ? data : '' };
}
export function createSkillTool(executor) {
    return {
        name: 'github_skill',
        description: '通过 GitHub CLI 官方生态发现与管理 Agent Skills：跨仓库检索开源 Skills、预览 SKILL.md 内容、安装到本地 Agent 宿主（Claude Code / Cursor / Copilot 等）、查看已安装列表。install 会写入本地磁盘，需 confirm: true。基于 gh CLI preview 特性（需 gh >= 2.9x）。',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['search', 'preview', 'install', 'list'],
                    description: 'Skill 操作类型。',
                },
                query: {
                    type: 'string',
                    description: '搜索关键词（search 动作使用，如 "python"、"devops"、"markdown"）。',
                },
                owner: {
                    type: 'string',
                    description: '限定作者或组织（search 动作可选，映射 --owner）。',
                },
                repository: {
                    type: 'string',
                    description: '目标仓库全名 [owner/repo]（preview/install 动作使用，如 "github/awesome-copilot"）。',
                },
                skill_name: {
                    type: 'string',
                    description: 'Skill 名称（preview/install 动作可选）。支持 "name"、"author/name" 命名空间形式或 "name@version" 锁定版本。',
                },
                agent: {
                    type: 'string',
                    description: '安装到的目标 Agent 宿主（install 动作可选，如 "claude-code"、"cursor"、"github-copilot"；省略时 gh 会按环境探测）。',
                },
                scope: {
                    type: 'string',
                    enum: ['project', 'user'],
                    description: '安装范围（install 动作可选，默认 project：安装进当前 git 仓库；user：安装到用户主目录全局可用）。',
                },
                all: {
                    type: 'boolean',
                    description: '安装仓库内全部 Skills 而非逐个选择（install 动作可选，映射 --all）。',
                },
                limit: {
                    type: 'number',
                    description: '搜索返回数量上限（search 动作使用，默认 15）。',
                },
                confirm: {
                    type: 'boolean',
                    description: '安装操作确认标志。install 会向本地磁盘写入文件，未传 true 时仅输出将要执行的安装预览。',
                },
            },
            required: ['action'],
        },
        output: {
            schema: { type: 'object' },
            render(args, value) {
                return [{ type: 'text', text: renderSkillMarkdown(args, value) }];
            },
        },
        async execute(args, execContext) {
            const cwd = execContext?.cwd || process.cwd();
            const sessionId = execContext?.sessionId || execContext?.session?.id || process.env.DSH_SESSION_ID;
            // skill 工具天然面向跨仓库生态（search/preview 均以显式 repository 为目标），
            // 不做当前工作区仓库自动识别——识别失败反而会误导调用方。
            const runOpts = { cwd, sessionId };
            switch (args.action) {
                case 'search': {
                    if (!args.query)
                        throw new Error('search 操作必须提供 query（搜索关键词）');
                    // 显式 limit 优先；缺省回退 executor.defaultListLimit（上限 50，gh skill 默认 15）
                    const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(args.limit, 50) : Math.min(executor.defaultListLimit ?? 15, 50);
                    const searchCmd = [
                        'skill', 'search', args.query,
                        '-L', String(limit),
                        // 字段名以 gh 2.96.0 实测为准；preview 特性字段可能随版本演进，
                        // 渲染层已对缺失字段做回退，这里不做多余防御
                        '--json', 'skillName,repo,description,namespace,stars',
                    ];
                    if (args.owner)
                        searchCmd.push('--owner', args.owner);
                    const res = await executor.run(searchCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return normalizeOutput(res.data || res.rawOutput);
                }
                case 'preview': {
                    if (!args.repository)
                        throw new Error('preview 操作必须提供 repository [owner/repo]');
                    const previewCmd = ['skill', 'preview', args.repository];
                    if (args.skill_name)
                        previewCmd.push(args.skill_name);
                    // SKILL.md 是长篇 Markdown 文档，套 JSON 反而破坏可读性
                    const res = await executor.run(previewCmd, { ...runOpts, rawText: true, timeoutMs: 60_000 });
                    if (!res.ok)
                        throw new Error(res.error);
                    return { result: res.rawOutput || '未找到该 Skill 的内容' };
                }
                case 'install': {
                    if (!args.repository)
                        throw new Error('install 操作必须提供 repository [owner/repo]');
                    if (args.confirm !== true) {
                        return {
                            status: 'AWAITING_CONFIRMATION',
                            warning: `⚠️ 安装确认拦截：你即将从仓库「${args.repository}」安装 Skill${args.skill_name ? `「${args.skill_name}」` : ''}到本地${args.scope === 'user' ? '用户主目录（全局）' : '当前项目'}。`,
                            impact: '安装会在本地磁盘写入 SKILL.md 及附属文件，并可能影响目标 Agent 宿主的默认行为。',
                            requiredAction: '如确认安装，请向用户核实并附加 `confirm: true` 重新调用。',
                        };
                    }
                    const installCmd = ['skill', 'install', args.repository];
                    if (args.skill_name)
                        installCmd.push(args.skill_name);
                    if (args.agent)
                        installCmd.push('--agent', args.agent);
                    if (args.scope)
                        installCmd.push('--scope', args.scope);
                    if (args.all === true)
                        installCmd.push('--all');
                    const res = await executor.run(installCmd, { ...runOpts, timeoutMs: 120_000 });
                    if (!res.ok)
                        throw new Error(res.error);
                    return { message: `Skill 安装成功（来源: ${args.repository}）`, output: res.rawOutput };
                }
                case 'list': {
                    const listCmd = ['skill', 'list', '--json', 'skillName,sourceURL,scope,version,pinned,path'];
                    if (args.scope)
                        listCmd.push('--scope', args.scope);
                    const res = await executor.run(listCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return normalizeOutput(res.data || res.rawOutput);
                }
                default:
                    throw new Error(`未知的 Skill 操作: ${args.action}`);
            }
        },
    };
}
