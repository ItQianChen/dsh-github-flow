import { wrapWithGate } from '../destructive.js';
import { compareGhVersions } from '../executor.js';
import { renderRunMarkdown } from '../renderers/markdown.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
function normalizeOutput(data) {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        return data;
    }
    if (Array.isArray(data)) {
        return { items: data, count: data.length };
    }
    return { result: data !== undefined && data !== null ? data : '' };
}
export function createRunTool(executor) {
    return wrapWithGate({
        name: 'github_run',
        description: '排查和诊断 GitHub Actions 工作流构建状态。特别优化了获取失败步骤日志能力（log_failed），专供 Agent 快速定位 CI 报错，并支持手动触发工作流 (trigger)。',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['list', 'view', 'log_failed', 'rerun', 'cancel', 'trigger', 'workflow_list', 'workflow_view', 'workflow_enable', 'workflow_disable', 'download'],
                    description: 'Actions 操作类型。trigger 主动触发 workflow_dispatch；workflow_* 查询与启停工作流；download 下载构建产物（落盘插件管理目录）。',
                },
                run_id: {
                    type: 'string',
                    description: 'Workflow 运行 ID（view, log_failed, rerun, cancel 时使用）。',
                },
                repo: {
                    type: 'string',
                    description: '目标仓库 [owner/repo]，留空则识别当前仓库。',
                },
                limit: {
                    type: 'number',
                    description: '列出 runs 的数量，默认 10。',
                },
                branch: {
                    type: 'string',
                    description: '按分支筛选运行记录（list 动作使用，例如 "main" 或当前分支）。',
                },
                status: {
                    type: 'string',
                    enum: ['queued', 'completed', 'in_progress', 'failure', 'success'],
                    description: '按状态筛选运行记录（list 动作使用，排查报错推荐 failure）。',
                },
                workflow: {
                    type: 'string',
                    description: '工作流名称、ID 或文件名（trigger/workflow_view 动作使用，例如 "pr-check.yml"、"CI" 或 "374382120"）。',
                },
                all: {
                    type: 'boolean',
                    description: 'workflow_list 可选：列出全部工作流（含 disabled）。默认仅 active——排查「工作流为何不跑」时 disabled 状态本身就是答案，排障建议开启。',
                },
                name: {
                    type: 'string',
                    description: 'download 可选：仅下载指定名称的 artifact（可多次过滤，这里取单个名称）。',
                },
                ref: {
                    type: 'string',
                    description: '触发工作流的目标分支或 tag（trigger 动作使用，默认当前工作区分支）。',
                },
                inputs: {
                    type: 'object',
                    description: '传递给工作流的自定义参数键值对（trigger 动作使用）。',
                },
            },
            required: ['action'],
        },
        output: {
            schema: { type: 'object' },
            render(args, value) {
                return [{ type: 'text', text: renderRunMarkdown(args, value) }];
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
                    const listCmd = [
                        'run', 'list', ...repoArgs,
                        '--json', 'databaseId,name,status,conclusion,event,headBranch,createdAt,url',
                        // 显式 limit 优先；缺省回退 executor.defaultListLimit（用户可在插件配置中调整）
                        '-L', String(typeof args.limit === 'number' && args.limit > 0 ? args.limit : Math.min(executor.defaultListLimit ?? 10, 50))
                    ];
                    if (args.branch) {
                        listCmd.push('--branch', args.branch);
                    }
                    if (args.status) {
                        listCmd.push('--status', args.status);
                    }
                    const res = await executor.run(listCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return normalizeOutput(res.data || res.rawOutput);
                }
                case 'view': {
                    if (!args.run_id)
                        throw new Error('view 操作必须提供 run_id');
                    const res = await executor.run(['run', 'view', String(args.run_id), ...repoArgs, '--json', 'databaseId,name,status,conclusion,jobs,url'], runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return normalizeOutput(res.data || res.rawOutput);
                }
                case 'log_failed': {
                    if (!args.run_id)
                        throw new Error('log_failed 操作必须提供 run_id');
                    // gh 原生支持仅提取失败的日志！对 Agent 故障诊断价值极高
                    const res = await executor.run(['run', 'view', String(args.run_id), ...repoArgs, '--log-failed'], {
                        ...runOpts,
                        timeoutMs: 60_000,
                        rawText: true,
                    });
                    if (!res.ok) {
                        // 两类已知的非零退出需要优雅吸收：
                        // 1) 工作流本身成功/无失败步骤 —— gh 的确定性提示；
                        // 2) gh CLI 在 Windows 受限目录写日志缓存 zip 报 Access is denied ——
                        //    这是宿主环境问题而非构建失败，透传原文会让 Agent 误判为构建故障，
                        //    给出自查指引（gh cache 目录权限）更可行动。
                        const err = String(res.error || '');
                        if (err.includes('no failed jobs') || err.includes('not failed')) {
                            return { result: `工作流 Run #${args.run_id} 中未检测到任何失败的任务步骤 (状态正常)。` };
                        }
                        if (err.includes('Access is denied') || err.includes('拒绝访问')) {
                            return {
                                result: `无法提取 Run #${args.run_id} 的失败日志：gh CLI 向本机缓存目录写入日志压缩包时被系统拒绝 (${err.trim().slice(0, 200)})。建议检查 gh 缓存目录（如 %LocalAppData%\\GitHub CLI）的写权限后重试，或改用 github_api 拉取日志端点。`,
                            };
                        }
                        throw new Error(res.error);
                    }
                    return { result: res.rawOutput || '未找到失败步骤的日志' };
                }
                case 'workflow_list': {
                    // 字段集为 gh 2.96 实测合法全集（仅 4 个，无 updatedAt——勘误 E1）。
                    // --all 暴露 disabled（排障语义：默认 active-only 对 Agent 是陷阱，D6 决策）。
                    const listCmd = ['workflow', 'list', ...repoArgs, '--json', 'id,name,path,state', '-L', String(typeof args.limit === 'number' && args.limit > 0 ? args.limit : Math.min(executor.defaultListLimit ?? 10, 50))];
                    if (args.all === true)
                        listCmd.push('--all');
                    const res = await executor.run(listCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return normalizeOutput(res.data || res.rawOutput);
                }
                case 'workflow_view': {
                    if (!args.workflow)
                        throw new Error('workflow_view 必须提供 workflow（工作流名称、ID 或文件名）');
                    // gh workflow view 不支持 --json（勘误 E2，实测 unknown flag）——rawText 直通，
                    // 仅头部三行结构化抽取；Recent runs 表保留原文（那是 run list 的投影，
                    // Agent 要结构化运行数据走 github_run action:'list'，工具各司其职，D4 决策）。
                    const res = await executor.run(['workflow', 'view', args.workflow, ...repoArgs], { ...runOpts, rawText: true, timeoutMs: 20_000 });
                    if (!res.ok)
                        throw new Error(res.error);
                    const text = res.rawOutput || '';
                    const idMatch = /^ID:\s*(\S+)/m.exec(text);
                    const totalMatch = /^Total runs\s+(\S+)/m.exec(text);
                    // 首行是「名称 - 文件名」组合行（实测形态），整行保留作 workflow 标识
                    const firstLine = text.split('\n', 1)[0]?.trim() || args.workflow;
                    const recentIdx = text.indexOf('Recent runs');
                    return {
                        workflow: firstLine,
                        id: idMatch ? idMatch[1] : undefined,
                        totalRuns: totalMatch ? totalMatch[1] : undefined,
                        recentRuns: recentIdx >= 0 ? text.slice(recentIdx).trim() : text.trim(),
                    };
                }
                case 'workflow_enable':
                case 'workflow_disable': {
                    if (!args.workflow)
                        throw new Error(`${args.action} 必须提供 workflow（工作流名称、ID 或文件名）`);
                    // 可逆状态开关免 confirm（S3 方案 D4），但 disable 的后果（trigger 静默失败）
                    // 必须写进返回——Agent 不知情会把 CI 故障误判为代码问题
                    const res = await executor.run(['workflow', args.action === 'workflow_enable' ? 'enable' : 'disable', args.workflow, ...repoArgs], runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return args.action === 'workflow_disable'
                        ? { message: `工作流「${args.workflow}」已禁用。注意：下次 trigger 将静默失败，直至重新 enable（workflow_enable）。` }
                        : { message: `工作流「${args.workflow}」已启用，恢复可触发状态。` };
                }
                case 'download': {
                    if (!args.run_id)
                        throw new Error('download 操作必须提供 run_id');
                    if (args.name && typeof args.name !== 'string')
                        throw new Error('name 必须是字符串（artifact 名称过滤）');
                    // run_id 必须是纯数字：它既是 gh run download 的位置参数，也是落盘目录的一段。
                    // 不校验时 "../../../../windows" 会被 path.join 归一化成沙箱外的目录（实测可越界写盘）。
                    const runIdStr = String(args.run_id).trim();
                    if (!/^\d+$/.test(runIdStr)) {
                        throw new Error(`run_id 必须是纯数字的运行 ID（实际收到 "${runIdStr}"）。`);
                    }
                    // GHSA-39wj-f2f4-978v（gh<2.102 符号链接路径穿越）防线：落盘目录由插件固定派生
                    // （owner/repo/run_id 三级），不暴露 dir 参数给用户。数字校验已挡住 ".."，
                    // 这里再做一次包含性复核，把路径拼接的语义边界显式钉住，防止将来改派生逻辑时回归。
                    const artifactsBase = path.resolve(os.homedir(), '.dsh', 'data', 'dsh-github-flow', 'artifacts');
                    const artifactsRoot = path.resolve(artifactsBase, ...repoTarget.split('/'), runIdStr);
                    if (!artifactsRoot.startsWith(artifactsBase + path.sep)) {
                        throw new Error('artifact 落盘目录越界，已拒绝。');
                    }
                    fs.mkdirSync(artifactsRoot, { recursive: true });
                    const dlCmd = ['run', 'download', runIdStr, ...repoArgs, '-D', artifactsRoot];
                    if (args.name) {
                        dlCmd.push('-n', args.name);
                    }
                    const res = await executor.run(dlCmd, { ...runOpts, timeoutMs: 120_000 });
                    if (!res.ok)
                        throw new Error(res.error);
                    // 落盘清单：递归枚举产物文件（相对路径+大小），供 Agent 直接引用
                    const files = [];
                    const walk = (dir, prefix) => {
                        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                            const full = path.join(dir, entry.name);
                            const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
                            if (entry.isDirectory())
                                walk(full, rel);
                            else
                                files.push({ file: rel, size: fs.statSync(full).size });
                        }
                    };
                    walk(artifactsRoot, '');
                    // GHSA-39wj-f2f4-978v：2.102.0 修复符号链接路径穿越。低版本不硬拒绝
                    // （受控仓库下载是合理需求），但安全提示必须进返回值引导升级。
                    const ghVersion = await executor.getGhVersion();
                    const securityNote = ghVersion && compareGhVersions(ghVersion, '2.102.0') < 0
                        ? `安全提示：当前 gh ${ghVersion} 低于 2.102.0（修复 GHSA-39wj-f2f4-978v 符号链接路径穿越）。建议升级 gh（Windows: winget upgrade GitHub.cli / macOS: brew upgrade gh）。`
                        : undefined;
                    return {
                        message: `Run #${args.run_id} 产物已下载 ${files.length} 个文件${args.name ? `（过滤: ${args.name}）` : ''}`,
                        directory: artifactsRoot,
                        files,
                        ...(securityNote ? { securityNote } : {}),
                    };
                }
                case 'trigger': {
                    if (!args.workflow)
                        throw new Error('trigger 操作必须提供 workflow（工作流名称或文件名，例如 "pr-check.yml"）');
                    const trigCmd = ['workflow', 'run', args.workflow, ...repoArgs];
                    if (args.ref) {
                        trigCmd.push('--ref', args.ref);
                    }
                    if (args.inputs && typeof args.inputs === 'object') {
                        for (const [k, v] of Object.entries(args.inputs)) {
                            if (v !== undefined && v !== null) {
                                trigCmd.push('-f', `${k}=${String(v)}`);
                            }
                        }
                    }
                    const res = await executor.run(trigCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return { message: `已成功触发工作流「${args.workflow}」运行`, output: res.rawOutput || 'Workflow dispatched' };
                }
                case 'rerun': {
                    if (!args.run_id)
                        throw new Error('rerun 操作必须提供 run_id');
                    const res = await executor.run(['run', 'rerun', String(args.run_id), ...repoArgs, '--failed'], runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return { message: '已成功重新触发失败任务', output: res.rawOutput };
                }
                case 'cancel': {
                    if (!args.run_id)
                        throw new Error('cancel 操作必须提供 run_id');
                    const res = await executor.run(['run', 'cancel', String(args.run_id), ...repoArgs], runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return { message: '已取消该工作流任务', output: res.rawOutput };
                }
                default:
                    throw new Error(`未知的 Run 操作: ${args.action}`);
            }
        },
    });
}
