import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENT_PLUGIN_VERSION, PLUGIN_PACKAGE_NAME, NPM_PACKAGE_URL, NPM_REGISTRY_MIRROR, NPM_REGISTRY_OFFICIAL, } from './version.js';
/**
 * 检测当前 DSH 运行 profile 名（升级命令的 --profile 必填项，官方 CLI 语义：
 * `dsh plugin --profile <name> add <pkg>` 在 profile 目录内转发给 pnpm）。
 * 探测优先级（从权威到兜底，不瞎猜）：
 * 1. DSH_PROFILE 环境变量——launcher 启动时固定注入（桌面版=desktop，
 *    `dsh --profile web` 启动的 Web 版=web），是运行进程对自身 profile 的事实源；
 * 2. DSH_PROFILE_DIR 路径含 desktop 时判定 desktop；
 * 3. 兜底探测 ~/.dsh/profiles 下实际存在的 profile 目录（web > default 顺序），
 *    两者皆无才回落 'default'（dsh CLI 的默认 profile 名）。
 */
export function detectProfileName() {
    const profile = (process.env.DSH_PROFILE || '').trim();
    if (profile)
        return profile;
    const dir = (process.env.DSH_PROFILE_DIR || '').trim().toLowerCase();
    if (dir.includes('desktop'))
        return 'desktop';
    // 0.5 最可靠的事实源兜底：本插件模块必然安装在 <profile>/node_modules/ 下，
    // 从自身 import.meta.url 逐级上溯找到 profiles/<name> 段即为当前 profile。
    // 优先于目录枚举：即使机器上装了多个 profile 也能指认「正在运行的这一个」。
    try {
        let cur = path.dirname(fileURLToPath(import.meta.url));
        for (let i = 0; i < 8; i++) {
            const parent = path.dirname(cur);
            if (path.basename(parent) === 'profiles' && parent !== cur) {
                const name = path.basename(cur);
                if (name && name !== 'node_modules')
                    return name;
            }
            cur = parent;
            if (!cur || cur === path.dirname(cur))
                break;
        }
    }
    catch { /* 非 file:// 上下文（理论不发生）继续走兜底 */ }
    // 环境变量缺失（自定义启动方式）：按实际存在的 profile 目录兜底
    try {
        const profilesRoot = path.join(os.homedir(), '.dsh', 'profiles');
        if (fs.existsSync(profilesRoot)) {
            const names = fs.readdirSync(profilesRoot).filter((n) => {
                try {
                    return fs.statSync(path.join(profilesRoot, n)).isDirectory();
                }
                catch {
                    return false;
                }
            });
            if (names.includes('web'))
                return 'web';
            if (names.length > 0 && !names.includes('default'))
                return names[0];
        }
    }
    catch { /* 探测失败走最终兜底 */ }
    return 'default';
}
/**
 * 极简语义化版本大小比较函数 (latest > current 时返回 true)
 *
 * 为什么自研而不引入 semver npm 依赖：
 * 避免为了简单的 x.y.z 比对而引入数十个传递子依赖，保持 DSH 插件轻量纯净与零运行期依赖负担。
 * 约束条件：标准处理 x.y.z 形式，自动过滤前导 'v' 或 '^' 等非数字字符，忽略 pre-release 标签后续对比。
 */
export function isNewerVersion(current, latest) {
    if (!current || !latest)
        return false;
    const parseParts = (v) => {
        return v
            .replace(/^[^\d]*/, '')
            .split('-')[0]
            .split('.')
            .map((part) => parseInt(part, 10) || 0);
    };
    const cParts = parseParts(current);
    const lParts = parseParts(latest);
    const len = Math.max(cParts.length, lParts.length, 3);
    for (let i = 0; i < len; i++) {
        const c = cParts[i] ?? 0;
        const l = lParts[i] ?? 0;
        if (l > c)
            return true;
        if (l < c)
            return false;
    }
    return false;
}
/**
 * 插件版本检测引擎
 *
 * 架构约束与为什么这样设计：
 * 1. 业务解耦：getQuickStatus 同步读取内存缓存，耗时 0ms，供主业务路由无感调用；
 * 2. 闲时触发：check() 异步外网探测，首选淘宝镜像加速 (npmmirror.com)，官方 npmjs 兜底；
 * 3. 避免击穿：通过 inFlightPromise 合并并发调用，防止多处同时触发重复请求；
 * 4. 彻底容灾：任何网络或解析异常 100% 内部吸收，返回 hasUpdate: false，绝不影响主流程。
 */
