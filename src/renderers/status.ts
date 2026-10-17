import { sanitizeCell } from './common.js';
import type { TelemetrySummary } from '../telemetry.js';

export interface StatusSectionItem {
  repo?: string;
  number?: string;
  title?: string;
  detail?: string;
  raw: string;
}

export interface ParsedStatusReport {
  assignedIssues: StatusSectionItem[];
  assignedPrs: StatusSectionItem[];
  reviewRequests: StatusSectionItem[];
  mentions: StatusSectionItem[];
  activity: StatusSectionItem[];
  rawText: string;
}

/**
 * 解析 gh status 的输出，提取待办 Issue、待办 PR、评审请求、提及与近期动态
 */
export function parseStatusOutput(output: string): ParsedStatusReport {
  const trimmed = (output || '').trim();
  const report: ParsedStatusReport = {
    assignedIssues: [],
    assignedPrs: [],
    reviewRequests: [],
    mentions: [],
    activity: [],
    rawText: trimmed,
  };

  if (!trimmed) return report;

  const lines = trimmed.split(/[\r\n]+/);
  let currentSection: 'assignedIssues' | 'assignedPrs' | 'reviewRequests' | 'mentions' | 'activity' | null = null;

  for (const line of lines) {
    const rawLine = line.trim();
    if (!rawLine) continue;

    // 检查是否包含版块头
    if (/Assigned Issues/i.test(rawLine)) {
      currentSection = 'assignedIssues';
      // 如果同一行有双列分割
      if (/Assigned Pull Requests/i.test(rawLine)) {
        // 双列行，仅做标记
        continue;
      }
      continue;
    }
    if (/Assigned Pull Requests/i.test(rawLine)) {
      currentSection = 'assignedPrs';
      continue;
    }
    if (/Review Requests/i.test(rawLine)) {
      currentSection = 'reviewRequests';
      continue;
    }
    if (/Mentions/i.test(rawLine)) {
      currentSection = 'mentions';
      continue;
    }
    if (/Repository Activity/i.test(rawLine)) {
      currentSection = 'activity';
      continue;
    }

    // 过滤空状态占位符
    if (rawLine.includes('Nothing here') || rawLine.includes('^_^')) {
      continue;
    }

    // 处理行内容（支持制表符或双列分隔）
    const cleanSegments = rawLine
      .split('│')
      .map((s) => s.trim())
      .filter((s) => s && !s.includes('Nothing here') && !s.includes('^_^'));

    for (const segment of cleanSegments) {
      if (!segment) continue;

      // 尝试匹配制表符或 "repo#123\tdesc\tdetail"
      const tabParts = segment.split('\t').map((p) => p.trim());
      const itemMatch = tabParts[0].match(/^([^#\s]+)#(\d+)/);

      const item: StatusSectionItem = {
        raw: segment,
      };

      if (itemMatch) {
        item.repo = itemMatch[1];
        item.number = itemMatch[2];
        item.title = tabParts[1] || '';
        item.detail = tabParts[2] || '';
      } else {
        item.detail = segment;
      }

      if (currentSection && report[currentSection]) {
        report[currentSection].push(item);
      } else {
        // 未匹配版块默认归入 activity
        report.activity.push(item);
      }
    }
  }

  return report;
}

/**
 * Status 领域渲染器：负责用户跨仓待办大盘的 Markdown 格式化
 */
export function renderStatusMarkdown(args: any, value: any): string {
  if (!value) return '无返回内容';

  if (value?.healthScore !== undefined || (value as any)?.degradationRate !== undefined || args?.action === 'health') {
    return renderHealthAuditMarkdown(value as unknown as TelemetrySummary);
  }

  const report: ParsedStatusReport = value.parsed || parseStatusOutput(value.rawText || value.output || '');

  const renderSection = (title: string, icon: string, items: StatusSectionItem[], emptyText: string) => {
    if (!items || items.length === 0) {
      return `#### ${icon} ${title}\n*${emptyText}*\n`;
    }

    const rows = items.map((it) => {
      const repoRef = it.repo && it.number ? `\`${it.repo}#${it.number}\`` : '-';
      const titleText = sanitizeCell(it.title || it.raw, 40);
      const detailText = sanitizeCell(it.detail, 40);
      return `| ${repoRef} | ${titleText} | ${detailText} |`;
    });

    return [
      `#### ${icon} ${title} (${items.length})\n`,
      '| 仓库 & 编号 | 标题 / 动作 | 详情 / 摘要 |',
      '| :--- | :--- | :--- |',
      ...rows,
      '',
    ].join('\n');
  };

  const sections = [
    renderSection('指派给我的 Issue (Assigned Issues)', '📌', report.assignedIssues, '🟢 暂无分配给你的未决 Issue'),
    renderSection('指派给我的 PR (Assigned Pull Requests)', '🔀', report.assignedPrs, '🟢 暂无分配给你的未决 PR'),
    renderSection('等待我评审的 PR (Review Requests)', '👀', report.reviewRequests, '🟢 暂无待你评审的 PR'),
    renderSection('提及我的动态 (Mentions)', '🔔', report.mentions, '🟢 暂无与你相关的近期提及'),
    renderSection('订阅仓库近期动态 (Repository Activity)', '⚡', report.activity, '暂无近期仓库动态'),
  ];

  return [
    '### 🧭 GitHub 个人待办与跨仓动态聚合看板\n',
    ...sections,
    '> 💡 **待办操作建议**: 可通过 `github_issue(action: \'view\')` 或 `github_pr(action: \'checkout\')` 快速检视对应议题并展开工作。',
  ].join('\n');
}

/**
 * 渲染 DSH GitHub 工具链健康度与降级率审计报表
 */
export function renderHealthAuditMarkdown(summary: TelemetrySummary): string {
  if (!summary) return '无遥测健康度数据';

  let badge = '🟢 极佳';
  if (summary.statusLevel === 'NEEDS_ATTENTION') {
    badge = '🔴 需关注';
  } else if (summary.statusLevel === 'GOOD') {
    badge = '🟡 良好';
  }

  const successRate = summary.totalCalls > 0
    ? `${((summary.successCount / summary.totalCalls) * 100).toFixed(1)}%`
    : '100%';

  const lines = [
    '### 🩺 DSH GitHub 工具链健康度与降级率审计报表\n',
    `- **综合健康分**: ${badge} (${summary.healthScore} / 100 分)`,
    `- **统计样本量**: 最近 ${summary.totalCalls} 次 Agent 工具调用`,
    `- **API 降级率**: \`${summary.degradationRate}%\` (${summary.degradedCount} 次触发降级链路)`,
    `- **安全防御拦截**: ${summary.confirmBlockedCount + summary.scopeBlockedCount} 次 (含 ${summary.scopeBlockedCount} 次权限缺失，${summary.confirmBlockedCount} 次确认防线)`,
    `- **执行成功率**: \`${successRate}\` (${summary.successCount} 成功, ${summary.failureCount} 失败)`,
  ];

  // 工具调用分布表
  const toolNames = Object.keys(summary.toolStats || {});
  if (toolNames.length > 0) {
    const sorted = toolNames.sort((a, b) => summary.toolStats[b].total - summary.toolStats[a].total);
    const rows = sorted.map((name) => {
      const s = summary.toolStats[name];
      const rate = s.total > 0 ? `${((s.success / s.total) * 100).toFixed(0)}%` : '100%';
      let toolBadge = '🟢 正常';
      if (s.degraded > 0) toolBadge = '🟡 存在降级';
      if (s.failed > 0 && s.success === 0) toolBadge = '🔴 异常';
      return `| \`${name}\` | ${s.total} | ${rate} | ${s.degraded} | ${toolBadge} |`;
    });

    lines.push(
      '\n**核心工具调用分布:**',
      '| 工具名称 | 调用次数 | 成功率 | 降级次数 | 状态 |',
      '| :--- | :---: | :---: | :---: | :--- |',
      ...rows,
    );
  }

  // 自愈优化建议
  if (Array.isArray(summary.recommendations) && summary.recommendations.length > 0) {
    lines.push('\n> 💡 **优化与自愈建议:**');
    summary.recommendations.forEach((rec) => {
      lines.push(`> - ${rec}`);
    });
  }

  return lines.join('\n');
}
