/**
 * 网络代理管理器：插件全部外联流量的唯一代理状态权威源。
 *
 * 设计依据（docs/plans/proxy-support-plan.md）：
 * - gh 子进程链路（9 工具 + Web API 数据）经标准环境变量 HTTPS_PROXY/HTTP_PROXY/NO_PROXY 驱动，
 *   实测 gh CLI 完整遵循 Go net/http 约定；
 * - Node fetch 链路（updater 的 npm registry 探测）无视环境变量，需 undici ProxyAgent
 *   dispatcher 驱动——插件自身不依赖 undici，运行时从 DSH 宿主 require 链动态解析；
 * - 不走 Cordis Config 承载：配置变更会触发插件全量 reload（工具注销重注册），
 *   而代理是高频试错型设置。持久化用独立文件，保存即生效、零重载。
 * - 未设置时零干预：不注入任何环境变量、不动 fetch dispatcher，
 *   gh 与 fetch 自然回落到系统环境变量（若宿主本身配置了 HTTPS_PROXY）或直连。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
const DEFAULT_CONFIG = {
    enabled: false,
    url: '',
    noProxy: 'localhost,127.0.0.1',
    applyToPackageManager: true,
    autoFollowSystem: false,
};
/** Windows 系统代理所在的注册表键（clash / v2rayN / Mihomo 等工具「系统代理」开关写入的就是这里） */
const WIN_INTERNET_SETTINGS_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
/**
 * 解析 Windows 注册表 ProxyServer 值为规范化代理地址（纯函数，供单测直接覆盖）。
 *
 * 注册表里这个值的写法五花八门，实测至少四种形态：
 * - "127.0.0.1:7890"                  —— 单一地址，适用于所有协议（clash 系工具最常见）
 * - "http=127.0.0.1:7890;https=..."   —— 按协议分写，取 https 优先、http 兜底（ftp 无用丢弃）
 * - "=127.0.0.1:7890"                 —— 某些工具的等号开头写法，语义同单一地址
 * - "socks=127.0.0.1:7891"            —— 仅 socks；gh 原生支持 socks5，直接采用
 *
 * 返回已带 scheme 的完整地址；无法解析出 host:port 时返回空串（调用方按「未检测到」处理）。
 */
export function parseProxyServer(raw) {
    const s = String(raw || '').trim();
    if (!s)
        return '';
    // 按协议分写形态：切分出各段，https 优先、http 兜底、socks 次之
    if (s.includes('=')) {
        const parts = {};
        for (const seg of s.split(';')) {
            const eq = seg.indexOf('=');
            if (eq < 0)
                continue;
            const proto = seg.slice(0, eq).trim().toLowerCase();
            const addr = seg.slice(eq + 1).trim();
            // 空 proto（如 "=127.0.0.1:7890"）是某些工具的实际写法，语义同单一地址：
            // 记到空键上，下面优先取具体协议，最后兜底用它。
            if (addr)
                parts[proto] = addr;
        }
        // https 优先于 http（GitHub 链路主要是 https 流量），socks 次之，空 proto 兜底
        const pick = parts['https'] || parts['http'] || parts['socks'] || parts[''];
        if (pick)
            return normalizeProxyAddr(pick, parts['socks'] !== undefined && !parts['https'] && !parts['http'] && !parts['']);
        return '';
    }
    // 单一地址形态
    return normalizeProxyAddr(s, false);
}
/** 给裸 host:port 补 scheme；socks 形态补 socks5://，其余补 http:// */
function normalizeProxyAddr(addr, isSocks) {
    const s = addr.trim();
    if (!s)
        return '';
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s))
        return validateSchemeOnly(s);
    // 已带 scheme 的原样校验；其余一律补默认 scheme 后交给 URL 校验兜底
    // （不是 host:port 结构、或 PAC 之类不支持的形态，会在 validateSchemeOnly 里被拒）
    return validateSchemeOnly((isSocks ? 'socks5://' : 'http://') + s);
}
/** 借 validateProxyUrl 的白名单做最终把关，失败返回空串（不抛错——检测失败不算事故） */
function validateSchemeOnly(url) {
    try {
        const parsed = new URL(url);
        if (!parsed.hostname || !parsed.port)
            return '';
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'socks5:' && parsed.protocol !== 'socks5h:')
            return '';
        return url;
    }
    catch {
        return '';
    }
}
/**
 * 解析 reg query 单值查询的 stdout（纯函数，供单测覆盖）。
 * 典型输出两行：首行是键路径，第二行形如 "    ProxyEnable    REG_DWORD    0x1"。
 * 查询不存在的值时 reg 以非零码退出，stdout 为空——这里只管解析文本，错误由调用方处理。
 */
