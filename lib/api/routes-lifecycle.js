import { loadUpdateSettings, saveUpdateSettings, isValidUpdateMode, describeUpdateMode } from '../update-settings.js';
import { sendJson, readJsonBody, guardLocalWrite } from './route-helpers.js';
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
            // 跨站门禁：一键升级是最敏感的写链路（会改动用户 profile 依赖）。
            // 本端点无请求体，因此只校验 Origin，不要求 Content-Type。
            if (!guardLocalWrite(req, res))
                return;
            try {
                // 一键升级是用户显式动作，不受 checkUpdate 配置熔断：check() 在禁用时
                // 会返回 latestVersion 缺失的兜底态，此时回退 'latest' 让 pnpm 自行解析
                // 最新版（与 UpgradeManager 自身的 targetVersion 可选语义一致）。
                const info = await checker.check(false);
                const target = info.latestVersion || 'latest';
                const result = await upgrader.executeUpgrade(target);
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
    // 5. 更新源设置：GET 读取（store 权威，缺省 official）/ POST 保存并立即用新源验证
    bindRoute({
        kind: 'exact',
        path: '/api/github/update-settings',
        handler: async (req, res) => {
            if (req.method === 'GET') {
                const mode = loadUpdateSettings();
                sendJson(res, 200, { ok: true, data: { mode, description: describeUpdateMode(mode) } });
                return;
            }
            if (req.method !== 'POST') {
                sendJson(res, 405, { ok: false, message: '仅支持 GET / POST 请求' });
                return;
            }
            // 跨站门禁：更新源设置会写盘并改变后续所有版本探测的走向。
            if (!guardLocalWrite(req, res, { requireJson: true }))
                return;
            try {
                const body = await readJsonBody(req);
                const mode = body?.mode;
                if (!isValidUpdateMode(mode)) {
                    sendJson(res, 400, { ok: false, message: `非法更新源模式: ${String(mode)}（允许 official / mirror / off）` });
                    return;
                }
                // 写盘失败不阻断内存态生效（save 内部已 warn），返回携带 error 提示重启后需重设
                const saved = saveUpdateSettings(mode);
                checker.applySettings(mode);
                // 非 off 模式：立即用新源真探一次，把结果带回前端展示（缓存已被 applySettings 失效）
                let probe = null;
                if (mode !== 'off') {
                    const info = await checker.check(true);
                    probe = { latestVersion: info.latestVersion, hasUpdate: info.hasUpdate, checkedAt: info.checkedAt };
                }
                sendJson(res, 200, {
                    ok: true,
                    data: {
                        mode,
                        description: describeUpdateMode(mode),
                        persisted: saved.ok,
                        persistError: saved.error,
                        probe,
                    },
                });
            }
            catch (err) {
                sendJson(res, 500, { ok: false, message: err.message || '保存更新源设置失败' });
            }
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
