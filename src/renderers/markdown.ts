/**
 * DSH GitHub Flow - Native Markdown 格式化渲染引擎
 *
 * 核心目标：
 * 1. 终结机械多行 JSON 输出，为列表和详情产出高密度 Markdown 表格与卡片；
 * 2. 节省 70%+ 的会话上下文 Token，极大加速长对话推理速度；
 * 3. 嵌入可点击超链接与直观的状态药丸 Emoji，提升人类与模型阅读体验；
 * 4. 严谨防御 Markdown 表格竖线破坏、缺失值回退与异常对象降级。
 */

/** 安全清洗表格单元格文本：转义竖线，压缩换行，限制最大长度 */
export function sanitizeCell(text: any, maxLen = 80): string {
  if (text === null || text === undefined || text === '') return '-';
  const clean = String(text)
    .replace(/\|/g, '\\|')
    .replace(/[\r\n]+/g, ' ')
    .trim();
  if (clean.length > maxLen) {
    return clean.slice(0, maxLen - 1) + '…';
  }
  return clean || '-';
}

/** 格式化 PR / Issue 状态药丸徽章 */
export function formatStateBadge(state?: string, isDraft?: boolean): string {
  if (!state) return '-';
  const s = state.toUpperCase();
  if (isDraft) return '⚪ DRAFT';
  if (s === 'OPEN') return '🟢 OPEN';
  if (s === 'MERGED') return '🟣 MERGED';
  if (s === 'CLOSED') return '🔴 CLOSED';
  return s;
}

/**
 * 格式化 CI 工作流状态徽章。
 * 第二参数按调用域语义不同：run 域传 conclusion（success/failure/cancelled/skipped），
 * pr checks 域传 bucket（pass/fail/pending/skipping/cancel）——取值族不同但映射到
 * 同一组徽章；state 参数兜底（in_progress/queued 等进行中态）。
 */
export function formatCiBadge(status?: string, conclusion?: string): string {
  const conc = (conclusion || '').toLowerCase();
  const st = (status || '').toLowerCase();
  if (conc === 'success' || conc === 'pass') return '✅ ' + conc;
  if (conc === 'failure' || conc === 'fail') return '❌ ' + conc;
  if (conc === 'cancelled' || conc === 'cancel') return '🚫 ' + conc;
  if (conc === 'skipped' || conc === 'skipping') return '⏭️ ' + conc;
  if (conc === 'pending') return '⏳ pending';
  if (st === 'in_progress') return '⏳ running';
  if (st === 'queued') return '⏱️ queued';
  return conc || st || '-';
}

/** 格式化合并冲突状态 */
export function formatConflictBadge(status?: string): string {
  if (!status) return '-';
  const s = status.toUpperCase();
  if (s === 'CLEAN') return '✅ CLEAN';
  if (s === 'DIRTY' || s === 'CONFLICT') return '⚠️ CONFLICT';
  if (s === 'BLOCKED') return '⛔ BLOCKED';
  return s;
}

