/**
 * 轻量 Markdown 解析与 React 渲染（零依赖）。
 *
 * 为什么必须自己写：本插件没有前端 dependencies，bundle 机制只内联
 * lib/ui/*.js 且不做 import 解析，因此 marked / markdown-it 都无法引入。
 * 服务端的 src/renderers/* 只产出给模型看的 Markdown 文本，不能复用为 DOM。
 *
 * 设计取舍：
 * - 只支持 GitHub PR/Issue 实际会用到的语法子集（标题/粗斜体/行内码/
 *   围栏代码块/列表/引用/分隔线/链接/图片）。表格、内嵌 HTML 明确不做。
 * - 图片**按 URL 直接渲染，不下载落盘**：GitHub 自己的页面同样如此，
 *   浏览器并行加载远比走宿主进程逐张下载快，也不必新增服务端端点。
 * - 内联只针对 GitHub 资产域（见 IMAGE_SRC_PREFIXES），其余退化外链：
 *   早期实现「一律不内联」是为了不把宿主 Referer 漏给第三方图床，现在内联
 *   一律带 referrerPolicy="no-referrer"，域名白名单又沿用插件的既有防线，
 *   两条顾虑都不再成立，才放开内联。
 * - 无法识别的语法**降级为纯文本**，绝不抛错——弹窗是只读展示，
 *   因为一段奇怪文本崩掉整块内容是不可接受的。
 * - 全程 React.createElement，**从不使用 dangerouslySetInnerHTML**：
 *   用户写的 <script> 会被当作纯文本渲染，天然免疫 XSS。
 */

export interface MdInline {
  type: 'text' | 'code' | 'strong' | 'em' | 'link' | 'image';
  text?: string;
  children?: MdInline[];
  href?: string;
  /** image 节点：图片地址（仅 GitHub 资产域，见 isRenderableImageSrc） */
  src?: string;
  /** image 节点：替代文本，同时用作 title 提示 */
  alt?: string;
}

export interface MdListItem {
  /** 原始标记：'-' / '*' / '1.' 等，用于区分任务列表 */
  marker: string;
  children: MdInline[];
}

export interface MdBlock {
  type: 'heading' | 'paragraph' | 'code' | 'list' | 'quote' | 'hr';
  level?: number;
  lang?: string;
  text?: string;
  items?: MdListItem[];
  ordered?: boolean;
  children?: MdInline[];
}

/**
 * 链接协议白名单。
 *
 * 为什么必须白名单：Markdown 的链接目标是**用户可控文本**。
 * `[点我](javascript:alert(1))` 若直接渲染成 href，点击即执行脚本。
 * 只放行 http/https/mailto，其余降级为纯文本（保留文字，不生成 <a>）。
 */
function isSafeHref(href: string): boolean {
  if (typeof href !== 'string') return false;
  const trimmed = href.trim();
  if (!trimmed) return false;
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return true;
  // 站内相对路径（如 /owner/repo/issues/1）视为安全，但必须以单个 / 开头
  if (/^\/(?!\/)/.test(trimmed)) return true;
  return false;
}

/**
 * 允许内联渲染的图片地址前缀（仅 GitHub 自有资产域）。
 *
 * 为什么白名单而不是「任意 https 都渲染」：正文里的图片地址是**用户可控文本**。
 * 任意域名都内联，等于把每个读者变成第三方图床的探测点（IP、UA、阅读时长全部外泄），
 * 也绕过了插件既有的域名防线。上面这几个域覆盖了 PR/Issue 截图的真实来源
 * （新版上传、旧版上传、私有仓库签名图、仓库内 raw、camo 代理），其余一律
 * 退化成外链，由用户显式决定是否打开。
 *
 * 只放行 https：http 图在 https 宿主页会被按混合内容降级，且可被中间人替换。
 */
const IMAGE_SRC_PREFIXES = [
  'https://github.com/user-attachments/',
  'https://user-images.githubusercontent.com/',
  'https://private-user-images.githubusercontent.com/',
  'https://raw.githubusercontent.com/',
  'https://camo.githubusercontent.com/',
];

export function isRenderableImageSrc(src: unknown): boolean {
  if (typeof src !== 'string') return false;
  const s = src.trim();
  if (!s) return false;
  return IMAGE_SRC_PREFIXES.some((p) => s.startsWith(p));
}

