/**
 * 轻量 Markdown 解析与 React 渲染（零依赖）。
 *
 * 为什么必须自己写：本插件没有前端 dependencies，bundle 机制只内联
 * lib/ui/*.js 且不做 import 解析，因此 marked / markdown-it 都无法引入。
 * 服务端的 src/renderers/* 只产出给模型看的 Markdown 文本，不能复用为 DOM。
 *
 * 设计取舍：
 * - 只支持 GitHub PR/Issue 实际会用到的语法子集（标题/粗斜体/行内码/
 *   围栏代码块/列表/引用/分隔线/链接）。表格、图片、内嵌 HTML 明确不做。
 * - 无法识别的语法**降级为纯文本**，绝不抛错——弹窗是只读展示，
 *   因为一段奇怪文本崩掉整块内容是不可接受的。
 * - 全程 React.createElement，**从不使用 dangerouslySetInnerHTML**：
 *   用户写的 <script> 会被当作纯文本渲染，天然免疫 XSS。
 */
/**
 * 链接协议白名单。
 *
 * 为什么必须白名单：Markdown 的链接目标是**用户可控文本**。
 * `[点我](javascript:alert(1))` 若直接渲染成 href，点击即执行脚本。
 * 只放行 http/https/mailto，其余降级为纯文本（保留文字，不生成 <a>）。
 */
function isSafeHref(href) {
    if (typeof href !== 'string')
        return false;
    const trimmed = href.trim();
    if (!trimmed)
        return false;
    if (/^(https?:\/\/|mailto:)/i.test(trimmed))
        return true;
    // 站内相对路径（如 /owner/repo/issues/1）视为安全，但必须以单个 / 开头
    if (/^\/(?!\/)/.test(trimmed))
        return true;
    return false;
}
/**
 * 解析行内语法：`code` / **strong** / *em* / [text](url)。
 *
 * 用单遍扫描而非多次 replace 的原因：
 * 行内代码里的内容**不应再被解析**（`**a**` 是字面量），
 * 分段替换很容易把代码块内的星号也吃掉。手写扫描能保证优先级正确：
 * 行内代码 > 链接 > 粗体 > 斜体。
 */
export function parseInline(src) {
    const out = [];
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
        // ---- 链接：[text](url) ----
        if (ch === '[') {
            const closeBracket = text.indexOf(']', i + 1);
            if (closeBracket > i && text[closeBracket + 1] === '(') {
                const closeParen = text.indexOf(')', closeBracket + 2);
                if (closeParen > closeBracket) {
                    const label = text.slice(i + 1, closeBracket);
                    const href = text.slice(closeBracket + 2, closeParen);
                    flush();
                    if (isSafeHref(href)) {
                        out.push({ type: 'link', href: href.trim(), children: [{ type: 'text', text: label }] });
                    }
                    else {
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
function matchFence(line) {
    const m = /^\s*(```+|~~~+)\s*([A-Za-z0-9_+-]*)\s*$/.exec(line);
    if (!m)
        return null;
    return { fence: m[1], lang: m[2] || '' };
}
/** 判断一行是否是列表项，返回 { marker, content, ordered } 或 null */
function matchListItem(line) {
    const m = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(line);
    if (!m)
        return null;
    return { marker: m[2], content: m[3], ordered: /\d+\./.test(m[2]) };
}
/**
 * 把 Markdown 源文本解析为块级 AST。
 *
 * 纯函数、无 I/O，可被单测直接覆盖——这是把「渲染正确性」从浏览器里
 * 剥离出来断言的关键。任何异常输入都返回空数组，绝不抛错。
 */
export function parseMarkdownBlocks(src) {
    const blocks = [];
    if (typeof src !== 'string' || !src.trim())
        return blocks;
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
            const codeLines = [];
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
            const quoteLines = [];
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
            const items = [];
            while (i < lines.length) {
                const item = matchListItem(lines[i]);
                if (!item || item.ordered !== ordered)
                    break;
                items.push({ marker: item.marker, children: parseInline(item.content) });
                i++;
            }
            blocks.push({ type: 'list', ordered, items });
            continue;
        }
        // ---- 段落：连续非空行合并 ----
        const paraLines = [];
        while (i < lines.length) {
            const cur = lines[i];
            if (!cur.trim())
                break;
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
        }
        else {
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
export function renderMarkdownBlocks(h, blocks) {
    if (!Array.isArray(blocks))
        return [];
    const renderInline = (nodes, keyPrefix) => {
        if (!Array.isArray(nodes))
            return [];
        return nodes.map((n, idx) => {
            const key = `${keyPrefix}-${idx}`;
            switch (n.type) {
                case 'code':
                    return h('code', { key, className: 'dsh-github-md-inline-code' }, n.text ?? '');
                case 'strong':
                    return h('strong', { key }, renderInline(n.children, key));
                case 'em':
                    return h('em', { key }, renderInline(n.children, key));
                case 'link':
                    return h('a', {
                        key,
                        href: n.href,
                        target: '_blank',
                        rel: 'noopener noreferrer',
                        className: 'dsh-github-md-link',
                    }, renderInline(n.children, key));
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
                return h('pre', { key, className: 'dsh-github-md-pre' }, h('code', { className: b.lang ? `language-${b.lang}` : undefined }, b.text ?? ''));
            case 'list': {
                const tag = b.ordered ? 'ol' : 'ul';
                return h(tag, { key, className: 'dsh-github-md-list' }, (b.items || []).map((item, ii) => {
                    const itemKey = `${key}-${ii}`;
                    // 任务列表：- [ ] / - [x]
                    const raw = (item.children || []).map((c) => c.text || '').join('');
                    const task = /^\[( |x|X)\]\s*/.exec(raw);
                    if (task) {
                        const checked = task[1].toLowerCase() === 'x';
                        const rest = raw.replace(/^\[( |x|X)\]\s*/, '');
                        return h('li', { key: itemKey, className: 'dsh-github-md-task' }, h('span', { className: 'dsh-github-md-checkbox' }, checked ? '☑' : '☐'), h('span', null, rest));
                    }
                    return h('li', { key: itemKey }, renderInline(item.children, itemKey));
                }));
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
export function estimateContentLines(src, charsPerLine = 80) {
    if (typeof src !== 'string' || !src)
        return 0;
    let lines = 0;
    for (const raw of src.replace(/\r\n/g, '\n').split('\n')) {
        const len = raw.length;
        lines += len === 0 ? 1 : Math.ceil(len / charsPerLine);
    }
    return lines;
}