export class UpdateChecker {
    cachedInfo = null;
    inFlightPromise = null;
    intervalMs;
    customRegistry;
    constructor(options = {}) {
        // 默认缓存 24 小时，杜绝高频击穿 npm
        this.intervalMs = typeof options.intervalMs === 'number' && options.intervalMs > 0
            ? options.intervalMs
            : 86_400_000;
        this.customRegistry = options.customRegistry;
    }
    /**
     * 应用代理到 npm 探测的 fetch 链路。
     * 由 main.ts 在 ProxyManager 初始化/变更后调用：undici dispatcher 是进程级全局，
     * 这里只做一次转发，真正的缓存/重建逻辑在 ProxyManager.applyFetchDispatcher 内。
     */
    applyProxy(manager) {
        if (manager)
            manager.applyFetchDispatcher();
    }
    /**
     * 同步获取当前已知的版本状态（0ms 纯内存读取，绝不发外网请求）。
     * 兜底命令同样按当前 profile 生成：网络探测失败时复制命令也必须开箱可用。
     */
    getQuickStatus() {
        if (this.cachedInfo) {
            return this.cachedInfo;
        }
        const profile = detectProfileName();
        const primary = `dsh plugin --profile ${profile} add ${PLUGIN_PACKAGE_NAME}@latest`;
        return {
            currentVersion: CURRENT_PLUGIN_VERSION,
            hasUpdate: false,
            upgradeCommand: primary,
            allCommands: {
                dshCli: primary,
                profile: primary,
                pnpm: `pnpm add ${PLUGIN_PACKAGE_NAME}@latest`,
                npm: `npm install -g ${PLUGIN_PACKAGE_NAME}@latest`,
            },
            releaseNotesUrl: `${NPM_PACKAGE_URL}?activeTab=versions`,
            checkedAt: 0,
        };
    }
    /**
     * 异步触发版本检测
     * @param force 是否忽略 24h 缓存强制穿透探测
     */
    async check(force = false) {
        const now = Date.now();
        // 1. 命中有效缓存直接返回
        if (!force && this.cachedInfo && now - this.cachedInfo.checkedAt < this.intervalMs) {
            return this.cachedInfo;
        }
        // 2. 复用正在途中的网络请求，避免并发重复打 npm
        if (this.inFlightPromise) {
            return this.inFlightPromise;
        }
        this.inFlightPromise = this.performCheck(now).finally(() => {
            this.inFlightPromise = null;
        });
        return this.inFlightPromise;
    }
    /**
     * 内部双 Registry 竞速/降级探测
     */
    async performCheck(now) {
        const fallback = this.getQuickStatus();
        // 双通道策略：用户自定义源 > 国内淘宝镜像 (2.5s极速) > 官方 npmjs 源 (3.5s兜底)
        const endpoints = [];
        if (this.customRegistry) {
            endpoints.push(`${this.customRegistry.replace(/\/$/, '')}/${PLUGIN_PACKAGE_NAME}/latest`);
        }
        else {
            endpoints.push(`${NPM_REGISTRY_MIRROR}/${PLUGIN_PACKAGE_NAME}/latest`);
            endpoints.push(`${NPM_REGISTRY_OFFICIAL}/${PLUGIN_PACKAGE_NAME}/latest`);
        }
        let latestVersion = null;
        for (const url of endpoints) {
            try {
                const isMirror = url.includes('npmmirror');
                const timeoutMs = isMirror ? 2_500 : 3_500;
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), timeoutMs);
                const res = await fetch(url, {
                    signal: controller.signal,
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': `dsh-plugin-updater/${CURRENT_PLUGIN_VERSION}`,
                    },
                });
                clearTimeout(timer);
                if (res.ok) {
                    const json = (await res.json());
                    if (json && typeof json.version === 'string' && json.version.trim()) {
                        latestVersion = json.version.trim();
                        break;
                    }
                }
            }
            catch {
                // 单个源故障静默尝试下一个备用源，确保高可用
            }
        }
        // 若双源均未拉取到版本，保留保底数据并记录时间戳，防止密集重试
        if (!latestVersion) {
            this.cachedInfo = {
                ...fallback,
                checkedAt: now,
            };
            return this.cachedInfo;
        }
        const hasUpdate = isNewerVersion(CURRENT_PLUGIN_VERSION, latestVersion);
        const targetPkg = `${PLUGIN_PACKAGE_NAME}@${latestVersion}`;
        // 命令按真实 profile 生成（P1 修复）：dsh CLI 的 --profile 为必填项，
        // 桌面端用户复制 'pnpm dsh plugin add ...' 会直接报 required option 错误。
        const profile = detectProfileName();
        const primary = `dsh plugin --profile ${profile} add ${targetPkg}`;
        this.cachedInfo = {
            currentVersion: CURRENT_PLUGIN_VERSION,
            latestVersion,
            hasUpdate,
            upgradeCommand: primary,
            allCommands: {
                dshCli: primary,
                profile: primary,
                pnpm: `pnpm add ${targetPkg}`,
                npm: `npm install -g ${targetPkg}`,
            },
            releaseNotesUrl: `${NPM_PACKAGE_URL}?activeTab=versions`,
            checkedAt: now,
        };
        return this.cachedInfo;
    }
}
