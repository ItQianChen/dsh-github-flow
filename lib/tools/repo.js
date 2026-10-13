import { renderRepoMarkdown } from '../renderers/markdown.js';
import { extractReadmeImageUrls, downloadImages, buildImageBlocks, filterRequestedUrls } from './image-utils.js';
function normalizeOutput(data) {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        return data;
    }
    if (Array.isArray(data)) {
        return { items: data, count: data.length };
    }
    return { result: data !== undefined && data !== null ? data : '' };
}
export function createRepoTool(executor) {
    return {
        name: 'github_repo',
        description: '查看 GitHub 仓库元数据、同步 Fork 仓库主干 (sync) 与跨仓库检索代码。默认查询当前工作区关联的仓库。',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['view', 'readme', 'search_code', 'search_repos', 'sync'],
                    description: '仓库操作类型。readme 读取 README 原文并附带图片清单（可选 image_urls 下载指定图片，不传下载全部截图；默认过滤徽章小图标）。',
                },
                repo: {
                    type: 'string',
                    description: '目标仓库 [owner/repo]，留空则识别当前仓库。',
                },
                image_urls: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'readme 可选：仅下载指定 URL 的图片（从 readme 返回的 images 清单中选取）。留空下载全部。',
                },
                include_badges: {
                    type: 'boolean',
                    description: 'readme 可选：保留徽章类小图标（shields.io 等，默认过滤）。需要检查徽章状态时开启。',
                },
                query: {
                    type: 'string',
                    description: '检索关键词（search_code 或 search_repos 时使用）。',
                },
                limit: {
                    type: 'number',
                    description: '返回条数，默认 10。',
                },
                branch: {
                    type: 'string',
                    description: '要同步的分支名（sync 动作使用，默认主分支如 main）。',
                },
                source: {
                    type: 'string',
                    description: '上游源仓库 [owner/repo]（sync 动作使用，留空自动匹配 upstream 远程配置）。',
                },
                force: {
                    type: 'boolean',
                    description: '是否强制硬重置同步（sync 动作使用，映射为 --force，解决分叉冲突）。默认 false。',
                },
            },
            required: ['action'],
        },
        output: {
            schema: { type: 'object' },
            render(args, value) {
                return [{ type: 'text', text: renderRepoMarkdown(args, value) }, ...buildImageBlocks(value)];
            },
        },
        async execute(args, execContext) {
            const cwd = execContext?.cwd || process.cwd();
            const sessionId = execContext?.sessionId || execContext?.session?.id || process.env.DSH_SESSION_ID;
            // 显式 limit 优先；缺省回退 executor.defaultListLimit（用户可在插件配置中调整）
            const limitStr = String(typeof args.limit === 'number' && args.limit > 0 ? args.limit : Math.min(executor.defaultListLimit ?? 10, 50));
            const runOpts = { cwd, sessionId };
            switch (args.action) {
                case 'view': {
                    let repoTarget = args.repo;
                    let meta = null;
                    if (!repoTarget) {
                        meta = await executor.getRepoMetadata(cwd, sessionId);
                        if (meta?.nameWithOwner) {
                            repoTarget = meta.nameWithOwner;
                        }
                    }
                    const repoArgs = repoTarget ? [repoTarget] : [];
                    const res = await executor.run(['repo', 'view', ...repoArgs, '--json', 'nameWithOwner,description,defaultBranchRef,isPrivate,stargazerCount,forkCount,url,repositoryTopics,licenseInfo'], runOpts);
                    if (!res.ok) {
                        // 若执行 gh 失败（如离线或环境限制），但本地已成功识别仓库元数据，进行优雅兜底返回
                        if (meta && meta.nameWithOwner) {
                            return normalizeOutput(meta);
                        }
                        throw new Error(res.error);
                    }
                    return normalizeOutput(res.data || res.rawOutput);
                }
                case 'readme': {
                    let repoTarget = args.repo;
                    if (!repoTarget) {
                        const meta = await executor.getRepoMetadata(cwd, sessionId);
                        if (meta?.nameWithOwner)
                            repoTarget = meta.nameWithOwner;
                    }
                    if (!repoTarget)
                        throw new Error('readme 操作必须提供 repo [owner/repo]，或在关联 Git 远程的工作区运行');
                    const [owner, repoName] = repoTarget.split('/');
                    if (!owner || !repoName)
                        throw new Error(`readme 需要 [owner/repo] 形式的仓库名（实际: ${repoTarget}）`);
                    // ① 取 README 原文（raw 头与 github_api 的 raw 模式同款技术，输出纯 Markdown）
                    const rawRes = await executor.run(['api', `repos/${owner}/${repoName}/readme`, '-H', 'Accept: application/vnd.github.raw'], { ...runOpts, rawText: true, timeoutMs: 20_000 });
                    if (!rawRes.ok)
                        throw new Error(rawRes.error);
                    const readmeText = rawRes.rawOutput || '';
                    // ② 默认分支：先本地 view 元数据拿（一次 API），失败兜底 main
                    let branch = 'main';
                    const metaRes = await executor.run(['repo', 'view', repoTarget, '--json', 'defaultBranchRef'], runOpts);
                    if (metaRes.ok && metaRes.data?.defaultBranchRef?.name) {
                        branch = metaRes.data.defaultBranchRef.name;
                    }
                    // ③ 提取图片：绝对 URL + 相对路径解析为 raw URL，默认滤徽章
                    const { urls: extracted, relativeResolved, badgeFiltered } = extractReadmeImageUrls(readmeText, {
                        owner, repo: repoName, branch, includeBadges: args.include_badges === true,
                    });
                    // 不带 image_urls：返回文本（截断保护）+ 清单，Agent 按需再取图
                    if (args.image_urls === undefined) {
                        return {
                            message: `已获取 ${repoTarget} 的 README（${readmeText.length} 字符${badgeFiltered ? `，过滤 ${badgeFiltered} 个徽章图标` : ''}${relativeResolved ? `，解析 ${relativeResolved} 个仓库内相对路径图片` : ''}）`,
                            readme: readmeText.length > 6000 ? readmeText.slice(0, 6000) + '\n\n…(已截断，完整内容见仓库)' : readmeText,
                            images: extracted,
                            branch,
                        };
                    }
                    // ④ 带 image_urls：交集校验 + 下载（语义与 issue/pr view_images 完全一致）
                    if (!Array.isArray(args.image_urls) || args.image_urls.length === 0) {
                        throw new Error('image_urls 为空数组：如需下载全部请省略该参数，如需指定请传入 readme 返回清单中的 URL。');
                    }
                    if (extracted.length === 0) {
                        return { message: `${repoTarget} 的 README 中未发现图片附件（徽章已过滤，可用 include_badges: true 保留）。` };
                    }
                    const filtered = filterRequestedUrls(args.image_urls, extracted);
                    const targets = filtered.matched;
                    const rejections = filtered.rejected.map((b) => `${String(b).slice(-24)}: 不在 README 图片清单中，已拒绝（防任意下载）`);
                    const { images, failures: dlFailures, remaining } = await downloadImages(targets, (url) => executor.run(['api', url], { ...runOpts, binary: true, timeoutMs: 30_000 }));
                    const failures = [...rejections, ...dlFailures];
                    if (images.length === 0) {
                        return { message: `${repoTarget} README 图片未能获取（请求 ${targets.length} 张，被拒 ${rejections.length} 张）`, failures, remaining };
                    }
                    return {
                        message: `${repoTarget} README 成功获取 ${images.length} 张图片${failures.length ? `（${failures.length} 条失败/提示）` : ''}：`,
                        images,
                        failures: failures.length ? failures : undefined,
                        remaining,
                    };
                }
                case 'search_code': {
                    if (!args.query)
                        throw new Error('search_code 必须提供 query');
                    const repoArgs = args.repo ? ['--repo', args.repo] : [];
                    const res = await executor.run(['search', 'code', args.query, ...repoArgs, '--json', 'path,repository,textMatches', '-L', limitStr], runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return normalizeOutput(res.data || res.rawOutput);
                }
                case 'search_repos': {
                    if (!args.query)
                        throw new Error('search_repos 必须提供 query');
                    const res = await executor.run(['search', 'repos', args.query, '--json', 'fullName,description,stargazersCount,updatedAt', '-L', limitStr], runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return normalizeOutput(res.data || res.rawOutput);
                }
                case 'sync': {
                    let repoTarget = args.repo;
                    if (!repoTarget) {
                        const meta = await executor.getRepoMetadata(cwd, sessionId);
                        if (meta?.nameWithOwner) {
                            repoTarget = meta.nameWithOwner;
                        }
                    }
                    const syncCmd = ['repo', 'sync'];
                    if (repoTarget) {
                        syncCmd.push(repoTarget);
                    }
                    if (args.branch) {
                        syncCmd.push('--branch', args.branch);
                    }
                    if (args.source) {
                        syncCmd.push('--source', args.source);
                    }
                    if (args.force === true) {
                        syncCmd.push('--force');
                    }
                    const res = await executor.run(syncCmd, runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return { message: 'Fork 仓库同步成功，已与上游主干对齐', output: res.rawOutput || 'Synced' };
                }
                default:
                    throw new Error(`未知的 Repo 操作: ${args.action}`);
            }
        },
    };
}
