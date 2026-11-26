/**
 * 审核弹窗 + 守护轮询（命令式 DOM）。
 *
 * 为什么**不用 React 组件**（与本仓其余 18 个 UI 模块不同）：
 * 那些模块都挂在具名 slot 上（`sidebar.right.pane.tab` / `main` / `sidebar.panellist`），
 * 而 slot 只在对应面板被打开时才渲染。审核弹窗恰恰必须在"用户没打开 GitHub 面板"
 * 时也能弹出来——否则一次高危操作会静静等到 180s 超时。命令式挂 `document.body`
 * 是这里唯一能保证"一定看得见"的做法，代价是手写这 200 行 DOM。
 *
 * 三条交互约束：
 * 1. 只在标签页可见时高频轮询（2s），隐藏时降到 15s——审阅弹窗不该烧电池；
 * 2. 一次只展示队首那一条（先到先审），顶部显示"还有 N 条"；
 * 3. 拒绝必须能写留言，且留言原文回传（模型据此改，而不是瞎猜）。
 */

/** 与服务端 `PendingApproval` 对齐（只取展示所需字段） */
interface PendingItem {
  id: string;
  at: number;
  tool: string;
  action: string;
  summary: string;
  warning?: string;
  impact?: string;
  argsHash: string;
  sessionId?: string;
  repo?: string;
}

const OVERLAY_ID = 'dsh-github-approval-overlay';
const POLL_VISIBLE_MS = 2_000;
const POLL_HIDDEN_MS = 15_000;
/**
 * 单次待审拉取的客户端超时。
 * 为什么必须有：轮询是"排定下一轮"而不是"await 上一轮"（一 await 就整条心跳跟着最慢的那次走），
 * 所以一旦请求悬挂，`polling` 永不复位、心跳随之停摆——那正是"审核静默失效"的同一条路。
 * 5 s 是回环上 ~1 ms 的 5000 倍，足够宽松；即便真超时，距 60 s 的心跳 TTL 仍有 11 次机会。
 */
const PENDING_TIMEOUT_MS = 5_000;

/**
 * 启动审核守护。返回 disposer（挂 `ctx.effect`）。
 *
 * @param win 注入 window（测试用；缺省全局 window）
 */
