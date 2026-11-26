// test/phase55-audit-policy.test.mjs
//
// s3 · 策略化与硬化的契约测试。四组互不重叠的断言，对应计划 §三 的六个分组
// （导出与设置页契约合并到本文件的 ④ / ⑤）：
//
//   ① 策略求值：档位基线 / repo 命中 / action 命中 / 多维 AND / **首条匹配** /
//      语法错误被忽略 / 未知维度被忽略
//   ② 多段合并：按 mtime 合并 / 折叠跨段 / 墓碑跨段 / 段数上限 / 预算口径不变
//   ③ 自愈：半行跳过 / 坏行率超阈值重写本段 / 重写后好行一条不少 / 文件不存在不抛
//   ④ 导出与清空跨段：json 可解析且条数一致 / md 决策列区分 approved 与 no-client /
//      非法 format 400 / 锁被占用时 partial:true 而不是假装删干净
//
// 为什么这些必须单独成阶段：s3 全部是**增量**（新路由、新段文件、新设置项），
// 任何一条失效都不会让主功能崩，只会"看起来在工作"——那正是最该被测试钉住的形态。
//
// 全部离线：临时目录 + 注入时钟，不碰真实 ~/.dsh，不发任何网络请求。

import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, readdirSync, mkdirSync, utimesSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
  AuditStore, parseApprovalRules, resolveApprovalMode,
  loadAuditSettings, saveAuditSettings, auditSettingsPath,
} = await import(lib('lib/audit.js'));
const { registerAuditRoutes } = await import(lib('lib/api/routes-audit.js'));
const { sendJson, readJsonBody } = await import(lib('lib/api/route-helpers.js'));
const { createApprovalGate, shouldAsk } = await import(lib('lib/approval-gate.js'));
const { resetApprovedCalls } = await import(lib('lib/destructive.js'));
const { renderStatusMarkdown } = await import(lib('lib/renderers/markdown.js'));

