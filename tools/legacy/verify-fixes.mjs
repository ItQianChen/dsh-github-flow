/**
 * dsh-github-flow 修复项功能验证
 *
 * 分两层，互不依赖：
 *   A 层（命令装配断言）：用 spy executor 抓取真实的 gh 参数数组，不需要 spawn、不受沙箱影响，
 *      任何环境都能跑，是判断「参数有没有传对」的权威依据。
 *   B 层（真实链路）：对真实 gh CLI 发起只读 / dry-run 调用，验证装配结果能被 gh 接受。
 *
 * 覆盖：F1 cross-fork PR(head) / F2 字面串传参(-f) / F3 raw 响应模式 /
 *       F4 merge 删分支 opt-in / F5 双口径截断
 *
 * 运行：node verify-fixes.mjs
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const lib = (p) => pathToFileURL(path.resolve('lib', p)).href;

const { GhExecutor, truncateOutput } = await import(lib('executor.js'));
const { createPrTool } = await import(lib('tools/pr.js'));
const { createApiTool } = await import(lib('tools/api.js'));
const { mapLimit, tryReadWorkspaces, readWorkspaces, resetWorkspaceCache, hasGitDir } = await import(lib('workspace.js'));
const { TtlCache } = await import(lib('cache.js'));
const { registerApiRoutes, globalCacheTtlMs } = await import(lib('api/routes.js'));

const cwd = process.cwd();
const ctx = { cwd };
const UPSTREAM = 'awesome-dsh-plugin/awesome-dsh-plugin';
const SELF = 'ItQianChen/dsh-github-flow';
const FORK_BRANCH = 'add-dsh-github-flow';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  ❌ ${name}${detail ? `\n     ${detail}` : ''}`);
  }
}

/** 用 spy 捕获工具实际拼出的 gh 参数数组 */
function makeSpy(repoNameWithOwner = SELF) {
  const calls = [];
  const executor = {
    getRepoMetadata: async () => ({ nameWithOwner: repoNameWithOwner }),
    resolveWorkspaceCwd: () => cwd,
    run: async (args) => {
      calls.push(args);
      return { ok: true, rawOutput: 'mocked-ok', truncated: false };
    },
  };
  return { executor, calls };
}

/** live 调用重试包装：TLS 抖动实测会偶发，重试 3 次不掩盖真实失败 */
async function withRetry(fn, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return { ok: true, value: await fn() };
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || e);
      if (!/timeout|TLS|ECONNRESET|EOF/i.test(msg)) break; // 业务错误不重试
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  return { ok: false, error: lastErr };
}

const liveExecutor = new GhExecutor();
const livePr = createPrTool(liveExecutor);
const liveApi = createApiTool(liveExecutor);

console.log('==================================================');
console.log(' A 层：命令装配断言（spy，无 spawn 依赖）');
console.log('==================================================');

// ── F1：head 参数装配 ────────────────────────────────────────────────
console.log('\n[F1] github_pr create 的 head 装配');
{
  const { executor, calls } = makeSpy(UPSTREAM);
  const tool = createPrTool(executor);

  await tool.execute({ action: 'create', title: 't', body: 'b', base: 'main' }, ctx);
  const noHead = calls[0].join(' ');
  check('未传 head 时不出现 --head', !noHead.includes('--head'), `实际：${noHead}`);

  await tool.execute(
    { action: 'create', title: 't', body: 'b', base: 'main', head: `ItQianChen:${FORK_BRANCH}` },
    ctx
  );
  const withHead = calls[1].join(' ');
  check('传入 head 时拼出 --head', withHead.includes(`--head ItQianChen:${FORK_BRANCH}`), `实际：${withHead}`);
  check('--head 值完整保留冒号语法', /--head\s+ItQianChen:add-dsh-github-flow/.test(withHead), `实际：${withHead}`);

  await tool.execute({ action: 'create', title: 't', body: 'b', dry_run: true }, ctx);
  check('dry_run 拼出 --dry-run', calls[2].includes('--dry-run'), `实际：${calls[2].join(' ')}`);

  // 回归：base / draft 原有行为不被破坏
  await tool.execute({ action: 'create', title: 't', body: 'b', base: 'dev', draft: true }, ctx);
  const legacy = calls[3].join(' ');
  check('base / draft 既有行为保持', legacy.includes('--base dev') && legacy.includes('--draft'), `实际：${legacy}`);
}

