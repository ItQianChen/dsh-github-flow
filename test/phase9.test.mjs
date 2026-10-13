// test/phase9.test.mjs - README 读取与图片功能验证
import { readFileSync } from 'node:fs';
import nodeFs from 'node:fs';
import nodePath from 'node:path';

let pass = 0, total = 0;
const fails = [];
function assert(c, n) { total++; if (c) pass++; else { fails.push(n); console.error('❌ ' + n); } }

// ---- 1. resolveRelativeImageUrl 解析矩阵 ----
console.log('\n--- 1. relative url resolution ---');
const iu = await import('../lib/tools/image-utils.js');
{
  const ctx = { owner: 'o', repo: 'r', branch: 'main' };
  assert(iu.resolveRelativeImageUrl('./docs/images/1.png', ctx.owner, ctx.repo, ctx.branch) === 'https://raw.githubusercontent.com/o/r/main/docs/images/1.png', './ 前缀解析');
  assert(iu.resolveRelativeImageUrl('docs/images/2.png', 'o', 'r', 'main') === 'https://raw.githubusercontent.com/o/r/main/docs/images/2.png', '无前缀解析正确');
  assert(iu.resolveRelativeImageUrl('media/架构 图.png', 'o', 'r', 'main').includes('%E6%9E%B6%E6%9E%84'), '空格 URL 编码');
  assert(iu.resolveRelativeImageUrl('/abs/path.png', 'o', 'r', 'main') === null, '绝对路径拒绝');
  assert(iu.resolveRelativeImageUrl('../escape.png', 'o', 'r', 'main') === null, '路径穿越拒绝');
  assert(iu.resolveRelativeImageUrl('a?query=1.png', 'o', 'r', 'main') === null, '查询串拒绝');
  assert(iu.resolveRelativeImageUrl('https://evil.com', 'o', 'r', 'main') === null, '绝对 URL 不走相对解析');
  assert(iu.resolveRelativeImageUrl('', 'o', 'r', 'main') === null && iu.resolveRelativeImageUrl(null, 'o', 'r', 'main') === null, '畸形输入安全');
}

// ---- 2. extractReadmeImageUrls（真实本仓库 README 形态）----
console.log('\n--- 2. readme extraction ---');
{
  const sample = [
    '<img src="https://img.shields.io/npm/v/x.svg?style=flat-square" />',           // 徽章
    '<img src="https://img.shields.io/badge/license-MIT-blue.svg" />',               // 徽章
    '<img src="./docs/images/1.png" alt="驾驶舱" width="100%" />',                   // 相对路径
    '![右侧栏](docs/images/2.png)',                                                  // markdown 相对
    '![对比](./docs/images/4.png)',                                                  // markdown 带 ./
    '![外链](https://example.com/shot.png)',                                        // 绝对外链
  ].join('\n');
  const r = iu.extractReadmeImageUrls(sample, { owner: 'ItQianChen', repo: 'dsh-github-flow', branch: 'master' });
  assert(r.badgeFiltered === 2, `徽章过滤 2（实际 ${r.badgeFiltered}）`);
  assert(r.relativeResolved === 3, `相对路径解析 3（实际 ${r.relativeResolved}）`);
  assert(r.urls.length === 4, `清单 4（3 相对 + 1 外链；实际 ${r.urls.length}）`);
  assert(r.urls.some((u) => u === 'https://raw.githubusercontent.com/ItQianChen/dsh-github-flow/master/docs/images/1.png'), 'img 相对路径 → raw');
  assert(r.urls.some((u) => u.endsWith('/docs/images/2.png')), 'markdown 相对路径 → raw');
  assert(!r.urls.some((u) => u.includes('shields.io')), '徽章不在清单');

  const rb = iu.extractReadmeImageUrls(sample, { owner: 'o', repo: 'r', branch: 'main', includeBadges: true });
  assert(rb.urls.some((u) => u.includes('shields.io')) && rb.badgeFiltered === 0, 'include_badges 保留徽章');
}

// ---- 3. repo readme 动作（mock 全链路）----
console.log('\n--- 3. repo readme action ---');
{
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000a49444154789c6300010000050001', 'hex');
  const mkReadme = '# Title\n<img src="https://img.shields.io/npm/v/x.svg" />\n<img src="./docs/shot.png" />';
  const mock = {
    defaultListLimit: 10,
    async run(cmd, opts) {
      if (cmd[0] === 'api' && cmd[1].includes('/readme')) return { ok: true, rawOutput: mkReadme };
      if (cmd[0] === 'repo' && cmd[1] === 'view') return { ok: true, data: { defaultBranchRef: { name: 'master' } } };
      if (cmd[0] === 'api' && opts?.binary) return { ok: true, data: png };
      return { ok: true, data: {}, rawOutput: '' };
    },
    async getRepoMetadata() { return null; },
  };
  const { createRepoTool } = await import('../lib/tools/repo.js');
  const tool = createRepoTool(mock);

  // 3.1 纯文本模式
  const r1 = await tool.execute({ action: 'readme', repo: 'o/r' }, {});
  assert(typeof r1.readme === 'string' && r1.readme.includes('# Title'), 'readme 原文返回');
  assert(Array.isArray(r1.images) && r1.images.length === 1 && r1.images[0].includes('raw.githubusercontent'), `清单只含解析后的截图（实际 ${r1.images?.length}）`);
  assert(r1.branch === 'master', '默认分支带回');

  // 3.2 渲染
  const { renderRepoMarkdown } = await import('../lib/renderers/markdown.js');
  const md = renderRepoMarkdown({ action: 'readme' }, r1);
  assert(md.includes('README 预览') && md.includes('# Title') && md.includes('📎 图片清单 (1)'), '渲染器 README 预览 + 图片清单');

  // 3.3 image_urls 下载（交集语义一致）
  const target = r1.images[0];
  const r2 = await tool.execute({ action: 'readme', repo: 'o/r', image_urls: [target, 'https://evil.com/x.png'] }, {});
  assert(r2.images.length === 1 && r2.images[0].url === target, '精准下载 1 张 + 拒绝 1 张');
  assert((r2.failures || []).some((f) => f.includes('已拒绝')), '非法报告');
  assert(tool.output.render({ action: 'readme' }, r2).some((b) => b.type === 'image'), 'render image 块');
  nodeFs.rmSync(nodePath.dirname(r2.images[0].file), { recursive: true, force: true });

  // 3.4 空数组防御 + 全下载
  let threw = false;
  try { await tool.execute({ action: 'readme', repo: 'o/r', image_urls: [] }, {}); } catch (e) { threw = e.message.includes('空数组'); }
  assert(threw, '空数组防御');
  const r3 = await tool.execute({ action: 'readme', repo: 'o/r', image_urls: [target] }, {});
  assert(r3.images.length === 1, '指定单张正常');
  nodeFs.rmSync(nodePath.dirname(r3.images[0].file), { recursive: true, force: true });

  // 3.5 非法 repo 形态
  threw = false;
  try { await tool.execute({ action: 'readme', repo: 'no-slash' }, {}); } catch (e) { threw = e.message.includes('owner/repo'); }
  assert(threw, '非法 repo 形态报错');
}

// ---- 4. help 条目 ----
console.log('\n--- 4. help ---');
{
  const h = readFileSync('lib/tools/help.js', 'utf8');
  assert(h.includes('readme') && h.includes('include_badges'), 'help 收录 readme 条目');
}

console.log(`\n===== Phase 9: ${pass}/${total} PASS =====`);
if (fails.length) process.exit(1);
