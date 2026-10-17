import { CURRENT_PLUGIN_VERSION, PLUGIN_PACKAGE_NAME, NPM_PACKAGE_URL } from '../version.js';
import { loadUpdateSettings, describeUpdateMode } from '../update-settings.js';
import { defaultTelemetryCollector } from '../telemetry.js';
/**
 * 构建 GitHub 状态大盘与诊断报告 Markdown
 */
async function buildStatusReport(executor, updateChecker, telemetryCollector) {
    // 人类显式诊断必须绕过缓存：用户敲 /gh 往往正是为了确认
    // 「我刚 gh auth login 到底成没成」，给他 30 秒前的缓存等于答非所问。
    const auth = await executor.checkAuth(undefined, true);
    const repo = await executor.getRepoMetadata();
    const updateInfo = updateChecker?.getQuickStatus();
    let md = `### GitHub 集成状态\n\n`;
    // 若检测到新版本，在最上方展示醒目的升级指引横幅
    if (updateInfo?.hasUpdate) {
        md += `> 🚀 **发现新版本 v${updateInfo.latestVersion}**（当前为 \`v${updateInfo.currentVersion}\`）\n`;
        md += `> 输入 \`/gh-upgrade\` 查看升级指引，或在终端执行：\`${updateInfo.upgradeCommand}\`\n\n`;
    }
    md += `- **插件版本**: \`v${updateInfo?.currentVersion || CURRENT_PLUGIN_VERSION}\`\n`;
    if (auth.loggedIn) {
        md += `- **登录账号**: \`${auth.user || '已登录'}\`\n`;
        md += `- **授权作用域**: ${auth.scopes?.map((s) => `\`${s}\``).join(', ') || '标准权限'}\n`;
    }
    else {
        md += `- **登录状态**: ❌ 未登录 GitHub\n`;
        md += `> 提示：请在系统终端执行 \`gh auth login\` 进行登录。\n`;
    }
    if (repo) {
        md += `\n**当前关联仓库**:\n`;
        md += `- 仓库名: [${repo.nameWithOwner}](${repo.url})\n`;
        md += `- 默认分支: \`${repo.defaultBranch}\`\n`;
        if (repo.description)
            md += `- 简介: ${repo.description}\n`;
    }
    else {
        md += `\n*当前目录尚未关联 Git 远程仓库或未托管在 GitHub。*\n`;
    }
    // 遥测运行时健康度与降级率小节
    const collector = telemetryCollector || defaultTelemetryCollector;
    const summary = collector.getSummary();
    let healthBadge = '🟢 极佳';
    if (summary.statusLevel === 'NEEDS_ATTENTION')
        healthBadge = '🔴 需关注';
    else if (summary.statusLevel === 'GOOD')
        healthBadge = '🟡 良好';
    md += `\n**工具链运行时可观测性 (Telemetry)**:\n`;
    md += `- 综合健康度: ${healthBadge} (${summary.healthScore} 分)\n`;
    md += `- 统计样本量: ${summary.totalCalls} 次 Agent 工具调用\n`;
    md += `- API 降级率: \`${summary.degradationRate}%\` (${summary.degradedCount} 次降级)\n`;
    if (summary.recommendations.length > 0 && summary.degradationRate > 0) {
        md += `> 💡 优化建议: ${summary.recommendations[0]}\n`;
    }
    md += `\n> 💡 **快捷指令指引**: 可直接输入 \`/gh-upgrade\` 检查组件更新，输入 \`/gh-help\` 查看 Agent 协作范例。`;
    return md;
}
/**
 * 构建插件版本升级指南 Markdown
 */
