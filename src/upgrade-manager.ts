import { spawn, execFile } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { PLUGIN_PACKAGE_NAME } from './version.js';
import type { UpgradeExecutionResult, UpgradeStatusResult } from './types.js';
import type { ProxyManager } from './proxy.js';

/**
 * 构建跨平台环境自愈增强的 ProcessEnv (重点解决 macOS GUI 应用丢失 PATH 的痛点)
 *
 * 为什么必须这样做：
 * 1. 在 macOS 系统上，若 DSH 桌面客户端由 Finder / Dock / Spotlight (GUI) 启动，进程默认只继承
 *    极简系统 PATH (/usr/bin:/bin:/usr/sbin:/sbin)，不会自动读取用户 shell 配置文件 (~/.zshrc, ~/.bash_profile)；
 * 2. 用户通过 Homebrew (/opt/homebrew/bin 或 /usr/local/bin) 或 nvm 安装的 node、npm、pnpm 默认在 GUI 下不可见；
 * 3. 动态将当前 node 运行时所在目录 (path.dirname(process.execPath)) 及 Mac 常用包管理器路径注入 PATH 首端，
 *    彻底实现 macOS 与 Linux 环境下子进程对 npm / pnpm 命令的 100% 自愈发现。
 */
export function buildCrossPlatformEnv(registryOverride?: string): NodeJS.ProcessEnv {
  const currentPath = process.env.PATH || '';
  const extraPaths: string[] = [];
  const isMac = process.platform === 'darwin';
  const isWin = process.platform === 'win32';

  // 1. 当前正在运行的 node 自身二进制文件所在目录（最优先，必然有配套 npm）
  if (process.execPath) {
    try {
      extraPaths.push(path.dirname(process.execPath));
    } catch {}
  }

  // 1.5 DSH CLI 所在目录自愈（P2 修复）：一键升级实际要执行 `dsh plugin ...`，
  // 但桌面版由 GUI 启动时不继承终端 PATH，子进程常找不到 dsh（实测本机 dsh 在
  // D:\dsh-zm\resources\runtime\cli\bin，node 在 D:\CodeApps\nodejs——两者分离，
  // 且安装根与 ~/.dsh 无任何路径关系）。
  // 探测链（从准确到模糊）：
  //   a. DSH_CLI_BIN 显式环境变量（用户/宿主可预设）；
  //   b. process.argv[0] 宿主二进制推导——桌面版 argv[0] 即
  //      <安装根>/DeepSeek Harness.exe（或 node 跑 CLI 时的可执行），
  //      其 dirname 拼上 resources/runtime/cli/bin 是桌面版固定布局；
  //   c. 从 DSH_PROFILE_DIR 逐级上溯（覆盖 ~/.dsh 布局的安装形态）；
  //   d. ~/.dsh/runtime/cli/bin 常见兜底。
  const dshBinCandidates: string[] = [];
  if (process.env.DSH_CLI_BIN) dshBinCandidates.push(process.env.DSH_CLI_BIN);
  try {
    if (process.argv[0]) {
      const hostDir = path.dirname(path.resolve(process.argv[0]));
      dshBinCandidates.push(path.join(hostDir, 'resources', 'runtime', 'cli', 'bin'));
    }
  } catch {}
  try {
    const profileDir = (process.env.DSH_PROFILE_DIR || '').trim();
    if (profileDir) {
      // profiles/<name> -> 上溯到 ~/.dsh，再拼 runtime/cli/bin
      let cur = path.resolve(profileDir);
      for (let i = 0; i < 3; i++) {
        dshBinCandidates.push(path.join(cur, 'runtime', 'cli', 'bin'));
        cur = path.dirname(cur);
      }
    }
    const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
    dshBinCandidates.push(path.join(dshHome, 'runtime', 'cli', 'bin'));
  } catch {}
  for (const cand of dshBinCandidates) {
    try {
      if (fs.existsSync(cand)) { extraPaths.push(cand); break; }
    } catch {}
  }

  // 2. macOS 专有软件与包管理器安装路径
  if (isMac) {
    extraPaths.push('/opt/homebrew/bin');      // Apple Silicon Homebrew
    extraPaths.push('/opt/homebrew/sbin');
    extraPaths.push('/usr/local/bin');         // Intel Mac Homebrew
    extraPaths.push('/usr/local/sbin');
    extraPaths.push(path.join(os.homedir(), '.local/bin'));
    extraPaths.push(path.join(os.homedir(), 'Library/pnpm'));
    extraPaths.push(path.join(os.homedir(), '.nvm/current/bin'));
  }

  // 3. Linux 专有常见路径
  if (process.platform === 'linux') {
    extraPaths.push('/usr/local/bin');
    extraPaths.push('/home/linuxbrew/.linuxbrew/bin');
    extraPaths.push(path.join(os.homedir(), '.local/bin'));
  }

  const separator = isWin ? ';' : ':';
  const uniquePaths = Array.from(new Set([...extraPaths, ...currentPath.split(separator)])).filter(Boolean);

  return {
    ...process.env,
    PATH: uniquePaths.join(separator),
    NPM_CONFIG_REGISTRY: registryOverride ?? 'https://registry.npmjs.org',
    LANG: 'zh_CN.UTF-8',
    LC_ALL: 'zh_CN.UTF-8',
  };
}

