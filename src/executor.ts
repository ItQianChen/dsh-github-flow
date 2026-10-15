import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findMostRecentWorkspacePath, findWorkspacePathBySession, hasGitDir } from './workspace.js';
import type { GhExecutionOptions, GhResult, AuthStatus, RepoMetadata, PluginConfig, GitLocalStatus, GitCommitLog, GitCommitEntry } from './types.js';
import type { ProxyManager } from './proxy.js';

const execFileAsync = promisify(execFile);

/**
 * spawn 形态的执行通道（stdin 可选注入）。
 *
 * 为什么存在：execFile 的 input 选项在本机（node 22.18.0 + Windows）实测从不写入
 * 子进程 stdin——既无数据也无 EOF，管道永久悬空（gh secret set 等需要 stdin 的
 * 命令会一直等到超时）。最小复现：execFile+input 对 `cmd /c more` 与 node 子进程
 * 均挂起；而 spawn + stdin.end(data) 全部正常。此函数即为后者的工程化封装，
 * 仅在调用方显式传入 stdin 时使用，其余路径保持 execFileAsync 零改动。
 *
 * 为什么超时要自己管：spawn 无 timeout 选项，用 kill + SIGTERM 兜底；
 * 输出按 maxBuffer 手工聚合（上限与 execFile 路径一致，15MB）。
 */
function spawnWithStdin(
  ghPath: string,
  args: string[],
  opts: { cwd?: string; timeout: number; env: NodeJS.ProcessEnv; stdin: string }
): Promise<{ stdout: string | Buffer; stderr: string | Buffer; killed: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn(ghPath, args, {
      cwd: opts.cwd,
      env: opts.env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let totalBytes = 0;
    let killed = false;
    let settled = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill();
    }, opts.timeout);

    const settle = (err?: Error & { killed?: boolean; stderr?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve({ stdout: Buffer.concat(outChunks), stderr: Buffer.concat(errChunks), killed });
    };

    // 聚合上限：超出即杀（与 execFile maxBuffer 语义一致；gh 正常输出远小于此）
    const MAX_BYTES = 15 * 1024 * 1024;
    child.stdout?.on('data', (d: Buffer) => {
      totalBytes += d.length;
      outChunks.push(d);
      if (totalBytes > MAX_BYTES) { killed = true; child.kill(); }
    });
    child.stderr?.on('data', (d: Buffer) => { errChunks.push(d); });
    child.on('error', (err) => {
      // spawn 失败（如 ENOENT）对齐 execFile 的错误形状：code 保留在 Error 上
      const e = Object.assign(new Error(err.message), { code: (err as NodeJS.ErrnoException).code });
      settle(e);
    });
    child.on('close', (code, signal) => {
      if (killed) {
        // 超时/超量被杀：对齐 execFile 的 Timeout 错误形状（err.killed + signal）
        const e = Object.assign(new Error(`Command timed out after ${opts.timeout}ms`), { killed: true, signal: signal || 'SIGTERM' });
        settle(e);
        return;
      }
      if (code !== 0) {
        const e = Object.assign(new Error(`Command failed with exit code ${code}`), { code, stderr: Buffer.concat(errChunks).toString('utf8').slice(0, 800) });
        settle(e);
        return;
      }
      settle();
    });
    // stdin 注入：end(data) 半关闭（写完即 EOF），子进程流式读取或一次性读取均可
    child.stdin?.end(opts.stdin, (err?: Error | null) => {
      if (err && !settled) {
        const e = Object.assign(new Error(`stdin write failed: ${err.message}`), { code: 'EPIPE' });
        settle(e);
      }
    });
  });
}

/** 认证状态缓存时长。用户手动 `gh auth login/logout` 后最多 30 秒内面板才会反映，属可接受代价 */
const AUTH_CACHE_TTL_MS = 30_000;

/** gh 版本缓存时长。与 authCache 同哲学：gh 升级是分钟级低频事件，30 秒陈旧窗口无实际影响 */
const GH_VERSION_CACHE_TTL_MS = 30_000;

