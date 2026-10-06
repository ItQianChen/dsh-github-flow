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
console.log(` 结果：${pass} 通过 / ${fail} 失败`);
if (fail > 0) {
  console.log(' 失败项：');
  failures.forEach((f) => console.log(`   - ${f}`));
}
console.log('==================================================');

process.exit(fail > 0 ? 1 : 0);