async function buildUpgradeReport(updateChecker) {
    const info = updateChecker ? await updateChecker.check(true) : null;
    const curVer = info?.currentVersion || CURRENT_PLUGIN_VERSION;
    const latestVer = info?.latestVersion || curVer;
    const hasUpdate = info?.hasUpdate ?? false;
    const isMac = process.platform === 'darwin';
    const isWin = process.platform === 'win32';
    const platformName = isMac ? 'macOS' : isWin ? 'Windows' : 'Linux';
    let md = `### 🚀 ${PLUGIN_PACKAGE_NAME} 插件升级指南\n\n`;
    md += `- **当前运行版本**: \`v${curVer}\`\n`;
    // 当前更新源：排查「查不到新版」时用户需可见自己在用哪个源
    const liveMode = updateChecker?.getSourceMode?.() ?? null;
    const effectiveMode = liveMode ?? loadUpdateSettings();
    md += `- **当前更新源**: ${describeUpdateMode(effectiveMode)}\n`;
    md += `- **官方最新版本**: \`v${latestVer}\` ${hasUpdate ? '🔥 (有可用更新)' : '✅ (已是最新)'}\n`;
    md += `- **操作系统环境**: \`${platformName} (${process.platform})\`\n`;
    md += `- **npm 仓库地址**: [${NPM_PACKAGE_URL}](${NPM_PACKAGE_URL})\n\n`;
    md += `#### 请根据你的 DSH 安装环境选择适用的升级方式：\n\n`;
    md += `1. **DSH 桌面版 Profile 环境升级（推荐）**:\n\`\`\`bash\ndsh plugin --profile desktop add ${PLUGIN_PACKAGE_NAME}@latest\n\`\`\`\n\n`;
    md += `2. **DSH Web / CLI 环境**（profile 名按实际环境填写）:\n\`\`\`bash\ndsh plugin --profile web add ${PLUGIN_PACKAGE_NAME}@latest\n\`\`\`\n`;
    if (isMac) {
        md += `> 💡 *macOS 提示*：若在终端找不到 \`dsh\` 命令，可直接在桌面端目录更新：\n\`\`\`bash\ncd ~/.dsh/profiles/desktop && npm install ${PLUGIN_PACKAGE_NAME}@latest --save\n\`\`\`\n\n`;
    }
    else {
        md += `\n`;
    }
    md += `3. **Node 全局环境升级**:\n\`\`\`bash\nnpm install -g ${PLUGIN_PACKAGE_NAME}@latest\n\`\`\`\n\n`;
    md += `> 💡 **升级后提示**：Node.js 运行时对已载入模块存在强缓存，升级后**请重启 DSH 服务以完全加载最新后端工具**。`;
    return md;
}
/**
 * 构建使用帮助与 Agent 提示词范例 Markdown
 */
function buildHelpReport() {
    return [
        '### 🧭 DSH GitHub Flow 快捷指令帮助\n',
        '- `/gh`：查看当前 GitHub CLI 账号认证状态、关联仓库与运行时健康度（直接回车即可）',
        '- `/gh-upgrade`：检查新版本并输出针对当前系统的最佳升级命令',
        '- `/gh-help`：显示此使用指南与 Agent 对话范例\n',
        '*(提示：熟练用户亦可使用二级语法，如 `/gh upgrade`、`/gh status`)*\n',
        '#### 可以在对话框直接让 Agent 操作 GitHub，例如：',
        '- *"帮我看看今天在 GitHub 上有哪些需要我处理的事情？"*',
        '- *"查看当前仓库有哪些开放的 PR，审查 PR #12 的代码差异"*',
        '- *"查看最近一次 CI 失败的原因并尝试自动修复"*',
        '- *"帮我给当前分支创建一个 PR 并附带改动说明"*',
        '- *"在当前仓库发起一个新的 RFC 讨论方案"*',
    ].join('\n');
}
/**
 * 注册人类 Slash 快捷指令集
 * 采用扁平化一级指令 + 二级参数容错双轨机制，消除用户“敲了 /gh 不会加参数”的交互盲区
 */
export function registerGhCommand(commandsService, executor, updateChecker, telemetryCollector) {
    if (!commandsService || typeof commandsService.register !== 'function')
        return;
    // 1. 主指令 /gh（默认直接回车输出状态，同时兼容 /gh status, /gh upgrade, /gh help 及常见别名）
    commandsService.register({
        name: 'gh',
        description: '查看 GitHub 账号状态、关联仓库与运行时健康度（直接回车即可执行）',
        async handler({ rawInput }) {
            const trimmed = (rawInput || '').trim().toLowerCase();
            // 智能容错：无参数、status、info、auth 均直接直出状态大盘
            if (!trimmed || trimmed === 'status' || trimmed === 'info' || trimmed === 'auth' || trimmed === 'check') {
                return {
                    kind: 'success',
                    text: await buildStatusReport(executor, updateChecker, telemetryCollector),
                };
            }
            // 二级 upgrade / update 别名容错
            if (trimmed === 'upgrade' || trimmed === 'update' || trimmed === 'up' || trimmed === 'version') {
                return {
                    kind: 'success',
                    text: await buildUpgradeReport(updateChecker),
                };
            }
            // 二级 help / ? 别名容错
            if (trimmed === 'help' || trimmed === 'h' || trimmed === '?') {
                return {
                    kind: 'success',
                    text: buildHelpReport(),
                };
            }
            return {
                kind: 'error',
                text: `未知命令选项: /gh ${rawInput}。可用快捷指令: /gh（查看状态）、/gh-upgrade（检查升级）、/gh-help（帮助）。`,
            };
        },
    });
    // 2. 扁平化一级指令 /gh-upgrade（下拉菜单一键可见，无需手动输入空格与子命令）
    commandsService.register({
        name: 'gh-upgrade',
        description: '检查插件新版本并查看一键自动升级指引',
        async handler() {
            return {
                kind: 'success',
                text: await buildUpgradeReport(updateChecker),
            };
        },
    });
    // 3. 扁平化一级指令 /gh-help（下拉菜单一键可见，查看指南与 Agent 提示词范例）
    commandsService.register({
        name: 'gh-help',
        description: '查看 GitHub 协作帮助与 Agent 提示词范例',
        async handler() {
            return {
                kind: 'success',
                text: buildHelpReport(),
            };
        },
    });
}