// ── F2：fields 一律按字面串（-f），嵌套结构显式拒绝 ──────────────────
console.log('\n[F2] github_api 的 fields 传参语义');
{
  const { executor, calls } = makeSpy();
  const tool = createApiTool(executor);

  await tool.execute(
    { endpoint: 'repos/x/y/releases', method: 'POST', fields: { tag_name: '5.0', draft: 'true', name: 'a b' } },
    ctx
  );
  const cmd = calls[0];
  const joined = cmd.join(' ');
  check('使用 -f 而非 -F', cmd.includes('-f') && !cmd.includes('-F'), `实际：${joined}`);
  // 按「-f 与其取值成对出现」断言，不依赖下标位置，避免以后新增参数就误报
  const formPairs = cmd.reduce((acc, a, i) => (a === '-f' ? [...acc, cmd[i + 1]] : acc), []);
  check('数字形字符串 "5.0" 原样保留', formPairs.includes('tag_name=5.0'), `实际：${JSON.stringify(formPairs)}`);
  check('布尔形字符串 "true" 原样保留', formPairs.includes('draft=true'), `实际：${JSON.stringify(formPairs)}`);
  check('含空格的值未被拆散（参数数组隔离）', formPairs.includes('name=a b'), `实际：${JSON.stringify(formPairs)}`);
  check('method 拼出 -X POST', joined.includes('-X POST'), `实际：${joined}`);

  // 嵌套结构必须显式报错而不是静默篡改请求体
  let nestedErr = '';
  try {
    await tool.execute({ endpoint: 'repos/x/y', method: 'PATCH', fields: { inner: { a: 1 } } }, ctx);
  } catch (e) {
    nestedErr = String(e.message || e);
  }
  check('嵌套对象被显式拒绝', /嵌套结构/.test(nestedErr), nestedErr.slice(0, 160));
  check('拒绝时未发出 gh 调用', calls.length === 1, `calls=${calls.length}`);

  // null / undefined 值应跳过而非拼成 "undefined"
  await tool.execute({ endpoint: 'repos/x/y', fields: { a: 'ok', b: null, c: undefined } }, ctx);
  const filtered = calls[1].join(' ');
  check('null/undefined 字段被跳过', !/undefined|null/.test(filtered), `实际：${filtered}`);

  // F3 装配：raw 模式应附加 Accept 头
  await tool.execute({ endpoint: 'repos/x/y/contents/f.txt', raw: true }, ctx);
  const rawCmd = calls[2].join(' ');
  check('raw 模式附加 Accept: application/vnd.github.raw', rawCmd.includes('Accept: application/vnd.github.raw'), `实际：${rawCmd}`);
  check('raw 模式未误加 -X', !rawCmd.includes('-X'), `实际：${rawCmd}`);
}

// ── F4：merge 删分支 opt-in ─────────────────────────────────────────
console.log('\n[F4] github_pr merge 的 --delete-branch 开关');
{
  const { executor, calls } = makeSpy();
  const tool = createPrTool(executor);

  await tool.execute({ action: 'merge', pr_number: 1 }, ctx);
  check('默认不带 --delete-branch', !calls[0].includes('--delete-branch'), `实际：${calls[0].join(' ')}`);

  await tool.execute({ action: 'merge', pr_number: 2, delete_branch: true }, ctx);
  check('显式 true 才带 --delete-branch', calls[1].includes('--delete-branch'), `实际：${calls[1].join(' ')}`);

  await tool.execute({ action: 'merge', pr_number: 3, delete_branch: false }, ctx);
  check('显式 false 不带 --delete-branch', !calls[2].includes('--delete-branch'), `实际：${calls[2].join(' ')}`);

  await tool.execute({ action: 'merge', pr_number: 4, merge_method: 'merge' }, ctx);
  check('merge_method 既有行为保持', calls[3].includes('--merge'), `实际：${calls[3].join(' ')}`);
}

console.log('\n==================================================');
console.log(' B 层：truncateOutput 纯函数单元测试');
console.log('==================================================');

