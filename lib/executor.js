import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { findMostRecentWorkspacePath, findWorkspacePathBySession, hasGitDir } from './workspace.js';
const execFileAsync = promisify(execFile);
/** 认证状态缓存时长。用户手动 `gh auth login/logout` 后最多 30 秒内面板才会反映，属可接受代价 */
const AUTH_CACHE_TTL_MS = 30_000;
/**
 * 按码点安全截取字符串，等价于 String.prototype.slice 但对孤立的代理对（surrogate pair）做占位替换。
 * 为什么必须这样截：本文件末尾会按 UTF-8 字节数截断，而 node:child_process 把 stdout 按字节缓冲区
 * 切分后再 toString('utf8')，一个汉字被从中间切开时会变成 U+FFFD 替换字符。直接用 slice 会把半截
 * 代理对留在结果里，导致下游 JSON.stringify 产出孤立转义序列、写入文件时编码报错。
 */
function safeSlice(input, start, end) {
    const chars = Array.from(input);
    const from = Math.max(0, start);
    const to = end === undefined ? chars.length : Math.max(from, end);
    return chars.slice(from, to).map((c) => (c.length === 1 && c.charCodeAt(0) >= 0xd800 && c.charCodeAt(0) <= 0xdfff ? '\ufffd' : c)).join('');
}
/**
 * 以 UTF-8 字节数（而非字符串长度）为口径，从两端保留内容。
 * 为什么需要：maxOutputChars 数的是字符，中文一个字占 3 字节。只按字符限长时，
 * 中文环境下真实放行的字节量可达标称值的数倍，Token 预算保护会失真。
 * 采用二分查找定位截断点，避免对超大输出逐字符累加造成 O(n) 反复编码。
 */
function cutByUtf8Bytes(input, headBytes, tailBytes) {
    const encoder = new TextEncoder();
    const totalBytes = encoder.encode(input).length;
    if (totalBytes <= headBytes + tailBytes) {
        return { head: input, tail: '', keptHeadBytes: totalBytes, keptTailBytes: 0, truncated: false };
    }
    const chars = Array.from(input);
    const atByte = (limit, fromEnd) => {
        let lo = 0;
        let hi = chars.length;
        let bytes = 0;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            const slice = fromEnd ? chars.slice(chars.length - mid) : chars.slice(0, mid);
            const size = encoder.encode(slice.join('')).length;
            if (size <= limit) {
                lo = mid;
                bytes = size;
            }
            else {
                hi = mid - 1;
            }
        }
        return { count: lo, bytes };
    };
    const headPart = atByte(headBytes, false);
    const tailPart = atByte(tailBytes, true);
    return {
        head: safeSlice(input, 0, headPart.count),
        tail: safeSlice(input, chars.length - tailPart.count),
        keptHeadBytes: headPart.bytes,
        keptTailBytes: tailPart.bytes,
        truncated: true,
    };
}
/**
 * 按「字符数 + UTF-8 字节数」双口径截断输出。
 * 抽成纯函数是刻意的：截断逻辑是崩溃高发区（切碎多字节字符、误伤 JSON、把二进制流截成垃圾），
 * 但通过真实 gh 命令很难稳定复现超限输出，抽出来才能用单元测试覆盖边界。
 */
