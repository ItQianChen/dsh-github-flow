import { guardLocalWrite } from './route-helpers.js';
/** 单页上限：UI 一次最多看 200 条，再多也没有阅读价值 */
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;
/** 单次删除的 id 数上限：防止一个超大 body 把内存打满 */
const MAX_DELETE_IDS = 500;
/**
 * 审核规则条数上限。
 *
 * 取 200：真实需求是个位数（个人仓库 + 公司仓库 + 几个常用 action），
 * 200 条已经远超"人能手写并看懂"的规模；再多的规则文件本身就该改成脚本生成。
 * 设上限的理由不是性能（解析 200 条是微秒级），而是防止一次手滑粘贴把设置文件撑成垃圾。
 */
const MAX_APPROVAL_RULES = 200;
/**
 * 导出体量上限（按**存储字节**算，不是导出后的字符串长度）。
 *
 * 为什么必须有：预算上限是 64 MB，而导出要把全部记录 `JSON.stringify` 成**一个字符串**
 * 再塞进响应体 —— 64 MB 记录会变成 100 MB+ 的 JS 字符串，是一次真实的 OOM/卡死风险，
 * 而用户点这个按钮只是想"带走记录"，不是想测内存。
 *
 * 取 32 MB：默认预算 8 MB 下永远碰不到；只有把预算调到 32 MB 以上、且真的写满了才会触发，
 * 此时引导用户先筛选（按工具 / 按工作区）或调小预算，比直接把他浏览器干崩好。
 */
