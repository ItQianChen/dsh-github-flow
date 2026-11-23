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

export interface ProxyConfig {
  /** 代理地址，如 "http://127.0.0.1:7890"。空串 = 未启用（回落系统环境/直连） */
  url: string;
  /** NO_PROXY 排除列表（逗号分隔）。localhost,127.0.0.1 恒被强制前置，防止本机 Web API 回环请求被代理劫持 */
  noProxy: string;
  /** 是否同步应用于 npm registry 探测与一键升级链路（包管理器走环境变量，天然支持） */
  applyToPackageManager: boolean;
  /**
   * 自动跟随 Windows 系统代理（注册表 Internet Settings）。
   * 优先级：手动配置的 url 永远优先——本开关只在 url 为空时生效；
   * 系统代理关闭时自动回落直连，不做任何残留。
   */
  autoFollowSystem: boolean;
}

/** 一次系统代理检测的结果。enabled=false 表示系统代理已关；null 表示平台不支持或检测失败 */
export interface SystemProxyInfo {
  enabled: boolean;
  /** 规范化后的代理地址（enabled 时非空），如 "http://127.0.0.1:7890" */
  url: string;
  /** 检测完成时间戳 */
  at: number;
}

export interface ProxyProbeResult {
  ok: boolean;
  at: number;
  latencyMs?: number;
  error?: string;
}

export interface ProxyStateSnapshot {
  config: ProxyConfig;
  /** fetch 链路（undici dispatcher）是否可用。不可用时 npm 探测保持直连，GitHub 链路不受影响 */
  fetchProxyAvailable: boolean;
  lastProbe?: ProxyProbeResult;
  /** 最近一次系统代理检测（null = 未检测到 / 平台不支持）。UI 据此展示跟随状态 */
  systemProxy?: SystemProxyInfo | null;
  /** 实际生效的代理地址（手动配置优先，其次自动跟随的系统代理，空串 = 直连） */
  effectiveUrl: string;
}

const DEFAULT_CONFIG: ProxyConfig = {
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
export function parseProxyServer(raw: unknown): string {
  const s = String(raw || '').trim();
  if (!s) return '';

  // 按协议分写形态：切分出各段，https 优先、http 兜底、socks 次之
  if (s.includes('=')) {
    const parts: Record<string, string> = {};
    for (const seg of s.split(';')) {
      const eq = seg.indexOf('=');
      if (eq < 0) continue;
      const proto = seg.slice(0, eq).trim().toLowerCase();
      const addr = seg.slice(eq + 1).trim();
      if (proto && addr) parts[proto] = addr;
    }
    // https 优先于 http（GitHub 链路主要是 https 流量），socks 兜底
    const pick = parts['https'] || parts['http'] || parts['socks'];
    if (pick) return normalizeProxyAddr(pick, parts['socks'] !== undefined && !parts['https'] && !parts['http']);
    return '';
  }

  // 单一地址形态
  return normalizeProxyAddr(s, false);
}

/** 给裸 host:port 补 scheme；socks 形态补 socks5://，其余补 http:// */
function normalizeProxyAddr(addr: string, isSocks: boolean): string {
  const s = addr.trim();
  if (!s) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return validateSchemeOnly(s);
  if (!/^[^/]+:\d+$/.test(s) && !/^[^/]+:\d+\/?.*$/.test(s)) {
    // 不是 host:port 结构（可能是 PAC URL 等不支持形态），交给 URL 校验兜底
    return validateSchemeOnly(isSocks ? 'socks5://' + s : 'http://' + s);
  }
  return validateSchemeOnly((isSocks ? 'socks5://' : 'http://') + s);
}

/** 借 validateProxyUrl 的白名单做最终把关，失败返回空串（不抛错——检测失败不算事故） */
function validateSchemeOnly(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname || !parsed.port) return '';
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'socks5:' && parsed.protocol !== 'socks5h:') return '';
    return url;
  } catch {
    return '';
  }
}

/**
 * 解析 reg query 单值查询的 stdout（纯函数，供单测覆盖）。
 * 典型输出两行：首行是键路径，第二行形如 "    ProxyEnable    REG_DWORD    0x1"。
 * 查询不存在的值时 reg 以非零码退出，stdout 为空——这里只管解析文本，错误由调用方处理。
 */