export function truncateOutput(input, maxChars, maxBytes) {
    // 双重口径限长：字符数守住 Token 预算，字节数守住真实传输量。
    // 中文场景下两者会分别触发，因此两条路径的提示文案必须区分，避免用户按错误的配置项去调参。
    if (input.length > maxChars) {
        // 保留前 1/3 字符和尾部 1/2 字符，保留开头上下文和错误尾部
        const headLen = Math.floor(maxChars * 0.35);
        const tailLen = Math.floor(maxChars * 0.55);
        const head = safeSlice(input, 0, headLen);
        const tail = safeSlice(input, input.length - tailLen);
        return {
            text: `${head}\n\n... [⚠️ 提示：内容过长已由 DSH GitHub 插件截断中间部分，当前截取前 ${Math.round(headLen / 1024)}KB 与后 ${Math.round(tailLen / 1024)}KB] ...\n\n${tail}`,
            truncated: true,
        };
    }
    const byteCut = cutByUtf8Bytes(input, Math.floor(maxBytes * 0.35), Math.floor(maxBytes * 0.55));
    if (byteCut.truncated) {
        // 这里必须用「实际保留的字节数」而非 maxChars 推导值：字节口径触发时 maxChars 往往远大于
        // 字节上限，早先版本照抄字符分支的算法，会报出与实际严重不符的「已保留 100KB」（实际仅数百字节）。
        return {
            text: `${byteCut.head}\n\n... [⚠️ 提示：内容超出 UTF-8 字节上限 (${maxBytes} bytes) 已截断中间部分，实际保留前 ${byteCut.keptHeadBytes} 字节与后 ${byteCut.keptTailBytes} 字节；如需放宽请调大配置项 maxOutputBytes] ...\n\n${byteCut.tail}`,
            truncated: true,
        };
    }
    return { text: input, truncated: false };
}
export class GhExecutor {
    ghPath;
    defaultTimeoutMs;
    maxOutputChars;
    /** UTF-8 字节口径的硬上限；未配置时按 maxOutputChars × 4 推导（覆盖 CJK 3 字节与 emoji 4 字节） */
    maxOutputBytes;
    /** 认证状态缓存。`gh auth status` 实测 5.4 秒，而它位于全局驾驶舱关键路径的最前面 */
    authCache = null;
    constructor(config = {}) {
        this.ghPath = config.ghPath || 'gh';
        this.defaultTimeoutMs = config.defaultTimeoutMs || 30_000;
        this.maxOutputChars = config.maxOutputChars || 24_000;
        this.maxOutputBytes = config.maxOutputBytes || this.maxOutputChars * 4;
    }
    updateConfig(config = {}) {
        if (config.ghPath)
            this.ghPath = config.ghPath;
        if (config.defaultTimeoutMs)
            this.defaultTimeoutMs = config.defaultTimeoutMs;
        if (config.maxOutputChars) {
            this.maxOutputChars = config.maxOutputChars;
            if (!config.maxOutputBytes)
                this.maxOutputBytes = config.maxOutputChars * 4;
        }
        if (config.maxOutputBytes)
            this.maxOutputBytes = config.maxOutputBytes;
    }
    /**
     * 智能解析最可靠的工作区物理路径：
     * 1. 优先使用显式指定的有效 cwd（若包含 .git 目录）
     * 2. 读取当前进程/会话的 DSH_SESSION_ID 并匹配 ~/.dsh/storages/workspace.json
     * 3. 匹配 ~/.dsh/storages/workspace.json 中最近活跃的工作区
     * 4. 回退到 process.cwd()
     */
    resolveWorkspaceCwd(explicitCwd) {
        // 显式路径优先，但只认真正含 .git 的目录：调用方传进来的可能是会话根目录而非仓库目录，
        // 此时继续往下走按会话/最近活跃反查，比盲信传入值更准。
        if (explicitCwd && hasGitDir(explicitCwd)) {
            return explicitCwd;
        }
        const sessionId = process.env.DSH_SESSION_ID;
        if (sessionId) {
            const bySession = findWorkspacePathBySession(sessionId);
            if (bySession)
                return bySession;
        }
        const recent = findMostRecentWorkspacePath();
        if (recent)
            return recent;
        return explicitCwd || process.cwd();
    }
    /**
     * 安全执行 gh 命令
     * 采用 execFile 参数数组隔离，彻底杜绝 Shell 字符串拼接注入漏洞
     */
    async run(args, options = {}) {
        const cwd = this.resolveWorkspaceCwd(options.cwd);
        const timeout = options.timeoutMs || this.defaultTimeoutMs;
        try {
            const { stdout, stderr } = await execFileAsync(this.ghPath, args, {
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
            const outcome = truncateOutput(rawOutput, this.maxOutputChars, this.maxOutputBytes);
            rawOutput = outcome.text;
            const truncated = outcome.truncated;
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
     *
     * @param cwd 解析工作区用的路径
     * @param bypassCache 跳过进程内缓存。`/gh status` 这类人类显式发起的诊断必须看到实时结果，
     *   而 Web 面板每次挂载都会来问一次，重复执行实测要 5.4 秒，属于纯浪费。
     */
    async checkAuth(cwd, bypassCache = false) {
        const now = Date.now();
        if (!bypassCache && this.authCache && now - this.authCache.at < AUTH_CACHE_TTL_MS) {
            return this.authCache.value;
        }
        const value = await this.probeAuth(cwd);
        // 只缓存确定的结果：出错时（未安装/未登录/网络异常）不缓存，
        // 否则用户 `gh auth login` 之后还要再等满一个 TTL 才能看到面板恢复。
        if (value.loggedIn) {
            this.authCache = { at: now, value };
        }
        return value;
    }
    /** 生成当前操作系统平台的推荐安装引导与命令 */
    getPlatformInstallGuide() {
        const p = process.platform;
        if (p === 'win32') {
            return {
                command: 'winget install --id GitHub.cli',
                altCommand: 'scoop install gh',
                downloadUrl: 'https://cli.github.com/',
                description: '推荐使用 Windows Package Manager (winget) 一键安装，或下载官方 .msi 安装包。',
            };
        }
        if (p === 'darwin') {
            return {
                command: 'brew install gh',
                altCommand: 'port install gh',
                downloadUrl: 'https://cli.github.com/',
                description: '推荐使用 Homebrew 安装 GitHub CLI。',
            };
        }
        return {
            command: 'sudo apt install gh',
            altCommand: 'sudo dnf install gh',
            downloadUrl: 'https://cli.github.com/',
            description: '推荐使用系统包管理器安装（Debian/Ubuntu 运行 apt，Fedora/CentOS 运行 dnf）。',
        };
    }
    /** 实际执行 `gh auth status` 并解析结果，不含缓存逻辑 */
    async probeAuth(cwd) {
        const res = await this.run(['auth', 'status'], { cwd, timeoutMs: 10_000, rawText: true });
        const raw = (res.rawOutput || '') + '\n' + (res.error || '');
        const loggedIn = raw.includes('Logged in to') || raw.includes('✓');
        // 只要已登录或有常规输出，则必然安装了 gh
        const isNotInstalled = Boolean(res.error && (res.error.includes('系统未检测到 GitHub CLI') || res.error.includes('ENOENT')));
        const installed = loggedIn || !isNotInstalled;
        if (!installed) {
            return {
                installed: false,
                loggedIn: false,
                platform: process.platform,
                installGuide: this.getPlatformInstallGuide(),
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
     * 仅从本地 .git/config 解析仓库身份，绝不发起网络请求。
     *
     * 为什么需要它：全局驾驶舱要为每个工作区认识别仓库，而 getRepoMetadata 会调用
     * `gh repo view` 走网络。实测 5 个工作区时该端点冷启动 20.5 秒，其中绝大部分耗在这 5 次
     * 网络往返上——而有界并发根本救不了它，因为瓶颈是网络延迟而不是进程排队。
     * 工作区矩阵只需要「这个目录属于哪个仓库」这一身份信息，本地 .git/config 已经完整具备，
     * 描述/star 数等富字段是当前仓库详情才需要的。这一步把每个工作区从 1 次网络往返降为 0。
     */
    getRepoIdentityFromLocal(cwd) {
        const targetCwd = cwd || this.resolveWorkspaceCwd();
        try {
            const gitConfigPath = path.join(targetCwd, '.git', 'config');
            if (!fs.existsSync(gitConfigPath))
                return null;
            const configText = fs.readFileSync(gitConfigPath, 'utf8');
            const match = configText.match(/github\.com[:/]([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?(?:\s|\r|\n|$)/i);
            if (!match)
                return null;
            const owner = match[1];
            const repoName = match[2];
            const nameWithOwner = `${owner}/${repoName}`;
            return {
                nameWithOwner,
                name: repoName,
                owner,
                defaultBranch: 'main',
                description: '',
                isPrivate: false,
                url: `https://github.com/${nameWithOwner}`,
            };
        }
        catch {
            return null;
        }
    }
    /**
     * 获取当前目录（工作区）关联的远程仓库元数据
     * 采用 gh repo view + 本地 git remote 双保险机制，彻底杜绝已配置远程却误判未关联的问题
     */
    async getRepoMetadata(cwd) {
        const targetCwd = this.resolveWorkspaceCwd(cwd);
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
        // 2. 原生文件解析：直接读取本地 .git/config 文件（0 子进程开销、免疫沙箱 EPERM）
        try {
            const gitConfigPath = path.join(targetCwd, '.git', 'config');
            if (fs.existsSync(gitConfigPath)) {
                const configText = fs.readFileSync(gitConfigPath, 'utf8');
                const match = configText.match(/github\.com[:/]([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?(?:\s|\r|\n|$)/i);
                if (match) {
                    const owner = match[1];
                    const repoName = match[2];
                    const nameWithOwner = `${owner}/${repoName}`;
                    // 使用精确的 owner/repo 向 gh 获取元数据（显式传参，不依赖无上下文的探测）
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
        catch { }
        return null;
    }
}
