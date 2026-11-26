/**
 * 人工审核路由（轮询待审 / 提交决定 / 心跳）。
 *
 * 三条都**不做**写业务：它们只把人的动作送进 `ApprovalQueue`，
 * 由 `main.ts` 的 `tools/execute` 接线决定工具能不能跑。
 *
 * CSRF：decision / heartbeat 都会改变进程状态（放行一次高危操作），
 * 必须过 `guardLocalWrite({ requireJson: true })`——与删除/清空同一套门。
 */
import type { RouteDeps } from './route-helpers.js';
import { guardLocalWrite } from './route-helpers.js';
import type { ApprovalQueue } from '../approval.js';

export function registerApprovalRoutes(deps: RouteDeps, queue: ApprovalQueue): void {
  const { bindRoute, sendJson, readJsonBody } = deps;

  // 1. 待审列表（UI 轮询）。轮询本身即在线证据，顺手刷新心跳。
  bindRoute({
    kind: 'exact',
    path: '/api/github/approval/pending',
    handler: async (req: any, res: any) => {
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, message: '仅支持 GET 请求' });
        return;
      }
      try {
        queue.heartbeat();
        const data = {
          items: queue.list(),
          // token 只下发给本机浏览器：决策请求必须带它（提高伪造门槛，非安全边界）
          token: queue.token,
          clientOnline: queue.isClientOnline(),
          disabled: queue.disabledBecause(),
          timeoutMs: queue.currentTimeoutMs(),
        };
        sendJson(res, 200, { ok: true, data });
      } catch (err: any) {
        sendJson(res, 500, { ok: false, message: err?.message || '读取待审列表失败' });
      }
    },
  });

  // 2. 提交决定（批准 / 拒绝 + 留言）
  bindRoute({
    kind: 'exact',
    path: '/api/github/approval/decision',
    handler: async (req: any, res: any) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, message: '仅支持 POST 请求' });
        return;
      }
      if (!guardLocalWrite(req, res, { requireJson: true })) return;
      try {
        const body = await readJsonBody(req);
        const id = typeof body?.id === 'string' ? body.id : '';
        const decision = body?.decision;
        if (!id || (decision !== 'approved' && decision !== 'rejected')) {
          sendJson(res, 400, { ok: false, message: '缺少 id 或 decision 非法（approved / rejected）' });
          return;
        }
        if (typeof body?.feedback === 'string' && body.feedback.length > 2000) {
          sendJson(res, 400, { ok: false, message: '留言超过 2000 字上限' });
          return;
        }
        const result = queue.decide(id, decision, {
          feedback: typeof body?.feedback === 'string' ? body.feedback : undefined,
          // 指纹必传：批准的是弹窗上显示的那一份参数。缺了或对不上都由队列判 mismatch。
          argsHash: typeof body?.argsHash === 'string' ? body.argsHash : undefined,
          token: typeof body?.token === 'string' ? body.token : undefined,
        });
        if (result.ok) {
          sendJson(res, 200, { ok: true, data: { id, decision } });
          return;
        }
        if (result.reason === 'forbidden') {
          sendJson(res, 403, { ok: false, message: '决策令牌无效' });
          return;
        }
        if (result.reason === 'mismatch') {
          // 指纹不符 = 待审项已经不是人看到的那一条（换参 / id 串了 / 前端缓存过期）
          sendJson(res, 400, { ok: false, message: '参数指纹不匹配，请刷新后重新审核' });
          return;
        }
        if (result.reason === 'already-decided' || result.reason === 'not-found') {
          // 两者对用户是同一件事：这条审批已经不在了（可能刚超时 / 已被另一个标签页处理）
          sendJson(res, 409, { ok: false, message: '该审批已结束（超时 / 已处理），请刷新' });
          return;
        }
        sendJson(res, 400, { ok: false, message: '决策参数非法' });
      } catch (err: any) {
        sendJson(res, 400, { ok: false, message: err?.message || '提交审批结果失败' });
      }
    },
  });

  // 3. 心跳（面板加载即开始，用于"有没有人在看"的判定）
  bindRoute({
    kind: 'exact',
    path: '/api/github/approval/heartbeat',
    handler: async (req: any, res: any) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, message: '仅支持 POST 请求' });
        return;
      }
      if (!guardLocalWrite(req, res, { requireJson: true })) return;
      try {
        // body 可空：这里只排空流，避免 Node 对未消费的请求体直接断连
        await readJsonBody(req).catch(() => ({}));
        queue.heartbeat();
        sendJson(res, 200, { ok: true, data: { clientOnline: queue.isClientOnline(), disabled: queue.disabledBecause() } });
      } catch (err: any) {
        sendJson(res, 500, { ok: false, message: err?.message || '心跳失败' });
      }
    },
  });
}
