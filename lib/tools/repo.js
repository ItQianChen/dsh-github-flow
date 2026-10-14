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
                    enum: ['view', 'readme', 'search_code', 'search_repos', 'search_issues', 'search_prs', 'search_commits', 'read_file', 'read_dir', 'sync'],
                    description: '仓库操作类型。readme 读取 README 原文并附带图片清单（可选 image_urls 下载指定图片，不传下载全部截图；默认过滤徽章小图标）。read_file/read_dir 免 clone 读取任意路径文件与目录（gh ≥2.95，低版本自动降级 API 链路）。',
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
                    description: '检索关键词（search_* 动作使用）。限定符直接写进 query（gh 惯例）：如 "repo:owner/name state:open label:bug"。注意 search_code/search_commits 必须包含搜索文本，纯限定符查询（如仅 "repo:x"）会被 gh 拒绝。',
                },
                path: {
                    type: 'string',
                    description: 'read_file 必填 / read_dir 可选（默认仓库根目录）：目标文件或目录路径（如 "src/tools/pr.ts"、".github/workflows"）。',
                },
                ref: {
                    type: 'string',
                    description: 'read_file/read_dir 可选：从指定分支/tag/commit 读取（默认默认分支）。',
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
                case 'search_issues':
                case 'search_prs': {
                    if (!args.query)
                        throw new Error(`${args.action} 必须提供 query`);
                    // 限定符（repo:/state:/label: 等）直接写进 query 本体（gh search 惯例），
                    // 不做独立参数——参数爆炸 + 与 gh 手册心智模型分叉（D3 决策）。
                    // prs 比 issues 多 isDraft 字段（实测合法集 18 vs 17）。
                    const repoArgs = args.repo ? ['--repo', args.repo] : [];
                    const fields = args.action === 'search_prs'
                        ? 'number,title,state,author,labels,isDraft,updatedAt,url'
                        : 'number,title,state,author,labels,updatedAt,url';
                    const res = await executor.run(['search', args.action === 'search_prs' ? 'prs' : 'issues', args.query, ...repoArgs, '--json', fields, '-L', limitStr], runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return normalizeOutput(res.data || res.rawOutput);
                }
                case 'search_commits': {
                    if (!args.query)
                        throw new Error('search_commits 必须提供 query');
                    const repoArgs = args.repo ? ['--repo', args.repo] : [];
                    const res = await executor.run(['search', 'commits', args.query, ...repoArgs, '--json', 'sha,commit,author,repository,url', '-L', limitStr], runOpts);
                    if (!res.ok)
                        throw new Error(res.error);
                    return normalizeOutput(res.data || res.rawOutput);
                }
                case 'read_file': {
                    if (!args.path)
                        throw new Error('read_file 必须提供 path（目标文件路径，如 "package.json"）');
                    let repoTarget = args.repo;
                    if (!repoTarget) {
                        const meta = await executor.getRepoMetadata(cwd, sessionId);
                        if (meta?.nameWithOwner)
                            repoTarget = meta.nameWithOwner;
                    }
                    if (!repoTarget)
                        throw new Error('read_file 必须提供 repo [owner/repo]，或在关联 Git 远程的工作区运行');
                    const [owner, repoName] = repoTarget.split('/');
                    if (!owner || !repoName)
                        throw new Error(`read_file 需要 [owner/repo] 形式的仓库名（实际: ${repoTarget}）`);
                    // 主链路走管道直出（无 --json）：gh 把原始内容写 stdout，executor 的
                    // 24KB 截断与 UTF-8 处理免费复用；--json 模式 content 是 base64，
                    // 中段截断即废且需解码 dance，弃用。
                    const refArgs = args.ref ? ['--ref', args.ref] : [];
                    const res = await executor.runGuarded(['repo', 'read-file', args.path, '-R', repoTarget, ...refArgs], {
                        ...runOpts,
                        rawText: true,
                        timeoutMs: 20_000,
                        minVersion: '2.95.0',
                        capability: 'gh repo read-file',
                        // 降级链：contents 端点 raw Accept（readme 同款技术），与主链路输出同构。
                        // ref 必须走 URL query 而非 -f：gh api 在带 -f 时会把 GET 隐式改写为
                        // POST（api.ts:66 同坑），contents 端点 POST 直接 404。
                        fallback: async () => {
                            const encoded = args.path.split('/').map(encodeURIComponent).join('/');
                            const refQuery = args.ref ? `?ref=${encodeURIComponent(args.ref)}` : '';
                            return executor.run(['api', `repos/${owner}/${repoName}/contents/${encoded}${refQuery}`, '-H', 'Accept: application/vnd.github.raw'], { cwd, sessionId, rawText: true, timeoutMs: 20_000 });
                        },
                    });
                    if (!res.ok)
                        throw new Error(res.error);
                    const content = res.rawOutput || '';
                    // 二进制防线：NUL 字节是文本内容的可靠否定信号（UTF-8 合法文本不含 NUL）。
                    // 不做 base64 直返——那会撑爆 Token 预算，引导 github_api binary channel。
                    if (content.includes('\0')) {
                        throw new Error(`「${args.path}」是二进制文件（检测到 NUL 字节），不适合文本读取。请改用 github_api(endpoint: 'repos/${owner}/${repoName}/contents/${args.path.split('/').map(encodeURIComponent).join('/')}', raw: true, binary 场景自行落盘) 获取字节流。`);
                    }
                    return { path: args.path, ref: args.ref, content, size: content.length, ...(res.degraded ? { degraded: res.degraded, degradedReason: res.degradedReason } : {}) };
                }
                case 'read_dir': {
                    let repoTarget = args.repo;
                    if (!repoTarget) {
                        const meta = await executor.getRepoMetadata(cwd, sessionId);
                        if (meta?.nameWithOwner)
                            repoTarget = meta.nameWithOwner;
                    }
                    if (!repoTarget)
                        throw new Error('read_dir 必须提供 repo [owner/repo]，或在关联 Git 远程的工作区运行');
                    const [owner, repoName] = repoTarget.split('/');
                    if (!owner || !repoName)
                        throw new Error(`read_dir 需要 [owner/repo] 形式的仓库名（实际: ${repoTarget}）`);
                    const refArgs = args.ref ? ['--ref', args.ref] : [];
                    const dirPath = args.path || '';
                    const res = await executor.runGuarded(['repo', 'read-dir', ...(dirPath ? [dirPath] : []), '-R', repoTarget, ...refArgs], {
                        ...runOpts,
                        rawText: true,
                        timeoutMs: 20_000,
                        minVersion: '2.95.0',
                        capability: 'gh repo read-dir',
                        // 降级链：contents 端点返回 JSON 数组（dir 为含 type 字段的对象）。
                        // ref 同样走 URL query（-f 会把 GET 改写成 POST，见 read_file 注释）
                        fallback: async () => {
                            const encoded = dirPath.split('/').filter(Boolean).map(encodeURIComponent).join('/');
                            const refQuery = args.ref ? `?ref=${encodeURIComponent(args.ref)}` : '';
                            return executor.run(['api', `repos/${owner}/${repoName}/contents/${encoded}${refQuery}`], { cwd, sessionId, timeoutMs: 20_000 });
                        },
                    });
                    if (!res.ok)
                        throw new Error(res.error);
                    // 双链路归一为 items 数组：
                    // 主链路是 TSV 四列（type/name/mode/size），降级链 data 是 contents JSON 数组
                    let items;
                    if (res.degraded && Array.isArray(res.data)) {
                        items = res.data.map((e) => ({ type: String(e.type || 'file'), name: String(e.name || ''), mode: '-', size: typeof e.size === 'number' ? e.size : undefined }));
                    }
                    else {
                        const tsv = (res.rawOutput || '').trim();
                        if (!tsv) {
                            return { message: `「${dirPath || '/'}」是空目录或不存在`, items: [], count: 0, ...(res.degraded ? { degraded: res.degraded, degradedReason: res.degradedReason } : {}) };
                        }
                        items = tsv.split('\n').map((line) => {
                            const cols = line.split('\t');
                            return { type: cols[0] || 'file', name: cols[1] || '', mode: cols[2] || '-', size: Number(cols[3]) || 0 };
                        });
                    }
                    return { path: dirPath || '/', items, count: items.length, ...(res.degraded ? { degraded: res.degraded, degradedReason: res.degradedReason } : {}) };
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
