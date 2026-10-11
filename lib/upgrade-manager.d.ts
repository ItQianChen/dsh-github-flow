import type { UpgradeExecutionResult, UpgradeStatusResult } from './types.js';
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
export declare function buildCrossPlatformEnv(): NodeJS.ProcessEnv;
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
export declare class UpgradeManager {
    private isUpgrading;
    private lastResult;
    private logBuffer;
    /**
     * 探测当前插件是否是以本地 Git 源码软链接方式运行
     */
    isDevLinked(): boolean;
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
    };
    /**
     * 获取当前升级状态
     */
    getStatus(): UpgradeStatusResult;
    /**
     * 执行一键升级核心流程
     */
    executeUpgrade(targetVersion?: string): Promise<UpgradeExecutionResult>;
}
