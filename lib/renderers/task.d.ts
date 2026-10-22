/**
 * `github_task` 的 Markdown 渲染器。
 *
 * 为什么单独渲染而不是 JSON 直出：原语的返回值是「给模型看的结论包」，
 * 其中 `cost` 与 `truncated` 是审计信息、`facts` 是结构化事实。
 * 直接 JSON.stringify 会把最重要的 `summary` 埋在括号里；
 * 而只渲染 summary 又会丢掉「这次花了多少」——两者都要，但要有主次。
 */
export declare function renderTaskMarkdown(args: any, value: any): string;
