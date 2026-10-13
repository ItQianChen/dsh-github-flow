// test/phase8.test.mjs - Issue/PR 图片功能验证：URL 提取/魔数嗅探/护栏/render 块/真实下载
import { readFileSync } from 'node:fs';
import nodeFs from 'node:fs';
import nodePath from 'node:path';

let pass = 0, total = 0;
const fails = [];
function assert(c, n) { total++; if (c) pass++; else { fails.push(n); console.error('❌ ' + n); } }

// ---- 1. extractIssueImageUrls 提取矩阵 ----
console.log('\n--- 1. URL extraction matrix ---');
const issueMod = await import('../lib/tools/issue.js');
const extract = issueMod.extractIssueImageUrls;
{
  // 五种合法形态
  assert(JSON.stringify(extract('<img src="https://github.com/user-attachments/assets/abc-123" />')) === '["https://github.com/user-attachments/assets/abc-123"]', 'HTML img + user-attachments 提取');
  assert(extract('![screenshot](https://user-images.githubusercontent.com/1/2/shot.png)').length === 1, 'Markdown + 旧版上传域提取');
  assert(extract('<img src="https://raw.githubusercontent.com/o/r/main/docs/x.png" />').length === 1, 'raw 仓库引用提取');
  assert(extract('<img src="https://camo.githubusercontent.com/hash123" />').length === 1, 'camo 代理域提取（无扩展名也放行）');
  assert(extract('![](https://example.com/diagram.png)').length === 1, '带扩展名外链提取');
  // 拒绝项
  assert(extract('[click me](https://example.com/page)').length === 0, '普通链接不误提取');
  assert(extract('<img src="https://example.com/no-ext" />').length === 0, '无扩展名非 GitHub 域拒绝');
  assert(extract('<a href="https://github.com/user-attachments/assets/x">link</a>').length === 0, 'a 标签链接不误提取');
  // SSRF 防线（审核修复）：非 https 协议与内网地址不得进入下载队列
  const ssrf = extract('<img src="file:///etc/passwd.png" /><img src="http://127.0.0.1/x.png" /><img src="http://169.254.169.254/meta.png" /><img src="ftp://evil.com/a.png" />');
  assert(ssrf.length === 0, `SSRF 面关闭：file/http/内网/ftp 全拒（实际: ${JSON.stringify(ssrf)}）`);
  // issue #2 真实正文
  const realBody = '<img width="744" height="429" alt="Image" src="https://github.com/user-attachments/assets/16cfed2b-ae0a-49cb-b139-746ea4d88d4c" />';
  const urls = extract(realBody);
  assert(urls.length === 1 && urls[0].includes('16cfed2b'), 'issue #2 真实正文提取命中');
  // 混合多图 + 去重
  const multi = extract('<img src="https://github.com/user-attachments/assets/a" />![](https://github.com/user-attachments/assets/a)![x](https://github.com/user-attachments/assets/b)');
  assert(multi.length === 2, '重复 URL 去重（3 处引用 → 2 个唯一）');
  // 边界输入
  assert(extract(null).length === 0 && extract(undefined).length === 0 && extract(42).length === 0 && extract('').length === 0, '畸形输入零崩溃');
  assert(extract('![](' + 'https://x.com/' + 'a'.repeat(3000) + '.png)').length === 1, '超长 URL 不炸（放行由护栏把关）');
}

