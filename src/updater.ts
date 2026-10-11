import {
  CURRENT_PLUGIN_VERSION,
  PLUGIN_PACKAGE_NAME,
  NPM_PACKAGE_URL,
  NPM_REGISTRY_MIRROR,
  NPM_REGISTRY_OFFICIAL,
} from './version.js';
import type { UpdateInfo } from './types.js';

/**
 * 极简语义化版本大小比较函数 (latest > current 时返回 true)
 *
 * 为什么自研而不引入 semver npm 依赖：
 * 避免为了简单的 x.y.z 比对而引入数十个传递子依赖，保持 DSH 插件轻量纯净与零运行期依赖负担。
 * 约束条件：标准处理 x.y.z 形式，自动过滤前导 'v' 或 '^' 等非数字字符，忽略 pre-release 标签后续对比。
 */
export function isNewerVersion(current: string, latest: string): boolean {
  if (!current || !latest) return false;

  const parseParts = (v: string): number[] => {
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
    if (l > c) return true;
    if (l < c) return false;
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
  private cachedInfo: UpdateInfo | null = null;
  private inFlightPromise: Promise<UpdateInfo> | null = null;
  private readonly intervalMs: number;
  private readonly customRegistry?: string;

  constructor(options: { intervalMs?: number; customRegistry?: string } = {}) {
    // 默认缓存 24 小时，杜绝高频击穿 npm
    this.intervalMs = typeof options.intervalMs === 'number' && options.intervalMs > 0
      ? options.intervalMs
      : 86_400_000;
    this.customRegistry = options.customRegistry;
  }

  /**
   * 同步获取当前已知的版本状态（0ms 纯内存读取，绝不发外网请求）
   */
  getQuickStatus(): UpdateInfo {
    if (this.cachedInfo) {
      return this.cachedInfo;
    }

    return {
      currentVersion: CURRENT_PLUGIN_VERSION,
      hasUpdate: false,
      upgradeCommand: `pnpm dsh plugin update ${PLUGIN_PACKAGE_NAME}`,
      allCommands: {
        dshCli: `pnpm dsh plugin update ${PLUGIN_PACKAGE_NAME}`,
        profile: `dsh plugin --profile default add ${PLUGIN_PACKAGE_NAME}@latest`,
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
  async check(force = false): Promise<UpdateInfo> {
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
  private async performCheck(now: number): Promise<UpdateInfo> {
    const fallback = this.getQuickStatus();

    // 双通道策略：用户自定义源 > 国内淘宝镜像 (2.5s极速) > 官方 npmjs 源 (3.5s兜底)
    const endpoints: string[] = [];
    if (this.customRegistry) {
      endpoints.push(`${this.customRegistry.replace(/\/$/, '')}/${PLUGIN_PACKAGE_NAME}/latest`);
    } else {
      endpoints.push(`${NPM_REGISTRY_MIRROR}/${PLUGIN_PACKAGE_NAME}/latest`);
      endpoints.push(`${NPM_REGISTRY_OFFICIAL}/${PLUGIN_PACKAGE_NAME}/latest`);
    }

    let latestVersion: string | null = null;

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
          const json = (await res.json()) as any;
          if (json && typeof json.version === 'string' && json.version.trim()) {
            latestVersion = json.version.trim();
            break;
          }
        }
      } catch {
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

    this.cachedInfo = {
      currentVersion: CURRENT_PLUGIN_VERSION,
      latestVersion,
      hasUpdate,
      upgradeCommand: `pnpm dsh plugin add ${targetPkg}`,
      allCommands: {
        dshCli: `pnpm dsh plugin add ${targetPkg}`,
        profile: `dsh plugin --profile default add ${targetPkg}`,
        pnpm: `pnpm add ${targetPkg}`,
        npm: `npm install -g ${targetPkg}`,
      },
      releaseNotesUrl: `${NPM_PACKAGE_URL}?activeTab=versions`,
      checkedAt: now,
    };

    return this.cachedInfo;
  }
}
