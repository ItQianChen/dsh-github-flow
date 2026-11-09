import { TrendingService, TRENDING_PERIODS, parseTrendingPeriod } from '../trending/service.js';
import { renderTrendingMarkdown } from '../renderers/trending.js';

export function createTrendingTool(service: TrendingService) {
  return {
    name: 'github_trending',
    description: '查询 GitHub 每日/每周/每月热点榜单，或 all 返回三张表。无需 gh 登录和工作区仓库。通过 Firecrawl 抓取并缓存三小时；默认命中缓存，refresh 为 true 时跳过缓存立即重新抓取并消耗额度。每项固定六字段 name/url/description/language/stars/starsToday，starsToday 始终表示所选周期新增数，不代表周/月榜中的今日新增。缺失数值为 null。',
    parameters: { type: 'object', additionalProperties: false, properties: {
      period: { type: 'string', enum: [...TRENDING_PERIODS, 'all'], description: '默认 daily' },
      refresh: { type: 'boolean', description: '默认 false；true 跳过缓存立即重新抓取，会消耗额度' },
    } },
    output: { schema: { type: 'object' }, render(_args: any, value: any) {
      return [{ type: 'text', text: renderTrendingMarkdown(value) }];
    } },
    async execute(args: any) {
      const period = args?.period ?? 'daily';
      if (args?.refresh !== undefined && typeof args.refresh !== 'boolean') throw new Error('refresh 必须为布尔值');
      const periods = period === 'all' ? TRENDING_PERIODS : [parseTrendingPeriod(period)];
      const results = await Promise.allSettled(periods.map(p => service.get(p, args?.refresh === true)));
      return { items: results.flatMap(r => r.status === 'fulfilled' ? [r.value] : []),
        errors: results.flatMap((r, i) => r.status === 'rejected' ? [{ period: periods[i], message: r.reason.message }] : []) };
    },
  };
}