// -------------------------------------------------------------
// 1. PR 渲染器
// -------------------------------------------------------------
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
    const lines = [
      `### ${badge} ${value.title} (${link})`,
      `- **作者**: ${author} | **分支**: \`${value.headRefName || '-'}\` → \`${value.baseRefName || 'main'}\``,
      `- **合并判定**: ${formatConflictBadge(value.mergeable || value.mergeStateStatus)} | **审查判定**: ${value.reviewDecision || 'NONE'}`,
    ];
    if (Array.isArray(value.labels) && value.labels.length > 0) {
      lines.push(`- **标签**: ${value.labels.map((l: any) => `\`${l.name || l}\``).join(' ')}`);
    }
    if (value.body) {
      lines.push('\n**正文说明:**\n```markdown\n' + sanitizeCell(value.body, 300) + '\n```');
    }
    return lines.join('\n');
  }

  // 兜底降级
  return JSON.stringify(value, null, 2);
}

// -------------------------------------------------------------
// 2. Issue 渲染器
// -------------------------------------------------------------
export function renderIssueMarkdown(args: any, value: any): string {
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

  // 2.1 Issue 列表
  if (Array.isArray(value.items) && args?.action === 'list') {
    const list = value.items.filter(Boolean);
    if (list.length === 0) return '📭 当前仓库暂无匹配的 Issue。';
    const rows = list.map((i: any) => {
      const numLink = i.url ? `[#${i.number}](${i.url})` : `#${i.number}`;
      const badge = formatStateBadge(i.state);
      const title = sanitizeCell(i.title, 60);
      const labels = Array.isArray(i.labels) && i.labels.length > 0
        ? i.labels.map((l: any) => `\`${sanitizeCell(l.name || l, 15)}\``).join(' ')
        : '-';
      const author = i.author?.login ? `@${i.author.login}` : (typeof i.author === 'string' ? `@${i.author}` : '-');
      const date = i.updatedAt ? i.updatedAt.slice(0, 10) : '-';
      return `| ${numLink} | ${badge} | ${title} | ${labels} | ${author} | ${date} |`;
    });
    return [
      `**找到 ${list.length} 个 Issue:**\n`,
      '| 编号 | 状态 | 标题 | 标签 | 作者 | 更新日期 |',
      '| :--- | :--- | :--- | :--- | :--- | :--- |',
      ...rows,
    ].join('\n');
  }

  // 2.2 Issue View 详情
  if (args?.action === 'view' && value.number) {
    const link = value.url ? `[#${value.number}](${value.url})` : `#${value.number}`;
    const badge = formatStateBadge(value.state);
    const author = value.author?.login ? `@${value.author.login}` : '-';
    const lines = [
      `### ${badge} ${value.title} (${link})`,
      `- **作者**: ${author} | **更新时间**: ${value.updatedAt?.slice(0, 16) || '-'}`,
    ];
    if (Array.isArray(value.labels) && value.labels.length > 0) {
      lines.push(`- **标签**: ${value.labels.map((l: any) => `\`${l.name || l}\``).join(' ')}`);
    }
    if (Array.isArray(value.assignees) && value.assignees.length > 0) {
      lines.push(`- **指派人**: ${value.assignees.map((a: any) => `@${a.login || a}`).join(' ')}`);
    }
    if (value.body) {
      lines.push('\n**议题正文:**\n```markdown\n' + sanitizeCell(value.body, 300) + '\n```');
    }
    // 图片附件清单（view 附带 URL 清单，view_images 按需下载查看）
    if (Array.isArray(value.images) && value.images.length > 0) {
      lines.push(`- **📎 图片附件 (${value.images.length}):** 调用 \`github_issue(action: 'view_images', issue_number: ${value.number})\` 可下载查看`);
    }
    return lines.join('\n');
  }

  // 兜底降级
  return JSON.stringify(value, null, 2);
}

// -------------------------------------------------------------
// 3. Workflow Run 渲染器
// -------------------------------------------------------------
export function renderRunMarkdown(args: any, value: any): string {
  if (!value) return '无返回数据';
  if (typeof value.result === 'string') return value.result;
  if (typeof value.message === 'string' && !value.items) {
    return `**${value.message}**` + (value.output ? `\n\`\`\`\n${value.output}\n\`\`\`` : '');
  }

  // 3.1 Run 列表
  if (Array.isArray(value.items) && args?.action === 'list') {
    const list = value.items.filter(Boolean);
    if (list.length === 0) return '📭 暂无匹配的工作流运行记录。';
    const rows = list.map((r: any) => {
      const idLink = r.url ? `[${r.databaseId}](${r.url})` : `\`${r.databaseId}\``;
      const badge = formatCiBadge(r.status, r.conclusion);
      const name = sanitizeCell(r.name, 35);
      const branch = r.headBranch ? `\`${r.headBranch}\`` : '-';
      const event = r.event || '-';
      const time = r.createdAt ? r.createdAt.slice(0, 16).replace('T', ' ') : '-';
      return `| ${idLink} | ${badge} | ${name} | ${branch} | ${event} | ${time} |`;
    });
    return [
      `**最近 ${list.length} 次工作流运行:**\n`,
      '| Run ID | 结论 / 状态 | 工作流名称 | 触发分支 | 触发事件 | 运行时间 |',
      '| :--- | :--- | :--- | :--- | :--- | :--- |',
      ...rows,
    ].join('\n');
  }

  // 3.2 Run View 详情
  if (args?.action === 'view' && value.databaseId) {
    const idLink = value.url ? `[${value.databaseId}](${value.url})` : `\`${value.databaseId}\``;
    const badge = formatCiBadge(value.status, value.conclusion);
    const lines = [
      `### 工作流: ${value.name} (Run: ${idLink})`,
      `- **状态**: ${badge}`,
    ];
    if (Array.isArray(value.jobs) && value.jobs.length > 0) {
      lines.push('\n**Jobs 步骤明细:**\n| Job 名称 | 结论 / 状态 | 详情 |', '| :--- | :--- | :--- |');
      for (const j of value.jobs) {
        lines.push(`| ${sanitizeCell(j.name, 30)} | ${formatCiBadge(j.status, j.conclusion)} | ${j.url ? `[链接](${j.url})` : '-'} |`);
      }
    }
    return lines.join('\n');
  }

  // 兜底降级
  return JSON.stringify(value, null, 2);
}

