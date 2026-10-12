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
import { createRequire } from 'node:module';

export interface ProxyConfig {
  /** 代理地址，如 "http://127.0.0.1:7890"。空串 = 未启用（回落系统环境/直连） */
  url: string;
  /** NO_PROXY 排除列表（逗号分隔）。localhost,127.0.0.1 恒被强制前置，防止本机 Web API 回环请求被代理劫持 */
  noProxy: string;
  /** 是否同步应用于 npm registry 探测与一键升级链路（包管理器走环境变量，天然支持） */
  applyToPackageManager: boolean;
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
}

const DEFAULT_CONFIG: ProxyConfig = {
  url: '',
  noProxy: 'localhost,127.0.0.1',
  applyToPackageManager: true,
};

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

  constructor(presetUrl?: string) {
    this.load(presetUrl);
    this.applyFetchDispatcher();
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
    if (!this.config.url) return {};
    if (scope === 'package-manager' && !this.config.applyToPackageManager) return {};
    return {
      HTTPS_PROXY: this.config.url,
      HTTP_PROXY: this.config.url,
      https_proxy: this.config.url,
      http_proxy: this.config.url,
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
    const url = this.config.url;
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
    this.config = {
      url: nextUrl,
      noProxy: normalizeNoProxy(input.noProxy !== undefined ? input.noProxy : this.config.noProxy),
      applyToPackageManager: typeof input.applyToPackageManager === 'boolean' ? input.applyToPackageManager : this.config.applyToPackageManager,
    };
    this.applyFetchDispatcher();
    this.lastProbe = undefined; // 配置变更后旧探测结果失效
    this.persist();
    return { ok: true, state: this.snapshot() };
  }

  /** 经当前代理配置探测 GitHub API 连通性（2.5s 超时）。失败不回滚保存——离线预配置是合法场景 */
  async probe(): Promise<ProxyProbeResult> {
    const started = Date.now();
    if (!this.config.url) {
      this.lastProbe = { ok: false, at: started, error: '未配置代理地址（当前为系统默认直连）' };
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
    };
  }
}
