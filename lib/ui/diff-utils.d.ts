/**
 * Unified diff 的切分与路径归一（纯函数：零 React、零 IO）。
 *
 * 为什么单独成模块：提交详情要支持「点文件看该文件的 diff」，而一次 `git show` 拿到的是
 * 整包 patch，必须在前端按 `diff --git` 边界切段。切分规则（边界、重命名路径、二进制判定）
 * 是纯逻辑，抽出来才能脱离 DOM 单测；放进组件里就只能靠肉眼看界面。
 *
 * 为什么不改成「点一次查一次 `git show <sha> -- <path>`」：`git show --stat` 把重命名显示成
 * `src/{old => new}.ts`，拿它当 pathspec 必然查不到；带空格/引号的路径同样脆。整包 patch 的
 * `diff --git a/… b/…` 行才是权威来源，按它切分天然免疫这些形态。
 */
export interface PatchSection {
    /** b 侧路径（重命名后的新路径） */
    path: string;
    /** 仅重命名块有值（a 侧旧路径） */
    oldPath?: string;
    /** 该文件的完整补丁块（含 diff --git / index / --- / +++ / hunk 全部行） */
    text: string;
    isBinary: boolean;
    additions: number;
    deletions: number;
}
/**
 * 解析 `diff --git a/<old> b/<new>` 头行。
 *
 * 路径含空格时这行本身是有歧义的（`a/a b.txt b/a b.txt`），所以按**最后一个** ` b/` 切：
 * a 侧取前缀，b 侧取剩余全部——b 侧是我们要的路径，尾部截断不会丢字符。
 */
export declare function parseDiffGitLine(line: string): {
    aPath: string;
    bPath: string;
} | null;
/**
 * 把 `--stat` 里的重命名写法归一成新路径：
 * - `src/{old => new}.ts` → `src/new.ts`
 * - `old/name.ts => new/name.ts` → `new/name.ts`
 * 非重命名原样返回。
 */
export declare function normalizeRenamePath(raw: string): string;
/**
 * 按 `diff --git` 边界把整包 patch 切成逐文件块。
 * 首个 `diff --git` 之前的内容（如 `--format=` 漏配时的提交头）直接丢弃：
 * 它们不属于任何文件，混进第一段会污染差异渲染。
 */
export declare function splitUnifiedPatch(patch: string): PatchSection[];
/**
 * 在切好的块里找目标文件。
 * 匹配优先级：新路径 → 旧路径 → 归一化后的重命名写法（`--stat` 的原始形态）。
 * 找不到返回 null，由调用方给「该文件在本次提交中无文本差异」的兜底文案。
 */
export declare function findPatchSection(sections: PatchSection[], targetPath: string): PatchSection | null;
