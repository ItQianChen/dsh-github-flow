import { parseTrendingPeriod } from '../trending/service.js';
import { guardLocalWrite } from './route-helpers.js';
export function registerTrendingRoutes(deps, service) {
    const { bindRoute, sendJson, readJsonBody } = deps;
    bindRoute({ kind: 'exact', path: '/api/github/trending', handler: async (req, res) => {
            if (req.method === 'GET') {
                sendJson(res, 200, { ok: true, data: service.status() });
                return;
            }
            if (req.method !== 'POST') {
                sendJson(res, 405, { ok: false, error: '仅支持 GET / POST 请求' });
                return;
            }
            // Scraping consumes credits; reject cross-site/simple browser requests before calling Firecrawl.
            if (!guardLocalWrite(req, res, { requireJson: true }))
                return;
            let period;
            let refresh;
            try {
                const body = await readJsonBody(req);
                period = parseTrendingPeriod(body?.period ?? 'daily');
                if (body?.refresh !== undefined && typeof body.refresh !== 'boolean')
                    throw new Error('refresh 必须为布尔值');
                refresh = body?.refresh === true;
            }
            catch (error) {
                sendJson(res, 400, { ok: false, error: error.message });
                return;
            }
            try {
                sendJson(res, 200, { ok: true, data: await service.get(period, refresh) });
            }
            catch (error) {
                sendJson(res, service.status().configured ? 502 : 503, { ok: false, error: error.message });
            }
        } });
}
