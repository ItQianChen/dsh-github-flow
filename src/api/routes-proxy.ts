/**
 * 网络代理设置路由（驾驶舱「网络代理」设置分区的后端入口）。
 * 为什么独立于 Cordis Config：代理设置变更若走 Loader 会触发插件全量 reload
 * （工具注销重注册、面板断流），而代理是高频试错型设置，必须保存即生效。
 */
import type { UpdateChecker } from '../updater.js';
import { sendJson, readJsonBody, guardLocalWrite, type RouteDeps } from './route-helpers.js';

/** ProxyManager 的路由侧最小接口：避免路由层直接依赖实现细节，测试可注入 mock */
export interface ProxyRouteManager {
  save: (input: any) => { ok: boolean; error?: string; state: any };
  probe: () => Promise<any>;
  snapshot: () => any;
}

export function registerProxyRoutes(
  deps: RouteDeps,
  checker: UpdateChecker,
  proxyManager?: ProxyRouteManager
): void {
  const { bindRoute } = deps;

  // 1. 代理配置：GET 读取状态 / POST 保存并立即生效（写 proxy.json + 重应用 dispatcher，零插件重载）
  bindRoute({
    kind: 'exact',
    path: '/api/github/proxy',
    handler: async (req: any, res: any) => {
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
      if (!guardLocalWrite(req, res, { requireJson: true })) return;
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
        checker.applyProxy(proxyManager as any);
        sendJson(res, 200, { ok: true, state: result.state });
      } catch (err: any) {
        sendJson(res, 500, { ok: false, message: err.message || '代理配置保存失败' });
      }
    },
  });

  // 2. 手动触发连通性探测（2.5s 超时，结果持久化到 lastProbe 供 UI 展示）
  bindRoute({
    kind: 'exact',
    path: '/api/github/proxy/probe',
    handler: async (req: any, res: any) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, message: '仅支持 POST 请求' });
        return;
      }
      // 无请求体，只校验 Origin。保持「每个 POST 端点都有跨站门禁」这条不变量，
      // 否则下一个人加端点时又会漏。
      if (!guardLocalWrite(req, res)) return;
      if (!proxyManager) {
        sendJson(res, 503, { ok: false, message: '当前运行环境未启用代理管理器' });
        return;
      }
      try {
        const probe = await proxyManager.probe();
        sendJson(res, 200, { ok: true, probe, state: proxyManager.snapshot() });
      } catch (err: any) {
        sendJson(res, 500, { ok: false, message: err.message || '代理探测失败' });
      }
    },
  });
}
