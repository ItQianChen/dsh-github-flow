import { renderGistMarkdown, parseGistListOutput } from '../renderers/markdown.js';
export function createGistTool(executor) {
    return {
        name: 'github_gist',
        description: '管理 GitHub Gist 代码片段与诊断留痕：查看 Gist 列表、检视代码正文 (view)、通过文本内容或本地文件创建新 Gist (create，默认安全 secret 模式)、编辑以及安全删除。删除操作不可逆，需 confirm: true。',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['list', 'view', 'create', 'edit', 'delete'],
                    description: 'Gist 操作类型。list 查看列表、view 查看正文、create 新建、edit 修改、delete 物理删除（需 confirm）。',
                },
                gist_id: {
                    type: 'string',
                    description: 'Gist 唯一 ID 或完整 URL（view, edit, delete 动作必需，例如 "5b0e0062eb8e9654adad7bb1d81cc75f"）。',
                },
                filename: {
                    type: 'string',
                    description: '文件名（view 动作指定查看文件、create 动作命名单文件、edit 动作指定编辑文件；默认 "snippet.txt"）。',
                },
                files: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '本地文件路径列表（create 动作上传多文件时使用）。',
                },
                content: {
                    type: 'string',
                    description: '代码片段或文本正文内容（create 动作直接传正文时使用，通过 stdin 安全管道传入）。',
                },
                description: {
                    type: 'string',
                    description: 'Gist 描述摘要或用途备注（create, edit 动作可选）。',
                },
                public: {
                    type: 'boolean',
                    description: '是否公开创建为 Public Gist（create 动作可选，默认 false 即 Secret 弱保密模式）。',
                },
                filter: {
                    type: 'string',
                    description: '按正则表达式过滤检索描述或文件内容（list 动作可选）。',
                },
                limit: {
                    type: 'number',
                    description: '返回 Gist 数量上限（list 动作使用，默认 10）。',
                },
                confirm: {
                    type: 'boolean',
                    description: '高危破坏性操作确认标志（delete 动作必需）。未传 true 时输出影响评估报告并拦截。',
                },
            },
            required: ['action'],
        },
        output: {
            schema: { type: 'object' },
            render(args, value) {
                return [{ type: 'text', text: renderGistMarkdown(args, value) }];
            },
        },
        async execute(args, execContext) {
            const cwd = execContext?.cwd || process.cwd();
            const sessionId = execContext?.sessionId || execContext?.session?.id || process.env.DSH_SESSION_ID;
            const runOpts = { cwd, sessionId, rawText: true };
            switch (args.action) {
                case 'list': {
                    const listCmd = ['gist', 'list'];
                    const limit = typeof args.limit === 'number' && args.limit > 0 ? args.limit : 10;
                    listCmd.push('-L', String(limit));
                    if (args.public === true) {
                        listCmd.push('--public');
                    }
                    else if (args.public === false) {
                        listCmd.push('--secret');
                    }
                    if (args.filter) {
                        listCmd.push('--filter', String(args.filter));
                    }
                    const res = await executor.run(listCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    const items = parseGistListOutput(res.rawOutput || '');
                    return { items, count: items.length, rawText: res.rawOutput || '' };
                }
                case 'view': {
                    if (!args.gist_id) {
                        throw new Error('查看 Gist 时 `gist_id` 参数为必填项（可提供 Gist 数字字母 ID 或完整 URL）。');
                    }
                    const viewCmd = ['gist', 'view', String(args.gist_id), '-r'];
                    if (args.filename) {
                        viewCmd.push('-f', String(args.filename));
                    }
                    const res = await executor.run(viewCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return {
                        gist_id: String(args.gist_id),
                        filename: args.filename,
                        content: res.rawOutput || '',
                    };
                }
                case 'create': {
                    if (!args.content && (!args.files || !Array.isArray(args.files) || args.files.length === 0)) {
                        throw new Error('创建 Gist 时必须提供 `content`（代码片段文本）或 `files`（本地文件路径数组）。');
                    }
                    const createCmd = ['gist', 'create'];
                    let stdinData;
                    if (args.content) {
                        createCmd.push('-');
                        const fn = args.filename ? String(args.filename).trim() : 'snippet.txt';
                        createCmd.push('-f', fn);
                        stdinData = String(args.content);
                    }
                    else if (args.files) {
                        for (const f of args.files) {
                            createCmd.push(String(f));
                        }
                    }
                    if (args.public === true) {
                        createCmd.push('--public');
                    }
                    if (args.description) {
                        createCmd.push('-d', String(args.description));
                    }
                    const res = await executor.run(createCmd, { ...runOpts, stdin: stdinData });
                    if (!res.ok)
                        throw new Error(res.error);
                    const rawUrl = (res.rawOutput || '').trim();
                    const urlMatch = rawUrl.match(/gist\.github\.com\/([^/]+\/)?([0-9a-fA-F]+)/i);
                    const gistId = urlMatch ? urlMatch[2] : rawUrl;
                    return {
                        success: true,
                        url: rawUrl,
                        gist_id: gistId,
                        public: args.public === true,
                        description: args.description,
                        message: `✅ 成功创建 Gist: ${rawUrl}`,
                    };
                }
                case 'edit': {
                    if (!args.gist_id) {
                        throw new Error('编辑 Gist 时 `gist_id` 参数为必填项。');
                    }
                    const editCmd = ['gist', 'edit', String(args.gist_id)];
                    if (args.description) {
                        editCmd.push('-d', String(args.description));
                    }
                    if (args.filename) {
                        editCmd.push('-f', String(args.filename));
                    }
                    const res = await executor.run(editCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return {
                        success: true,
                        gist_id: String(args.gist_id),
                        message: `✅ 成功更新 Gist "${args.gist_id}"`,
                        detail: res.rawOutput || '',
                    };
                }
                case 'delete': {
                    if (!args.gist_id) {
                        throw new Error('删除 Gist 时 `gist_id` 参数为必填项。');
                    }
                    if (args.confirm !== true) {
                        return {
                            status: 'AWAITING_CONFIRMATION',
                            action: 'delete',
                            gist_id: String(args.gist_id),
                            warning: `⚠️ 高危破坏性操作：即将永久删除 Gist 代码片段 "${args.gist_id}"`,
                            impact: `删除 Gist 为物理删除，无法通过 GitHub API 恢复，所有引用该 Gist URL 的外部链接将失效并返回 404。`,
                            requiredAction: `如确认彻底删除，请在参数中附加 \`confirm: true\` 重新调用。示例：\`github_gist(action: 'delete', gist_id: '${args.gist_id}', confirm: true)\``,
                        };
                    }
                    const delCmd = ['gist', 'delete', String(args.gist_id), '--yes'];
                    const res = await executor.run(delCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return {
                        success: true,
                        gist_id: String(args.gist_id),
                        message: `🗑️ 成功删除 Gist 代码片段 "${args.gist_id}"`,
                        detail: res.rawOutput || '',
                    };
                }
                default:
                    throw new Error(`不支持的 gist 操作: "${args.action}"。可选值: list, view, create, edit, delete。`);
            }
        },
    };
}
