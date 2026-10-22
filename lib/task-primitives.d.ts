/**
 * 任务级原语的纯函数层：提交归类、SemVer 推导、预算裁剪、信封封装。
 *
 * 为什么单独成文件：
 * 1. 这三个原语的价值是「一轮拿到可执行结论」，结论对不对完全取决于归类与裁剪
 *    这些纯逻辑——它们必须能脱离网络单测，否则只能靠"跑一次看看"验证；
 * 2. `cost` 是原语存在的唯一判据（是否真的比手动串步骤省钱），必须由代码计算，
 *    不能手写常量；
 * 3. 工具层只负责取数与编排，不承载判定规则。
 */
/** 任务原语的统一返回信封（见 s8 §2.1） */
export interface TaskEnvelope<T> {
    /** 一段人类可读的结论，≤1.5KB */
    summary: string;
    /** 结构化事实（字段受控） */
    facts: T;
    /** 任何裁剪都必须显式 */
    truncated?: {
        fields: string[];
        reason: string;
        /** 被裁掉的部分是否连总数都未知（true = 不要相信「就这些」） */
        totalUnknown: boolean;
    };
    /** 建议的下一步（可执行的具体调用） */
    nextActions: string[];
    /** 审计三元组：让每次调用都能被事后核对 */
    cost: {
        chars: number;
        ghCalls: number;
        elapsedMs: number;
    };
}
/** Conventional Commits 归类结果 */
export interface CommitGroups {
    breaking: string[];
    feat: string[];
    fix: string[];
    perf: string[];
    refactor: string[];
    docs: string[];
    other: string[];
}
/**
 * 按 Conventional Commits 归类提交标题。
 *
 * 判定优先级：`!` 破坏性标记 > 类型关键字。为什么先判 `!`：
 * `feat(api)!: drop v1` 既是 feat 也是 breaking，而它决定的是 **major** 版本，
 * 归到 feat 会让版本号少跳一级——这是发版事故里最常见的一种。
 */
export declare function classifyCommits(subjects: string[], bodies?: string[]): CommitGroups;
/** 解析 `v1.2.3` / `1.2.3` / `v1.2.3-rc.1` 形式的版本号 */
export declare function parseSemver(tag: string | null | undefined): {
    major: number;
    minor: number;
    patch: number;
} | null;
export type BumpKind = 'auto' | 'patch' | 'minor' | 'major';
/**
 * 推导下一个版本号。
 *
 * 无 tag 时按 `0.1.0` 起步（而不是 1.0.0）：新仓库的第一个版本不该被当成稳定 API。
 * `auto` 的判据：breaking → major，feat → minor，其余 → patch。
 */
export declare function suggestVersion(currentTag: string | null, groups: CommitGroups, bump?: BumpKind): {
    version: string;
    bump: Exclude<BumpKind, 'auto'>;
    reason: string;
};
/** 待裁剪的文件条目（patch 为可选 diff 正文） */
export interface BudgetFile {
    path: string;
    additions: number;
    deletions: number;
    patch?: string;
}
/**
 * 按字符预算挑选文件，保证「送进上下文的东西一定装得下」。
 *
 * 三条约束：
 * 1. **按变更量降序**取——大改动更可能是问题的所在，小改动先丢；
 * 2. 单个文件即使超预算也不硬塞（否则一个超大 diff 会把预算吃光，剩下的文件
 *    一个都看不到）。超预算的文件只保留 path/增删行数，patch 留空并计入 omitted；
 * 3. **条目数也要封顶**：60 个文件的元信息本身就有 3–4K 字符，只约束 patch 大小
 *    等于把「固定开销」排除在预算之外（实测整包因此超预算 4.8K）。超出条目上限的
 *    文件连元信息都不列，只计入 omitted。
 */
export declare function selectFilesByBudget(files: BudgetFile[], budgetChars: number, maxEntries?: number): {
    selected: BudgetFile[];
    omitted: number;
    chars: number;
};
/**
 * 封装信封并计算 `cost.chars`。
 *
 * `chars` 的口径是**最终返回给模型的那份 JSON 的字符数**（不含 cost 自身，
 * 否则会自指）。这样「原语是否省钱」才有可比的数字。
 */
export declare function finalizeEnvelope<T>(summary: string, facts: T, nextActions: string[], meta: {
    ghCalls: number;
    elapsedMs: number;
    truncated?: TaskEnvelope<T>['truncated'];
}): TaskEnvelope<T>;
/** 从日志片段里抽取 `path:line` 形态的定位锚点（供 diagnose_ci 汇总疑似文件） */
export declare function extractFileAnchors(text: string): Array<{
    file: string;
    line: number;
}>;
/** 把归类结果渲染成 Release notes 草稿（按类型分组，breaking 置顶） */
export declare function renderReleaseNotes(version: string, groups: CommitGroups): string;
