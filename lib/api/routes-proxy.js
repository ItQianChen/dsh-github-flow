import { sendJson, readJsonBody, guardLocalWrite } from './route-helpers.js';
export function registerProxyRoutes(deps, checker, proxyManager, executor) {
    const { bindRoute } = deps;
    // 1. 代理配置：GET 读取状态 / POST 保存并立即生效（写 proxy.json + 重应用 dispatcher，零插件重载）
    bindRoute({
        kind: 'exact',
        path: '/api/github/proxy',
        handler: async (req, res) => {
            if (req.method === 'GET') {
                if (!proxyManager) {
                    sendJson(res, 200, { ok: true, state: null, message: '当前运行环境未启用代理管理器' });
                    return;
                }
                sendJson(res, 200, { ok: true, state: proxyManager.snapshot() });
                return;
            }
            if (req.method !== 'POST') {
                sendJson(res, 405, { ok: false, message: '仅支持 GET / POST 请求' });
                return;
            }
            // 跨站门禁：代理配置写入会改变插件全部外联流量的走向。
            if (!guardLocalWrite(req, res, { requireJson: true }))
                return;
            if (!proxyManager) {
                sendJson(res, 503, { ok: false, message: '当前运行环境未启用代理管理器' });
                return;
            }
            try {
                const body = await readJsonBody(req);
                const result = proxyManager.save(body || {});
                if (!result.ok) {
                    sendJson(res, 400, { ok: false, message: result.error, state: result.state });
                    return;
                }
                // 配置变更后同步刷新 updater 的 fetch dispatcher（npm 探测链路）
                checker.applyProxy(proxyManager);
                sendJson(res, 200, { ok: true, state: result.state });
            }
            catch (err) {
                sendJson(res, 500, { ok: false, message: err.message || '代理配置保存失败' });
            }
        },
    });
    // 2. 手动触发连通性探测（2.5s 超时，结果持久化到 lastProbe 供 UI 展示）
    bindRoute({
        kind: 'exact',
        path: '/api/github/proxy/probe',
        handler: async (req, res) => {
            if (req.method !== 'POST') {
                sendJson(res, 405, { ok: false, message: '仅支持 POST 请求' });
                return;
            }
            // 无请求体，只校验 Origin。保持「每个 POST 端点都有跨站门禁」这条不变量，
            // 否则下一个人加端点时又会漏。
            if (!guardLocalWrite(req, res))
                return;
            if (!proxyManager) {
                sendJson(res, 503, { ok: false, message: '当前运行环境未启用代理管理器' });
                return;
            }
            try {
                /*
                 * socks5 必须改走 gh 子进程探测。
                 *
                 * undici 的 ProxyAgent 不支持 socks5，ProxyManager.probe() 在这种配置下
                 * 只能直连——测的是「本机能不能直连 GitHub」，与代理是否可用无关，
                 * 结论会与真实链路完全相反（GFW 下代理正常却报失败）。
                 * gh 子进程拿到的是代理环境变量（executor 统一注入），socks5 原生支持，
                 * 所以这里用 `gh api rate_limit` 测真实链路，并把结果回填给 ProxyManager。
                 */
                const effectiveUrl = typeof proxyManager.getEffectiveUrl === 'function' ? proxyManager.getEffectiveUrl() : '';
                if (/^socks5h?:\/\//i.test(effectiveUrl) && executor) {
                    const started = Date.now();
                    const r = await executor.run(['api', 'rate_limit'], { timeoutMs: 8_000 });
                    const probe = r && r.ok
                        ? { ok: true, at: started, latencyMs: Date.now() - started, viaGh: true }
                        : { ok: false, at: started, viaGh: true, error: (r && r.error) || 'gh 链路探测失败' };
                    if (typeof proxyManager.recordProbe === 'function')
                        proxyManager.recordProbe(probe);
                    sendJson(res, 200, { ok: true, probe, state: proxyManager.snapshot() });
                    return;
                }
                const probe = await proxyManager.probe();
                sendJson(res, 200, { ok: true, probe, state: proxyManager.snapshot() });
            }
            catch (err) {
                sendJson(res, 500, { ok: false, message: err.message || '代理探测失败' });
            }
        },
    });
}
