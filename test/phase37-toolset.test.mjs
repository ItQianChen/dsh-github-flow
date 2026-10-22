// test/phase37-toolset.test.mjs
//
// 工具档位（toolsets / read_only）契约测试。
//
// 为什么必须独立成阶段：档位是「方案→模型可见工具面」的唯一开关。它错了不会报错，
// 只会让模型看不见某个工具（或看见本该被禁的写 action）——两类故障都极难排查。
// 因此这里断言的不是「函数返回了什么」，而是**字符数、工具名集合、enum 交集**三件
// 可机器判定的事实。
//
// 基线数字全部实测（s5 实施时 lib/ 的真实产物），不是文档里抄的：
//   full = 19 工具 / 27,016 字符；core = 3 / 4,412（−83.7%）；
//   ci = 7 / 10,633；maintain = 8 / 13,964；full+read_only = 18 / 25,729。
// 计划文档里的 23,765 / 8,302 / 22,396 是 s3 之前的旧产物，已失效。

import { readdirSync } from 'node:fs';
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
    console.error(`❌ FAIL: ${name}${extra ? '  → ' + extra : ''}`);
  }
}

const lib = (p) => 'file://' + path.join(ROOT, p).replace(/\\/g, '/');

const { applyTier, resolveToolNames, WRITE_ACTIONS, TOOL_PRESETS } = await import(
  `file://${path.join(ROOT, 'lib/tool-tiers.js').replace(/\\/g, '/')}`
);

const mock = {
  defaultListLimit: 20,
  async run() { return { ok: true, data: {}, rawOutput: '' }; },
  async getRepoMetadata() { return null; },
  async getGhVersion() { return '2.96.0'; },
};

/** 与 plan §3.1 同口径：只序列化模型可见的三个字段 */
const size = (tools) =>
  tools.reduce(
    (a, t) => a + JSON.stringify({ name: t.name, description: t.description, parameters: t.parameters }).length,
    0
  );

const LIB_TOOLS = path.join(ROOT, 'lib/tools');
const all = [];
for (const file of readdirSync(LIB_TOOLS).filter((f) => f.endsWith('.js') && f !== 'image-utils.js').sort()) {
  const mod = await import(`file://${LIB_TOOLS.replace(/\\/g, '/')}/${file}`);
  const factory = Object.entries(mod).find(([k, v]) => k.startsWith('create') && typeof v === 'function')?.[1];
  if (!factory) continue;
  const tool = factory(mock);
  if (tool?.name) all.push(tool);
}

console.log('\n--- 1. 默认档位必须零破坏 ---');
ok(all.length === 19, '工具工厂实例化出 19 个工具', String(all.length));
// s7 给 github_pr 加了 comments/commit_id 两个参数（行级评注 + 锚点），基线从 24,043 涨到 24,726（+683）
// 这不是回归：新增能力必然占 schema，仍远低于 s5 定下的 25K 常驻红线
// s8 加入 github_task（3 个任务原语）后基线 24,726 → 27,016。这不是回归：core 档同步从
// 5 个工具 9,217 字符收缩到 3 个工具 4,412 字符（−83.7%），「加一个工具」与「减表面积」是同一个动作
ok(size(all) === 27016, '全量 schema 字符数 == 27,016（s8 新增 github_task 后的新基线）', String(size(all)));
{
  const r = applyTier(all, {});
  ok(r.kept.length === 19, '不配置 toolsets → 保留全部 19 个');
  ok(size(r.kept) === 27016, '不配置 toolsets → 字符数不变');
  ok(r.dropped.length === 0, '不配置 toolsets → 不剔除任何工具');
  ok(Object.keys(r.pruned).length === 0, '不配置 read_only → 不剪任何 action');
}
{
  const r = applyTier(all, { toolsets: ['full'] });
  ok(r.kept.length === 19, "显式 toolsets:['full'] 与不配置等价");
}