// -------------------------------------------------------------
// 4. Repo 渲染器
// -------------------------------------------------------------
export function renderRepoMarkdown(args: any, value: any): string {
  if (!value) return '无返回内容';
  if (typeof value.result === 'string') return value.result;

  // 4.0 README 预览（文本截断版 + 图片清单）——必须在 message 早退分支之前：
  // readme 返回同时带 message 与 readme 字段，先判 readme 才能渲染预览而非一行摘要
  if (args?.action === 'readme' && typeof value.readme === 'string') {
    const lines = [`### 📖 README 预览`, '', '```markdown', value.readme, '```'];
    if (Array.isArray(value.images) && value.images.length > 0) {
      lines.push('', `**📎 图片清单 (${value.images.length}):** 可用 \`image_urls\` 参数下载指定图片（留空下载全部）`);
      value.images.slice(0, 8).forEach((u: string, i: number) => lines.push(`${i + 1}. ${u}`));
      if (value.images.length > 8) lines.push(`…共 ${value.images.length} 个`);
    }
    return lines.join('\n');
  }

  if (typeof value.message === 'string' && !value.items) {
    return `**${value.message}**` + (value.output ? `\n\`\`\`\n${value.output}\n\`\`\`` : '');
  }

  // 4.1 Repo View 概览卡片
  if (args?.action === 'view' && value.nameWithOwner) {
    const link = value.url ? `[${value.nameWithOwner}](${value.url})` : `**${value.nameWithOwner}**`;
    const stars = value.stargazerCount ?? value.stars ?? 0;
    const forks = value.forkCount ?? value.forks ?? 0;
    const branch = value.defaultBranchRef?.name || value.defaultBranch || 'main';
    const lines = [
      `### 📦 ${link}`,
      `> ⭐ **Stars**: ${stars} | 🍴 **Forks**: ${forks} | 🌿 **默认分支**: \`${branch}\``,
      value.description ? `\n${value.description}\n` : '',
    ];
    if (value.licenseInfo?.name || value.licenseInfo?.key) {
      lines.push(`- **开源协议**: \`${value.licenseInfo.name || value.licenseInfo.key}\``);
    }
    if (Array.isArray(value.repositoryTopics) && value.repositoryTopics.length > 0) {
      lines.push(`- **仓库标签 (Topics)**: ${value.repositoryTopics.map((t: any) => `\`${t.name || t}\``).join(' ')}`);
    }
    return lines.filter(Boolean).join('\n');
  }

  // 4.2 Repo Search 仓库搜索列表
  if (Array.isArray(value.items) && args?.action === 'search_repos') {
    if (value.items.length === 0) return '未找到匹配的仓库。';
    const rows = value.items.map((r: any) => {
      const name = r.fullName ? `[${r.fullName}](https://github.com/${r.fullName})` : '-';
      const stars = r.stargazersCount ?? '-';
      const desc = sanitizeCell(r.description, 45);
      const date = r.updatedAt ? r.updatedAt.slice(0, 10) : '-';
      return `| ${name} | ⭐ ${stars} | ${desc} | ${date} |`;
    });
    return [
      `**仓库检索结果 (${value.items.length} 个):**\n`,
      '| 仓库全名 | Stars | 描述 | 更新日期 |',
      '| :--- | :--- | :--- | :--- |',
      ...rows,
    ].join('\n');
  }

  // 4.3 Code Search 代码搜索列表
  if (Array.isArray(value.items) && args?.action === 'search_code') {
    if (value.items.length === 0) return '未找到匹配的代码片段。';
    const rows = value.items.map((c: any) => {
      const repo = c.repository?.fullName || '-';
      const path = sanitizeCell(c.path, 50);
      return `| \`${path}\` | ${repo} |`;
    });
    return [
      `**代码检索结果 (${value.items.length} 处匹配):**\n`,
      '| 文件路径 | 所属仓库 |',
      '| :--- | :--- |',
      ...rows,
    ].join('\n');
  }

  // 兜底降级
  return JSON.stringify(value, null, 2);
}

// -------------------------------------------------------------
// 5. Release 渲染器
// -------------------------------------------------------------
export function formatReleaseBadge(isDraft?: boolean, isPrerelease?: boolean): string {
  if (isDraft) return '⚪ DRAFT';
  if (isPrerelease) return '🍼 PRE';
  return '✅ STABLE';
}

