// test/phase53-approval.test.mjs
//
// 执行前人工审核闸门（`src/approval-gate.ts`）契约测试。
//
// 为什么这组断言长这样：s2 的 v1 自建了整套审批队列 + 自绘弹窗 + 三条路由，全部回退。
// v2 把「问人」交回 DSH 官方 `ctx.approval`，插件只剩**一个判定**和**一次请求**。
// 于是风险从"弹窗画得对不对"变成了四个纯逻辑问题，这里逐个钉死：
//   ① 该问的不许漏（漏 = 高危操作没人看）
//   ② 不该问的不许问（多问 = 用户关掉功能）
//   ③ `policy=never` 必须短路（否则 danger-full-access 预设下插件完全不能用）
//   ④ `unavailable` 必须区别于 `rejected`（否则 headless 部署把写操作全判死）
//
// 全部离线：注入假 `ctx.approval`，不启 DSH、不碰网络、不写真实数据目录。

import path from 'node:path';
import os from 'node:os';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

let passed = 0;
let failed = 0;
function ok(cond, name, extra) {
  if (cond) {
    passed++;
    console.log(`✅ PASS: ${name}`);
  } else {
    failed++;
    console.error(`❌ FAIL: ${name}${extra !== undefined ? '  → ' + extra : ''}`);
  }
}

const lib = (p) => `file://${path.join(ROOT, p).replace(/\\/g, '/')}`;
const {
  shouldAsk, resolveEffectivePolicy, askReason, rejectionMessage, createApprovalGate, MAX_REASON_CHARS, flattenBody,
} = await import(lib('lib/approval-gate.js'));
const {
  guardDestructive, wrapWithGate, markApproved, resetApprovedCalls, isDestructiveCall,
  DESTRUCTIVE_ACTIONS, GATE_BLOCKED,
} = await import(lib('lib/destructive.js'));
const { AuditStore, AUDITED_TOOLS } = await import(lib('lib/audit.js'));
const { WRITE_ACTIONS } = await import(lib('lib/tool-tiers.js'));
const {
  createTargetInfoResolver, stashTargetTitle, takeTargetTitle, resetTargetTitles,
} = await import(lib('lib/target-title.js'));

/* ---------------- 夹具 ---------------- */

let seq = 0;
/** 造一个宿主 `ToolExecution` 的最小替身（只含闸门真正读的字段） */
function execOf(name, args, extra) {
  seq++;
  return {
    name,
    arguments: args,
    callId: 'call-' + seq,
    agent: { id: 'agent-1', session: { id: 'sess-1' } },
    signal: { aborted: false, tag: 'signal-' + seq },
    ...(extra || {}),
  };
}

/**
 * 假 approval 服务。
 * `outcome` 模拟宿主四态；`config === null` / `overrideOf → undefined` 用来模拟
 * "策略读不出来"（真实宿主里 config.policy 是 public 构造参数）。
 */
function fakeApproval(opts) {
  const o = opts || {};
  const state = {
    requests: [],
    outcome: o.outcome || 'allowed-once',
    throwOnRequest: o.throwOnRequest === true,
  };
  const approval = {
    config: Object.prototype.hasOwnProperty.call(o, 'config') ? o.config : { policy: 'ask' },
    overrideOf: () => o.override,
    async request(req) {
      state.requests.push(req);
      if (state.throwOnRequest) throw new Error('approval.request() outside an open turn');
      return state.outcome;
    },
  };
  return { approval, state };
}

/** 造闸门 + 记录器。`next` 计数用于证明"到底有没有放行" */
function makeGate(opts) {
  const o = opts || {};
  const log = { decisions: [], warns: [] };
  const gate = createApprovalGate({
    getMode: () => (o.mode === undefined ? 'destructive' : o.mode),
    getApproval: () => (Object.prototype.hasOwnProperty.call(o, 'approval') ? o.approval : undefined),
    recordDecision: (id, decision) => log.decisions.push({ id, decision }),
    warn: (m) => log.warns.push(m),
  });
  const next = async () => {
    next.count++;
    return { kind: 'allow' };
  };
  next.count = 0;
  return { gate, log, next };
}

/* ================================================================ */
console.log('\n--- 0. 作用域：只有 PR / Issue，且只有写操作 ---');

ok(AUDITED_TOOLS.length === 2 && AUDITED_TOOLS.includes('github_pr') && AUDITED_TOOLS.includes('github_issue'),
  '审核作用域 = AUDITED_TOOLS（PR + Issue），与操作记录同源');
ok(shouldAsk(execOf('github_release', { action: 'delete', tag: 'v1' }), 'destructive') === false,
  '作用域外工具（release delete 有自己的 confirm 闸门）不进审核');
ok(shouldAsk(execOf('bash', { command: 'rm -rf /' }), 'all-writes') === false,
  '非本插件的工具名一律不碰（绝不拦别的插件）');
ok(shouldAsk(undefined, 'all-writes') === false, 'exec 缺失时不表态（不抛）');

console.log('\n--- 1. 档位：off / destructive / all-writes ---');
{
  const merge = () => execOf('github_pr', { action: 'merge', pr_number: 19 });
  ok(shouldAsk(merge(), 'destructive') === true, '[destructive] merge → 问');
  ok(shouldAsk(merge(), 'off') === false, '[off] merge → 不问');
  ok(shouldAsk(merge(), 'all-writes') === true, '[all-writes] merge → 问');

  ok(shouldAsk(execOf('github_pr', { action: 'list' }), 'all-writes') === false, '[all-writes] list（读）→ 不问');
  ok(shouldAsk(execOf('github_pr', { action: 'view', pr_number: 1 }), 'all-writes') === false, '[all-writes] view（读）→ 不问');

  ok(shouldAsk(execOf('github_pr', { action: 'create', title: 't' }), 'destructive') === false, '[destructive] create（写但非高危）→ 不问');
  ok(shouldAsk(execOf('github_pr', { action: 'create', title: 't' }), 'all-writes') === true, '[all-writes] create → 问');
  ok(shouldAsk(execOf('github_issue', { action: 'comment', issue_number: 3 }), 'all-writes') === true, '[all-writes] comment → 问');
}