export function parseRegQueryValue(stdout: unknown): string {
  const lines = String(stdout || '').split(/\r?\n/);
  for (const line of lines.slice(1)) {
    const m = line.match(/^\s{2,}\S+\s+REG_(?:SZ|DWORD)\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  return '';
}

/**
 * 检测 Windows 系统代理（读注册表 Internet Settings）。
 * 非 Windows 平台、reg 不存在、注册表查询失败一律返回 null——
 * 「检测不到」不是错误，绝不向上抛异常打断主流程。
 * reader 参数供测试注入 mock；生产路径走 reg query 子进程（3s 超时防挂起）。
 */
export async function detectSystemProxy(
  reader?: (key: string, value: string) => Promise<string>
): Promise<SystemProxyInfo | null> {
  if (process.platform !== 'win32') return null;
  const at = Date.now();
  const run = reader || defaultRegReader;
  try {
    const [enableOut, serverOut] = await Promise.all([
      run(WIN_INTERNET_SETTINGS_KEY, 'ProxyEnable'),
      run(WIN_INTERNET_SETTINGS_KEY, 'ProxyServer').catch(() => ''),
    ]);
    const enableRaw = parseRegQueryValue(enableOut);
    const enabled = /^0x1$/i.test(enableRaw) || enableRaw === '1';
    if (!enabled) return { enabled: false, url: '', at };
    const url = parseProxyServer(parseRegQueryValue(serverOut));
    if (!url) return { enabled: false, url: '', at };
    return { enabled: true, url, at };
  } catch {
    return null;
  }
}

function defaultRegReader(key: string, value: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // windowsHide 必须加：DSH 是无控制台的 GUI 进程，从这里 spawn reg.exe（控制台程序）
    // 会在用户桌面弹出一个黑色命令行窗口——30 秒一次的轮询等于每半分钟骚扰一次用户。
    // 全项目其余 spawn（executor.ts）均有此选项，这里不能成为例外。
    execFile('reg', ['query', key, '/v', value], { timeout: 3000, windowsHide: true }, (err, stdout) => {
      if (err) reject(err);
      else resolve(String(stdout || ''));
    });
  });
}

/** 持久化路径：~/.dsh/data/dsh-github-flow/proxy.json（与 DSH 用户数据目录规范对齐） */
function resolveStorePath(): string {
  return path.join(os.homedir(), '.dsh', 'data', 'dsh-github-flow', 'proxy.json');
}

/**
 * 校验用户输入的代理地址。
 * 为什么白名单 scheme：地址将注入到全部 gh/npm 子进程环境变量并可能驱动 fetch dispatcher，
 * 放行 file://、gopher:// 等怪异 scheme 属于扩大攻击面；内嵌凭据会随进程 env 暴露，禁止保存。
 */
