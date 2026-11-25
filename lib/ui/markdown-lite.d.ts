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
export declare function isRenderableImageSrc(src: unknown): boolean;
export declare function parseInline(src: string, depth?: number): MdInline[];
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
