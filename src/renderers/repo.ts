import { sanitizeCell, formatStateBadge, appendDegradedNote } from './common.js';

/**
 * Repo 领域渲染器：负责仓库卡片概览、README 预览、代码/仓库/Issue/Commit 跨仓检索、免 Clone 文件与目录清单渲染
 */
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
      `> ⭐ **Stars**: ${stars} | 🍴 **Forks**: ${forks} | ⎇ **默认分支**: \`${branch}\``,
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

  // 4.4 Issue/PR 搜索列表（search_issues / search_prs 共用，字段同构）
  if (Array.isArray(value.items) && (args?.action === 'search_issues' || args?.action === 'search_prs')) {
    if (value.items.length === 0) return '未找到匹配的结果。';
    const kind = args.action === 'search_prs' ? 'PR' : 'Issue';
    const rows = value.items.map((it: any) => {
      const num = it.number ?? '-';
      const repo = it.repository?.nameWithOwner || it.repository?.fullName || '-';
      const link = it.url ? `[#${num}](${it.url})` : `#${num}`;
      const badge = formatStateBadge(it.state, it.isDraft);
      const author = it.author?.login || '-';
      const date = it.updatedAt ? String(it.updatedAt).slice(0, 10) : '-';
      return `| ${link} | ${sanitizeCell(it.title, 45)} | ${badge} | ${repo} | ${author} | ${date} |`;
    });
    return [
      `**${kind} 检索结果 (${value.items.length} 条):**\n`,
      '| 编号 | 标题 | 状态 | 仓库 | 作者 | 更新日期 |',
      '| :--- | :--- | :--- | :--- | :--- | :--- |',
      ...rows,
    ].join('\n');
  }

  // 4.5 Commit 搜索列表（嵌套 commit.commit.message 取首行）
  if (Array.isArray(value.items) && args?.action === 'search_commits') {
    if (value.items.length === 0) return '未找到匹配的提交。';
    const rows = value.items.map((c: any) => {
      const sha = `\`${String(c.sha || '').slice(0, 7)}\``;
      const msg = sanitizeCell(String(c.commit?.message || '').split('\n')[0], 50);
      const author = c.commit?.author?.name || c.author?.login || '-';
      const repo = c.repository?.fullName || '-';
      return `| ${sha} | ${msg} | ${author} | ${repo} |`;
    });
    return [
      `**提交检索结果 (${value.items.length} 条):**\n`,
      '| SHA | 提交信息 | 作者 | 仓库 |',
      '| :--- | :--- | :--- | :--- |',
      ...rows,
    ].join('\n');
  }

  // 4.6 目录清单（read_dir：dir 置顶 + size 人性化；mode 八进制是 Git 内部语义不展示）
  if (args?.action === 'read_dir' && Array.isArray(value.items)) {
    if (value.items.length === 0) return `**${value.path || '/'}** 为空目录。` + appendDegradedNote(value);
    const sorted = [...value.items].sort((a: any, b: any) => (a.type === b.type ? String(a.name).localeCompare(String(b.name)) : a.type === 'dir' ? -1 : 1));
    const rows = sorted.map((e: any) => {
      const icon = e.type === 'dir' ? '📁' : '📄';
      const size = e.type === 'dir' ? '-' : (typeof e.size === 'number' ? (e.size > 1024 ? `${(e.size / 1024).toFixed(1)}KB` : `${e.size}B`) : '-');
      return `| ${icon} \`${sanitizeCell(e.name, 60)}\` | ${size} |`;
    });
    return [
      `**目录 ${value.path || '/'}（${value.items.length} 项）:**\n`,
      '| 名称 | 大小 |',
      '| :--- | :--- |',
      ...rows,
      appendDegradedNote(value),
    ].filter((l) => l !== '').join('\n');
  }

  // 4.7 文件内容（read_file：代码块 + 元信息行）
  if (args?.action === 'read_file' && typeof value.content === 'string') {
    const ext = (value.path || '').split('.').pop() || '';
    const size = typeof value.size === 'number' ? (value.size > 1024 ? `${(value.size / 1024).toFixed(1)}KB` : `${value.size}B`) : '-';
    return [
      `**📄 \`${value.path}\`** (${size}${value.ref ? ` @ ${value.ref}` : ''})\n`,
      '```' + ext,
      value.content,
      '```',
      appendDegradedNote(value),
    ].filter((l) => l !== '').join('\n');
  }

  // 兜底降级
  return JSON.stringify(value, null, 2);
}
