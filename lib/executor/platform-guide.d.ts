/**
 * 获取当前平台的推荐 gh 安装引导与命令。
 * 覆盖 Windows (winget/scoop)、macOS (Homebrew/MacPorts)、Linux (apt/dnf)。
 */
export declare function getPlatformInstallGuide(): {
    command: string;
    altCommand: string;
    downloadUrl: string;
    description: string;
};
/**
 * gh 升级命令按平台提示（复用三态状态机的平台判断口径）。
 */
export declare function getGhUpgradeHint(): string;
