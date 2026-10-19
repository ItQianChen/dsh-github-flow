/**
 * 动作类路由：缓存强制刷新 + 右侧栏快捷操作（create_pr/create_issue/open_browser/open_terminal）。
 * 共同特征：POST 触发、读少写多、无缓存语义，与概览类路由的演进方向不同。
 */
import { spawn, execFile } from 'node:child_process';
import type { GhExecutor } from '../executor.js';
import { TtlCache } from '../cache.js';
import { hasGitDir } from '../workspace.js';
import { watchGitMetadata } from '../git-watcher.js';
import type { GitHubOverviewData, GlobalOverviewData } from '../types.js';
import { isSafeExternalUrl, sendJson, type RouteDeps } from './route-helpers.js';

/**
 * 构造「在新终端窗口运行命令」的平台命令（execFile 数组形态，不经 shell）。
 *
 * Issue #2 修复要点：
 * - Windows：cmd.exe（显式 .exe，规避 GUI 父进程 PATH 解析差异）+ start 的窗口标题
 *   占位 "DSH GitHub"——start 的首个带引号参数会被解析为标题而非程序，占位后
 *   powershell.exe 才能被稳定识别为目标程序；
 * - macOS：osascript 驱动 Terminal.app，命令经引号转义拼入 AppleScript；
 * - Linux：发行版终端二进制与参数形态各异（gnome-terminal 用 `--`、konsole 用
 *   `-e`、xfce4-terminal 用 `-x`），单一硬编码在主流桌面大概率不存在——由
 *   detectLinuxTerminal 按探测结果返回对应形态。
 */
export function buildTerminalCommand(command: string): { bin: string; args: string[] } | null {
  if (process.platform === 'win32') {
    return {
      bin: 'cmd.exe',
      // -NoProfile 是 Windows 兼容基线：powershell.exe 是全量自带的 5.1，其默认执行
      // 策略常为 Restricted——加载用户 profile（如 conda init 写入的）会就地报
      // UnauthorizedAccess 红错（实测：winget 安装仍正常，但启动噪音吓人）。
      // 白名单命令（gh/winget/brew/apt）均不依赖用户 profile 环境；pwsh 7 是个人
      // 安装不作依赖，-NoProfile 在 5.1/7 语义一致，一并消除该类报错并加速启动。
      args: ['/c', 'start', 'DSH GitHub', 'powershell.exe', '-NoExit', '-NoProfile', '-Command', command],
    };
  }
  if (process.platform === 'darwin') {
    // AppleScript 字符串内的双引号以 \" 转义；白名单命令虽无引号，仍统一转义防未来扩展踩坑
    const escaped = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return {
      bin: 'osascript',
      args: [
        '-e', `tell application "Terminal" to do script "${escaped}"`,
        '-e', 'tell application "Terminal" to activate',
      ],
    };
  }
  if (process.platform === 'linux') {
    const terminal = detectLinuxTerminal();
    if (!terminal) return null;
    // 各终端「执行命令并保持窗口」的参数形态不同：
    // - gnome-terminal -- <sh> -c：新版 -e 已弃用，-- 后直接跟命令行
    // - konsole/xfce4-terminal/xterm：-e/-x 执行，sh -c + exec 保交互语义
    //   （命令结束后 exec sh 落回交互 shell，窗口不闪退）
    const shArgs = ['sh', '-c', `${command}; exec sh`];
    switch (terminal) {
      case 'gnome-terminal': return { bin: 'gnome-terminal', args: ['--', ...shArgs] };
      case 'konsole': return { bin: 'konsole', args: ['-e', ...shArgs] };
      case 'xfce4-terminal': return { bin: 'xfce4-terminal', args: ['-x', ...shArgs] };
      case 'x-terminal-emulator': return { bin: 'x-terminal-emulator', args: ['-e', ...shArgs] };
      case 'xterm': return { bin: 'xterm', args: ['-e', ...shArgs] };
      default: return null;
    }
  }
  return null;
}

/** Linux 终端探测结果缓存（进程级）：which 探测有子进程成本，会话内只做一次 */
let cachedLinuxTerminal: string | null | undefined;

/**
 * 探测当前 Linux 桌面可用的终端模拟器（按桌面占有率排序）。
 * 返回 null 表示全部不可用——调用方据此走失败分支而非硬编码赌一个。
 */