/**
 * 从 `gh --version` 输出中解析语义化版本号。
 * 抽成导出纯函数的原因与 truncateOutput 相同：解析逻辑是「看似简单实则易错」的边界区，
 * 必须能用单元测试钉死（不匹配输入返回 null 而非抛错，调用方据此走 fail-open）。
 */
export function parseGhVersion(output: string): string | null {
  const m = /gh version (\d+\.\d+\.\d+)/.exec(output || '');
  return m ? m[1] : null;
}

/**
 * 数值分段比较两个 gh 版本：a>b 返回 1、a<b 返回 -1、相等返回 0。
 * 为什么不能用字符串比较：`'2.96.0' < '2.100.0'` 在字典序下为 false（'1'<'9'），
 * 这会把 2.100 误判为低于 2.96，导致可用命令被错误降级。逐段 Number 比较是唯一正确姿势。
 */
export function compareGhVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

/**
 * 解析 `git status -sb --porcelain` 输出为结构化状态。
 * 抽导出纯函数（parseGhVersion 同理）：三形态解析是易错边界区，单测钉死。
 *
 * 输出形态（实测）：
 *   `## master...origin/master [ahead 2, behind 1]`  有 ahead/behind
 *   `## master...origin/master`                       与远程同步
 *   `## master` / `## HEAD (no branch)`               无 upstream（ahead/behind 未知=-1）
 * 后续每行 `<XY> <path>` 为 porcelain 变更项（XY 两字符状态码，?? = untracked）。
 */
export function parseGitStatusOutput(output: string): GitLocalStatus | null {
  const lines = (output || '').split('\n').filter((l) => l.length > 0);
  if (lines.length === 0 || !lines[0].startsWith('## ')) return null;

  const branchLine = lines[0].slice(3); // 去掉 '## ' 前缀
  const hasUpstream = branchLine.includes('...');
  const branchPart = hasUpstream ? branchLine.split('...')[0] : branchLine.split(' ')[0];

  let ahead = -1;
  let behind = -1;
  if (hasUpstream) {
    // ahead/behind 段在 upstream 之后（可能与 #id 同现：origin/master #12）。
    // git 输出形态实测：`[ahead 2]` / `[behind 1]` / `[ahead 2, behind 1]`——
    // 单括号内逗号分隔，behind 不必然前邻 '['（正则不可锚定 '['，否则
    // `[ahead 2, behind 1]` 形态的 behind 永远漏解析——单测抓到的真实 Bug）
    const trackingPart = branchLine.split('...')[1] || '';
    ahead = 0;
    behind = 0;
    const aheadMatch = /ahead (\d+)/.exec(trackingPart);
    const behindMatch = /behind (\d+)/.exec(trackingPart);
    if (aheadMatch) ahead = Number(aheadMatch[1]);
    if (behindMatch) behind = Number(behindMatch[1]);
    // 仅 ahead 无 behind 时 behind=0（反之亦然）——git 输出只列非零侧
  }

  const dirtyFiles: Array<{ status: string; path: string }> = [];
  for (let i = 1; i < lines.length && dirtyFiles.length < 20; i++) {
    const line = lines[i];
    if (line.length < 4) continue;
    const status = line.slice(0, 2).trim() || 'M';
    // 路径可能含空格（git 不加引号场景）；rename 形态 `R  old -> new` 取 new
    let p = line.slice(3);
    const renameArrow = p.indexOf(' -> ');
    if (renameArrow >= 0) p = p.slice(renameArrow + 4);
    dirtyFiles.push({ status, path: p });
  }

  return {
    branch: branchPart.replace(/\s*\(no branch\)$/, '') || 'HEAD',
    ahead,
    behind,
    dirtyCount: Math.max(0, lines.length - 1),
    hasUpstream,
    dirtyFiles,
  };
}

/**
 * 解析 `git log` 输出为提交条目数组。
 * 支持两种形态：
 * 1. 结构化带详情：%x1e 为 commit 间分隔符，%x1f 为字段间分隔符（含 fullSha/email/date/body/stat）；
 * 2. 简易管道符：%h|%an|%ar|%s 行格式（兼容旧单测输入）。
 * 空输出返回 []。
 */