export function parseRegQueryValue(stdout) {
    const lines = String(stdout || '').split(/\r?\n/);
    for (const line of lines.slice(1)) {
        const m = line.match(/^\s{2,}\S+\s+REG_(?:SZ|DWORD)\s+(.+)$/i);
        if (m)
            return m[1].trim();
    }
    return '';
}
/**
 * 检测 Windows 系统代理（读注册表 Internet Settings）。
 * reg 不存在、注册表查询失败一律返回 null——「检测不到」不是错误，
 * 绝不向上抛异常打断主流程；非 Windows 返回 supported=false 的信息对象。
 * reader 参数供测试注入 mock；生产路径走 reg query 子进程（3s 超时防挂起）。
 */
export async function detectSystemProxy(reader) {
    const at = Date.now();
    // 平台门禁只约束**真实注册表读取**路径。注入的 reader 是测试接缝，
    // 必须优先于平台判断——否则所有注册表解析逻辑在 Linux/macOS 上根本不可测，
    // 而 CI 恰恰跑在 ubuntu 上（phase50 会整片红，实测 13 条断言失败）。
    if (!reader && process.platform !== 'win32') {
        // 非 Windows 明确回报「不支持」，而不是 null——null 表示「检测失败」，
        // 两者在 UI 上是完全不同的提示（「本平台不支持」vs「尚未检测，稍后自动重试」）。
        return { supported: false, enabled: false, url: '', at, reason: 'unsupported-platform' };
    }
    const run = reader || defaultRegReader;
    try {
        const [enableOut, serverOut, autoConfigOut] = await Promise.all([
            run(WIN_INTERNET_SETTINGS_KEY, 'ProxyEnable'),
            run(WIN_INTERNET_SETTINGS_KEY, 'ProxyServer').catch(() => ''),
            // AutoConfigURL = PAC 自动配置脚本。必须单独读：仅看 ProxyEnable/ProxyServer
            // 会把「企业 PAC 用户」误判成「系统代理已关闭」，进而静默直连。
            run(WIN_INTERNET_SETTINGS_KEY, 'AutoConfigURL').catch(() => ''),
        ]);
        const enableRaw = parseRegQueryValue(enableOut);
        const enabled = /^0x1$/i.test(enableRaw) || enableRaw === '1';
        const autoConfigUrl = parseRegQueryValue(autoConfigOut).trim();
        // 手动代理可用时优先跟它（即使同时配了 PAC，ProxyServer 是更明确的意图）
        if (enabled) {
            const url = parseProxyServer(parseRegQueryValue(serverOut));
            if (url)
                return { supported: true, enabled: true, url, at };
            // 开着代理却解析不出地址：PAC 存在就说 PAC，否则报不可解析
            return { supported: true, enabled: false, url: '', at, reason: autoConfigUrl ? 'pac' : 'unparsable' };
        }
        // 手动代理关着，但配了 PAC：用户确实在用自动配置，只是本插件不支持
        if (autoConfigUrl)
            return { supported: true, enabled: false, url: '', at, reason: 'pac' };
        return { supported: true, enabled: false, url: '', at, reason: 'disabled' };
    }
    catch {
        return null;
    }
}
function defaultRegReader(key, value) {
    return new Promise((resolve, reject) => {
        // windowsHide 必须加：DSH 是无控制台的 GUI 进程，从这里 spawn reg.exe（控制台程序）
        // 会在用户桌面弹出一个黑色命令行窗口——30 秒一次的轮询等于每半分钟骚扰一次用户。
        // 全项目其余 spawn（executor.ts）均有此选项，这里不能成为例外。
        execFile('reg', ['query', key, '/v', value], { timeout: 3000, windowsHide: true }, (err, stdout) => {
            if (err)
                reject(err);
            else
                resolve(String(stdout || ''));
        });
    });
}
/** 持久化路径：~/.dsh/data/dsh-github-flow/proxy.json（与 DSH 用户数据目录规范对齐） */
function resolveStorePath() {
    return path.join(os.homedir(), '.dsh', 'data', 'dsh-github-flow', 'proxy.json');
}
/**
 * 校验用户输入的代理地址。
 * 为什么白名单 scheme：地址将注入到全部 gh/npm 子进程环境变量并可能驱动 fetch dispatcher，
 * 放行 file://、gopher:// 等怪异 scheme 属于扩大攻击面；内嵌凭据会随进程 env 暴露，禁止保存。
 */