/**
 * 探测 dsh CLI 是否对当前进程可达（PATH 或已知安装位置）。
 * 为什么必须预检：桌面端 GUI 启动时 dsh 常不在 PATH，旧实现用 '||' 兜底到
 * `npm install -g`——装到全局对 profile 依赖毫无作用，表现为「一键升级无效果」
 * 的静默失败。预检不可达时直接给出带完整命令的明确指引，宁可见失败不可假成功。
 */
export async function probeDshCliAvailable(env: NodeJS.ProcessEnv): Promise<{ ok: boolean; hint?: string }> {
  const isWin = process.platform === 'win32';
  const probeCmd = isWin ? 'where' : 'which';
  return new Promise((resolve) => {
    try {
      execFile(probeCmd, ['dsh'], { env, timeout: 5_000 }, (err, stdout) => {
        if (!err && String(stdout).trim()) {
          resolve({ ok: true });
        } else {
          resolve({ ok: false, hint: `未在 PATH 中发现 dsh CLI（${probeCmd} dsh 无输出）` });
        }
      });
    } catch (e: any) {
      resolve({ ok: false, hint: `dsh CLI 探测失败: ${e?.message || e}` });
    }
  });
}

/**
 * 定位桌面版自带的 pnpm 分发包（pnpm.mjs）。
 * 官方事实（apps/desktop/README）：Desktop 在 resources/runtime/primary-runtime/
 * dependencies/pnpm 携带完整 pnpm 分发，「包操作不要求 PATH 上存在 pnpm」。
 * dsh CLI 的 plugin 子命令本质就是「进 profile 目录转发 pnpm」——CLI 不可达时
 * 我们可以自己定位 profile 目录直调这份 pnpm，完全绕开 dsh CLI 依赖。
 * 候选链：a. DSH_BUNDLED_PNPM 显式覆盖；b. argv[0] 宿主二进制推导（桌面版固定布局）。
 */
export function locateBundledPnpm(): string | null {
  const candidates: string[] = [];
  if (process.env.DSH_BUNDLED_PNPM) candidates.push(process.env.DSH_BUNDLED_PNPM);
  try {
    if (process.argv[0]) {
      const hostDir = path.dirname(path.resolve(process.argv[0]));
      candidates.push(path.join(hostDir, 'resources', 'runtime', 'primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.mjs'));
    }
  } catch {}
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {}
  }
  return null;
}

/**
 * 读取 profile 中已实际安装的本插件版本（实证校验的事实源）。
 * 读不到（目录不存在/无产物/JSON 损坏）返回 null——调用方据此决定是否放行：
 * 无法证伪时不在成功文案里虚报版本号，但不阻断（避免文件系统受限环境下误杀真成功）。
 */
