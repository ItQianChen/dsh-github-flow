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
/**
 * 提取 `.git/config` 中所有 `[remote "..."]` 段内的 url。
 *
 * 为什么必须按段扫描而不是全文抓 `url = `：`[submodule "..."]` 段同样带 url
 * （实测 `[submodule "lib"] url = https://github.com/x/y.git`）。全文正则会把
 * 子模块的远程算进指纹，导致一次 `git submodule add` 就触发整个面板缓存的
 * 无谓作废。子模块的 url 与本工作区关联哪个 GitHub 仓库毫无关系。
 *
 * 输出语义：保持文件中的出现顺序、已去重、不含空值。
 * 排序交给调用方（指纹需要稳定顺序，但那是调用方的语义，纯函数不该替它决定）。
 */
export declare function parseRemoteUrls(configText: string): string[];
/** 单个 remote 段的解析结果 */
export interface ParsedRemote {
    name: string;
    url: string;
}
/** `.git/config` + `HEAD` 的解析结果，是「这个工作区关联哪个仓库」的唯一事实源 */
export interface ParsedGitConfig {
    /** 每个 remote 名对应的第一个 url（身份解析用；同名多 url 时取首个） */
    remotes: ParsedRemote[];
    /**
     * 全部 remote url 行（指纹用）。
     *
     * 为什么与 remotes 分开：身份解析需要「remote 名 → url」的一对一映射，
     * 而指纹需要「配置里出现过的所有 url」。同一个 remote 允许写多行 url
     * （git 认首个，但配置确实是多行），若指纹也按名字去重，第二行 url 的
     * 变化就检测不到——那会让「用户改了备用 url」这种情况静默漏检。
     */
    allUrls: string[];
    /** 当前分支名（来自 HEAD 的 `ref: refs/heads/<name>`）；detached HEAD 时为 null */
    currentBranch: string | null;
    /** `branch.<currentBranch>.remote` 的值；无配置或无当前分支时为 null */
    branchRemote: string | null;
}
/**
 * 解析 `.git/config` 与 `HEAD`，产出与 git 语义一致的远程视图。
 *
 * 为什么把 HEAD 一起解析：`branch.<name>.remote` 的 `<name>` 是**当前分支**，
 * 不知道当前分支就无法按 git 的规则选出 remote，只能退化成「取第一个」——
 * 那正是本次要修的错误。
 *
 * @param configText `.git/config` 全文
 * @param headText   HEAD 文件全文。worktree 场景必须传**局部 gitdir** 下的那个，
 *                   传共享目录的会拿到主工作树分支名（实测两者不同）。
 */
export declare function parseGitConfig(configText: string, headText?: string | null): ParsedGitConfig;
/**
 * 按 git 的规则选出「这个工作区关联的 remote」。
 *
 * 优先级与 git 一致：
 *   1. `branch.<当前分支>.remote` —— 当前分支显式跟踪的 remote
 *   2. `origin`                  —— git 的默认远程
 *   3. 第一个 remote              —— 兜底（保持既有行为）
 *
 * 特殊值 `.` 表示跟踪**本地分支**而非远程（实测可设置），跳过第 1 级——
 * 拿 "." 去查 `[remote "."]` 必然查不到，且语义上它根本不是远程。
 */
export declare function resolveRemoteTarget(cfg: ParsedGitConfig): ParsedRemote | null;
/**
 * 从 remote url 中提取 GitHub 的 owner/repo。
 *
 * 覆盖形态（均实测于真实 clone / hand-written config）：
 *   https://github.com/o/r.git
 *   git@github.com:o/r.git
 *   ssh://git@github.com/o/r.git
 *   https://user:token@github.com/o/r.git
 *   带尾斜杠 / 不带 .git
 *
 * 非 github.com 的 host 一律返回 null（GHE 不在支持范围）。
 * 为什么绝不"猜一个"：错误身份比没有身份更有害——面板会显示一个
 * 用户根本不认识的仓库，且所有后续判断都建立在错误前提上。
 * 正则两端锚定，杜绝 `github.com.evil.com` 这类子串误匹配。
 */
export declare function parseGithubUrl(url: string): {
    owner: string;
    repo: string;
} | null;