console.log('\n--- 1b. destructive 档必须跟 `when` 条件走，不能只看键存在 ---');
{
  // 这是 `classifyRisk` 与 `isDestructiveCall` 的差别所在，也是最容易写错的一处
  ok(shouldAsk(execOf('github_pr', { action: 'checkout', pr_number: 1 }), 'destructive') === false,
    'pr checkout 不带 force → 不问（否则每次检出都弹窗）');
  ok(shouldAsk(execOf('github_pr', { action: 'checkout', pr_number: 1, force: true }), 'destructive') === true,
    'pr checkout + force → 问');
  ok(shouldAsk(execOf('github_issue', { action: 'transfer', issue_number: 1 }), 'destructive') === false,
    'issue transfer 缺 target_repo → 不问（精确报错留给工具本体）');
  ok(shouldAsk(execOf('github_issue', { action: 'transfer', issue_number: 1, target_repo: 'o/dst' }), 'destructive') === true,
    'issue transfer 有 target_repo → 问');
  ok(shouldAsk(execOf('github_pr', { action: 'merge' }), 'destructive') === false,
    'merge 缺 pr_number → 不问（闸门 when 与工具前置校验同口径）');
}

console.log('\n--- 1c. 覆盖面：destructive 6 条 / all-writes 21 条 ---');
{
  const auditedDestructive = Object.entries(DESTRUCTIVE_ACTIONS)
    .filter(([tool]) => AUDITED_TOOLS.includes(tool))
    .flatMap(([, actions]) => Object.keys(actions));
  ok(auditedDestructive.length === 6, '作用域内的闸门条目恰好 6 条', auditedDestructive.join(', '));

  const satisfied = [
    ['github_pr', { action: 'checkout', pr_number: 1, force: true }],
    ['github_pr', { action: 'merge', pr_number: 1 }],
    ['github_pr', { action: 'revert', pr_number: 1 }],
    ['github_issue', { action: 'close', issue_number: 1 }],
    ['github_issue', { action: 'delete', issue_number: 1 }],
    ['github_issue', { action: 'transfer', issue_number: 1, target_repo: 'o/dst' }],
  ];
  ok(satisfied.every(([tool, args]) => shouldAsk(execOf(tool, args), 'destructive') === true),
    'destructive 档逐条命中这 6 条（行为断言，不只看表长）');

  const writes = [...(WRITE_ACTIONS.github_pr), ...(WRITE_ACTIONS.github_issue)];
  ok(writes.length === 21, '作用域内写 action 恰好 21 条', String(writes.length));
  const toolOf = (a) => (WRITE_ACTIONS.github_pr.includes(a) ? 'github_pr' : 'github_issue');
  ok(writes.every((a) => shouldAsk(execOf(toolOf(a), { action: a, pr_number: 1, issue_number: 1 }), 'all-writes') === true),
    'all-writes 档逐条覆盖这 21 条写 action');
}

console.log('\n--- 1d. `confirm: true` 不豁免审核 ---');
{
  // 若豁免，模型只要每次都带上 confirm 就能永久绕过弹窗，审核退化成装饰
  ok(shouldAsk(execOf('github_pr', { action: 'merge', pr_number: 19, confirm: true }), 'destructive') === true,
    '带 confirm:true 的 merge 仍然要问');
  ok(isDestructiveCall('github_pr', { action: 'merge', pr_number: 19, confirm: true }) === true,
    'isDestructiveCall 不看 confirm（与 guardDestructive 的唯一差别）');
  ok(guardDestructive('github_pr', { action: 'merge', pr_number: 19, confirm: true }) === undefined,
    'guardDestructive 仍认 confirm（s1 语义不带回归）');
}

/* ================================================================ */
console.log('\n--- 2. 官方四态：allowed-once / rejected / cancelled / unavailable ---');
{
  const tool = 'github_pr';
  const args = { action: 'merge', pr_number: 19 };

  // allowed-once
  resetApprovedCalls();
  {
    const { approval, state } = fakeApproval({ outcome: 'allowed-once' });
    const { gate, log, next } = makeGate({ approval });
    const exec = execOf(tool, args);
    const verdict = await gate(exec, next);
    ok(state.requests.length === 1, 'allowed-once：恰好发起 1 次 request');
    ok(verdict.kind === 'allow' && next.count === 1, 'allowed-once：放行（next 恰好 1 次）');
    ok(log.decisions.length === 1 && log.decisions[0].decision === 'approved', 'allowed-once：记录 approved');
    ok(log.decisions[0].id === exec.callId, '决策记录的 id 复用宿主 callId（与 intent/result 折成一条）');
    ok(guardDestructive(tool, args, exec) === undefined, '批准后工具体的 confirm 闸门被旁路（一次操作只问一遍）');
    ok(guardDestructive(tool, args, exec) !== undefined, '旁路是一次性的：同一 callId 第二次仍拦（不残留）');
  }

  // rejected
  resetApprovedCalls();
  {
    const { approval } = fakeApproval({ outcome: 'rejected' });
    const { gate, log, next } = makeGate({ approval });
    const exec = execOf(tool, args);
    const verdict = await gate(exec, next);
    ok(verdict.kind === 'deny' && next.count === 0, 'rejected：next 零次（工具不执行）');
    ok(verdict.info && verdict.info.code === 'APPROVAL_REJECTED', 'rejected：info.code = APPROVAL_REJECTED');
    ok(verdict.info && verdict.info.name === 'ApprovalError', 'rejected：错误身份是 ApprovalError（可路由）');
    ok(typeof verdict.reason === 'string' && verdict.reason.includes('不要重试'), 'rejected：结论里明确"不要重试同一动作"');
    ok(typeof verdict.reason === 'string' && verdict.reason.includes('合并 PR #19'), 'rejected：结论里带上人话摘要，模型知道被拒的是什么');
    ok(log.decisions.length === 1 && log.decisions[0].decision === 'rejected', 'rejected：记录 rejected');
    ok(guardDestructive(tool, args, exec) !== undefined, 'rejected：不产生任何批准旁路');
  }

  // cancelled
  resetApprovedCalls();
  {
    const { approval } = fakeApproval({ outcome: 'cancelled' });
    const { gate, log, next } = makeGate({ approval });
    const verdict = await gate(execOf(tool, args), next);
    ok(verdict.kind === 'cancel' && next.count === 0, 'cancelled：交给宿主产出规范的 ABORTED_BEFORE_DISPATCH');
    ok(log.decisions.length === 1 && log.decisions[0].decision === 'cancelled', 'cancelled：记录 cancelled');
  }

  // unavailable —— 本组最关键：它**不是**拒绝
  resetApprovedCalls();
  {
    const { approval } = fakeApproval({ outcome: 'unavailable' });
    const { gate, log, next } = makeGate({ approval });
    const exec = execOf(tool, args);
    const verdict = await gate(exec, next);
    ok(verdict.kind === 'allow' && next.count === 1, 'unavailable：退回 next()（无 answerer ≠ 用户说不）');
    ok(log.decisions.length === 1 && log.decisions[0].decision === 'no-client', 'unavailable：记录 no-client（词汇与宿主四态一一对应）');
    ok(guardDestructive(tool, args, exec) !== undefined, 'unavailable：工具体的 confirm 闸门照样接管（工具仍可执行）');
  }
}