export function readInstalledVersion(profileDir?: string): string | null {
  try {
    const dir = profileDir || defaultProfileDir();
    const pkgPath = path.join(dir, 'node_modules', PLUGIN_PACKAGE_NAME, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : null;
  } catch {
    return null;
  }
}

function defaultProfileDir(): string {
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  return process.env.DSH_PROFILE_DIR || path.join(dshHome, 'profiles', process.env.DSH_PROFILE || 'default');
}

/**
 * 把插件包名补写进 profile 的 dsh.profile.bundles（幂等）。
 * 为什么需要：pnpm add 只改 dependencies；dsh plugin add 还会追加 bundles 列表
 * （官方语义：无 dsh.bundle 声明的包只作普通依赖不激活）。直调 pnpm 的降级路径
 * 必须补齐这一步，插件才会真正进入 profile 组合。
 * 安全性（本机实测）：pnpm add 对 dsh.profile 自定义字段完整保真，因此补写放在
 * pnpm 成功后执行，读写同一份 package.json 不会互相破坏；写入用「读-改-写全量
 * JSON」保持 2 空格缩进 + 尾换行与 dsh CLI 产物一致。
 */
export function ensureBundleListed(profileDir: string, pkgName: string): { ok: boolean; error?: string } {
  try {
    const pkgPath = path.join(profileDir, 'package.json');
    if (!fs.existsSync(pkgPath)) return { ok: false, error: `profile package.json 不存在: ${pkgPath}` };
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(raw);
    if (!pkg.dsh) pkg.dsh = {};
    if (!pkg.dsh.profile) pkg.dsh.profile = {};
    if (!Array.isArray(pkg.dsh.profile.bundles)) pkg.dsh.profile.bundles = [];
    if (pkg.dsh.profile.bundles.includes(pkgName)) return { ok: true }; // 幂等：已在列表
    pkg.dsh.profile.bundles.push(pkgName);
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: `bundles 补写失败: ${e?.message || e}` };
  }
}

/**
 * 自动升级执行引擎
 *
 * 核心设计考量与约束条件：
 * 1. 互斥保护 (Mutex)：同一时刻仅允许一个升级任务执行，防止用户连击或并发请求击垮包管理器 lockfile；
 * 2. 环境自省 (Dev-Link Safe)：检测是否在本地源码工作区调试，若是则阻断自动覆盖，保护源码不被破坏；
 * 3. 跨平台兼容 (macOS / Windows / Linux)：自动适配 cmd.exe 与 sh/zsh，自愈补全 macOS PATH 变量；
 * 4. 稳态超时：设置 60s 进程上限，杜绝子进程因网络悬挂死锁宿主 WebServer；
 * 5. 重启指引：Node.js 运行时内存不可变，升级成功后明确要求重启 DSH 彻底加载最新后端能力。
 */
export class UpgradeManager {
  private isUpgrading = false;
  private lastResult: UpgradeStatusResult = {
    state: 'idle',
  };
  private logBuffer: string[] = [];
  /** 代理管理器（可选）：注入后一键升级的 npm/pnpm 子进程走用户代理 */
  private proxyManager?: ProxyManager;
  /** 更新源模式查询（可选）：一键升级的 NPM_CONFIG_REGISTRY 跟随用户在设置页选择的源 */
  private getUpdateMode: (() => 'official' | 'mirror' | 'off' | null) | null = null;

  attachProxyManager(manager: ProxyManager): void {
    this.proxyManager = manager;
  }

  /** 注入更新源查询函数（而非静态值）：用户切换源后无需重新装配即实时生效 */
  attachUpdateModeQuery(query: () => 'official' | 'mirror' | 'off' | null): void {
    this.getUpdateMode = query;
  }

  /**
   * 按当前更新源推导 NPM_CONFIG_REGISTRY。
   * 为什么跟随源而非写死：用户选官方源的理由（镜像同步滞后）对安装同样成立——
   * 选镜像源装的可能是旧版。off 模式下一键升级仍可用（关提示不关能力），
   * 其 registry 落官方源（能力路径取最权威的源）。
   */
  private resolveRegistry(): string {
    const mode = this.getUpdateMode ? this.getUpdateMode() : null;
    if (mode === 'mirror') return 'https://registry.npmmirror.com';
    return 'https://registry.npmjs.org';
  }

  /**
   * 探测当前插件是否是以本地 Git 源码软链接方式运行
   */
  isDevLinked(): boolean {
    try {
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      const isInsideNodeModules = currentDir.includes('node_modules');
      // 检查上级或同级是否存在 .git 目录
      const gitDirParent = path.resolve(currentDir, '../.git');
      const gitDirRoot = path.resolve(currentDir, '../../.git');
      const hasGit = fs.existsSync(gitDirParent) || fs.existsSync(gitDirRoot);
      return !isInsideNodeModules && hasGit;
    } catch {
      return false;
    }
  }

