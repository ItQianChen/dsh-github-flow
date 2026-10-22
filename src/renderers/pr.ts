import { sanitizeCell, formatStateBadge, formatCiBadge, formatConflictBadge } from './common.js';
import { renderReviewRules } from '../review-rules.js';

/**
 * PR 领域渲染器：负责 PR 列表高密度表格、CI Checks、分支状态与单卡详情格式化
 */
export function renderPrMarkdown(args: any, value: any): string {
  if (!value) return '无返回内容';
  if (value.status === 'AWAITING_CONFIRMATION') {
    return [
      `> ### ${value.warning || '⚠️ 高危操作拦截警告'}`,
      `> - **影响评估**: ${value.impact || '该操作将改变远端仓库状态。'}`,
      `> - **确认指引**: ${value.requiredAction || '如确认继续，请向用户核实并在参数中附加 `confirm: true` 重新调用。'}`,
    ].join('\n');
  }
  if (typeof value.result === 'string') return value.result;
  if (typeof value.message === 'string' && !value.items) {
    const extra = value.detail || value.output;
    return `**${value.message}**` + (value.url ? `\n🔗 链接: ${value.url}` : '') + (extra ? `\n\`\`\`\n${extra}\n\`\`\`` : '');
  }

  // 1.1 PR 列表
  if (Array.isArray(value.items) && args?.action === 'list') {
    const list = value.items.filter(Boolean);
    if (list.length === 0) return '📭 当前仓库暂无匹配的 Pull Request。';
    const rows = list.map((p: any) => {
      const numLink = p.url ? `[#${p.number}](${p.url})` : `#${p.number}`;
      const badge = formatStateBadge(p.state, p.isDraft);
      const title = sanitizeCell(p.title, 55);
      const author = p.author?.login ? `@${p.author.login}` : (typeof p.author === 'string' ? `@${p.author}` : '-');
      const date = p.updatedAt ? p.updatedAt.slice(0, 10) : (p.mergedAt ? p.mergedAt.slice(0, 10) : '-');
      return `| ${numLink} | ${badge} | ${title} | ${author} | ${date} |`;
    });
    return [
      `**找到 ${list.length} 个 Pull Request:**\n`,
      '| 编号 | 状态 | 标题 | 作者 | 更新日期 |',
      '| :--- | :--- | :--- | :--- | :--- |',
      ...rows,
    ].join('\n');
  }

  // 1.2 PR CI Checks
  if (Array.isArray(value.items) && args?.action === 'checks') {
    const list = value.items.filter(Boolean);
    if (list.length === 0) return '当前 PR 暂无 CI Checks 运行记录。';
    const rows = list.map((c: any) => {
      const name = sanitizeCell(c.name, 40);
      // bucket 是 gh pr checks 的分类字段（pass/fail/pending/skipping/cancel），
      // 优先于 state 呈现；state（SUCCESS/FAILURE/...）作为兜底——渲染器同步
      // Issue #3 修复：旧 conclusion/detailsUrl 字段在 gh 中不存在。
      const badge = formatCiBadge(c.state, c.bucket);
      const url = c.link ? `[查看详情](${c.link})` : '-';
      const wf = c.workflow ? sanitizeCell(c.workflow, 24) : '-';
      return `| ${name} | ${badge} | ${wf} | ${url} |`;
    });
    return [
      `**CI 检查结果 (${list.length} 项):**\n`,
      '| 检查项名称 | 结论 / 状态 | 工作流 | 详情链接 |',
      '| :--- | :--- | :--- | :--- |',
      ...rows,
    ].join('\n');
  }

  // 1.3 PR Status (冲突与相关状态)
  if (args?.action === 'status') {
    const created = Array.isArray(value.createdBy) ? value.createdBy : [];
    const review = Array.isArray(value.needsReview) ? value.needsReview : [];
    const parts: string[] = ['### 🔀 当前分支关联 PR 状态\n'];

    if (created.length > 0) {
      parts.push('**由我发起的 PR:**\n| 编号 | 状态 | 冲突检测 | 标题 |', '| :--- | :--- | :--- | :--- |');
      for (const p of created) {
        const link = p.url ? `[#${p.number}](${p.url})` : `#${p.number}`;
        parts.push(`| ${link} | ${formatStateBadge(p.state)} | ${formatConflictBadge(p.mergeStateStatus)} | ${sanitizeCell(p.title, 50)} |`);
      }
    } else {
      parts.push('当前分支未检测到本人发起的活跃 PR。');
    }

    if (review.length > 0) {
      parts.push('\n**待我审查的 PR:**\n| 编号 | 状态 | 标题 |', '| :--- | :--- | :--- |');
      for (const p of review) {
        const link = p.url ? `[#${p.number}](${p.url})` : `#${p.number}`;
        parts.push(`| ${link} | ${formatStateBadge(p.state)} | ${sanitizeCell(p.title, 50)} |`);
      }
    }
    return parts.join('\n');
  }

  // 1.4 PR View 单卡详情
  if (args?.action === 'view' && value.number) {
    const link = value.url ? `[#${value.number}](${value.url})` : `#${value.number}`;
    const badge = formatStateBadge(value.state, value.isDraft);
    const author = value.author?.login ? `@${value.author.login}` : '-';
    /*
     * 分支名会移动（force-push / 新提交），拿它当审查锚点等于「我审的到底是哪一版」
     * 永远说不清。`branch@a1b2c3d` 是 git 世界的通用写法：7 位足够人读，
     * 完整 SHA 仍在 JSON 里（headRefOid），需要精确引用时取它。
     * 老服务端 / 老 gh 没有 headRefOid 时只显示分支名，绝不渲染 `@undefined`。
     */
    const headSha = typeof value.headRefOid === 'string' && value.headRefOid.length >= 7
      ? `@${value.headRefOid.slice(0, 7)}`
      : '';
    const lines = [
      `### ${badge} ${value.title} (${link})`,
      `- **作者**: ${author} | **分支**: \`${value.headRefName || '-'}${headSha}\` → \`${value.baseRefName || 'main'}\``,
      `- **合并判定**: ${formatConflictBadge(value.mergeable || value.mergeStateStatus)} | **审查判定**: ${value.reviewDecision || 'NONE'}`,
    ];
    if (Array.isArray(value.labels) && value.labels.length > 0) {
      lines.push(`- **标签**: ${value.labels.map((l: any) => `\`${l.name || l}\``).join(' ')}`);
    }
    // 清单截断必须让 Agent 也知道（人看 UI、Agent 看这里，同一事实两处都要说）
    if (typeof value.changedFiles === 'number' && Array.isArray(value.files) && value.files.length < value.changedFiles) {
      lines.push(`- **变动文件**: 仅列出前 ${value.files.length} / ${value.changedFiles} 个（gh 单次最多返回 100 条）`);
    }
    if (value.body) {
      lines.push('\n**正文说明:**\n```markdown\n' + sanitizeCell(value.body, 300) + '\n```');
    }
    /*
     * 仓库审查规则（AGENTS.md）：人看 UI、Agent 看这里，同一事实两处都要说。
     * 只有工具确实注入时才渲染（`reviewRules` 键不存在 = 工作区没有规则文件，
     * 此时不得输出一个空章节让人以为「规则为空」）。
     *
     * 渲染逻辑复用 `review-rules.ts` 的 `renderReviewRules`——同一条规则只能有
     * 一处实现，否则「工具返回的 JSON」与「Markdown 输出」迟早会漂移。
     */
    const rulesMd = renderReviewRules(value.reviewRules);
    if (rulesMd) lines.push(rulesMd);
    return lines.join('\n');
  }

  // 兜底降级
  return JSON.stringify(value, null, 2);
}
