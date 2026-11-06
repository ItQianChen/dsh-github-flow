import type { TrendingResult } from '../trending/service.js';

export function renderTrendingMarkdown(value: { items: TrendingResult[]; errors?: Array<{ period: string; message: string }> }): string {
  const cell = (s: unknown) => String(s ?? '—').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return [...value.items.map(board => {
    const label = { daily: '今日新增', weekly: '本周新增', monthly: '本月新增' }[board.period];
    return `### GitHub ${board.period}\n\n抓取时间：${board.fetchedAt}${board.stale ? '（缓存数据；' + cell(board.warning) + '）' : ''}\n\n`
      + `| 项目 name | 链接 url | 简介 description | 语言 language | 总 Star stars | ${label} starsToday |\n|---|---|---|---|---:|---:|\n`
      + board.items.map(row => `| ${cell(row.name)} | ${row.url} | ${cell(row.description)} | ${cell(row.language)} | ${cell(row.stars)} | ${cell(row.starsToday)} |`).join('\n');
  }), ...(value.errors || []).map(e => `${cell(e.period)}：${cell(e.message)}`)].join('\n\n');
}