const tmpDirs = [];
function tmpDir() {
  const d = mkdtempSync(path.join(os.tmpdir(), 'dsh-s3-'));
  tmpDirs.push(d);
  return d;
}
function makeStore(over) {
  let t = 1_700_000_000_000;
  return new AuditStore({ dir: tmpDir(), flushDelayMs: 0, now: () => (t += 1000), ...(over || {}) });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ================================================================ */
console.log('\n--- 1. 规则解析：语法、维度、注释、错误归类 ---');
/* ================================================================ */
{
  const r = parseApprovalRules(['repo:acme/prod=off']);
  ok(r.rules.length === 1 && r.ignored.length === 0, '最简规则解析成功');
  ok(r.rules[0].repo === 'acme/prod' && r.rules[0].mode === 'off', 'repo 值与档位正确');

  ok(parseApprovalRules(undefined).rules.length === 0, 'undefined 输入返回空（不抛）');
  ok(parseApprovalRules(null).ignored.length === 0, 'null 输入不产生"忽略"噪音');
  ok(parseApprovalRules('repo:a/b=off').rules.length === 0, '字符串（不是数组）整体忽略');

  // action 的值本身带冒号：必须用最后一个 = 切档位、第一个 : 切维度
  const act = parseApprovalRules(['action:github_issue:comment=off']);
  ok(act.rules.length === 1 && act.rules[0].actionTool === 'github_issue' && act.rules[0].action === 'comment',
    'action 值里的工具前缀与 action 名被拆开（精确到 github_issue:comment）', JSON.stringify(act.rules[0]));

  // 只写 action 名 = 作用于所有有该 action 的工具（避免用户写简写时静默永不命中）
  const bare = parseApprovalRules(['action:comment=off']);
  ok(bare.rules.length === 1 && bare.rules[0].action === 'comment' && bare.rules[0].actionTool === undefined,
    'action 不写工具前缀时只按 action 名匹配', JSON.stringify(bare.rules[0]));

  // 多维 AND
  const multi = parseApprovalRules(['repo:acme/prod|action:github_pr:merge=off']);
  ok(multi.rules.length === 1 && multi.rules[0].repo === 'acme/prod'
    && multi.rules[0].actionTool === 'github_pr' && multi.rules[0].action === 'merge',
    '多维用 | 连接，仓库与工具+action 都解析出来', JSON.stringify(multi.rules[0]));

  // 注释与空行是排版，不是错误
  const withComments = parseApprovalRules(['# 这是注释', '', '   ', 'repo:a/b=off']);
  ok(withComments.rules.length === 1 && withComments.ignored.length === 0,
    '注释行与空行既不算规则也不算错误', JSON.stringify(withComments));

  // 语法错误：逐类给出原因，且**不改动**有效规则
  const bad = parseApprovalRules([
    'repo:a/b',                    // 缺 =档位
    'repo:a/b=',                   // 档位为空
    'repo:a/b=maybe',              // 档位非法
    'namespace:x=off',             // 未知维度
    'repo:a/b|=off',               // 尾部空段：无害，不该报错（仍有 repo 维度）
    'repo:=off',                   // 值为空
    'repo:a/b|repo:c/d=off',       // 维度重复
    '=off',                        // 没有任何条件维度（缺维度名）
    'action:github_issue:=off',    // action 值里工具与 action 之间为空
    'repo:a/b=off',                // 有效
  ]);
  ok(bad.rules.length === 2, '只有 2 条真正有效（尾部空段那条也算有效）', String(bad.rules.length));
  ok(bad.ignored.length === 8, '8 条被忽略并逐条给出原因', String(bad.ignored.length));
  ok(bad.ignored.every((x) => typeof x.reason === 'string' && x.reason.length > 0), '每条忽略都带原因（不静默）');
  ok(bad.ignored.some((x) => x.reason.includes('未知维度')), '未知维度被点名');
  ok(bad.ignored.some((x) => x.reason.includes('重复')), '维度重复被点名');
  ok(bad.ignored.every((x) => typeof x.raw === 'string'), '忽略项保留原文（设置页要能回显用户写的那一行）');

  // 注释行不该被当成"被忽略的规则"——那会让"N 条被忽略"虚高
  ok(!withComments.ignored.some((x) => x.raw.startsWith('#')), '注释行不进 ignored 列表');
}

/* ================================================================ */
console.log('\n--- 2. 策略求值：首条匹配 / 维度命中 / read_only 边界 ---');
/* ================================================================ */
{
  const cfg = (rules, mode) => ({ approvalMode: mode || 'destructive', approvalRules: rules });

  // 三档基线：无规则时就是全局档位
  ok(resolveApprovalMode(cfg([]), { tool: 'github_pr', action: 'merge' }) === 'destructive', '无规则 → 回落全局档位');
  ok(resolveApprovalMode(cfg([], 'off'), { tool: 'github_pr', action: 'merge' }) === 'off', '全局 off 基线');
  ok(resolveApprovalMode(cfg([], 'all-writes'), { tool: 'github_pr', action: 'create' }) === 'all-writes', '全局 all-writes 基线');

  // repo 命中
  const repoRules = ['repo:acme/prod=off'];
  ok(resolveApprovalMode(cfg(repoRules), { tool: 'github_pr', action: 'merge', repo: 'acme/prod' }) === 'off',
    'repo 命中 → 用规则档位');
  ok(resolveApprovalMode(cfg(repoRules), { tool: 'github_pr', action: 'merge', repo: 'other/repo' }) === 'destructive',
    '其他仓库不命中 → 仍用全局档位');
  ok(resolveApprovalMode(cfg(repoRules), { tool: 'github_pr', action: 'merge' }) === 'destructive',
    '没有 repo 信息时不命中（不猜）');
  ok(resolveApprovalMode(cfg(['repo:Acme/Prod=off']), { tool: 'github_pr', action: 'merge', repo: 'acme/prod' }) === 'off',
    'repo 比较不区分大小写（GitHub 的 owner/name 本身大小写不敏感）');

  // action 命中
  const actRules = ['action:github_issue:comment=off'];
  ok(resolveApprovalMode(cfg(actRules), { tool: 'github_issue', action: 'comment' }) === 'off', 'action 精确命中');
  ok(resolveApprovalMode(cfg(actRules), { tool: 'github_pr', action: 'comment' }) === 'destructive',
    '同名 action 但工具不同 → 不命中（comment 在 PR 上仍是高危语境）');
  ok(resolveApprovalMode(cfg(actRules), { tool: 'github_issue', action: 'close' }) === 'destructive',
    '同工具不同 action → 不命中');

  // 只写 action 名的简写形态：横跨所有有该 action 的工具（两种写法都要能用，不能有一个静默失效）
  const bareRules = ['action:comment=off'];
  ok(resolveApprovalMode(cfg(bareRules), { tool: 'github_issue', action: 'comment' }) === 'off',
    'action:comment 简写命中 Issue 评论');
  ok(resolveApprovalMode(cfg(bareRules), { tool: 'github_pr', action: 'comment' }) === 'off',
    'action:comment 简写同时命中 PR 评论（"跨工具"就是它的语义）');
  ok(resolveApprovalMode(cfg(bareRules), { tool: 'github_pr', action: 'merge' }) === 'destructive',
    'action:comment 不影响其他 action');

  // tool 维度
  ok(resolveApprovalMode(cfg(['tool:github_pr=off']), { tool: 'github_pr', action: 'create' }) === 'off',
    'tool 维度可整工具覆盖');
  ok(resolveApprovalMode(cfg(['tool:github_pr=off']), { tool: 'github_issue', action: 'create' }) === 'destructive',
    'tool 维度不影响其他工具');

  // 多维 AND：任一不满足就不命中
  const andRules = ['repo:acme/prod|action:github_pr:merge=off'];
  ok(resolveApprovalMode(cfg(andRules), { tool: 'github_pr', action: 'merge', repo: 'acme/prod' }) === 'off',
    '多维 AND：全部满足才命中');
  ok(resolveApprovalMode(cfg(andRules), { tool: 'github_pr', action: 'merge', repo: 'other/x' }) === 'destructive',
    '多维 AND：仓库不满足 → 不命中');
  ok(resolveApprovalMode(cfg(andRules), { tool: 'github_pr', action: 'create', repo: 'acme/prod' }) === 'destructive',
    '多维 AND：action 不满足 → 不命中');

  /*
   * **首条匹配**（不是最严格）。这条是本阶段的头号设计决定，反向验证就是把它改成
   * "取最严格"——那样下面第一条会变成 destructive，用户"我想放行"永远失效。
   */
  const conflict = ['repo:acme/prod=off', 'repo:acme/prod=all-writes'];
  ok(resolveApprovalMode(cfg(conflict), { tool: 'github_pr', action: 'merge', repo: 'acme/prod' }) === 'off',
    '两条冲突规则 → 取**第一条**（off），不是最严格的');
  ok(resolveApprovalMode(cfg(conflict.slice().reverse()), { tool: 'github_pr', action: 'merge', repo: 'acme/prod' }) === 'all-writes',
    '顺序反过来结果跟着变（证明真的按顺序，不是排序后取值）');

  // 语法错的规则被忽略，**不改默认**
  const mixed = ['repo:a/b=maybe', 'repo:acme/prod=off'];
  ok(resolveApprovalMode(cfg(mixed), { tool: 'github_pr', action: 'merge', repo: 'acme/prod' }) === 'off',
    '语法错的规则被跳过后，后面那条仍然生效');
  ok(resolveApprovalMode(cfg(['repo:acme/prod=maybe']), { tool: 'github_pr', action: 'merge', repo: 'acme/prod' }) === 'destructive',
    '只有语法错的规则时 → 不改默认档位');

  // 未知维度被忽略
  ok(resolveApprovalMode(cfg(['namespace:acme=off']), { tool: 'github_pr', action: 'merge', repo: 'acme/prod' }) === 'destructive',
    '未知维度整条忽略（不当成通配）');

  /*
   * `read_only` 的优先级：它在**注册期**就把写 action 从 enum 里剪掉了，
   * 策略根本没机会跑。所以这里断言的不是"策略生效"，而是**策略函数本身不感知
   * read_only**——边界必须写在文档里，而不是让函数假装能处理它。
   */
  ok(resolveApprovalMode(cfg([], 'all-writes'), { tool: 'github_pr', action: 'create' }) === 'all-writes',
    '策略函数本身不管 read_only（那是注册期的事，边界写进文档）');
}

/* ================================================================ */
console.log('\n--- 3. 策略接线：闸门真的用规则档位 ---');
/* ================================================================ */
{
  let seq = 0;
  const execOf = (name, args) => ({
    name, arguments: args, callId: 'c' + (++seq),
    agent: { id: 'a1', session: { id: 's1' } }, signal: {},
  });

  // getMode 现在接收 exec：证明闸门把调用上下文交给了策略层
  const seen = [];
  const gate = createApprovalGate({
    getMode: (exec) => {
      seen.push(exec ? exec.name : null);
      return 'off';
    },
    getApproval: () => ({ config: { policy: 'ask' }, overrideOf: () => undefined, request: async () => 'allowed-once' }),
    recordDecision: () => {},
    warn: () => {},
  });
  let nextCount = 0;
  const next = async () => { nextCount++; return { kind: 'allow' }; };
  await gate(execOf('github_pr', { action: 'merge', pr_number: 1 }), next);
  ok(seen.length === 1 && seen[0] === 'github_pr', 'getMode 收到 exec（策略层能按调用求值）');
  ok(nextCount === 1, 'off 档直接放行（规则生效路径走通）');

  // 规则里写了 off，但档位是 destructive：真实链路的语义
  const store = makeStore();
  store.setApprovalMode('destructive');
  store.setApprovalRules(['action:github_pr:merge=off']);
  const mode = store.resolveModeFor({ tool: 'github_pr', action: 'merge' });
  ok(mode === 'off', 'AuditStore.resolveModeFor 把规则算进档位');
  ok(store.resolveModeFor({ tool: 'github_pr', action: 'close' }) === 'destructive', '未命中的调用仍用全局档位');

  // 关键：shouldAsk 拿到 off 就不问——规则真的改变行为
  ok(shouldAsk(execOf('github_pr', { action: 'merge', pr_number: 1 }), mode) === false,
    '规则把 merge 改成 off 后，shouldAsk 不再要求审核');
  ok(shouldAsk(execOf('github_pr', { action: 'merge', pr_number: 1 }), 'destructive') === true,
    '对照：同一调用在 destructive 下仍要问（证明差异来自规则）');

  // 规则解析结果与设置页回显必须同源
  store.setApprovalRules(['repo:a/b=off', 'broken-rule']);
  ok(store.parsedApprovalRules().rules.length === 1, '有效规则 1 条');
  ok(store.parsedApprovalRules().ignored.length === 1, '被忽略规则 1 条（设置页据此回显）');
  ok(store.approvalRules().length === 2, '原文保留 2 条（用户写的那一行不能被悄悄删掉）');
  await store.dispose();
}

/* ================================================================ */
console.log('\n--- 4. 多段：按 mtime 合并 / 折叠跨段 / 墓碑跨段 ---');
/* ================================================================ */
{
  /*
   * 手工造两个"别的进程的段"，验证读取合并。
   * 为什么手工造而不是起两个进程：真起两个进程要 spawn 且时序不可控，
   * 而本阶段要断言的只是"合并逻辑对不对"——段文件的命名规则由构造期决定，
   * 手写的段文件与真实段在读取侧完全等价。
   */
  const dir = tmpDir();
  const segDir = path.join(dir, 'audit');
  mkdirSync(segDir, { recursive: true });

  const rowA = { v: 1, kind: 'intent', id: 'A1', at: 1000, tool: 'github_pr', action: 'merge', write: true, risk: 'destructive', summary: 'A 段的操作', repo: 'o/r' };
  const rowB = { v: 1, kind: 'result', id: 'A1', at: 1001, ok: true };
  const rowC = { v: 1, kind: 'intent', id: 'B1', at: 2000, tool: 'github_issue', action: 'close', write: true, risk: 'destructive', summary: 'B 段的操作', repo: 'o/r' };
  const rowD = { v: 1, kind: 'result', id: 'B1', at: 2001, ok: true };

  // A 段更旧（mtime 更早），且 intent 与 result **跨段**（模拟两个进程分别写了同一调用的两半）
  const segA = path.join(segDir, 'audit.100-1000-1.jsonl');
  const segB = path.join(segDir, 'audit.200-2000-2.jsonl');
  writeFileSync(segA, [rowA, rowB].map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  writeFileSync(segB, [rowC, rowD].map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  utimesSync(segA, new Date(1000), new Date(1000));
  utimesSync(segB, new Date(2000), new Date(2000));

  const store = new AuditStore({ dir, flushDelayMs: 0 });
  const page = store.list();
  ok(page.total === 2, '两个段的行被合并折叠成 2 条记录', String(page.total));
  ok(page.items.some((e) => e.id === 'A1') && page.items.some((e) => e.id === 'B1'), '两段的记录都在');
  ok(page.items.find((e) => e.id === 'A1').result === 'ok', 'intent 与 result 同段时正常折叠');
  ok(page.items[0].id === 'B1', '列表按时间倒序（B 段更新，排在前）');
  ok(store.segmentPaths().length >= 2, 'segmentPaths 能看到多段', String(store.segmentPaths().length));
  ok(store.usage().segments >= 2, 'usage().segments 如实反映段数');

  // 折叠跨段：把 B1 的 result 挪到第三个段里，仍应折叠成 ok
  const segC = path.join(segDir, 'audit.300-3000-3.jsonl');
  writeFileSync(segC, JSON.stringify({ v: 1, kind: 'result', id: 'A1', at: 1002, ok: false, errorType: 'GH_ERROR' }) + '\n', 'utf8');
  utimesSync(segC, new Date(3000), new Date(3000));
  const store2 = new AuditStore({ dir, flushDelayMs: 0 });
  const a1 = store2.list().items.find((e) => e.id === 'A1');
  ok(a1.result === 'fail' && a1.errorType === 'GH_ERROR', '后到段的 result 覆盖先到的（折叠跨段生效）', JSON.stringify({ r: a1.result }));

  // 墓碑跨段：在**本进程段**写墓碑，读取时对全部段生效
  await store2.delete(['B1']);
  ok(store2.list().items.every((e) => e.id !== 'B1'), '墓碑在本段，删除对全部段生效');
  // 但 B 段的原始行仍在磁盘上——这是真实情况，也正是"清空要抢锁"的理由
  ok(readFileSync(segB, 'utf8').includes('B1'), '其他进程段里的原始行仍在磁盘上（不假装删干净）');

  await store.dispose();
  await store2.dispose();
}

/* ================================================================ */
console.log('\n--- 5. 多段：段数上限与预算口径 ---');
/* ================================================================ */
{
  const dir = tmpDir();
  const segDir = path.join(dir, 'audit');
  mkdirSync(segDir, { recursive: true });
  // 造 12 个段（超过 8 的上限），每段一条可辨识的记录
  for (let i = 0; i < 12; i++) {
    const p = path.join(segDir, `audit.${100 + i}-${1000 + i}-${i}.jsonl`);
    writeFileSync(p, JSON.stringify({
      v: 1, kind: 'intent', id: 'old' + i, at: 1000 + i,
      tool: 'github_pr', action: 'merge', write: true, risk: 'destructive', summary: '第 ' + i + ' 段',
    }) + '\n', 'utf8');
    utimesSync(p, new Date(1000 + i), new Date(1000 + i));
  }
  const store = new AuditStore({ dir, flushDelayMs: 0 });
  const segs = store.segmentPaths();
  ok(segs.length <= 8, `段数被钳到 8 以内（实际 ${segs.length}）`, String(segs.length));
  // 最旧的几段被整段丢弃：剩下的一定是最新的那批
  const ids = store.list({ limit: 100 }).items.map((e) => e.id);
  ok(!ids.includes('old0') && !ids.includes('old1'), '最旧的段被整段丢弃');
  ok(ids.includes('old11'), '最新的段仍在');
  // 段数上限不承担保留策略：它是"最多几个进程"的护栏
  ok(store.usage().segments <= 8, 'usage().segments 与实际上限一致');

  // 预算口径：两段合计超预算时，**最旧段被整段丢弃**（不是逐行）
  const dir2 = tmpDir();
  const segDir2 = path.join(dir2, 'audit');
  mkdirSync(segDir2, { recursive: true });
  const big = (id, n) => JSON.stringify({
    v: 1, kind: 'intent', id, at: 1, tool: 'github_pr', action: 'merge',
    write: true, risk: 'destructive', summary: 'x'.repeat(n),
  });
  const pOld = path.join(segDir2, 'audit.100-1000-1.jsonl');
  const pNew = path.join(segDir2, 'audit.200-2000-2.jsonl');
  /*
   * 预算下限是 256 KB（`clampBudget` 的 MIN_MAX_BYTES），所以"超预算"必须真的超过它：
   * 每段约 200 KB，两段 400 KB > 256 KB → 必须整段丢掉更旧的那个。
   * 用 40 KB 做预算会被钳到 256 KB，那就永远不触发淘汰（测试会假绿或假红）。
   */
  writeFileSync(pOld, big('old-a', 200000) + '\n', 'utf8');
  writeFileSync(pNew, big('new-b', 200000) + '\n', 'utf8');
  // mtime 要早于 60s 的沉寂窗口，否则会被"正在被写、不许删"的保护挡住（那是有意设计）
  const longAgo = new Date(Date.now() - 10 * 60_000);
  utimesSync(pOld, longAgo, longAgo);
  utimesSync(pNew, longAgo, longAgo);
  const bStore = new AuditStore({ dir: dir2, flushDelayMs: 0, maxBytes: 256 * 1024 });
  ok(bStore.usage().bytes <= 256 * 1024, '分段后总占用仍 ≤ 预算（口径不变）', String(bStore.usage().bytes));
  ok(!existsSync(pOld), '最旧的那一段被整段 unlink（一次删除，不逐行读改写）');
  ok(bStore.list().items.some((e) => e.id === 'new-b'), '最新段的记录保留');

  await store.dispose();
  await bStore.dispose();
}

/* ================================================================ */
console.log('\n--- 6. 自愈：坏行跳过 / 超阈值重写本段 / 好行一条不少 ---');
/* ================================================================ */
{
  // 少量坏行：只跳过，不重写（重写有成本，偶发半行不值得动文件）
  const dir = tmpDir();
  const segDir = path.join(dir, 'audit');
  mkdirSync(segDir, { recursive: true });
  const seg = path.join(segDir, 'audit.100-1000-1.jsonl');
  const good = (id) => JSON.stringify({ v: 1, kind: 'intent', id, at: 1, tool: 'github_pr', action: 'merge', write: true, risk: 'destructive', summary: 'ok ' + id });
  writeFileSync(seg, [good('g1'), '{ 半行断电', good('g2')].join('\n') + '\n', 'utf8');
  const store = new AuditStore({ dir, flushDelayMs: 0 });
  ok(store.list().total === 2, '少量坏行被跳过，好行全部保留');
  const before = readFileSync(seg, 'utf8');
  ok(before.includes('半行断电'), '坏行率低时不重写文件（不为了 1 行坏字节去改盘）');
  await store.dispose();

  // 高坏行率：重写该段，把坏字节真正清掉，好行一条不少
  const dir2 = tmpDir();
  const segDir2 = path.join(dir2, 'audit');
  mkdirSync(segDir2, { recursive: true });
  const seg2 = path.join(segDir2, 'audit.100-1000-1.jsonl');
  const lines = [];
  for (let i = 0; i < 60; i++) lines.push(good('h' + i));
  // 插 10 条坏行：10/70 ≈ 14% > 5%，且总行数 70 > 50 → 触发重写
  for (let i = 0; i < 10; i++) lines.push('{ 坏行 ' + i);
  writeFileSync(seg2, lines.join('\n') + '\n', 'utf8');
  /*
   * mtime 必须早于 60s 的沉寂窗口：本进程启动时新建的是**另一个**段文件，
   * 这个坏段在它眼里属于"别的进程"。正在被写的段有意的保护起来（不重写），
   * 所以这里把 mtime 调老，模拟"写它的那个进程已经不在了"。
   */
  const stale = new Date(Date.now() - 10 * 60_000);
  utimesSync(seg2, stale, stale);
  const store2 = new AuditStore({ dir: dir2, flushDelayMs: 0 });
  ok(store2.list().total === 60, '坏行率高时好行一条不少（60 条全在）', String(store2.list().total));
  const after = readFileSync(seg2, 'utf8');
  ok(!after.includes('坏行'), '超阈值触发重写：坏字节被真正清掉（不是每次都重新跳过）');
  ok(after.trim().split('\n').filter(Boolean).length === 60, '重写后文件行数 = 好行数');
  ok(store2.list().items.every((e) => /^h\d+$/.test(e.id)), '重写后每条记录都可读');
  await store2.dispose();

  /*
   * 反例：坏段属于**仍然活着的进程** → 只跳过、不重写。
   *
   * 用本进程 pid 造段名，是因为 `isSegmentLive` 现在优先看 pid 存活（段名里就写着
   * `audit.<pid>-...`）：死进程的段立刻可回收，不必等 60 秒冷却。
   * 早先这里用 `audit.100-...`（pid 100 在本机不存在）——那在新判据下属于"已死"，
   * 会被正确重写，把它当活段测就是在测一个不存在的语义。
   */
  const dir4 = tmpDir();
  const segDir4 = path.join(dir4, 'audit');
  mkdirSync(segDir4, { recursive: true });
  const seg4 = path.join(segDir4, `audit.${process.pid}-1000-1.jsonl`);
  const segOwnerPid = Number(seg4.match(/audit\.(\d+)-/)[1]);
  ok(segOwnerPid === process.pid, '活段用例的段名带本进程 pid（判活走 pid 而不是猜）');
  const lines4 = [];
  for (let i = 0; i < 60; i++) lines4.push(good('r' + i));
  for (let i = 0; i < 10; i++) lines4.push('{ 新鲜坏行 ' + i);
  writeFileSync(seg4, lines4.join('\n') + '\n', 'utf8'); // mtime = 现在
  const store4 = new AuditStore({ dir: dir4, flushDelayMs: 0 });
  ok(store4.list().total === 60, '活进程的坏段：好行照样全部读出（读取不等自愈）');
  ok(readFileSync(seg4, 'utf8').includes('新鲜坏行'), '活进程的段不被重写（它可能正在被追加）');
  await store4.dispose();

  // 文件不存在：返回空数组，不抛
  const dir3 = tmpDir();
  const store3 = new AuditStore({ dir: dir3, flushDelayMs: 0 });
  let threw = false;
  try { store3.list(); } catch { threw = true; }
  ok(threw === false, '文件不存在时 list() 返回空而不抛错');
  ok(store3.list().total === 0, '空目录 → 0 条记录');
  await store3.dispose();
}

/* ================================================================ */
console.log('\n--- 7. 导出：json / md / 决策列 / 非法 format ---');
/* ================================================================ */
{
  const store = makeStore();
  store.recordCall('github_pr', { action: 'merge', pr_number: 19 }, { ok: true }, { callId: 'e1', agent: { id: 's' } });
  store.recordDecision('e1', 'approved');
  store.recordCall('github_issue', { action: 'close', issue_number: 3 }, { ok: false, error: 'boom' }, { callId: 'e2' });
  store.recordDecision('e2', 'rejected', '先别关，等 CI 跑完\n我还想再加一条评论');
  store.recordCall('github_issue', { action: 'comment', issue_number: 4 }, { ok: true }, { callId: 'e3' });
  store.recordDecision('e3', 'no-client');

  const json = store.exportJson();
  let parsed = null;
  let jsonErr = null;
  try { parsed = JSON.parse(json); } catch (e) { jsonErr = String(e && e.message); }
  ok(jsonErr === null, '导出 json 是合法 JSON', jsonErr);
  ok(parsed && parsed.count === 3, 'json 的 count 与记录数一致', parsed && String(parsed.count));
  ok(parsed && Array.isArray(parsed.items) && parsed.items.length === 3, 'items 条数一致');
  ok(parsed && typeof parsed.exportedAt === 'string', '导出件带导出时间（自解释）');
  ok(parsed && parsed.usage && typeof parsed.usage.rows === 'number', '导出件带存储用量');
  ok(parsed && parsed.scope === 'global' && parsed.cwd === null, '不带 cwd 时如实标全局');

  const md = store.exportMarkdown();
  ok(md.includes('| 时间 | 摘要 | 决策 | 结果 |'), 'md 含表头');
  /*
   * 决策列必须显式区分 approved / rejected / no-client。
   * 这是导出件最核心的正确性：它的主要用途就是事后对账，
   * 把"用户点了拒绝"和"根本没有客户端可问"混成一列等于让导出件撒谎。
   */
  ok(md.includes('已批准'), 'md 决策列能表达 approved');
  ok(md.includes('已拒绝'), 'md 决策列能表达 rejected');
  ok(md.includes('无客户端'), 'md 决策列能表达 no-client');
  ok(!md.includes('未审核'), 'no-client 不再用含混的"未审核"（与弹窗里的旧词区分）');
  ok(md.includes('被拒绝条目的留言原文'), '被拒绝条目的留言有独立段落');
  ok(md.includes('先别关，等 CI 跑完') && md.includes('我还想再加一条评论'), '留言原文完整保留（含多行）');
  ok(md.includes('失败（boom）'), '结果列带错误类型');

  // 条数不写死：导出 = 当前保留的全部
  const many = makeStore({ maxRows: 1000, maxBytes: 64 * 1024 * 1024 });
  for (let i = 0; i < 30; i++) many.recordCall('github_pr', { action: 'merge', pr_number: i }, { ok: true }, { callId: 'm' + i });
  const manyParsed = JSON.parse(many.exportJson());
  ok(manyParsed.count === 30, '导出条数 = 当前保留条数（不写死 2000）', String(manyParsed.count));

  // 过滤条件与列表同源
  const filtered = JSON.parse(store.exportJson({ cwd: 'D:/nope' }));
  ok(filtered.count === 0 && filtered.scope === 'workspace', '带 cwd 时如实标工作区作用域且结果为 0');

  // 路由契约
  const routes = [];
  const deps = { bindRoute: (r) => routes.push(r), sendJson, readJsonBody };
  registerAuditRoutes(deps, store);
  const REQ_OK = { host: '127.0.0.1:55716', origin: 'http://127.0.0.1:55716', 'content-type': 'application/json' };
  function makeReq(opts = {}) {
    const listeners = { data: [], end: [], error: [] };
    const req = {
      method: opts.method || 'POST', url: opts.url || '/', headers: opts.headers || {},
      resume() {},
      on(ev, fn) { (listeners[ev] || []).push(fn); return req; },
      destroy() {},
      emitData(chunk) { for (const fn of listeners.data) fn(Buffer.from(chunk)); },
      emitEnd() { for (const fn of listeners.end) fn(); },
    };
    return { req, listeners };
  }
  async function hit(urlPath, opts = {}) {
    const route = routes.find((r) => r.path === urlPath);
    if (!route) return { statusCode: 404, body: null };
    const { req } = makeReq(opts);
    let statusCode = 0;
    let payload = '';
    const res = {
      setHeader() {}, set statusCode(v) { statusCode = v; }, get statusCode() { return statusCode; },
      end(s) { payload = s || ''; },
    };
    const p = route.handler(req, res);
    if (opts.body !== undefined) { req.emitData(opts.body); req.emitEnd(); }
    else req.emitEnd();
    await p;
    let body = null;
    try { body = JSON.parse(payload); } catch { body = null; }
    return { statusCode, body };
  }

  let res = await hit('/api/github/audit/export', { headers: REQ_OK, body: JSON.stringify({ format: 'json' }) });
  ok(res.statusCode === 200 && res.body.ok === true, '导出路由 POST json → 200');
  ok(typeof res.body.data.content === 'string' && res.body.data.content.length > 10, '内容随 JSON 回传（服务端不落文件）');
  ok(/^github-audit-.*\.json$/.test(res.body.data.filename), 'json 文件名带时间戳与扩展名', res.body.data.filename);
  ok(res.body.data.contentType === 'application/json', 'json 的 content type 正确');
  ok(JSON.parse(res.body.data.content).count === 3, '回传内容可直接解析且条数正确');

  res = await hit('/api/github/audit/export', { headers: REQ_OK, body: JSON.stringify({ format: 'md' }) });
  ok(res.statusCode === 200 && /\.md$/.test(res.body.data.filename), 'md 导出文件名正确');
  ok(res.body.data.contentType === 'text/markdown', 'md 的 content type 正确');

  res = await hit('/api/github/audit/export', { headers: REQ_OK, body: JSON.stringify({ format: 'xml' }) });
  ok(res.statusCode === 400, '非法 format → 400', String(res.statusCode));
  res = await hit('/api/github/audit/export', { headers: REQ_OK, body: JSON.stringify({}) });
  ok(res.statusCode === 400, '缺 format → 400');
  res = await hit('/api/github/audit/export', { method: 'GET', headers: REQ_OK });
  ok(res.statusCode === 405, '导出端点拒绝 GET（405）');
  res = await hit('/api/github/audit/export', { headers: { ...REQ_OK, origin: 'http://evil.example' }, body: '{"format":"json"}' });
  ok(res.statusCode === 403, '跨源导出被拒（403）');
  res = await hit('/api/github/audit/export', { headers: { ...REQ_OK, 'content-type': 'text/plain' }, body: '{"format":"json"}' });
  ok(res.statusCode === 415, '非 JSON 媒体类型被拒（415）');
  res = await hit('/api/github/audit/export', { headers: REQ_OK, body: JSON.stringify({ format: 'json', filter: { cwd: 'a\u0000b' } }) });
  ok(res.statusCode === 400, 'filter.cwd 含控制字符 → 400');

  await store.dispose();
  await many.dispose();
}

/* ================================================================ */
console.log('\n--- 8. 清空跨段：锁被占用时如实 partial ---');
/* ================================================================ */
{
  const dir = tmpDir();
  const segDir = path.join(dir, 'audit');
  mkdirSync(segDir, { recursive: true });
  /*
   * 段名里的 pid 现在是**真正的判活依据**（`isSegmentLive`）：
   * 用一个确定不存在的 pid，表示"写它的进程已经没了" → 清空/淘汰可以立刻回收它，
   * 不必等 60 秒 mtime 冷却。这正是"用户刚关掉 desktop 就想清空"该走的路。
   */
  const DEAD_PID = 99999999;
  const other = path.join(segDir, `audit.${DEAD_PID}-9000-9.jsonl`);
  writeFileSync(other, JSON.stringify({ v: 1, kind: 'intent', id: 'x1', at: 1, tool: 'github_pr', action: 'merge', write: true, risk: 'destructive', summary: '别人的记录' }) + '\n', 'utf8');

  const store = new AuditStore({ dir, flushDelayMs: 0 });
  store.recordCall('github_pr', { action: 'merge', pr_number: 1 }, { ok: true }, { callId: 'own1' });

  // 锁被占用（模拟另一个进程正在清空）→ 只能清本段，必须如实 partial
  const lockPath = path.join(dir, '.lock');
  writeFileSync(lockPath, '99999', 'utf8');
  const r1 = await store.clear();
  ok(r1.partial === true, '锁被占用时返回 partial: true（不假装删干净）');
  ok(r1.remaining > 0, '如实报告还有几个段未清空', String(r1.remaining));
  /*
   * 没删掉的记录**必须仍然看得见**。
   *
   * 清空本段后内存里是空的，若就此返回，界面会显示成"什么都没有"——那和"假装删干净了"
   * 是同一种谎言的另一面（用户看不见 ≠ 已被删除）。所以 partial 分支会重新装载，
   * 让列表如实反映"还剩下什么"。
   */
  const left = store.list({ limit: 100 }).items;
  ok(left.length === 1 && left[0].id === 'x1', '未清空的段里那条记录仍然可见（不伪装成空列表）', JSON.stringify(left.map((e) => e.id)));
  ok(left.every((e) => e.callId !== 'own1'), '本进程自己的记录确实被清空了');
  ok(existsSync(other) && readFileSync(other, 'utf8').includes('x1'), '其他进程的段未被删（诚实：删不掉就说删不掉）');

  /*
   * 释放锁后重试 → 死进程的段立刻可回收，全清。
   *
   * 用**同一个 store** 连续清空（而不是新建一个）：同进程里的第二个 store 会再产生
   * 一个 `audit.<本进程pid>-...` 段，而 `isSegmentLive` 对"同 pid + mtime 新鲜"保守判活，
   * 于是第一次清空必然 partial——那测的是测试自己的副作用，不是产品行为。
   */
  try { rmSync(lockPath); } catch { /* 不存在也无所谓 */ }
  const r2 = await store.clear();
  ok(r2.partial === false, '锁可用且对方进程已死时全段清空（partial: false）', JSON.stringify(r2));
  ok(!existsSync(other), '已死进程的段被删除（不必等 60 秒冷却）');
  ok(store.list().total === 0, '清空后列表为空');
  ok(!existsSync(lockPath), '锁在清空完成后被释放（不会留下永久锁）');

  /*
   * 反向：段属于**仍然活着的进程**（用本进程 pid 造一个不归自己的段）→ 不删，如实 partial。
   * 删了会让对方下一次压实把它整段写回来——用户以为清空了、记录又复活。
   */
  {
    const dirLive = tmpDir();
    const segLive = path.join(dirLive, 'audit');
    mkdirSync(segLive, { recursive: true });
    const live = path.join(segLive, `audit.${process.pid}-7777-7.jsonl`);
    writeFileSync(live, JSON.stringify({ v: 1, kind: 'intent', id: 'z1', at: 1, tool: 'github_pr', action: 'merge', write: true, risk: 'destructive', summary: '活进程的记录' }) + '\n', 'utf8');
    const liveStore = new AuditStore({ dir: dirLive, flushDelayMs: 0 });
    const rLive = await liveStore.clear();
    ok(rLive.partial === true, '活进程的段不被清空（否则对方一次压实就把它写回来）', JSON.stringify(rLive));
    ok(existsSync(live), '活进程的段仍在磁盘上');
    ok(liveStore.list({ limit: 100 }).items.some((e) => e.id === 'z1'),
      '未清掉的活段记录仍然可见（不伪装成空列表）');
    await liveStore.dispose();
  }

  // 过期锁（崩溃遗留）应被抢过来，而不是让"清空"永久退化成 partial
  const dir2 = tmpDir();
  const segDir2 = path.join(dir2, 'audit');
  mkdirSync(segDir2, { recursive: true });
  const staleLock = path.join(dir2, '.lock');
  writeFileSync(staleLock, '99998', 'utf8');
  const old = new Date(Date.now() - 120_000); // 2 分钟前 > 30s 的过期阈值
  utimesSync(staleLock, old, old);
  const store3 = new AuditStore({ dir: dir2, flushDelayMs: 0 });
  const r3 = await store3.clear();
  ok(r3.partial === false, '过期锁被抢过来（崩溃遗留不会让清空永久失效）', JSON.stringify(r3));

  // 路由回传 partial（UI 据此显式提示）
  const routes = [];
  const deps = { bindRoute: (r) => routes.push(r), sendJson, readJsonBody };
  const dir3 = tmpDir();
  const segDir3 = path.join(dir3, 'audit');
  mkdirSync(segDir3, { recursive: true });
  writeFileSync(path.join(segDir3, 'audit.999-9000-9.jsonl'), JSON.stringify({ v: 1, kind: 'intent', id: 'y1', at: 1, tool: 'github_pr', action: 'merge', write: true, risk: 'destructive', summary: 'x' }) + '\n', 'utf8');
  const store4 = new AuditStore({ dir: dir3, flushDelayMs: 0 });
  registerAuditRoutes(deps, store4);
  writeFileSync(path.join(dir3, '.lock'), '99997', 'utf8');
  const route = routes.find((r) => r.path === '/api/github/audit/records/clear');
  let statusCode = 0;
  let payload = '';
  const req = {
    method: 'POST', url: '/api/github/audit/records/clear',
    headers: { host: '127.0.0.1:55716', origin: 'http://127.0.0.1:55716', 'content-type': 'application/json' },
    resume() {},
    on(ev, fn) { if (ev === 'end') setTimeout(fn, 0); return req; },
    destroy() {},
  };
  const res = { setHeader() {}, set statusCode(v) { statusCode = v; }, get statusCode() { return statusCode; }, end(s) { payload = s || ''; } };
  await route.handler(req, res);
  const body = JSON.parse(payload);
  ok(body.data.partial === true, '清空路由如实回传 partial（UI 据此提示"其他进程的 N 条未清空"）');
  ok(typeof body.data.remainingSegments === 'number' && body.data.remainingSegments > 0, '回传未清空的段数');

  await store.dispose();
  await store3.dispose();
  await store4.dispose();
}

/* ================================================================ */
console.log('\n--- 9. 设置页契约：规则落盘 / 解析回显 / 非法输入 ---');
/* ================================================================ */
{
  const dir = tmpDir();
  const store = makeStore({ dir, settingsDir: dir });
  store.setApprovalRules(['repo:acme/prod=off', 'action:github_issue:comment=off']);
  const file = auditSettingsPath(dir);
  ok(existsSync(file), '规则落 audit-settings.json');
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  ok(Array.isArray(saved.approvalRules) && saved.approvalRules.length === 2, '文件里是字符串数组（不是解析后的结构）');
  ok(saved.approvalRules[0] === 'repo:acme/prod=off', '原文逐字保存（用户写错的那一行也要能回显）');

  // 重启后读回
  const reloaded = loadAuditSettings(dir);
  ok(reloaded.approvalRules.length === 2 && reloaded.source === 'file', '重载后规则仍在');

  // 非法值不让整个设置读取失败
  writeFileSync(file, JSON.stringify({ enabled: true, budgetBytes: 1048576, approvalMode: 'off', approvalRules: [1, null, 'repo:a/b=off'] }), 'utf8');
  const dirty = loadAuditSettings(dir);
  ok(dirty.approvalRules.length === 1 && dirty.approvalRules[0] === 'repo:a/b=off',
    '文件被手改混进非字符串时只保留字符串项（不整份报废）');

  // 空规则可保存（清空规则是合法操作）
  ok(saveAuditSettings(dir, { enabled: true, budgetBytes: 1048576, approvalRules: [] }) === true, '清空规则可保存');
  ok(loadAuditSettings(dir).approvalRules.length === 0, '清空后读回是空数组');

  // 空白项被丢弃（用户多敲的空行不该变成一条"规则"）
  saveAuditSettings(dir, { enabled: true, budgetBytes: 1048576, approvalRules: ['  ', 'repo:a/b=off', ''] });
  ok(loadAuditSettings(dir).approvalRules.length === 1, '空白项被丢弃');

  // 非法档位由 Schema 语义兜住：设置文件里的脏档位回落默认
  writeFileSync(file, JSON.stringify({ enabled: true, budgetBytes: 1048576, approvalMode: 'bogus' }), 'utf8');
  ok(loadAuditSettings(dir).approvalMode === 'destructive', '非法档位回落默认（不静默采纳脏值）');

  // 路由：规则数组校验
  const routes = [];
  registerAuditRoutes({ bindRoute: (r) => routes.push(r), sendJson, readJsonBody }, store);
  const REQ_OK = { host: '127.0.0.1:55716', origin: 'http://127.0.0.1:55716', 'content-type': 'application/json' };
  async function post(body) {
    const route = routes.find((r) => r.path === '/api/github/audit/settings');
    let statusCode = 0;
    let payload = '';
    const req = {
      method: 'POST', url: '/api/github/audit/settings', headers: REQ_OK, resume() {},
      on(ev, fn) { (listeners[ev] || []).push(fn); return req; }, destroy() {},
    };
    const listeners = { data: [], end: [] };
    const res = { setHeader() {}, set statusCode(v) { statusCode = v; }, get statusCode() { return statusCode; }, end(s) { payload = s || ''; } };
    const p = route.handler(req, res);
    listeners.data.forEach((fn) => fn(Buffer.from(JSON.stringify(body))));
    listeners.end.forEach((fn) => fn());
    await p;
    return { statusCode, body: JSON.parse(payload) };
  }
  let r = await post({ approvalRules: ['repo:acme/prod=off', 'broken'] });
  ok(r.statusCode === 200, '规则保存成功');
  ok(r.body.data.rulesParsed.valid === 1, '回传有效条数 1');
  ok(r.body.data.rulesParsed.ignored.length === 1, '回传被忽略条数 1（设置页据此回显）');
  ok(r.body.data.approvalRules.length === 2, '回传原文 2 条');

  r = await post({ approvalRules: 'not-an-array' });
  ok(r.statusCode === 400, 'approvalRules 非数组 → 400');
  r = await post({ approvalRules: [1, 2] });
  ok(r.statusCode === 400, 'approvalRules 含非字符串 → 400');
  r = await post({ approvalRules: new Array(201).fill('repo:a/b=off') });
  ok(r.statusCode === 400, '规则条数超上限 → 400');

  await store.dispose();
}

/* ================================================================ */
console.log('\n--- 10. 审核观测行（/gh status health） ---');
/* ================================================================ */
{
  /*
   * 等待时长必须用**真实数据**验证。
   *
   * 旧断言 `typeof avgWaitMs === 'number' && >= 0` 是假绿：早先的实现拿 intent 行的 at
   * 当起点，而 intent 要等 tools/result 才写、decision 在 pre-execute 就写，差值恒为负
   * ⇒ 永远算出 0，看板显示"平均等待 0s"，而 `>= 0` 必然通过。
   * 真正的起点是 `askedAt`（发起审核请求的时刻），所以这里显式构造三个不同等待时长。
   */
  let clock = 1_700_000_000_000;
  const store = new AuditStore({ dir: tmpDir(), flushDelayMs: 0, now: () => clock });
  // 注意：本文件是 .mjs（纯 JS），不要写 TS 类型标注
  const seed = (callId, action, args, askedAt, decision) => {
    store.recordCall('github_pr', { action, ...args }, { ok: true }, { callId });
    store.recordDecision(callId, decision, undefined, askedAt);
  };
  // recordDecision 里 at = this.now()，所以"结论时刻"由 clock 控制
  clock = 1_000_000_000_000; seed('s1', 'merge', { pr_number: 1 }, clock, 'approved');
  clock += 4_200; // 等待 4200ms 后落决策
  seed('s2', 'merge', { pr_number: 2 }, clock - 4_200, 'rejected');
  clock += 1_800;
  seed('s3', 'merge', { pr_number: 3 }, clock - 1_800, 'no-client');

  const stats = store.approvalStats(7);
  ok(stats.approved === 1, '统计：批准 1');
  ok(stats.rejected === 1, '统计：拒绝 1');
  ok(stats.noClient === 1, '统计：无客户端 1（与拒绝分开统计）');
  ok(stats.total === 3, '统计：需人工确认总数 3');
  // (4200 + 1800 + 0) / 3 = 2000
  ok(stats.avgWaitMs === 2000, '平均等待用 askedAt→decision 实算（4200/1800/0 → 2000ms）', String(stats.avgWaitMs));

  // 缺 askedAt 的旧记录**不计入**均值，而不是按 0 拉低（会把指标做成假数据）
  {
    let t = 1_000_000_000_000;
    const legacy = new AuditStore({ dir: tmpDir(), flushDelayMs: 0, now: () => t });
    legacy.recordCall('github_pr', { action: 'merge', pr_number: 9 }, { ok: true }, { callId: 'l1' });
    legacy.recordDecision('l1', 'approved'); // 无 askedAt
    const s = legacy.approvalStats(7);
    ok(s.approved === 1 && s.avgWaitMs === null,
      '没有 askedAt 的历史决策不计入均值（avgWaitMs 为 null，而不是 0）', String(s.avgWaitMs));
    await legacy.dispose();
  }

  // auto 不计入（没人工介入的调用不是"待决"）
  const store2 = makeStore();
  store2.recordCall('github_pr', { action: 'merge', pr_number: 1 }, { ok: true }, { callId: 'a1' });
  ok(store2.approvalStats(7).total === 0, 'auto 决策不计入审核统计（它不是"待决"）');

  // 时间窗外的不计：用可推移的时钟——先回到 30 天前写入，再拨回现在查询。
  // 若时钟不动（固定在过去），`approvalStats` 的 since 也会跟着回到过去，
  // 记录永远落在窗口内，这条断言就会假绿。
  let oldClock = Date.now() - 30 * 86_400_000;
  const old = new AuditStore({ dir: tmpDir(), flushDelayMs: 0, now: () => oldClock });
  old.recordCall('github_pr', { action: 'merge', pr_number: 1 }, { ok: true }, { callId: 'old1' });
  old.recordDecision('old1', 'approved');
  oldClock = Date.now();
  ok(old.approvalStats(7).total === 0, '7 天窗外的不计入');
  ok(old.approvalStats(60).total === 1, '把窗口放大到 60 天后又能看到它（证明是窗口在起作用）');

  // 渲染：审核行与健康分分开呈现
  const summary = { healthScore: 92, statusLevel: 'EXCELLENT', totalCalls: 10, successCount: 9, failureCount: 1, degradationRate: 0, degradedCount: 0, confirmBlockedCount: 0, scopeBlockedCount: 0, toolStats: {}, recommendations: [] };
  const withLine = renderStatusMarkdown({ action: 'health' }, { ...summary, approvalLine: '需人工确认 3 次 · 批准 1 / 拒绝 1 · 无客户端 1 · 平均等待 14s' });
  ok(withLine.includes('审核（近 7 天）'), 'health 看板有审核行');
  ok(withLine.includes('无客户端 1'), '审核行里 no-client 单独列出（不是并进拒绝）');
  ok(withLine.includes('综合健康分'), '健康分仍在（审核行是附加，不是替换）');
  // 审核行与健康指标之间必须有空行断开，否则会被读成"健康分的一部分"
  ok(/执行成功率[^\n]*\n\n- \*\*审核/.test(withLine), '审核行与健康指标之间有空行断开（不被读成健康分的一部分）');
  const withoutLine = renderStatusMarkdown({ action: 'health' }, summary);
  ok(!withoutLine.includes('审核（近 7 天）'), '没有数据时不显示审核行（0 次会让用户以为功能坏了）');

  await store.dispose();
  await store2.dispose();
  await old.dispose();
}

/* ================================================================ */
console.log('\n--- 11. 接线契约：main.ts / 设置页 / 导出按钮 ---');
/* ================================================================ */
{
  const mainSrc = readFileSync(path.join(ROOT, 'src/main.ts'), 'utf8');
  ok(/resolveModeFor\(/.test(mainSrc), 'main.ts 用 resolveModeFor 把规则算进档位');
  ok(/getMode:\s*\(exec/.test(mainSrc), 'getMode 接收 exec（按调用求值，不是全局常量）');
  ok(/resolveScopeFromExec\(executor, exec/.test(mainSrc), '规则里的 repo 与记录同源解析（用户看到的仓库名就是规则里的名字）');
  ok(/createStatusTool\(executor, defaultTelemetryCollector, auditStore\)/.test(mainSrc),
    'status 工具拿到同一个 auditStore（审核行与记录同源，不另存统计）');

  const settingsSrc = readFileSync(path.join(ROOT, 'src/ui/sync-settings-modal.ts'), 'utf8');
  ok(/approvalRules:\s*splitRules\(auditRulesText\)/.test(settingsSrc), '设置页把多行文本按行切分后提交');
  ok(/onBlur:/.test(settingsSrc), '规则框失焦才保存（每次按键都发请求会打断输入）');
  ok(/解析出 /.test(settingsSrc), '设置页回显"解析出 N 条有效规则"');
  ok(/忽略 /.test(settingsSrc), '设置页回显被忽略的条数（规则写错不静默失效）');
  ok(settingsSrc.includes('本开关与 DSH 的权限预设不是同一套'),
    '边界说明在设置页且表述准确（"不是同一套" + 明说宿主策略优先级更高）');
  /*
   * 这条曾经是**恒真断言**：`!/auditRulesText[\s\S]{0,200}setAuditRulesText\(splitRules/`
   * —— 没有哪个实现会写出那种模式，而真正吃掉空行的是
   * `setAuditRulesText(j.data.approvalRules.join("\n"))`（保存成功后的回写）。
   * 现在直接钉住"不许用服务端返回值回写文本框"这个事实。
   */
  ok(!/setAuditRulesText\(\s*j\.data\.approvalRules\.join/.test(settingsSrc),
    '保存成功后不回写规则文本框（服务端会 trim 掉空行，回写等于吃用户的分组空行）');
  ok(/auditRulesSavedRef/.test(settingsSrc),
    '用"已保存基线"做变更比对，而不是每次失焦都发请求（否则会吞掉离开输入框后的第一次点击）');

  const modalSrc = readFileSync(path.join(ROOT, 'src/ui/audit-modal.ts'), 'utf8');
  ok(/handleExport\('md'\)/.test(modalSrc) && /handleExport\('json'\)/.test(modalSrc), '弹窗底栏有 JSON / MD 两个导出入口');
  ok(/URL\.createObjectURL/.test(modalSrc) && /revokeObjectURL/.test(modalSrc), '导出走 Blob 下载且回收 URL（不泄漏）');
  /*
   * partial 提示**不能**复用 `error` 槽位：清空成功后会立刻 load()，
   * 而 load() 第一行就是 setError(null)，会把它当场擦掉（DOM 实测过）。
   * 所以这里断言的是"有独立 state 且独立渲染"，不是"源码里出现了 partial 字样"。
   */
  ok(/var \[clearNotice, setClearNotice\]/.test(modalSrc),
    'partial 提示走独立 state（clearNotice），不复用会被 load() 清空的 error 槽位');
  ok(/setClearNotice\(/.test(modalSrc) && /clearNotice\s*\n?\s*\?/.test(modalSrc.replace(/\s+\n/g, '\n')),
    'clearNotice 既有写入点也有渲染点（只写不渲等于没做）');
  ok(/setError\(\(j && j\.message\) \|\| '清空失败'\);\s*\n\s*return;/.test(modalSrc),
    '清空失败分支不再调 load()（否则 setError(null) 会把失败提示擦掉，失败看起来像成功）');
  ok(/role: 'status'/.test(modalSrc), 'partial 提示带 role=status（读屏可达）');

  // 构建产物里真的有这些字符串（只在源码里等于没生效）
  const bundle = readFileSync(path.join(ROOT, 'lib/client.js'), 'utf8');
  ok(bundle.includes('本开关与 DSH 的权限预设不是同一套'), '边界说明进了客户端产物');
  ok(bundle.includes('按仓库 / 操作覆盖档位'), '规则框进了客户端产物');
  ok(bundle.includes('导出 MD'), '导出按钮进了客户端产物');
  ok(bundle.includes('其他进程的记录未被清空'), 'partial 提示文案进了产物');
  /*
   * 内联块 import 检查：**先证明标记存在**。
   * 旧写法 `bundle.slice(a, b)` 在标记缺失时得到空串，正则对空串恒为 false → 恒绿。
   * 实测抓到过 bundle 处于"未聚合"中间态（0 个标记、21 行 import）也照样 PASS。
   */
  const iSync = bundle.indexOf('[Bundled: sync-settings-modal.js]');
  const iHelp = bundle.indexOf('[Bundled: help-modal.js]');
  ok(iSync > 0 && iHelp > iSync, '两个内联标记都存在且顺序正确（否则下面的切片检查无意义）');
  ok(iSync > 0 && iHelp > iSync && !/^\s*import\s/m.test(bundle.slice(iSync, iHelp)),
    '设置页内联块没有残留 import（否则符号为 undefined → 白屏）');
}

/* ================================================================ */
console.log('\n--- 12. 真双进程：两个进程各写自己的段，合并读取 ---');
/* ================================================================ */
{
  /*
   * 为什么必须有这一节：前面 4/5 节的手造段文件只证明了"合并逻辑对不对"，
   * 证明不了"同一台机器上两个真实进程同时加载本插件时，段文件真的不会互相踩"。
   * 而后者正是 s3 §2.4 存在的全部理由（desktop + cli 两个 profile 同时跑）。
   *
   * 用 spawn + stdio:'inherit' 而不是 spawnSync/piped：后者在受限环境里会因为
   * 拿不到管道而 EPERM；而本测试根本不需要子进程的 stdout —— 它们把结果写进文件系统，
   * 父进程读文件即可。
   */
  const { spawn } = await import('node:child_process');
  const dir = tmpDir();
  const worker = path.join(dir, 'worker.mjs');
  writeFileSync(worker, `
    const { AuditStore } = await import('${lib('lib/audit.js')}');
    const store = new AuditStore({ dir: process.argv[2], flushDelayMs: 0 });
    store.recordCall('github_pr', { action: 'merge', pr_number: Number(process.argv[3]) }, { ok: true }, { callId: 'p' + process.argv[3] });
    await store.flush();
    await new Promise((r) => setTimeout(r, 250)); // 让两个进程的写入窗口重叠
    await store.dispose();
  `, 'utf8');

  const dataDir = path.join(dir, 'data');
  mkdirSync(dataDir, { recursive: true });
  const runWorker = (n) => new Promise((resolve) => {
    const child = spawn(process.execPath, [worker, dataDir, String(n)], { stdio: 'inherit' });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
  const codes = await Promise.all([runWorker(11), runWorker(22)]);
  ok(codes.every((c) => c === 0), '两个子进程都正常退出', JSON.stringify(codes));

  const segDir = path.join(dataDir, 'audit');
  const segs = existsSync(segDir) ? readdirSync(segDir).filter((n) => n.endsWith('.jsonl')) : [];
  ok(segs.length === 2, '两个进程各写自己的段（audit/ 下出现两个段文件）', segs.join(', '));
  ok(new Set(segs).size === 2, '两个段文件名不同（不会互相覆盖——同毫秒构造也不撞名）');

  // 第三个进程读取：必须能看到两个进程的记录
  const reader = new AuditStore({ dir: dataDir, flushDelayMs: 0 });
  const items = reader.list({ limit: 100 }).items;
  ok(items.length === 2, '合并读取看到两条记录（面板合并显示）', String(items.length));
  ok(items.some((e) => e.callId === 'p11') && items.some((e) => e.callId === 'p22'),
    '两个进程的记录都在（没有互相吃掉）');
  ok(reader.usage().segments === 2, 'usage().segments 如实报告 2 段');
  await reader.dispose();
}

/* ================================================================ */
console.log('\n--- 13. 文档同口径：github_help 知识库与「使用指南」不得与代码漂移 ---');
/* ================================================================ */
{
  /*
   * 为什么这一节不能省：本仓最贵的漂移源就是「文档说一套、代码做一套」。
   * 审核与记录这两件事的失效形态尤其阴——规则语法写错一个字，用户配了规则却不生效，
   * 界面一切正常。所以把**知识库文案里的事实**逐条对回代码常量。
   */
  const helpSrc = readFileSync(path.join(ROOT, 'src/tools/help.ts'), 'utf8');
  const guideSrc = readFileSync(path.join(ROOT, 'src/ui/help-modal.ts'), 'utf8');
  const audit = await import(lib('lib/audit.js'));

  // ① 主题注册：KB 里要有 audit，且 enum 里也要有（否则 Agent 传了也取不到）
  ok(/\n  audit: `/.test(helpSrc), 'github_help 知识库新增 audit 主题');
  const enumBlock = helpSrc.match(/enum: \[([\s\S]*?)\],/);
  ok(enumBlock !== null && /'audit'/.test(enumBlock[1]), 'audit 已进 topic enum（否则调用取不到）');
  const kbKeys = [...helpSrc.matchAll(/\n  ([a-z_]+): `/g)].map((m) => m[1]);
  const enumKeys = [...enumBlock[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  const missingEnum = kbKeys.filter((k) => !enumKeys.includes(k));
  ok(missingEnum.length === 0, '知识库里每个主题都在 enum 中（没有"写了但调不到"的主题）', missingEnum.join(','));
  const missingKb = enumKeys.filter((k) => k !== 'overview' && !kbKeys.includes(k));
  ok(missingKb.length === 0, 'enum 里每个主题都有知识库正文（没有"能调但没内容"的主题）', missingKb.join(','));

  // ② 规模口径两边一致：19 工具 / 106 业务 action / N 个查询主题
  const topicCount = enumKeys.length;
  ok(topicCount === 23, `查询主题数 = ${topicCount}（知识库与 enum 同步）`, String(topicCount));
  // 源码里的反引号写作 \`，比对前先还原，否则永远匹配不上（这类"测试自己写错"最容易误判成产品缺陷）
  const helpPlain = helpSrc.replace(/\\`/g, '`');
  const guidePlain = guideSrc.replace(/\\`/g, '`');
  ok(helpPlain.includes(`\`github_help\` 的 ${topicCount} 个查询主题`),
    'github_help 概览里的查询主题数与 enum 实际长度一致');
  ok(guidePlain.includes(`元指南的 ${topicCount} 个查询主题`),
    '使用指南里的查询主题数与 enum 实际长度一致（两个人类入口同口径）');

  // ③ 规则语法：文档里写的维度 / 档位必须就是代码认可的
  const auditSection = helpSrc.slice(helpSrc.indexOf('\n  audit: `'), helpSrc.indexOf('\n  mapping: `'));
  ok(auditSection.length > 500, 'audit 主题正文非空');
  for (const dim of ['repo', 'action', 'tool']) {
    ok(auditSection.includes(dim), `audit 主题写出维度 ${dim}`);
  }
  ok(audit.APPROVAL_MODES.every((m) => auditSection.includes(m)),
    'audit 主题写出的档位与 APPROVAL_MODES 完全一致', audit.APPROVAL_MODES.join(','));
  // 文档里的示例必须真的能被解析器接受（写一个解析不了的例子比不写更糟）。
  // 只取"完整规则"（含 `=` 且含维度前缀）——正文里单独提到的 `action:github_issue:comment`
  // 是语法说明，不是可复制示例，不该被当成规则去校验。
  const examples = [...auditSection.replace(/\\`/g, '`').matchAll(/`((?:repo|action|tool):[^`\n]+=[^`\n]+)`/g)]
    .map((m) => m[1].trim());
  ok(examples.length >= 3, '至少给出 3 个可复制示例', String(examples.length));
  const badExamples = examples.filter((e) => audit.parseApprovalRules([e]).rules.length !== 1);
  ok(badExamples.length === 0, '文档里的每个规则示例都能被解析器接受', badExamples.join(' | '));

  // ④ 档位覆盖面：文档说的 6 条 / 21 条必须与代码一致
  const { DESTRUCTIVE_ACTIONS } = await import(lib('lib/destructive.js'));
  const { WRITE_ACTIONS } = await import(lib('lib/tool-tiers.js'));
  const { AUDITED_TOOLS } = audit;
  const gateCount = Object.entries(DESTRUCTIVE_ACTIONS)
    .filter(([t]) => AUDITED_TOOLS.includes(t)).flatMap(([, a]) => Object.keys(a)).length;
  const writeCount = AUDITED_TOOLS.reduce((n, t) => n + (WRITE_ACTIONS[t]?.length || 0), 0);
  ok(gateCount === 6 && auditSection.includes('6 条'), `「仅高危」覆盖 ${gateCount} 条，文档写 6 条`);
  ok(writeCount === 21 && auditSection.includes('21'), `「全部写操作」覆盖 ${writeCount} 条，文档写 21`);

  // ⑤ 使用指南：边界说明、场景数与新增 FAQ 都要在
  ok(guideSrc.includes('本开关与 DSH 的权限预设无关') || readFileSync(path.join(ROOT, 'src/ui/sync-settings-modal.ts'), 'utf8').includes('本开关与 DSH 的权限预设无关'),
    '「与 DSH 权限预设无关」这句边界说明存在于人类入口（设置页或使用指南）');
  ok(/8 大真实协作场景/.test(guideSrc), '提示词实战改成 8 大场景');
  ok(guideSrc.includes('让 Agent 动手前先过我这关'), '新增的审核/记录场景卡在指南里');
  ok(guideSrc.includes('Q11:') && guideSrc.includes('Q12:'), 'FAQ 新增审核与记录两条（Q11 / Q12）');
  ok(/read_only/.test(guideSrc) && /danger-full-access/.test(guideSrc), '指南写明两个会让审核"看起来失效"的边界');

  // ⑥ 客户端产物：这些文案必须真的进了 bundle（只在源码里等于没生效）
  const bundle = readFileSync(path.join(ROOT, 'lib/client.js'), 'utf8');
  ok(bundle.includes('8 大真实协作场景'), '场景数文案进了 bundle');
  ok(bundle.includes('Q11:'), '新增 FAQ 进了 bundle');
  ok(bundle.includes('写操作前有人把门'), '能力总览的审核说明进了 bundle');

  /*
   * ⑦ 行为断言：真调一次 github_help(topic:'audit')。
   * 静态读源码只能证明"文本存在"，证明不了"Agent 真的拿得到"——
   * 主题没进 enum、dispatch 分支被改、或内容被模板字符串吃掉，都会在这一步现形。
   */
  const { createHelpTool } = await import(lib('lib/tools/help.js'));
  const helpTool = createHelpTool({ resolveExecScope: () => ({ cwd: process.cwd() }), run: async () => ({ ok: true, rawOutput: '' }) });
  const auditRes = await helpTool.execute({ topic: 'audit' }, {});
  ok(typeof auditRes?.result === 'string' && auditRes.result.length > 800, 'github_help(topic:"audit") 返回了正文', String(auditRes?.result?.length));
  for (const kw of ['首条匹配', 'repo', 'action', 'tool', 'off', 'destructive', 'all-writes', 'confirm', 'danger-full-access', 'read_only']) {
    ok(auditRes.result.includes(kw), `audit 主题覆盖关键词「${kw}」`);
  }
  ok(auditRes.result.includes('不要重试'), 'audit 主题给出被拒后的行为准则');
  const overviewRes = await helpTool.execute({}, {});
  ok(overviewRes.result.includes('审核'), 'overview 概览提示了写操作审核（Agent 不问 topic 也能知道）');
}

/* ================================================================ */
console.log('\n--- 14. 记录作用域：历史遗留的 github_api 记录不得再出现 ---');
/* ================================================================ */
{
  /*
   * 事故背景（2026-11-26 用户截图实证）：操作记录列表与「工具」下拉里出现了
   * `github_api GET search/repositories` 两条记录，而记录作用域按产品定义**只有 PR / Issue**。
   *
   * 根因不是写入：`recordCall` 从 `bea6b3a` 起就有 `isAuditedTool` 早退。真正的原因是
   * **那次收窄只改了写入路径，读取路径没跟**——s1 首版记录过所有 github_* 工具（读操作也
   * 落一行自带身份），这些行一直躺在磁盘上被反复折叠显示。
   *
   * 修法：装载期按同一真源 `AUDITED_TOOLS` 丢行。丢在装载期而不是 `list()` 里过滤，
   * 才能让它们在下一次压实时从磁盘消失，而不是永久占着字节预算。
   */
  const outOfScopeRows = [
    // 作用域外：intent 带 tool
    { v: 1, kind: 'intent', id: 'api1', at: 1000, tool: 'github_api', action: '', write: true, risk: 'read', summary: 'github_api GET search/repositories' },
    // 作用域外：旧版"读操作自带身份"的 result 行（这条正是截图里那类记录）
    { v: 1, kind: 'result', id: 'api1', at: 1001, ok: true, tool: 'github_api', action: '', write: false, risk: 'read', summary: 'github_api GET search/repositories' },
    { v: 1, kind: 'intent', id: 'rel1', at: 1500, tool: 'github_release', action: 'delete', write: true, risk: 'destructive', summary: '删除 Release v1' },
  ];
  const inScopeRows = [
    { v: 1, kind: 'intent', id: 'pr1', at: 2000, tool: 'github_pr', action: 'merge', write: true, risk: 'destructive', summary: '合并 PR #1' },
    // 写操作的 result 行**不带** tool（靠 id 折叠）—— 必须保留
    { v: 1, kind: 'result', id: 'pr1', at: 2001, ok: true },
    // decision / delete 行没有工具身份 —— 丢掉会让折叠与墓碑失效
    { v: 1, kind: 'decision', id: 'pr1', at: 2002, decision: 'rejected' },
    { v: 1, kind: 'delete', at: 2003, ids: ['api1'] },
  ];
  const allRows = [...outOfScopeRows, ...inScopeRows];

  // A) 旧单文件（迁移路径）：作用域外的行被丢弃，且不会随迁移写进新段
  {
    const dir = tmpDir();
    writeFileSync(path.join(dir, 'audit.jsonl'), allRows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
    const store = new AuditStore({ dir, flushDelayMs: 0 });
    const page = store.list();
    ok(page.total === 1, '作用域外的历史记录不出现在列表里（只留 PR 那条）', String(page.total));
    ok(page.items[0]?.id === 'pr1', '留下的正是作用域内的记录');
    ok(page.items[0]?.decision === 'rejected', '决策行没有被误删（审核列仍显示已拒绝）');
    ok(store.list().items.every((e) => e.tool !== 'github_api'), 'list 里没有任何 github_api 记录');
    /*
     * 内存行数 = 3 而不是 4：迁移时会同步压实，`compactRows()` 把墓碑行本身兑现掉
     * （墓碑的语义是"删除这些 id"，生效后它自己也不该继续留在内存里）。剩下的是
     * intent + result + decision 三行。
     */
    ok(store.usage().rows === 3, '内存行数 = 作用域内 3 行（api×2 + release×1 已丢弃，墓碑已兑现）', String(store.usage().rows));

    // 迁移时会同步压实本段 → 磁盘上的脏行应一并消失
    const own = readFileSync(store.filePath(), 'utf8');
    ok(!own.includes('github_api'), '迁移后的段文件里不含 github_api（脏数据被真正清掉，不是只隐藏）');
    ok(!own.includes('github_release'), '迁移后的段文件里不含其余工具（github_release 同样越界）');
    ok(own.includes('"id":"pr1"'), '作用域内的记录仍在磁盘上');
    ok(!existsSync(path.join(dir, 'audit.jsonl')), '旧单文件已被迁移并删除');
    await store.dispose();
  }

  // B) 别的进程的段：内存里过滤掉；若该进程已死，**磁盘字节也要清掉**
  {
    const dir = tmpDir();
    const segDir = path.join(dir, 'audit');
    mkdirSync(segDir, { recursive: true });
    const DEAD_PID = 99999999;
    const foreign = path.join(segDir, `audit.${DEAD_PID}-1000-1.jsonl`);
    writeFileSync(foreign, allRows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
    const longAgo = new Date(Date.now() - 10 * 60_000);
    utimesSync(foreign, longAgo, longAgo);
    const store = new AuditStore({ dir, flushDelayMs: 0 });
    ok(store.list().total === 1, '别的段里的作用域外记录同样不显示', String(store.list().total));
    /*
     * 关键：不只是"不显示"，**字节也得清掉**。
     * 早先这里只判 bad 行比例才重写，越界行永远等不到压缩（本进程段永远是新建的空文件），
     * 结果是界面上看不见、磁盘上还在——那是隐私问题不是显示问题。
     */
    const after = readFileSync(foreign, 'utf8');
    ok(!after.includes('github_api'), '已死进程段里的越界字节被真正清掉（不是只隐藏）', after.slice(0, 120));
    ok(!after.includes('github_release'), '其余越界工具同样清掉');
    ok(after.includes('"id":"pr1"'), '作用域内的行仍保留在同一段里（只删该删的）');
    await store.dispose();
  }

  // B2) 活进程的段：只过滤显示，**不改别人的文件**（跨进程压实会丢对方数据）
  {
    const dir = tmpDir();
    const segDir = path.join(dir, 'audit');
    mkdirSync(segDir, { recursive: true });
    const foreign = path.join(segDir, `audit.${process.pid}-2000-2.jsonl`);
    writeFileSync(foreign, allRows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
    const store = new AuditStore({ dir, flushDelayMs: 0 });
    ok(store.list().total === 1, '活进程的段同样只显示作用域内的记录');
    ok(readFileSync(foreign, 'utf8').includes('github_api'),
      '活进程的段不被重写（别人的文件不能动）');
    await store.dispose();
  }

  // C) 作用域过滤不能把"只有 tool 字段"作为唯一判据的边界踩掉：未知工具同样越界
  {
    const dir = tmpDir();
    writeFileSync(path.join(dir, 'audit.jsonl'),
      JSON.stringify({ v: 1, kind: 'intent', id: 'x1', at: 1, tool: 'bash', action: '', write: false, risk: 'read', summary: 'bash rm -rf /' }) + '\n',
      'utf8');
    const store = new AuditStore({ dir, flushDelayMs: 0 });
    ok(store.list().total === 0, '非本插件的工具名（bash）不可能出现在记录里');
    await store.dispose();
  }

  // D) 写入路径与读取路径必须同一真源
  {
    const store = makeStore();
    // 写入侧本来就挡住作用域外工具
    store.recordCall('github_api', { endpoint: '/user' }, { ok: true }, { callId: 'w1' });
    store.recordCall('github_release', { action: 'delete', tag: 'v1' }, { ok: true }, { callId: 'w2' });
    ok(store.list().total === 0, '写入侧：作用域外工具不产生记录（原有行为不变）');
    const auditSrc = readFileSync(path.join(ROOT, 'src/audit.ts'), 'utf8');
    ok(/isOutOfScopeRow/.test(auditSrc) && /isAuditedTool\(tool\)/.test(auditSrc),
      '读取侧的过滤复用 isAuditedTool（不是另写一份白名单）');
    await store.dispose();
  }

  // D2) 作用域的另一条边：**读操作**同样不该出现（首版遗留的读行会被丢）
  {
    const dir = tmpDir();
    writeFileSync(path.join(dir, 'audit.jsonl'), [
      // 首版遗留：PR 的读操作，工具名合法但 write=false
      JSON.stringify({ v: 1, kind: 'intent', id: 'r1', at: 1, tool: 'github_pr', action: 'list', write: false, risk: 'read', summary: '列出 PR' }),
      // 首版遗留：读操作的 result 自带身份（write=false）
      JSON.stringify({ v: 1, kind: 'result', id: 'r2', at: 2, ok: true, tool: 'github_issue', action: 'view', write: false, risk: 'read', summary: '查看 Issue #1' }),
      // 现行写操作：必须保留
      JSON.stringify({ v: 1, kind: 'intent', id: 'w1', at: 3, tool: 'github_pr', action: 'merge', write: true, risk: 'destructive', summary: '合并 PR #1' }),
      JSON.stringify({ v: 1, kind: 'result', id: 'w1', at: 4, ok: true }),
    ].join('\n') + '\n', 'utf8');
    const store = new AuditStore({ dir, flushDelayMs: 0 });
    const items = store.list().items;
    ok(items.length === 1 && items[0].id === 'w1',
      '读操作的历史行同样被丢弃（记录只保留写操作）', JSON.stringify(items.map((e) => e.id)));
    ok(!items.some((e) => e.write !== true), '列表里不存在 write=false 的记录');
    await store.dispose();
  }

  // E) UI：下拉候选只剩 PR / Issue，不再从当前页数据里补工具
  {
    const modalSrc = readFileSync(path.join(ROOT, 'src/ui/audit-modal.ts'), 'utf8');
    ok(!/items\.forEach[\s\S]{0,200}toolOptions\.push/.test(modalSrc),
      '工具下拉不再"把该页出现的工具补进候选"（那会让历史脏工具冒出来）');
    const filterValues = modalSrc.match(/value: 'github_[a-z_]+'/g) || [];
    ok(filterValues.length === 2, `工具筛选候选恰好 2 项（实际 ${filterValues.length}）`, filterValues.join(','));
    ok(!modalSrc.includes("value: 'github_api'"), '下拉里没有 github_api');
    ok(modalSrc.includes('Issue / PR 的每一次写操作'),
      '弹窗副标题说明"只有 PR / Issue 的写操作"');
    ok(!modalSrc.includes('以及其余 GitHub 工具'),
      '副标题不再写"以及其余 GitHub 工具"（那句与记录作用域直接矛盾，是本次误报的来源之一）');
    const bundle = readFileSync(path.join(ROOT, 'lib/client.js'), 'utf8');
    // 用 audit-modal 独有的半句判断，避免与设置页说明文案（同样含"21 个写操作"）撞车
    ok(bundle.includes('读操作与其余 GitHub 工具不在记录范围内'), '新副标题进了 bundle');
  }
}

/* ================================================================ */
console.log('\n--- 15. 设置页布局：加宽弹窗与左导航，标题不折行 ---');
/* ================================================================ */
{
  /*
   * 用户截图实证：设置页左栏只有 148px，「🕘 操作记录与审核」被折成两行；整体 640px
   * 宽也让右侧的多行规则框挤成窄条。两栏布局与单列表单的宽度诉求本来就不同，
   * 所以给设置页单独的加宽变体，而不是把所有弹窗一起撑大。
   */
  const css = readFileSync(path.join(ROOT, 'src/ui/styles.ts'), 'utf8');
  const modalSrc = readFileSync(path.join(ROOT, 'src/ui/sync-settings-modal.ts'), 'utf8');
  const bundle = readFileSync(path.join(ROOT, 'lib/client.js'), 'utf8');

  ok(/className: "dsh-github-modal-dialog dsh-github-settings-dialog"/.test(modalSrc),
    '设置弹窗挂上了加宽变体类');
  ok(/\.dsh-github-settings-dialog\s*\{[^}]*max-width:\s*900px/.test(css),
    '设置弹窗最大宽度 900px（通用弹窗仍是 640px）');
  ok(/\.dsh-github-settings-dialog\s*\{[^}]*width:\s*94%/.test(css), '设置弹窗宽度 94%');

  // 通用弹窗不得被顺手改宽——那是"为了一页撑大所有页"的坏味道
  const generic = css.match(/\.dsh-github-modal-dialog\s*\{([^}]*)\}/);
  ok(generic !== null && /max-width:\s*640px/.test(generic[1]), '通用弹窗仍是 640px（未被顺手放宽）');

  const navRule = css.match(/\.dsh-github-settings-nav\s*\{([^}]*)\}/);
  ok(navRule !== null && /width:\s*196px/.test(navRule[1]), '左导航宽度 148px → 196px');
  const navItemRule = css.match(/\.dsh-github-settings-nav-item\s*\{([^}]*)\}/);
  ok(navItemRule !== null && /white-space:\s*nowrap/.test(navItemRule[1]),
    '导航项不折行（「操作记录与审核」不会再被拆成两行）');

  ok(bundle.includes('dsh-github-settings-dialog'), '加宽类进了客户端产物');
  ok(/\.dsh-github-settings-dialog\s*\{[^}]*max-width:\s*900px/.test(bundle), '加宽样式进了产物（只在源码里等于没生效）');
}

/* ================================================================ */
console.log('\n--- 16. 审核时自查出的热路径与体量问题 ---');
/* ================================================================ */
{
  // A) 读操作不应触发"按调用解析仓库"（s3 把 getMode 改成吃 exec 后引入的 I/O）
  let modeCalls = 0;
  const gate = createApprovalGate({
    getMode: () => { modeCalls++; return 'destructive'; },
    getApproval: () => ({ config: { policy: 'ask' }, overrideOf: () => undefined, request: async () => 'allowed-once' }),
    recordDecision: () => {},
    warn: () => {},
  });
  let n = 0;
  const next = async () => { n++; return { kind: 'allow' }; };
  let seq = 0;
  const execOf = (name, args) => ({ name, arguments: args, callId: 'r' + (++seq), agent: {}, signal: {} });

  await gate(execOf('github_pr', { action: 'list' }), next);
  ok(modeCalls === 0, '读操作（list）根本不求值策略 —— 省掉按调用解析仓库的同步 I/O', String(modeCalls));
  await gate(execOf('github_issue', { action: 'view', issue_number: 1 }), next);
  ok(modeCalls === 0, '读操作（view）同样不求值策略');
  ok(n === 2, '两次读操作都正常放行', String(n));
  await gate(execOf('github_pr', { action: 'merge', pr_number: 1 }), next);
  ok(modeCalls === 1, '写操作才求值策略', String(modeCalls));

  // 判据本身也导出了，便于单测与文档引用
  const gateSrc = readFileSync(path.join(ROOT, 'src/approval-gate.ts'), 'utf8');
  ok(/export function isWriteCall/.test(gateSrc), 'isWriteCall 作为前置短路的判据被显式导出');
  ok(gateSrc.indexOf('isWriteCall(exec)') < gateSrc.indexOf('shouldAsk(exec, deps.getMode(exec))'),
    '先判写再算策略（顺序即性能）');

  // B) 没有生效规则时不做仓库解析
  const store = makeStore();
  ok(store.hasApprovalRules() === false, '默认（无规则）hasApprovalRules 为 false');
  store.setApprovalRules(['repo:acme/prod=off']);
  ok(store.hasApprovalRules() === true, '写了有效规则后为 true');
  store.setApprovalRules(['全是错的规则']);
  ok(store.hasApprovalRules() === false, '只有非法规则时仍为 false（等于没规则，不必解析仓库）');
  const mainSrc = readFileSync(path.join(ROOT, 'src/main.ts'), 'utf8');
  ok(/if \(!auditStore\.hasApprovalRules\(\)\) return auditStore\.approvalMode\(\);/.test(mainSrc),
    'main.ts 的 getMode 用 hasApprovalRules 短路');
  /*
   * 顺序断言只在 getMode 块内、且用**带调用的**字符串比较：
   * `resolveScopeFromExec` 在同块上方的注释里也被提到，用裸名字会比到注释上，
   * 得到"短路在后"的假结论（这次真踩到了）。
   */
  const getModeBlock = mainSrc.slice(mainSrc.indexOf('getMode:'), mainSrc.indexOf('getApproval:'));
  ok(getModeBlock.length > 0, '能定位 main.ts 的 getMode 块');
  ok(getModeBlock.indexOf('hasApprovalRules') >= 0
    && getModeBlock.indexOf('hasApprovalRules') < getModeBlock.indexOf('resolveScopeFromExec(executor'),
    'getMode 块内短路在仓库解析之前（否则等于没短路）');
  await store.dispose();

  // C) 导出体量护栏：预算 64 MB 也炸不了进程
  {
    const store2 = makeStore();
    store2.recordCall('github_pr', { action: 'merge', pr_number: 1 }, { ok: true }, { callId: 'x1' });
    const routes = [];
    registerAuditRoutes({ bindRoute: (r) => routes.push(r), sendJson, readJsonBody }, store2);
    const realUsage = store2.usage.bind(store2);
    // 伪造一个超大用量：真实造 32MB 只为一断言，代价不成比例
    store2.usage = () => ({ ...realUsage(), bytes: 40 * 1024 * 1024 });

    const route = routes.find((r) => r.path === '/api/github/audit/export');
    const REQ_OK = { host: '127.0.0.1:55716', origin: 'http://127.0.0.1:55716', 'content-type': 'application/json' };
    const hit = async (reqBody) => {
      let statusCode = 0;
      let payload = '';
      const listeners = { data: [], end: [] };
      const req = {
        method: 'POST', url: '/api/github/audit/export', headers: REQ_OK, resume() {},
        on(ev, fn) { (listeners[ev] || []).push(fn); return req; }, destroy() {},
      };
      const res = { setHeader() {}, set statusCode(v) { statusCode = v; }, get statusCode() { return statusCode; }, end(s) { payload = s || ''; } };
      const p = route.handler(req, res);
      listeners.data.forEach((fn) => fn(Buffer.from(JSON.stringify(reqBody))));
      listeners.end.forEach((fn) => fn());
      await p;
      return { statusCode, body: JSON.parse(payload) };
    };

    // ① 不筛选 + 库很大 → 拒，且**文案不写"调小预算"**（那是删数据，不是导出方案）
    let r = await hit({ format: 'json' });
    ok(r.statusCode === 422, '不筛选且体量超上限时拒绝导出（422，不是 413）', String(r.statusCode));
    ok(/缩小范围/.test(r.body.message), '提示引导用户缩小范围', r.body.message);
    ok(!/调小保留预算|调小预算/.test(r.body.message),
      '提示里不出现"调小保留预算"（那是删数据，把删除当导出方案是误导）', r.body.message);

    // ② 筛选后 → 允许（筛小范围是用户唯一能走的正路，不能因全局体量大就被永久堵死）
    r = await hit({ format: 'json', filter: { tool: 'github_pr' } });
    ok(r.statusCode === 200 && r.body.ok === true,
      '带上筛选后可以导出（否则"先筛选"这条指引进退两难）', String(r.statusCode));
    await store2.dispose();
  }
}

for (const d of tmpDirs) {
  try { rmSync(d, { recursive: true, force: true }); } catch { /* 临时目录清不掉不影响结论 */ }
}

console.log(`\n=== phase55 结果: ${passed} 通过 / ${failed} 失败 ===`);
if (failed > 0) process.exit(1);