export function parseGitLogLines(output: string): GitCommitEntry[] {
  const out = (output || '').trim();
  if (!out) return [];
  if (out.includes('\x1e') || out.includes('\x1f')) {
    const records = out.split('\x1e').filter((c) => c.trim().length > 0);
    return records.map((chunk) => {
      const parts = chunk.split('\x1f');
      return {
        sha: (parts[0] || '').trim(),
        fullSha: (parts[1] || '').trim() || undefined,
        author: (parts[2] || '').trim(),
        email: (parts[3] || '').trim() || undefined,
        date: (parts[4] || '').trim() || undefined,
        relative: (parts[5] || '').trim(),
        subject: (parts[6] || '').trim(),
        body: (parts[7] || '').trim() || undefined,
        stat: (parts[8] || '').trim() || undefined,
      };
    });
  }
  return out.split('\n').filter(Boolean).map((line) => {
    const parts = line.split('|');
    return {
      sha: parts[0] || '',
      author: parts[1] || '',
      relative: parts[2] || '',
      subject: parts.slice(3).join('|'),
    };
  });
}

/**
 * 按码点安全截取字符串，等价于 String.prototype.slice 但对孤立的代理对（surrogate pair）做占位替换。
 * 为什么必须这样截：本文件末尾会按 UTF-8 字节数截断，而 node:child_process 把 stdout 按字节缓冲区
 * 切分后再 toString('utf8')，一个汉字被从中间切开时会变成 U+FFFD 替换字符。直接用 slice 会把半截
 * 代理对留在结果里，导致下游 JSON.stringify 产出孤立转义序列、写入文件时编码报错。
 */