/**
 * 解析行内语法：`code` / **strong** / *em* / [text](url) / ![alt](url)。
 *
 * 用单遍扫描而非多次 replace 的原因：
 * 行内代码里的内容**不应再被解析**（`**a**` 是字面量），
 * 分段替换很容易把代码块内的星号也吃掉。手写扫描能保证优先级正确：
 * 行内代码 > 图片 > 链接 > 粗体 > 斜体。
 */
/**
 * 从 openIdx 处的开括号找到配对的闭括号下标（支持嵌套），找不到返回 -1。
 *
 * 为什么不能用 indexOf：`[![CI](badge.png)](workflow)` 这种「图片徽章外层套链接」
 * 是 GitHub 上极常见的写法。indexOf 会先命中内层的 `]`，于是 label 被截成 `![CI`、
 * href 被截成图片地址，剩下的 `](workflow)` 变成裸文本——整块渲染成乱码。
 * 按深度配平才能拿到真正的外层闭括号。
 */
function matchBalanced(text: string, openIdx: number, open: string, close: string): number {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') { i++; continue; } // 跳过转义字符，避免 \] 被当成闭合
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 行内递归解析的深度上限：畸形输入（几百个 `[`）不得把栈打爆 */
const MAX_INLINE_DEPTH = 8;

export function parseInline(src: string, depth = 0): MdInline[] {
  const out: MdInline[] = [];
  const text = String(src ?? '');
  let buf = '';
  let i = 0;

  const flush = () => {
    if (buf) {
      out.push({ type: 'text', text: buf });
      buf = '';
    }
  };

  while (i < text.length) {
    const ch = text[i];

    // ---- 行内代码：最高优先级，内部不再解析任何语法 ----
    if (ch === '`') {
      const close = text.indexOf('`', i + 1);
      if (close > i) {
        flush();
        out.push({ type: 'code', text: text.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
    }

    // ---- 图片：![alt](url) ----
    // 必须排在链接分支之前：否则 '!' 落进文本缓冲，`[alt](url)` 被当成普通链接，
    // 渲染出「!全景驾驶舱」这种文字——这正是修复前的实际表现。
    if (ch === '!' && text[i + 1] === '[') {
      const closeBracket = matchBalanced(text, i + 1, '[', ']');
      if (closeBracket > i + 1 && text[closeBracket + 1] === '(') {
        const closeParen = matchBalanced(text, closeBracket + 1, '(', ')');
        if (closeParen > closeBracket) {
          const alt = text.slice(i + 2, closeBracket);
          // 去掉 ![a](url "标题") 里的标题段：图片渲染用不到，留着会拼进 URL
          const src = text
            .slice(closeBracket + 2, closeParen)
            .replace(/\s+(["']).*\1\s*$/, '')
            .trim();
          flush();
          if (isRenderableImageSrc(src)) {
            out.push({ type: 'image', src, alt });
          } else if (isSafeHref(src)) {
            // 非 GitHub 资产域：退化为可点外链，文字用 alt（缺省回落到地址本身），
            // 与「不把宿主 Referer 漏给第三方」的既有防线保持一致
            out.push({ type: 'link', href: src, children: [{ type: 'text', text: alt || src }] });
          } else {
            out.push({ type: 'text', text: alt });
          }
          i = closeParen + 1;
          continue;
        }
      }
    }

    // ---- 链接：[text](url) ----
    if (ch === '[') {
      const closeBracket = matchBalanced(text, i, '[', ']');
      if (closeBracket > i && text[closeBracket + 1] === '(') {
        const closeParen = matchBalanced(text, closeBracket + 1, '(', ')');
        if (closeParen > closeBracket) {
          const label = text.slice(i + 1, closeBracket);
          const href = text.slice(closeBracket + 2, closeParen);
          flush();
          if (isSafeHref(href)) {
            // label 递归解析：`[![CI](badge.png)](workflow)` 的 label 是一张图片，
            // 不递归的话徽章链接永远渲染不出来
            out.push({
              type: 'link',
              href: href.trim(),
              children: depth < MAX_INLINE_DEPTH ? parseInline(label, depth + 1) : [{ type: 'text', text: label }],
            });
          } else {
            // 不安全协议：保留可见文字，但不生成可点链接
            out.push({ type: 'text', text: label });
          }
          i = closeParen + 1;
          continue;
        }
      }
    }

    // ---- 粗体：**text** 或 __text__ ----
    if ((ch === '*' && text[i + 1] === '*') || (ch === '_' && text[i + 1] === '_')) {
      const mark = ch + ch;
      const close = text.indexOf(mark, i + 2);
      if (close > i + 2) {
        flush();
        out.push({ type: 'strong', children: parseInline(text.slice(i + 2, close)) });
        i = close + 2;
        continue;
      }
    }

    // ---- 斜体：*text* 或 _text_（单字符，且不能被上面粗体规则截获） ----
    if (ch === '*' || ch === '_') {
      // 避免把列表标记或孤立的 * 当斜体：要求闭合符前后都不是同一字符
      const close = text.indexOf(ch, i + 1);
      if (close > i + 1 && text[close + 1] !== ch && text[close - 1] !== ch) {
        flush();
        out.push({ type: 'em', children: parseInline(text.slice(i + 1, close)) });
        i = close + 1;
        continue;
      }
    }

    buf += ch;
    i++;
  }

  flush();
  return out;
}

/** 判断一行是否是围栏代码块标记，返回 { fence, lang } 或 null */
function matchFence(line: string): { fence: string; lang: string } | null {
  const m = /^\s*(```+|~~~+)\s*([A-Za-z0-9_+-]*)\s*$/.exec(line);
  if (!m) return null;
  return { fence: m[1], lang: m[2] || '' };
}

/** 判断一行是否是列表项，返回 { marker, content, ordered } 或 null */
function matchListItem(line: string): { marker: string; content: string; ordered: boolean } | null {
  const m = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(line);
  if (!m) return null;
  return { marker: m[2], content: m[3], ordered: /\d+\./.test(m[2]) };
}

/**
 * 把 Markdown 源文本解析为块级 AST。
 *
 * 纯函数、无 I/O，可被单测直接覆盖——这是把「渲染正确性」从浏览器里
 * 剥离出来断言的关键。任何异常输入都返回空数组，绝不抛错。
 */
export function parseMarkdownBlocks(src: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  if (typeof src !== 'string' || !src.trim()) return blocks;

  const lines = src.replace(/\r\n/g, '\n').split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ---- 空行 ----
    if (!line.trim()) {
      i++;
      continue;
    }

    // ---- 围栏代码块 ----
    const fence = matchFence(line);
    if (fence) {
      const codeLines: string[] = [];
      i++;
      // 一直读到同种围栏闭合；未闭合时读到末尾（容错，不报错）
      while (i < lines.length) {
        const maybeClose = matchFence(lines[i]);
        if (maybeClose && maybeClose.fence[0] === fence.fence[0] && maybeClose.fence.length >= fence.fence.length) {
          i++;
          break;
        }
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'code', lang: fence.lang, text: codeLines.join('\n') });
      continue;
    }

    // ---- 标题 ----
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, children: parseInline(heading[2].trim()) });
      i++;
      continue;
    }

    // ---- 分隔线 ----
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // ---- 引用：连续 > 行合并为一个 blockquote ----
    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'quote', children: parseInline(quoteLines.join('\n').trim()) });
      continue;
    }

    // ---- 列表：连续同类型（有序/无序）合并为一个 list ----
    const firstItem = matchListItem(line);
    if (firstItem) {
      const ordered = firstItem.ordered;
      const items: MdListItem[] = [];
      while (i < lines.length) {
        const item = matchListItem(lines[i]);
        if (!item || item.ordered !== ordered) break;
        items.push({ marker: item.marker, children: parseInline(item.content) });
        i++;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    // ---- 段落：连续非空行合并 ----
    const paraLines: string[] = [];
    while (i < lines.length) {
      const cur = lines[i];
      if (!cur.trim()) break;
      // 遇到块级语法起始就停下，交给下一轮解析
      if (matchFence(cur) || /^(#{1,6})\s+/.test(cur) || /^\s*>\s?/.test(cur) || matchListItem(cur) || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(cur)) {
        break;
      }
      paraLines.push(cur);
      i++;
    }
    // 段落内的硬换行保留为 text 中的 \n，渲染时用 white-space: pre-wrap 呈现
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', children: parseInline(paraLines.join('\n')) });
    } else {
      // 兜底：当前行以某种方式无法消费时跳过，防止死循环
      i++;
    }
  }

  return blocks;
}

/**
 * 把 AST 渲染为 React 元素数组。
 *
 * @param h React.createElement
 * @param blocks parseMarkdownBlocks 的产物
 */
export function renderMarkdownBlocks(h: any, blocks: MdBlock[]): any[] {
  if (!Array.isArray(blocks)) return [];

  /**
   * @param inLink 当前是否已经处在某个 <a> 里。
   *   图片徽章 `[![CI](b.png)](workflow)` 会解析成「link 的 children 里有 image」，
   *   若图片再套一层 <a> 就是非法嵌套（浏览器会强行拆开，点击行为变得不可预期）。
   *   所以 inLink 时只渲染裸 <img>，由外层链接统一承担跳转。
   */
  const renderInline = (nodes: MdInline[] | undefined, keyPrefix: string, inLink = false): any[] => {
    if (!Array.isArray(nodes)) return [];
    return nodes.map((n, idx) => {
      const key = `${keyPrefix}-${idx}`;
      switch (n.type) {
        case 'code':
          return h('code', { key, className: 'dsh-github-md-inline-code' }, n.text ?? '');
        case 'strong':
          return h('strong', { key }, renderInline(n.children, key, inLink));
        case 'em':
          return h('em', { key }, renderInline(n.children, key, inLink));
        case 'image': {
          const img = h('img', {
            key,
            src: n.src,
            alt: n.alt || '图片',
            loading: 'lazy',
            decoding: 'async',
            // 不发送 Referer：否则宿主页面地址会漏给图片所在域
            referrerPolicy: 'no-referrer',
            className: 'dsh-github-md-img',
          });
          if (inLink) return img;
          // 外层包 <a>：图裂时 alt 文本仍是可点入口，用户能直接打开原图，
          // 不必为一个失败态再引入 React 状态机或 DOM 手工替换。
          return h(
            'a',
            {
              key,
              href: n.src,
              target: '_blank',
              rel: 'noopener noreferrer',
              className: 'dsh-github-md-img-link',
              title: n.alt || n.src || '',
            },
            img
          );
        }
        case 'link':
          return h(
            'a',
            {
              key,
              href: n.href,
              target: '_blank',
              rel: 'noopener noreferrer',
              className: 'dsh-github-md-link',
            },
            renderInline(n.children, key, true)
          );
        default:
          return h('span', { key }, n.text ?? '');
      }
    });
  };

  return blocks.map((b, idx) => {
    const key = `md-${idx}`;
    switch (b.type) {
      case 'heading': {
        const tag = `h${Math.min(Math.max(b.level || 1, 1), 6)}`;
        return h(tag, { key, className: 'dsh-github-md-heading' }, renderInline(b.children, key));
      }
      case 'code':
        return h(
          'pre',
          { key, className: 'dsh-github-md-pre' },
          h('code', { className: b.lang ? `language-${b.lang}` : undefined }, b.text ?? '')
        );
      case 'list': {
        const tag = b.ordered ? 'ol' : 'ul';
        return h(
          tag,
          { key, className: 'dsh-github-md-list' },
          (b.items || []).map((item, ii) => {
            const itemKey = `${key}-${ii}`;
            // 任务列表：- [ ] / - [x]
            const raw = (item.children || []).map((c) => c.text || '').join('');
            const task = /^\[( |x|X)\]\s*/.exec(raw);
            if (task) {
              const checked = task[1].toLowerCase() === 'x';
              const rest = raw.replace(/^\[( |x|X)\]\s*/, '');
              return h(
                'li',
                { key: itemKey, className: 'dsh-github-md-task' },
                h('span', { className: 'dsh-github-md-checkbox' }, checked ? '☑' : '☐'),
                h('span', null, rest)
              );
            }
            return h('li', { key: itemKey }, renderInline(item.children, itemKey));
          })
        );
      }
      case 'quote':
        return h('blockquote', { key, className: 'dsh-github-md-quote' }, renderInline(b.children, key));
      case 'hr':
        return h('hr', { key, className: 'dsh-github-md-hr' });
      default:
        return h('p', { key, className: 'dsh-github-md-p' }, renderInline(b.children, key));
    }
  });
}

/**
 * 估算一段 Markdown 渲染后的行数，用于决定是否折叠。
 *
 * 为什么用估算而不是测量 DOM：getBoundingClientRect 需要 ref + 二次渲染，
 * 在弹窗内会造成可见的布局抖动。按换行数 + 长行折行数估算已足够准确，
 * 且成本为零。阈值取保守值——宁可多折一次，也不要漏折导致内容淹没页面。
 */
export function estimateContentLines(src: string, charsPerLine = 80): number {
  if (typeof src !== 'string' || !src) return 0;
  let lines = 0;
  for (const raw of src.replace(/\r\n/g, '\n').split('\n')) {
    const len = raw.length;
    lines += len === 0 ? 1 : Math.ceil(len / charsPerLine);
  }
  return lines;
}