console.log('\n--- 2. 预设档位 ---');
const presets = [
  ['core', 3, 4412],
  ['ci', 7, 10633],
  ['maintain', 8, 13964],
];
for (const [name, count, chars] of presets) {
  const r = applyTier(all, { toolsets: [name] });
  ok(r.kept.length === count, `toolsets:['${name}'] → ${count} 个工具`, String(r.kept.length));
  ok(size(r.kept) === chars, `toolsets:['${name}'] → schema ${chars} 字符`, String(size(r.kept)));
}
ok(TOOL_PRESETS.core.length === 3 && TOOL_PRESETS.core.includes('github_help'), 'core 预设恰好 3 个（github_task + github_repo + github_help）且含 github_help');

console.log('\n--- 3. 裸工具名 / 混用 / 未知名 ---');
{
  const r = applyTier(all, { toolsets: ['github_pr', 'github_release'] });
  ok(r.kept.length === 2, '裸工具名可用（2 个）', String(r.kept.length));
  ok(r.kept.map((t) => t.name).sort().join(',') === 'github_pr,github_release', '裸工具名精确命中');
}
{
  const r = applyTier(all, { toolsets: ['core', 'github_release'] });
  ok(r.kept.length === 4, '预设与裸名混用取并集（3 + 1 = 4）', String(r.kept.length));
}
{
  // 未知名字必须 warn 且忽略，不能静默把工具全砍光
  const warned = [];
  const orig = console.warn;
  console.warn = (m) => warned.push(String(m));
  const r = applyTier(all, { toolsets: ['crow', 'github_pr'] });
  console.warn = orig;
  ok(r.kept.length === 1 && r.kept[0].name === 'github_pr', '未知档位被忽略，其余配置仍生效', String(r.kept.length));
  ok(warned.length === 1 && warned[0].includes('crow'), '未知档位触发一次 console.warn（不静默）', warned.join('|'));
}

console.log('\n--- 4. read_only 硬语义：写 action 在注册期被剪掉 ---');
{
  const r = applyTier(all, { read_only: true });
  ok(r.dropped.includes('github_api'), 'github_api 在只读模式下整体剔除（端点/method 任意，无法降级）');
  ok(r.kept.length === 18, '只读模式保留 18 个工具（github_api 整体剔除）', String(r.kept.length));
  ok(size(r.kept) === 25729, '只读模式 schema 25,729 字符（github_task 的 review_pr 被剪掉 5 字符）', String(size(r.kept)));

  let violations = [];
  for (const tool of r.kept) {
    const writes = WRITE_ACTIONS[tool.name];
    if (!writes || writes === '*') continue;
    const enumVals = tool.parameters?.properties?.action?.enum ?? [];
    const leaked = enumVals.filter((a) => writes.includes(a));
    if (leaked.length) violations.push(`${tool.name}: ${leaked.join('/')}`);
  }
  ok(violations.length === 0, '保留工具的 action.enum 与 WRITE_ACTIONS 交集为空', violations.slice(0, 3).join(' ; '));
  ok(Object.keys(r.pruned).length === 15, '15 个混合工具被剪 action 而非整只剔除', String(Object.keys(r.pruned).length));
  // 剪枝必须带上前缀，让模型知道为什么少了写动作
  const pr = r.kept.find((t) => t.name === 'github_pr');
  ok(pr.description.startsWith('[只读模式]'), '被剪枝的工具 description 前置「[只读模式]」');
  ok(!pr.parameters.properties.action.enum.includes('merge'), 'github_pr 的 merge 在只读模式下不可见');
  ok(pr.parameters.properties.action.enum.includes('list'), 'github_pr 的 list 在只读模式下仍可见');
}
{
  const r = applyTier(all, { toolsets: ['core'], read_only: true });
  ok(r.kept.length === 3, 'core + read_only 组合可用（3 个工具，review_pr 的写 action 被剪掉）', String(r.kept.length));
}

