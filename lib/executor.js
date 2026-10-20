import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findMostRecentWorkspacePath, findWorkspacePathBySession, hasGitDir } from './workspace.js';
// 子模块纯函数解耦导入并对外部 Re-export 保证 100% 向后兼容
import { parseGhVersion, compareGhVersions } from './executor/version-utils.js';
import { spawnWithStdin, safeSlice, cutByUtf8Bytes, truncateOutput } from './executor/process-utils.js';
import { parseGitStatusOutput, parseGitLogLines, parseGitBranchLines, parseUncommittedDiff, parseGitStatText, parseRemoteUrls, parseGitConfig, resolveRemoteTarget, parseGithubUrl, parseRemoteHost, classifyRepoLayout, pickGithubRemote, } from './executor/git-parser.js';
import { getPlatformInstallGuide, getGhUpgradeHint } from './executor/platform-guide.js';
import { classifyGhError, describeDeterministicError, isRetryableError, permissionRemedy, isPermissionError } from './executor/error-classifier.js';
export { parseGhVersion, compareGhVersions, spawnWithStdin, safeSlice, cutByUtf8Bytes, truncateOutput, parseGitStatusOutput, parseGitLogLines, parseGitBranchLines, parseUncommittedDiff, parseGitStatText, parseRemoteUrls, parseGitConfig, resolveRemoteTarget, parseGithubUrl, parseRemoteHost, classifyRepoLayout, pickGithubRemote, getPlatformInstallGuide, getGhUpgradeHint, classifyGhError, describeDeterministicError, isRetryableError, permissionRemedy, isPermissionError, };
const execFileAsync = promisify(execFile);
/**
 * `gh repo view` 的字段集。
 *
 * 为什么必须集中一处：同一份字段列表此前在 getRepoMetadata 里重复了两遍，
 * 补字段时漏改一处就会出现「在线路径有 isFork、兜底路径没有」的不一致。
 *
 * 字段取舍：
 *   - parent 只返回骨架（id/name/owner.login），不含 stargazerCount
 *     ——`--json` 不支持嵌套子字段（实测 `Unknown JSON field: "parent.stargazerCount"`）
 *   - viewerPermission 是只读仓库的写操作前置拦截依据
 */
const REPO_VIEW_FIELDS = 'nameWithOwner,name,owner,defaultBranchRef,description,isPrivate,url,stargazerCount,forkCount,isFork,parent,viewerPermission';
/**
 * 把 `gh repo view --json` 的原始结果映射为 RepoMetadata。
 *
 * 抽出的理由：同一段映射原先在 getRepoMetadata 里写了两遍（上下文探测 + 精确探测），
 * 逐字符相同。补 3 个字段要改两处，必然漂移。
 *
 * @param fallbackNameWithOwner d.nameWithOwner 缺失时的兜底（离线解析结果）
 */
