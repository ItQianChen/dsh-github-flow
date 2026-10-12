import { sendJson } from './route-helpers.js';
export function registerLifecycleRoutes(deps, executor, checker, upgrader) {
    const { bindRoute } = deps;
    // 1. 闲时静默检查更新端点（前端在 gh 业务数据完全拉取就绪后，由 idle 延时静默触发）
    bindRoute({
        kind: 'exact',
        path: '/api/github/check-update',
        handler: async (req, res) => {
            if (req.method !== 'GET') {
                sendJson(res, 405, { ok: false, message: '仅支持 GET 请求' });
                return;
            }
            try {
                const url = new URL(req.url || '', 'http://127.0.0.1');
                const force = url.searchParams.get('force') === 'true';
                const info = await checker.check(force);
                sendJson(res, 200, { ok: true, data: info });
            }
            catch (err) {
                sendJson(res, 500, { ok: false, error: err.message || '检查更新失败' });
            }
        },
    });
    // 2. 一键自动升级触发端点（用户点击操作横幅按钮后发起）
    bindRoute({
        kind: 'exact',
        path: '/api/github/upgrade',
        handler: async (req, res) => {
            if (req.method !== 'POST') {
                sendJson(res, 405, { ok: false, message: '仅支持 POST 请求' });
                return;
            }
            try {
                const info = await checker.check(false);
                const result = await upgrader.executeUpgrade(info.latestVersion);
                sendJson(res, result.ok ? 200 : 500, result);
            }
            catch (err) {
                sendJson(res, 500, { ok: false, message: err.message || '执行自动升级异常' });
            }
        },
    });
    // 3. 升级状态与实时日志查询端点
    bindRoute({
        kind: 'exact',
        path: '/api/github/upgrade-status',
        handler: async (req, res) => {
            if (req.method !== 'GET') {
                sendJson(res, 405, { ok: false, message: '仅支持 GET 请求' });
                return;
            }
            sendJson(res, 200, { ok: true, data: upgrader.getStatus() });
        },
    });
    // 4. 快速认证状态轻量探针 (耗时 < 500ms，专供登录自愈检测与快速恢复)
    bindRoute({
        kind: 'exact',
        path: '/api/github/auth',
        handler: async (req, res) => {
            if (req.method !== 'GET') {
                sendJson(res, 405, { ok: false, message: '仅支持 GET 请求' });
                return;
            }
            try {
                const url = new URL(req.url || '', 'http://127.0.0.1');
                const force = url.searchParams.get('force') === 'true';
                const auth = await executor.checkAuth(undefined, force);
                sendJson(res, 200, { ok: true, auth });
            }
            catch (err) {
                sendJson(res, 500, { ok: false, error: err.message || '认证检测失败' });
            }
        },
    });
}