  /**
   * 智能识别当前 DSH 运行环境 (桌面版 vs Web/CLI 版)
   *
   * 依据事实源：
   * 1. 桌面版启动时会固定注入 DSH_PROFILE=desktop 与 DSH_PROFILE_DIR (~/.dsh/profiles/desktop)；
   * 2. Web版/CLI版通常 DSH_PROFILE 为 default 或自定义工作区 profile；
   * 3. 跨平台支持：通过 os.homedir() 安全解析 ~/.dsh 目录。
   */
  detectEnvironment(): {
    isDesktop: boolean;
    profile: string;
    profileDir?: string;
    isDevLinked: boolean;
    platform: NodeJS.Platform;
  } {
    const profile = (process.env.DSH_PROFILE || '').trim();
    const profileDir = (process.env.DSH_PROFILE_DIR || '').trim();
    const isDesktop = profile === 'desktop' || profileDir.toLowerCase().includes('desktop');
    const isDevLinked = this.isDevLinked();
    const platform = process.platform;

    return {
      isDesktop,
      profile: profile || 'default',
      profileDir: profileDir || undefined,
      isDevLinked,
      platform,
    };
  }

  /**
   * 获取当前升级状态
   */
  getStatus(): UpgradeStatusResult {
    const env = this.detectEnvironment();
    return {
      ...this.lastResult,
      environment: env.isDesktop ? 'desktop' : 'web',
      log: this.logBuffer.join('\n'),
    };
  }

  /**
   * 级别 2 降级路径：直调桌面版自带 pnpm 安装包（execFile 数组参数隔离，无 shell）。
   * 输出与退出码经回调上抛，由调用方决定 bundles 补写与状态机收尾。
   */
  private runPnpmDirect(
    pnpmMjs: string,
    profileDir: string,
    pkgWithVer: string,
    env: NodeJS.ProcessEnv,
    done: (result: { ok: boolean; log: string }) => void
  ): void {
    const chunks: string[] = [];
    try {
      const child = spawn(process.execPath, [pnpmMjs, 'add', pkgWithVer], {
        cwd: profileDir,
        env,
        windowsHide: true,
      });
      const collect = (b: Buffer) => {
        const t = b.toString();
        chunks.push(t);
        this.logBuffer.push(t);
        if (this.logBuffer.length > 200) this.logBuffer.shift();
      };
      child.stdout?.on('data', collect);
      child.stderr?.on('data', collect);
      const timer = setTimeout(() => child.kill(), 120_000);
      child.on('close', (code) => {
        clearTimeout(timer);
        done({ ok: code === 0, log: chunks.join('') });
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        done({ ok: false, log: [...chunks, String(err?.message || err)].join('') });
      });
    } catch (e: any) {
      done({ ok: false, log: `spawn pnpm 失败: ${e?.message || e}` });
    }
  }