const enc = new TextEncoder();
const dec = new TextDecoder();
const hasLoneSurrogate = (s) => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = s.charCodeAt(i + 1);
      if (!(n >= 0xdc00 && n <= 0xdfff)) return true;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
};

console.log('\n[F5] 双口径截断');
{
  const cjk = '中文测试内容'.repeat(200); // 1200 字符 / 3600 字节
  const r1 = truncateOutput(cjk, 100_000, 600);
  check('字节超限触发截断', r1.truncated === true, `truncated=${r1.truncated}`);
  check('提示指向 maxOutputBytes', /maxOutputBytes/.test(r1.text), r1.text.slice(-140));
  check('截断后字节数回落', enc.encode(r1.text).length < 3600, `${enc.encode(r1.text).length} 字节`);
  check('无孤立代理对', !hasLoneSurrogate(r1.text));
  check('中文往返解码一致', dec.decode(enc.encode(r1.text)) === r1.text);
  // 回归：字节口径触发时，提示里的保留量必须是真实字节数，不能照抄 maxChars 推导出的假值
  // （曾出现 maxChars=100000 / maxBytes=600 却报「已保留前 100KB」的错误文案）
  const kept = [...r1.text.matchAll(/实际保留前 (\d+) 字节与后 (\d+) 字节/g)][0];
  check('提示给出真实保留字节数', Boolean(kept), r1.text.slice(-160));
  if (kept) {
    const headBytes = Number(kept[1]);
    const tailBytes = Number(kept[2]);
    check('保留头字节数不超过上限 35%', headBytes <= Math.floor(600 * 0.35), `头 ${headBytes} 字节`);
    check('保留尾字节数不超过上限 55%', tailBytes <= Math.floor(600 * 0.55), `尾 ${tailBytes} 字节`);
    check('提示值不是 maxChars 推导的假值', headBytes < 1000 && tailBytes < 1000, `头 ${headBytes} / 尾 ${tailBytes}`);
  }

  const r2 = truncateOutput('a'.repeat(5000), 1000, 100_000);
  check('字符超限触发截断', r2.truncated === true);
  check('提示指向字符口径', /截断中间部分/.test(r2.text), r2.text.slice(-140));
  check('字符口径未误报字节口径', !/maxOutputBytes/.test(r2.text));

  const short = 'short output 中文';
  const r3 = truncateOutput(short, 1000, 4000);
  check('未超限原样返回', r3.truncated === false && r3.text === short);

  const emoji = '🐳'.repeat(500);
  const r4 = truncateOutput(emoji, 100_000, 300);
  check('emoji 触发字节截断', r4.truncated === true);
  check('emoji 无孤立代理对', !hasLoneSurrogate(r4.text));
  check('emoji 往返解码一致', dec.decode(enc.encode(r4.text)) === r4.text);

  const json = JSON.stringify({ items: Array.from({ length: 400 }, (_, i) => ({ i, name: `项目${i}` })) });
  const r5 = truncateOutput(json, 100_000, 800);
  check('大 JSON 触发截断', r5.truncated === true);
  check('截断结果可安全 JSON.stringify', (() => { try { JSON.stringify(r5.text); return true; } catch { return false; } })());

  // 边界：恰好等于上限不应触发
  const exact = 'x'.repeat(500);
  check('恰好等于字符上限不触发', truncateOutput(exact, 500, 100_000).truncated === false);
}

console.log('\n==================================================');
console.log(' C 层：真实 gh 链路（只读 / dry-run，无 GitHub 写入）');
console.log('==================================================');