export function validateProxyUrl(input) {
    if (typeof input !== 'string' || !input.trim())
        return { ok: false, error: '代理地址不能为空' };
    // 控制字符预处理：WHATWG URL 会静默剥离 NUL 等控制符后继续解析（实测 '\x00http://x'
    // 被接受且 hostname='x'），但注入到子进程 env 的必须是原始串——剥离后 env 与
    // 校验结果不一致，且控制符在环境变量里属滥用输入。直接前置拒绝最干净。
    if (/[\x00-\x1f\x7f]/.test(input))
        return { ok: false, error: '代理地址包含非法控制字符' };
    const raw = input.trim();
    let parsed;
    try {
        // WHATWG URL 原生识别 socks5/socks5h scheme（实测），无需改写即可完成结构校验；
        // 返回给调用方的始终保持用户原始串——注入 env 的值必须与用户输入一致。
        parsed = new URL(raw);
    }
    catch {
        return { ok: false, error: '代理地址格式无效，应为 http://host:port 或 socks5://host:port' };
    }
    // socks5h:// 与 socks5:// 的本质差异在 DNS 归属：socks5 在本机解析（系统 DNS 可能被污染），
    // socks5h 把域名原样交给代理端解析（抗污染更强）。两者均为合法代理形态，一并放行。
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'socks5:' && parsed.protocol !== 'socks5h:') {
        return { ok: false, error: `不支持的协议 ${parsed.protocol}，仅允许 http / https / socks5 / socks5h` };
    }
    if (parsed.username || parsed.password) {
        return { ok: false, error: '暂不支持内嵌凭据的代理地址（凭据会随子进程环境变量暴露）' };
    }
    // WHATWG URL 对 "http://" 与 "socks5://" 这类空 host 会静默填空串 hostname，
    // 必须显式拦截；超长主机名同样拒绝（正常代理地址不可能 4KB+，属滥用输入）。
    if (!parsed.hostname)
        return { ok: false, error: '代理地址缺少主机名' };
    if (parsed.hostname.length > 253)
        return { ok: false, error: '代理主机名异常超长' };
    // 保留域名一律拒绝（RFC 2606 / RFC 6761）。
    // 为什么这条比格式校验更重要：这些域名**保证不可解析**，配置成代理必然让全部
    // 外联失败。2026-11-23 事故的直接触发就是测试占位符 http://manual2.example:8888
    // 落进了用户真实配置——格式校验完全放行，因为它"看起来"是个合法 URL。
    // 把这类值挡在保存入口，比故障后排查便宜得多。
    if (isReservedHostname(parsed.hostname)) {
        return {
            ok: false,
            error: '代理地址使用了保留测试域名（.example / .invalid / .test / .localhost / example.com 等），该类域名保证不可解析，无法作为代理使用',
        };
    }
    return { ok: true, url: raw };
}
/**
 * 是否为 RFC 2606 / RFC 6761 保留域名（保证不可解析）。
 * 纯函数，供 validateProxyUrl 调用与单测直接覆盖。
 */
