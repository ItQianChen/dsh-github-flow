import type { GitLocalStatus, GitCommitEntry, GitBranchesResult } from '../types.js';
/**
 * 解析 `git status -sb --porcelain` 输出为结构化状态。
 * 抽导出纯函数（parseGhVersion 同理）：三形态解析是易错边界区，单测钉死。
 *
 * 输出形态（实测）：
 *   `## master...origin/master [ahead 2, behind 1]`  有 ahead/behind
 *   `## master...origin/master`                       与远程同步
 *   `## master` / `## HEAD (no branch)`               无 upstream（ahead/behind 未知=-1）
 * 后续每行 `<XY> <path>` 为 porcelain 变更项（XY 两字符状态码，?? = untracked）。
 */
export declare function parseGitStatusOutput(output: string, maxFiles?: number): GitLocalStatus | null;
/**
 * 解析 `git log` 输出为提交条目数组。
 * 支持两种形态：
 * 1. 结构化带详情：%x1e 为 commit 间分隔符，%x1f 为字段间分隔符（含 fullSha/email/date/body/stat）；
 * 2. 简易管道符：%h|%an|%ar|%s 行格式（兼容旧单测输入）。
 * 空输出返回 []。
 */
export declare function parseGitLogLines(output: string): GitCommitEntry[];
/**
 * 解析 git branch -a --sort=-committerdate 格式化输出。
 * 格式为: %(refname:short)|%(HEAD)|%(upstream:short)|%(committerdate:relative)|%(objectname:short)|%(subject)
 */
export declare function parseGitBranchLines(output: string): GitBranchesResult;
/**
 * 解析 unified diff 输出，统计增删行数与区块数量。
 * 忽略 diff 文件头（--- 和 +++），仅统计真正的改动行（+ 与 -）。
 */
export declare function parseUncommittedDiff(rawDiff: string): {
    additions: number;
    deletions: number;
    hunksCount: number;
};
export interface GitStatFileInfo {
    path: string;
    total: number;
    additions: number;
    deletions: number;
    isBinary: boolean;
    rawRight?: string;
}
export interface GitStatSummary {
    filesChanged: number;
    insertions: number;
    deletions: number;
}
export interface GitStatParsedResult {
    files: GitStatFileInfo[];
    summary: GitStatSummary | null;
}
/**
 * 解析 `git show --stat` 或 `git log --stat` 的统计文本为结构化列表与增删数字。
 * 能够从 `19 ++++++++++++++++++-` 精准推导 additions=18, deletions=1，
 * 提取文件路径与 `X files changed, Y insertions(+), Z deletions(-)` 汇总。
 */
export declare function parseGitStatText(statText: string): GitStatParsedResult | null;
