// test/phase30.test.mjs - Phase 30 · PR 弹窗 Markdown 渲染 · 滚动适配 · 评论折叠
//
// 背景：PR 弹窗直接把 Markdown 源文本塞进 white-space:pre-wrap 的 div，
// 导致 "###"、"**"、"```" 原样显示；同时 .dsh-github-pr-body-card 等
// flex 子项默认 flex-shrink:1，长内容被压缩而不是撑开父容器，
// 父容器的 overflow-y:auto 永不触发 —— 长 PR 无法滚动。
//
// 覆盖：
// 1. parseMarkdownBlocks 块级解析（标题/代码块/列表/引用/分隔线/段落）
// 2. parseInline 行内解析（粗体/斜体/行内码/链接）
// 3. 安全：javascript: 链接不生成 <a>，HTML 不执行
// 4. estimateContentLines 折叠阈值估算
// 5. renderMarkdownBlocks 产出正确的元素类型
// 6. CSS 层：卡片 flex 配置与滚动容器

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runTests() {
  let passed = 0, total = 0;
  const ok = (cond, name, extra = '') => {
    total++;
    if (cond) {
      console.log(`✅ PASS: ${name}${extra ? '  → ' + extra : ''}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name}${extra ? '  → ' + extra : ''}`);
    }
  };

  const { parseMarkdownBlocks, parseInline, renderMarkdownBlocks, estimateContentLines } =
    await import('../lib/ui/markdown-lite.js');

  // ============================================================
  console.log('\n--- 1. 块级解析 ---');
  // ============================================================
  ok(parseMarkdownBlocks('').length === 0, '空串 → 空数组');
  ok(parseMarkdownBlocks(null).length === 0, 'null → 空数组不抛错');
  ok(parseMarkdownBlocks('   \n  \n').length === 0, '纯空白 → 空数组');

  const headings = parseMarkdownBlocks('# H1\n## H2\n### H3\n###### H6');
  ok(headings.length === 4, '四级标题解析为 4 个 block', String(headings.length));
  ok(headings[0].type === 'heading' && headings[0].level === 1, 'h1 level=1');
  ok(headings[2].level === 3, 'h3 level=3');
  ok(headings[3].level === 6, 'h6 level=6');

  const codeBlock = parseMarkdownBlocks('```python\nprint(1)\nprint(2)\n```');
  ok(codeBlock.length === 1 && codeBlock[0].type === 'code', '围栏代码块识别为 code block');
  ok(codeBlock[0].lang === 'python', '保留了语言标记');
  ok(codeBlock[0].text === 'print(1)\nprint(2)', '代码内容原样保留（含换行）', JSON.stringify(codeBlock[0].text));

  // 未闭合的代码块必须容错，不能抛错也不能吞掉后续
  const unclosed = parseMarkdownBlocks('```js\nconst a = 1;');
  ok(unclosed.length === 1 && unclosed[0].type === 'code', '未闭合代码块容错（读到末尾）');

  const ul = parseMarkdownBlocks('- a\n- b\n- c');
  ok(ul.length === 1 && ul[0].type === 'list' && !ul[0].ordered, '无序列表');
  ok(ul[0].items.length === 3, '列表三项');

  const ol = parseMarkdownBlocks('1. one\n2. two');
  ok(ol.length === 1 && ol[0].type === 'list' && ol[0].ordered === true, '有序列表 ordered=true');

  const quote = parseMarkdownBlocks('> 引用第一行\n> 引用第二行');
  ok(quote.length === 1 && quote[0].type === 'quote', '引用块合并为一个 block');

  ok(parseMarkdownBlocks('---')[0].type === 'hr', '--- 识别为分隔线');
  ok(parseMarkdownBlocks('***')[0].type === 'hr', '*** 识别为分隔线');

  const para = parseMarkdownBlocks('第一行\n第二行');
  ok(para.length === 1 && para[0].type === 'paragraph', '连续文本合并为一个段落');

  // 混合文档：每类块都要正确切分
  const mixed = parseMarkdownBlocks([
    '### 标题',
    '',
    '正文段落',
    '',
    '- 项目 1',
    '- 项目 2',
    '',
    '---',
    '',
    '```js',
    'code();',
    '```',
  ].join('\n'));
  const types = mixed.map((b) => b.type);
  ok(types.includes('heading') && types.includes('paragraph') && types.includes('list') && types.includes('hr') && types.includes('code'), '混合文档各类块均被识别', types.join(','));

  // ============================================================
  console.log('\n--- 2. 行内解析 ---');
  // ============================================================
  const bold = parseInline('这是**粗体**结尾');
  ok(bold.some((n) => n.type === 'strong'), '** 识别为 strong');
  ok(bold.find((n) => n.type === 'strong').children[0].text === '粗体', 'strong 内容正确');

  const boldUnder = parseInline('__粗体__');
  ok(boldUnder.some((n) => n.type === 'strong'), '__ 也识别为 strong');

  const em = parseInline('这是*斜体*结尾');
  ok(em.some((n) => n.type === 'em'), '*单星* 识别为 em');

  const code = parseInline('调用 `foo()` 方法');
  ok(code.some((n) => n.type === 'code' && n.text === 'foo()'), '行内代码识别');

  // 行内代码里的星号不得被再解析
  const codeInner = parseInline('`**not bold**`');
  const codeNode = codeInner.find((n) => n.type === 'code');
  ok(codeNode && codeNode.text === '**not bold**', '行内代码内部不再解析（保留字面星号）');
  ok(!codeInner.some((n) => n.type === 'strong'), '行内代码内的 ** 不产生 strong');

  const link = parseInline('见 [文档](https://example.com) 说明');
  const linkNode = link.find((n) => n.type === 'link');
  ok(linkNode && linkNode.href === 'https://example.com', '链接 URL 解析正确');
  ok(linkNode.children[0].text === '文档', '链接文字解析正确');

  // ============================================================
  console.log('\n--- 3. 安全检查 ---');
  // ============================================================
  const jsLink = parseInline('[点我](javascript:alert(1))');
  ok(!jsLink.some((n) => n.type === 'link'), 'javascript: 链接不生成 link 节点');
  ok(jsLink.some((n) => n.type === 'text' && n.text === '点我'), '危险链接降级为纯文本，保留可见文字');

  for (const bad of ['[x](data:text/html,<script>)', '[x](vbscript:msgbox)', '[x](file:///etc/passwd)']) {
    ok(!parseInline(bad).some((n) => n.type === 'link'), `危险协议被拒: ${bad.slice(0, 34)}`);
  }

  ok(parseInline('[x](mailto:a@b.com)').some((n) => n.type === 'link'), 'mailto: 允许');
  ok(parseInline('[x](/owner/repo)').some((n) => n.type === 'link'), '站内相对路径允许');
  ok(!parseInline('[x](//evil.com)').some((n) => n.type === 'link'), '协议相对 // 被拒（防跨站）');

  // HTML 标签必须当纯文本，不得成为元素
  const html = parseMarkdownBlocks('<script>alert(1)</script>');
  ok(html[0].type === 'paragraph', '<script> 被当作普通段落');
  const htmlText = html[0].children.map((c) => c.text || '').join('');
  ok(htmlText.includes('<script>'), 'HTML 标签作为纯文本保留（渲染为文本节点，不执行）');

  // ============================================================
  console.log('\n--- 4. 折叠阈值估算 ---');
  // ============================================================
  ok(estimateContentLines('') === 0, '空串 → 0 行');
  ok(estimateContentLines('a') === 1, '单字符 → 1 行');
  ok(estimateContentLines('a\nb\nc') === 3, '三行 → 3');
  ok(estimateContentLines('x'.repeat(240)) === 3, '240 字符按 80/行 → 3 行', String(estimateContentLines('x'.repeat(240))));
  ok(estimateContentLines('a\n\nb') === 3, '空行也计入（保守估计）');

  // ============================================================
  console.log('\n--- 5. React 渲染器产出正确元素 ---');
  // ============================================================
  const created = [];
  const mockH = (tag, props, ...children) => {
    created.push(tag);
    return { tag, props, children };
  };

  const rendered = renderMarkdownBlocks(mockH, parseMarkdownBlocks('### 标题\n\n正文 **粗**\n\n```js\nx\n```'));
  ok(rendered.length === 3, '三类块渲染出 3 个元素', String(rendered.length));
  ok(created.includes('h3'), '标题渲染为 h3');
  ok(created.includes('strong'), '粗体渲染为 strong');
  ok(created.includes('pre'), '代码块渲染为 pre');
  ok(created.includes('code'), '代码块内含 code');

  created.length = 0;
  renderMarkdownBlocks(mockH, parseMarkdownBlocks('- a\n1. b'));
  ok(created.includes('ul') && created.includes('ol'), '列表分别渲染为 ul / ol');

  created.length = 0;
  renderMarkdownBlocks(mockH, parseMarkdownBlocks('> 引用'));
  ok(created.includes('blockquote'), '引用渲染为 blockquote');

  created.length = 0;
  renderMarkdownBlocks(mockH, parseMarkdownBlocks('---'));
  ok(created.includes('hr'), '分隔线渲染为 hr');

  // 链接：安全协议产出 a，危险协议不产出 a
  created.length = 0;
  renderMarkdownBlocks(mockH, parseMarkdownBlocks('[ok](https://x.com)'));
  ok(created.includes('a'), '安全链接渲染为 a');
  created.length = 0;
  renderMarkdownBlocks(mockH, parseMarkdownBlocks('[bad](javascript:alert(1))'));
  ok(!created.includes('a'), '危险链接不渲染为 a');

  ok(Array.isArray(renderMarkdownBlocks(mockH, null)), 'null AST 返回空数组不抛错');

  // ============================================================
  console.log('\n--- 6. 真实 PR body 回归（关键场景）---');
  // ============================================================
  const realBody = [
    '### 描述 (Description)',
    '',
    '#### 1. 背景与问题 (Background)',
    '在 Codex 官方客户端通过 `/v1/responses` 接口调用时：',
    '1. **协作工具丢失**：工具被打包在 `type: "namespace"` 中。',
    '2. **任务 Payload 丢失**：正文挂载在 `encrypted_content` 属性。',
    '',
    '---',
    '',
    '#### 2. 主要改动 (Key Changes)',
    '* **递归解包**：在 `_convert_tools_for_chat` 中增加提取。',
  ].join('\n');

  const real = parseMarkdownBlocks(realBody);
  ok(real.some((b) => b.type === 'heading' && b.level === 3), '真实 body: h3 识别');
  ok(real.some((b) => b.type === 'heading' && b.level === 4), '真实 body: h4 识别');
  ok(real.some((b) => b.type === 'list' && b.ordered), '真实 body: 有序列表识别');
  ok(real.some((b) => b.type === 'list' && !b.ordered), '真实 body: 无序列表识别');
  ok(real.some((b) => b.type === 'hr'), '真实 body: 分隔线识别');

  // 标题内容必须纯净，不能把后续行吞进去
  const h3 = real.find((b) => b.type === 'heading' && b.level === 3);
  const h3Text = (h3.children || []).map((c) => c.text || '').join('');
  ok(h3Text === '描述 (Description)', 'h3 内容纯净（未吞入后续段落）', JSON.stringify(h3Text));
  ok(!h3Text.includes('####'), 'h3 内不含下一级标题标记');

  // 列表项内的粗体与行内码都要保留
  const olReal = real.find((b) => b.type === 'list' && b.ordered);
  ok(olReal.items[0].children.some((c) => c.type === 'strong'), '列表项内的粗体被识别');
  ok(olReal.items[0].children.some((c) => c.type === 'code'), '列表项内的行内码被识别');

  // ============================================================
  console.log('\n--- 7. CSS：滚动与折叠布局 ---');
  // ============================================================
  const css = fs.readFileSync(path.join(__dirname, '../lib/ui/styles.js'), 'utf8');

  const bodyCard = css.slice(css.indexOf('.dsh-github-pr-body-card {'));
  const bodyCardBody = bodyCard.slice(0, bodyCard.indexOf('}'));
  ok(bodyCardBody.includes('flex: 0 0 auto'), '「描述」卡片禁止 flex 收缩（否则父容器滚不动）');

  const cmtCard = css.slice(css.indexOf('.dsh-github-pr-comment-card {'));
  const cmtCardBody = cmtCard.slice(0, cmtCard.indexOf('}'));
  ok(cmtCardBody.includes('flex: 0 0 auto'), '「评论」卡片禁止 flex 收缩');

  const pane = css.slice(css.indexOf('.dsh-github-pr-conversation-pane {'));
  const paneBody = pane.slice(0, pane.indexOf('}'));
  ok(paneBody.includes('overflow-y: auto'), '会话区可纵向滚动');
  ok(paneBody.includes('overscroll-behavior: contain'), '滚动不穿透到弹窗外层');

  ok(css.includes('.dsh-github-md-body'), '存在 Markdown 正文容器样式');
  ok(css.includes('.dsh-github-md-pre'), '存在代码块样式');
  ok(css.includes('white-space: pre'), '代码块保留原始换行（不折行毁缩进）');
  ok(css.includes('.dsh-github-md-expand-btn'), '存在折叠按钮样式');
  ok(css.includes('body[data-ds-dark-theme] .dsh-github-md-expand-btn'), '折叠按钮适配暗色主题');

  // ============================================================
  console.log('\n--- 8. bundle 与模块顺序 ---');
  // ============================================================
  const bundle = fs.readFileSync(path.join(__dirname, '../lib/client.js'), 'utf8');
  ok(bundle.includes('markdown-lite.js'), 'bundle 内联了 markdown-lite');
  ok(bundle.includes('parseMarkdownBlocks'), 'bundle 含解析函数');
  ok(bundle.includes('renderMarkdownBlocks'), 'bundle 含渲染函数');
  ok(bundle.includes('estimateContentLines'), 'bundle 含行数估算');
  ok(bundle.includes('CollapsibleBody'), 'pr-modal 使用了折叠组件');

  // markdown-lite 必须先于 pr-modal 内联，否则运行时引用为 undefined
  const mdIdx = bundle.indexOf('[Bundled: markdown-lite.js]');
  const modalIdx = bundle.indexOf('[Bundled: pr-modal.js]');
  ok(mdIdx >= 0 && modalIdx >= 0 && mdIdx < modalIdx, 'markdown-lite 先于 pr-modal 内联（依赖顺序正确）', `md=${mdIdx} modal=${modalIdx}`);

  ok(!/\bexport\s+(async\s+)?(function|const|var|let|class)\b/.test(bundle), 'bundle 无裸 export 残留');

  // pr-modal 不得再直接把 body 当纯文本塞进 div
  const modalSrc = fs.readFileSync(path.join(__dirname, '../src/ui/pr-modal.ts'), 'utf8');
  ok(modalSrc.includes('CollapsibleBody'), 'pr-modal 引入折叠组件');
  // 注意匹配方向：代码形如 h(CollapsibleBody, { text: data.body, ... })，
  // 是「组件名在前、text 在后」，不要写反。
  ok(/CollapsibleBody,\s*\{\s*text:\s*data\.body/.test(modalSrc), 'PR 描述经 Markdown 渲染（不再裸文本）');
  ok(/CollapsibleBody,\s*\{\s*text:\s*c\.body/.test(modalSrc), '评论经 Markdown 渲染');
  ok(!/whiteSpace:\s*"pre-wrap"[\s\S]{0,80}c\.body/.test(modalSrc), '评论不再用 pre-wrap 直出原文');
  ok(modalSrc.includes('defaultExpanded: true'), 'PR 描述默认展开');
  ok(modalSrc.includes('defaultExpanded: false'), '评论默认折叠');

  /*
   * CollapsibleBody 必须定义在模块顶层，不能写在 PrDetailModal 函数体内。
   *
   * 为什么：函数体内定义的组件每次父级渲染都产生新函数引用，
   * React 按引用比较类型 → 视为另一个组件 → 卸载重建，
   * useState 的展开状态被重置。表现是「刚展开的长评论，
   * 一拖分隔条又缩回去」。这是 React 内联组件定义的经典陷阱。
   */
  const fnStart = modalSrc.indexOf('export function PrDetailModal');
  const collapsibleIdx = modalSrc.indexOf('function CollapsibleBody');
  ok(collapsibleIdx >= 0, 'CollapsibleBody 已定义');
  ok(collapsibleIdx < fnStart, 'CollapsibleBody 定义在 PrDetailModal 之外（引用稳定，展开状态不被重置）');
  ok(!/var CollapsibleBody = function/.test(modalSrc), '不再以函数体内变量形式定义折叠组件');

  console.log('\n========================================');
  console.log(`Phase 30 Test Result: ${passed}/${total} assertions ${passed === total ? 'PASSED' : 'FAILED'}!`);
  console.log('========================================');
  if (passed !== total) process.exit(1);
}

runTests().catch((e) => {
  console.error('测试执行异常:', e);
  process.exit(1);
});
