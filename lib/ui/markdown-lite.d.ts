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
export interface MdInline {
    type: 'text' | 'code' | 'strong' | 'em' | 'link';
    text?: string;
    children?: MdInline[];
    href?: string;
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
 * 解析行内语法：`code` / **strong** / *em* / [text](url)。
 *
 * 用单遍扫描而非多次 replace 的原因：
 * 行内代码里的内容**不应再被解析**（`**a**` 是字面量），
 * 分段替换很容易把代码块内的星号也吃掉。手写扫描能保证优先级正确：
 * 行内代码 > 链接 > 粗体 > 斜体。
 */
export declare function parseInline(src: string): MdInline[];
/**
 * 把 Markdown 源文本解析为块级 AST。
 *
 * 纯函数、无 I/O，可被单测直接覆盖——这是把「渲染正确性」从浏览器里
 * 剥离出来断言的关键。任何异常输入都返回空数组，绝不抛错。
 */
export declare function parseMarkdownBlocks(src: string): MdBlock[];
/**
 * 把 AST 渲染为 React 元素数组。
 *
 * @param h React.createElement
 * @param blocks parseMarkdownBlocks 的产物
 */
export declare function renderMarkdownBlocks(h: any, blocks: MdBlock[]): any[];
/**
 * 估算一段 Markdown 渲染后的行数，用于决定是否折叠。
 *
 * 为什么用估算而不是测量 DOM：getBoundingClientRect 需要 ref + 二次渲染，
 * 在弹窗内会造成可见的布局抖动。按换行数 + 长行折行数估算已足够准确，
 * 且成本为零。阈值取保守值——宁可多折一次，也不要漏折导致内容淹没页面。
 */
export declare function estimateContentLines(src: string, charsPerLine?: number): number;