// ---- 2. view 动作附带 images 清单（mock executor） ----
console.log('\n--- 2. view attaches image list ---');
{
  const recorded = [];
  const mock = {
    defaultListLimit: 20,
    async run(cmd, opts) {
      recorded.push(cmd);
      return { ok: true, data: { number: 2, title: 'T', body: '<img src="https://github.com/user-attachments/assets/zzz" />', state: 'OPEN' }, rawOutput: '' };
    },
    async getRepoMetadata() { return { nameWithOwner: 'o/r' }; },
  };
  const tool = issueMod.createIssueTool(mock);
  const res = await tool.execute({ action: 'view', issue_number: 2, repo: 'o/r' }, {});
  assert(Array.isArray(res.images) && res.images.length === 1 && res.images[0].includes('zzz'), 'view 返回附带 images 清单');
  // 渲染器展示
  const { renderIssueMarkdown } = await import('../lib/renderers/markdown.js');
  const md = renderIssueMarkdown({ action: 'view' }, { number: 2, title: 'T', state: 'OPEN', body: 'x', images: ['https://x/1.png'] });
  assert(md.includes('📎 图片附件 (1)') && md.includes('view_images'), '渲染器展示图片计数与获取指引');
}

// ---- 3. view_images 完整流程（mock 二进制下载） ----
console.log('\n--- 3. view_images flow ---');
const os = await import('node:os');
const pathMod = await import('node:path');
const fs = await import('node:fs');
const crypto = await import('node:crypto');
{
  // 造一个 1x1 PNG
  const png1x1 = Buffer.from('89504e470d0a1a0a0000000d494844520000000100000001080600000' + '01f15c4890000000a49444154789c6300010000050001', 'hex');
  const tmpIssueCalls = [];
  const mock2 = {
    defaultListLimit: 20,
    async run(cmd, opts) {
      if (cmd[0] === 'issue' && cmd[1] === 'view') {
        return { ok: true, data: { body: '<img src="https://github.com/user-attachments/assets/test-img" />' }, rawOutput: '' };
      }
      if (cmd[0] === 'api' && opts?.binary) {
        return { ok: true, data: png1x1, binaryBytes: png1x1.length };
      }
      return { ok: true, data: {}, rawOutput: '' };
    },
    async getRepoMetadata() { return { nameWithOwner: 'o/r' }; },
  };
  const tool2 = issueMod.createIssueTool(mock2);
  const res = await tool2.execute({ action: 'view_images', issue_number: 2, repo: 'o/r' }, {});
  assert(res.images && res.images.length === 1, 'view_images 成功返回图片元数据');
  assert(res.images[0].mimeType === 'image/png', '魔数嗅探识别 PNG');
  assert(fs.existsSync(res.images[0].file), '图片真实落盘');
  const expectHash = crypto.createHash('sha256').update(png1x1).digest('hex').slice(0, 16);
  assert(pathMod.basename(res.images[0].file) === `${expectHash}.png`, '内容寻址命名正确');
  fs.rmSync(pathMod.dirname(res.images[0].file), { recursive: true, force: true }); // 清理测试产物

  // 3.2 非图片内容被拒
  const mockBad = {
    defaultListLimit: 20,
    async run(cmd, opts) {
      if (cmd[0] === 'issue') return { ok: true, data: { body: '<img src="https://github.com/user-attachments/assets/bad" />' } };
      if (opts?.binary) return { ok: true, data: Buffer.from('<html>not an image</html>'), binaryBytes: 25 };
      return { ok: true, data: {} };
    },
    async getRepoMetadata() { return { nameWithOwner: 'o/r' }; },
  };
  const resBad = await issueMod.createIssueTool(mockBad).execute({ action: 'view_images', issue_number: 2, repo: 'o/r' }, {});
  assert(resBad.message.includes('全部下载失败') && resBad.failures.some((f) => f.includes('魔数校验失败')), '非图片内容被魔数校验拒绝');

  // 3.3 无图片的 issue
  const mockNone = {
    defaultListLimit: 20,
    async run(cmd) { return { ok: true, data: { body: '纯文本没有图' } }; },
    async getRepoMetadata() { return { nameWithOwner: 'o/r' }; },
  };
  const resNone = await issueMod.createIssueTool(mockNone).execute({ action: 'view_images', issue_number: 2, repo: 'o/r' }, {});
  assert(resNone.message.includes('未发现图片'), '无图片 issue 明确提示');

  // 3.4 render 输出 image 内容块
  const rendered = tool2.output.render({ action: 'view_images' }, { message: 'ok', images: [{ file: '/tmp/x.png', mimeType: 'image/png', url: 'u', bytes: 1 }] });
  assert(Array.isArray(rendered) && rendered[0].type === 'text' && rendered.some((b) => b.type === 'image' && b.path === '/tmp/x.png'), 'render 输出 image 内容块（path 引用）');
}

