import type { GhExecutor } from '../executor.js';
import type { UpdateChecker } from '../updater.js';
import { CURRENT_PLUGIN_VERSION, PLUGIN_PACKAGE_NAME, NPM_PACKAGE_URL } from '../version.js';
import { loadUpdateSettings, describeUpdateMode, type UpdateSourceMode } from '../update-settings.js';
import { TelemetryCollector, defaultTelemetryCollector } from '../telemetry.js';

export function registerGhCommand(commandsService: any, executor: GhExecutor, updateChecker?: UpdateChecker, telemetryCollector?: TelemetryCollector) {
  if (!commandsService || typeof commandsService.register !== 'function') return;

  commandsService.register({
    name: 'gh',
    description: 'GitHub CLI 状态与诊断快捷指令',
    async handler({ rawInput }: { rawInput: string }) {
      const trimmed = (rawInput || '').trim();

      if (!trimmed || trimmed === 'status') {
        // 人类显式诊断必须绕过缓存：用户敲 /gh status 往往正是为了确认
        // 「我刚 gh auth login 到底成没成」，给他 30 秒前的缓存等于答非所问。
        const auth = await executor.checkAuth(undefined, true);
        const repo = await executor.getRepoMetadata();
        const updateInfo = updateChecker?.getQuickStatus();

        let md = `### GitHub 集成状态\n\n`;

        // 若检测到新版本，在最上方展示醒目的升级指引横幅
        if (updateInfo?.hasUpdate) {
          md += `> 🚀 **发现新版本 v${updateInfo.latestVersion}**（当前为 \`v${updateInfo.currentVersion}\`）\n`;
          md += `> 输入 \`/gh upgrade\` 查看升级指引，或在终端执行：\`${updateInfo.upgradeCommand}\`\n\n`;
        }

        md += `- **插件版本**: \`v${updateInfo?.currentVersion || CURRENT_PLUGIN_VERSION}\`\n`;

        if (auth.loggedIn) {
          md += `- **登录账号**: \`${auth.user || '已登录'}\`\n`;
          md += `- **授权作用域**: ${auth.scopes?.map((s) => `\`${s}\``).join(', ') || '标准权限'}\n`;
        } else {
          md += `- **登录状态**: ❌ 未登录 GitHub\n`;
          md += `> 提示：请在系统终端执行 \`gh auth login\` 进行登录。\n`;
        }

        if (repo) {
          md += `\n**当前关联仓库**:\n`;
          md += `- 仓库名: [${repo.nameWithOwner}](${repo.url})\n`;
          md += `- 默认分支: \`${repo.defaultBranch}\`\n`;
          if (repo.description) md += `- 简介: ${repo.description}\n`;
        } else {
          md += `\n*当前目录尚未关联 Git 远程仓库或未托管在 GitHub。*\n`;
        }

        // 遥测运行时健康度与降级率小节
        const collector = telemetryCollector || defaultTelemetryCollector;
        const summary = collector.getSummary();
        let healthBadge = '🟢 极佳';
        if (summary.statusLevel === 'NEEDS_ATTENTION') healthBadge = '🔴 需关注';
        else if (summary.statusLevel === 'GOOD') healthBadge = '🟡 良好';

        md += `\n**工具链运行时可观测性 (Telemetry)**:\n`;
        md += `- 综合健康度: ${healthBadge} (${summary.healthScore} 分)\n`;
        md += `- 统计样本量: ${summary.totalCalls} 次 Agent 工具调用\n`;
        md += `- API 降级率: \`${summary.degradationRate}%\` (${summary.degradedCount} 次降级)\n`;
        if (summary.recommendations.length > 0 && summary.degradationRate > 0) {
          md += `> 💡 优化建议: ${summary.recommendations[0]}\n`;
        }

        return {
          kind: 'success',
          text: md,
        };
      }

      if (trimmed === 'upgrade') {
        const info = updateChecker ? await updateChecker.check(true) : null;
        const curVer = info?.currentVersion || CURRENT_PLUGIN_VERSION;
        const latestVer = info?.latestVersion || curVer;
        const hasUpdate = info?.hasUpdate ?? false;
        const isMac = process.platform === 'darwin';
        const isWin = process.platform === 'win32';
        const platformName = isMac ? 'macOS' : isWin ? 'Windows' : 'Linux';

        let md = `### 🚀 ${PLUGIN_PACKAGE_NAME} 插件升级指南\n\n`;
        md += `- **当前运行版本**: \`v${curVer}\`\n`;
        // 当前更新源：排查「查不到新版」时（镜像同步滞后）用户需可见自己在用哪个源。
        // 优先读 checker 内存态（store 写盘失败时磁盘是旧值，活实例才是事实源），
        // 无 checker 或未初始化（sourceMode=null 的 legacy 路径）回落磁盘 store。
        const liveMode: UpdateSourceMode | null = updateChecker?.getSourceMode?.() ?? null;
        const effectiveMode: UpdateSourceMode = liveMode ?? loadUpdateSettings();
        md += `- **当前更新源**: ${describeUpdateMode(effectiveMode)}\n`;
        md += `- **官方最新版本**: \`v${latestVer}\` ${hasUpdate ? '🔥 (有可用更新)' : '✅ (已是最新)'}\n`;
        md += `- **操作系统环境**: \`${platformName} (${process.platform})\`\n`;
        md += `- **npm 仓库地址**: [${NPM_PACKAGE_URL}](${NPM_PACKAGE_URL})\n\n`;

        md += `#### 请根据你的 DSH 安装环境选择适用的升级方式：\n\n`;
        // 官方 CLI 语义：--profile 为必填参数（dsh plugin --profile <name> add <pkg>），
        // 任何不带 --profile 的形态（含 pnpm dsh plugin add）都会直接报 required option 错误。
        md += `1. **DSH 桌面版 Profile 环境升级（推荐）**:\n\`\`\`bash\ndsh plugin --profile desktop add ${PLUGIN_PACKAGE_NAME}@latest\n\`\`\`\n\n`;
        md += `2. **DSH Web / CLI 环境**（profile 名按实际环境填写）:\n\`\`\`bash\ndsh plugin --profile web add ${PLUGIN_PACKAGE_NAME}@latest\n\`\`\`\n`;
        if (isMac) {
          md += `> 💡 *macOS 提示*：若在终端找不到 \`dsh\` 命令，可直接在桌面端目录更新：\n\`\`\`bash\ncd ~/.dsh/profiles/desktop && npm install ${PLUGIN_PACKAGE_NAME}@latest --save\n\`\`\`\n\n`;
        } else {
          md += `\n`;
        }
        md += `3. **Node 全局环境升级**:\n\`\`\`bash\nnpm install -g ${PLUGIN_PACKAGE_NAME}@latest\n\`\`\`\n\n`;
        md += `> 💡 **升级后提示**：Node.js 运行时对已载入模块存在强缓存，升级后**请重启 DSH 服务以完全加载最新后端工具**。`;

        return {
          kind: 'success',
          text: md,
        };
      }

      if (trimmed === 'help') {
        return {
          kind: 'success',
          text: `### DSH GitHub Flow 帮助\n\n- \`/gh status\`: 检查当前 GitHub CLI 账号、仓库连接与插件版本\n- \`/gh upgrade\`: 检查新版本并显示全场景升级命令指引\n- \`/gh help\`: 显示此帮助信息\n\n可以在对话中直接让 Agent 操作 GitHub，如：\n- *"查看当前仓库有哪些开放的 PR"* \n- *"查看最近一次 CI 失败的原因"* \n- *"帮我给当前分支创建 PR"*`,
        };
      }

      return {
        kind: 'error',
        text: `未知命令选项: /gh ${trimmed}。可用用法: /gh status, /gh upgrade, /gh help`,
      };
    },
  });
}