function safeSlice(input: string, start: number, end?: number): string {
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
function cutByUtf8Bytes(input: string, headBytes: number, tailBytes: number): { head: string; tail: string; keptHeadBytes: number; keptTailBytes: number; truncated: boolean } {
  const encoder = new TextEncoder();
  const totalBytes = encoder.encode(input).length;
  if (totalBytes <= headBytes + tailBytes) {
    return { head: input, tail: '', keptHeadBytes: totalBytes, keptTailBytes: 0, truncated: false };
  }

  const chars = Array.from(input);
  const atByte = (limit: number, fromEnd: boolean): { count: number; bytes: number } => {
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
      } else {
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
export function truncateOutput(input: string, maxChars: number, maxBytes: number): { text: string; truncated: boolean } {
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
  public ghPath: string;
  public defaultTimeoutMs: number;
  public maxOutputChars: number;
  /** UTF-8 字节口径的硬上限；未配置时按 maxOutputChars × 4 推导（覆盖 CJK 3 字节与 emoji 4 字节） */
  public maxOutputBytes: number;
  /**
   * 列表类查询的默认条数上限。
   * 为什么挂在 executor 而不是给每个工具工厂加 config 参数：executor 是全部
   * 工具共享的依赖注入点，配置语义本就属于「执行层默认值」；工厂签名零改动，
   * 且热更新路径 updateConfig 能同步刷新。工具内以 `?? 20` 兜底保证旧配置兼容。
   */
  public defaultListLimit: number;
  /**
   * 是否注入 AI_AGENT='dsh'（gh 官方 agent 识别信号，默认 true）。
   * 挂在 executor 而非工具参数：注入点是「每次 gh 子进程拉起」这一全局咽喉，
   * 与 GH_NO_UPDATE_NOTIFIER/NO_COLOR 同级，语义上属于执行层默认值。
   */
  public agentEnvInjection: boolean;
  /**
   * 代理管理器引用（可选依赖）。
   * 注入后每次 gh 子进程拉起都会合并代理环境变量——这是「工具调用 + Web 页面数据
   * 全部走代理」的唯一咽喉（两条链路共用本 executor）。未注入时零干预，
   * gh 自然继承宿主系统环境变量（系统级代理或直连），即「默认走系统设置」语义。
   */
  private proxyManager?: ProxyManager;
  /** 认证状态缓存。`gh auth status` 实测 5.4 秒，而它位于全局驾驶舱关键路径的最前面 */
  private authCache: { at: number; value: AuthStatus } | null = null;
  /**
   * gh 版本号缓存。只缓存成功解析值（authCache 哲学：不确定结果不缓存）——
   * 探测失败/未安装时不落缓存，用户装好 gh 后下一次探测立即生效。
   */
  private ghVersionCache: { at: number; value: string } | null = null;

  constructor(config: PluginConfig = {}) {
    this.ghPath = config.ghPath || 'gh';
    this.defaultTimeoutMs = config.defaultTimeoutMs || 30_000;
    this.maxOutputChars = config.maxOutputChars || 24_000;
    this.maxOutputBytes = config.maxOutputBytes || this.maxOutputChars * 4;
    this.defaultListLimit = config.defaultListLimit || 20;
    this.agentEnvInjection = config.agentEnvInjection !== false;
  }

  updateConfig(config: PluginConfig = {}) {
    if (config.ghPath) this.ghPath = config.ghPath;
    if (config.defaultTimeoutMs) this.defaultTimeoutMs = config.defaultTimeoutMs;
    if (config.defaultListLimit) this.defaultListLimit = config.defaultListLimit;
    if (config.agentEnvInjection !== undefined) this.agentEnvInjection = config.agentEnvInjection;
    if (config.maxOutputChars) {
      this.maxOutputChars = config.maxOutputChars;
      if (!config.maxOutputBytes) this.maxOutputBytes = config.maxOutputChars * 4;
    }
    if (config.maxOutputBytes) this.maxOutputBytes = config.maxOutputBytes;
  }

  /** 注入代理管理器（main.ts 装配时调用一次；测试可注入 mock） */
  attachProxyManager(manager: ProxyManager): void {
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
  resolveWorkspaceCwd(explicitCwd?: string, explicitSessionId?: string): string {
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
    if (recent) return recent;

    return explicitCwd || process.cwd();
  }

  /**
   * 安全执行 gh 命令
   * 采用 execFile 参数数组隔离，彻底杜绝 Shell 字符串拼接注入漏洞
   */
  async run<T = unknown>(args: string[], options: GhExecutionOptions = {}): Promise<GhResult<T>> {
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
          NO_COLOR: '1',              // 禁用 ANSI 颜色转义字符
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
      let stdout: string | Buffer;
      let stderr: string | Buffer;
      if (options.stdin !== undefined) {
        const r = await spawnWithStdin(this.ghPath, args, { ...commonOpts, timeout, stdin: options.stdin });
        stdout = r.stdout;
        stderr = r.stderr;
      } else {
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
          return { ok: false, error: errMsg || '二进制输出为空' };
        }
        return { ok: true, data: buf as unknown as T, binaryBytes: buf.length, truncated: false };
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
          const parsed = JSON.parse(rawOutput) as T;
          return { ok: true, data: parsed, rawOutput, truncated: false };
        } catch {
          // 部分特殊命令可能输出空数组或文本，降级为 rawOutput
          return { ok: true, rawOutput, truncated };
        }
      }

      return { ok: true, rawOutput, truncated };
    } catch (err: any) {
      let friendlyError = err.message || '执行失败';

      if (err.code === 'ENOENT') {
        friendlyError = '系统未检测到 GitHub CLI (gh)。请先在系统终端安装: Windows 运行 `winget install GitHub.cli`，macOS 运行 `brew install gh`。';
      } else if (err.killed && err.signal === 'SIGTERM') {
        friendlyError = `GitHub CLI 命令执行超时 (${timeout}ms)。请检查网络连通性。`;
      } else if (err.stderr) {
        const stderrText = String(err.stderr).trim();
        if (stderrText.includes('gh auth login') || stderrText.includes('authentication required')) {
          friendlyError = 'GitHub 尚未登录。请在系统终端执行 `gh auth login`，或在聊天框输入 `/gh status` 查看诊断。';
        } else {
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
  async checkAuth(cwd?: string, bypassCache = false): Promise<AuthStatus> {
    const now = Date.now();
    if (!bypassCache && this.authCache && now - this.authCache.at < AUTH_CACHE_TTL_MS) {
      return this.authCache.value;
    }
    const value = await this.probeAuth(cwd);
    // 成功登录且无网络故障时落缓存
    if (value.loggedIn && !value.networkError) {
      this.authCache = { at: now, value };
    } else if (value.networkError && this.authCache && this.authCache.value.loggedIn) {
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
  async getGhVersion(): Promise<string | null> {
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
  protected async probeGhVersionRaw(): Promise<string> {
    try {
      const { stdout } = await execFileAsync(this.ghPath, ['--version'], {
        timeout: 3_000,
        windowsHide: true,
      });
      return String(stdout);
    } catch {
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
  async runGuarded<T = unknown>(
    args: string[],
    options: GhExecutionOptions & {
      /** 该能力要求的最低 gh 版本，如 '2.95.0'；缺省时等价于直接 run（渐进采用） */
      minVersion?: string;
      /** 人类可读能力名，用于错误信息，如 'gh repo read-file' */
      capability?: string;
      /** 版本不足时的降级链路（如 github_api contents 端点封装）；无则报错带升级指引 */
      fallback?: () => Promise<GhResult<T>>;
    } = {}
  ): Promise<GhResult<T> & { degraded?: boolean; degradedReason?: string }> {
    const { minVersion, capability, fallback, ...runOptions } = options;
    if (!minVersion) {
      return this.run<T>(args, runOptions);
    }
    const current = await this.getGhVersion();
    // 探测失败 fail-open：直接执行主命令（见方法注释），错误路径交由主命令的既有处理
    if (current === null || compareGhVersions(current, minVersion) >= 0) {
      return this.run<T>(args, runOptions);
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
  private getGhUpgradeHint(): string {
    const p = process.platform;
    if (p === 'win32') return '升级命令：`winget upgrade GitHub.cli`（或从 https://cli.github.com/ 下载最新 .msi）。';
    if (p === 'darwin') return '升级命令：`brew upgrade gh`（或从 https://cli.github.com/ 下载最新安装包）。';
    return '升级方式：更新系统包（Debian/Ubuntu: `sudo apt update && sudo apt install gh`；Fedora: `sudo dnf upgrade gh`），或见 https://cli.github.com/。';
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
  async getLocalGitStatus(cwd?: string): Promise<GitLocalStatus | null> {
    try {
      // 纯本地毫秒级；3s 超时兜底异常文件系统
      const { stdout } = await execFileAsync('git', ['status', '-sb', '--porcelain'], {
        cwd: cwd || undefined,
        timeout: 3_000,
        windowsHide: true,
      });
      return parseGitStatusOutput(String(stdout));
    } catch {
      // 非 Git 目录 / git 未安装 / 超时：静默降级为 null（调用方不渲染该行）
      return null;
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
  async getGitCommitLog(cwd?: string, hasUpstream = true, limit = 15): Promise<GitCommitLog | null> {
    const empty: GitCommitLog = { aheadCommits: [], behindCommits: [], recent: [] };
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
        if (!isNaN(cnt)) empty.totalCount = cnt;
      } catch {}
      if (!hasUpstream) return empty; // 无 upstream：领先/落后无从谈起，仅最近提交
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
    } catch {
      return null;
    }
  }

  /**
   * 分页获取最近提交记录（用于 Git 面板下滑触底继续加载）。
   */
  async getGitRecentLog(cwd?: string, limit = 15, skip = 0): Promise<{ commits: GitCommitEntry[]; totalCount?: number }> {
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
      let totalCount: number | undefined;
      try {
        const countRes = await execFileAsync('git', ['rev-list', '--count', 'HEAD'], {
          cwd: cwd || undefined,
          timeout: 2_000,
          windowsHide: true,
        });
        const cnt = parseInt(String(countRes.stdout).trim(), 10);
        if (!isNaN(cnt)) totalCount = cnt;
      } catch {}
      return { commits, totalCount };
    } catch {
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
  async getGitCommitDetail(cwd: string | undefined, sha: string): Promise<string | null> {
    if (!/^[0-9a-f]{4,40}$/i.test(sha)) return null; // 形态校验：纯十六进制短/全 sha
    try {
      const { stdout } = await execFileAsync('git', ['show', '--stat', '--pretty=format:%H%n%an <%ae>%n%ad%n%s%n%b', sha], {
        cwd: cwd || undefined,
        timeout: 3_000,
        windowsHide: true,
      });
      return String(stdout);
    } catch {
      return null;
    }
  }

  /** 生成当前操作系统平台的推荐安装引导与命令 */
  private getPlatformInstallGuide() {
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

  /**
   * 纯本地检测宿主机 GitHub CLI 配置文件中是否存在已配置的账号凭据。
   * 零子进程、零网络往返，毫秒级读取，专供断网与网络卡顿时的 Fail-Safe 容灾降级。
   */
  checkLocalGhCredential(): { user?: string; hasToken: boolean } | null {
    try {
      const candidates: string[] = [];
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
    } catch {}
    return null;
  }

  /**
   * 实际执行认证探测并解析结果，不含外部缓存逻辑。
   * 解耦本地安装态、本地凭据态与网络可达态：
   * 1. 安装态通过 getGhVersion 本地轻量确认，网络超时/断网绝不篡改 installed 结论；
   * 2. 本地凭据通过 checkLocalGhCredential 读取，断网时仍可识别人类账号；
   * 3. 精准分流网络超时/异常（networkError）与真正的未认证（explicitLoggedOut）。
   */
  private async probeAuth(cwd?: string): Promise<AuthStatus> {
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
    const isExplicitlyLoggedOut = !isNetworkError && (
      /not\s+logged\s+in/i.test(raw) ||
      raw.includes('gh auth login') ||
      raw.includes('authentication required') ||
      raw.includes('No accounts found')
    );

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
    let user: string | undefined = localCred?.user;
    if (accountMatch) {
      user = accountMatch[1];
    }

    // 解析 Token scopes
    let scopes: string[] | undefined;
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
  getRepoIdentityFromLocal(cwd?: string): RepoMetadata | null {
    const targetCwd = cwd || this.resolveWorkspaceCwd();
    try {
      const gitConfigPath = path.join(targetCwd, '.git', 'config');
      if (!fs.existsSync(gitConfigPath)) return null;

      const configText = fs.readFileSync(gitConfigPath, 'utf8');
      const match = configText.match(/github\.com[:/]([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?(?:\s|\r|\n|$)/i);
      if (!match) return null;

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
    } catch {
      return null;
    }
  }

  /**
   * 获取当前目录（工作区）关联的远程仓库元数据
   * 采用 gh repo view + 本地 git remote 双保险机制，彻底杜绝已配置远程却误判未关联的问题
   */
  async getRepoMetadata(cwd?: string, sessionId?: string): Promise<RepoMetadata | null> {
    const targetCwd = this.resolveWorkspaceCwd(cwd, sessionId);

    // 绝对前置门禁：当前目录若自身不存在 .git 目录，铁证如山判定为未关联本地 Git 仓库
    // 直接返回 null，杜绝一切在非 Git 目录误报关联的可能！
    if (!hasGitDir(targetCwd)) {
      return null;
    }

    // 1. 优先尝试由 gh 直接根据当前上下文识别
    const res = await this.run<any>(
      ['repo', 'view', '--json', 'nameWithOwner,name,owner,defaultBranchRef,description,isPrivate,url'],
      { cwd: targetCwd, timeoutMs: 10_000 }
    );

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
          const directRes = await this.run<any>(
            ['repo', 'view', nameWithOwner, '--json', 'nameWithOwner,name,owner,defaultBranchRef,description,isPrivate,url'],
            { cwd: targetCwd, timeoutMs: 10_000 }
          );

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
    } catch {}

    return null;
  }
}