function mapRepoMetadata(d, fallbackNameWithOwner) {
    const nameWithOwner = d?.nameWithOwner || fallbackNameWithOwner || '';
    const meta = {
        nameWithOwner,
        name: d?.name || '',
        owner: d?.owner?.login || '',
        defaultBranch: d?.defaultBranchRef?.name || 'main',
        description: d?.description || '',
        isPrivate: Boolean(d?.isPrivate),
        url: d?.url || `https://github.com/${nameWithOwner}`,
        stargazerCount: typeof d?.stargazerCount === 'number' ? d.stargazerCount : 0,
        forkCount: typeof d?.forkCount === 'number' ? d.forkCount : 0,
    };
    if (typeof d?.isFork === 'boolean')
        meta.isFork = d.isFork;
    // parent 的 nameWithOwner 需自行拼接：gh 只给 {name, owner:{login}}
    const parentOwner = d?.parent?.owner?.login;
    const parentName = d?.parent?.name;
    if (typeof d?.isFork === 'boolean' && d.isFork && typeof parentOwner === 'string' && typeof parentName === 'string') {
        const parentFull = `${parentOwner}/${parentName}`;
        meta.parent = { nameWithOwner: parentFull, url: `https://github.com/${parentFull}` };
    }
    // 只接受已知档位，未知值一律不带——避免把陌生的 gh 新档位当成可写权限
    const perm = typeof d?.viewerPermission === 'string' ? d.viewerPermission.toUpperCase() : '';
    if (perm === 'ADMIN' || perm === 'MAINTAIN' || perm === 'WRITE' || perm === 'TRIAGE' || perm === 'READ') {
        meta.viewerPermission = perm;
    }
    return meta;
}
/** 认证状态缓存时长。用户手动 `gh auth login/logout` 后最多 30 秒内面板才会反映，属可接受代价 */
const AUTH_CACHE_TTL_MS = 30_000;
/** gh 版本缓存时长。与 authCache 同哲学：gh 升级是分钟级低频事件，30 秒陈旧窗口无实际影响 */
const GH_VERSION_CACHE_TTL_MS = 30_000;
export class GhExecutor {
    ghPath;
    defaultTimeoutMs;
    maxOutputChars;
    /** UTF-8 字节口径的硬上限；未配置时按 maxOutputChars × 4 推导（覆盖 CJK 3 字节与 emoji 4 字节） */
    maxOutputBytes;
    /**
     * 列表类查询的默认条数上限。
     * 为什么挂在 executor 而不是给每个工具工厂加 config 参数：executor 是全部
     * 工具共享的依赖注入点，配置语义本就属于「执行层默认值」；工厂签名零改动，
     * 且热更新路径 updateConfig 能同步刷新。工具内以 `?? 20` 兜底保证旧配置兼容。
     */
    defaultListLimit;
    /**
     * 是否注入 AI_AGENT='dsh'（gh 官方 agent 识别信号，默认 true）。
     * 挂在 executor 而非工具参数：注入点是「每次 gh 子进程拉起」这一全局咽喉，
     * 与 GH_NO_UPDATE_NOTIFIER/NO_COLOR 同级，语义上属于执行层默认值。
     */
    agentEnvInjection;
    /**
     * 代理管理器引用（可选依赖）。
     * 注入后每次 gh 子进程拉起都会合并代理环境变量——这是「工具调用 + Web 页面数据
     * 全部走代理」的唯一咽喉（两条链路共用本 executor）。未注入时零干预，
     * gh 自然继承宿主系统环境变量（系统级代理或直连），即「默认走系统设置」语义。
     */
    proxyManager;
    /** 认证状态缓存。`gh auth status` 实测 5.4 秒，而它位于全局驾驶舱关键路径的最前面 */
    authCache = null;
    /**
     * gh 版本号缓存。只缓存成功解析值（authCache 哲学：不确定结果不缓存）——
     * 探测失败/未安装时不落缓存，用户装好 gh 后下一次探测立即生效。
     */
    ghVersionCache = null;
    constructor(config = {}) {
        this.ghPath = config.ghPath || 'gh';
        this.defaultTimeoutMs = config.defaultTimeoutMs || 30_000;
        this.maxOutputChars = config.maxOutputChars || 24_000;
        this.maxOutputBytes = config.maxOutputBytes || this.maxOutputChars * 4;
        this.defaultListLimit = config.defaultListLimit || 20;
        this.agentEnvInjection = config.agentEnvInjection !== false;
    }
    updateConfig(config = {}) {
        if (config.ghPath)
            this.ghPath = config.ghPath;
        if (config.defaultTimeoutMs)
            this.defaultTimeoutMs = config.defaultTimeoutMs;
        if (config.defaultListLimit)
            this.defaultListLimit = config.defaultListLimit;
        if (config.agentEnvInjection !== undefined)
            this.agentEnvInjection = config.agentEnvInjection;
        if (config.maxOutputChars) {
            this.maxOutputChars = config.maxOutputChars;
            if (!config.maxOutputBytes)
                this.maxOutputBytes = config.maxOutputChars * 4;
        }
        if (config.maxOutputBytes)
            this.maxOutputBytes = config.maxOutputBytes;
    }
    /** 注入代理管理器（main.ts 装配时调用一次；测试可注入 mock） */
    attachProxyManager(manager) {
        this.proxyManager = manager;
    }
    /**
     * 解析命令实际执行的工作区根目录
     * 严格遵循数据事实源与工作区物理所有权，消除越权篡改：
     * 1. 显式路径第一优先级：调用方只要显式指定了路径，该物理路径即为唯一事实源，原样返回自身；
     *    绝不递归扫描子目录、绝不越权篡改；无 Git 目录则让下游探测真实反映无 Git 状态；
     * 2. 仅在未显式指定 cwd 时，才尝试使用 sessionId 或环境变量 DSH_SESSION_ID 反查工作区；
     * 3. 仅在完全未指定 cwd 且无会话时（全局命令行调用），才兜底回退到最近活跃的 Git 工作区或 process.cwd()。
     */
    resolveWorkspaceCwd(explicitCwd, explicitSessionId) {
        // 1. 显式路径第一优先级：只要显式指定了路径且在磁盘真实存在，原样返回该目录作为唯一事实源！
        // 绝不进入子目录去“借用”子项目的 Git 仓库，杜绝在聚合目录或未绑定工作区中张冠李戴！
        if (explicitCwd && fs.existsSync(explicitCwd)) {
            return explicitCwd;
        }
        // 2. 仅在未显式指定 cwd 时，使用显式传入的 sessionId 或环境变量中的 DSH_SESSION_ID 反查
        const targetSessionId = explicitSessionId || process.env.DSH_SESSION_ID;
        if (targetSessionId) {
            const sessionPath = findWorkspacePathBySession(targetSessionId);
            if (sessionPath && fs.existsSync(sessionPath)) {
                return sessionPath;
            }
        }
        // 3. 仅在完全没有显式指定目录与会话工作区（如无上下文的全局调用）时，才从工作区配置中匹配最近活跃且明确具备 .git 的仓库路径
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
        const cwd = this.resolveWorkspaceCwd(options.cwd, options.sessionId);
        const timeout = options.timeoutMs || this.defaultTimeoutMs;
        // 二进制模式（如 gh api 下载图片字节流）：stdout 保持 Buffer，绕过 UTF-8
        // 字符串转换（PNG 等二进制经 utf8 解码必然损坏），也不做截断（截断只面向
        // 文本 Token 预算）。显式开启才生效，既有调用方零感知。
        const binary = options.binary === true;
        try {
            // stdin 显式传入时走 spawn 通道：execFile 的 input 选项在本机从不真正写入
            // （详见 spawnWithStdin 注释），gh secret set 等命令会挂到超时。其余调用
            // 保持 execFileAsync 原路径零改动。
            const commonOpts = {
                cwd,
                env: {
                    ...process.env,
                    GH_NO_UPDATE_NOTIFIER: '1', // 禁用 CLI 版本更新检查，避免污染 stdout
                    NO_COLOR: '1', // 禁用 ANSI 颜色转义字符
                    // 代理环境变量注入在 options.env 之前：调用方显式传入的 env 仍可覆盖
                    // 代理（保持 options.env 的既有语义优先级），正常调用方不传则代理生效。
                    ...(this.proxyManager?.getEnv('gh') || {}),
                    // gh 官方 agent 识别信号（detect.go 最高优先级通用变量）：≥2.99 切 text-only
                    // spinner、≥2.100 误用时打印完整 help、telemetry 归因到 dsh；<2.99 忽略之。
                    // 覆盖继承自宿主环境的同名变量——插件比外层环境更清楚自己的直接驱动者是
                    // DSH（嵌套 agent 场景归因不失真）；options.env 仍可覆盖（与代理变量同语义）。
                    ...(this.agentEnvInjection ? { AI_AGENT: 'dsh' } : {}),
                    ...options.env,
                },
            };
            let stdout;
            let stderr;
            if (options.stdin !== undefined) {
                const r = await spawnWithStdin(this.ghPath, args, { ...commonOpts, timeout, stdin: options.stdin });
                stdout = r.stdout;
                stderr = r.stderr;
            }
            else {
                const r = await execFileAsync(this.ghPath, args, {
                    ...commonOpts,
                    timeout,
                    maxBuffer: 15 * 1024 * 1024, // 15MB 进程缓冲
                    ...(binary ? { encoding: 'buffer' } : {}),
                });
                stdout = r.stdout;
                stderr = r.stderr;
            }
            // 二进制通道：Buffer 原样返回（调用方自行写文件/校验魔数），stderr 仅作
            // 错误线索不做输出回退——把错误提示字节当图片保存毫无意义。
            // TS 无法从 options 展开的 encoding 键收窄 stdout 类型，这里显式归一化。
            if (binary) {
                const buf = Buffer.isBuffer(stdout) ? stdout : Buffer.from(String(stdout ?? ''));
                const errBuf = Buffer.isBuffer(stderr) ? stderr : (stderr ? Buffer.from(String(stderr)) : null);
                if (!buf.length) {
                    const errMsg = errBuf ? errBuf.toString('utf8').trim() : '';
                    const msg = errMsg || '二进制输出为空';
                    return { ok: false, error: msg, errorKind: classifyGhError(msg) };
                }
                return { ok: true, data: buf, binaryBytes: buf.length, truncated: false };
            }
            const outText = Buffer.isBuffer(stdout) ? stdout.toString('utf8') : String(stdout ?? '');
            const errText = Buffer.isBuffer(stderr) ? stderr.toString('utf8') : String(stderr ?? '');
            let rawOutput = outText.trim();
            if (!rawOutput && errText) {
                rawOutput = errText.trim();
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
            // 失败时若子进程输出了 stdout（如 gh skill publish 校验未通过时的 TSV 诊断行），
            // 予以保留并应用同样的字符/字节截断预算，以便上层渲染器结构化解析诊断信息，避免丢失关键现场
            let rawOutput;
            if (err.stdout) {
                const outText = Buffer.isBuffer(err.stdout) ? err.stdout.toString('utf8') : String(err.stdout);
                if (outText.trim()) {
                    rawOutput = truncateOutput(outText.trim(), this.maxOutputChars, this.maxOutputBytes).text;
                }
            }
            // 权限不足时的处置指引。
            //
            // 为什么在 executor 层拼进 error，而不是让 97 个工具调用点各自 `throw new Error(res.error + hint)`：
            // 全仓有 97 处 `throw new Error(res.error)`，逐一改必然遗漏；而模型只能看到 error
            // 字符串，不拼进去等于永远看不到指引。在唯一的事实源处拼一次，所有调用点自动获益。
            //
            // permissionRemedy 字段仍然独立保留：程序化消费方（未来的 UI、诊断面板）
            // 可以只取指引而不用从 error 里再解析一遍。
            const remedy = permissionRemedy(friendlyError, args.join(' '));
            const finalError = remedy ? `${friendlyError}\n\n${remedy}` : friendlyError;
            return {
                ok: false,
                error: finalError,
                rawOutput,
                // 失败语义分类：上层（概览路由 / UI 重试器）据此决定是重试、回退快照
                // 还是直接把「仓库关了 Issues」降级成空列表。分类只有这一处事实源。
                errorKind: classifyGhError(friendlyError),
                ...(remedy ? { permissionRemedy: remedy } : {}),
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
        // 成功登录且无网络故障时落缓存
        if (value.loggedIn && !value.networkError) {
            this.authCache = { at: now, value };
        }
        else if (value.networkError && this.authCache && this.authCache.value.loggedIn) {
            // 容灾保全：若本次刷新遭遇网络波动，但之前已有确凿的有效登录缓存，
            // 保全已有登录身份，仅追加网络异常标识，绝不让界面闪烁误报为「未登录」
            return {
                ...this.authCache.value,
                networkError: true,
                networkErrorReason: value.networkErrorReason,
            };
        }
        return value;
    }
    /**
     * 获取当前 gh 版本号（带 30s TTL 缓存），失败返回 null。
     * 底层直连 execFileAsync 而不走 this.run()：run() 会先解析工作区（可能读
     * workspace.json 与目录扫描）再做截断/JSON 解析，对一次 10ms 的版本字符串
     * 查询是纯开销；直连也彻底规避 runGuarded → 探测 → run 的递归风险。
     */
    async getGhVersion() {
        const now = Date.now();
        if (this.ghVersionCache && now - this.ghVersionCache.at < GH_VERSION_CACHE_TTL_MS) {
            return this.ghVersionCache.value;
        }
        const version = parseGhVersion(await this.probeGhVersionRaw());
        // 只缓存成功解析值：失败不落缓存，用户装好 gh 后下一次探测立即生效
        if (version) {
            this.ghVersionCache = { at: now, value: version };
        }
        return version;
    }
    /**
     * 底层版本探测（独立方法而非内联：测试需要在不触发真实子进程的前提下
     * 验证 getGhVersion 的缓存分支——覆写此方法即注入确定输出）。
     * 直连 execFileAsync 而不走 this.run()：run() 会先解析工作区（可能读
     * workspace.json 与目录扫描）再做截断/JSON 解析，对一次 10ms 的版本字符串
     * 查询是纯开销；直连也彻底规避 runGuarded → 探测 → run 的递归风险。
     */
    async probeGhVersionRaw() {
        try {
            const { stdout } = await execFileAsync(this.ghPath, ['--version'], {
                timeout: 3_000,
                windowsHide: true,
            });
            return String(stdout);
        }
        catch {
            // 未安装/超时/PATH 抖动：返回空串，由 parseGhVersion 归一为 null → fail-open
            return '';
        }
    }
    /**
     * 守卫执行器：按 gh 版本门槛路由「主命令 → 降级链路 → 升级指引」三态。
     *
     * 为什么是「检查+执行」一体的方法而非纯探测接口：检查与执行分离会在两者之间
     * 留下竞隙（版本可能在间隙变化），且降级标注逻辑会被迫散落到每个工具的 if/else。
     *
     * fail-open 纪律：版本探测自身失败（null）时直接执行主命令——守卫是路由优化
     * 不是安全边界，探测故障不应拦截业务；gh 未安装场景由主命令产出既有 ENOENT
     * 安装引导，这里不重复造错误路径。
     */
    async runGuarded(args, options = {}) {
        const { minVersion, capability, fallback, ...runOptions } = options;
        if (!minVersion) {
            return this.run(args, runOptions);
        }
        const current = await this.getGhVersion();
        // 探测失败 fail-open：直接执行主命令（见方法注释），错误路径交由主命令的既有处理
        if (current === null || compareGhVersions(current, minVersion) >= 0) {
            return this.run(args, runOptions);
        }
        if (fallback) {
            const res = await fallback();
            return {
                ...res,
                degraded: true,
                degradedReason: `当前 gh ${current} 低于 ${capability || minVersion} 所需版本 ${minVersion}，已切换 API 降级链路`,
            };
        }
        return {
            ok: false,
            error: `此能力需要 gh ≥ ${minVersion}（当前 ${current}）。${this.getGhUpgradeHint()}`,
        };
    }
    /** gh 升级命令按平台提示（复用三态状态机的平台判断口径） */
    getGhUpgradeHint() {
        return getGhUpgradeHint();
    }
    /**
     * 本地 Git 状态只读探测（白名单通道）。
     *
     * 这是本插件首次执行 git（此前仅 gh）——git 存在大量写命令，风险等级高于 gh，
     * 因此白名单不落在「命令名过滤」而落在「命令形态常量」：spawn 参数是下方
     * 硬编码的数组字面量，无任何动态拼接路径，写操作物理不可达（cwd 之外零输入，
     * 而 cwd 本身也是插件解析的工作区路径）。
     *
     * 零网络：status 基于 remote-tracking ref（上次 fetch 的快照），毫秒级本地读取，
     * 符合 global-overview 端点「工作区探测不发网络」的性能红线。
     */
    async getLocalGitStatus(cwd) {
        try {
            // 纯本地毫秒级；3s 超时兜底异常文件系统
            const { stdout } = await execFileAsync('git', ['status', '-sb', '--porcelain'], {
                cwd: cwd || undefined,
                timeout: 3_000,
                windowsHide: true,
            });
            return parseGitStatusOutput(String(stdout), 2000);
        }
        catch {
            // 非 Git 目录 / git 未安装 / 超时：静默降级为 null（调用方不渲染该行）
            return null;
        }
    }
    /**
     * 分页获取本地未提交文件列表（无网络开销，纯本地毫秒级响应）
     */
    async getUncommittedFiles(cwd, limit = 15, skip = 0) {
        const targetCwd = this.resolveWorkspaceCwd(cwd);
        try {
            const { stdout } = await execFileAsync('git', ['status', '-sb', '--porcelain'], {
                cwd: targetCwd || undefined,
                timeout: 3_000,
                windowsHide: true,
            });
            // 允许解析上限 2000 个文件
            const parsed = parseGitStatusOutput(String(stdout), 2000);
            if (!parsed) {
                return { items: [], totalCount: 0, hasMore: false };
            }
            const allFiles = parsed.dirtyFiles || [];
            const totalCount = parsed.dirtyCount;
            const safeSkip = Math.max(0, skip);
            const safeLimit = Math.max(1, limit);
            const items = allFiles.slice(safeSkip, safeSkip + safeLimit);
            const hasMore = safeSkip + items.length < totalCount;
            return { items, totalCount, hasMore };
        }
        catch {
            return { items: [], totalCount: 0, hasMore: false };
        }
    }
    /**
     * 获取指定文件的未提交 Git Diff 对比（Unified Diff 格式）。
     * 严格实施路径穿越安全校验；支持已跟踪修改文件、暂存文件与未跟踪新增文件（??）。
     */
    async getFileDiff(cwd, relativePath) {
        const targetCwd = this.resolveWorkspaceCwd(cwd);
        if (!relativePath || typeof relativePath !== 'string') {
            return { ok: false, filePath: '', error: '缺少目标文件路径' };
        }
        // 路径安全防线：严格防止路径穿越
        const cleanRel = relativePath.trim().replace(/\\/g, '/');
        const resolvedTarget = path.resolve(targetCwd);
        const resolvedFile = path.resolve(targetCwd, cleanRel);
        if (!resolvedFile.startsWith(resolvedTarget + path.sep) && resolvedFile !== resolvedTarget) {
            return { ok: false, filePath: cleanRel, error: '非法路径，禁止访问工作区外部文件' };
        }
        try {
            // 1. 先用 porcelain status 获取该文件的状态码
            let fileStatus = 'M';
            try {
                const { stdout: statusOut } = await execFileAsync('git', ['status', '--porcelain', '--', cleanRel], {
                    cwd: targetCwd || undefined,
                    timeout: 2_000,
                    windowsHide: true,
                });
                const trimmed = String(statusOut).trim();
                if (trimmed) {
                    fileStatus = trimmed.slice(0, 2).trim() || 'M';
                }
            }
            catch { }
            // 2. 如果是未跟踪新增文件 (??)
            if (fileStatus === '??') {
                if (!fs.existsSync(resolvedFile)) {
                    return { ok: false, filePath: cleanRel, error: '目标文件不存在' };
                }
                const stat = fs.statSync(resolvedFile);
                if (stat.isDirectory()) {
                    return { ok: false, filePath: cleanRel, error: '目标路径为目录而非文件' };
                }
                // 读取文件前 8KB 探测是否为二进制
                const fd = fs.openSync(resolvedFile, 'r');
                const probeBuf = Buffer.alloc(Math.min(stat.size, 8192));
                fs.readSync(fd, probeBuf, 0, probeBuf.length, 0);
                fs.closeSync(fd);
                if (probeBuf.includes(0)) {
                    return {
                        ok: true,
                        filePath: cleanRel,
                        status: '??',
                        isBinary: true,
                        diff: 'Binary file (untracked)',
                        additions: 0,
                        deletions: 0,
                    };
                }
                const content = fs.readFileSync(resolvedFile, 'utf8');
                const lines = content.split('\n');
                // 截断保护：最多展示 1500 行防卡死
                const maxLines = 1500;
                const truncated = lines.length > maxLines;
                const displayLines = truncated ? lines.slice(0, maxLines) : lines;
                const diffBody = displayLines.map((l) => '+' + l).join('\n') + (truncated ? '\n... [差异过大，已截断展示前 1500 行]' : '');
                const fullDiff = `diff --git a/${cleanRel} b/${cleanRel}\nnew file mode 100644\n--- /dev/null\n+++ b/${cleanRel}\n@@ -0,0 +1,${lines.length} @@\n${diffBody}`;
                return {
                    ok: true,
                    filePath: cleanRel,
                    status: '??',
                    diff: fullDiff,
                    additions: lines.length,
                    deletions: 0,
                    isBinary: false,
                };
            }
            // 3. 已跟踪文件（M, D, A 等）：执行 git diff HEAD -- <cleanRel>
            let rawDiff = '';
            try {
                const { stdout } = await execFileAsync('git', ['diff', 'HEAD', '--', cleanRel], {
                    cwd: targetCwd || undefined,
                    timeout: 4_000,
                    windowsHide: true,
                    maxBuffer: 5 * 1024 * 1024,
                });
                rawDiff = String(stdout);
            }
            catch {
                // 无 HEAD 场景（空仓库初次提交前），优雅降级为 git diff -- <cleanRel>
                try {
                    const { stdout } = await execFileAsync('git', ['diff', '--', cleanRel], {
                        cwd: targetCwd || undefined,
                        timeout: 4_000,
                        windowsHide: true,
                        maxBuffer: 5 * 1024 * 1024,
                    });
                    rawDiff = String(stdout);
                }
                catch { }
            }
            // 如果 diff 为空但处于已删除状态（D），或者在 staged 中
            if (!rawDiff) {
                try {
                    const { stdout: stagedDiff } = await execFileAsync('git', ['diff', '--cached', '--', cleanRel], {
                        cwd: targetCwd || undefined,
                        timeout: 3_000,
                        windowsHide: true,
                    });
                    rawDiff = String(stagedDiff);
                }
                catch { }
            }
            if (rawDiff.includes('Binary files differ') || rawDiff.includes('GIT binary patch')) {
                return {
                    ok: true,
                    filePath: cleanRel,
                    status: fileStatus,
                    isBinary: true,
                    diff: 'Binary files differ',
                    additions: 0,
                    deletions: 0,
                };
            }
            const diffStats = parseUncommittedDiff(rawDiff);
            // 截断保护：行数超过 1500 行时截断
            const diffLines = rawDiff.split('\n');
            let finalDiff = rawDiff;
            if (diffLines.length > 1500) {
                finalDiff = diffLines.slice(0, 1500).join('\n') + '\n... [差异过大，已截断展示前 1500 行]';
            }
            return {
                ok: true,
                filePath: cleanRel,
                status: fileStatus,
                diff: finalDiff || '没有检测到文本差异',
                additions: diffStats.additions,
                deletions: diffStats.deletions,
                isBinary: false,
            };
        }
        catch (err) {
            return { ok: false, filePath: cleanRel, error: err?.message || '获取文件差异失败' };
        }
    }
    /**
     * 本地 Git 提交记录（三段一次返回：本地领先 / 远程领先 / 最近提交）。
     *
     * 白名单纪律与 getLocalGitStatus 同源：下方两个命令形态常量硬编码
     * （log + 修订范围语法，range 段由 hasUpstream 守卫后才拼接且仅两个
     * 固定形态 @{u}..HEAD / HEAD..@{u}——不含任何用户输入路径）。
     * 领先/落后列表基于 remote-tracking ref（上次 fetch 快照），与 status
     * 的 ahead/behind 计数同一数据口径；格式 %h|%an|%ar|%s 实测可结构化解析。
     */
    async getGitCommitLog(cwd, hasUpstream = true, limit = 15) {
        const empty = { aheadCommits: [], behindCommits: [], recent: [] };
        const logFmt = '--pretty=format:%x1e%h%x1f%H%x1f%an%x1f%ae%x1f%ad%x1f%ar%x1f%s%x1f%b%x1f';
        try {
            const recentRes = await execFileAsync('git', ['log', `-${Math.max(1, limit)}`, logFmt, '--stat', '--no-decorate'], {
                cwd: cwd || undefined,
                timeout: 4_000,
                windowsHide: true,
            });
            empty.recent = parseGitLogLines(String(recentRes.stdout));
            try {
                const countRes = await execFileAsync('git', ['rev-list', '--count', 'HEAD'], {
                    cwd: cwd || undefined,
                    timeout: 2_000,
                    windowsHide: true,
                });
                const cnt = parseInt(String(countRes.stdout).trim(), 10);
                if (!isNaN(cnt))
                    empty.totalCount = cnt;
            }
            catch { }
            if (!hasUpstream)
                return empty; // 无 upstream：领先/落后无从谈起，仅最近提交
            const aheadRes = await execFileAsync('git', ['log', '@{u}..HEAD', logFmt, '--stat', '--no-decorate'], {
                cwd: cwd || undefined,
                timeout: 3_000,
                windowsHide: true,
            });
            empty.aheadCommits = parseGitLogLines(String(aheadRes.stdout));
            const behindRes = await execFileAsync('git', ['log', 'HEAD..@{u}', logFmt, '--stat', '--no-decorate'], {
                cwd: cwd || undefined,
                timeout: 3_000,
                windowsHide: true,
            });
            empty.behindCommits = parseGitLogLines(String(behindRes.stdout));
            return empty;
        }
        catch {
            return null;
        }
    }
    /**
     * 分页获取最近提交记录（用于 Git 面板下滑触底继续加载）。
     */
    async getGitRecentLog(cwd, limit = 15, skip = 0) {
        const logFmt = '--pretty=format:%x1e%h%x1f%H%x1f%an%x1f%ae%x1f%ad%x1f%ar%x1f%s%x1f%b%x1f';
        const safeLimit = Math.min(Math.max(1, limit), 50);
        const safeSkip = Math.max(0, skip);
        const args = ['log', `-${safeLimit}`, logFmt, '--stat', '--no-decorate'];
        if (safeSkip > 0) {
            args.push('--skip', String(safeSkip));
        }
        try {
            const { stdout } = await execFileAsync('git', args, {
                cwd: cwd || undefined,
                timeout: 5_000,
                windowsHide: true,
            });
            const commits = parseGitLogLines(String(stdout));
            let totalCount;
            try {
                const countRes = await execFileAsync('git', ['rev-list', '--count', 'HEAD'], {
                    cwd: cwd || undefined,
                    timeout: 2_000,
                    windowsHide: true,
                });
                const cnt = parseInt(String(countRes.stdout).trim(), 10);
                if (!isNaN(cnt))
                    totalCount = cnt;
            }
            catch { }
            return { commits, totalCount };
        }
        catch {
            return { commits: [] };
        }
    }
    /**
     * 单条提交详情（点击提交行弹窗的数据源）。
     * 白名单纪律延续：show 命令形态常量硬编码；sha 参数经 ^[0-9a-f]{4,40}$
     * 十六进制校验后才拼接——这是 git 白名单通道首次接受「外部传入的单值」，
     * 正则把值域锁死在纯十六进制（注入面为零：任何 shell 元字符/子命令
     * 语法都不可能通过校验）。输出为 git show --stat 原文（含文件变更统计）。
     */
    async getGitCommitDetail(cwd, sha) {
        if (!/^[0-9a-f]{4,40}$/i.test(sha))
            return null; // 形态校验：纯十六进制短/全 sha
        try {
            const { stdout } = await execFileAsync('git', ['show', '--stat', '--pretty=format:%H%n%an <%ae>%n%ad%n%s%n%b', sha], {
                cwd: cwd || undefined,
                timeout: 3_000,
                windowsHide: true,
            });
            return String(stdout);
        }
        catch {
            return null;
        }
    }
    /**
     * 纯本地读取工作区的所有 Git 分支（按提交时间倒序）。
     * 包含当前 HEAD 分支标记、关联 upstream、最新提交简述与相对时间。
     * 零网络往返，毫秒级本地管道输出。
     */
    async getGitBranches(cwd) {
        const targetCwd = this.resolveWorkspaceCwd(cwd);
        if (!hasGitDir(targetCwd)) {
            return null;
        }
        const fmt = '%(refname:short)|%(HEAD)|%(upstream:short)|%(committerdate:relative)|%(objectname:short)|%(subject)';
        try {
            const { stdout } = await execFileAsync('git', ['branch', '-a', '--sort=-committerdate', `--format=${fmt}`], {
                cwd: targetCwd,
                timeout: 4_000,
                windowsHide: true,
            });
            return parseGitBranchLines(String(stdout));
        }
        catch {
            return null;
        }
    }
    /**
     * 安全切换当前工作区的 Git 分支。
     * 三重安全防御纪律：
     * 1. 目标工作区必须存在有效的 .git 目录；
     * 2. 分支名称严格执行字符白名单校验，防命令行参数注入；
     * 3. 检查工作区干净度（dirtyCount），若有未提交或未保存的变更直接阻断，杜绝代码被破坏性覆盖。
     */
    async switchGitBranch(cwd, branchName) {
        const targetCwd = this.resolveWorkspaceCwd(cwd);
        if (!hasGitDir(targetCwd)) {
            return { ok: false, error: '当前工作区不是有效的 Git 仓库' };
        }
        const cleanBranch = (branchName || '').trim();
        // 安全白名单校验：只允许字母、数字、点号、斜杠、减号和下划线，禁止以 - 开头（防 flag 注入），禁止包含连续点号 ..
        if (!cleanBranch || cleanBranch.startsWith('-') || cleanBranch.includes('..') || cleanBranch.includes('\\') || !/^[a-zA-Z0-9_\/.-]+$/.test(cleanBranch)) {
            return { ok: false, error: '非法分支名称，仅允许字母、数字、短横线、下划线与斜杠组合' };
        }
        // 防线二：工作区未提交变更阻断（Dirty File Guard）
        const gitSt = await this.getLocalGitStatus(targetCwd);
        if (gitSt && gitSt.dirtyCount > 0) {
            return {
                ok: false,
                error: `工作区有 ${gitSt.dirtyCount} 个未提交的文件变更。为防止代码被覆盖，请先提交或保存后再切换分支。`,
            };
        }
        try {
            let args = ['checkout', cleanBranch];
            let targetName = cleanBranch;
            if (cleanBranch.startsWith('origin/')) {
                targetName = cleanBranch.replace(/^origin\//, '');
                // 若本地已有同名分支，直接切本地；若无则通过 --track 建立追踪分支
                const branches = await this.getGitBranches(targetCwd);
                const hasLocal = branches?.branches.some((b) => !b.isRemote && b.name === targetName);
                args = hasLocal ? ['checkout', targetName] : ['checkout', '--track', cleanBranch];
            }
            await execFileAsync('git', args, {
                cwd: targetCwd,
                timeout: 5_000,
                windowsHide: true,
            });
            return { ok: true, currentBranch: targetName };
        }
        catch (err) {
            const stderr = err?.stderr?.toString().trim();
            const msg = stderr || err?.message || '切换分支失败';
            return { ok: false, error: msg };
        }
    }
    /** 生成当前操作系统平台的推荐安装引导与命令 */
    getPlatformInstallGuide() {
        return getPlatformInstallGuide();
    }
    /**
     * 纯本地检测宿主机 GitHub CLI 配置文件中是否存在已配置的账号凭据。
     * 零子进程、零网络往返，毫秒级读取，专供断网与网络卡顿时的 Fail-Safe 容灾降级。
     */
    checkLocalGhCredential() {
        try {
            const candidates = [];
            if (process.platform === 'win32') {
                const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
                candidates.push(path.join(appData, 'GitHub CLI', 'hosts.yml'));
            }
            candidates.push(path.join(os.homedir(), '.config', 'gh', 'hosts.yml'));
            for (const file of candidates) {
                if (fs.existsSync(file)) {
                    const content = fs.readFileSync(file, 'utf8');
                    // 匹配 hosts.yml 中的 user: xxx 或 users:\n  xxx:
                    const userMatch = content.match(/user:\s*([A-Za-z0-9_-]+)/i) || content.match(/users:\s*[\r\n]+\s+([A-Za-z0-9_-]+):/i);
                    const hasOauth = content.includes('oauth_token') || content.includes('users:');
                    if (userMatch || hasOauth) {
                        return {
                            user: userMatch ? userMatch[1] : undefined,
                            hasToken: true,
                        };
                    }
                }
            }
        }
        catch { }
        return null;
    }
    /**
     * 实际执行认证探测并解析结果，不含外部缓存逻辑。
     * 解耦本地安装态、本地凭据态与网络可达态：
     * 1. 安装态通过 getGhVersion 本地轻量确认，网络超时/断网绝不篡改 installed 结论；
     * 2. 本地凭据通过 checkLocalGhCredential 读取，断网时仍可识别人类账号；
     * 3. 精准分流网络超时/异常（networkError）与真正的未认证（explicitLoggedOut）。
     */
    async probeAuth(cwd) {
        // 1. 本地安装态先行探测（纯本地进程调用，零网络依赖）
        const version = await this.getGhVersion().catch(() => null);
        const isInstalledLocally = Boolean(version);
        // 2. 本地已存登录凭据探测（纯本地文件读取，零网络依赖）
        const localCred = this.checkLocalGhCredential();
        // 3. 执行 gh auth status 校验远端有效性
        const res = await this.run(['auth', 'status'], { cwd, timeoutMs: 10_000, rawText: true });
        const raw = (res.rawOutput || '') + '\n' + (res.error || '');
        // 4. 精准网络异常特征检测（超时、DNS解析失败、代理拒绝、连接重置）
        const isTimeout = Boolean(res.error && (res.error.includes('执行超时') || res.error.includes('timed out')));
        const isNetworkError = isTimeout || /dial\s+tcp|connectex|connection\s+refused|lookup\s+api\.github\.com|getaddrinfow|TLS\s+handshake|proxyconnect|network\s+is\s+unreachable|i\/o\s+timeout/i.test(raw);
        // 5. 显式未登录特征（必须排除网络错误干扰，仅在无网络问题且 CLI 明确指示未登录时成立）
        const isExplicitlyLoggedOut = !isNetworkError && (/not\s+logged\s+in/i.test(raw) ||
            raw.includes('gh auth login') ||
            raw.includes('authentication required') ||
            raw.includes('No accounts found'));
        // 6. 成功登录特征判定
        const hasLoggedInFlag = /logged\s+in\s+to/i.test(raw) || raw.includes('✓') || raw.includes('√');
        const hasActiveFlag = /active\s+account:\s*true/i.test(raw);
        const hasTokenFlag = raw.includes('Token:') || raw.includes('Token scopes:');
        const accountMatch = raw.match(/account\s+([A-Za-z0-9_-]+)/i);
        const hasAccount = Boolean(accountMatch && accountMatch[1] && accountMatch[1].toLowerCase() !== 'none');
        // 7. 安装状态结论：若本地版本已确认，或者命令返回了非 ENOENT 的输出，必然已安装
        const isNotInstalled = !isInstalledLocally && Boolean(res.error && (res.error.includes('系统未检测到 GitHub CLI') || res.error.includes('ENOENT')));
        const installed = isInstalledLocally || !isNotInstalled;
        if (!installed) {
            return {
                installed: false,
                loggedIn: false,
                platform: process.platform,
                installGuide: this.getPlatformInstallGuide(),
                raw: res.error,
            };
        }
        // 8. 网络异常处理：绝不能把网络超时/断网归咎为“未登录”或“未安装”
        if (isNetworkError) {
            const errorReason = isTimeout
                ? '连接 GitHub API 超时 (10 秒)。请检查网络连通性或代理配置。'
                : '无法连接至 GitHub 服务器（网络波动或被系统代理阻断）。';
            return {
                installed: true,
                // 若本地确认有配置好的账号，保持 loggedIn 为 true（Fail-Safe 容灾），并标记 networkError
                loggedIn: Boolean(localCred?.hasToken || hasLoggedInFlag),
                user: localCred?.user || (accountMatch ? accountMatch[1] : undefined),
                host: 'github.com',
                platform: process.platform,
                networkError: true,
                networkErrorReason: errorReason,
                hasLocalToken: Boolean(localCred?.hasToken),
                raw,
            };
        }
        const loggedIn = !isExplicitlyLoggedOut && (hasLoggedInFlag || hasActiveFlag || (hasTokenFlag && hasAccount));
        if (!loggedIn) {
            return {
                installed: true,
                loggedIn: false,
                platform: process.platform,
                raw,
            };
        }
        // 解析用户名
        let user = localCred?.user;
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
     * 从 `refs/remotes/<remote>/HEAD` 符号引用中读取仓库默认分支。
     *
     * 为什么只认这一个来源（其余全部实测排除）：
     *   - `packed-refs` 只存具体 sha，不含 symbolic ref —— 读不到；
     *   - 当前 HEAD 指向的是**用户 checkout 的分支**，不是仓库默认分支，语义错误；
     *   - 猜 main/master —— 无依据，宁可回落固定值也不猜。
     *
     * @returns 分支名；文件不存在（未 fetch 过）或内容不是符号引用时返回 null，
     *          由调用方回落到既有默认值（保持原有行为，不引入新错误）
     */
    readDefaultBranchFromRef(remoteName, cwd) {
        try {
            const info = this.resolveGitDirInfo(cwd);
            if (!info)
                return null;
            // refs 存放在共享目录（worktree 与主仓库共用），已实测
            const headRefPath = path.join(info.commonDir, 'refs', 'remotes', remoteName, 'HEAD');
            if (!fs.existsSync(headRefPath))
                return null;
            const raw = fs.readFileSync(headRefPath, 'utf8');
            // 内容形如 `ref: refs/remotes/origin/main`
            const m = /^\s*ref:\s*refs\/remotes\/[^/]+\/(.+?)\s*$/m.exec(raw);
            return m ? m[1] : null;
        }
        catch {
            return null;
        }
    }
    /**
     * 解析工作区真实的 git 目录的**两个**路径：局部目录与共享仓库目录。
     *
     * 为什么必须分开：worktree 的 `HEAD` 在局部目录（`.git/worktrees/<name>/HEAD`），
     * 而 `config` 在共享目录（`commondir` 指向处）。只解析其中一个必然读错：
     *   - 只读局部 → 找不到 config（remote 配置在共享目录）
     *   - 只读共享 → 拿到**主工作树**的分支名，进而按错误分支查 `branch.*.remote`
     *
     * 实测：主工作树 HEAD 是 `ref: refs/heads/master`，worktree 的是 `ref: refs/heads/feat`。
     *
     * 常规仓库两者指向同一目录。
     *
     * @returns 两个绝对路径；非 Git 目录/指针不可解析时返回 null（绝不抛错）
     */
    resolveGitDirInfo(cwd) {
        const targetCwd = cwd || this.resolveWorkspaceCwd();
        try {
            const dotGit = path.join(targetCwd, '.git');
            if (!fs.existsSync(dotGit))
                return null;
            const st = fs.statSync(dotGit);
            if (st.isDirectory())
                return { localDir: dotGit, commonDir: dotGit };
            if (!st.isFile())
                return null;
            // worktree/submodule：.git 是文本文件，内容形如 `gitdir: C:/repo/.git/worktrees/wt`
            const pointer = fs.readFileSync(dotGit, 'utf8');
            const m = /^\s*gitdir:\s*(.+?)\s*$/m.exec(pointer);
            if (!m)
                return null;
            const gitDirRaw = m[1].replace(/[\\/]+$/, '');
            const localDir = path.isAbsolute(gitDirRaw) ? path.normalize(gitDirRaw) : path.resolve(targetCwd, gitDirRaw);
            if (!fs.existsSync(localDir))
                return null;
            // worktree：<localDir>/commondir 记录共享仓库目录（相对 localDir）
            const commonDirFile = path.join(localDir, 'commondir');
            if (fs.existsSync(commonDirFile)) {
                try {
                    const rel = fs.readFileSync(commonDirFile, 'utf8').trim();
                    if (rel) {
                        const common = path.resolve(localDir, rel);
                        if (fs.existsSync(path.join(common, 'config')))
                            return { localDir, commonDir: common };
                    }
                }
                catch {
                    // commondir 读失败 → 退回 localDir（至少还能读到局部配置）
                }
            }
            return { localDir, commonDir: localDir };
        }
        catch {
            return null;
        }
    }
    /**
     * 解析工作区真实的 git 目录（共享仓库目录）。
     * 薄封装自 resolveGitDirInfo：读 `config` 的场景（远程指纹）只需要共享目录。
     */
    resolveGitDirPath(cwd) {
        return this.resolveGitDirInfo(cwd)?.commonDir ?? null;
    }
    /**
     * remote 配置指纹：全部 remote url 去重、排序、拼接后取 SHA-256 前 12 位。
     *
     * 为什么不用身份解析做缓存失效判定：身份解析要回答「变成了什么」，
     * 一旦解析器对某种 config 布局有偏差（如双 remote 时取错 remote 段），
     * 比对就永远失配——缓存再也不命中，每次请求都重拉全部 gh 子进程。
     * 指纹只回答「变了没有」，不依赖任何语义理解，因此对该类偏差免疫。
     *
     * 反例（实测）：`git remote rename origin upstream` 后 `git remote add origin <fork>`，
     * config 里 upstream 段排在 origin 段前，取「第一个 github.com 匹配」会拿到上游，
     * 而 git 权威解析（branch.<name>.remote → origin）拿到的是 fork。
     *
     * @returns 12 位十六进制指纹；仅当「非 Git 目录 / config 不可读」时返回 null
     *          （调用方据此保守判定为「未变更」，绝不因探测失败误清空缓存）。
     *          注意：**config 可读但没有任何 remote 时返回的是空集合的哈希，不是 null**——
     *          「仓库没有远程」是一个确定事实，它与「读不到配置」必须区分开：
     *          否则用户删光 remote 后指纹恒为 null，旧快照再也无法失效。
     */
    getRemoteFingerprint(cwd) {
        try {
            const gitDir = this.resolveGitDirPath(cwd);
            if (!gitDir)
                return null;
            const configPath = path.join(gitDir, 'config');
            if (!fs.existsSync(configPath))
                return null;
            const urls = parseRemoteUrls(fs.readFileSync(configPath, 'utf8'));
            // 排序后拼接：remote 数量、书写顺序、命名方式都不影响指纹——
            // 只有「url 集合本身」变化才会改变指纹，这正是「配置变没变」的定义。
            // 空集合同样参与哈希（得到空串的 SHA-256 前缀），语义是「已读、无 remote」，
            // 与读取失败的 null 是两回事。
            const normalized = [...urls].sort().join('\n');
            return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 12);
        }
        catch {
            return null;
        }
    }
    /**
     * 读取并解析工作区的 git 远程视图（`.git/config` + `HEAD`）。
     * 内部方法：把「两个路径各读哪个文件」的细节收敛在一处，
     * 避免各调用点自己拼路径读错 worktree 的文件。
     */
    readParsedGitConfig(cwd) {
        const info = this.resolveGitDirInfo(cwd);
        if (!info)
            return null;
        try {
            const configPath = path.join(info.commonDir, 'config');
            if (!fs.existsSync(configPath))
                return null;
            const configText = fs.readFileSync(configPath, 'utf8');
            // HEAD 必须从 localDir 读：worktree 下 commonDir/HEAD 是主工作树的分支名
            const headPath = path.join(info.localDir, 'HEAD');
            const headText = fs.existsSync(headPath) ? fs.readFileSync(headPath, 'utf8') : null;
            return parseGitConfig(configText, headText);
        }
        catch {
            return null;
        }
    }
    /**
     * 仅从本地 `.git/config` 解析仓库身份，绝不发起网络请求。
     *
     * 为什么需要它：全局驾驶舱要为每个工作区认识别仓库，而 getRepoMetadata 会调用
     * `gh repo view` 走网络。实测 5 个工作区时该端点冷启动 20.5 秒，其中绝大部分耗在这 5 次
     * 网络往返上——而有界并发根本救不了它，因为瓶颈是网络延迟而不是进程排队。
     * 工作区矩阵只需要「这个目录属于哪个仓库」这一身份信息，本地 .git/config 已经完整具备，
     * 描述/star 数等富字段是当前仓库详情才需要的。这一步把每个工作区从 1 次网络往返降为 0。
     *
     * 解析口径与 git 一致（三级回落），不再「取 config 里第一个 github.com 匹配」——
     * 后者在 `git remote rename origin upstream` + `add origin <fork>` 的布局下会取到上游，
     * 而 git 认的是 origin（实测）。
     */
    getRepoIdentityFromLocal(cwd) {
        const cfg = this.readParsedGitConfig(cwd);
        if (!cfg)
            return null;
        const layout = classifyRepoLayout(cfg);
        /**
         * 按布局分类选目标 remote —— 与 `.git/config` 书写顺序无关。
         *
         * github-only  ：完全按 git 规则（branch.<当前分支>.remote → origin → 首个）
         * github-mixed ：git 选中的不是 GitHub → 在 GitHub remote 中按
         *                origin 优先 → 名字字典序（pickGithubRemote）
         * 其余          ：无 GitHub remote，返回 null，不猜测
         */
        let target = null;
        if (layout === 'github-only') {
            target = resolveRemoteTarget(cfg);
        }
        else if (layout === 'github-mixed') {
            target = pickGithubRemote(cfg);
        }
        if (!target)
            return null;
        const gh = parseGithubUrl(target.url);
        if (!gh)
            return null;
        const nameWithOwner = `${gh.owner}/${gh.repo}`;
        return {
            nameWithOwner,
            name: gh.repo,
            owner: gh.owner,
            // 默认分支：从该 remote 的 HEAD 符号引用推断，读不到才回落 'main'
            defaultBranch: this.readDefaultBranchFromRef(target.name, cwd) || 'main',
            description: '',
            isPrivate: false,
            url: `https://github.com/${nameWithOwner}`,
            layout,
        };
    }
    /**
     * 获取当前目录（工作区）关联的远程仓库元数据
     * 采用 gh repo view + 本地 git remote 双保险机制，彻底杜绝已配置远程却误判未关联的问题
     */
    async getRepoMetadata(cwd, sessionId) {
        const targetCwd = this.resolveWorkspaceCwd(cwd, sessionId);
        // 绝对前置门禁：当前目录若自身不存在 .git 目录，铁证如山判定为未关联本地 Git 仓库
        // 直接返回 null，杜绝一切在非 Git 目录误报关联的可能！
        if (!hasGitDir(targetCwd)) {
            return null;
        }
        // 1. 优先尝试由 gh 直接根据当前上下文识别
        const res = await this.run(['repo', 'view', '--json', REPO_VIEW_FIELDS], { cwd: targetCwd, timeoutMs: 10_000 });
        if (res.ok && res.data && res.data.nameWithOwner) {
            return mapRepoMetadata(res.data);
        }
        // 2. 原生文件解析：走与 getRepoIdentityFromLocal 完全相同的解析器
        //    （0 子进程开销、免疫沙箱 EPERM）。
        //    为什么不再自己写一份正则：两处各维护一份必然漂移，且旧正则
        //    「取第一个 github.com 匹配」在多 remote 布局下会取到上游仓库。
        const local = this.getRepoIdentityFromLocal(targetCwd);
        if (local) {
            const { nameWithOwner } = local;
            // 使用精确的 owner/repo 向 gh 获取元数据（显式传参，不依赖无上下文的探测）
            const directRes = await this.run(['repo', 'view', nameWithOwner, '--json', REPO_VIEW_FIELDS], {
                cwd: targetCwd,
                timeoutMs: 10_000,
            });
            if (directRes.ok && directRes.data && directRes.data.nameWithOwner) {
                return mapRepoMetadata(directRes.data, nameWithOwner);
            }
            // 若离线或网络受限，由本地 git remote 配置兜底返回。
            // 注意：此处不带 isFork / parent / viewerPermission —— 离线无从得知，绝不猜测。
            return {
                ...local,
                description: '已成功关联本地 Git 远程仓库',
            };
        }
        return null;
    }
}