export function renderReleaseMarkdown(args: any, value: any): string {
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

  // 5.1 Release 列表
  if (Array.isArray(value.items) && args?.action === 'list') {
    const list = value.items.filter(Boolean);
    if (list.length === 0) return '📭 当前仓库暂无任何 Release。';
    const rows = list.map((r: any) => {
      const tag = r.tagName ? `\`${r.tagName}\`` : '-';
      const name = sanitizeCell(r.name || r.tagName, 40);
      const badge = formatReleaseBadge(r.isDraft, r.isPrerelease);
      const date = (r.publishedAt || r.createdAt || '').slice(0, 10) || '-';
      return `| ${tag} | ${badge} | ${name} | ${date} |`;
    });
    return [
      `**最近 ${list.length} 个 Release:**\n`,
      '| Tag | 类型 | 名称 | 发布日期 |',
      '| :--- | :--- | :--- | :--- |',
      ...rows,
    ].join('\n');
  }

  // 5.2 Release 详情卡片
  if (args?.action === 'view' && value.tagName) {
    const badge = formatReleaseBadge(value.isDraft, value.isPrerelease);
    const lines = [
      `### 🏷️ Release \`${value.tagName}\` ${badge}`,
    ];
    // 元信息压缩成一段（硬换行分隔），避免逐行 filter 空串把段落分隔也滤掉。
    // Markdown 的列表/段落渲染依赖空行：若标题、资产列表、正文之间没有空行，
    // 列表语法会失效并连成一段——所以这里改为「分段数组 + 空行 join」。
    const meta: string[] = [];
    if (value.name) meta.push(`**${value.name}**`);
    if (value.url) meta.push(`🔗 ${value.url}`);
    if (value.publishedAt) meta.push(`📅 发布于 ${value.publishedAt.slice(0, 10)}`);
    if (meta.length > 0) lines.push(meta.join('  \n'));
    if (Array.isArray(value.assets) && value.assets.length > 0) {
      const assetLines = value.assets.map((a: any) => {
        const size = typeof a.size === 'number' ? ` (${(a.size / 1024).toFixed(1)} KB)` : '';
        return `- \`${a.name || '-'}\`${size}`;
      });
      lines.push(`**📎 附属资产 (${value.assets.length}):**\n${assetLines.join('\n')}`);
    }
    if (value.body) {
      // 发版说明可能非常长，只保留前 600 字符做快速预览，避免单次调用撑爆上下文
      const preview = value.body.length > 600 ? value.body.slice(0, 600) + '\n…(已截断，完整内容见 Release 页面)' : value.body;
      lines.push(`**📝 发版说明摘要:**\n\n${preview}`);
    }
    return lines.join('\n\n');
  }

  // 兜底降级
  return JSON.stringify(value, null, 2);
}

// -------------------------------------------------------------
// 6. Skill 渲染器
// -------------------------------------------------------------
export function renderSkillMarkdown(args: any, value: any): string {
  if (!value) return '无返回内容';
  if (value.status === 'AWAITING_CONFIRMATION') {
    return [
      `> ### ${value.warning || '⚠️ 操作确认拦截'}`,
      `> - **影响评估**: ${value.impact || ''}`,
      `> - **确认指引**: ${value.requiredAction || '如确认继续，请在参数中附加 `confirm: true` 重新调用。'}`,
    ].join('\n');
  }
  if (typeof value.result === 'string') return value.result;
  if (typeof value.message === 'string' && !value.items) {
    const extra = value.detail || value.output;
    return `**${value.message}**` + (extra ? `\n\`\`\`\n${extra}\n\`\`\`` : '');
  }

  // 6.1 Skill 检索列表
  if (Array.isArray(value.items) && args?.action === 'search') {
    const list = value.items.filter(Boolean);
    if (list.length === 0) return '📭 未检索到匹配的 Agent Skill。';
    const rows = list.map((s: any) => {
      const name = s.skillName ? `\`${s.skillName}\`` : '-';
      const repo = s.repo ? `[${s.repo}](https://github.com/${s.repo})` : '-';
      const stars = typeof s.stars === 'number' ? `⭐ ${s.stars}` : '-';
      const desc = sanitizeCell(s.description, 50);
      return `| ${name} | ${repo} | ${stars} | ${desc} |`;
    });
    return [
      `**Skills 检索结果 (${list.length} 个):**\n`,
      '| Skill | 仓库 | Stars | 描述 |',
      '| :--- | :--- | :--- | :--- |',
      ...rows,
    ].join('\n');
  }

  // 6.2 已安装 Skills 列表
  if (Array.isArray(value.items) && args?.action === 'list') {
    const list = value.items.filter(Boolean);
    if (list.length === 0) return '📭 当前环境尚未安装任何 Agent Skill。';
    const rows = list.map((s: any) => {
      const name = s.skillName ? `\`${s.skillName}\`` : '-';
      const ver = s.version ? String(s.version) : '-';
      const scope = s.scope ? String(s.scope) : '-';
      const source = s.sourceURL ? `[来源](${s.sourceURL})` : (s.path ? `\`${sanitizeCell(s.path, 40)}\`` : '-');
      return `| ${name} | ${ver} | ${scope} | ${source} |`;
    });
    return [
      `**已安装 ${list.length} 个 Agent Skill:**\n`,
      '| Skill | 版本 | 范围 | 来源 |',
      '| :--- | :--- | :--- | :--- |',
      ...rows,
    ].join('\n');
  }

  // 兜底降级
  return JSON.stringify(value, null, 2);
}