// ── F3 真实链路：raw 模式能取到明文 ──────────────────────────────────
console.log('\n[F3-live] raw 模式 vs 默认模式');
{
  const rawRes = await withRetry(() =>
    liveApi.execute({ endpoint: `repos/${SELF}/contents/cordis.patch.yml`, raw: true }, ctx)
  );
  if (rawRes.ok) {
    const text = typeof rawRes.value?.result === 'string' ? rawRes.value.result : JSON.stringify(rawRes.value);
    check('raw 模式返回可读 YAML 原文', /insert:/.test(text), `前 120 字：${text.slice(0, 120)}`);
    check('raw 模式不是 base64 包装', !/^[A-Za-z0-9+/=\s]{40,}$/.test(text.trim()));
  } else {
    check('raw 模式调用（网络原因跳过）', false, String(rawRes.error?.message || rawRes.error).slice(0, 160));
  }

  const defRes = await withRetry(() =>
    liveApi.execute({ endpoint: `repos/${SELF}/contents/cordis.patch.yml` }, ctx)
  );
  if (defRes.ok) {
    const content = defRes.value?.content || '';
    check('默认模式返回 base64 content 字段', typeof content === 'string' && content.length > 0);
    check('两种模式确实分叉', !/insert:/.test(content));
  } else {
    check('默认模式调用（网络原因跳过）', false, String(defRes.error?.message || defRes.error).slice(0, 160));
  }
}

// ── F1 真实链路：head 能被 gh 解析到 fork 的 PR ──────────────────────
// PR #6695 已存在，因此 gh 会直接回报「该 head 的 PR 已存在」——
// 这条报错本身就是最强证据：gh 确实解析了 ItQianChen:add-dsh-github-flow 这个 fork 分支。
console.log('\n[F1-live] head 指向 fork 分支时 gh 能解析并识别已有 PR');
{
  const res = await withRetry(() =>
    livePr.execute(
      {
        action: 'create',
        repo: UPSTREAM,
        title: 'test: verify head support',
        body: 'dry-run probe, no PR is created',
        base: 'main',
        head: `ItQianChen:${FORK_BRANCH}`,
        dry_run: true,
      },
      ctx
    )
  );

  if (res.ok) {
    const detail = res.value?.detail || res.value?.url || '';
    check('dry-run 成功返回', true);
    check('输出确认未真正创建', /dry-run|未真正创建|would/i.test(JSON.stringify(res.value)), JSON.stringify(res.value).slice(0, 200));
    console.log(`     预演输出：${String(detail).split('\n').slice(0, 3).join(' | ').slice(0, 200)}`);
  } else {
    const msg = String(res.error?.message || res.error);
    check('gh 解析了 fork 的 head 分支', msg.includes(FORK_BRANCH), msg.slice(0, 240));
    check('识别到该 head 已存在 PR 并给出链接', /pull\/6695|already exists/i.test(msg), msg.slice(0, 240));
    console.log(`     gh 原话：${msg.split('\n')[0].slice(0, 200)}`);
  }
}

// ── F1 真实链路：同仓库自比自的业务级报错仍然可读（非插件缺陷） ──────
console.log('\n[F1-live-2] 同仓库 head==base 时应得到业务级提示而非 git 报错');
{
  const res = await withRetry(() =>
    livePr.execute({ action: 'create', title: 'probe', body: 'probe', head: 'master', base: 'master', dry_run: true }, ctx)
  );
  if (res.ok) {
    check('同仓库 dry-run 成功', true);
  } else {
    const msg = String(res.error?.message || res.error);
    check('报错为业务语义而非 "not a git repository"', /same as base branch|no commits|already exists/i.test(msg), msg.slice(0, 200));
  }
}

// ── F2 真实链路：字面串请求体能被 GitHub 接受（/markdown 只读回显） ──
console.log('\n[F2-live] -f 构造的表单请求体能被 GitHub 正常受理');
{
  const res = await withRetry(() =>
    liveApi.execute({ endpoint: 'markdown', method: 'POST', fields: { text: '# hello', mode: 'gfm' } }, ctx)
  );
  if (res.ok) {
    const out = JSON.stringify(res.value);
    check('POST 表单请求被受理', out.length > 0);
    check('返回内容形如 HTML', /<h1|hello/i.test(out), out.slice(0, 160));
  } else {
    check('POST 表单请求被受理（网络原因跳过）', false, String(res.error?.message || res.error).slice(0, 160));
  }
}

console.log('\n==================================================');
console.log(' D 层：本次审计修复项');
console.log('==================================================');