/* ================================================================ */
console.log('\n--- 3. request 入参：官方弹窗要什么就给什么 ---');
{
  resetApprovedCalls();
  const { approval, state } = fakeApproval({ outcome: 'allowed-once' });
  const { gate, next } = makeGate({ approval });
  const exec = execOf('github_pr', { action: 'merge', pr_number: 19, merge_method: 'rebase' });
  await gate(exec, next);
  const req = state.requests[0];
  ok(req.toolName === 'github_pr', 'request.toolName 传的是工具名');
  ok(req.callId === exec.callId, 'request.callId 传的是宿主 callId（UI 能把问题挂到那条工具调用上）');
  ok(req.agent === exec.agent, 'request.agent 是同一个 agent 引用（路由与审计都靠它）');
  ok(req.signal === exec.signal, 'request.signal 原样透传（停止键能结算成 cancelled）');
  ok(typeof req.reason === 'string' && req.reason.includes('合并 PR #19') && req.reason.includes('rebase'),
    'request.reason 是人话摘要', req.reason);
  ok(askReason(exec) === req.reason, 'askReason 是 reason 的唯一来源（审核与记录同一套措辞）');
  ok(rejectionMessage(exec).includes('合并 PR #19'), 'rejectionMessage 与 askReason 同源摘要');
}

