import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { PLUGIN_PACKAGE_NAME } from './version.js';
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
export function buildCrossPlatformEnv() {
    const currentPath = process.env.PATH || '';
    const extraPaths = [];
    const isMac = process.platform === 'darwin';
    const isWin = process.platform === 'win32';
    // 1. 当前正在运行的 node 自身二进制文件所在目录（最优先，必然有配套 npm）
    if (process.execPath) {
        try {
            extraPaths.push(path.dirname(process.execPath));
        }
        catch { }
    }
    // 2. macOS 专有软件与包管理器安装路径
    if (isMac) {
        extraPaths.push('/opt/homebrew/bin'); // Apple Silicon Homebrew
        extraPaths.push('/opt/homebrew/sbin');
        extraPaths.push('/usr/local/bin'); // Intel Mac Homebrew
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
        NPM_CONFIG_REGISTRY: 'https://registry.npmmirror.com', // 优先国内源加速
        LANG: 'zh_CN.UTF-8',
        LC_ALL: 'zh_CN.UTF-8',
    };
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
    isUpgrading = false;
    lastResult = {
        state: 'idle',
    };
    logBuffer = [];
    /**
     * 探测当前插件是否是以本地 Git 源码软链接方式运行
     */
    isDevLinked() {
        try {
            const currentDir = path.dirname(fileURLToPath(import.meta.url));
            const isInsideNodeModules = currentDir.includes('node_modules');
            // 检查上级或同级是否存在 .git 目录
            const gitDirParent = path.resolve(currentDir, '../.git');
            const gitDirRoot = path.resolve(currentDir, '../../.git');
            const hasGit = fs.existsSync(gitDirParent) || fs.existsSync(gitDirRoot);
            return !isInsideNodeModules && hasGit;
        }
        catch {
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
    detectEnvironment() {
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
    getStatus() {
        const env = this.detectEnvironment();
        return {
            ...this.lastResult,
            environment: env.isDesktop ? 'desktop' : 'web',
            log: this.logBuffer.join('\n'),
        };
    }
    /**
     * 执行一键升级核心流程
     */
    async executeUpgrade(targetVersion) {
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
        return new Promise((resolve) => {
            const isWin = process.platform === 'win32';
            let command = '';
            let executionCwd = process.cwd();
            // 根据环境类型分流升级指令（跨平台安全路径）：
            if (env.isDesktop) {
                // 场景 A：DSH 桌面版环境（macOS / Windows / Linux 桌面端通用）
                const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
                const fallbackDesktopCwd = env.profileDir || path.join(dshHome, 'profiles', 'desktop');
                if (fs.existsSync(fallbackDesktopCwd)) {
                    executionCwd = fallbackDesktopCwd;
                    command = `dsh plugin --profile desktop add ${pkgWithVer} || npm install ${pkgWithVer} --save`;
                }
                else {
                    command = `dsh plugin --profile desktop add ${pkgWithVer} || npm install -g ${pkgWithVer}`;
                }
            }
            else {
                // 场景 B：Web 版 / 开发者终端 CLI 版环境
                const profile = env.profile || 'default';
                command = `pnpm dsh plugin add ${pkgWithVer} || dsh plugin --profile ${profile} add ${pkgWithVer} || npm install -g ${pkgWithVer}`;
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
            const safeSettle = (result) => {
                if (settled)
                    return;
                settled = true;
                this.isUpgrading = false;
                resolve(result);
            };
            // 注入跨平台增强环境（尤其治愈 macOS GUI 启动丢失 PATH 的痛点）
            const childEnv = buildCrossPlatformEnv();
            const child = spawn(shell, args, {
                cwd: executionCwd,
                windowsHide: true,
                env: childEnv,
            });
            const timeoutTimer = setTimeout(() => {
                child.kill();
                const timeoutMsg = '升级命令执行超时（60 秒），可能是网络阻塞或包管理器锁占用，建议在终端手动执行升级。';
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
                if (this.logBuffer.length > 200)
                    this.logBuffer.shift();
            });
            child.stderr?.on('data', (chunk) => {
                const text = chunk.toString();
                this.logBuffer.push(text);
                if (this.logBuffer.length > 200)
                    this.logBuffer.shift();
            });
            child.on('close', (code) => {
                clearTimeout(timeoutTimer);
                const completedAt = Date.now();
                if (code === 0) {
                    const successMsg = env.isDesktop
                        ? `升级成功！已安装最新依赖 ${pkgWithVer} 到桌面版 Profile。需重启 DSH 桌面客户端彻底生效后端工具，或刷新当前界面。`
                        : `升级成功！已安装最新依赖 ${pkgWithVer}。需重启 DSH 服务彻底生效后端工具，或刷新网页先体验新版界面。`;
                    this.lastResult = {
                        state: 'success',
                        targetVersion,
                        message: successMsg,
                        completedAt,
                        environment: env.isDesktop ? 'desktop' : 'web',
                    };
                    safeSettle({
                        ok: true,
                        message: successMsg,
                        needRestart: true,
                        environment: env.isDesktop ? 'desktop' : 'web',
                        log: this.logBuffer.join('\n'),
                    });
                }
                else {
                    const failedMsg = `升级退出码异常 (${code})，可能需要管理员权限或在宿主环境终端手动执行。`;
                    this.lastResult = {
                        state: 'failed',
                        targetVersion,
                        message: failedMsg,
                        completedAt,
                        environment: env.isDesktop ? 'desktop' : 'web',
                    };
                    safeSettle({
                        ok: false,
                        message: failedMsg,
                        needRestart: false,
                        environment: env.isDesktop ? 'desktop' : 'web',
                        log: this.logBuffer.join('\n'),
                    });
                }
            });
            child.on('error', (err) => {
                clearTimeout(timeoutTimer);
                const errMsg = `无法启动安装子进程: ${err.message}`;
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