export function isReservedHostname(hostname) {
    const h = String(hostname || '').toLowerCase().replace(/\.$/, '');
    if (!h)
        return false;
    if (h === 'example.com' || h === 'example.net' || h === 'example.org')
        return true;
    return ['.example', '.invalid', '.test', '.localhost', '.example.com', '.example.net', '.example.org'].some((suffix) => h === suffix.slice(1) || h.endsWith(suffix));
}
/** 归一化 NO_PROXY：强制 localhost,127.0.0.1 置首（本机 Web API 回环请求绝不能被代理劫持） */
function normalizeNoProxy(input) {
    const raw = typeof input === 'string' ? input : '';
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    for (const must of ['localhost', '127.0.0.1']) {
        if (!parts.some((p) => p.toLowerCase() === must))
            parts.unshift(must);
    }
    return parts.join(',');
}
/**
 * 三级降级解析 undici（仅 fetch dispatcher 需要；gh/npm 子进程链路完全无关）。
 * 1. DSH 宿主运行时 require 链（desktop profile 实测可用）；
 * 2. 未来 Node 开放 node:undici 内置模块（22.18 仍为 ERR_UNKNOWN_BUILTIN_MODULE）；
 * 3. 均失败 → 返回 null，npm 探测链路保持直连，不炸任何主流程。
 */
