import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
/**
 * 保护 Agent 上下文的单次返回长度安全上限（约 5000 tokens）
 * 避免大型 PR diff 或海量日志导致后续会话上下文溢出崩溃
 */
const MAX_SAFE_OUTPUT_CHARS = 24_000;
export class GhExecutor {
    defaultTimeoutMs;
    constructor(defaultTimeoutMs = 30_000) {
        this.defaultTimeoutMs = defaultTimeoutMs;
    }
    /**
     * 安全执行 gh 命令
     * 采用 execFile 参数数组隔离，彻底杜绝 Shell 字符串拼接注入漏洞
     */
    async run(args, options = {}) {
        const cwd = options.cwd || process.cwd();
        const timeout = options.timeoutMs || this.defaultTimeoutMs;
        try {
            const { stdout, stderr } = await execFileAsync('gh', args, {
                cwd,
                timeout,
                maxBuffer: 15 * 1024 * 1024, // 15MB 进程缓冲
                env: {
                    ...process.env,
                    GH_NO_UPDATE_NOTIFIER: '1', // 禁用 CLI 版本更新检查，避免污染 stdout
                    NO_COLOR: '1', // 禁用 ANSI 颜色转义字符
                    ...options.env,
                },
            });
            let rawOutput = (stdout || '').trim();
            if (!rawOutput && stderr) {
                rawOutput = stderr.trim();
            }
            let truncated = false;
            if (rawOutput.length > MAX_SAFE_OUTPUT_CHARS) {
                // 保留前 8000 字符和尾部 12000 字符，保留开头上下文和错误尾部
                const head = rawOutput.slice(0, 8_000);
                const tail = rawOutput.slice(-12_000);
                rawOutput = `${head}\n\n... [⚠️ 提示：内容过长已由 DSH GitHub 插件截断中间部分，当前截取前 8KB 与后 12KB] ...\n\n${tail}`;
                truncated = true;
            }
            // 如果未被截断且命令带有 --json 或包含 api，尝试解析为 JSON
            if (!options.rawText && !truncated && (args.includes('--json') || args.includes('api'))) {
                try {
                    const parsed = JSON.parse(rawOutput);
                    return { ok: true, data: parsed, rawOutput, truncated: false };
                }
                catch {
                    // 部分特殊命令可能输出空数组或文本，降级为 rawOutput
                    return { ok: true, rawOutput, truncated };
                }
            }
            return { ok: true, rawOutput, truncated };
        }
        catch (err) {
            let friendlyError = err.message || '执行失败';
            if (err.code === 'ENOENT') {
                friendlyError = '系统未检测到 GitHub CLI (gh)。请先在系统终端安装: Windows 运行 `winget install GitHub.cli`，macOS 运行 `brew install gh`。';
            }
            else if (err.killed && err.signal === 'SIGTERM') {
                friendlyError = `GitHub CLI 命令执行超时 (${timeout}ms)。请检查网络连通性。`;
            }
            else if (err.stderr) {
                const stderrText = String(err.stderr).trim();
                if (stderrText.includes('gh auth login') || stderrText.includes('authentication required')) {
                    friendlyError = 'GitHub 尚未登录。请在系统终端执行 `gh auth login`，或在聊天框输入 `/gh status` 查看诊断。';
                }
                else {
                    friendlyError = stderrText;
                }
            }
            return {
                ok: false,
                error: friendlyError,
            };
        }
    }
    /**
     * 检查宿主机当前 GitHub CLI 的认证状态与账号信息
     */
    async checkAuth(cwd) {
        const res = await this.run(['auth', 'status'], { cwd, timeoutMs: 10_000, rawText: true });
        const raw = (res.rawOutput || '') + '\n' + (res.error || '');
        const loggedIn = raw.includes('Logged in to') || raw.includes('✓');
        // 只要已登录或有常规输出，则必然安装了 gh
        const isNotInstalled = Boolean(res.error && res.error.includes('系统未检测到 GitHub CLI'));
        const installed = loggedIn || !isNotInstalled;
        if (!installed) {
            return {
                installed: false,
                loggedIn: false,
                platform: process.platform,
                raw: res.error,
            };
        }
        if (!loggedIn) {
            return {
                installed: true,
                loggedIn: false,
                platform: process.platform,
                raw,
            };
        }
        // 解析用户名
        let user;
        const accountMatch = raw.match(/account\s+([A-Za-z0-9_-]+)/i);
        if (accountMatch) {
            user = accountMatch[1];
        }
        // 解析 Token scopes
        let scopes;
        const scopesMatch = raw.match(/Token scopes:\s*([^\r\n]+)/i);
        if (scopesMatch) {
            scopes = scopesMatch[1]
                .split(',')
                .map((s) => s.replace(/['"`]/g, '').trim())
                .filter(Boolean);
        }
        return {
            installed: true,
            loggedIn: true,
            platform: process.platform,
            user,
            host: 'github.com',
            activeAccount: raw.includes('Active account: true'),
            scopes,
            raw,
        };
    }
    /**
     * 获取当前目录（工作区）关联的远程仓库元数据
     * 采用 gh repo view + 本地 git remote 双保险机制，彻底杜绝已配置远程却误判未关联的问题
     */
    async getRepoMetadata(cwd) {
        const targetCwd = cwd || process.cwd();
        // 1. 优先尝试由 gh 直接根据当前上下文识别
        const res = await this.run(['repo', 'view', '--json', 'nameWithOwner,name,owner,defaultBranchRef,description,isPrivate,url'], { cwd: targetCwd, timeoutMs: 10_000 });
        if (res.ok && res.data && res.data.nameWithOwner) {
            const d = res.data;
            return {
                nameWithOwner: d.nameWithOwner || '',
                name: d.name || '',
                owner: d.owner?.login || '',
                defaultBranch: d.defaultBranchRef?.name || 'main',
                description: d.description || '',
                isPrivate: Boolean(d.isPrivate),
                url: d.url || `https://github.com/${d.nameWithOwner}`,
            };
        }
        // 2. 双保险兜底：如果 gh 未能自动推断（如当前分支未推送到 upstream），直接解析本地 git remote
        try {
            const { execFile } = await import('node:child_process');
            const { promisify } = await import('node:util');
            const execAsync = promisify(execFile);
            const { stdout: remoteOut } = await execAsync('git', ['remote', '-v'], { cwd: targetCwd });
            if (remoteOut) {
                // 匹配 github.com 格式：git@github.com:owner/repo.git 或 https://github.com/owner/repo.git
                const match = remoteOut.match(/github\.com[:/]([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?(?:\s|\()/i);
                if (match) {
                    const owner = match[1];
                    const repoName = match[2];
                    const nameWithOwner = `${owner}/${repoName}`;
                    // 使用提取出的精确 owner/repo 向 gh 获取元数据
                    const directRes = await this.run(['repo', 'view', nameWithOwner, '--json', 'nameWithOwner,name,owner,defaultBranchRef,description,isPrivate,url'], { cwd: targetCwd, timeoutMs: 10_000 });
                    if (directRes.ok && directRes.data && directRes.data.nameWithOwner) {
                        const d = directRes.data;
                        return {
                            nameWithOwner: d.nameWithOwner || nameWithOwner,
                            name: d.name || repoName,
                            owner: d.owner?.login || owner,
                            defaultBranch: d.defaultBranchRef?.name || 'main',
                            description: d.description || '',
                            isPrivate: Boolean(d.isPrivate),
                            url: d.url || `https://github.com/${nameWithOwner}`,
                        };
                    }
                    // 若离线或网络受限，由本地 git remote 配置兜底返回
                    return {
                        nameWithOwner,
                        name: repoName,
                        owner,
                        defaultBranch: 'main',
                        description: '已成功关联本地 Git 远程仓库',
                        isPrivate: false,
                        url: `https://github.com/${nameWithOwner}`,
                    };
                }
            }
        }
        catch {
            // 本地无 git 或无 remote 配置
        }
        return null;
    }
}