  /**
   * 升级结果统一收尾（状态机 + 互斥锁复位）。级别 1/级别 2 共用，
   * 保证 lastResult、isUpgrading、返回文案的形态完全一致。
   *
   * 关键防线一：退出码 0 ≠ 安装成功。本函数在退出码为 0 时再做一次实证校验——
   * 读 profile 的 node_modules/<pkg>/package.json 实际版本，与目标版本比对。
   * 不匹配（网络劫持返回空产物、registry 异常静默跳过安装、包管理器缓存错乱
   * 等场景）一律判失败并如实报「实际安装版本」，绝不把没装上说成装好了。
   *
   * 关键防线二：失败文案不内嵌完整命令。前端升级卡片常驻「📋 复制命令」按钮
   * （复制的命令已按当前 profile 生成），文字里贴长命令既让用户手动描选困难、
   * 也无法区分 Web/桌面环境谁敲得了终端。文案只引导按钮 + 按环境给可行出路：
   * 桌面版未注册 CLI 的用户走官方「管理 dsh 命令」菜单，其余走复制命令。
   */
  private finishUpgrade(
    result: { ok: boolean; log?: string },
    targetVersion: string | undefined,
    env: ReturnType<UpgradeManager['detectEnvironment']>,
    startedAt: number,
    profileDir?: string
  ): void {
    const completedAt = Date.now();
    const wantVersion = targetVersion || 'latest';
    const pkgWithVer = targetVersion ? `${PLUGIN_PACKAGE_NAME}@${targetVersion}` : `${PLUGIN_PACKAGE_NAME}@latest`;
    // 出路文案按环境分流：桌面版保留官方菜单通道（未注册 CLI 的用户唯一可行路径）
    const actionHint = env.isDesktop
      ? '点击「📋 复制命令」后在系统终端运行；若终端无 dsh 命令，请先在 DSH 桌面端菜单 → 管理 dsh 命令… → 安装'
      : '点击「📋 复制命令」后在部署 DSH 的机器终端运行';

    if (result.ok) {
      // 实证校验：产物版本才是唯一可信事实源
      const installed = readInstalledVersion(profileDir);
      if (installed && targetVersion && installed !== targetVersion) {
        this.lastResult = {
          state: 'failed',
          targetVersion,
          message: `升级失败：命令正常结束，但 profile 中实际安装的版本是 ${installed}（目标 ${targetVersion}），未完成目标版本安装。${actionHint}，或稍后重试一键升级。`,
          completedAt,
          environment: env.isDesktop ? 'desktop' : 'web',
        };
        this.isUpgrading = false;
        return;
      }
      const verSuffix = installed ? `（实证校验通过：${installed}）` : '';
      const successMsg = env.isDesktop
        ? `升级成功！已安装 ${pkgWithVer} 到桌面版 Profile${verSuffix}。需重启 DSH 桌面客户端彻底生效后端工具，或刷新当前界面。`
        : `升级成功！已安装 ${pkgWithVer}${verSuffix}。需重启 DSH 服务彻底生效后端工具，或刷新网页先体验新版界面。`;
      this.lastResult = { state: 'success', targetVersion: wantVersion as string, message: successMsg, completedAt, environment: env.isDesktop ? 'desktop' : 'web' };
    } else {
      this.lastResult = {
        state: 'failed',
        targetVersion,
        message: `升级失败（安装命令返回非零退出码）。${targetVersion ? `目标版本 ${targetVersion} 未安装成功。` : ''}${actionHint}，或稍后重试一键升级。`,
        completedAt,
        environment: env.isDesktop ? 'desktop' : 'web',
      };
    }
    this.isUpgrading = false;
  }