export function validateProxyUrl(input: unknown): { ok: boolean; url?: string; error?: string } {
  if (typeof input !== 'string' || !input.trim()) return { ok: false, error: '代理地址不能为空' };
  // 控制字符预处理：WHATWG URL 会静默剥离 NUL 等控制符后继续解析（实测 '\x00http://x'
  // 被接受且 hostname='x'），但注入到子进程 env 的必须是原始串——剥离后 env 与
  // 校验结果不一致，且控制符在环境变量里属滥用输入。直接前置拒绝最干净。
  if (/[\x00-\x1f\x7f]/.test(input)) return { ok: false, error: '代理地址包含非法控制字符' };
  const raw = input.trim();
  let parsed: URL;
  try {
    // WHATWG URL 原生识别 socks5/socks5h scheme（实测），无需改写即可完成结构校验；
    // 返回给调用方的始终保持用户原始串——注入 env 的值必须与用户输入一致。
    parsed = new URL(raw);
  } catch {
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
  if (!parsed.hostname) return { ok: false, error: '代理地址缺少主机名' };
  if (parsed.hostname.length > 253) return { ok: false, error: '代理主机名异常超长' };
  return { ok: true, url: raw };
}

/** 归一化 NO_PROXY：强制 localhost,127.0.0.1 置首（本机 Web API 回环请求绝不能被代理劫持） */
function normalizeNoProxy(input: unknown): string {
  const raw = typeof input === 'string' ? input : '';
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  for (const must of ['localhost', '127.0.0.1']) {
    if (!parts.some((p) => p.toLowerCase() === must)) parts.unshift(must);
  }
  return parts.join(',');
}

/**
 * 三级降级解析 undici（仅 fetch dispatcher 需要；gh/npm 子进程链路完全无关）。
 * 1. DSH 宿主运行时 require 链（desktop profile 实测可用）；
 * 2. 未来 Node 开放 node:undici 内置模块（22.18 仍为 ERR_UNKNOWN_BUILTIN_MODULE）；
 * 3. 均失败 → 返回 null，npm 探测链路保持直连，不炸任何主流程。
 */
function resolveUndici(): { ProxyAgent: any; setGlobalDispatcher: any; getGlobalDispatcher: any } | null {
  try {
    const cordisPkg = path.join(os.homedir(), '.dsh', 'profiles', 'desktop', 'node_modules', '@deepseek-ai', 'cordis', 'package.json');
    const req = createRequire(cordisPkg);
    const u = req('undici');
    if (u && typeof u.ProxyAgent === 'function' && typeof u.setGlobalDispatcher === 'function' && typeof u.getGlobalDispatcher === 'function') return u;
  } catch { /* 宿主路径不存在（web/CLI profile）→ 走下一级 */ }
  return null;
}

export class ProxyManager {
  private config: ProxyConfig = { ...DEFAULT_CONFIG };
  private lastProbe: ProxyProbeResult | undefined;
  private fetchProxyAvailable = false;
  private activeDispatcherUrl: string | null = null;
  /** 安装代理 dispatcher 前的进程默认 dispatcher 快照（关闭代理时恢复，防残留） */
  private defaultDispatcher: unknown = null;
  /** 最近一次系统代理检测结果（缓存 + 定时刷新；getEnv 是同步热路径，绝不能在这里起子进程） */
  private systemProxy: SystemProxyInfo | null = null;
  private systemProxyTimer: any = null;
  private systemProxyReader: (key: string, value: string) => Promise<string>;

  constructor(presetUrl?: string, systemProxyReader?: (key: string, value: string) => Promise<string>) {
    this.systemProxyReader = systemProxyReader || defaultRegReader;
    this.load(presetUrl);
    this.applyFetchDispatcher();
    this.startSystemProxyWatch();
  }

  /** 读取持久化文件；不存在时回落 cordis.patch.yml 预置值；再无则保持默认直连 */
  private load(presetUrl?: string): void {
    try {
      const storePath = resolveStorePath();
      if (fs.existsSync(storePath)) {
        const raw = JSON.parse(fs.readFileSync(storePath, 'utf8'));
        if (raw && typeof raw === 'object') {
          const cfg = typeof raw.config === 'object' && raw.config ? raw.config : raw;
          const url = typeof cfg.url === 'string' ? cfg.url.trim() : '';
          // 文件中的 url 仍走校验：文件可能被手改出非法值，持久化不能成为绕过校验的后门
          this.config = {
            url: validateProxyUrl(url).ok ? url : '',
            noProxy: normalizeNoProxy(cfg.noProxy),
            applyToPackageManager: cfg.applyToPackageManager !== false,
            autoFollowSystem: cfg.autoFollowSystem === true,
          };
          if (typeof raw.lastProbe === 'object' && raw.lastProbe) this.lastProbe = raw.lastProbe;
          return;
        }
      }
    } catch { /* 文件损坏/不可读 → 视为未配置，不阻断启动 */ }

    // 无持久化文件：使用 Cordis Config 预置（若管理员在 cordis.patch.yml 配置且合法）
    if (presetUrl && validateProxyUrl(presetUrl).ok) {
      this.config = { ...DEFAULT_CONFIG, url: presetUrl.trim() };
    }
  }

  /**
   * 系统代理轮询：启动即检测一次，此后每 30s 刷新。
   * 为什么轮询而不是注册表监听：RegNotifyChangeKeyValue 需要常驻句柄与原生绑定，
   * 收益（毫秒级跟随）撑不起复杂度；30s 对「开关代理」这个动作的感知延迟完全够用。
   * unref 让定时器不阻止进程退出——DSH 宿主关闭时插件不该成为悬挂理由。
   */
  private startSystemProxyWatch(): void {
    void this.refreshSystemProxy();
    if (typeof setInterval === 'function') {
      this.systemProxyTimer = setInterval(() => { void this.refreshSystemProxy(); }, 30_000);
      if (this.systemProxyTimer && typeof this.systemProxyTimer.unref === 'function') this.systemProxyTimer.unref();
    }
  }

  /**
   * 刷新系统代理缓存。检测失败静默保持旧值（下次轮询再试）；
   * 自动跟随模式下 effectiveUrl 可能因此变化，dispatcher 需要跟着重应用。
   */
  async refreshSystemProxy(): Promise<SystemProxyInfo | null> {
    const next = await detectSystemProxy(this.systemProxyReader);
    if (next) {
      const prevUrl = this.getEffectiveUrl();
      this.systemProxy = next;
      if (this.getEffectiveUrl() !== prevUrl) this.applyFetchDispatcher();
    }
    return this.systemProxy;
  }

  /**
   * 实际生效的代理地址（唯一裁决点，两种模式互斥）：
   * - 自动跟随开：只看系统代理——系统开就用系统地址，系统关就直连，手动填写的 url 被完全无视；
   *   这样不会出现「我填了地址怎么不生效」的双源歧义，开关即模式。
   * - 自动跟随关：纯手动模式，有 url 用 url，没有就零干预（gh 继承宿主环境变量 / 直连）。
   */
  getEffectiveUrl(): string {
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
  private persist(): void {
    try {
      const storePath = resolveStorePath();
      const dir = path.dirname(storePath);
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${storePath}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ config: this.config, lastProbe: this.lastProbe }, null, 2), 'utf8');
      fs.renameSync(tmp, storePath);
    } catch (e: any) {
      console.warn(`[dsh-github-flow] 代理配置写盘失败（本次会话仍生效，重启后需重新设置）: ${e?.message || e}`);
    }
  }

  /**
   * 生成注入子进程的代理环境变量。
   * 未启用时返回 {}——绝不覆盖 process.env 中既有的系统级代理设置（用户不设插件代理
   * 时 gh 自然继承宿主环境变量，即「默认走系统设置」语义）。
   * socks5 对 gh（Go runtime）原生有效；对 npm 同样有效（pacote/agent-base 支持）。
   */
  getEnv(scope: 'gh' | 'package-manager' = 'gh'): Record<string, string> {
    const url = this.getEffectiveUrl();
    if (!url) return {};
    if (scope === 'package-manager' && !this.config.applyToPackageManager) return {};
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
   * 应用 fetch dispatcher（npm registry 探测链路）。
   * undici 的 ProxyAgent 不支持 socks5：该场景显式标记不可用并保持直连，
   * UI 需如实提示差异（GitHub 链路正常走 socks5），不做静默降级。
   * dispatcher 按 url 缓存重建，url 未变化时零开销。
   *
   * 关闭代理时必须恢复默认全局 dispatcher：setGlobalDispatcher 是进程级副作用，
   * 若只清空本实例状态而不回滚 dispatcher，此前安装的 ProxyAgent 会永久残留，
   * 「启用→关闭」后 npm 探测仍走死代理直到进程重启。首次安装前先快照原 dispatcher。
   */
  applyFetchDispatcher(): boolean {
    const url = this.getEffectiveUrl();
    if (!url || url.startsWith('socks5://') || url.startsWith('socks5h://')) {
      // 回滚残留的代理 dispatcher（仅在我们曾经安装过时）
      if (this.activeDispatcherUrl !== null) {
        const undici = resolveUndici();
        if (undici && this.defaultDispatcher) {
          try { undici.setGlobalDispatcher(this.defaultDispatcher); } catch { /* 回滚失败保持现状，下次保存重试 */ }
        }
        this.activeDispatcherUrl = null;
      }
      this.fetchProxyAvailable = false;
      return false;
    }
    const undici = resolveUndici();
    if (!undici) {
      this.fetchProxyAvailable = false;
      return false;
    }
    try {
      // url 变更才重建 dispatcher：高频 apply()（如 UI 反复保存）不会泄漏 agent 连接池
      if (this.activeDispatcherUrl !== url) {
        if (!this.defaultDispatcher) {
          this.defaultDispatcher = undici.getGlobalDispatcher();
        }
        undici.setGlobalDispatcher(new undici.ProxyAgent(url));
        this.activeDispatcherUrl = url;
      }
      this.fetchProxyAvailable = true;
      return true;
    } catch {
      this.fetchProxyAvailable = false;
      return false;
    }
  }

  /** 保存新配置并立即生效（写文件 + 重应用 dispatcher），返回完整状态快照 */
  save(input: Partial<ProxyConfig>): { ok: boolean; error?: string; state: ProxyStateSnapshot } {
    if (input.url !== undefined && input.url !== '') {
      const v = validateProxyUrl(input.url);
      if (!v.ok) return { ok: false, error: v.error, state: this.snapshot() };
    }
    const nextUrl = input.url !== undefined ? (typeof input.url === 'string' ? input.url.trim() : '') : this.config.url;
    const prevAuto = this.config.autoFollowSystem;
    this.config = {
      url: nextUrl,
      noProxy: normalizeNoProxy(input.noProxy !== undefined ? input.noProxy : this.config.noProxy),
      applyToPackageManager: typeof input.applyToPackageManager === 'boolean' ? input.applyToPackageManager : this.config.applyToPackageManager,
      autoFollowSystem: typeof input.autoFollowSystem === 'boolean' ? input.autoFollowSystem : prevAuto,
    };
    // 刚打开自动跟随：不等下一轮 30s 轮询，立即检测一次，开关拨上去就能看到结果
    if (!prevAuto && this.config.autoFollowSystem) {
      void this.refreshSystemProxy();
    }
    this.applyFetchDispatcher();
    this.lastProbe = undefined; // 配置变更后旧探测结果失效
    this.persist();
    return { ok: true, state: this.snapshot() };
  }

  /** 经当前代理配置探测 GitHub API 连通性（2.5s 超时）。失败不回滚保存——离线预配置是合法场景 */
  async probe(): Promise<ProxyProbeResult> {
    const started = Date.now();
    const effectiveUrl = this.getEffectiveUrl();
    if (!effectiveUrl) {
      this.lastProbe = { ok: false, at: started, error: '未配置代理地址且未检测到系统代理（当前为直连）' };
      return this.lastProbe;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2_500);
    try {
      const res = await fetch('https://api.github.com/rate_limit', {
        signal: controller.signal,
        headers: { 'User-Agent': 'dsh-github-flow-proxy-probe' },
      });
      // 探测走的是 Node fetch：只有 http/https 代理且 undici 可用时才真经代理。
      // socks5 场景 fetch 仍直连——探测结果仅代表「GitHub 可达性」，代理有效性以 gh 链路为准。
      this.lastProbe = res.ok
        ? { ok: true, at: started, latencyMs: Date.now() - started }
        : { ok: false, at: started, error: `GitHub API 响应 ${res.status}` };
    } catch (e: any) {
      this.lastProbe = { ok: false, at: started, error: String(e?.cause?.message || e?.message || e).slice(0, 200) };
    } finally {
      clearTimeout(timer);
      try { this.persist(); } catch { /* 探测结果写盘失败不影响内存态 */ }
    }
    return this.lastProbe;
  }

  snapshot(): ProxyStateSnapshot {
    return {
      config: { ...this.config, noProxy: this.config.noProxy },
      fetchProxyAvailable: this.fetchProxyAvailable,
      lastProbe: this.lastProbe ? { ...this.lastProbe } : undefined,
      systemProxy: this.systemProxy ? { ...this.systemProxy } : null,
      effectiveUrl: this.getEffectiveUrl(),
    };
  }
}
