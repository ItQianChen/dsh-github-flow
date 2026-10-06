import type { GhExecutor } from '../executor.js';

export function registerGhCommand(commandsService: any, executor: GhExecutor) {
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

        let md = `### GitHub 集成状态\n\n`;
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

        return {
          kind: 'success',
          text: md,
        };
      }

      if (trimmed === 'help') {
        return {
          kind: 'success',
          text: `### DSH GitHub Flow 帮助\n\n- \`/gh status\`: 检查当前 GitHub CLI 账号与仓库连接\n- \`/gh help\`: 显示此帮助信息\n\n可以在对话中直接让 Agent 操作 GitHub，如：\n- *"查看当前仓库有哪些开放的 PR"* \n- *"查看最近一次 CI 失败的原因"* \n- *"帮我给当前分支创建 PR"*`,
        };
      }

      return {
        kind: 'error',
        text: `未知命令选项: /gh ${trimmed}。可用用法: /gh status, /gh help`,
      };
    },
  });
}