  /**
   * 执行一键升级核心流程
   */
  async executeUpgrade(targetVersion?: string): Promise<UpgradeExecutionResult> {
    const env = this.detectEnvironment();

    if (this.isUpgrading) {
      return {
        ok: false,
        message: '升级任务已在进行中，请勿重复点击。',
        needRestart: false,
        environment: env.isDesktop ? 'desktop' : 'web',
        log: this.logBuffer.join('\n'),
      };
    }

    if (env.isDevLinked) {
      const devMsg = '检测到当前插件正在以本地 Git 源码软链接模式 (link:) 运行，请在源码目录执行 git pull 更新，已自动阻止 npm 覆盖以保护工作区代码。';
      this.lastResult = {
        state: 'failed',
        targetVersion,
        message: devMsg,
        completedAt: Date.now(),
        environment: env.isDesktop ? 'desktop' : 'web',
      };
      return {
        ok: false,
        message: devMsg,
        needRestart: false,
        environment: env.isDesktop ? 'desktop' : 'web',
        log: 'Operation blocked by dev-linked protection.',
      };
    }

    this.isUpgrading = true;
    this.logBuffer = [];
    const startedAt = Date.now();
    const pkgWithVer = targetVersion ? `${PLUGIN_PACKAGE_NAME}@${targetVersion}` : `${PLUGIN_PACKAGE_NAME}@latest`;

    this.lastResult = {
      state: 'upgrading',
      targetVersion,
      message: `正在执行命令拉取 ${pkgWithVer}...`,
      startedAt,
      environment: env.isDesktop ? 'desktop' : 'web',
    };

    // 两级执行策略（官方事实：桌面版的 dsh CLI 注册是可选操作，大量桌面用户
    // 未注册命令；而 Desktop 自带完整 pnpm 分发包，「包操作不要求 PATH 上存在
    // pnpm」，dsh plugin 本质是「进 profile 目录转发 pnpm + 补写 bundles 列表」）：
    //   级别 1：dsh CLI 可达（Web 版终端起 / 桌面版已注册命令）→ 走 CLI，行为
    //           与官方完全一致（含 bundles 维护）；
    //   级别 2：CLI 不可达但能定位自带 pnpm 与 profile 目录 → 直调 pnpm add +
    //           自行补写 bundles，完全绕开 CLI 依赖；
    //   兜底：两者皆不可用 → 给官方「管理 dsh 命令」菜单指引（安装后重试即可）。
    // 注意：任何提前失败分支必须复位 isUpgrading（safeSettle 不经过这些路径）。
    // registry 按用户「更新设置」选择的源解析（每次升级执行时实时取，切源后无需重新装配）。
    const probeEnv = { ...buildCrossPlatformEnv(this.resolveRegistry()), ...(this.proxyManager?.getEnv('package-manager') || {}) };
    const dshProbe = await probeDshCliAvailable(probeEnv);

    let usePnpmFallback = false;
    if (!dshProbe.ok) {
      const bundledPnpm = locateBundledPnpm();
      const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
      const profileDir = env.profileDir || path.join(dshHome, 'profiles', env.profile || 'default');
      if (bundledPnpm && fs.existsSync(profileDir)) {
        usePnpmFallback = true;
        this.logBuffer.push(`[fallback] dsh CLI 不可达，降级为直调自带 pnpm: ${bundledPnpm}`);
      } else {
        this.isUpgrading = false;
        // 官方指引（apps/desktop/README「终端命令」）：桌面版菜单提供「管理 dsh
        // 命令…」的安装/修复入口，注册后即可在终端使用 dsh。指引一次安装永久解决。
        // 官方指引（apps/desktop/README「终端命令」）：桌面版菜单提供「管理 dsh
        // 命令…」的安装/修复入口，注册后即可在终端使用 dsh。一次安装永久解决。
        // 文案不内嵌命令（引导复制按钮），且此场景多为桌面版——Web 版通常自带 CLI。
        const menuPath = 'DSH 桌面端菜单 → 管理 dsh 命令… → 安装';
        const failMsg = `未能自动定位可用的安装通道（${dshProbe.hint || 'dsh CLI 不可用'}，且未找到桌面版自带的 pnpm）。请通过官方入口注册命令：${menuPath}（注册后重试一键升级即可）；或点击「📋 复制命令」获取手动升级命令。`;
        this.lastResult = {
          state: 'failed',
          targetVersion,
          message: failMsg,
          completedAt: Date.now(),
          environment: env.isDesktop ? 'desktop' : 'web',
        };
        return {
          ok: false,
          message: failMsg,
          needRestart: false,
          environment: env.isDesktop ? 'desktop' : 'web',
          log: `Both dsh CLI and bundled pnpm unavailable. Official menu: ${menuPath}`,
        };
      }
    }

    return new Promise((resolve) => {
      const isWin = process.platform === 'win32';
      let command = '';
      let executionCwd = process.cwd();

      if (usePnpmFallback) {
        // 级别 2：直调桌面版自带 pnpm（execFile 数组参数，不经 shell，无注入面）。
        // 升级成功后由 close 回调补写 bundles 列表（见下方 code === 0 分支）。
        const bundledPnpm = locateBundledPnpm()!;
        const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
        executionCwd = env.profileDir || path.join(dshHome, 'profiles', env.profile || 'default');
        this.runPnpmDirect(bundledPnpm, executionCwd, pkgWithVer, probeEnv, (result) => {
          if (result.ok) {
            const listed = ensureBundleListed(executionCwd, PLUGIN_PACKAGE_NAME);
            if (!listed.ok) {
              this.logBuffer.push(`[warn] ${listed.error}（依赖已安装；重启后如未生效，请在菜单「管理 dsh 命令」注册 CLI 后重试）`);
            } else {
              this.logBuffer.push(`[fallback] 已补写 bundles 列表: ${PLUGIN_PACKAGE_NAME}`);
            }
          }
          this.finishUpgrade(result, targetVersion, env, startedAt, executionCwd);
        });
        return;
      }

      // 级别 1：dsh CLI（官方语义 `dsh plugin --profile <name> add <pkg>` 在 profile
      // 目录内转发 pnpm，自动维护 dependencies 与 bundles）。失败不静默滑入
      // npm install —— 装到全局对 profile 依赖毫无作用，只制造假成功。
      if (env.isDesktop) {
        command = `dsh plugin --profile desktop add ${pkgWithVer}`;
        const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
        executionCwd = env.profileDir || path.join(dshHome, 'profiles', 'desktop');
      } else {
        // 场景 B：Web 版 / 开发者终端 CLI 版环境
        const profile = env.profile || 'default';
        command = `dsh plugin --profile ${profile} add ${pkgWithVer}`;
      }

      // 跨平台 Shell 选型与参数调度：
      // - Windows: 采用 cmd.exe (/d /s /c)，完美原生支持 '||' 且冷启动仅 ~10ms，规避 powershell 5.1 语法报错；
      // - macOS / Linux: 优先采用用户的 SHELL (/bin/zsh 或 /bin/bash)，兜底 /bin/sh，参数为 -c。
      const shell = isWin
        ? (process.env.ComSpec || 'cmd.exe')
        : (process.env.SHELL || '/bin/sh');
      const args = isWin
        ? ['/d', '/s', '/c', command]
        : ['-c', command];

      let settled = false;
      const safeSettle = (result: UpgradeExecutionResult) => {
        if (settled) return;
        settled = true;
        this.isUpgrading = false;
        resolve(result);
      };

      // 注入跨平台增强环境（尤其治愈 macOS GUI 启动丢失 PATH 的痛点）
      // 代理环境变量按 applyToPackageManager 开关合并：npm/pnpm 遵循 HTTPS_PROXY，
      // 与 gh 链路同一管理器，保证「设置代理后升级也走代理」的体验一致性。
      const childEnv = {
        ...buildCrossPlatformEnv(this.resolveRegistry()),
        ...(this.proxyManager?.getEnv('package-manager') || {}),
      };

      const child = spawn(shell, args, {
        cwd: executionCwd,
        windowsHide: true,
        env: childEnv,
      });

      const timeoutTimer = setTimeout(() => {
        child.kill();
        const timeoutMsg = '升级命令执行超时（60 秒），可能是网络阻塞或包管理器锁占用。可稍后重试一键升级，或点击「📋 复制命令」手动执行。';
        this.lastResult = {
          state: 'failed',
          targetVersion,
          message: timeoutMsg,
          completedAt: Date.now(),
          environment: env.isDesktop ? 'desktop' : 'web',
        };
        safeSettle({
          ok: false,
          message: timeoutMsg,
          needRestart: false,
          environment: env.isDesktop ? 'desktop' : 'web',
          log: this.logBuffer.join('\n'),
        });
      }, 60_000);

      child.stdout?.on('data', (chunk) => {
        const text = chunk.toString();
        this.logBuffer.push(text);
        if (this.logBuffer.length > 200) this.logBuffer.shift();
      });

      child.stderr?.on('data', (chunk) => {
        const text = chunk.toString();
        this.logBuffer.push(text);
        if (this.logBuffer.length > 200) this.logBuffer.shift();
      });

      child.on('close', (code) => {
        clearTimeout(timeoutTimer);

        // 级别 1 收尾也走实证校验（与级别 2 同一防线）：退出码 0 后读产物版本，
        // 与目标不符即判失败——杜绝 dsh 命令静默未安装却报成功的假象。
        this.finishUpgrade({ ok: code === 0 }, targetVersion, env, startedAt, executionCwd);
        const finalResult: UpgradeExecutionResult = this.lastResult.state === 'success'
          ? {
              ok: true,
              message: this.lastResult.message || '升级成功',
              needRestart: true,
              environment: env.isDesktop ? 'desktop' : 'web',
              log: this.logBuffer.join('\n'),
            }
          : {
              ok: false,
              message: this.lastResult.message || `升级退出码异常 (${code})`,
              needRestart: false,
              environment: env.isDesktop ? 'desktop' : 'web',
              log: this.logBuffer.join('\n'),
            };
        safeSettle(finalResult);
      });

      child.on('error', (err) => {
        clearTimeout(timeoutTimer);
        const errMsg = `升级失败：无法启动安装子进程（${err.message}）。可重试一键升级，或点击「📋 复制命令」手动执行。`;
        this.lastResult = {
          state: 'failed',
          targetVersion,
          message: errMsg,
          completedAt: Date.now(),
          environment: env.isDesktop ? 'desktop' : 'web',
        };
        safeSettle({
          ok: false,
          message: errMsg,
          needRestart: false,
          environment: env.isDesktop ? 'desktop' : 'web',
          log: this.logBuffer.join('\n'),
        });
      });
    });
  }
}