// ---- 4. executor binary 通道（源码级 + 类型） ----
console.log('\n--- 4. executor binary channel ---');
{
  const src = readFileSync('src/executor.ts', 'utf8');
  assert(src.includes("options.binary === true") && src.includes("encoding: 'buffer'"), 'binary 选项显式开启 buffer 编码');
  assert(src.includes('binaryBytes'), '结果带 binaryBytes 字段');
  assert(src.includes("Buffer.isBuffer(stdout)"), 'Buffer 归一化防御');
  // SVG 短内容边界（审核修复）+ dirSize 累计（审核修复）：逻辑已抽至共享模块 image-utils.ts
  const shared = readFileSync('src/tools/image-utils.ts', 'utf8');
  assert(shared.indexOf("'<svg'") < shared.indexOf('if (buf.length < 12)'), 'SVG 嗅探先于长度下限（短 SVG 不误杀）');
  assert(shared.includes('dirSize += buf.length'), '多图循环累计写入量（护栏不破）');
}

// ---- 5. help 条目 ----
console.log('\n--- 5. help entry ---');
{
  const cj = readFileSync('lib/tools/help.js', 'utf8');
  assert(cj.includes('view_images') && cj.includes('报障截图'), '帮助条目已收录（issue）');
  assert(cj.includes('下载并查看 PR 图片'), '帮助条目已收录（PR）');
}

// ---- 6. PR view_images（正文 + 评论合并提取） ----
console.log('\n--- 6. PR view_images ---');
{
  const { createPrTool } = await import('../lib/tools/pr.js');
  // 真实 PR 正文形态（cli/cli#14648 实测样例：Markdown + HTML 双语法混排）
  const prBody = '![Two runs](https://github.com/user-attachments/assets/74c26801-09d8-4a26-b42d-98be2c861f9c)\n<img src="https://github.com/user-attachments/assets/30a91ceb-4101-8917-21cad9968d0a" />';
  const commentBody = '<img src="https://github.com/user-attachments/assets/fdc25ff7-63b1-455b-bb9b-d69d322046b3" />';

  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000a49444154789c6300010000050001', 'hex');
  const downloaded = [];
  const mock = {
    defaultListLimit: 20,
    async run(cmd, opts) {
      if (cmd[0] === 'pr' && cmd[1] === 'view') {
        return { ok: true, data: { number: 14648, body: prBody, comments: [{ body: commentBody }] }, rawOutput: '' };
      }
      if (cmd[0] === 'api' && opts?.binary) {
        downloaded.push(cmd[1]);
        return { ok: true, data: png, binaryBytes: png.length };
      }
      return { ok: true, data: {}, rawOutput: '' };
    },
    async getRepoMetadata() { return { nameWithOwner: 'cli/cli' }; },
  };
  const tool = createPrTool(mock);

  // 6.1 view 附带 images 清单（正文+评论，与 view_images 范围同源——新语义）
  const v = await tool.execute({ action: 'view', pr_number: 14648, repo: 'cli/cli' }, {});
  assert(Array.isArray(v.images) && v.images.length === 3, `view 附带正文+评论图片清单（实际 ${v.images?.length}，应 3）`);

  // 6.2 view_images 正文+评论合并、去重
  const r = await tool.execute({ action: 'view_images', pr_number: 14648, repo: 'cli/cli' }, {});
  assert(r.images && r.images.length === 3, `正文+评论合并提取 3 张（实际 ${r.images?.length}）`);
  assert(downloaded.length === 3 && new Set(downloaded).size === 3, '3 个不同 URL 各下载一次');
  assert(r.images.every((i) => nodeFs.existsSync(i.file)), '全部落盘');
  assert(r.images.every((i) => i.mimeType === 'image/png'), '魔数嗅探全部通过');
  // 清理
  for (const i of r.images) nodeFs.rmSync(nodePath.dirname(i.file), { recursive: true, force: true });

  // 6.3 render 输出 image 块（PR 工具）
  const rendered = tool.output.render({ action: 'view_images' }, { message: 'ok', images: r.images });
  assert(rendered.filter((b) => b.type === 'image').length === 3, 'PR render 输出 3 个 image 块');

  // 6.4 无图 PR 明确提示
  const mockNone = {
    defaultListLimit: 20,
    async run(cmd) { return cmd[0] === 'pr' ? { ok: true, data: { body: '纯文本', comments: [] } } : { ok: true, data: {} }; },
    async getRepoMetadata() { return { nameWithOwner: 'cli/cli' }; },
  };
  const rn = await createPrTool(mockNone).execute({ action: 'view_images', pr_number: 1, repo: 'cli/cli' }, {});
  assert(rn.message.includes('未发现图片'), '无图 PR 明确提示');
}