export function startApprovalWatcher(win: any = typeof window === 'undefined' ? null : window): () => void {
  if (!win || !win.document) return () => {};
  const doc = win.document;
  // 防重入：客户端插件若被重复 apply（HMR / 多入口），不能再起第二套轮询
  if (win.__dshGithubApprovalWatcher) return () => {};
  win.__dshGithubApprovalWatcher = true;

  let token: string | null = null;
  let timer: any = null;
  let stopped = false;
  let busy = false;
  /** 单飞：同一时刻只允许一个待审拉取在途（慢链路不叠请求，旧响应也盖不掉新队首） */
  let polling = false;
  let current: PendingItem | null = null;
  let total = 0;

  const el = (tag: string, style: any, text?: string) => {
    const node = doc.createElement(tag);
    if (style) Object.assign(node.style, style);
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const closeOverlay = () => {
    const existing = doc.getElementById(OVERLAY_ID);
    if (existing) existing.remove();
    current = null;
  };

  const post = (path: string, body: any) =>
    win
      .fetch('/api/github' + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
      .then((r: any) => r.json().catch(() => null));

  const decide = (kind: 'approved' | 'rejected', feedback?: string) => {
    if (!current || busy) return;
    busy = true;
    // 必须把 argsHash 带回服务端：弹窗上显示的「参数指纹」要与被批准的那一条真的对得上
    post('/approval/decision', {
      id: current.id,
      decision: kind,
      argsHash: current.argsHash,
      ...(feedback ? { feedback } : {}),
      token,
    })
      .then(() => {
        busy = false;
        // 409（已超时 / 已被别的标签页处理）与 200 对用户是同一件事：这条审批结束了。
        // 所以**不要**按 ok 分叉——分出去的那条分支只会写着和另一条一样的代码。
        closeOverlay();
        tick();
      })
      .catch(() => { busy = false; });
  };

  const render = (item: PendingItem) => {
    closeOverlay();
    current = item;

    const overlay = el('div', {
      position: 'fixed',
      inset: '0',
      zIndex: '100001',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.45)',
    });
    overlay.id = OVERLAY_ID;
    overlay.className = 'dsh-github-modal-overlay';

    const dialog = el('div', {
      width: 'min(560px, 92vw)',
      maxHeight: '82vh',
      overflow: 'auto',
      borderRadius: '10px',
      padding: '16px 18px',
      boxSizing: 'border-box',
      background: 'var(--dsw-alias-bg-module-platform, #ffffff)',
      color: 'var(--dsw-alias-label-primary, #1f2328)',
      border: '1px solid var(--dsw-alias-border-l2, #d1d9e0)',
      boxShadow: '0 12px 40px rgba(0,0,0,0.28)',
    });
    dialog.className = 'dsh-github-modal-dialog';

    const head = el('div', { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' });
    head.appendChild(el('span', { fontSize: '16px' }, '🛡️'));
    head.appendChild(el('strong', { fontSize: '14px' }, '需要你确认这次操作'));
    head.appendChild(el('span', { fontSize: '11px', opacity: '0.7', marginLeft: 'auto' }, total > 1 ? `还有 ${total - 1} 条待审` : ''));
    dialog.appendChild(head);

    dialog.appendChild(el('div', { fontSize: '12px', opacity: '0.8', marginBottom: '6px' }, 'Agent 想执行：'));
    dialog.appendChild(el('div', { fontSize: '13px', fontWeight: '600', marginBottom: '8px', wordBreak: 'break-word' }, item.summary));
    dialog.appendChild(
      el(
        'div',
        { fontSize: '11px', opacity: '0.75', marginBottom: '10px', fontFamily: 'monospace', wordBreak: 'break-all' },
        `${item.tool}.${item.action}${item.repo ? ' · ' + item.repo : ''} · 参数指纹 ${item.argsHash}`
      )
    );
    if (item.warning) {
      dialog.appendChild(el('div', { fontSize: '12px', color: '#9a6700', marginBottom: '6px', lineHeight: '1.5' }, item.warning));
    }
    if (item.impact) {
      dialog.appendChild(el('div', { fontSize: '12px', opacity: '0.85', marginBottom: '10px', lineHeight: '1.5' }, item.impact));
    }

    const feedbackBox = el('textarea', {
      display: 'none',
      width: '100%',
      minHeight: '62px',
      marginTop: '6px',
      padding: '8px',
      boxSizing: 'border-box',
      fontSize: '12px',
      borderRadius: '6px',
      border: '1px solid var(--dsw-alias-border-l2, #d1d9e0)',
      background: 'transparent',
      color: 'inherit',
      resize: 'vertical',
    }) as any;
    feedbackBox.placeholder = '告诉 Agent 该怎么做，例如：改成 squash，别删分支';
    feedbackBox.maxLength = 2000;

    const actions = el('div', { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' });
    const rejectBtn = el('button', {
      padding: '6px 12px',
      fontSize: '12px',
      cursor: 'pointer',
      borderRadius: '6px',
      border: '1px solid var(--dsw-alias-border-l2, #d1d9e0)',
      background: 'transparent',
      color: '#cf222e',
    }, '拒绝并留言') as any;
    const approveBtn = el('button', {
      padding: '6px 12px',
      fontSize: '12px',
      cursor: 'pointer',
      borderRadius: '6px',
      border: '1px solid #1a7f37',
      background: '#1a7f37',
      color: '#ffffff',
    }, '批准执行') as any;
    const confirmRejectBtn = el('button', {
      padding: '6px 12px',
      fontSize: '12px',
      cursor: 'pointer',
      borderRadius: '6px',
      border: '1px solid #cf222e',
      background: '#cf222e',
      color: '#ffffff',
      display: 'none',
    }, '确认拒绝') as any;

    rejectBtn.onclick = () => {
      feedbackBox.style.display = 'block';
      rejectBtn.style.display = 'none';
      confirmRejectBtn.style.display = 'inline-block';
      feedbackBox.focus();
    };
    confirmRejectBtn.onclick = () => decide('rejected', String(feedbackBox.value || '').trim());
    approveBtn.onclick = () => decide('approved');

    actions.appendChild(rejectBtn);
    actions.appendChild(confirmRejectBtn);
    actions.appendChild(approveBtn);
    dialog.appendChild(feedbackBox);
    dialog.appendChild(actions);

    overlay.appendChild(dialog);
    doc.body.appendChild(overlay);
    // 刻意不做"点遮罩关闭"：这不是信息弹窗，误关等于把问题藏起来。
    // 也不做 Esc 关闭：同上。要离开就明确选批准或拒绝。
  };

  /*
   * 轮询**不因标签页隐藏而停止**，只降频（2s → 15s，见 schedule）。
   *
   * 为什么不能像云端轮询那样在隐藏时整段跳过：`GET /pending` 同时是**在线心跳**
   * （服务端 `queue.heartbeat()`）。跳过它 = 心跳停摆，60s 后 `isClientOnline()`
   * 变 false，`ask()` 直接返回 `no-client` → 审核静默失效，高危操作不经审批就执行。
   * 而"切到别的标签页看看"恰恰是最常见的使用现场，那不是失败场景而是正常使用。
   * 一次本地回环 GET < 1ms，省它没有意义；省掉的是审批本身。
   *
   * 单飞 + 超时闸成对出现，缺一个就会退化成另一种停摆：
   * - 没有单飞：慢链路下请求层层叠加，旧响应还会盖掉新队首；
   * - 没有超时：一次卡死的请求让 `polling` 永不复位，轮询彻底停摆（= 心跳饿死）。
   */
  const tick = () => {
    if (stopped) return;
    if (busy) return;
    if (polling) return;
    polling = true;
    const ctrl = typeof win.AbortController === 'function' ? new win.AbortController() : null;
    const watchdog = ctrl
      ? win.setTimeout(() => { try { ctrl.abort(); } catch { /* 忽略 */ } }, PENDING_TIMEOUT_MS)
      : 0;
    const settleSlot = () => {
      polling = false;
      if (ctrl) { try { win.clearTimeout(watchdog); } catch { /* 忽略 */ } }
    };
    win
      .fetch('/api/github/approval/pending', ctrl ? { signal: ctrl.signal } : undefined)
      .then((r: any) => r.json().catch(() => null))
      .then((j: any) => {
        /*
         * 响应回来时必须**再查一次** stopped：从发出请求到结算之间可能已经 dispose()
         * （热重载 / 插件卸载），而 dispose 已经 closeOverlay 拆过 DOM 了。少了这一行，
         * 迟到的响应会把弹窗重新挂回 document.body——那一刻哨兵位已复位、定时器已清，
         * 没有任何人会再来关掉它。实测复现。
         */
        if (stopped) return;
        if (!j || !j.ok) return;             // 路由还没重启出来：静默重试，不弹错
        const data = j.data || {};
        if (typeof data.token === 'string' && data.token) token = data.token;
        const items: PendingItem[] = Array.isArray(data.items) ? data.items : [];
        total = items.length;
        if (items.length === 0) { closeOverlay(); return; }
        // 队首变化（旧的被别处处理了）或不一致时重绘
        if (!current || current.id !== items[0].id) render(items[0]);
      })
      .catch(() => { /* 网络抖动 / 主动超时：下一轮再说 */ })
      .then(settleSlot, settleSlot);
  };

  const schedule = () => {
    if (stopped) return;
    const delay = doc.visibilityState === 'hidden' ? POLL_HIDDEN_MS : POLL_VISIBLE_MS;
    timer = win.setTimeout(() => {
      tick();
      schedule();
    }, delay);
  };

  // 客户端插件加载即声明"我在线"：面板没打开也算——否则关了面板就等于关掉审核
  post('/approval/heartbeat', {}).catch(() => {});
  tick();
  schedule();

  return () => {
    stopped = true;
    try { win.clearTimeout(timer); } catch { /* 忽略 */ }
    closeOverlay();
    win.__dshGithubApprovalWatcher = false;
  };
}