function resolveUndici() {
    try {
        const cordisPkg = path.join(os.homedir(), '.dsh', 'profiles', 'desktop', 'node_modules', '@deepseek-ai', 'cordis', 'package.json');
        const req = createRequire(cordisPkg);
        const u = req('undici');
        if (u && typeof u.ProxyAgent === 'function')
            return u;
    }
    catch { /* 宿主路径不存在（web/CLI profile）→ 走下一级 */ }
    return null;
}
export class ProxyManager {
    config = { ...DEFAULT_CONFIG };
    lastProbe;
    fetchProxyAvailable = false;
    activeDispatcherUrl = null;
    /** 局部 ProxyAgent 实例（**不**装到全局 dispatcher，只供本插件自己的 fetch 显式使用） */
    activeDispatcher = null;
    /**
     * 持久化文件路径覆盖（测试注入用）。
     * 为什么必须有这个入口：单元测试需要 save/persist 的真实语义，但绝不能写
     * 用户真实的 ~/.dsh/data/dsh-github-flow/proxy.json——2026-11-23 的事故就是
     * 测试把占位代理写进真实配置，导致宿主进程全局 dispatcher 指向死地址。
     */
    storePathOverride = null;
    /** 最近一次系统代理检测结果（缓存 + 定时刷新；getEnv 是同步热路径，绝不能在这里起子进程） */
    systemProxy = null;
    systemProxyTimer = null;
    /**
     * 是否已卸载。卸载后仍在途的检测/探测响应不得再落地——
     * 否则会为一个已销毁的实例重建 ProxyAgent（连接池永不释放）并覆盖持久化文件。
     */
    disposed = false;
    /**
     * 系统代理读取器（测试注入用）。
     * 必须保持「未注入时就是 undefined」，**不能**兜底成 defaultRegReader：
     * detectSystemProxy 用 `!reader` 判定是否走真实注册表路径，若这里预先塞了
     * 默认读取器，Linux/macOS 上就会绕过平台门禁去 spawn `reg.exe`。
     */
    systemProxyReader;
    constructor(presetUrl, systemProxyReader, storePath) {
        this.systemProxyReader = systemProxyReader;
        if (storePath)
            this.storePathOverride = storePath;
        this.load(presetUrl);
        this.applyFetchDispatcher();
        this.startSystemProxyWatch();
    }
    /** 读取持久化文件；不存在时回落 cordis.patch.yml 预置值；再无则保持默认直连 */
    load(presetUrl) {
        try {
            const storePath = this.storePathOverride || resolveStorePath();
            if (fs.existsSync(storePath)) {
                const raw = JSON.parse(fs.readFileSync(storePath, 'utf8'));
                if (raw && typeof raw === 'object') {
                    const cfg = typeof raw.config === 'object' && raw.config ? raw.config : raw;
                    const url = typeof cfg.url === 'string' ? cfg.url.trim() : '';
                    // 文件中的 url 仍走校验：文件可能被手改出非法值，持久化不能成为绕过校验的后门
                    const autoFollow = cfg.autoFollowSystem === true;
                    const validUrl = validateProxyUrl(url).ok ? url : '';
                    this.config = {
                        // 兼容老配置（没有 enabled 字段）：此前「有 url 即视为启用」，
                        // 现在跟随系统模式下 url 可以为空，故开=True 的条件要带上 autoFollow。
                        enabled: typeof cfg.enabled === 'boolean' ? cfg.enabled : Boolean(validUrl || autoFollow),
                        url: validUrl,
                        noProxy: normalizeNoProxy(cfg.noProxy),
                        applyToPackageManager: cfg.applyToPackageManager !== false,
                        autoFollowSystem: autoFollow,
                    };
                    if (typeof raw.lastProbe === 'object' && raw.lastProbe)
                        this.lastProbe = raw.lastProbe;
                    return;
                }
            }
        }
        catch { /* 文件损坏/不可读 → 视为未配置，不阻断启动 */ }
        // 无持久化文件：使用 Cordis Config 预置（若管理员在 cordis.patch.yml 配置且合法）
        if (presetUrl && validateProxyUrl(presetUrl).ok) {
            this.config = { ...DEFAULT_CONFIG, enabled: true, url: presetUrl.trim() };
        }
    }
    /**
     * 系统代理轮询：启动即检测一次，此后每 30s 刷新。
     * 为什么轮询而不是注册表监听：RegNotifyChangeKeyValue 需要常驻句柄与原生绑定，
     * 收益（毫秒级跟随）撑不起复杂度；30s 对「开关代理」这个动作的感知延迟完全够用。
     * unref 让定时器不阻止进程退出——DSH 宿主关闭时插件不该成为悬挂理由。
     */
    startSystemProxyWatch() {
        // 懒启停：没开「跟随系统代理」时轮询毫无意义（每 30s 两次 reg.exe 子进程）。
        // 开关打开时才启动，关掉即停；save() 里会同步调用本方法 reconcile。
        this.syncSystemProxyWatch();
    }
    /**
     * 依据当前配置启停系统代理轮询。
     * 只在 autoFollowSystem=true 时运行定时器——否则纯手动模式白白每 30 秒 spawn 两次 reg.exe。
     */
    syncSystemProxyWatch() {
        if (this.disposed)
            return;
        // 能否真检测：注入了 reader（测试接缝 / 宿主自定义）或本机是 Windows。
        // 非 Windows 且无 reader 时，定时器每次都会立刻返回 unsupported——纯空转唤醒。
        const canDetect = Boolean(this.systemProxyReader) || process.platform === 'win32';
        const shouldWatch = this.config.autoFollowSystem;
        if (shouldWatch && !canDetect) {
            // 不支持平台也要检测一次：把 supported=false 落到缓存，UI 才能显示
            // 「本平台不支持」而不是永远停在「尚未检测」。
            if (!this.systemProxy)
                void this.refreshSystemProxy();
            this.stopSystemProxyWatch();
            return;
        }
        if (shouldWatch && !this.systemProxyTimer) {
            void this.refreshSystemProxy();
            if (typeof setInterval === 'function') {
                this.systemProxyTimer = setInterval(() => { void this.refreshSystemProxy(); }, 30_000);
                // unref 让定时器不阻止进程退出
                if (this.systemProxyTimer && typeof this.systemProxyTimer.unref === 'function')
                    this.systemProxyTimer.unref();
            }
            return;
        }
        if (!shouldWatch && this.systemProxyTimer) {
            this.stopSystemProxyWatch();
        }
    }
    /** 停止轮询并释放句柄。插件卸载/热重载时必须调用，否则旧定时器会持续 spawn reg.exe */
    stopSystemProxyWatch() {
        if (!this.systemProxyTimer)
            return;
        try {
            if (typeof clearInterval === 'function')
                clearInterval(this.systemProxyTimer);
        }
        catch { /* 清理失败不影响后续 */ }
        this.systemProxyTimer = null;
    }
    /**
     * 插件卸载钩子：释放轮询与代理连接池。
     * Cordis 热重载后若不调用，旧实例的 setInterval 会继续跑，
     * N 次重载就叠 N 个定时器，每个每 30s spawn 两次 reg.exe。
     */
    dispose() {
        this.disposed = true;
        this.stopSystemProxyWatch();
        this.closeActiveDispatcher();
        if (this.activeDispatcherUrl !== null) {
            this.activeDispatcher = null;
            this.activeDispatcherUrl = null;
            this.fetchProxyAvailable = false;
        }
    }
    /** 关闭当前 ProxyAgent（undici 的 agent 持有连接池，丢弃前必须 close，否则连接泄漏） */
    closeActiveDispatcher() {
        const agent = this.activeDispatcher;
        if (!agent)
            return;
        try {
            if (typeof agent.close === 'function') {
                // close() 返回 Promise；不 await——卸载路径上不能阻塞，失败也无害
                const p = agent.close();
                if (p && typeof p.catch === 'function')
                    p.catch(() => { });
            }
            else if (typeof agent.destroy === 'function') {
                agent.destroy();
            }
        }
        catch { /* 关闭失败不阻断卸载 */ }
    }
    /**
     * 刷新系统代理缓存。检测失败静默保持旧值（下次轮询再试）；
     * 自动跟随模式下 effectiveUrl 可能因此变化，dispatcher 需要跟着重应用。
     */
    async refreshSystemProxy() {
        const next = await detectSystemProxy(this.systemProxyReader);
        // 卸载后到达的响应：只更新内部缓存也没有意义，直接丢弃，
        // 避免 applyFetchDispatcher 为一个已销毁的实例重建连接池
        if (this.disposed)
            return this.systemProxy;
        if (next) {
            const prevUrl = this.getEffectiveUrl();
            this.systemProxy = next;
            if (this.getEffectiveUrl() !== prevUrl)
                this.applyFetchDispatcher();
        }
        return this.systemProxy;
    }
    /**
     * 实际生效的代理地址（唯一裁决点，两种模式互斥）：
     * - 自动跟随开：只看系统代理——系统开就用系统地址，系统关就直连，手动填写的 url 被完全无视；
     *   这样不会出现「我填了地址怎么不生效」的双源歧义，开关即模式。
     * - 自动跟随关：纯手动模式，有 url 用 url，没有就零干预（gh 继承宿主环境变量 / 直连）。
     */
    getEffectiveUrl() {
        // 总开关关闭 = 明确要求直连，无论设了什么来源都不生效（用户显式意图优先）
        if (!this.config.enabled)
            return '';
        if (this.config.autoFollowSystem) {
            return this.systemProxy && this.systemProxy.enabled && this.systemProxy.url ? this.systemProxy.url : '';
        }
        return this.config.url;
    }
    /**
     * 原子写持久化文件：先写临时文件再 rename，杜绝并发/崩溃产生半截 JSON。
     * 写盘失败（目录权限/沙箱）不抛出：代理是「尽力持久化」语义——内存态已生效，
     * 仅丢失重启恢复能力；用一次 console.warn 提示用户，UI 仍能正常工作。
     */
    persist() {
        try {
            const storePath = this.storePathOverride || resolveStorePath();
            const dir = path.dirname(storePath);
            fs.mkdirSync(dir, { recursive: true });
            const tmp = `${storePath}.${process.pid}.tmp`;
            fs.writeFileSync(tmp, JSON.stringify({ config: this.config, lastProbe: this.lastProbe }, null, 2), 'utf8');
            fs.renameSync(tmp, storePath);
        }
        catch (e) {
            console.warn(`[dsh-github-flow] 代理配置写盘失败（本次会话仍生效，重启后需重新设置）: ${e?.message || e}`);
        }
    }
    /**
     * 生成注入子进程的代理环境变量。
     * 未启用时返回 {}——绝不覆盖 process.env 中既有的系统级代理设置（用户不设插件代理
     * 时 gh 自然继承宿主环境变量，即「默认走系统设置」语义）。
     * socks5 对 gh（Go runtime）原生有效；对 npm 同样有效（pacote/agent-base 支持）。
     */
    getEnv(scope = 'gh') {
        const url = this.getEffectiveUrl();
        if (!url)
            return {};
        if (scope === 'package-manager' && !this.config.applyToPackageManager)
            return {};
        return {
            HTTPS_PROXY: url,
            HTTP_PROXY: url,
            https_proxy: url,
            http_proxy: url,
            NO_PROXY: this.config.noProxy,
            no_proxy: this.config.noProxy,
        };
    }
    /**
     * 构建本插件自己的 ProxyAgent（**不**写入进程全局 dispatcher）。
     *
     * 2026-11-23 事故复盘后的架构修正：
     * 旧实现在这里把 ProxyAgent 装成了进程的全局 dispatcher。那个 API 的
     * 作用域是整个 DSH 宿主进程——插件本来只需要让自己的 npm 版本探测走代理，
     * 结果连模型推理、账号资料、CodeArts token 续期全部被改道。一旦代理地址写错
     * （例如测试占位符 http://manual2.example:8888 落进配置），整个应用会哑掉，
     * 表现为「UI 能开、所有网络全挂」的割裂故障，且排查时最容易被误判成网络问题。
     *
     * 现在只创建并在实例内缓存 ProxyAgent，由 updater 在自己的 fetch 上显式传
     * dispatcher。全局 dispatcher 一行都不碰：插件配置再错，坏掉的也只是插件的
     * 版本探测，宿主进程与其他插件完全不受影响。
     *
     * socks5 仍显式不可用（undici 的 ProxyAgent 只认 http/https）：该场景 npm 探测
     * 保持直连，GitHub 链路照常走 socks5，UI 如实提示差异，不做静默降级。
     */
    applyFetchDispatcher() {
        const url = this.getEffectiveUrl();
        if (!url || url.startsWith('socks5://') || url.startsWith('socks5h://')) {
            this.closeActiveDispatcher();
            this.activeDispatcher = null;
            this.activeDispatcherUrl = null;
            this.fetchProxyAvailable = false;
            return false;
        }
        const undici = resolveUndici();
        if (!undici) {
            this.fetchProxyAvailable = false;
            return false;
        }
        try {
            // url 变更才重建；重建前关掉旧 agent，否则每换一次地址就漏一个连接池
            if (this.activeDispatcherUrl !== url || !this.activeDispatcher) {
                this.closeActiveDispatcher();
                this.activeDispatcher = new undici.ProxyAgent(url);
                this.activeDispatcherUrl = url;
            }
            this.fetchProxyAvailable = true;
            return true;
        }
        catch {
            this.activeDispatcher = null;
            this.activeDispatcherUrl = null;
            this.fetchProxyAvailable = false;
            return false;
        }
    }
    /**
     * 当前生效的代理 dispatcher（null = 直连）。
     * 供本插件自己的 fetch 显式使用——这是唯一正确的代理作用域。
     */
    getDispatcher() {
        return this.activeDispatcher;
    }
    /** 保存新配置并立即生效（写文件 + 重应用 dispatcher），返回完整状态快照 */
    save(input) {
        if (input.url !== undefined && input.url !== '') {
            const v = validateProxyUrl(input.url);
            if (!v.ok)
                return { ok: false, error: v.error, state: this.snapshot() };
        }
        const nextUrl = input.url !== undefined ? (typeof input.url === 'string' ? input.url.trim() : '') : this.config.url;
        const prevAuto = this.config.autoFollowSystem;
        // enabled 的缺省推断（向后兼容）：
        // - 调用方显式给了 enabled → 以它为准（UI 走这条）；
        // - 没给 enabled 但传了非空 url → 视为「要启用」（老调用方 save({url}) 的语义）；
        // - 其余保持现状。
        // 不做这个推断的话，所有只传 url 的老调用都会静默失效（phase5 就是这么暴露的）。
        const inferredEnabled = typeof input.enabled === 'boolean'
            ? input.enabled
            : (input.url !== undefined && String(input.url || '').trim() ? true : this.config.enabled);
        this.config = {
            enabled: inferredEnabled,
            url: nextUrl,
            noProxy: normalizeNoProxy(input.noProxy !== undefined ? input.noProxy : this.config.noProxy),
            applyToPackageManager: typeof input.applyToPackageManager === 'boolean' ? input.applyToPackageManager : this.config.applyToPackageManager,
            autoFollowSystem: typeof input.autoFollowSystem === 'boolean' ? input.autoFollowSystem : prevAuto,
        };
        // 依配置启停轮询：打开跟随 → 立即检测一次并开始轮询；关闭跟随 → 停掉定时器
        if (!prevAuto && this.config.autoFollowSystem) {
            void this.refreshSystemProxy();
        }
        this.syncSystemProxyWatch();
        this.applyFetchDispatcher();
        this.lastProbe = undefined; // 配置变更后旧探测结果失效
        this.persist();
        return { ok: true, state: this.snapshot() };
    }
    /** 经当前代理配置探测 GitHub API 连通性（2.5s 超时）。失败不回滚保存——离线预配置是合法场景 */
    async probe() {
        const started = Date.now();
        const effectiveUrl = this.getEffectiveUrl();
        if (!effectiveUrl) {
            this.lastProbe = { ok: false, at: started, error: '未配置代理地址且未检测到系统代理（当前为直连）' };
            return this.lastProbe;
        }
        /*
         * socks5 绝不能在这里用 fetch 探测。
         * undici 的 ProxyAgent 只认 http/https，socks5 时 dispatcher 恒为 null，
         * 于是「探测」实际测的是直连通不通——GFW 下代理完全正常却报失败、
         * 代理配错但本机能直连却报成功，结论与真实可用性正好相反。
         * socks5 的真实链路是 gh 子进程（executor 已注入代理环境变量），
         * 由路由层改走 `gh api rate_limit`，这里只做防御性兜底。
         */
        if (/^socks5h?:\/\//i.test(effectiveUrl)) {
            this.lastProbe = {
                ok: false,
                at: started,
                error: 'socks5 代理无法用 Node fetch 探测，应改由 gh 链路探测',
            };
            return this.lastProbe;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2_500);
        try {
            // dispatcher 必须显式带上：移除进程级全局劫持后，裸 fetch 一律直连。
            // 漏了这一步，探测就变成「测直连通不通」——GFW 下代理完全正常却报失败，
            // 代理地址写错但本机能直连却报成功，正好把功能靶心打反。
            const dispatcher = this.getDispatcher();
            const init = {
                signal: controller.signal,
                headers: { 'User-Agent': 'dsh-github-flow-proxy-probe' },
            };
            if (dispatcher)
                init.dispatcher = dispatcher;
            const res = await fetch('https://api.github.com/rate_limit', init);
            // 走到这里 dispatcher 必然非 null（socks5 已在函数入口拦截），
            // 因此本次结果确实代表「经代理的连通性」。
            this.lastProbe = res.ok
                ? { ok: true, at: started, latencyMs: Date.now() - started }
                : { ok: false, at: started, error: `GitHub API 响应 ${res.status}` };
        }
        catch (e) {
            this.lastProbe = { ok: false, at: started, error: String(e?.cause?.message || e?.message || e).slice(0, 200) };
        }
        finally {
            clearTimeout(timer);
            try {
                this.persist();
            }
            catch { /* 探测结果写盘失败不影响内存态 */ }
        }
        return this.lastProbe;
    }
    /**
     * 回填外部探测结果（socks5 由路由层走 gh 链路探测）。
     * 统一走这里而不是让路由直接改 snapshot：lastProbe 需要同时落盘，
     * 否则重开设置页会看到上一次的旧结论。
     */
    recordProbe(result) {
        this.lastProbe = { ...result };
        try {
            this.persist();
        }
        catch { /* 写盘失败不影响内存态 */ }
    }
    snapshot() {
        return {
            config: { ...this.config, noProxy: this.config.noProxy },
            fetchProxyAvailable: this.fetchProxyAvailable,
            lastProbe: this.lastProbe ? { ...this.lastProbe } : undefined,
            systemProxy: this.systemProxy ? { ...this.systemProxy } : null,
            effectiveUrl: this.getEffectiveUrl(),
        };
    }
}