// ── D1：mapLimit 有界并发（消除 global-overview 的排队劣化） ──────────
console.log('\n[D1] mapLimit 有界并发');
{
  let inFlight = 0;
  let peak = 0;
  const items = Array.from({ length: 12 }, (_, i) => i);

  const out = await mapLimit(items, 3, async (n) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 15));
    inFlight--;
    return n * 2;
  });

  check('在途并发不超过上限 3', peak <= 3, `实测峰值 ${peak}`);
  check('并发确实用满（未退化为串行）', peak === 3, `实测峰值 ${peak}`);
  check('结果顺序与输入一致', JSON.stringify(out) === JSON.stringify(items.map((n) => n * 2)), JSON.stringify(out));
  check('空数组返回空数组', (await mapLimit([], 3, async () => 1)).length === 0);

  // limit 大于数组长度时不应死锁
  const small = await mapLimit([1, 2], 10, async (n) => n + 1);
  check('limit 超出长度时不挂死且结果正确', JSON.stringify(small) === '[2,3]', JSON.stringify(small));

  // 单个任务抛错应向上传播，不被吞掉
  let threw = false;
  try {
    await mapLimit([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('boom');
      return n;
    });
  } catch {
    threw = true;
  }
  check('任务异常向上抛出而非静默吞掉', threw);
}

// ── D2：TtlCache 的 TTL / LRU / 容量上限 ────────────────────────────
console.log('\n[D2] TtlCache（cacheTtlMs 生效 + 容量上限）');
{
  const c = new TtlCache(1000, 3);
  c.set('a', 1, 0);
  check('未过期可命中', c.get('a', 500) === 1);
  check('恰好到 TTL 视为过期', c.get('a', 1000) === undefined);
  check('过期后条目被移除', c.size === 0, `size=${c.size}`);

  for (const k of ['a', 'b', 'c']) c.set(k, k, 0);
  check('容量内正常保存', c.size === 3);
  c.set('d', 'd', 0);
  check('超出容量后腾退到上限', c.size === 3, `size=${c.size}`);
  check('最久未使用的 a 被淘汰', c.get('a', 1) === undefined);
  check('新写入的 d 仍在', c.get('d', 1) === 'd');

  // 命中应刷新 LRU 位置：b 被访问后，新写入应淘汰 c 而不是 b
  c.get('b', 2);
  c.set('e', 'e', 2);
  check('命中会刷新 LRU 位置', c.get('b', 3) === 'b', 'b 被错误淘汰');
  check('未被访问的 c 被淘汰', c.get('c', 3) === undefined);

  c.clear();
  check('clear 清空全部', c.size === 0);

  // 用户把 cacheTtlMs 配成 0 时，行为应是「永不命中」而不是「永远命中」
  const zero = new TtlCache(0, 4);
  zero.set('k', 1, 0);
  check('TTL=0 时不命中（尊重用户显式配置）', zero.get('k', 0) === undefined);
}

// ── D3：workspace 模块（单一数据源 + 不静默吞错） ─────────────────────
console.log('\n[D3] workspace 单一数据源与容错');
{
  resetWorkspaceCache();
  const r = tryReadWorkspaces();
  check('读取本机 workspace.json 不抛错', typeof r.workspaces === 'object', r.error || '');
  check('workspace.json 存在时不应报错', !r.error, `意外错误：${r.error}`);
  console.log(`     读到 ${r.workspaces.length} 个工作区`);

  if (r.workspaces.length > 0) {
    const w = r.workspaces[0];
    check('记录字段结构完整', typeof w.id === 'string' && typeof w.path === 'string' && Array.isArray(w.sessionIds), JSON.stringify(w).slice(0, 160));
    const withGit = r.workspaces.filter((x) => hasGitDir(x.path)).length;
    check('hasGitDir 能识别出仓库工作区', withGit >= 1, `仅 ${withGit} 个含 .git`);
  }

  // 缓存行为：连续两次读取应是同一个数组引用（证明走了缓存而非重复解析磁盘）
  resetWorkspaceCache();
  const first = readWorkspaces();
  const second = readWorkspaces();
  check('重复读取命中缓存（同一引用）', first === second, '未命中缓存，仍在校验 TTL 内重复解析');
  resetWorkspaceCache();
  const third = readWorkspaces();
  check('resetWorkspaceCache 后重新解析', third !== first);

  // 容错路径：tryReadWorkspaces 在异常时返回 error 而非抛出
  const original = readWorkspaces;
  check('tryReadWorkspaces 永不抛出', (() => {
    try { tryReadWorkspaces(); return true; } catch { return false; }
  })(), 'tryReadWorkspaces 抛出了异常，未兑现「不静默但也不崩」的契约');
}

