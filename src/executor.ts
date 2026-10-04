import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { GhExecutionOptions, GhResult, AuthStatus, RepoMetadata, PluginConfig } from './types.js';

const execFileAsync = promisify(execFile);

export class GhExecutor {
  public ghPath: string;
  public defaultTimeoutMs: number;
  public maxOutputChars: number;

  constructor(config: PluginConfig = {}) {
    this.ghPath = config.ghPath || 'gh';
    this.defaultTimeoutMs = config.defaultTimeoutMs || 30_000;
    this.maxOutputChars = config.maxOutputChars || 24_000;
  }

  updateConfig(config: PluginConfig = {}) {
    if (config.ghPath) this.ghPath = config.ghPath;
    if (config.defaultTimeoutMs) this.defaultTimeoutMs = config.defaultTimeoutMs;
    if (config.maxOutputChars) this.maxOutputChars = config.maxOutputChars;
  }

  /**
   * 智能解析最可靠的工作区物理路径：
   * 1. 优先使用显式指定的有效 cwd（若包含 .git 目录）
   * 2. 读取当前进程/会话的 DSH_SESSION_ID 并匹配 ~/.dsh/storages/workspace.json
   * 3. 匹配 ~/.dsh/storages/workspace.json 中最近活跃的工作区
   * 4. 回退到 process.cwd()
   */
  resolveWorkspaceCwd(explicitCwd?: string): string {
    if (explicitCwd) {
      try {
        if (fs.existsSync(path.join(explicitCwd, '.git'))) {
          return explicitCwd;
        }
      } catch {}
    }

    try {
      const wsJsonPath = path.join(os.homedir(), '.dsh', 'storages', 'workspace.json');
      if (fs.existsSync(wsJsonPath)) {
        const wsData = JSON.parse(fs.readFileSync(wsJsonPath, 'utf8'));
        const workspaces = wsData.tables?.workspaces || {};

        // A. 优先通过 DSH 会话 ID 精准匹配物理工作区
        const sessionId = process.env.DSH_SESSION_ID;
        if (sessionId) {
          for (const wsId of Object.keys(workspaces)) {
            const item = workspaces[wsId];
            if (item.sessionIds && Array.isArray(item.sessionIds) && item.sessionIds.includes(sessionId)) {
              if (item.path && fs.existsSync(item.path)) {
                return item.path;
              }
            }
          }
        }

        // B. 兜底匹配最近活跃更新的工作区
        let latestItem: any = null;
        for (const wsId of Object.keys(workspaces)) {
          const item = workspaces[wsId];
          if (!latestItem || new Date(item.updatedAt || 0) > new Date(latestItem.updatedAt || 0)) {
            latestItem = item;
          }
        }
        if (latestItem && latestItem.path && fs.existsSync(latestItem.path)) {
          return latestItem.path;
        }
      }
    } catch {}

    return explicitCwd || process.cwd();
  }

  /**
   * 安全执行 gh 命令
   * 采用 execFile 参数数组隔离，彻底杜绝 Shell 字符串拼接注入漏洞
   */
  async run<T = unknown>(args: string[], options: GhExecutionOptions = {}): Promise<GhResult<T>> {
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
          NO_COLOR: '1',              // 禁用 ANSI 颜色转义字符
          ...options.env,
        },
      });

      let rawOutput = (stdout || '').trim();
      if (!rawOutput && stderr) {
        rawOutput = stderr.trim();
      }

      let truncated = false;
      if (rawOutput.length > this.maxOutputChars) {
        // 保留前 1/3 字符和尾部 1/2 字符，保留开头上下文和错误尾部
        const headLen = Math.floor(this.maxOutputChars * 0.35);
        const tailLen = Math.floor(this.maxOutputChars * 0.55);
        const head = rawOutput.slice(0, headLen);
        const tail = rawOutput.slice(-tailLen);
        rawOutput = `${head}\n\n... [⚠️ 提示：内容过长已由 DSH GitHub 插件截断中间部分，当前截取前 ${Math.round(headLen / 1024)}KB 与后 ${Math.round(tailLen / 1024)}KB] ...\n\n${tail}`;
        truncated = true;
      }

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
   */
  async checkAuth(cwd?: string): Promise<AuthStatus> {
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
    let user: string | undefined;
    const accountMatch = raw.match(/account\s+([A-Za-z0-9_-]+)/i);
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
   * 获取当前目录（工作区）关联的远程仓库元数据
   * 采用 gh repo view + 本地 git remote 双保险机制，彻底杜绝已配置远程却误判未关联的问题
   */
  async getRepoMetadata(cwd?: string): Promise<RepoMetadata | null> {
    const targetCwd = this.resolveWorkspaceCwd(cwd);

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
