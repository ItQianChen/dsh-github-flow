/**
 * 破坏性操作声明表 + 统一闸门。
 *
 * 为什么要有这张表：同一个「拦截 → 返回影响评估 → 要求 confirm: true」的模式在
 * 16 个 (工具, action) 上各写了一遍。任何一处忘写就是漏洞，而漏洞是**看不见的**
 * （工具照常返回成功，没人知道本该拦一次）。表化之后「没有条目 = 没有闸门」可以
 * 一眼审完，并且能被测试穷举。
 *
 * 拦截点收在一处实现（`wrapWithGate`），由每个工具的工厂函数返回时套上——见文件末尾该函数的注释。`src/tools/` 里不再保留任何一行闸门代码。
 *
 * ⚠️ 与旧实现的一处已知差异：`cache delete` / `issue transfer` / `label delete` 的
 * 旧文案里内插了**运行时解析出的仓库名**（`repoTarget`）。注册期拿不到它（要额外打
 * 一次 `gh repo view`），因此文案改为不内插仓库名。渲染层只消费
 * warning/impact/requiredAction 三个字段，不消费 repo，故输出形态无变化。
 */
/** 闸门状态字面量的唯一来源：工具层与渲染层都引用它，不再各写一遍字符串。 */
export declare const GATE_BLOCKED: 'AWAITING_CONFIRMATION';
export interface GatePayload {
    status: typeof GATE_BLOCKED;
    warning: string;
    impact: string;
    requiredAction: string;
    /** 部分工具额外回显的定位字段（action / name / gist_id / cache_id / key / all） */
    [key: string]: unknown;
}
interface GateSpec {
    /**
     * 命中条件。缺省 = 该 action 恒拦。
     *
     * 为什么需要这个字段：`release upload` 只在 clobber 时危险、`skill publish` 只在
     * 正式发布时危险。条件写进表里，过滤逻辑就不再散落在各工具的分支里。
     * 同时用它表达「原实现里位于闸门之前的必填校验」——否则一个缺参数的调用会先拿到
     * 「请确认」而不是本该拿到的「必须提供 xxx」，那是行为回退。
     */
    when?: (args: any) => boolean;
    describe(args: any): GatePayload;
}
export declare const DESTRUCTIVE_ACTIONS: Record<string, Record<string, GateSpec>>;
/**
 * 统一闸门：命中则返回拦截载荷，否则返回 undefined。
 *
 * `confirm === true` 的判定放在这里而不是每个 describe 里——15 份重复的
 * `if (args.confirm !== true)` 正是这次要消掉的东西。
 */
export declare function guardDestructive(toolName: string, args: any): GatePayload | undefined;
/**
 * 用闸门包一层 execute（注册期唯一入口）。
 *
 * 为什么包在注册期而不是 `executor.run()`：`run()` 只看得见 argv，看不见
 * `action` / `confirm` 语义。把语义解析塞进 argv 层就是把简单问题复杂化。
 *
 * 保持 `name` / `description` / `parameters` / `output` 原样，只替换 `execute`，
 * 宿主侧的 schema 校验与渲染链路完全不受影响。
 */
export declare function wrapWithGate<T extends {
    name: string;
    execute: (...a: any[]) => any;
}>(tool: T): T;
export {};