console.log('\n--- 4b. read_only 必须在执行期也拦住（不能只剪 schema）---');
// 为什么必须单独断言：本插件的工具是手写 descriptor，宿主只把 parameters 当 JSON Schema
// 发给模型，**不做执行前参数校验**。所以「剪 enum」只实现了「看不见」，没实现「做不到」——
// 模型从历史里复读一个被剪掉的 action 时，执行路径会照样走到 `gh pr merge`。
{
  const prMod = await import(lib('lib/tools/pr.js'));
  const calls = [];
  const mock = {
    defaultListLimit: 20,
    async run(cmd) { calls.push(cmd); return { ok: true, data: {}, rawOutput: 'ok' }; },
    async getRepoMetadata() { return { nameWithOwner: 'o/r' }; },
    resolveExecScope() { return { cwd: process.cwd() }; },
  };
  const roTool = applyTier([prMod.createPrTool(mock)], { read_only: true }).kept[0];
  let threw = null;
  try {
    await roTool.execute({ action: 'merge', pr_number: 1, confirm: true }, {});
  } catch (e) {
    threw = String(e?.message || e);
  }
  ok(threw !== null && threw.includes('只读模式'), '执行期拒绝被剪掉的写 action（带 confirm 也不行）', threw);
  ok(calls.length === 0, '被拒绝的写 action 不产生任何 gh 调用（零副作用）', `实际 ${calls.length} 次`);
  const before = calls.length;
  await roTool.execute({ action: 'list' }, {});
  ok(calls.length === before + 1, '只读 action 照常执行');
  // 非只读档位不受影响
  const rwTool = applyTier([prMod.createPrTool(mock)], {}).kept[0];
  let rwThrew = null;
  try {
    await rwTool.execute({ action: 'merge', pr_number: 1, confirm: true }, {});
  } catch (e) {
    rwThrew = String(e?.message || e);
  }
  ok(rwThrew === null, '未开 read_only 时 merge 不被「只读模式」拦截', rwThrew);
}

console.log('\n--- 5. 纯函数性质：不修改入参、可重复调用 ---');
{
  // 深冻结：只冻外层对象证明不了「没有就地改 enum 数组」，必须把被剪的那个数组也冻上
  const frozen = Object.freeze(
    all.map((t) =>
      Object.freeze({
        ...t,
        parameters: Object.freeze({
          ...t.parameters,
          properties: Object.freeze({
            ...t.parameters.properties,
            ...(t.parameters.properties.action
              ? { action: Object.freeze({ ...t.parameters.properties.action, enum: Object.freeze([...t.parameters.properties.action.enum]) }) }
              : {}),
          }),
        }),
      })
    )
  );
  let threw = null;
  try {
    applyTier(frozen, { read_only: true, toolsets: ['core'] });
  } catch (e) {
    threw = String(e?.message || e);
  }
  ok(threw === null, '入参（含 enum 数组）被深冻结后调用不抛错（证明未就地修改）', threw);
  const a = applyTier(all, { read_only: true });
  const b = applyTier(all, { read_only: true });
  ok(JSON.stringify(a.kept.map((t) => t.name)) === JSON.stringify(b.kept.map((t) => t.name)), '同输入两次调用工具集一致');
  ok(size(a.kept) === size(b.kept), '同输入两次调用字符数一致');
  // 剪枝产物必须与原对象解引用（否则第二次调用会二次剪枝）
  const original = all.find((t) => t.name === 'github_pr');
  const pruned = a.kept.find((t) => t.name === 'github_pr');
  ok(original.parameters !== pruned.parameters, '剪枝产出新 parameters 对象（不与原对象共享引用）');
  ok(original.parameters.properties.action !== pruned.parameters.properties.action, '剪枝产出新 action schema 对象');
  ok(original.parameters.properties.action.enum.includes('merge'), '原工具的 enum 未被就地修改');
}
{
  ok(resolveToolNames(undefined, ['a', 'b']) === 'all', 'resolveToolNames(undefined) → all');
  ok(resolveToolNames([], ['a', 'b']) === 'all', 'resolveToolNames([]) → all（空数组不当作“什么都不要”）');
  // 精确断言：只写 'b' 必须只返回 ['b']。只断 Array.isArray 时返回全部名单也会过。
  ok(JSON.stringify(resolveToolNames(['b'], ['a', 'b'])) === '["b"]', 'resolveToolNames([b]) 精确返回 ["b"]', JSON.stringify(resolveToolNames(['b'], ['a', 'b'])));
  ok(JSON.stringify(resolveToolNames(['full'], ['a', 'b'])) === '"all"', "resolveToolNames(['full']) 归一为 'all'");
}

