/**
 * 操作记录路由（列表 / 删除 / 清空）。
 *
 * 边界：
 * - 本分组**不产生**记录，只读取与删除 `AuditStore`；写入发生在 `tools/result` 切面。
 * - 删除用 `POST + JSON body` 而不是 `DELETE + body`：本项目所有写端点统一走
 *   「JSON body + application/json 媒体类型」这道 CSRF 门（`guardLocalWrite({requireJson})`
 *   依赖 body 的 Content-Type）。`DELETE` 带 body 在 Node/浏览器组合上行为不一致，
 *   为一个动词不一致去分裂两套校验不值。
 * - 不做分页游标：行数上限 2000，`offset` 足够。
 */
import type { RouteDeps } from './route-helpers.js';
import { guardLocalWrite } from './route-helpers.js';
import type { AuditRisk, AuditStore } from '../audit.js';

/** 单页上限：UI 一次最多看 200 条，再多也没有阅读价值 */
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;
/** 单次删除的 id 数上限：防止一个超大 body 把内存打满 */
const MAX_DELETE_IDS = 500;

function parseBool(v: string | null): boolean | undefined {
  if (v === null) return undefined;
  if (v === '1' || v === 'true') return true;
  if (v === '0' || v === 'false') return false;
  return undefined;
}

function normalizeLimit(v: string | null): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

function normalizeOffset(v: string | null): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

export function registerAuditRoutes(deps: RouteDeps, store: AuditStore): void {
  const { bindRoute, sendJson, readJsonBody } = deps;

  // 1. 记录列表（只读）
  bindRoute({
    kind: 'exact',
    path: '/api/github/audit/records',
    handler: async (req: any, res: any) => {
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, message: '仅支持 GET 请求' });
        return;
      }
      try {
        const u = new URL(req.url || '/', 'http://127.0.0.1');
        const riskRaw = u.searchParams.get('risk');
        const risk: AuditRisk | undefined =
          riskRaw === 'read' || riskRaw === 'write' || riskRaw === 'destructive' ? riskRaw : undefined;
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
          since: Number.isFinite(since as number) ? (since as number) : undefined,
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
      } catch (err: any) {
        sendJson(res, 500, { ok: false, message: err?.message || '读取操作记录失败' });
      }
    },
  });

  // 2. 删除指定记录（追加墓碑 + 压实，文件里不再残留这些 id 的字节）
  bindRoute({
    kind: 'exact',
    path: '/api/github/audit/records/delete',
    handler: async (req: any, res: any) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, message: '仅支持 POST 请求' });
        return;
      }
      if (!guardLocalWrite(req, res, { requireJson: true })) return;
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
        if (!ids.every((v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 128)) {
          sendJson(res, 400, { ok: false, message: 'ids 中存在非法元素' });
          return;
        }
        const removed = await store.delete(ids as string[]);
        sendJson(res, 200, { ok: true, data: { removed } });
      } catch (err: any) {
        sendJson(res, 400, { ok: false, message: err?.message || '删除操作记录失败' });
      }
    },
  });

  // 3. 清空全部记录
  bindRoute({
    kind: 'exact',
    path: '/api/github/audit/records/clear',
    handler: async (req: any, res: any) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, message: '仅支持 POST 请求' });
        return;
      }
      if (!guardLocalWrite(req, res, { requireJson: true })) return;
      try {
        // body 可为空对象；这里只排空流，避免 Node 对未消费的请求体直接断连
        await readJsonBody(req).catch(() => ({}));
        await store.clear();
        sendJson(res, 200, { ok: true, data: { cleared: true } });
      } catch (err: any) {
        sendJson(res, 500, { ok: false, message: err?.message || '清空操作记录失败' });
      }
    },
  });

  // 4. 开关与预算：热生效 + 落盘（store 内部负责 saveAuditSettings）
  //
  // 为什么一个端点管两个字段：它们落在同一个设置文件、同一个设置分区，
  // 分成两个端点只会让"同时改两项"变成两次请求两次重绘。
  bindRoute({
    kind: 'exact',
    path: '/api/github/audit/settings',
    handler: async (req: any, res: any) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, message: '仅支持 POST 请求' });
        return;
      }
      if (!guardLocalWrite(req, res, { requireJson: true })) return;
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
        let usage = store.usage();
        if (typeof body?.enabled === 'boolean') usage = await store.setEnabled(body.enabled);
        if (body?.budgetMB !== undefined) usage = await store.setBudget(Math.round(Number(body.budgetMB) * 1024 * 1024));
        sendJson(res, 200, { ok: true, data: { usage } });
      } catch (err: any) {
        sendJson(res, 400, { ok: false, message: err?.message || '保存操作记录设置失败' });
      }
    },
  });
}
