import type { UpgradeExecutionResult, UpgradeStatusResult, UpgradeErrorType } from './types.js';
import type { ProxyManager } from './proxy.js';
/**
 * 分析升级失败日志中的深层错误特征（重点识别 DSH 内置包管理器 minimumReleaseAge 24 小时防投毒策略）
 */
export declare function detectUpgradeErrorType(log?: string): UpgradeErrorType;
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
export declare function buildCrossPlatformEnv(registryOverride?: string): NodeJS.ProcessEnv;
/**
 * 探测 dsh CLI 是否对当前进程可达（PATH 或已知安装位置）。
 * 为什么必须预检：桌面端 GUI 启动时 dsh 常不在 PATH，旧实现用 '||' 兜底到
 * `npm install -g`——装到全局对 profile 依赖毫无作用，表现为「一键升级无效果」
 * 的静默失败。预检不可达时直接给出带完整命令的明确指引，宁可见失败不可假成功。
 */
export declare function probeDshCliAvailable(env: NodeJS.ProcessEnv): Promise<{
    ok: boolean;
    hint?: string;
}>;
/**
 * 定位桌面版自带的 pnpm 分发包（pnpm.mjs）。
 * 官方事实（apps/desktop/README）：Desktop 在 resources/runtime/primary-runtime/
 * dependencies/pnpm 携带完整 pnpm 分发，「包操作不要求 PATH 上存在 pnpm」。
 * dsh CLI 的 plugin 子命令本质就是「进 profile 目录转发 pnpm」——CLI 不可达时
 * 我们可以自己定位 profile 目录直调这份 pnpm，完全绕开 dsh CLI 依赖。
 * 候选链：a. DSH_BUNDLED_PNPM 显式覆盖；b. argv[0] 宿主二进制推导（桌面版固定布局）。
 */
export declare function locateBundledPnpm(): string | null;
/**
 * 读取 profile 中已实际安装的本插件版本（实证校验的事实源）。
 * 读不到（目录不存在/无产物/JSON 损坏）返回 null——调用方据此决定是否放行：
 * 无法证伪时不在成功文案里虚报版本号，但不阻断（避免文件系统受限环境下误杀真成功）。
 */
export declare function readInstalledVersion(profileDir?: string): string | null;
/**
 * 把插件包名补写进 profile 的 dsh.profile.bundles（幂等）。
 * 为什么需要：pnpm add 只改 dependencies；dsh plugin add 还会追加 bundles 列表
 * （官方语义：无 dsh.bundle 声明的包只作普通依赖不激活）。直调 pnpm 的降级路径
 * 必须补齐这一步，插件才会真正进入 profile 组合。
 * 安全性（本机实测）：pnpm add 对 dsh.profile 自定义字段完整保真，因此补写放在
 * pnpm 成功后执行，读写同一份 package.json 不会互相破坏；写入用「读-改-写全量
 * JSON」保持 2 空格缩进 + 尾换行与 dsh CLI 产物一致。
 */
export declare function ensureBundleListed(profileDir: string, pkgName: string): {
    ok: boolean;
    error?: string;
};
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
    /** 代理管理器（可选）：注入后一键升级的 npm/pnpm 子进程走用户代理 */
    private proxyManager?;
    /** 更新源模式查询（可选）：一键升级的 NPM_CONFIG_REGISTRY 跟随用户在设置页选择的源 */
    private getUpdateMode;
    attachProxyManager(manager: ProxyManager): void;
    /** 注入更新源查询函数（而非静态值）：用户切换源后无需重新装配即实时生效 */
    attachUpdateModeQuery(query: () => 'official' | 'mirror' | 'off' | null): void;
    /**
     * 按当前更新源推导 NPM_CONFIG_REGISTRY。
     * 为什么跟随源而非写死：用户选官方源的理由（镜像同步滞后）对安装同样成立——
     * 选镜像源装的可能是旧版。off 模式下一键升级仍可用（关提示不关能力），
     * 其 registry 落官方源（能力路径取最权威的源）。
     */
    private resolveRegistry;
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
     * 级别 2 降级路径：直调桌面版自带 pnpm 安装包（execFile 数组参数隔离，无 shell）。
     * 输出与退出码经回调上抛，由调用方决定 bundles 补写与状态机收尾。
     */
    private runPnpmDirect;
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
    private finishUpgrade;
    /**
     * 执行一键升级核心流程
     */
    executeUpgrade(targetVersion?: string): Promise<UpgradeExecutionResult>;
}