const MAX_EXPORT_BYTES = 32 * 1024 * 1024;
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
                        // 用量与开关（默认 8 MB 预算 / 行数上限由它派生）：UI 据此显示「已用 x/y MB」
                        usage: store.usage(),
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
            /*
             * 先把 body 解析完再动数据：`readJsonBody` 对畸形 JSON / 超 256KB 都会 reject
             * （后者已经 `req.destroy()` 断连）。若像以前那样 `.catch(() => ({}))` 吞掉，
             * 就会出现「记录已经清空、客户端却因连接被断只拿到 ECONNRESET」——
             * 不可逆动作做了却没有回执，是最差的组合。
             */
            try {
                await readJsonBody(req);
            }
            catch (err) {
                sendJson(res, 400, { ok: false, message: err?.message || '请求体不是合法 JSON' });
                return;
            }
            try {
                const r = await store.clear();
                /*
                 * `partial: true` 必须如实回传，UI 也要显式提示。
                 *
                 * 为什么：记录分段后，"清空"要删的是多个进程的段，而那些段不归本进程写。
                 * 抢不到锁、或对方仍在写入（活段不删）时，只能清自己那段——
                 * **宁可如实报告"其他进程的 N 段未被清空"，也不假装删干净了**：
                 * 用户以为文件干净了、实际字节还在磁盘上，那是隐私问题不是显示问题。
                 */
                sendJson(res, 200, {
                    ok: true,
                    data: {
                        // 语义是"清掉了几段"，不要压成布尔：部分成功时布尔值会自相矛盾
                        clearedSegments: r.cleared,
                        partial: r.partial,
                        remainingSegments: r.remaining,
                    },
                });
            }
            catch (err) {
                sendJson(res, 500, { ok: false, message: err?.message || '清空操作记录失败' });
            }
        },
    });
    /*
     * 3b. 导出（s3）：JSON / Markdown，**内容随 JSON 回传**，由浏览器触发下载。
     *
     * 为什么不在服务端落文件：落盘就得管清理（谁删、多久删、删了用户找谁），
     * 而用户要的只是"带走"。回传字符串 + 前端 `Blob` 下载是零状态方案——
     * 服务端不产生任何需要维护的产物。
     *
     * 为什么用 POST 而不是 GET：入参里有 filter 对象，且这是"生成一份东西"的语义。
     * 顺带复用同一道 `guardLocalWrite({requireJson})` CSRF 门，不必为 GET 另开豁免。
     */
    bindRoute({
        kind: 'exact',
        path: '/api/github/audit/export',
        handler: async (req, res) => {
            if (req.method !== 'POST') {
                sendJson(res, 405, { ok: false, message: '仅支持 POST 请求' });
                return;
            }
            if (!guardLocalWrite(req, res, { requireJson: true }))
                return;
            try {
                const body = await readJsonBody(req);
                const format = body?.format;
                if (format !== 'json' && format !== 'md') {
                    sendJson(res, 400, { ok: false, message: "format 只能是 'json' 或 'md'" });
                    return;
                }
                // filter 只认 list() 支持的字段：白名单而不是透传，避免把任意键塞进查询
                const f = body?.filter && typeof body.filter === 'object' ? body.filter : {};
                const cwdRaw = typeof f.cwd === 'string' ? f.cwd : '';
                if (cwdRaw.length > 4096 || /[\u0000-\u001f]/.test(cwdRaw)) {
                    sendJson(res, 400, { ok: false, message: '非法 cwd 参数' });
                    return;
                }
                const riskRaw = f.risk;
                const risk = riskRaw === 'read' || riskRaw === 'write' || riskRaw === 'destructive' ? riskRaw : undefined;
                const filter = {
                    tool: typeof f.tool === 'string' && f.tool ? f.tool : undefined,
                    risk,
                    cwd: cwdRaw || undefined,
                    since: Number.isFinite(Number(f.since)) ? Number(f.since) : undefined,
                };
                const narrowed = Boolean(filter.tool || filter.risk || filter.cwd || filter.since !== undefined);
                /*
                 * 体量护栏分两道，因为"要不要拼那个大字符串"和"拼出来多大"是两件事：
                 * a) **没筛选**且库里已经很大 → 直接拒，别去拼（64 MB 记录会变成 100 MB+ 的 JS 字符串）。
                 * b) **筛过**仍拼超了 → 拼完再拒（筛过的结果无法从 `usage()` 预估）。
                 * 文案不写"调小保留预算"：那是删数据，不是导出方案。
                 */
                const used = store.usage().bytes;
                if (!narrowed && used > MAX_EXPORT_BYTES) {
                    sendJson(res, 422, {
                        ok: false,
                        message: `当前记录占用 ${(used / 1048576).toFixed(1)} MB，超过单次导出上限 ` +
                            `${Math.round(MAX_EXPORT_BYTES / 1048576)} MB。请先按工具 / 风险 / 工作区或时间范围缩小范围后再导出。`,
                    });
                    return;
                }
                const content = format === 'json' ? store.exportJson(filter) : store.exportMarkdown(filter);
                if (content.length > MAX_EXPORT_BYTES) {
                    sendJson(res, 422, {
                        ok: false,
                        message: `本次导出内容 ${(content.length / 1048576).toFixed(1)} MB，超过单次上限 ` +
                            `${Math.round(MAX_EXPORT_BYTES / 1048576)} MB。请缩小工具 / 工作区 / 时间范围后分批导出。`,
                    });
                    return;
                }
                const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                sendJson(res, 200, {
                    ok: true,
                    data: {
                        filename: `github-audit-${stamp}.${format === 'json' ? 'json' : 'md'}`,
                        contentType: format === 'json' ? 'application/json' : 'text/markdown',
                        content,
                    },
                });
            }
            catch (err) {
                sendJson(res, 500, { ok: false, message: err?.message || '导出操作记录失败' });
            }
        },
    });
    // 4. 开关 / 预算 / 审核档位 / 审核规则：热生效 + 落盘（store 内部负责 saveAuditSettings）
    //
    // 为什么一个端点管三个字段：它们落在同一个设置文件、同一个设置分区（设置页的
    // 「🕘 操作记录与审核」一屏），分成三个端点只会让"改两项"变成两次请求两次重绘。
    bindRoute({
        kind: 'exact',
        path: '/api/github/audit/settings',
        handler: async (req, res) => {
            if (req.method === 'GET') {
                // 设置页需要一次拿到"当前值"（开关 / 预算 / 档位 / 规则）与"用量"
                sendJson(res, 200, {
                    ok: true,
                    data: {
                        usage: store.usage(),
                        approvalMode: store.approvalMode(),
                        approvalRules: store.approvalRules(),
                        /*
                         * 规则解析结果一并回传：设置页要显示「解析出 N 条，忽略 M 条」。
                         *
                         * 为什么不能只回原文让前端自己解析：解析规则是**策略语义**，
                         * 前端与后端各写一遍必然漂移——用户看到的"有效规则"和闸门实际用的是两份。
                         */
                        rulesParsed: {
                            valid: store.parsedApprovalRules().rules.length,
                            ignored: store.parsedApprovalRules().ignored,
                        },
                    },
                });
                return;
            }
            if (req.method !== 'POST') {
                sendJson(res, 405, { ok: false, message: '仅支持 GET / POST 请求' });
                return;
            }
            if (!guardLocalWrite(req, res, { requireJson: true }))
                return;
            try {
                const body = await readJsonBody(req);
                if (body?.enabled !== undefined && typeof body.enabled !== 'boolean') {
                    sendJson(res, 400, { ok: false, message: 'enabled 必须是布尔值' });
                    return;
                }
                // 预算：1–64 MB。**0 不是合法的"关闭"值**——关闭只有一个入口（enabled），
                // 两个关闭入口会让「我设了 8 MB 为什么还说不记录」变成必然困惑。
                if (body?.budgetMB !== undefined) {
                    const mb = Number(body.budgetMB);
                    if (!Number.isFinite(mb) || mb < 1 || mb > 64) {
                        sendJson(res, 400, { ok: false, message: '预算必须是 1–64 之间的 MB 数（关闭请用 enabled: false）' });
                        return;
                    }
                }
                if (body?.approvalMode !== undefined) {
                    if (body.approvalMode !== 'off' && body.approvalMode !== 'destructive' && body.approvalMode !== 'all-writes') {
                        sendJson(res, 400, { ok: false, message: 'approvalMode 只能是 off / destructive / all-writes' });
                        return;
                    }
                }
                /*
                 * 审核规则：字符串数组。
                 *
                 * 只校验"是字符串数组"与条数上限，**不校验语法**——语法错的规则由 store 解析时
                 * 忽略并回传 `rulesParsed.ignored`，设置页实时显示"解析出 N 条，忽略 M 条"。
                 * 在路由层拒收会让"用户正写到一半"变成保存失败，而他的意图是明确的。
                 */
                if (body?.approvalRules !== undefined) {
                    if (!Array.isArray(body.approvalRules)) {
                        sendJson(res, 400, { ok: false, message: 'approvalRules 必须是字符串数组' });
                        return;
                    }
                    if (body.approvalRules.length > MAX_APPROVAL_RULES) {
                        sendJson(res, 400, { ok: false, message: `审核规则最多 ${MAX_APPROVAL_RULES} 条` });
                        return;
                    }
                    if (!body.approvalRules.every((r) => typeof r === 'string' && r.length <= 512)) {
                        sendJson(res, 400, { ok: false, message: '每条规则必须是不超过 512 字符的字符串' });
                        return;
                    }
                }
                let usage = store.usage();
                if (typeof body?.enabled === 'boolean')
                    usage = await store.setEnabled(body.enabled);
                if (body?.budgetMB !== undefined)
                    usage = await store.setBudget(Math.round(Number(body.budgetMB) * 1024 * 1024));
                if (body?.approvalMode !== undefined)
                    usage = store.setApprovalMode(body.approvalMode);
                if (body?.approvalRules !== undefined)
                    usage = store.setApprovalRules(body.approvalRules);
                sendJson(res, 200, {
                    ok: true,
                    data: {
                        usage,
                        approvalMode: store.approvalMode(),
                        approvalRules: store.approvalRules(),
                        rulesParsed: {
                            valid: store.parsedApprovalRules().rules.length,
                            ignored: store.parsedApprovalRules().ignored,
                        },
                    },
                });
            }
            catch (err) {
                sendJson(res, 400, { ok: false, message: err?.message || '保存操作记录设置失败' });
            }
        },
    });
}