function detectLinuxTerminal(): string | null {
  if (cachedLinuxTerminal !== undefined) return cachedLinuxTerminal;
  const candidates = ['gnome-terminal', 'konsole', 'xfce4-terminal', 'x-terminal-emulator', 'xterm'];
  try {
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
    for (const name of candidates) {
      try {
        execFileSync('which', [name], { stdio: 'ignore', timeout: 2_000 });
        cachedLinuxTerminal = name;
        return name;
      } catch { /* 该候选不存在，试下一个 */ }
    }
  } catch { /* which 本身不可用（极端环境），视为无可用终端 */ }
  cachedLinuxTerminal = null;
  return null;
}

/** 测试辅助：重置 Linux 终端探测缓存（便于单测注入不同探测环境） */
export function resetLinuxTerminalCache(): void {
  cachedLinuxTerminal = undefined;
}

/**
 * 执行终端唤起并等待真实结果（Issue #2 核心修复：不再先斩后奏报假成功）。
 * start/osascript 场景下命令随宿主立即退出，close 即代表唤起动作用的成败；
 * err 与 stderr 原样上抛给调用方决定 HTTP 语义。
 */
function launchTerminalAndWait(command: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const built = buildTerminalCommand(command);
    if (!built) {
      resolve({ ok: false, error: '未找到可用的系统终端（Linux 下请先安装 gnome-terminal / konsole 等任一终端模拟器）' });
      return;
    }
    // stdio 必须忽略：start 唤起的交互式窗口会继承 execFile 的 stdout/stderr 管道句柄，
    // -NoExit 窗口存活期间管道永不关闭——回调要等满 10s 超时甚至不触发（实测复现：
    // 唤起成功的窗口让 HTTP 响应挂起 10s+）。交互终端本就不该捕获输出；stdio ignore
    // 后等待语义回归 cmd.exe 自身退出（start 创建窗口后立即返回，亚秒级）。
    // 改用原生 spawn：execFile 的类型与实现都强制 stdout 管道捕获，而交互终端唤起
    // 场景需要的恰恰是「不捕获」——spawn 的 stdio:'ignore' 是官方支持的干净形态。
    const child = spawn(built.bin, built.args, {
      stdio: 'ignore',
      detached: false,
    });
    // 10s 兜底超时：正常路径 cmd.exe start 毫秒级返回；超时视为唤起故障并如实回传
    let timedOut = false;
    const killTimer = setTimeout(() => { timedOut = true; child.kill(); }, 10_000);
    child.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(killTimer);
      resolve({ ok: false, error: err.message });
    });
    child.on('close', (code: number | null) => {
      clearTimeout(killTimer);
      if (code === 0) {
        resolve({ ok: true });
      } else if (timedOut) {
        // kill 触发的 close 是 code=null——如实归因为超时而非"退出码 null"
        resolve({ ok: false, error: '终端启动命令 10 秒未返回（可能被安全软件拦截）' });
      } else {
        resolve({ ok: false, error: `终端启动命令退出码 ${code}` });
      }
    });
  });
}