// ── D4：工具 parameters 必须是模型可用的 JSON Schema ─────────────────
// 这一段曾经写反过：我按 skill 文档把 parameters 改成扁平属性表 + 属性级 required，
// 结果整个插件的工具全线报 "Invalid schema for function 'github_api':
// schema must be a JSON Schema of 'type: \"object\"', got 'type: null'"。
// 教训：ctx.tools.register 接收的是【已经是 JSON Schema】的对象；skill 里的属性表是
// defineTool 的【编写】格式，由 defineTool 负责编译成 JSON Schema。本插件不用 defineTool，
// 因此必须自己交出合规的 JSON Schema。下面断言运行时真实契约，不是文档形态。
console.log('\n[D4] 工具 parameters 是合规的模型可见 JSON Schema');
{
  const { executor } = makeSpy();
  const tools = [
    createPrTool(executor),
    createApiTool(executor),
    (await import(lib('tools/issue.js'))).createIssueTool(executor),
    (await import(lib('tools/run.js'))).createRunTool(executor),
    (await import(lib('tools/repo.js'))).createRepoTool(executor),
  ];

  for (const t of tools) {
    const p = t.parameters;
    // 前四条就是 DSH 运行时的硬性要求，缺任何一条都会让该工具的请求被 API 拒绝
    check(`[${t.name}] 顶层 type 为 'object'`, p.type === 'object', `type=${JSON.stringify(p.type)}`);
    check(`[${t.name}] 含 properties 对象`, Boolean(p.properties) && typeof p.properties === 'object' && !Array.isArray(p.properties), JSON.stringify(p).slice(0, 120));
    check(`[${t.name}] required 是字符串数组`, Array.isArray(p.required) && p.required.every((k) => typeof k === 'string'), `required=${JSON.stringify(p.required)}`);
    check(`[${t.name}] parameters 可被 JSON 往返序列化`, (() => {
      try { JSON.parse(JSON.stringify(p)); return true; } catch { return false; }
    })());

    const propKeys = Object.keys(p.properties);
    // 结构与 required 必须自洽：required 里的键必须真实存在，否则模型会被要求填一个不存在的参数
    check(`[${t.name}] required 的键都在 properties 内`, p.required.every((k) => propKeys.includes(k)), `required=${JSON.stringify(p.required)} props=${JSON.stringify(propKeys)}`);

    const withoutType = propKeys.filter((k) => !p.properties[k] || typeof p.properties[k].type !== 'string');
    check(`[${t.name}] 每个属性都声明了 type`, withoutType.length === 0, `缺 type: ${JSON.stringify(withoutType)}`);
    // 属性级 required 是 defineTool 的编写格式，混进 JSON Schema 里属性会失去 type 语义
    const strayRequired = propKeys.filter((k) => p.properties[k] && 'required' in p.properties[k]);
    check(`[${t.name}] 无属性级 required 残留`, strayRequired.length === 0, `残留: ${JSON.stringify(strayRequired)}`);
    check(`[${t.name}] 每个参数都有 description`, propKeys.every((k) => typeof p.properties[k].description === 'string' && p.properties[k].description.length > 0));
  }

  // 逐个核对必填项，防止还原时丢字段
  const expectedRequired = {
    github_pr: ['action'],
    github_api: ['endpoint'],
    github_issue: ['action'],
    github_run: ['action'],
    github_repo: ['action'],
  };
  for (const t of tools) {
    check(`[${t.name}] required 内容正确`, JSON.stringify(t.parameters.required) === JSON.stringify(expectedRequired[t.name]), `实际 ${JSON.stringify(t.parameters.required)}`);
  }

  // 本次新增的参数必须真的暴露给模型，否则功能等于没加
  const byName = Object.fromEntries(tools.map((t) => [t.name, t.parameters.properties]));
  for (const key of ['head', 'delete_branch', 'dry_run']) {
    check(`[github_pr] schema 暴露了 ${key}`, key in byName.github_pr, `缺 ${key}`);
  }
  for (const key of ['raw', 'fields']) {
    check(`[github_api] schema 暴露了 ${key}`, key in byName.github_api, `缺 ${key}`);
  }
}