// ---- 7. image_urls 精准提取（issue + pr 双侧对称） ----
console.log('\n--- 7. image_urls targeting ---');
{
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000a49444154789c6300010000050001', 'hex');
  const mkBody = (n) => Array.from({ length: n }, (_, i) => `<img src="https://github.com/user-attachments/assets/img-${i}" />`).join('\n');

  function makeMock(issueOrPr) {
    return {
      defaultListLimit: 20,
      async run(cmd, opts) {
        const isIssue = issueOrPr === 'issue';
        if (cmd[(isIssue ? 0 : 1)] === (isIssue ? 'issue' : 'view') || (cmd[0] === 'pr' && cmd[1] === 'view')) {
          return { ok: true, data: { number: 1, body: mkBody(7), comments: [] }, rawOutput: '' };
        }
        if (cmd[0] === 'api' && opts?.binary) return { ok: true, data: png, binaryBytes: png.length };
        return { ok: true, data: {}, rawOutput: '' };
      },
      async getRepoMetadata() { return { nameWithOwner: 'o/r' }; },
    };
  }

  const issueTool = (await import('../lib/tools/issue.js')).createIssueTool(makeMock('issue'));
  const prTool2 = (await import('../lib/tools/pr.js')).createPrTool(makeMock('pr'));

  // 7.1 全量无截断（issue）：7 张全部下载（旧 5 张截断语义已废除）
  {
    const r = await issueTool.execute({ action: 'view_images', issue_number: 1, repo: 'o/r' }, {});
    assert(r.images.length === 7, `issue 全量无截断：7/7（实际 ${r.images.length}）`);
    for (const i of r.images) nodeFs.rmSync(nodePath.dirname(i.file), { recursive: true, force: true });
  }

  // 7.2 image_urls 单张精准（pr）：只下载指定那张
  {
    const target = 'https://github.com/user-attachments/assets/img-3';
    const r = await prTool2.execute({ action: 'view_images', pr_number: 1, repo: 'o/r', image_urls: [target] }, {});
    assert(r.images.length === 1 && r.images[0].url === target, `pr 单张精准下载（实际 ${r.images.length} 张）`);
    nodeFs.rmSync(nodePath.dirname(r.images[0].file), { recursive: true, force: true });
  }

  // 7.3 批量 + 顺序保持 + 非法拒绝（issue）：传入 [img-5, img-1, evil]
  {
    const r = await issueTool.execute({ action: 'view_images', issue_number: 1, repo: 'o/r', image_urls: [
      'https://github.com/user-attachments/assets/img-5',
      'https://github.com/user-attachments/assets/img-1',
      'https://evil.example.com/steal.png',
    ] }, {});
    assert(r.images.length === 2, `交集后仅 2 张（实际 ${r.images.length}）`);
    assert(r.images[0].url.includes('img-5') && r.images[1].url.includes('img-1'), '下载顺序保持传入顺序');
    assert((r.failures || []).some((f) => f.includes('已拒绝')), '非法 URL 被拒并报告');
    for (const i of r.images) nodeFs.rmSync(nodePath.dirname(i.file), { recursive: true, force: true });
  }

  // 7.4 空数组防御（双侧）
  {
    for (const [tool, args] of [[issueTool, { issue_number: 1 }], [prTool2, { pr_number: 1 }]]) {
      let threw = false;
      try { await tool.execute({ action: 'view_images', repo: 'o/r', ...args, image_urls: [] }, {}); }
      catch (e) { threw = e.message.includes('空数组'); }
      assert(threw, `空数组明确报错（${args.issue_number ? 'issue' : 'pr'}）`);
    }
  }

  // 7.5 非字符串元素剔除（pr）：[42, null, 合法url]
  {
    const r = await prTool2.execute({ action: 'view_images', pr_number: 1, repo: 'o/r', image_urls: [42, null, 'https://github.com/user-attachments/assets/img-2'] }, {});
    assert(r.images.length === 1 && r.images[0].url.includes('img-2'), '非字符串元素剔除、合法照常');
    nodeFs.rmSync(nodePath.dirname(r.images[0].file), { recursive: true, force: true });
  }

  // 7.6 续传闭环：字节护栏触顶 → remaining 结构化返回 → 用 remaining 再调全部通过
  {
    const { downloadImages } = await import('../lib/tools/image-utils.js');
    // 4 张 4.5MB（每张过单图 5MB 限，累计 18MB 超 15MB 目录限）→ 第 4 张触顶
    const imgBig = Buffer.concat([png, Buffer.alloc(4.5 * 1024 * 1024)]);
    const urls4 = ['b1', 'b2', 'b3', 'b4'].map((k) => `https://github.com/user-attachments/assets/${k}`);
    const r = await downloadImages(urls4, async () => ({ ok: true, data: imgBig }));
    assert(r.images.length === 3 && r.remaining && r.remaining.length === 1, `触顶：3 成功 + remaining 1（实际 ${r.images.length}+${r.remaining?.length}）`);
    assert((r.failures || []).some((f) => f.includes('3/4')), 'failures 含 N/M 计数');
    nodeFs.rmSync(nodePath.dirname(r.images[0].file), { recursive: true, force: true });
    // 续传：remaining 作为下一批目标（模拟清理后的再调用，小图必过）
    const r2 = await downloadImages(r.remaining || [], async () => ({ ok: true, data: png }));
    assert(r2.images.length === 1 && !r2.remaining, 'remaining 续传闭环：全部通过');
    nodeFs.rmSync(nodePath.dirname(r2.images[0].file), { recursive: true, force: true });
  }

  // 7.7 issue view 清单对齐 comments
  {
    const mockC = {
      defaultListLimit: 20,
      async run(cmd) {
        if (cmd[0] === 'issue') return { ok: true, data: { number: 1, body: '<img src="https://github.com/user-attachments/assets/a1" />', comments: [{ body: '<img src="https://github.com/user-attachments/assets/c9" />' }] } };
        return { ok: true, data: {} };
      },
      async getRepoMetadata() { return { nameWithOwner: 'o/r' }; },
    };
    const v = await (await import('../lib/tools/issue.js')).createIssueTool(mockC).execute({ action: 'view', issue_number: 1, repo: 'o/r' }, {});
    assert(v.images.length === 2 && v.images.some((u) => u.includes('c9')), 'issue view 清单含评论图片');
  }
}

console.log(`\n===== Phase 8: ${pass}/${total} PASS =====`);
if (fails.length) process.exit(1);