console.log('\n--- 6. resolveExecScope 真实实现（不是 mock 复刻的语义）---');
// 这一节是 s5 复核抓到的 P1 的回归网：最初实现直接复用 resolveWorkspaceCwd 的三级解析，
// 导致「无显式 cwd」时落到 findMostRecentWorkspacePath()，把工具目录定到与本会话无关的
// 最近活跃仓库——读错库，写也会写到错库。mock 全都复刻旧语义，所以那条路径当时零覆盖。
//
// ⚠️ 为什么必须自造 fixture 工作区：`findMostRecentWorkspacePath()` 读的是宿主机的
// `~/.dsh/storages/workspace.json`。干净 HOME / CI 上这个文件不存在 → 它返回 undefined →
// **被禁止的那条三级实现也返回 process.cwd()**，断言恒绿、抓不到回归（本机只是因为本机
// registry 恰好指向别的仓库才偶然能抓到）。这里临时把 HOME 指向一个含伪造 workspace.json
// 的 fixture，让「最近活跃工作区」一定是一个不等于 process.cwd() 的路径。
{
  const fs = await import('node:fs');
  const os = await import('node:os');
  const { GhExecutor } = await import(lib('lib/executor.js'));
  const { resetWorkspaceCache } = await import(lib('lib/workspace.js'));

  const ex = new GhExecutor({});
  const savedSession = process.env.DSH_SESSION_ID;
  const savedHome = process.env.HOME;
  const savedProfile = process.env.USERPROFILE;

  ok(ex.resolveExecScope({ cwd: process.cwd() }).cwd === process.cwd(), '显式 cwd（存在）原样透传');
  const ghost = path.join(ROOT, '__no_such_dir__');
  ok(ex.resolveExecScope({ cwd: ghost }).cwd === ghost, '显式 cwd（不存在）也原样透传，与 s5 前行为一致');

  // ---- fixture：伪造一个「最近活跃 + 有 .git」的工作区 ----
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-ws-fixture-'));
  const fakeWs = path.join(home, 'recent-workspace');
  fs.mkdirSync(path.join(fakeWs, '.git'), { recursive: true });
  fs.mkdirSync(path.join(home, '.dsh', 'storages'), { recursive: true });
  fs.writeFileSync(
    path.join(home, '.dsh', 'storages', 'workspace.json'),
    // workspace.json 的真实形状是 { tables: { workspaces: { <id>: {...} } } }，
    // 不是数组（见 src/workspace.ts:59-71 的解析）。
    JSON.stringify({
      tables: {
        workspaces: {
          'ws-fixture': {
            title: 'fixture',
            path: fakeWs,
            sessionIds: ['sess-fixture'],
            updatedAt: '2999-01-01T00:00:00.000Z',
          },
        },
      },
    }),
    'utf8'
  );
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  delete process.env.DSH_SESSION_ID;
  resetWorkspaceCache();
  try {
    // 先自证 fixture 生效：被禁止的三级实现此时**必须**返回 fakeWs（否则本节的断言没有意义）
    const levelThree = ex.resolveWorkspaceCwd(undefined, undefined);
    ok(levelThree === fakeWs, 'fixture 生效：resolveWorkspaceCwd 三级实现会命中「最近活跃工作区」', levelThree);

    ok(
      ex.resolveExecScope(undefined).cwd === process.cwd(),
      '无 cwd 无 session → process.cwd()（绝不能是「最近活跃工作区」）',
      ex.resolveExecScope(undefined).cwd
    );
    ok(ex.resolveExecScope({}).cwd === process.cwd(), '空 execContext → process.cwd()');
    ok(
      ex.resolveExecScope({ sessionId: 'no-such-session-id' }).cwd === process.cwd(),
      'session 反查失败 → 回落 process.cwd()，不落到「最近活跃工作区」',
      ex.resolveExecScope({ sessionId: 'no-such-session-id' }).cwd
    );
    ok(ex.resolveExecScope({ cwd: '' }).cwd === process.cwd(), '空字符串 cwd 视同未提供');

    // 第 2 级（session 反查）必须真的能用——这是 s5 要修活的那一级
    ok(
      ex.resolveExecScope({ sessionId: 'sess-fixture' }).cwd === fakeWs,
      'session 反查命中 fixture 工作区（旧实现被 process.cwd() 短路掉的那一级）',
      ex.resolveExecScope({ sessionId: 'sess-fixture' }).cwd
    );
    ok(
      ex.resolveExecScope({ cwd: process.cwd(), sessionId: 'sess-fixture' }).cwd === process.cwd(),
      '显式 cwd 优先级高于 session 反查'
    );
  } finally {
    if (savedSession === undefined) delete process.env.DSH_SESSION_ID;
    else process.env.DSH_SESSION_ID = savedSession;
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    if (savedProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = savedProfile;
    resetWorkspaceCache();
    fs.rmSync(home, { recursive: true, force: true });
  }
}

console.log('\n--- 7. 工具层必须真的调用 resolveExecScope（而不是各写自己的兜底）---');
// 为什么需要：18 个工具的样板被换成 `executor.resolveExecScope(execContext)` 后，
// 所有测试的 mock 仍然复刻成 `cwd = ctx.cwd || process.cwd()`——把工具改回旧写法，
// 全套测试照样绿。这里用哨兵值验证「工具确实把 resolveExecScope 的结果透传给了 gh」。
{
  const prMod = await import(lib('lib/tools/pr.js'));
  const seenScope = [];
  const seenOpts = [];
  const mock = {
    defaultListLimit: 20,
    resolveExecScope(ctx) {
      seenScope.push(ctx);
      return { cwd: 'SENTINEL_CWD', sessionId: 'SENTINEL_SID' };
    },
    async run(cmd, opts) {
      seenOpts.push({ cmd, opts });
      return { ok: true, data: {}, rawOutput: 'ok' };
    },
    async getRepoMetadata() {
      return { nameWithOwner: 'o/r' };
    },
  };
  const tool = prMod.createPrTool(mock);
  await tool.execute({ action: 'list', repo: 'o/r' }, { cwd: '/from/exec-context', sessionId: 'from-ctx' });
  ok(seenScope.length === 1, '工具调用了一次 resolveExecScope', String(seenScope.length));
  ok(seenScope[0]?.cwd === '/from/exec-context' && seenScope[0]?.sessionId === 'from-ctx', 'execContext 原样传给 resolveExecScope');
  ok(seenOpts.length > 0, '工具确实发起了 gh 调用');
  ok(seenOpts[0].opts?.cwd === 'SENTINEL_CWD', 'run 收到的是 resolveExecScope 返回的 cwd（哨兵透传）', String(seenOpts[0].opts?.cwd));
  ok(seenOpts[0].opts?.sessionId === 'SENTINEL_SID', 'run 收到的是 resolveExecScope 返回的 sessionId', String(seenOpts[0].opts?.sessionId));
}

console.log('\n========================================');
if (failed === 0) {
  console.log(`Phase 37 Toolset Result: ${passed}/${passed} assertions PASSED!`);
} else {
  console.error(`Phase 37 Toolset Result: ${failed} FAILED, ${passed} passed`);
  process.exitCode = 1;
}