// ── D5：ctx.github 类型声明合并可被消费方加载 ────────────────────────
console.log('\n[D5] ctx.github 类型声明');
{
  const fs = await import('node:fs');
  const main = fs.readFileSync('lib/main.js', 'utf8');
  check('main.js 引用了 github-service（声明合并随包加载）', /github-service/.test(main), main.slice(0, 200));
  const dts = fs.readFileSync('lib/github-service.d.ts', 'utf8');
  check('声明文件含 declare module 增强', /declare module '@deepseek-ai\/cordis'/.test(dts), dts.slice(0, 200));
  check('声明了 ctx.github 的类型', /github:\s*GhExecutor/.test(dts), dts.slice(0, 200));
}

// ── D5b：本地仓库身份识别（全局矩阵不再走网络的关键） ─────────────────
console.log('\n[D5b] getRepoIdentityFromLocal 不发网络请求');
{
  const ident = liveExecutor.getRepoIdentityFromLocal(cwd);
  check('能从 .git/config 解析出仓库身份', Boolean(ident?.nameWithOwner), JSON.stringify(ident));
  check('解析出的是本仓库', ident?.nameWithOwner === 'ItQianChen/dsh-github-flow', `${ident?.nameWithOwner}`);
  check('返回结构含 owner/url 字段', Boolean(ident?.owner && ident?.url), JSON.stringify(ident));

  const t0 = Date.now();
  liveExecutor.getRepoIdentityFromLocal(cwd);
  const localMs = Date.now() - t0;
  check('本地解析耗时可忽略（<50ms，对比网络往返秒级）', localMs < 50, `${localMs}ms`);

  const none = liveExecutor.getRepoIdentityFromLocal(path.join(cwd, 'docs'));
  check('非 Git 目录返回 null 而非抛错', none === null, JSON.stringify(none));
}

