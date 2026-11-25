import { guardLocalWrite } from './route-helpers.js';
/** 单页上限：UI 一次最多看 200 条，再多也没有阅读价值 */
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;
/** 单次删除的 id 数上限：防止一个超大 body 把内存打满 */
const MAX_DELETE_IDS = 500;
function parseBool(v) {
    if (v === null)
        return undefined;
    if (v === '1' || v === 'true')
        return true;
    if (v === '0' || v === 'false')
        return false;
    return undefined;
}
function normalizeLimit(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0)
        return DEFAULT_LIMIT;
    return Math.min(Math.floor(n), MAX_LIMIT);
}
function normalizeOffset(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0)
        return 0;
    return Math.floor(n);
}
export function registerAuditRoutes(deps, store) {
    const { bindRoute, sendJson, readJsonBody } = deps;
    // 1. 记录列表（只读）
    bindRoute({
        kind: 'exact',
        path: '/api/github/audit/records',
        handler: async (req, res) => {
            if (req.method !== 'GET') {
                sendJson(res, 405, { ok: false, message: '仅支持 GET 请求' });
                return;
            }
            try {
                const u = new URL(req.url || '/', 'http://127.0.0.1');
                const riskRaw = u.searchParams.get('risk');
                const risk = riskRaw === 'read' || riskRaw === 'write' || riskRaw === 'destructive' ? riskRaw : undefined;
                const sinceRaw = u.searchParams.get('since');
                const since = sinceRaw === null ? undefined : Number(sinceRaw);
                // cwd 只用于**精确比较**，永远不会被当成路径去读写文件，因此不需要做路径穿越防护；
                // 但仍要限长与拒绝控制字符：它会进内存里参与比较，也可能被回显到日志。
                const cwdRaw = u.searchParams.get('cwd') || '';
                if (cwdRaw.length > 4096 || /[\u0000-\u001f]/.test(cwdRaw)) {
                    sendJson(res, 400, { ok: false, message: '非法 cwd 参数' });
                    return;
                }
                const page = store.list({
                    tool: u.searchParams.get('tool') || undefined,
                    write: parseBool(u.searchParams.get('write')),
                    risk,
                    since: Number.isFinite(since) ? since : undefined,
                    cwd: cwdRaw || undefined,
                    limit: normalizeLimit(u.searchParams.get('limit')),
                    offset: normalizeOffset(u.searchParams.get('offset')),
                });
                sendJson(res, 200, {
                    ok: true,
                    data: {
                        items: page.items,
                        total: page.total,
                        // 回显本次作用域：UI 需要如实告诉用户"这是全局的"还是"只看这个工作区的"，
                        // 否则两个入口的数据看起来一样，用户会以为筛选坏了。
                        scope: cwdRaw ? 'workspace' : 'global',
                        cwd: cwdRaw || null,
                        // 降级原因非空时 UI 必须显式提示「记录功能已禁用」，而不是显示空列表
                        // 让人以为「Agent 什么都没做」——这两种状态的含义天差地别。
                        degraded: store.degradedReason,
                    },
                });
            }
            catch (err) {
                sendJson(res, 500, { ok: false, message: err?.message || '读取操作记录失败' });
            }
        },
    });
    // 2. 删除指定记录（追加墓碑 + 压实，文件里不再残留这些 id 的字节）
    bindRoute({
        kind: 'exact',
        path: '/api/github/audit/records/delete',
        handler: async (req, res) => {
            if (req.method !== 'POST') {
                sendJson(res, 405, { ok: false, message: '仅支持 POST 请求' });
                return;
            }
            if (!guardLocalWrite(req, res, { requireJson: true }))
                return;
            try {
                const body = await readJsonBody(req);
                const ids = body?.ids;
                if (!Array.isArray(ids)) {
                    sendJson(res, 400, { ok: false, message: 'ids 必须是字符串数组' });
                    return;
                }
                if (ids.length > MAX_DELETE_IDS) {
                    sendJson(res, 400, { ok: false, message: `单次最多删除 ${MAX_DELETE_IDS} 条` });
                    return;
                }
                if (!ids.every((v) => typeof v === 'string' && v.length > 0 && v.length <= 128)) {
                    sendJson(res, 400, { ok: false, message: 'ids 中存在非法元素' });
                    return;
                }
                const removed = await store.delete(ids);
                sendJson(res, 200, { ok: true, data: { removed } });
            }
            catch (err) {
                sendJson(res, 400, { ok: false, message: err?.message || '删除操作记录失败' });
            }
        },
    });
    // 3. 清空全部记录
    bindRoute({
        kind: 'exact',
        path: '/api/github/audit/records/clear',
        handler: async (req, res) => {
            if (req.method !== 'POST') {
                sendJson(res, 405, { ok: false, message: '仅支持 POST 请求' });
                return;
            }
            if (!guardLocalWrite(req, res, { requireJson: true }))
                return;
            try {
                // body 可为空对象；这里只排空流，避免 Node 对未消费的请求体直接断连
                await readJsonBody(req).catch(() => ({}));
                await store.clear();
                sendJson(res, 200, { ok: true, data: { cleared: true } });
            }
            catch (err) {
                sendJson(res, 500, { ok: false, message: err?.message || '清空操作记录失败' });
            }
        },
    });
}
