import { wrapWithGate } from '../destructive.js';
import { renderLabelMarkdown } from '../renderers/markdown.js';
/**
 * 校验并归一化 6 位十六进制颜色（去除前导 #）
 */
export function normalizeHexColor(rawColor) {
    if (!rawColor)
        return undefined;
    const clean = rawColor.trim().replace(/^#/, '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
        throw new Error(`标签颜色必须为 6 位十六进制字符串（如 "d73a4a" 或 "#d73a4a"），当前为: "${rawColor}"`);
    }
    return clean;
}
function normalizeOutput(data) {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        return data;
    }
    if (Array.isArray(data)) {
        return { items: data, count: data.length };
    }
    return { result: data !== undefined && data !== null ? data : '' };
}
export function createLabelTool(executor) {
    return wrapWithGate({
        name: 'github_label',
        description: '管理 GitHub 仓库标签体系 (Labels)：查看标签列表、创建新标签、编辑修改现有标签、克隆跨仓库标签体系 (clone) 以及安全删除标签。删除操作不可逆且会解绑议题，需 confirm: true。',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['list', 'create', 'edit', 'delete', 'clone'],
                    description: 'Label 操作类型。list 查看列表、create 新建、edit 修改、delete 物理删除（需 confirm）、clone 跨仓库克隆同步。',
                },
                repo: {
                    type: 'string',
                    description: '目标仓库 [owner/repo]，留空则识别当前工作区仓库。',
                },
                name: {
                    type: 'string',
                    description: '标签名称（create, edit, delete 动作必需）。',
                },
                new_name: {
                    type: 'string',
                    description: '新标签名称（edit 动作重命名标签时使用）。',
                },
                color: {
                    type: 'string',
                    description: '6 位十六进制色值（create, edit 动作可选，例如 "d73a4a" 或 "#d73a4a"）。',
                },
                description: {
                    type: 'string',
                    description: '标签描述（create, edit 动作可选）。',
                },
                force: {
                    type: 'boolean',
                    description: '是否强制覆盖（create 动作同名时更新、clone 动作冲突时覆盖；默认 false）。',
                },
                source_repo: {
                    type: 'string',
                    description: '源仓库全名 [owner/repo]（clone 动作必需，例如 "cli/cli"）。',
                },
                limit: {
                    type: 'number',
                    description: '返回标签数量上限（list 动作使用，默认 30）。',
                },
                search: {
                    type: 'string',
                    description: '按标签名称或描述过滤检索（list 动作使用）。',
                },
                sort: {
                    type: 'string',
                    enum: ['created', 'name'],
                    description: '排序字段（list 动作使用，默认 created）。',
                },
                order: {
                    type: 'string',
                    enum: ['asc', 'desc'],
                    description: '排序方向（list 动作使用，默认 asc）。',
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
                return [{ type: 'text', text: renderLabelMarkdown(args, value) }];
            },
        },
        async execute(args, execContext) {
            const { cwd, sessionId } = executor.resolveExecScope(execContext);
            let repoTarget = args.repo;
            if (!repoTarget) {
                const meta = await executor.getRepoMetadata(cwd, sessionId);
                if (meta?.nameWithOwner) {
                    repoTarget = meta.nameWithOwner;
                }
            }
            if (!repoTarget) {
                throw new Error('未能自动识别当前工作区关联的 GitHub 仓库。请通过 `repo` 参数显式指定目标仓库 [owner/repo]（例如: "ItQianChen/dsh-github-flow"），或在当前工作区目录下关联 Git 远程仓库。');
            }
            const repoArgs = ['-R', repoTarget];
            const runOpts = { cwd, sessionId };
            switch (args.action) {
                case 'list': {
                    const listCmd = ['label', 'list', ...repoArgs, '--json', 'name,color,description'];
                    const limit = typeof args.limit === 'number' && args.limit > 0 ? args.limit : 30;
                    listCmd.push('-L', String(limit));
                    if (args.search) {
                        listCmd.push('-S', String(args.search));
                    }
                    if (args.sort) {
                        listCmd.push('--sort', args.sort);
                    }
                    if (args.order) {
                        listCmd.push('--order', args.order);
                    }
                    const res = await executor.run(listCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    let rawData = res.data;
                    if (!rawData && typeof res.rawOutput === 'string') {
                        try {
                            rawData = JSON.parse(res.rawOutput);
                        }
                        catch {
                            rawData = [];
                        }
                    }
                    return normalizeOutput(rawData || []);
                }
                case 'create': {
                    if (!args.name) {
                        throw new Error('创建标签时 `name` 参数为必填项。');
                    }
                    const color = normalizeHexColor(args.color);
                    const createCmd = ['label', 'create', args.name, ...repoArgs];
                    if (color) {
                        createCmd.push('-c', color);
                    }
                    if (args.description) {
                        createCmd.push('-d', args.description);
                    }
                    if (args.force) {
                        createCmd.push('-f');
                    }
                    const res = await executor.run(createCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return {
                        success: true,
                        name: args.name,
                        message: `✅ 成功在仓库 ${repoTarget} 创建标签 "${args.name}"`,
                        detail: res.rawOutput || '',
                    };
                }
                case 'edit': {
                    if (!args.name) {
                        throw new Error('编辑标签时 `name` 参数为必填项。');
                    }
                    const color = normalizeHexColor(args.color);
                    const editCmd = ['label', 'edit', args.name, ...repoArgs];
                    if (args.new_name) {
                        editCmd.push('-n', args.new_name);
                    }
                    if (color) {
                        editCmd.push('-c', color);
                    }
                    if (args.description !== undefined) {
                        editCmd.push('-d', args.description);
                    }
                    const res = await executor.run(editCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return {
                        success: true,
                        name: args.new_name || args.name,
                        message: `✅ 成功更新仓库 ${repoTarget} 标签 "${args.name}"` + (args.new_name ? `（重命名为 "${args.new_name}"）` : ''),
                        detail: res.rawOutput || '',
                    };
                }
                case 'delete': {
                    if (!args.name) {
                        throw new Error('删除标签时 `name` 参数为必填项。');
                    }
                    const deleteCmd = ['label', 'delete', args.name, '--yes', ...repoArgs];
                    const res = await executor.run(deleteCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return {
                        success: true,
                        name: args.name,
                        message: `🗑️ 成功在仓库 ${repoTarget} 删除标签 "${args.name}"`,
                        detail: res.rawOutput || '',
                    };
                }
                case 'clone': {
                    if (!args.source_repo) {
                        throw new Error('克隆标签时 `source_repo` 源仓库参数为必填项（格式: [owner/repo]）。');
                    }
                    const cloneCmd = ['label', 'clone', args.source_repo, ...repoArgs];
                    if (args.force) {
                        cloneCmd.push('-f');
                    }
                    const res = await executor.run(cloneCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return {
                        success: true,
                        source: args.source_repo,
                        destination: repoTarget,
                        message: `🏷️ 成功将源仓库 ${args.source_repo} 的标签体系克隆同步到 ${repoTarget}` + (args.force ? '（已覆盖同名冲突标签）' : ''),
                        detail: res.rawOutput || '',
                    };
                }
                default:
                    throw new Error(`不支持的 label 操作: "${args.action}"。可选值: list, create, edit, delete, clone。`);
            }
        },
    });
}
