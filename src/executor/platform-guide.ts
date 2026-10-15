/**
 * 获取当前平台的推荐 gh 安装引导与命令。
 * 覆盖 Windows (winget/scoop)、macOS (Homebrew/MacPorts)、Linux (apt/dnf)。
 */
export function getPlatformInstallGuide(): {
  command: string;
  altCommand: string;
  downloadUrl: string;
  description: string;
} {
  const p = process.platform;
  if (p === 'win32') {
    return {
      command: 'winget install --id GitHub.cli',
      altCommand: 'scoop install gh',
      downloadUrl: 'https://cli.github.com/',
      description: '推荐使用 Windows Package Manager (winget) 一键安装，或下载官方 .msi 安装包。',
    };
  }
  if (p === 'darwin') {
    return {
      command: 'brew install gh',
      altCommand: 'port install gh',
      downloadUrl: 'https://cli.github.com/',
      description: '推荐使用 Homebrew 安装 GitHub CLI。',
    };
  }
  return {
    command: 'sudo apt install gh',
    altCommand: 'sudo dnf install gh',
    downloadUrl: 'https://cli.github.com/',
    description: '推荐使用系统包管理器安装（Debian/Ubuntu 运行 apt，Fedora/CentOS 运行 dnf）。',
  };
}

/**
 * gh 升级命令按平台提示（复用三态状态机的平台判断口径）。
 */
export function getGhUpgradeHint(): string {
  const p = process.platform;
  if (p === 'win32') return '升级命令：`winget upgrade GitHub.cli`（或从 https://cli.github.com/ 下载最新 .msi）。';
  if (p === 'darwin') return '升级命令：`brew upgrade gh`（或从 https://cli.github.com/ 下载最新安装包）。';
  return '升级方式：更新系统包（Debian/Ubuntu: `sudo apt update && sudo apt install gh`；Fedora: `sudo dnf upgrade gh`），或见 https://cli.github.com/。';
}
