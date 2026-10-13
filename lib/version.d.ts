/**
 * 插件版本与元数据模块
 *
 * 为什么独立为此文件：
 * 1. 运行时需要精确获知自身当前安装版本与包标识，避免硬编码分散在各业务模块；
 * 2. 避免在 ESM 运行时动态读取 package.json 引入 fs 权限和路径解析边界问题；
 * 3. 方便在 CI 发布流水线或 build 脚本中自动化校准。
 */
export declare const CURRENT_PLUGIN_VERSION = "0.2.1";
export declare const PLUGIN_PACKAGE_NAME = "dsh-github-flow";
export declare const NPM_PACKAGE_URL = "https://www.npmjs.com/package/dsh-github-flow";
export declare const NPM_REGISTRY_MIRROR = "https://registry.npmmirror.com";
export declare const NPM_REGISTRY_OFFICIAL = "https://registry.npmjs.org";
