// test/phase43-review-write.test.mjs
//
// s7 §2.2 行级评注写入回归网。
//
// 为什么必须有：
// `gh pr review` 没有行级参数（`gh pr review --help` 里 line/side/path 零命中），
// 行级评注唯一入口是 `POST /repos/{owner}/{repo}/pulls/{n}/reviews` 的 comments[]。
// 这条链路是**公开可见的写入动作**，写错一条就是给人 PR 上留垃圾，因此：
//   ① 必须显式传 comments 才启用（默认路径逐字节不变）；
//   ② 参数在发请求前就要校验（不能把 422 当常态）；
//   ③ 422 必须降级而不是丢内容。
//
// 覆盖：
//   1. buildPrReviewPayload：REST 字段形状、side 归一化、上限、校验一次说完
//   2. createPrReview：argv 严格形状 + stdin JSON 内容
//   3. 422 降级：行级评注折叠进 body，内容不丢且显式标记 degraded
//   4. 非 422 失败不降级（403/网络错误降级也没用）
//   5. 默认路径零变化：comments 为空 → 仍走 gh pr review

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const lib = (p) => `file://${path.join(ROOT, p).replace(/\\/g, '/')}`;

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

const { buildPrReviewPayload, foldCommentsIntoBody, isLineCommentRejected, MAX_REVIEW_COMMENTS } = await import(
  lib('lib/executor/pr-review.js')
);
const { GhExecutor } = await import(lib('lib/executor.js'));
const { createPrTool } = await import(lib('lib/tools/pr.js'));