// ── D6：路由层（缓存 / TTL 透传 / 注入防护 / 错误不外吞） ──────────────console.log('\n[D6] WebServer 路由：缓存、TTL 与 URL 白名单');
{
  const handlers = new Map();
  const fakeServer = { register: (r) => handlers.set(r.path, r.handler) };
  const spyCalls = [];
  const spyExec = {
    checkAuth: async () => ({ installed: true, loggedIn: false, platform: 'win32' }),
    getRepoMetadata: async () => null,
    // 必须与 GhExecutor 的方法集保持同步：全局矩阵改走本地识别后，
    // 缺这个方法会让处理器抛错并把 500 伪装成缓存行为异常，掩盖真实问题。
    getRepoIdentityFromLocal: () => ({ nameWithOwner: 'stub/repo', name: 'repo', owner: 'stub', defaultBranch: 'main', isPrivate: false, url: 'https://github.com/stub/repo', description: '' }),
    resolveWorkspaceCwd: (c) => c,
    run: async (args) => {
      spyCalls.push(args.join(' '));
      return { ok: true, data: [], rawOutput: '[]' };
    },
  };

  const routes = registerApiRoutes(fakeServer, spyExec, undefined, 50);
  check('注册了 4 条路由', handlers.size === 4, `实际 ${handlers.size}: ${[...handlers.keys()].join(', ')}`);

  // TTL 推导：全局驾驶舱比单仓库概览重得多，必须有下限，但仍随用户配置缩放
  check('默认 15s 配置下推得 300s', globalCacheTtlMs(15_000) === 300_000, `${globalCacheTtlMs(15_000)}`);
  check('小配置被下限兜住（300s 起）', globalCacheTtlMs(50) === 300_000, `${globalCacheTtlMs(50)}`);
  check('大配置按 20 倍放大', globalCacheTtlMs(60_000) === 1_200_000, `${globalCacheTtlMs(60_000)}`);
  check('非法配置回落到默认', globalCacheTtlMs(NaN) === 300_000, `${globalCacheTtlMs(NaN)}`);

  function mockRes() {
    const res = { statusCode: 0, headers: {}, body: '', ended: false };
    res.setHeader = (k, v) => { res.headers[k] = v; };
    res.end = (s) => { res.body = s || ''; res.ended = true; };
    return res;
  }

  // 未登录时 global-overview 只跑 checkAuth，适合验证缓存语义
  const h = handlers.get('/api/github/global-overview');
  const r1 = mockRes();
  const t1 = Date.now();
  await h({ method: 'GET', url: '/api/github/global-overview' }, r1);
  const coldMs = Date.now() - t1;
  const b1 = JSON.parse(r1.body);
  check('首次请求 fromCache=false', b1.fromCache === false, r1.body.slice(0, 200));
  check('响应含 workspaceMatrix 字段', Array.isArray(b1.data?.workspaceMatrix), r1.body.slice(0, 200));

  const r2 = mockRes();
  const t2 = Date.now();
  await h({ method: 'GET', url: '/api/github/global-overview' }, r2);
  const warmMs = Date.now() - t2;
  const b2 = JSON.parse(r2.body);
  check('TTL 内二次请求走缓存（消除 19 秒重复拉取）', b2.fromCache === true, r2.body.slice(0, 160));
  check('缓存命中显著快于冷启动', warmMs < coldMs, `冷 ${coldMs}ms vs 热 ${warmMs}ms`);
  console.log(`     冷启动 ${coldMs}ms → 缓存命中 ${warmMs}ms`);

  const r3 = mockRes();
  await h({ method: 'POST', url: '/api/github/global-overview' }, r3);
  check('非 GET 返回 405', r3.statusCode === 405, `status=${r3.statusCode}`);

  // /refresh 应同时清掉两级缓存
  const refresh = mockRes();
  await handlers.get('/api/github/refresh')({ method: 'POST', url: '/api/github/refresh' }, refresh);
  check('/refresh 被接受', refresh.statusCode === 200, refresh.body.slice(0, 120));

  const afterRefresh = mockRes();
  await h({ method: 'GET', url: '/api/github/global-overview' }, afterRefresh);
  check('/refresh 之后回到未命中状态', JSON.parse(afterRefresh.body).fromCache === false, afterRefresh.body.slice(0, 120));

  // open_browser 的注入防护。
  // 必须等 res.end 真正被调用：open_browser 分支是先注册 execFile 回调再 res.end，
  // 但 action 处理器整体走 req.on('end') 异步路径，不等就会读到空 body。
  const action = handlers.get('/api/github/action');
  function postAction(payload) {
    return new Promise((resolve, reject) => {
      const guard = setTimeout(() => reject(new Error('action 处理器未在 5s 内响应，疑似丢失 res.end')), 5000);
      const res = mockRes();
      const raw = res.end.bind(res);
      res.end = (s) => { raw(s); clearTimeout(guard); resolve(res); };
      const req = {
        method: 'POST',
        url: '/api/github/action',
        on(ev, cb) {
          if (ev === 'data') cb(JSON.stringify(payload));
          if (ev === 'end') setImmediate(() => cb());
        },
      };
      action(req, res).catch((e) => { clearTimeout(guard); reject(e); });
    });
  }

  for (const bad of [
    'file:///C:/Windows/System32/calc.exe',
    'http://x" & calc & "',
    'javascript:alert(1)',
    'not-a-url',
    '',
  ]) {
    const res = await postAction({ action: 'open_browser', url: bad });
    const body = JSON.parse(res.body);
    check(`拒绝危险 URL: ${JSON.stringify(bad)}`, res.statusCode !== 200 && body.ok === false, `status=${res.statusCode} body=${res.body.slice(0, 120)}`);
  }

  const okRes = await postAction({ action: 'open_browser', url: 'https://github.com/ItQianChen/dsh-github-flow' });
  check('接受合法 https URL', JSON.parse(okRes.body).ok === true, okRes.body.slice(0, 160));

  const unknown = await postAction({ action: 'nope' });
  check('未知 action 返回 400', unknown.statusCode === 400, unknown.body.slice(0, 120));
}

console.log('\n==================================================');
console.log(` 结果：${pass} 通过 / ${fail} 失败`);
if (fail > 0) {
  console.log(' 失败项：');
  failures.forEach((f) => console.log(`   - ${f}`));
}
console.log('==================================================');

process.exit(fail > 0 ? 1 : 0);