/* ================================================================ */
console.log('\n--- 3b. 弹窗文案：动作 / 对象现状 / 正文，总长硬上限 1000 字 ---');
{
  /*
   * 背景：官方审核卡片只能显示一个字符串（reason），富内容插槽不可用（2026-11-26 事故）。
   * 用户实证「只有标题不好判断」后定为：多行展示"做什么 → 它是什么状态 → 它说了什么"，
   * 最高 1000 字，超出截掉尾部加省略符。卡片正文区自带滚动，按钮不会被顶出去。
   */
  const reasonOf = (tool, args, target) => askReason({ name: tool, arguments: args, callId: 'c', agent: {}, signal: {} }, target);
  const linesOf = (text) => text.split('\n');

  // ---- 创建 / 编辑 / 评论：展示"将要提交什么" ----
  const body25 = '这是一段正文，用来确认弹窗里能看到它有多少字。';
  const createLines = linesOf(reasonOf('github_pr', { action: 'create', title: 'feat: 支持组织视图', base: 'master', body: body25 }));
  ok(createLines[0] === '即将执行：创建 PR「feat: 支持组织视图」 → master', '创建 PR：首行是动作摘要', createLines[0]);
  ok(createLines[1] === '将提交的正文：' + body25, '创建 PR：第二行是**将要提交的正文原文**（不再是"正文 N 字"）', createLines[1]);
  ok(createLines.join('\n').split('feat: 支持组织视图').length - 1 === 1, '标题只出现一次（不与摘要重复）');

  const editLines = linesOf(reasonOf('github_pr', { action: 'edit', pr_number: 19, title: '改过的标题', body: '新正文' }, '改前的旧标题'));
  ok(editLines[0] === '即将执行：修改 PR #19｜「改前的旧标题」', 'edit：首行带对象的**当前**标题（改的是哪一条）', editLines[0]);
  ok(editLines.includes('新标题：改过的标题'), 'edit：给出新标题');
  ok(editLines.includes('将提交的正文：新正文'), 'edit：给出将要提交的新正文', editLines.join(' / '));

  const commentReason = reasonOf('github_issue', { action: 'comment', issue_number: 3, body: '这条评论会公开可见' });
  ok(linesOf(commentReason).includes('将发表的评论：这条评论会公开可见'), '评论：评论正文直接进弹窗', commentReason);
  const longComment = reasonOf('github_pr', { action: 'comment', pr_number: 1, body: '甲'.repeat(300) });
  ok(longComment.includes('甲'.repeat(300)) && !longComment.includes('……'), '300 字评论在 1000 字上限内 → 完整显示、不截断');
  ok(reasonOf('github_issue', { action: 'comment', issue_number: 1 }).includes('将发表的评论：（空评论）'), '空评论显式说明，而不是留空');

  const fileReason = reasonOf('github_issue', { action: 'create', title: 't', body_file: 'docs/body.md' });
  ok(fileReason.includes('来自本地文件 docs/body.md') && fileReason.includes('审核时不读取文件内容'), 'body_file 通道如实说明来源（审核阶段不读文件）', fileReason);

  // Markdown 必须被压平（卡片是纯文本，## ** ![()] 原样露出就是噪音）
  const mdAll = reasonOf('github_pr', {
    action: 'create', title: 't',
    body: '## 概要\n\n做了：\n\n- [ ] A\n- [x] B\n\n详见 [设计文档](https://x.y/z)。![图](https://x.y/i.png)\n\n```js\ncode()\n```',
  });
  const mdLines = linesOf(mdAll);
  ok(!/[#*`]/.test(mdAll) && !mdAll.includes(']('), 'Markdown 标记被去掉、链接与图片不残留原始语法', mdAll);
  ok(mdLines.includes('· ☐ A') && mdLines.includes('· ☑ B'),
    '任务列表：转成复选框符号，且**每个列表项独占一行**（真机截图实证：挤在一行像流水账）', mdAll);
  const mdTail = mdLines.slice(2).join(' / ');
  ok(mdTail.includes('设计文档') && mdTail.includes('［图］') && mdTail.includes('code()'), '链接留文字、图片留占位、围栏内代码保留', mdTail);
  ok(mdLines[1].startsWith('将提交的正文：概要 做了：') , '普通段落仍用空格衔接（不被拆成大量短行）', mdLines[1]);

  // ---- 按编号操作既有实体：对象现状 + 正文 ----
  ok(reasonOf('github_pr', { action: 'merge', pr_number: 19 }) === '即将执行：合并 PR #19（squash）', '没取到远端信息 → 退回纯摘要（不留空的「」）');
  ok(askReason({ name: 'github_pr', arguments: { action: 'merge', pr_number: 19 } }, 'fix: 权限校验失效')
    === '即将执行：合并 PR #19（squash）｜「fix: 权限校验失效」', '第二个参数兼容纯字符串标题：文案 = 动作摘要｜「标题」');

  const prTarget = {
    title: 'feat(proxy): 跟随系统代理', state: 'OPEN', isDraft: false, author: 'mrgeda',
    additions: 1834, deletions: 912, changedFiles: 38, commentsCount: 12,
    reviewDecision: 'CHANGES_REQUESTED', checkState: 'FAILURE', body: '这个 PR 重写了整个模块。',
  };
  const prLines = linesOf(reasonOf('github_pr', { action: 'merge', pr_number: 21, delete_branch: true }, prTarget));
  ok(prLines[0] === '即将执行：合并 PR #21（squash，删源分支）｜「feat(proxy): 跟随系统代理」', 'PR：首行带标题', prLines[0]);
  ok(prLines[1] === '状态：开放 · 作者：@mrgeda · +1834 −912 · 改动 38 个文件 · CI 失败 · 被要求修改 · 12 条评论',
    'PR：元信息一行给出状态/作者/增删/文件数/CI/评审/评论数', prLines[1]);
  ok(prLines[2] === '正文：这个 PR 重写了整个模块。', 'PR：第三行是对象正文', prLines[2]);

  for (const [state, text] of [['SUCCESS', 'CI 通过'], ['PENDING', 'CI 进行中'], ['ERROR', 'CI 出错'], [null, '无 CI 检查']]) {
    const l = linesOf(reasonOf('github_pr', { action: 'merge', pr_number: 1 }, { ...prTarget, checkState: state }))[1] || '';
    ok(l.includes(text), `CI 汇总：${String(state)} → 「${text}」（null 是"没有检查"，不能说成通过）`, l);
  }
  ok(!((linesOf(reasonOf('github_pr', { action: 'merge', pr_number: 1 }, { title: 't', checkState: undefined }))[1] || '').includes('CI')),
    'CI 状态没取到 → 不显示，而不是编一个');

  const issueTarget = { title: '组织视图', state: 'CLOSED', stateReason: 'NOT_PLANNED', author: 'a', commentsCount: 1, body: '正文。' };
  ok(linesOf(reasonOf('github_issue', { action: 'reopen', issue_number: 17 }, issueTarget))[1] === '状态：已关闭（未计划） · 作者：@a · 1 条评论',
    'Issue：已关闭必须带关闭原因（已完成 / 未计划语义相反）');
  ok(linesOf(reasonOf('github_issue', { action: 'reopen', issue_number: 17 }, { ...issueTarget, state: 'OPEN', stateReason: 'REOPENED' }))[1].startsWith('状态：开放'),
    'Issue：开放状态不显示关闭原因');
  ok(linesOf(reasonOf('github_pr', { action: 'merge', pr_number: 1 }, { title: 't', state: 'OPEN', isDraft: true }))[1].startsWith('状态：草稿'), 'PR：草稿状态显示为草稿');
  ok(linesOf(reasonOf('github_pr', { action: 'merge', pr_number: 1 }, { title: 't', state: 'MERGED' }))[1] === '状态：已合并', 'PR：已合并');

  // 评论：先给"要发表的评论"，再有余量才带对象正文
  const cLines = linesOf(reasonOf('github_issue', { action: 'comment', issue_number: 17, body: '评论内容' }, { title: 'T', body: '对象正文' }));
  ok(cLines.indexOf('将发表的评论：评论内容') < cLines.indexOf('该 Issue 当前正文：对象正文'), '评论：要发表的评论排在对象正文之前', cLines.join(' / '));

  // create 不查远端，传了也不用
  const cNoBody = linesOf(askReason({ name: 'github_pr', arguments: { action: 'create', title: '新 PR', base: 'master' } }, '远端旧标题'));
  ok(cNoBody[0] === '即将执行：创建 PR「新 PR」 → master' && cNoBody[1] === '将提交的正文：（无）', 'create：不使用远端标题（它还不存在）；无正文时显式说明');

  // ---- 1000 字硬上限：超出截尾 + 省略符 ----
  ok(MAX_REASON_CHARS === 1000, '上限是 1000 字（用户定）');
  const huge = reasonOf('github_pr', { action: 'merge', pr_number: 20 }, { title: 'T', state: 'MERGED', body: '文'.repeat(5000) });
  ok(huge.length <= 1000, '总长（含省略符）不超过 1000', `实际 ${huge.length}`);
  ok(huge.endsWith('……'), '超出：截掉尾部并以省略符收尾');
  const hugeLines = linesOf(huge);
  ok(hugeLines[0] === '即将执行：合并 PR #20（squash）｜「T」' && hugeLines[1] === '状态：已合并', '超出：首行与元信息行完整保留，只裁正文');
  ok(hugeLines[2].startsWith('正文：文文文'), '超出：正文从开头保留（不是截头留尾）');
  const border = reasonOf('github_pr', { action: 'merge', pr_number: 1 }, { title: 'T', body: '文'.repeat(969) });
  ok(border.length <= 1000 && (border.length < 1000 || border.endsWith('……')), '卡在边界：要么完整、要么带省略符，不存在"被截了却没标记"', `实际 ${border.length}`);
  const longTitle = askReason({ name: 'github_pr', arguments: { action: 'merge', pr_number: 19 } }, '标'.repeat(400));
  // 首行前缀「即将执行：合并 PR #19（squash）｜「…」」本身约 26 字，标题自身裁到 120 字
  ok(longTitle.length <= 150 && longTitle.split('标').length - 1 === 120 && longTitle.includes('…」'),
    '超长标题自身被裁到 120 字并带省略号（不挤占正文额度）', `实际 ${longTitle.length}`);
}

/* ================================================================ */
console.log('\n--- 4. 策略：never 必须短路，读不出策略必须照常问 ---');
{
  resetApprovedCalls();
  const { approval, state } = fakeApproval({ outcome: 'allowed-once', override: 'never' });
  const { gate, log, next } = makeGate({ approval });
  await gate(execOf('github_pr', { action: 'merge', pr_number: 1 }), next);
  ok(state.requests.length === 0, 'override=never：一次 request 都不发（宿主会直接判死）');
  ok(next.count === 1, 'override=never：退回 next()，交给工具体的 confirm 闸门');
  ok(log.warns.length === 0, 'override=never：不是异常路径，不打 warn');
}
{
  resetApprovedCalls();
  const { approval, state } = fakeApproval({ outcome: 'allowed-once', config: { policy: 'never' } });
  const { gate, next } = makeGate({ approval });
  await gate(execOf('github_pr', { action: 'merge', pr_number: 1 }), next);
  ok(state.requests.length === 0, 'config.policy=never（无会话覆盖）：同样短路');
  ok(next.count === 1, 'config.policy=never：工具仍走 confirm 闸门，不被判死');
}
{
  resetApprovedCalls();
  const { approval, state } = fakeApproval({ outcome: 'allowed-once', override: 'ask', config: { policy: 'never' } });
  const { gate, next } = makeGate({ approval });
  await gate(execOf('github_pr', { action: 'merge', pr_number: 1 }), next);
  ok(state.requests.length === 1, '会话覆盖优先于部署默认（ask 压过 never）');
}
{
  resetApprovedCalls();
  const { approval, state } = fakeApproval({ outcome: 'allowed-once', config: null });
  const { gate, log, next } = makeGate({ approval });
  await gate(execOf('github_pr', { action: 'merge', pr_number: 1 }), next);
  ok(state.requests.length === 1, '策略读不出来：不判、照常问（绝不把"读不到"当 never）');
  ok(log.warns.length === 1, '策略读不出来：留一条 warn（可见性收紧时能查）');
  ok(resolveEffectivePolicy({ config: null }, { session: {} }) === undefined, 'resolveEffectivePolicy 读不出时返回 undefined');
  ok(resolveEffectivePolicy({ config: { policy: 'never' }, overrideOf: () => 'ask' }, { session: {} }) === 'ask',
    'resolveEffectivePolicy 的读取公式：override ?? config.policy');
  /*
   * 下面两条是"危险退化"的回归网：拿不到会话覆盖时**不能**退回 config.policy。
   * `danger-full-access` 预设把 never 写成**会话覆盖**，而 config.policy 恒为部署默认 'ask'；
   * 一旦退化成 'ask'，每次合并都会被宿主确定性拒绝、还一条日志都没有。
   */
  ok(resolveEffectivePolicy({ config: { policy: 'ask' }, overrideOf: () => undefined }, undefined) === undefined,
    '拿不到 agent/session → 判为读不出，绝不退化成 config.policy');
  ok(resolveEffectivePolicy({ config: { policy: 'ask' } }, { session: {} }) === undefined,
    'approval 上没有 overrideOf → 同样判为读不出（而不是默默用部署默认）');
}
{
  // 行为面：overrideOf 缺失时必须 warn + 照常问，而不是安静地按 ask 走
  resetApprovedCalls();
  const { approval, state } = fakeApproval({ outcome: 'allowed-once' });
  delete approval.overrideOf;
  const { gate, log, next } = makeGate({ approval });
  await gate(execOf('github_pr', { action: 'merge', pr_number: 1 }), next);
  ok(state.requests.length === 1 && log.warns.length === 1, 'overrideOf 缺失：warn 一次并照常发起审核');
}

/* ================================================================ */
console.log('\n--- 5. 无服务 / 异常一律不得阻断工具 ---');
{
  resetApprovedCalls();
  const { gate, log, next } = makeGate({ approval: undefined });
  const verdict = await gate(execOf('github_pr', { action: 'merge', pr_number: 1 }), next);
  ok(verdict.kind === 'allow' && next.count === 1, '没有 approval 服务（CLI/TUI profile）：直接放行');
  ok(log.warns.length === 0, '没有 approval 服务：安静降级，不打 warn');
}
{
  resetApprovedCalls();
  const { gate, next } = makeGate({ approval: { config: { policy: 'ask' } } });
  const verdict = await gate(execOf('github_pr', { action: 'merge', pr_number: 1 }), next);
  ok(verdict.kind === 'allow' && next.count === 1, 'approval 服务形状不对（无 request）：放行');
}
{
  resetApprovedCalls();
  const { approval } = fakeApproval({ throwOnRequest: true });
  const { gate, log, next } = makeGate({ approval });
  const verdict = await gate(execOf('github_pr', { action: 'merge', pr_number: 1 }), next);
  ok(verdict.kind === 'allow' && next.count === 1, 'request 抛错（无开启轮次）：不阻断工具');
  ok(log.warns.length === 1 && log.warns[0].includes('审核请求失败'), 'request 抛错：warn 里说明原因');
  ok(log.decisions.length === 0, 'request 抛错：不写决策（什么都没发生过）');
}
{
  // 正常路径不许有噪音：一次 allowed-once 的完整流程不应产生任何 warn
  resetApprovedCalls();
  const { approval } = fakeApproval({ outcome: 'allowed-once' });
  const { gate, log, next } = makeGate({ approval });
  await gate(execOf('github_pr', { action: 'merge', pr_number: 1 }), next);
  ok(log.warns.length === 0, '正常放行路径零 warn');
}
{
  // 缺 callId：允许问，但不写决策（写一条 id 为空的决策行只会在折叠时变成孤儿）
  resetApprovedCalls();
  const { approval, state } = fakeApproval({ outcome: 'rejected' });
  const { gate, log, next } = makeGate({ approval });
  await gate(execOf('github_pr', { action: 'merge', pr_number: 1 }, { callId: undefined }), next);
  ok(state.requests.length === 1 && !('callId' in state.requests[0]), '缺 callId：request 不带该字段');
  ok(log.decisions.length === 0, '缺 callId：不写无法折叠的决策行');
}

/* ================================================================ */
console.log('\n--- 6. 与既有 confirm 闸门的协同（一次操作只问一遍）---');
{
  resetApprovedCalls();
  const calls = [];
  const tool = {
    name: 'github_pr',
    description: 'd',
    parameters: {},
    output: {},
    async execute(args) { calls.push(args); return { message: 'merged' }; },
  };
  const wrapped = wrapWithGate(tool);
  markApproved('call-approved-1');
  const r = await wrapped.execute({ action: 'merge', pr_number: 19 }, { callId: 'call-approved-1' });
  ok(r.message === 'merged' && calls.length === 1, '批准后（wrapWithGate 带 callId）直达工具本体');
  resetApprovedCalls();
  const blocked = await wrapped.execute({ action: 'merge', pr_number: 19 }, { callId: 'call-other' });
  ok(blocked.status === GATE_BLOCKED && calls.length === 1, '未批准的同参数调用仍被闸门拦住');
  const legacy = await wrapped.execute({ action: 'merge', pr_number: 19 });
  ok(legacy.status === GATE_BLOCKED, '不传 exec（s1 形态）行为逐字不变');
  const confirmed = await wrapped.execute({ action: 'merge', pr_number: 19, confirm: true }, { callId: 'call-x' });
  ok(confirmed.message === 'merged' && calls.length === 2, 'confirm:true 照旧放行（s1 语义）');
  resetApprovedCalls();
}

/* ================================================================ */
console.log('\n--- 7. 记录折叠：决策行早于 intent 行也不能丢 ---');
{
  /*
   * s2 的落盘顺序是 decision（tools/pre-execute）→ intent + result（tools/result）。
   * v1 的折叠是"边走边贴"，遇到这个顺序会把决策静默丢弃——界面上表现为
   * "明明拒绝过，审核列却写着自动"。这里钉死顺序无关。
   */
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dsh-approval-'));
  try {
    const store = new AuditStore({ dir, flushDelayMs: 0 });
    const exec = { callId: 'c-before', agent: { id: 'sess-9' } };
    store.recordDecision('c-before', 'rejected');
    store.recordCall('github_pr', { action: 'merge', pr_number: 19 }, {
      isError: true,
      error: { message: '用户拒绝', info: { name: 'ApprovalError', code: 'APPROVAL_REJECTED' } },
      content: [],
    }, exec);
    const { items } = store.list();
    ok(items.length === 1, '决策先落盘 + intent 后落盘 → 仍折叠成 1 条记录', String(items.length));
    ok(items[0].decision === 'rejected', '先到的决策没有被丢弃', items[0].decision);
    ok(items[0].result === 'fail', '被拒绝的调用结果是 fail（不是假装成功）');
    await store.dispose();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ================================================================ */
console.log('\n--- 8. 下游监听器抛错不得被兜成「放行」（cordis waterfall 的共享队列）---');
{
  /*
   * cordis 把 `next` 实现成 `(cbs.shift() ?? inner)(...)`（lib/index.js:317-325），
   * `cbs` 是整条链共享的队列。两个必须分开的形态：
   *
   * ① **同步抛错**：`next()` 在返回 promise 之前就 throw → 落进本闸门的 catch。
   *    若无脑再调一次 `next()`，它从队列里取**下一个**监听器继续，一路落到宿主内置的
   *    `{kind:'allow'}` —— 把别人的 fail-closed 拒绝降级成放行。这是权限提权。
   * ② **异步拒绝**：`next()` 返回 rejected promise，而我们是 `return next()`（不 await），
   *    所以它天然穿透出去，**不经过** catch。这条路径本来就不会被吞，断言它是防回归。
   *
   * 注意：早先这组用的是 `Promise.resolve().then(...)` 包一层，那只造出形态 ②，
   * 于是"把 catch 里的上抛删掉"仍然全绿 —— 假断言。必须让 `next` 与 cordis 一样同步调用。
   */
  const chainOf = (listeners, inner) => {
    const queue = [...listeners];
    return () => (queue.shift() ?? inner)();
  };

  resetApprovedCalls();
  {
    const { approval } = fakeApproval({ outcome: 'allowed-once' });
    const { gate, log } = makeGate({ approval });
    const boom = new Error('sandbox broke');
    // 下游监听器是**同步**函数，直接 throw
    const next = chainOf([() => { throw boom; }], () => ({ kind: 'allow' }));
    let caught = null;
    let resolved = null;
    try {
      resolved = await gate(execOf('github_pr', { action: 'merge', pr_number: 1 }), next);
    } catch (error) {
      caught = error;
    }
    ok(caught === boom, '批准后下游**同步**抛错：原样上抛（fail-closed），不被兜成 allow', String(resolved && resolved.kind));
    ok(resolved === null, '绝不以 {kind:"allow"} 收场');
    ok(log.warns.length === 0, '下游抛错不是"闸门异常"，不谎报 warn');
  }

  resetApprovedCalls();
  {
    // 连"根本不需要审核"的路径也必须上抛：fail-closed 与档位无关
    const { gate } = makeGate({ approval: fakeApproval({}).approval, mode: 'off' });
    const boom = new Error('plan mode says no');
    let caught = null;
    try {
      await gate(execOf('github_pr', { action: 'list' }), chainOf([() => { throw boom; }], () => ({ kind: 'allow' })));
    } catch (error) {
      caught = error;
    }
    ok(caught === boom, '[off 档 / 只读调用] 下游同步抛错同样上抛，不放行');
  }

  resetApprovedCalls();
  {
    // 形态 ②：异步拒绝原样穿透（闸门不该 catch 它，也不该改写它）
    const { approval } = fakeApproval({ outcome: 'allowed-once' });
    const { gate } = makeGate({ approval });
    const boom = new Error('downstream async failure');
    let caught = null;
    try {
      await gate(execOf('github_pr', { action: 'merge', pr_number: 1 }), chainOf([async () => { throw boom; }], () => ({ kind: 'allow' })));
    } catch (error) {
      caught = error;
    }
    ok(caught === boom, '下游**异步**拒绝原样穿透（不被 catch 改写、不被二次 next 放行）');
  }

  {
    // 对照：异常发生在**本闸门自己的判定**里（还没转发）时必须兜底放行，
    // 否则"审核模块有 bug"会变成"所有 PR/Issue 写操作不可用"
    const log = { decisions: [], warns: [] };
    const gate = createApprovalGate({
      getMode: () => { throw new Error('mode read failed'); },
      getApproval: () => undefined,
      recordDecision: () => {},
      warn: (m) => log.warns.push(m),
    });
    let n = 0;
    const verdict = await gate(execOf('github_pr', { action: 'merge', pr_number: 1 }), async () => { n++; return { kind: 'allow' }; });
    ok(verdict.kind === 'allow' && n === 1, '闸门自身判定抛错（未转发）：退回放行，不封锁写操作');
    ok(log.warns.length === 1, '并留下一条 warn（不静默）');
  }
}

/* ================================================================ */
console.log('\n--- 8b. 被操作对象的现状：弹窗与记录共用一次 gh 读取 ---');
{
  /*
   * 为什么需要：`合并 PR #19` 让人没法拍板；要知道"它是什么状态、说了什么"只能去 gh 读。
   * 于是有三条硬约束，逐个钉死：
   * ① 只在"确定要弹窗"之后才读（否则 off 档 / never 策略下白打一次 gh）；
   * ② 同一次操作只读一次，结果同时给弹窗与记录（记录只留标题）；
   * ③ 任何失败都安静退回纯摘要，绝不拖慢或阻断审核。
   */
  resetTargetTitles();

  // —— 解析器本体 ——
  {
    const calls = [];
    let tick = 1_000;
    const resolve = createTargetInfoResolver({
      fetchTarget: async (kind, num, scope) => {
        calls.push({ kind, num, repo: scope.repo });
        if (num === 404) throw new Error('gh: not found');
        if (num === 500) return { title: '   ', body: '有正文但没标题' };
        if (num === 501) return { body: '压根没有 title 键' };
        return { title: `${kind} #${num} 的标题`, body: '正文', state: 'OPEN' };
      },
      ttlMs: 15_000,
      now: () => tick,
    });

    const first = await resolve({ name: 'github_pr', arguments: { action: 'merge', pr_number: 19 } });
    ok(first?.title === 'pr #19 的标题' && first?.state === 'OPEN' && first?.body === '正文',
      'merge：按 pr_number 取到完整的目标信息（不只标题）', JSON.stringify(first));
    ok(calls.length === 1 && calls[0].kind === 'pr' && calls[0].num === 19, '走的是 pr 通道');
    await resolve({ name: 'github_issue', arguments: { action: 'close', issue_number: 3, repo: 'o/r' } });
    ok(calls.length === 2 && calls[1].kind === 'issue' && calls[1].repo === 'o/r', 'close：按 issue_number 取，repo 透传');

    tick += 1; // 仍在 TTL 内
    await resolve({ name: 'github_pr', arguments: { action: 'merge', pr_number: 19 } });
    ok(calls.length === 2, '同一目标在 TTL 内不重复打 gh');

    tick += 20_000; // 过期
    await resolve({ name: 'github_pr', arguments: { action: 'merge', pr_number: 19 } });
    ok(calls.length === 3, 'TTL 过期后重新读取');

    // 不该读的：create 没有编号、非审核工具、编号非法
    const before = calls.length;
    ok(await resolve({ name: 'github_pr', arguments: { action: 'create', title: 'x' } }) === undefined, 'create 没有既有实体 → 不读');
    ok(await resolve({ name: 'github_release', arguments: { action: 'delete', tag: 'v1' } }) === undefined, '非 PR/Issue 工具 → 不读');
    ok(await resolve({ name: 'github_pr', arguments: { action: 'merge' } }) === undefined, '缺编号 → 不读（不猜）');
    ok(await resolve({ name: 'github_pr', arguments: { action: 'view', pr_number: 1.5 } }) === undefined, '非整数编号 → 不读');
    ok(await resolve({ name: 'github_pr', arguments: { action: 'view', pr_number: -1 } }) === undefined, '负数编号 → 不读');
    ok(calls.length === before, '以上五条一条 gh 都没发');

    // 失败必须安静
    ok(await resolve({ name: 'github_pr', arguments: { action: 'merge', pr_number: 404 } }) === undefined, 'gh 抛错（不存在/无权限）→ undefined，不上抛');
    ok(await resolve({ name: 'github_pr', arguments: { action: 'merge', pr_number: 500 } }) === undefined, '标题是空白 → 整条当作没取到（哪怕有正文）');
    ok(await resolve({ name: 'github_pr', arguments: { action: 'merge', pr_number: 501 } }) === undefined, '没有 title 键 → 当作没取到');
    ok(await resolve(undefined) === undefined, 'exec 缺失 → undefined（不抛）');
  }

  // —— 与闸门协同：只在要弹窗时读、读一次、递给记录 ——
  {
    // 让 fakeApproval 记下所有 request，以便断言弹窗文案
    const fakeApproval2 = (outcome) => {
      const state = { requests: [] };
      const approval = {
        config: { policy: 'ask' },
        overrideOf: () => undefined,
        async request(req) { state.requests.push(req); return outcome; },
      };
      approval.__state = state;
      return approval;
    };

    resetTargetTitles();
    {
      const fetched2 = [];
      const stashed2 = [];
      const a = fakeApproval2('allowed-once');
      const g = createApprovalGate({
        getMode: () => 'destructive',
        getApproval: () => a,
        recordDecision: () => {},
        resolveTarget: createTargetInfoResolver({ fetchTarget: async (k, n) => { fetched2.push(n); return { title: 'fix: 权限校验失效', state: 'OPEN', body: '修了权限校验的绕过' }; } }),
        stashTitle: (id, t) => stashed2.push({ id, t }),
        warn: () => {},
      });
      const exec = execOf('github_pr', { action: 'merge', pr_number: 19 });
      const n = async () => ({ kind: 'allow' });
      const verdict = await g(exec, n);
      ok(verdict.kind === 'allow', '带目标信息的 merge：照常放行');
      ok(fetched2.length === 1, '目标信息只读了一次');
      const req = a.__state.requests[0];
      const reqLines = String(req.reason).split('\n');
      ok(reqLines[0] === '即将执行：合并 PR #19（squash）｜「fix: 权限校验失效」',
        '弹窗首行：动作摘要｜「标题」', req.reason);
      ok(reqLines[1] === '状态：开放' && reqLines[2] === '正文：修了权限校验的绕过',
        '弹窗同时带上了对象现状与正文', req.reason);
      ok(stashed2.length === 1 && stashed2[0].id === exec.callId && stashed2[0].t === 'fix: 权限校验失效',
        '递给记录侧的只有标题（记录不需要整段正文）');
    }

    resetTargetTitles();
    {
      const fetched3 = [];
      const g = createApprovalGate({
        getMode: () => 'destructive',
        getApproval: () => undefined,
        recordDecision: () => {},
        resolveTarget: createTargetInfoResolver({ fetchTarget: async (k, n) => { fetched3.push(n); return { title: 'x' }; } }),
        stashTitle: () => {},
        warn: () => {},
      });
      await g(execOf('github_pr', { action: 'merge', pr_number: 19 }), async () => ({ kind: 'allow' }));
      ok(fetched3.length === 0, '没有 approval 服务（CLI/TUI）→ 不读目标信息（不会弹窗，读了也白读）');
    }
    {
      const fetched4 = [];
      const g = createApprovalGate({
        getMode: () => 'off',
        getApproval: () => fakeApproval2('allowed-once'),
        recordDecision: () => {},
        resolveTarget: createTargetInfoResolver({ fetchTarget: async (k, n) => { fetched4.push(n); return { title: 'x' }; } }),
        stashTitle: () => {},
        warn: () => {},
      });
      await g(execOf('github_pr', { action: 'list' }), async () => ({ kind: 'allow' }));
      ok(fetched4.length === 0, 'off 档 / 只读调用 → 不读目标信息');
    }
    {
      // 目标解析器自己抛错：审核照常进行，文案退回纯摘要
      resetTargetTitles();
      const b = fakeApproval2('allowed-once');
      const g = createApprovalGate({
        getMode: () => 'destructive',
        getApproval: () => b,
        recordDecision: () => {},
        resolveTarget: async () => { throw new Error('resolver exploded'); },
        stashTitle: () => {},
        warn: () => {},
      });
      const verdict = await g(execOf('github_pr', { action: 'merge', pr_number: 19 }), async () => ({ kind: 'allow' }));
      ok(verdict.kind === 'allow', '目标解析器抛错 → 审核照常、照常放行');
      ok(b.__state.requests[0].reason === '即将执行：合并 PR #19（squash）', '解析器抛错时弹窗退回纯摘要');
    }
    resetTargetTitles();
    {
      // 被拒绝的那条同样带标题（记录要能说出"当时拒的是哪一个"）
      const rej = fakeApproval2('rejected');
      const g = createApprovalGate({
        getMode: () => 'destructive',
        getApproval: () => rej,
        recordDecision: () => {},
        resolveTarget: createTargetInfoResolver({ fetchTarget: async () => ({ title: 'fix: 权限校验失效' }) }),
        stashTitle: stashTargetTitle,
        warn: () => {},
      });
      const exec = execOf('github_pr', { action: 'merge', pr_number: 19 });
      const verdict = await g(exec, async () => ({ kind: 'allow' }));
      ok(verdict.kind === 'deny', '被拒绝的 merge：照常拒绝');
      ok(rej.__state.requests[0].reason.includes('「fix: 权限校验失效」'), '拒绝前用户看到的弹窗也带标题');
      ok(takeTargetTitle(exec.callId) === 'fix: 权限校验失效', '被拒绝的记录同样拿得到标题');
    }
    resetTargetTitles();
  }
}

/* ================================================================ */
console.log('\n--- 9. 接线契约：整套功能只挂在 main.ts 的一行上 ---');
{
  // 删掉这一行，前 8 组照样全绿 —— 正是本仓踩过的"漏登记 = 功能静默失效且测试全绿"
  const mainSrc = readFileSync(path.join(ROOT, 'src/main.ts'), 'utf8');
  ok(/onHostEvent\(ctx, 'tools\/pre-execute'/.test(mainSrc), 'main.ts 真的注册了 tools/pre-execute 监听器');
  ok(/createApprovalGate\(\{/.test(mainSrc), '监听器由 createApprovalGate 造出来（非内联重复实现）');
  ok(/getApproval: \(\) => \(ctx as any\)\.get\?\.\('approval'\)/.test(mainSrc),
    'approval 走 ctx.get 机会式探测（不写进 inject，否则 CLI/TUI profile 永久 PENDING）');
  ok(/recordDecision: \(callId, decision\) => auditStore\.recordDecision/.test(mainSrc), '决策写回同一个 AuditStore 实例');
  ok(/forgetApproved\(exec\?\.callId\)/.test(mainSrc), 'tools/result 里回收"批准了但 body 没跑"的残留标记');
  // 目标信息的接线：少任何一处，弹窗都会静默退回"合并 PR #19"（测试照样全绿）
  ok(/createTargetInfoResolver\(\{/.test(mainSrc), 'main.ts 装配了目标信息解析器');
  ok(/resolveTarget,\s*\n\s*stashTitle: stashTargetTitle,/.test(mainSrc), '解析器与暂存都交给了闸门（弹窗与记录共用一次读取）');
  ok(/'api', 'graphql', '-f', 'query='/.test(mainSrc), '取目标信息走一条 GraphQL 查询（评论数只取 totalCount，不用把整段评论拉回来）');
  ok(/statusCheckRollup \{ state \}/.test(mainSrc) && /comments \{ totalCount \}/.test(mainSrc), '查询字段集含 CI 汇总与评论计数');
  ok(/timeoutMs: 4_000/.test(mainSrc), '取目标信息有 4s 超时（它是锦上添花，不能让用户干等）');
  ok(/maxOutputChars: 70_000/.test(mainSrc), '输出预算放到 70K（GitHub 正文上限 65536，默认 24K 会把长正文的 JSON 截成非法的）');
  ok(/executor\.resolveRepoFullName\(scope\.repo, execScope\.cwd\)/.test(mainSrc), '仓库全名走 executor 的统一校验入口（不在外面复制正则）');
  const auditSrc = readFileSync(path.join(ROOT, 'src/audit.ts'), 'utf8');
  ok(/takeTargetTitle\(callId\)/.test(auditSrc) && /meta\.targetTitle = targetTitle/.test(auditSrc),
    'recordCall 从暂存表取标题写进 intent 行（记录阶段不再打 gh）');

  /*
   * 换行保留的 CSS 契约。多行文案依赖一条声明：官方卡片标题默认把换行折叠成空格。
   * 这条规则**不依赖哈希类名**，只用官方根节点上的 data-approval-key 属性按结构定位。
   * 任何一处被删/被改，弹窗就会从"三行"变回"一坨" —— 而所有行为测试照样全绿，所以必须静态钉住。
   */
  const stylesSrc = readFileSync(path.join(ROOT, 'src/ui/styles.ts'), 'utf8');
  const bundleForCss = readFileSync(path.join(ROOT, 'lib/client.js'), 'utf8');
  ok(/div\[data-approval-key\] > div > div:nth-last-child\(2\) > div:first-child > div:first-child\s*\{\s*white-space: pre-wrap;/.test(stylesSrc),
    '审核卡片标题保留换行（white-space: pre-wrap，按 data-approval-key 结构定位）');
  ok(!stylesSrc.includes('Zf6DNq'), '不写死官方组件的哈希类名（换一次构建就失效）');
  ok(bundleForCss.includes('div[data-approval-key] > div > div:nth-last-child(2) > div:first-child > div:first-child'),
    'CSS 规则真的进了客户端产物（只在源码里等于没生效）');
}

console.log('\n========================================');
if (failed === 0) {
  console.log(`Phase 53 Approval Result: ${passed}/${passed} assertions PASSED!`);
} else {
  console.error(`Phase 53 Approval Result: ${failed} FAILED, ${passed} passed`);
  process.exitCode = 1;
}
