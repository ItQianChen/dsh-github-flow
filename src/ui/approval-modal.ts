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
    post('/approval/decision', { id: current.id, decision: kind, ...(feedback ? { feedback } : {}), token })
      .then((j: any) => {
        busy = false;
        // 409（已超时 / 已被别的标签页处理）也当作"结束"：刷新即可，不必报错吓人
        if (j && j.ok) { closeOverlay(); }
        else { closeOverlay(); }
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

  const tick = () => {
    if (stopped) return;
    if (doc.visibilityState === 'hidden') return;
    if (busy) return;
    win
      .fetch('/api/github/approval/pending')
      .then((r: any) => r.json().catch(() => null))
      .then((j: any) => {
        if (!j || !j.ok) return;             // 路由还没重启出来：静默重试，不弹错
        const data = j.data || {};
        if (typeof data.token === 'string' && data.token) token = data.token;
        const items: PendingItem[] = Array.isArray(data.items) ? data.items : [];
        total = items.length;
        if (items.length === 0) { closeOverlay(); return; }
        // 队首变化（旧的被别处处理了）或不一致时重绘
        if (!current || current.id !== items[0].id) render(items[0]);
      })
      .catch(() => { /* 网络抖动：下一轮再说 */ });
  };

  const schedule = () => {
    if (stopped) return;
    const delay = doc.visibilityState === 'hidden' ? POLL_HIDDEN_MS : POLL_VISIBLE_MS;
    timer = win.setTimeout(() => {
      tick();
      schedule();
    }, delay);
    timer?.unref?.();
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
