/**
 * 仓库审查规则（AGENTS.md）与严重度前缀：纯函数模块。
 *
 * 为什么单独一个模块：
 * 1. 规则必须来自**仓库自身**（Codex 的做法），不是插件内置偏好——内置偏好等于
 *    把作者的品味强加给每个仓库；
 * 2. 纯函数才能被测试真正覆盖：只有 `readReviewRules` 一处 I/O，截取与归一化全部可单测；
 * 3. 本文件只被服务端工具层消费（不在 `lib/ui/` 里，不参与客户端 bundle 内联），
 *    因此可以正常使用 node 内置模块。
 */
/** 严重度档位。缺省视为 P2——「没说优先级」不等于「不重要」，但也不该冒充 P0 */
export type Severity = 'P0' | 'P1' | 'P2';
/**
 * 从 Markdown 里截取指定二级标题下的内容。
 *
 * 边界规则（这是本函数存在的全部理由）：
 * - 标题行必须是 `## <title>` 或 `## <title> ...`（大小写不敏感，允许尾随空格）；
 * - 内容到**下一个同级或更高级标题**（`## ` 或 `# `）为止；
 * - 代码块里的 `## ` 不算标题（``` 围栏内跳过），否则规则里贴一段 diff 就会截断；
 * - 找不到标题返回 null（调用方据此判定「该文件没有规则段」）。
 */
export declare function extractSection(md: string, title: string): string | null;
/**
 * 给审查意见补严重度前缀。
 *
 * 为什么「只补不删」：
 * - 已有 `[P0]/[P1]/[P2]` 原样保留（作者/上游工具的判断优先，插件不覆盖）；
 * - 缺失才前置 `[P2]`；
 * - **绝不降级**：`[P0]` 永远不会被改成 `[P2]`。一条审查意见的优先级是写它的人的
 *   语义判断，插件没有资格改写。
 *
 * 幂等：`normalizeSeverity(normalizeSeverity(x)) === normalizeSeverity(x)`。
 */
export declare function normalizeSeverity(body: string): string;
/** 统计一组审查意见的严重度分布（返回给调用方做汇总，不改变内容） */
export declare function summarizeSeverity(bodies: string[]): Record<Severity, number>;
/** 一份规则文件（来源路径 + 原文） */
export interface ReviewRuleSource {
    /** 相对工作区的路径（`AGENTS.md` 或 `src/ui/AGENTS.md`） */
    path: string;
    /** 规则正文（已去掉标题行） */
    content: string;
}
export interface ReviewRulesResult {
    sources: ReviewRuleSource[];
    /** 是否因体积上限被裁剪（裁剪本身必须显式，不能静默少给） */
    truncated: boolean;
}
/**
 * 读取工作区的审查规则。
 *
 * 查找顺序：仓库根 `AGENTS.md` → 每个变更文件所在目录就近 `AGENTS.md`（向上回溯，
 * 去重）。就近规则排在后（越具体越靠后，便于人按顺序读）。
 *
 * 全部读不到时返回 `null`——调用方据此**不加** `reviewRules` 字段（而不是给个空对象），
 * 这样「没规则」与「规则为空」在输出里可区分。
 */
export declare function readReviewRules(cwd: string, changedPaths?: string[]): ReviewRulesResult | null;
/** 把规则渲染成人类与 Agent 都能读的 Markdown 段落（无规则时返回空串） */
export declare function renderReviewRules(rules: ReviewRulesResult | null): string;
