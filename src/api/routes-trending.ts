import type { FirecrawlSettings } from '../trending/settings.js';
import { TrendingService, parseTrendingPeriod } from '../trending/service.js';
import { guardLocalWrite, type RouteDeps } from './route-helpers.js';

export function registerTrendingRoutes(deps: RouteDeps, service: TrendingService, settings?: FirecrawlSettings): void {
  const { bindRoute, sendJson, readJsonBody } = deps;
  if (settings) bindRoute({ kind: 'exact', path: '/api/github/firecrawl-settings', handler: async (req: any, res: any) => {
    if (req.method === 'GET') {
      if (!guardLocalWrite(req, res)) return;
      sendJson(res, 200, { ok: true, data: settings.snapshot() });
      return;
    }
    if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: '仅支持 GET / POST 请求' }); return; }
    if (!guardLocalWrite(req, res, { requireJson: true })) return;
    try {
      const body = await readJsonBody(req, 4096);
      const state = settings.save(body);
      service.setApiKey(settings.key());
      if (state.trendingSource === 'scrape' || state.trendingSource === 'agent') {
        service.setSource(state.trendingSource);
      }
      sendJson(res, 200, { ok: true, data: state });
    } catch (error: any) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
  } });
  bindRoute({ kind: 'exact', path: '/api/github/trending-agent', handler: async (req: any, res: any) => {
    if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: '仅支持 POST 请求' }); return; }
    if (!guardLocalWrite(req, res, { requireJson: true })) return;
    try {
      const body = await readJsonBody(req, 2048);
      const period = parseTrendingPeriod(body?.period);
      if (body?.action !== 'start' && body?.action !== 'status') throw new Error('action 必须为 start 或 status');
      const data = body.action === 'start' ? await service.agentStart(period) : await service.agentStatus(period);
      sendJson(res, 200, { ok: true, data });
    } catch (error: any) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
  } });
  bindRoute({ kind: 'exact', path: '/api/github/trending', handler: async (req: any, res: any) => {
    if (req.method === 'GET') {
      sendJson(res, 200, { ok: true, data: service.status() });
      return;
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: '仅支持 GET / POST 请求' });
      return;
    }
    // Scraping consumes credits; reject cross-site/simple browser requests before calling Firecrawl.
    if (!guardLocalWrite(req, res, { requireJson: true })) return;
    let period;
    let refresh;
    try {
      const body = await readJsonBody(req);
      period = parseTrendingPeriod(body?.period ?? 'daily');
      if (body?.refresh !== undefined && typeof body.refresh !== 'boolean') throw new Error('refresh 必须为布尔值');
      refresh = body?.refresh === true;
    } catch (error: any) {
      sendJson(res, 400, { ok: false, error: error.message });
      return;
    }
    try {
      sendJson(res, 200, { ok: true, data: await service.get(period, refresh) });
    } catch (error: any) {
      sendJson(res, service.status().configured ? 502 : 503, { ok: false, error: error.message });
    }
  } });
}