export function registerActionRoutes(
  deps: RouteDeps,
  executor: GhExecutor,
  cacheMap: TtlCache<GitHubOverviewData>,
  globalCache: TtlCache<GlobalOverviewData>
): void {
  const { bindRoute } = deps;

  // 1. 强制刷新缓存
  bindRoute({
    kind: 'exact',
    path: '/api/github/refresh',
    handler: async (req: any, res: any) => {
      // 连容灾底座一起清：用户点「重试刷新」的语义是「宁可空白也重来」。
      // 只清活动缓存会留下一个致命死角——失败分支从不写缓存，于是 fallback
      // 里的旧快照一旦冻结就永久生效（仓库身份改错了也永远出不来），
      // 刷新按钮点了等于没点。
      cacheMap.clear({ keepFallback: false });
      globalCache.clear({ keepFallback: false });
      sendJson(res, 200, { ok: true, message: '缓存已清空，下次读取将拉取最新数据' });
    },
  });

  // 2. 右侧栏快捷操作代理接口
  bindRoute({
    kind: 'exact',
    path: '/api/github/action',
    handler: async (req: any, res: any) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, message: '仅支持 POST 请求' });
        return;
      }

      let body = '';
      req.on('data', (chunk: any) => { body += chunk; });
      req.on('end', async () => {
        try {
          const payload = body ? JSON.parse(body) : {};
          const cwd = payload.cwd || process.cwd();

          switch (payload.action) {
            case 'create_pr': {
              const cmd = ['pr', 'create', '--title', payload.title || 'Update', '--body', payload.body || 'Created from DSH Rightbar'];
              if (payload.draft) cmd.push('--draft');
              const r = await executor.run(cmd, { cwd });
              if (!r.ok) throw new Error(r.error);
              sendJson(res, 200, { ok: true, message: 'PR 创建成功', url: r.rawOutput });
              break;
            }
            case 'create_issue': {
              const cmd = ['issue', 'create', '--title', payload.title || 'New Issue', '--body', payload.body || 'Created from DSH Rightbar'];
              const r = await executor.run(cmd, { cwd });
              if (!r.ok) throw new Error(r.error);
              sendJson(res, 200, { ok: true, message: 'Issue 创建成功', url: r.rawOutput });
              break;
            }
            case 'open_browser': {
              // 原实现把 payload.url 直接拼进 shell 字符串再交给 exec()，
              // 形如 https://x" & calc & " 的 URL 可闭合引号并追加任意命令——本机任意页面
              // 都能通过 POST 这个端点触发命令执行。
              // 现在改为：先用 URL 解析白名单协议，再用 execFile 参数数组传递，全程不经过 shell。
              if (!isSafeExternalUrl(payload.url)) {
                throw new Error('url 参数无效：只允许 http/https 开头的完整地址');
              }
              const { execFile } = await import('node:child_process');
              const [bin, args] = process.platform === 'win32'
                ? ['cmd', ['/c', 'start', '', payload.url]]
                : process.platform === 'darwin'
                  ? ['open', [payload.url]]
                  : ['xdg-open', [payload.url]];
              // 不 await，也不让打开失败反向影响接口语义；仅记录以便排查
              execFile(bin, args, (err: any) => {
                if (err) console.warn('[dsh-github-flow] 打开浏览器失败:', err?.message || err);
              });
              sendJson(res, 200, { ok: true, message: '已在浏览器打开' });
              break;
            }
            case 'open_terminal': {
              const command = typeof payload.command === 'string' ? payload.command.trim() : 'gh auth login';
              // 严格白名单过滤，严防任意命令注入
              const allowedCommands = [
                'gh auth login',
                'winget install --id GitHub.cli',
                'brew install gh',
                'sudo apt install gh',
                'sudo dnf install gh',
              ];
              if (!allowedCommands.includes(command)) {
                throw new Error(`不支持唤起该指令: ${command}`);
              }
              // Issue #2 修复：等待真实唤起结果再回传——旧实现 execFile 异步回调吞错、
              // 路由先行返回 ok:true，导致终端弹不弹都提示成功。
              const launch = await launchTerminalAndWait(command);
              if (!launch.ok) {
                sendJson(res, 500, {
                  ok: false,
                  message: `唤起终端失败：${launch.error}。请手动打开系统终端执行：${command}`,
                });
                return;
              }
              sendJson(res, 200, { ok: true, message: '已唤起系统终端' });
              break;
            }
            case 'switch_branch': {
              const branch = typeof payload.branch === 'string' ? payload.branch.trim() : '';
              if (!branch) {
                sendJson(res, 400, { ok: false, error: '缺少目标分支名称' });
                return;
              }
              const r = await executor.switchGitBranch(cwd, branch);
              if (!r.ok) {
                sendJson(res, 400, { ok: false, error: r.error });
                return;
              }
              cacheMap.clear();
              sendJson(res, 200, { ok: true, currentBranch: r.currentBranch, message: `已成功切换到分支 ${r.currentBranch}` });
              break;
            }
            case 'file_diff':
            case 'get_file_diff': {
              const fileTarget = typeof payload.file === 'string' ? payload.file.trim() : (typeof payload.filePath === 'string' ? payload.filePath.trim() : '');
              if (!fileTarget) {
                sendJson(res, 400, { ok: false, error: '缺少目标文件路径' });
                return;
              }
              const resolvedCwd = executor.resolveWorkspaceCwd(cwd);
              const r = await executor.getFileDiff(resolvedCwd, fileTarget);
              sendJson(res, 200, { ok: r.ok, data: r, error: r.error });
              break;
            }
            case 'uncommitted_files':
            case 'get_uncommitted_files': {
              const limit = Math.min(Math.max(1, Number(payload.limit) || 15), 100);
              const skip = Math.max(0, Number(payload.skip) || 0);
              const resolvedCwd = executor.resolveWorkspaceCwd(cwd);
              const r = await executor.getUncommittedFiles(resolvedCwd, limit, skip);
              sendJson(res, 200, { ok: true, data: r });
              break;
            }
            default:
              sendJson(res, 400, { ok: false, message: `未知的操作类型: ${payload.action}` });
          }
        } catch (err: any) {
          sendJson(res, 500, { ok: false, error: err.message || '操作执行失败' });
        }
      });
    },
  });

  // 3. 读取当前工作区的所有 Git 分支列表（纯本地只读，毫秒级响应）
  bindRoute({
    kind: 'exact',
    path: '/api/github/branches',
    handler: async (req: any, res: any) => {
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, message: '仅支持 GET 请求' });
        return;
      }
      try {
        const url = new URL(req.url || '', 'http://127.0.0.1');
        const cwd = url.searchParams.get('cwd') || undefined;
        const result = await executor.getGitBranches(cwd);
        if (!result) {
          sendJson(res, 404, { ok: false, error: '当前工作区不是 Git 仓库或无法读取分支' });
          return;
        }
        sendJson(res, 200, { ok: true, data: result });
      } catch (err: any) {
        sendJson(res, 500, { ok: false, error: err?.message || '读取分支列表失败' });
      }
    },
  });

  // 4. 切换当前工作区的 Git 分支（带未提交变更防护与合法性校验）
  bindRoute({
    kind: 'exact',
    path: '/api/github/branch-switch',
    handler: async (req: any, res: any) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, message: '仅支持 POST 请求' });
        return;
      }
      let body = '';
      req.on('data', (chunk: any) => { body += chunk; });
      req.on('end', async () => {
        try {
          const payload = body ? JSON.parse(body) : {};
          const cwd = payload.cwd || undefined;
          const branch = typeof payload.branch === 'string' ? payload.branch.trim() : '';

          if (!branch) {
            sendJson(res, 400, { ok: false, error: '缺少目标分支名称' });
            return;
          }

          const r = await executor.switchGitBranch(cwd, branch);
          if (!r.ok) {
            sendJson(res, 400, { ok: false, error: r.error });
            return;
          }

          // 核心联动：切换分支成功后，当前工作区缓存立即失效，确保后续拉取新分支数据
          cacheMap.clear();
          sendJson(res, 200, {
            ok: true,
            currentBranch: r.currentBranch,
            message: `已成功切换到分支 ${r.currentBranch}`,
          });
        } catch (err: any) {
          sendJson(res, 500, { ok: false, error: err?.message || '切换分支失败' });
        }
      });
    },
  });

  // 5. 本地 Git 元数据定向监听（专供右侧栏开启「本地 Git 改动实时感知」时长轮询）
  // 严格安全纪律：只针对 .git/index 与 .git/HEAD 实施定向非递归监听，严禁监听源码目录防句柄耗尽；
  // 800ms 防抖合并；连接断开时自动关闭 watcher 释放系统资源（委托给底层 git-watcher 服务）。
  bindRoute({
    kind: 'exact',
    path: '/api/github/git-watch',
    handler: async (req: any, res: any) => {
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, message: '仅支持 GET 请求' });
        return;
      }
      const url = new URL(req.url || '', 'http://127.0.0.1');
      const cwd = url.searchParams.get('cwd');
      if (!cwd || !hasGitDir(cwd)) {
        sendJson(res, 400, { ok: false, error: '非 Git 仓库，无需监听' });
        return;
      }

      let responded = false;
      try {
        const stop = watchGitMetadata(cwd, (event) => {
          if (responded) return;
          responded = true;
          sendJson(res, 200, { ok: true, ...event });
        });

        req.on('close', () => {
          if (!responded) {
            responded = true;
            stop();
          }
        });
      } catch (err: any) {
        sendJson(res, 500, { ok: false, error: err?.message || '建立监听失败' });
      }
    },
  });

  // 6. 纯本地 Git 状态毫秒级轻量查询（专供工作区改动时的局部定向刷新）
  // 严格安全与性能纪律：
  // 1. 动静解耦：仅执行本地 getLocalGitStatus、getGitCommitLog 与 getGitBranches；
  // 2. 100% 零网络调用、零远端 GitHub API 请求、零 Token 额度消耗，耗时仅 5~10ms；
  // 3. 彻底与 PR/Issue/Run 远端数据解耦，切断因修改本地文件误触发远端全量网络风暴与超时报错的恶性循环。
  bindRoute({
    kind: 'exact',
    path: '/api/github/local-git-status',
    handler: async (req: any, res: any) => {
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, message: '仅支持 GET 请求' });
        return;
      }
      const url = new URL(req.url || '', 'http://127.0.0.1');
      const cwd = url.searchParams.get('cwd');
      if (!cwd || !hasGitDir(cwd)) {
        sendJson(res, 400, { ok: false, error: '非 Git 仓库，无法获取本地 Git 状态' });
        return;
      }

      try {
        const gitStatus = await executor.getLocalGitStatus(cwd).catch(() => null);
        const commitLog = await executor
          .getGitCommitLog(cwd, gitStatus ? gitStatus.hasUpstream : false)
          .catch(() => null);
        const branches = await executor.getGitBranches(cwd).catch(() => null);

        // 同步就地更新内存缓存中的本地元数据，保证后续全量请求也能自然拿到最新的本地状态
        const cached = cacheMap.getFallback(cwd) || cacheMap.get(cwd, Date.now());
        if (cached) {
          if (gitStatus) (cached as any).gitStatus = gitStatus;
          if (commitLog) (cached as any).commitLog = commitLog;
          if (branches) (cached as any).branches = branches;
        }

        sendJson(res, 200, {
          ok: true,
          data: {
            gitStatus,
            commitLog,
            branches,
          },
          cwd,
        });
      } catch (err: any) {
        sendJson(res, 500, { ok: false, error: err?.message || '获取本地 Git 状态失败' });
      }
    },
  });

  // 7. 单个未提交文件的 Git Diff 差异查询（供右侧栏 FileDiffModal 调用）
  bindRoute({
    kind: 'exact',
    path: '/api/github/file-diff',
    handler: async (req: any, res: any) => {
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, message: '仅支持 GET 请求' });
        return;
      }
      try {
        const url = new URL(req.url || '', 'http://127.0.0.1');
        const cwd = url.searchParams.get('cwd') || undefined;
        const file = url.searchParams.get('file');
        if (!file || !file.trim()) {
          sendJson(res, 400, { ok: false, error: '缺少必需的 file 参数' });
          return;
        }

        const resolvedCwd = executor.resolveWorkspaceCwd(cwd);
        if (!hasGitDir(resolvedCwd)) {
          sendJson(res, 400, { ok: false, error: '当前工作区不是 Git 仓库' });
          return;
        }

        const diffResult = await executor.getFileDiff(resolvedCwd, file.trim());
        if (!diffResult.ok) {
          sendJson(res, 400, { ok: false, error: diffResult.error || '获取文件差异失败' });
          return;
        }
        sendJson(res, 200, { ok: true, data: diffResult });
      } catch (err: any) {
        sendJson(res, 500, { ok: false, error: err?.message || '获取文件差异失败' });
      }
    },
  });

  // 8. 本地未提交文件列表轻量流式分页查询（供右侧栏滑动加载调用）
  bindRoute({
    kind: 'exact',
    path: '/api/github/uncommitted-files',
    handler: async (req: any, res: any) => {
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, message: '仅支持 GET 请求' });
        return;
      }
      try {
        const url = new URL(req.url || '', 'http://127.0.0.1');
        const cwd = url.searchParams.get('cwd') || undefined;
        const limit = Math.min(Math.max(1, Number(url.searchParams.get('limit')) || 15), 100);
        const skip = Math.max(0, Number(url.searchParams.get('skip')) || 0);

        const resolvedCwd = executor.resolveWorkspaceCwd(cwd);
        if (!hasGitDir(resolvedCwd)) {
          sendJson(res, 400, { ok: false, error: '当前工作区不是 Git 仓库' });
          return;
        }

        const result = await executor.getUncommittedFiles(resolvedCwd, limit, skip);
        sendJson(res, 200, { ok: true, data: result });
      } catch (err: any) {
        sendJson(res, 500, { ok: false, error: err?.message || '获取未提交文件列表失败' });
      }
    },
  });
}