console.log('\n--- 1. payload 构造与校验（纯函数）---');
{
  const r = buildPrReviewPayload({
    event: 'COMMENT',
    body: '整体说明',
    commit_id: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
    comments: [{ path: 'src/a.ts', line: 42, side: 'right', start_line: 40, body: '这里有问题' }],
  });
  ok(r.ok === true, '合法输入通过校验');
  const p = r.payload || {};
  ok(p.event === 'COMMENT', 'event 归一化为 COMMENT', String(p.event));
  ok(p.commit_id === 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', 'commit_id 原样透传');
  ok(Array.isArray(p.comments) && p.comments.length === 1, 'comments 透传 1 条');
  const c = (p.comments || [])[0] || {};
  ok(c.path === 'src/a.ts' && c.line === 42, 'path/line 正确', JSON.stringify(c));
  ok(c.side === 'RIGHT', 'side 小写 right 被归一化为 RIGHT', String(c.side));
  ok(c.start_line === 40 && c.start_side === 'RIGHT', 'start_line/start_side 成对出现');
  ok(c.body.startsWith('[P2]'), '缺严重度的正文被补 [P2] 前缀', c.body);
}
{
  const r = buildPrReviewPayload({ event: 'APPROVE', comments: [] });
  ok(r.ok === true, 'APPROVE 且无 body 允许通过（REST 不要求）');
  ok(r.payload && r.payload.comments === undefined, '空 comments 不写进 payload（避免发空数组）');
}
{
  /*
   * APPROVE 的整体说明不补严重度前缀。
   * `[P2] LGTM` 是把优先级标签套在一句同意上——严重度是给问题定级的，不是给结论定级的。
   */
  const approve = buildPrReviewPayload({ event: 'APPROVE', body: 'LGTM' });
  ok(approve.ok === true && approve.payload.body === 'LGTM', 'APPROVE 的 body 不被补 [P2]', String(approve.payload && approve.payload.body));

  const changes = buildPrReviewPayload({ event: 'REQUEST_CHANGES', body: '这里要改' });
  ok(changes.payload.body === '[P2] 这里要改', 'REQUEST_CHANGES 的 body 正常补前缀', String(changes.payload.body));

  const approveWithComment = buildPrReviewPayload({
    event: 'APPROVE',
    body: 'LGTM',
    comments: [{ path: 'a.ts', line: 1, body: '小建议' }],
  });
  ok(approveWithComment.payload.body === 'LGTM', 'APPROVE + 行级评注：整体说明仍不补前缀');
  ok(approveWithComment.payload.comments[0].body.startsWith('[P2]'), '但行级评注照样补前缀（每条都是一条意见）');
}
{
  const r = buildPrReviewPayload({
    event: 'COMMENT',
    comments: [{ path: 'src/a.ts', body: 'x', line: 0 }, { path: '', body: '' }],
  });
  ok(r.ok === false, '非法输入被拦截');
  ok(Array.isArray(r.errors) && r.errors.length >= 3, '一次说完所有问题（不是改一条试一次）', JSON.stringify(r.errors));
}
{
  const tooMany = Array.from({ length: MAX_REVIEW_COMMENTS + 1 }, (_, i) => ({ path: `f${i}.ts`, line: 1, body: 'x' }));
  const r = buildPrReviewPayload({ event: 'COMMENT', body: 'b', comments: tooMany });
  ok(r.ok === false, `超过 ${MAX_REVIEW_COMMENTS} 条被拦截`);
  ok((r.errors || []).some((e) => e.includes('拆分')), '错误信息给出可操作建议（拆分多次）');
}
{
  const r = buildPrReviewPayload({ event: 'COMMENT', body: 'b', commit_id: 'zzz' });
  ok(r.ok === false, '非法 commit_id 被拦截');
}
{
  // 只有行级评注、没写整体说明时，自动补一句而不是让 REST 422
  const r = buildPrReviewPayload({ event: 'COMMENT', comments: [{ path: 'a.ts', line: 3, body: 'x' }] });
  ok(r.ok === true && String(r.payload.body).includes('行级评注'), '缺 body 时自动补默认说明');
}
{
  /*
   * 没有 line → 必须声明 subject_type: 'file'。
   *
   * 为什么：REST 的 comments[] 里 line 实际是必填的，只给 path 会被判为
   * 「非法行级评论」直接 422。声明成文件级评论后，「只想对某个文件留一句」
   * 才是合法输入，也不必先发一次注定失败的请求。
   */
  const r = buildPrReviewPayload({ event: 'COMMENT', body: 'b', comments: [{ path: 'src/a.ts', body: '这个文件整体有问题' }] });
  ok(r.ok === true, '只给 path 不给 line 通过校验');
  const c = (r.payload.comments || [])[0] || {};
  ok(c.subject_type === 'file', '无 line 时声明 subject_type=file', String(c.subject_type));
  ok(c.line === undefined, '文件级评论不带 line');
  ok(c.side === undefined, '文件级评论不带 side（REST 只允许行级评论带 side）');
  ok(c.body.startsWith('[P2]'), '文件级评论同样补严重度前缀', c.body);

  const withLine = buildPrReviewPayload({ event: 'COMMENT', body: 'b', comments: [{ path: 'a.ts', line: 5, body: 'x' }] });
  const c2 = (withLine.payload.comments || [])[0] || {};
  ok(c2.subject_type === undefined, '行级评论不写 subject_type（走 REST 默认 line）');
}

console.log('\n--- 2. createPrReview：argv 与 stdin 严格形状 ---');
function makeExec(handler) {
  const ex = new GhExecutor({});
  const calls = [];
  ex.run = async (args, opts) => {
    calls.push({ args, stdin: opts && opts.stdin });
    return handler(args, opts, calls.length);
  };
  ex.getRepoIdentityFromLocal = () => ({ nameWithOwner: 'o/r' });
  return { ex, calls };
}
{
  const { ex, calls } = makeExec(() => ({ ok: true, data: { id: 1, html_url: 'https://github.com/o/r/pull/12#pullrequestreview-1', state: 'COMMENTED', comments: [{ path: 'src/a.ts', line: 42, html_url: 'https://x/1' }] } }));
  const r = await ex.createPrReview(ROOT, 'o/r', 12, {
    event: 'COMMENT',
    body: '说明',
    comments: [{ path: 'src/a.ts', line: 42, body: '问题' }],
  });
  ok(r.ok === true, '写入成功');
  ok(calls.length === 1, '只发一次请求（一次 review 一个请求）', String(calls.length));
  const argv = calls[0].args;
  ok(
    JSON.stringify(argv) === JSON.stringify(['api', '--method', 'POST', 'repos/o/r/pulls/12/reviews', '--input', '-']),
    'argv 严格等于 REST 端点形状',
    JSON.stringify(argv)
  );
  const sent = JSON.parse(calls[0].stdin);
  ok(sent.event === 'COMMENT', 'stdin 含 event');
  ok(Array.isArray(sent.comments) && sent.comments[0].side === 'RIGHT', 'stdin 每条 comment 都有 side');
  ok(sent.comments[0].path === 'src/a.ts' && sent.comments[0].line === 42, 'stdin 每条 comment 都有 path/line');
  ok(typeof sent.comments[0].body === 'string' && sent.comments[0].body.length > 0, 'stdin 每条 comment 都有 body');
  ok(r.data && r.data.htmlUrl === 'https://github.com/o/r/pull/12#pullrequestreview-1', '返回 review 地址供人复核');
  ok(Array.isArray(r.data.comments) && r.data.comments[0].htmlUrl === 'https://x/1', '逐条回传评论地址');
}

console.log('\n--- 3. 422 降级：内容不能丢，且必须显式 ---');
{
  const { ex, calls } = makeExec((args, opts, n) => {
    if (n === 1) return { ok: false, error: 'gh: Validation Failed (HTTP 422)' };
    return { ok: true, data: { id: 2, html_url: 'https://x/review/2', state: 'COMMENTED', comments: [] } };
  });
  const r = await ex.createPrReview(ROOT, 'o/r', 12, {
    event: 'COMMENT',
    body: '整体说明',
    comments: [{ path: 'src/a.ts', line: 42, body: '这一行有问题' }],
  });
  ok(r.ok === true, '降级后最终成功');
  ok(r.degraded === true, '结果显式标记 degraded');
  ok(typeof r.degradedReason === 'string' && r.degradedReason.length > 0, '带 degradedReason 说明原因');
  ok(calls.length === 2, '只重试一次', String(calls.length));
  const second = JSON.parse(calls[1].stdin);
  ok(second.comments === undefined, '降级请求不再带 comments');
  ok(String(second.body).includes('src/a.ts:42'), '正文内含 path:line 定位', String(second.body).slice(0, 80));
  ok(String(second.body).includes('这一行有问题'), '原评注内容完整保留');
  ok(String(second.body).includes('整体说明'), '原整体说明保留在最前');
  ok(String(r.degradedReason).includes('HTTP 422'), '降级说明带上 GitHub 原始拒绝原因（便于区分「行不可评论」与「path 不存在」）', String(r.degradedReason));
}
{
  // 降级重试也失败 → 返回 ok:false 但仍标记 degraded（不能伪装成成功）
  const { ex } = makeExec(() => ({ ok: false, error: 'gh: Validation Failed (HTTP 422)' }));
  const r = await ex.createPrReview(ROOT, 'o/r', 12, {
    event: 'COMMENT',
    body: 'b',
    comments: [{ path: 'a.ts', line: 1, body: 'x' }],
  });
  ok(r.ok === false, '两次都失败时如实返回失败');
  ok(r.degraded === true, '仍标记曾尝试降级');
}

console.log('\n--- 4. 非 422 失败不降级 ---');
{
  const { ex, calls } = makeExec(() => ({ ok: false, error: 'gh: Resource not accessible by integration (HTTP 403)' }));
  const r = await ex.createPrReview(ROOT, 'o/r', 12, {
    event: 'COMMENT',
    body: 'b',
    comments: [{ path: 'a.ts', line: 1, body: 'x' }],
  });
  ok(r.ok === false, '403 直接失败');
  ok(calls.length === 1, '403 不重试（降级也没用）', String(calls.length));
  ok(isLineCommentRejected('HTTP 422') && isLineCommentRejected('Validation Failed'), '422 判定覆盖两种 stderr 形态');
  ok(!isLineCommentRejected('HTTP 403') && !isLineCommentRejected(''), '403/空文本不算行级被拒');
}
{
  // 没有 comments 时即使 422 也不该走折叠（没有可折叠的内容）
  const { ex, calls } = makeExec(() => ({ ok: false, error: 'gh: Validation Failed (HTTP 422)' }));
  const r = await ex.createPrReview(ROOT, 'o/r', 12, { event: 'COMMENT', body: 'b' });
  ok(r.ok === false && calls.length === 1, '无行级评注时不触发降级重试');
}

console.log('\n--- 5. 默认路径零变化：不传 comments 仍走 gh pr review ---');
{
  const calls = [];
  const mockExecutor = {
    run: async (args) => {
      calls.push(args);
      return { ok: true, rawOutput: 'Reviewed pull request #12' };
    },
    maxOutputChars: 24000,
    defaultTimeoutMs: 30000,
    defaultListLimit: 20,
    resolveExecScope: () => ({ cwd: ROOT }),
    getRepoMetadata: async () => ({ nameWithOwner: 'o/r' }),
    ensureCleanWorkspace: async () => ({ ok: true, dirtyCount: 0, samples: [] }),
  };
  const tool = createPrTool(mockExecutor);
  const out = await tool.execute({ action: 'review', pr_number: 12, review_decision: 'COMMENT', body: 'ok' });
  ok(calls.length === 1, '发了一次命令');
  const argv = calls[0];
  ok(argv[0] === 'pr' && argv[1] === 'review' && argv[2] === '12', '仍走 gh pr review 路径', JSON.stringify(argv));
  ok(argv.includes('--comment'), '仍带 --comment');
  ok(!argv.includes('api'), '绝不出现 api 子命令');
  ok(out && out.message === 'Review 提交成功', '返回原样 message（老调用方兼容）', JSON.stringify(out));
}
{
  // 传了 comments → 必须走 REST，且不再发 gh pr review
  const calls = [];
  const mockExecutor = {
    createPrReview: async (cwd, repo, num, input) => {
      calls.push({ cwd, repo, num, input });
      return { ok: true, data: { htmlUrl: 'https://x/r/1', state: 'COMMENTED', comments: [{ path: 'a.ts', line: 3, htmlUrl: 'https://x/c/1' }] } };
    },
    run: async (args) => {
      calls.push({ args });
      return { ok: true, rawOutput: '' };
    },
    maxOutputChars: 24000,
    defaultTimeoutMs: 30000,
    defaultListLimit: 20,
    resolveExecScope: () => ({ cwd: ROOT }),
    getRepoMetadata: async () => ({ nameWithOwner: 'o/r' }),
    ensureCleanWorkspace: async () => ({ ok: true, dirtyCount: 0, samples: [] }),
  };
  const tool = createPrTool(mockExecutor);
  const out = await tool.execute({
    action: 'review',
    pr_number: 12,
    review_decision: 'COMMENT',
    body: '说明',
    comments: [{ path: 'a.ts', line: 3, body: '问题' }],
  });
  ok(calls.length === 1 && calls[0].input, '只调了一次 createPrReview', JSON.stringify(calls.length));
  ok(calls[0].input.comments.length === 1, 'comments 原样传给 executor');
  ok(calls[0].input.event === 'COMMENT', 'review_decision 映射为 event');
  ok(String(out.result).includes('行级评注'), '返回里说明带了行级评注', String(out.result).slice(0, 60));
  ok(String(out.result).includes('https://x/c/1'), '返回逐条评论地址供复核');
  ok(out.severity && out.severity.P2 === 2, '返回严重度分布汇总（body + 1 条评注均缺省 P2）', JSON.stringify(out.severity));
  ok(String(out.result).includes('严重度: P0×0'), '渲染结果里能看到严重度分布', String(out.result).split('\n')[3]);
}

console.log('\n========================================');
if (failed === 0) {
  console.log(`Phase 43 Review Write Result: ${passed}/${passed} assertions PASSED!`);
} else {
  console.error(`Phase 43 Review Write Result: ${failed} FAILED, ${passed} passed`);
  process.exitCode = 1;
}
