/**
 * DSH GitHub 插件核心数据类型定义
 */

export interface PluginConfig {
  /** GitHub CLI (gh) 可执行文件路径，默认 'gh' */
  ghPath?: string;
  /** 进程超时限制（毫秒），默认 30,000ms */
  defaultTimeoutMs?: number;
  /** 单次安全输出字符数上限（防止 Token 溢出），默认 24,000 */
  maxOutputChars?: number;
  /** 单次安全输出 UTF-8 字节数硬上限，默认 maxOutputChars × 4（防止中文按字符计数时实际放行字节数倍增） */
  maxOutputBytes?: number;
  /** Web API 概览数据缓存时长（毫秒），默认 15,000ms */
  cacheTtlMs?: number;
  /** 查询列表默认限制条数，默认 20 */
  defaultListLimit?: number;
  /**
   * 是否开启新版本自动检查提示，默认 true。
   * false 时熔断全部版本探测入口（Web 横幅/启动日志/概览数据），用户显式
   * 请求升级（如一键升级按钮）不受此限制——关闭的是「提示」，不是「能力」。
   */
  checkUpdate?: boolean;
  /** 检查更新间隔毫秒数，默认 86,400,000 (24小时) */
  updateCheckIntervalMs?: number;
  /** 自定义 npm Registry 镜像地址，留空则自动选用 npmmirror 与 npmjs */
  registryUrl?: string;
  /**
   * 是否向 gh 子进程注入 AI_AGENT='dsh' 环境变量，默认 true。
   * gh ≥2.99 检测该变量后切换 agent 专属行为（text-only spinner、误用时打印完整 help）；
   * 关闭后恢复 gh 原生行为（用于对照实验或偏好原生输出的场景）。
   */
  agentEnvInjection?: boolean;
  /**
   * 代理地址预置默认值（如 "http://127.0.0.1:7890"）。
   * 仅在用户未在驾驶舱保存过代理设置时生效；运行时 UI 保存的值优先级更高。
   * 注意：放在 Cordis Config 意味着修改此项会触发插件 reload（静态默认值，可接受）。
   */
  proxyUrl?: string;
  /**
   * 工具档位：控制注册给模型的工具数量（默认不填 = `full`，18 个全量，零破坏）。
   *
   * 三种预设 `core`（5 个）/ `ci`（7 个）/ `maintain`（8 个），也可直接写工具名
   * （如 `['github_pr','github_release']`）混用。未知名字会 console.warn 一次后忽略。
   * 存在的理由：18 个工具的 schema 常驻约 24,000 字符，等于每轮对话都在为用不到的工具付费。
   */
  toolsets?: string[];
  /**
   * 只读档位（默认 false）。
   *
   * 硬语义，不做运行时判断：写 action 在**注册期**就从 `enum` 里被剔除，模型连
   * 「可以写」都看不到，宿主参数校验会直接拒绝。`github_api`（端点与 method 均可任意，
   * 无法降级）在只读模式下整体剔除。
   */
  read_only?: boolean;
}

/** 数据同步与自动化感知偏好配置 */
export interface SyncSettings {
  /** 刷新策略三选一：'swr' 秒开并在首屏拉新 | 'auto' SWR秒开+云端定时轮询 | 'manual' 仅手动点击拉取 */
  strategy: 'swr' | 'auto' | 'manual';
  /** 云端定时同步周期（毫秒，不少于 300,000 即 5 分钟，默认 600,000 即 10 分钟） */
  cloudSyncIntervalMs: number;
  /** 是否开启本地 .git 监控（感知代码修改、暂存与分支切换，仅右侧栏当前工作区生效，默认开启，用户可取消勾选） */
  localGitWatch: boolean;
}

export interface GhExecutionOptions {
  /** 命令执行的工作目录，优先使用当前 Agent 会话所在的 Workspace 物理路径 */
  cwd?: string;
  /** 当前调用的会话 ID，用于精确关联物理工作区路径 */
  sessionId?: string;
  /** 进程超时限制（毫秒），默认 30,000ms */
  timeoutMs?: number;
  /** 附加环境变量 */
  env?: NodeJS.ProcessEnv;
  /** 是否强制以纯文本形式返回，不进行 JSON 尝试解析 */
  rawText?: boolean;
  /**
   * 二进制输出模式：stdout 保持 Buffer 原样返回（不做 UTF-8 转换与截断）。
   * 用于 gh api 下载图片/附件等字节流场景；GhResult.data 此时是 Buffer。
   */
  binary?: boolean;
  /**
   * 写入子进程标准输入的内容。
   * 为什么需要：gh secret set 不带 -b 时从 stdin 读取密文，这是唯一不把敏感值
   * 暴露在进程命令行（ps / 任务管理器 / 审计日志可见）的传入通道。
   */
  stdin?: string;
  /**
   * 单次调用的输出字符上限覆盖（默认沿用实例配置的 maxOutputChars=24000）。
   *
   * 为什么需要按调用覆盖：这个默认值是按「喂给模型上下文的工具输出」调校的，
   * 目的是防 Token 爆窗。但有些输出是**程序化消费**的——例如 PR 全量 Unified Diff
   * 会被切片成按文件索引、前端一次只渲染一个文件，永远不会整段进模型上下文。
   * 对这类调用沿用 24KB 会静默截断真实数据（实测一个普通 PR 的 diff 已达 39KB，
   * 被截断后后半数文件点开皆空）。消费者不同，阈值就该不同。
   */
  maxOutputChars?: number;
  /** 单次调用的输出 UTF-8 字节上限覆盖，语义同 maxOutputChars */
  maxOutputBytes?: number;
}

export interface GhResult<T = unknown> {
  ok: boolean;
  data?: T;
  rawOutput?: string;
  error?: string;
  /** 是否因超出安全阈值而被截断 */
  truncated?: boolean;
  /** 二进制模式下的字节长度（data 为 Buffer 时存在） */
  binaryBytes?: number;
  /**
   * 失败语义分类（仅 ok=false 时存在）。
   *
   * 为什么挂在结果上而不是让调用方自己 parse error 文本：调用方散落在
   * 各工具与路由里，重复实现文本匹配必然漂移；分类规则只应有一份事实源
   * （src/executor/error-classifier.ts）。上层据此决定「重试 / 回退快照 / 直接降级」。
   */
  errorKind?: 'transient' | 'deterministic' | 'unknown';
  /**
   * 权限不足时的可操作处置指引（仅 errorKind=deterministic 且命中权限特征时存在）。
   *
   * 为什么单独成字段而不直接拼进 error：error 是「发生了什么」，
   * 这是「接下来怎么做」。工具层可以选择只抛 error（静默场景）
   * 或把两者一起抛给模型（需要模型自愈的场景）。
   */
  permissionRemedy?: string;
}

export interface AuthInstallGuide {
  /** 推荐包管理器命令，例如 Windows 下 "winget install --id GitHub.cli" */
  command: string;
  /** 备选命令（如 choco/scoop/brew） */
  altCommand?: string;
  /** 官方下载与安装文档链接 */
  downloadUrl: string;
  /** 简明指引提示 */
  description?: string;
}

export interface AuthStatus {
  installed: boolean;
  loggedIn: boolean;
  platform?: string;
  user?: string;
  host?: string;
  activeAccount?: boolean;
  protocol?: string;
  scopes?: string[];
  installGuide?: AuthInstallGuide;
  raw?: string;
  /** 网络是否发生异常（超时、DNS解析失败、连接被拒、代理阻断等） */
  networkError?: boolean;
  /** 网络异常的人类可读原因或排查建议 */
  networkErrorReason?: string;
  /** 本地是否已检测到持久化凭据（如 hosts.yml 或 Keyring） */
  hasLocalToken?: boolean;
}

/**
 * 当前账号对仓库的权限档位（gh `viewerPermission` 字段的取值域）。
 * 只读（READ / TRIAGE）意味着任何写操作都会被 GitHub 拒绝，
 * UI 应据此在操作前给出提示，而不是让用户点了才吃 403。
 */
export type ViewerPermission = 'ADMIN' | 'MAINTAIN' | 'WRITE' | 'TRIAGE' | 'READ';

/**
 * 工作区的远程布局分类（离线解析得出，用于确定「该用哪个 remote 的身份」）。
 *
 * 为什么要分类：混合布局下若按 `.git/config` 的书写顺序选 remote，
 * 同一个工作区在两次 `git remote` 操作后可能解析出不同仓库。
 * 分类后每种布局的处置规则固定，与书写顺序无关。
 */
export type RepoLayoutKind =
  /** 全部 remote 都是 github.com */
  | 'github-only'
  /** 含 GitHub remote，但 git 选中的那个不是 GitHub */
  | 'github-mixed'
  /** 无任何 GitHub remote（全 GHE 或其他 host） */
  | 'no-github'
  /** 无 remote */
  | 'no-remote';

/**
 * 关联仓库角色标识：
 * - fork: 属于当前登录用户的个人复刻仓库
 * - upstream: 社区上游主干仓库（名为 upstream 或作为 parent）
 * - origin: 默认 origin 远程仓库
 * - parent: 上游源仓库（在线识别自 repo.parent，本地尚未添加 remote）
 * - remote: 其他自定义名称的远程仓库
 */
export type AssociatedRepoRole = 'origin' | 'upstream' | 'fork' | 'parent' | 'remote';

/**
 * 当前工作区可切换的关联 GitHub 仓库项（供仓库切换器下拉菜单消费）。
 */
export interface AssociatedRepoItem {
  nameWithOwner: string;
  remoteName?: string;
  url: string;
  isCurrent: boolean;
  role: AssociatedRepoRole;
}

export interface RepoMetadata {
  nameWithOwner: string;
  name: string;
  owner: string;
  defaultBranch: string;
  currentBranch?: string;
  description?: string;
  isPrivate?: boolean;
  url?: string;
  stargazerCount?: number;
  forkCount?: number;
  /** 是否为 fork（影响 star 取谁、是否提示可查看上游） */
  isFork?: boolean;
  /**
   * fork 的上游。
   * gh 的 `parent` 只返回骨架（id/name/owner.login），nameWithOwner 需自行拼接；
   * 上游 star 数拿不到（`--json` 不支持嵌套子字段），故此处不含热度字段。
   */
  parent?: { nameWithOwner: string; url?: string };
  /**
   * 当前账号对该仓库的权限。
   * 离线解析时为 undefined——**不猜测**：猜错会导致 UI 给出错误的操作许可。
   */
  viewerPermission?: ViewerPermission;
  /** 远程布局分类（仅离线解析产生，供 UI 与诊断区分场景） */
  layout?: RepoLayoutKind;
  /**
   * 当前工作区可供用户手动切换的关联仓库列表。
   * 包含：本地 Git 配置的全部 GitHub remote (origin, upstream 等) 及在线 parent。
   * 仅当数量 > 1 时 UI 渲染切换控件，单仓库场景保持零噪音。
   */
  associatedRepos?: AssociatedRepoItem[];
}

/** Git 分支详情项（供分支切换器下拉列表消费） */
export interface GitBranchItem {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  upstream?: string;
  shortSha: string;
  subject: string;
  relativeTime: string;
}

export interface GitBranchesResult {
  current: string;
  branches: GitBranchItem[];
}

/**
 * 本地 Git 工作区状态快照（ahead/behind 是 remote-tracking ref 的「上次 fetch」视图，
 * 非实时网络状态——UI 渲染时必须带上这一语义提示，否则会误导用户）。
 */
export interface GitLocalStatus {
  branch: string;
  /** 领先远程的提交数；无 upstream 时为 -1（未知） */
  ahead: number;
  /** 落后远程的提交数；无 upstream 时为 -1（未知） */
  behind: number;
  /** 未提交变更文件数（含 untracked） */
  dirtyCount: number;
  hasUpstream: boolean;
  /** 未提交文件清单（porcelain 解析，截断前 20 条防快照膨胀） */
  dirtyFiles: Array<{ status: string; path: string }>;
}

/**
 * 工作区干净度闸门结果（`executor.ensureCleanWorkspace`）。
 *
 * 为什么要有 `reason: 'unknown'`：`getLocalGitStatus()` 在 git 不可用或非仓库时返回 null。
 * 旧实现用 `if (gitSt && gitSt.dirtyCount > 0)` 判断，null 时表达式为假 → 闸门静默放行。
 * 安全闸门不能因为「读不到状态」而失效，所以这里把「读不到」与「干净」显式区分开。
 */
export type WorkspaceCleanResult =
  | { ok: true; dirtyCount: 0; samples: string[] }
  | { ok: false; reason: 'dirty' | 'unknown'; dirtyCount: number; samples: string[]; error: string };

/** 单条提交记录（结构化解析） */
export interface GitCommitEntry {
  sha: string;
  fullSha?: string;
  author: string;
  email?: string;
  date?: string;
  /** git 的相对时间原文（如 "2 hours ago"）——本地化由渲染层处理 */
  relative: string;
  subject: string;
  body?: string;
  stat?: string;
}

/**
 * 本地 Git 提交记录三段视图（与 GitLocalStatus 的 ahead/behind 计数同口径，
 * 均为 remote-tracking 快照）。
 */
export interface GitCommitLog {
  /** 本地领先远程的提交（待 push） */
  aheadCommits: GitCommitEntry[];
  /** 远程领先本地的提交（待 pull，快照口径） */
  behindCommits: GitCommitEntry[];
  /** 最近提交（默认 15 条，支持下滚分页） */
  recent: GitCommitEntry[];
  /** 仓库总提交数（rev-list --count HEAD） */
  totalCount?: number;
}

export interface PrItem {
  number: number;
  title: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  author?: { login: string; avatarUrl?: string };
  headRefName: string;
  baseRefName: string;
  isDraft: boolean;
  mergeable?: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
  reviewDecision?: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED';
  statusCheckRollup?: Array<{
    name: string;
    status: string;
    conclusion: string;
  }>;
  url: string;
  updatedAt: string;
}

/** PR 变动文件详情项 */
export interface PrFileItem {
  path: string;
  additions: number;
  deletions: number;
  changeType?: string; // 'MODIFIED' | 'ADDED' | 'DELETED' | 'RENAMED'
}

/** PR 评论项 */
export interface PrCommentItem {
  id: string;
  author: { login: string; avatarUrl?: string };
  authorAssociation?: string;
  body: string;
  createdAt: string;
  url: string;
}

/** PR 审查记录项 */
export interface PrReviewItem {
  id: string;
  author: { login: string };
  state: string; // 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING'
  body: string;
  submittedAt: string;
}

/**
 * PR 行级审查评论项（代码行上的评论，区别于 Issue 级讨论）。
 *
 * 为什么必须单列：`gh pr view --json comments` 只返回**对话区**的 issue-level 评论，
 * 完全不包含挂在具体代码行上的 review comment。实测 cli/cli#14752 有 10 条行级评论，
 * 而 `--json comments` 一条都拿不到——必须走
 * `GET /repos/{owner}/{repo}/pulls/{number}/comments` 独立通道。
 *
 * 不做的部分：不把评论按行号精确嵌进 diff 的 hunk 中间（需反查 hunk 偏移，
 * 多行/折叠上下文下极易错位）。改为在文件级 diff 下方按行号列出，信息完整且确定。
 */
export interface PrLineCommentItem {
  id: string;
  /** 所属文件路径，与 fileDiffs 的键一致 */
  path: string;
  /** 评论锚定的行号（新文件侧）；纯删除行可能为 null */
  line: number | null;
  side?: string;
  author: { login: string };
  body: string;
  createdAt: string;
}

/** PR 完整详情与差异数据契约（供 PrDetailModal 在线审阅消费） */
export interface PrDetailData {
  number: number;
  title: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  isDraft: boolean;
  url: string;
  createdAt: string;
  updatedAt: string;
  author: { login: string; avatarUrl?: string };
  headRefName: string;
  baseRefName: string;
  /**
   * 分支尖端的 commit SHA。
   *
   * 为什么必须透出：分支名会移动（force-push / 新提交），拿它当审查锚点等于
   * 「我审的到底是哪一版」永远说不清。SHA 是不可移动的事实源，也是行级评注
   * 写入时 `commit_id` 的取值来源。
   */
  headRefOid?: string;
  baseRefOid?: string;
  headRepoOwner?: string;
  body: string;
  reviewDecision?: string;
  statusCheckRollup?: any;
  additions: number;
  deletions: number;
  files: PrFileItem[];
  comments: PrCommentItem[];
  reviews: PrReviewItem[];
  /**
   * 行级审查评论（挂在具体代码行上的 review comment）。
   * 与 comments 是**两套独立数据源**：comments 来自对话区，lineComments 来自
   * /pulls/{n}/comments。拉取失败时降级为空数组，不阻塞主详情。
   */
  lineComments?: PrLineCommentItem[];
  /** 按文件相对路径切片索引的 Git Unified Diff 字典 */
  fileDiffs: Record<string, string>;
  /**
   * 为什么不回传 fullDiff 原文：`fileDiffs` 已经是全量 diff 的等价切分
   * （每段拼起来就是原文），再附带一份原文会让 HTTP 响应体整整翻倍。
   * 实测一个普通 PR 的 diff 就有 39KB，2MB 上限下翻倍意味着 4MB JSON——
   * 白占带宽、白占浏览器内存、白耗 JSON.parse 时间，且没有任何消费方。
   * 原文仅在服务端用于切片，切片完即丢弃。
   */
  /**
   * diff 是否被输出阈值截断。
   * 为什么必须透出：超巨量 PR 仍可能触顶，此时部分文件拿不到 diff。
   * 静默展示「该文件无差异」会让用户误以为代码没改动——必须显式提示。
   */
  diffTruncated?: boolean;
  /**
   * PR 实际变更的文件总数（来自 `gh pr view --json changedFiles`）。
   *
   * 为什么必须与 `files.length` 分开：`gh pr view --json files` 在 100 条处
   * **静默截断**（cli/cli#12522），`files.length` 只是「返回了几条」。
   * 把两者混为一谈，界面就会把「被截断」说成「就这么多」。
   */
  changedFiles?: number;
  /** `files` 清单是否被 gh 的 100 条上限截断（`files.length < changedFiles`） */
  filesTruncated?: boolean;
  /**
   * 是否有文件**没拿到 diff 正文**（该文件在 `files` 里但 `fileDiffs` 无对应切片）。
   *
   * 与 `diffTruncated` 是并列而非同一概念：
   * - `diffTruncated`：整个 diff 输出被阈值裁掉（原因在传输层）；
   * - `diffIncomplete`：清单里有这个文件、但切片里没有它（原因在数据缺失）。
   * 两者处置不同（一个是「去看完整 diff」，一个是「这个文件没取到」），不能合并。
   */
  diffIncomplete?: boolean;
}

/**
 * Issue 分类维度契约：
 * - reported: 用户提起的（他人向我名下项目或本仓库提交的 Issue 反馈）
 * - assigned: 分配给我的（指派给当前账号的待办任务，跨仓库通用）
 * - created: 我创建的（由当前账号亲自发起的 Issue）
 */
export type IssueCategory = 'reported' | 'assigned' | 'created';

/** Issue 评论项（在线查看弹窗的讨论时间线消费） */
export interface IssueCommentItem {
  id: string;
  author: { login: string; avatarUrl?: string };
  authorAssociation?: string;
  body: string;
  createdAt: string;
  url: string;
  /**
   * GitHub 侧被折叠/隐藏的评论（垃圾、攻击性内容等）。
   * 为什么必须透出：实测 cli/cli#1 的评论带 `isMinimized: true, minimizedReason: "SPAM"`，
   * 若照常渲染成普通讨论，用户会把垃圾内容当成真实技术意见。
   */
  isMinimized?: boolean;
  minimizedReason?: string;
  includesCreatedEdit?: boolean;
}

/**
 * Issue 关联的 PR 引用。
 *
 * 字段集受限于 gh 的实际返回：实测 `gh issue view --json closedByPullRequestsReferences`
 * 的节点只有 `id / number / repository / url`，**没有 title 与 state**。
 * UI 因此只渲染 `#number` 链接，不得假设更多字段存在。
 */
export interface IssueLinkedPrRef {
  number: number;
  url: string;
  /** `owner/repo`；跨仓关联时与 Issue 自身仓库不同 */
  repository?: string;
}

/** Issue 里程碑（实测形态：number/title/description/dueOn，无 state） */
export interface IssueMilestoneInfo {
  number?: number;
  title: string;
  /** ISO 时间；未设置截止日时为缺省 */
  dueOn?: string;
}

/** 子议题完成度摘要（gh `subIssuesSummary` 的直接映射） */
export interface IssueSubIssuesSummary {
  completed: number;
  total: number;
}

/**
 * Issue 完整详情数据契约（供 IssueDetailModal 在线查看消费）。
 *
 * 为什么不复用 `IssueItem`：列表项只需要渲染一行卡片，字段刻意精简；
 * 详情需要正文、评论时间线、里程碑、子议题等重字段，混在一起会让
 * 全局概览的缓存与快照体积翻数倍（每条 Issue 都拖着全部评论）。
 */
export interface IssueDetailData {
  number: number;
  title: string;
  state: 'OPEN' | 'CLOSED';
  /** COMPLETED / NOT_PLANNED / REOPENED / ''（实测空串形态存在） */
  stateReason?: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  author: { login: string; avatarUrl?: string };
  body: string;
  labels: Array<{ name: string; color?: string; description?: string }>;
  assignees: Array<{ login: string }>;
  milestone?: IssueMilestoneInfo;
  isPinned?: boolean;
  issueType?: string;
  comments: IssueCommentItem[];
  linkedPrs: IssueLinkedPrRef[];
  subIssues?: IssueSubIssuesSummary;
  /**
   * 正文与评论中识别到的图片 URL（与 github_issue(view_images) 同源提取）。
   *
   * 为什么只给清单不在弹窗内联渲染：图片可能来自任意 https 外域，
   * 在面板里直接 `<img src>` 会把宿主页面 Referer/来源暴露给第三方，
   * 也绕过了插件的域名白名单防线。UI 只展示「附件 N 张」并给外链。
   */
  images: string[];
  /**
   * 是否发生过字段集降级。
   * 为什么需要：老版本 gh 遇到未知 JSON 字段会整体失败（实测
   * `Unknown JSON field: "closedAt"`），此时回退到 BASE 字段集重试；
   * 该标记供排查「为什么没看到里程碑/关联 PR」这类差异，不弹错。
   *
   * 注意：不设 truncated 标记——响应被输出阈值截断时 executor 直接返回
   * `ok:false` + 浏览器直达链接，绝不会产出「零评论」的空详情对象，
   * 因此该失败语义不需要在数据契约里再表达一次。
   */
  fieldsDegraded?: boolean;
}

export interface IssueStats {
  total: number;
  reported: number;
  assigned: number;
  created: number;
}

export interface IssueItem {
  number: number;
  title: string;
  state: 'OPEN' | 'CLOSED';
  author: { login: string };
  labels: Array<{ name: string; color: string }>;
  assignees: Array<{ login: string }>;
  url: string;
  updatedAt: string;
  /** 命中的所有身份分类 */
  categories?: IssueCategory[];
}

export interface WorkflowRunItem {
  databaseId: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: 'success' | 'failure' | 'cancelled' | 'skipped';
  event: string;
  headBranch: string;
  url: string;
  createdAt: string;
}

export interface GitHubOverviewData {
  auth: AuthStatus;
  repo?: RepoMetadata;
  pullRequests: PrItem[];
  issues: IssueItem[];
  issueStats?: IssueStats;
  runs: WorkflowRunItem[];
  lastUpdated: string;
  error?: string;
  /** 网络是否发生异常（超时、连接拒绝、代理阻断等） */
  networkError?: boolean;
  /** 网络异常的原因或提示 */
  networkErrorReason?: string;
  /**
   * 确定性降级说明（非错误）。
   *
   * 为什么与 networkError 分开：仓库关闭 Issues、未启用 Discussions 这类
   * 「配置事实」不是故障，不该触发网络告警横幅与重试。它们只需要在面板上
   * 安静地说明一句「该仓库未开启 Issues」，让用户知道空列表是正常的。
   */
  notices?: string[];
  /** 插件版本与升级信息（由内存缓存快速读取，不阻塞首屏业务） */
  updateInfo?: UpdateInfo;
  /** 本地 Git 状态（ahead/behind/dirty，remote-tracking 快照语义）；非 Git 工作区为 undefined */
  gitStatus?: GitLocalStatus | null;
  /** 提交记录三段（本地领先/远程领先/最近）；探测失败为 undefined */
  commitLog?: GitCommitLog | null;
  /** 最新 Release 锚定（已过滤 Draft）；无 Release 仓库为 null */
  releaseInfo?: { tagName: string; isPrerelease?: boolean; publishedAt?: string; url?: string } | null;
  /** 当前分支关联的 PR；无 PR 分支为 null */
  branchPr?: { number: number; title: string; state?: string; url?: string; isDraft?: boolean } | null;
  /** 当前工作区的 Git 分支列表（供右侧栏分支选择器 0ms 秒开） */
  branches?: GitBranchesResult | null;
  /**
   * 单仓库 PR 列表是否触及条数上限（仅触顶时下发）。
   *
   * 为什么必须透出：查询已放宽为 `--state all`，列表按 number 降序取前 N 条，
   * 历史 PR 超过上限时界面会静默少显示——用户切到「Closed」看到几条
   * 就会误以为仓库只有这么几个已关闭 PR，无法区分「就这么多」与「被截断了」。
   * 与全局面板的 prsTruncated 同一语义。
   */
  prsTruncated?: boolean;
  /** 单仓库 Issue 列表是否触及条数上限（语义同 prsTruncated） */
  issuesTruncated?: boolean;
  /** Actions 运行列表是否还有更多（语义同 prsTruncated；右侧栏分页用） */
  runsTruncated?: boolean;

  /*
   * 仓库总量（与列表分页无关的真实总数）。
   *
   * 为什么必须单独下发：列表是「按页拉」的，`pullRequests.length` 只是**已加载条数**。
   * 拿已加载条数当总数，用户每下滑一次就会看到 15 → 30 → 45，像是总数在变——这是 bug。
   * 这里的一组数字来自 GraphQL `search.issueCount`，与分页参数完全解耦。
   * 整组字段可选：计数查询失败时全部缺席，前端回落到已加载条数。
   */
  /** 仓库全部 PR 数（含 open/merged/closed） */
  prTotal?: number;
  /** 处于 open 的 PR 数 */
  prOpenTotal?: number;
  /** 已合并的 PR 数 */
  prMergedTotal?: number;
  /** 已关闭的 PR 数（GitHub 语义：含已合并） */
  prClosedTotal?: number;
  /** 仓库全部 Issue 数（不含 PR——用 `is:issue` 限定符区分） */
  issueTotal?: number;
  /** 处于 open 的 Issue 数 */
  issueOpenTotal?: number;
  /** 已关闭的 Issue 数 */
  issueClosedTotal?: number;
  /**
   * Actions 运行总数。
   *
   * 来源是 REST `GET /repos/{owner}/{repo}/actions/runs?per_page=1` 的 `total_count`
   * ——GitHub GraphQL 没有 workflow runs 连接，拿不到 totalCount。
   * 同样与分页解耦：`runs.length` 只是已加载条数。
   */
  runTotal?: number;
}

export interface UserRepoItem {
  name: string;
  nameWithOwner: string;
  description?: string;
  defaultBranch: string;
  isPrivate: boolean;
  stargazerCount?: number;
  updatedAt: string;
  url: string;
}

export interface WorkspaceMatrixItem {
  id: string;
  title: string;
  path: string;
  hasGit: boolean;
  repo?: RepoMetadata;
  sessionCount: number;
  /** 本地 Git 状态摘要（可选——探测失败/非 Git 工作区不携带） */
  gitStatus?: GitLocalStatus;
}

export interface GlobalIssueItem {
  number: number;
  title: string;
  repository: { name?: string; nameWithOwner: string };
  author?: { login: string };
  assignees?: Array<{ login: string }>;
  labels?: Array<{ name: string; color: string }>;
  url: string;
  updatedAt: string;
  state?: 'OPEN' | 'CLOSED';
  categories: IssueCategory[];
}

export interface GlobalOverviewData {
  auth: AuthStatus;
  userRepos: UserRepoItem[];
  workspaceMatrix: WorkspaceMatrixItem[];
  myPrs: Array<{
    number: number;
    title: string;
    /**
     * PR 状态。为什么必须下发：主面板默认展示「全部」而非仅 open
     * （实测账号可能零 open PR，只查 open 会恒为空白），
     * 前端要靠这个字段做状态胶囊筛选与徽章标注。
     */
    state?: 'OPEN' | 'CLOSED' | 'MERGED';
    repository: { nameWithOwner: string };
    url: string;
    updatedAt: string;
    isDraft?: boolean;
  }>;
  myIssues: GlobalIssueItem[];
  issueStats?: IssueStats;
  /**
   * PR 检索是否触及上限（仅触顶时下发）。
   * 为什么必须透出：去掉 open 过滤后按 updatedAt 降序返回最近 N 条，
   * 若账号历史 PR 超过上限，界面会静默少显示，用户无法区分
   * 「列表到此为止」与「数据没取到」。
   */
  prsTruncated?: boolean;
  /** Issues 三路检索是否任一触及上限（有更多可加载） */
  issuesTruncated?: boolean;
  /*
   * 账号级 PR 总量（与分页解耦；来自 GraphQL `search.issueCount`，口径与列表一致）。
   *
   * 这里**故意没有** Issue 总量：主面板 Issue 列表是 owner/assignee/author 三路的并集，
   * 唯一能给出不重复总数的 `is:issue involves:@me` 不含「我仓库里别人提的 issue」，
   * 实测会小于已加载条数；三路分别计数相加又会因重叠虚高。拿不到正确口径就不下发假总数，
   * 前端老实显示「已加载 N」。
   */
  prTotal?: number;
  /** 账号 open PR 数 */
  prOpenTotal?: number;
  /** 账号已合并 PR 数 */
  prMergedTotal?: number;
  /** 账号已关闭 PR 数（GitHub 语义：含已合并） */
  prClosedTotal?: number;
  lastUpdated: string;
  error?: string;
  /** 网络是否发生异常（超时、连接拒绝、代理阻断等） */
  networkError?: boolean;
  /** 网络异常的原因或提示 */
  networkErrorReason?: string;
  /** 工作区矩阵读取失败的原因。区分「没有工作区」与「读不到工作区」，避免把故障显示成空状态 */
  workspaceError?: string;
  /**
   * 确定性降级说明（非错误）：仓库关闭 Issues、未启用 Discussions 等配置事实。
   * 与 networkError 互斥——它不是故障，不该触发告警横幅与重试。
   */
  notices?: string[];
  /** 插件版本与升级信息（由内存缓存快速读取，不阻塞首屏业务） */
  updateInfo?: UpdateInfo;
}

/**
 * 插件版本检查信息
 */
export interface UpdateInfo {
  currentVersion: string;
  latestVersion?: string;
  hasUpdate: boolean;
  upgradeCommand: string;
  allCommands: {
    dshCli: string;
    profile: string;
    pnpm: string;
    npm: string;
  };
  releaseNotesUrl: string;
  checkedAt: number;
}

export type UpgradeState = 'idle' | 'upgrading' | 'success' | 'failed';
export type UpgradeErrorType = 'MINIMUM_RELEASE_AGE_VIOLATION' | 'TIMEOUT' | 'UNKNOWN';

export interface UpgradeStatusResult {
  state: UpgradeState;
  targetVersion?: string;
  message?: string;
  log?: string;
  errorType?: UpgradeErrorType;
  startedAt?: number;
  completedAt?: number;
  /** 识别到的宿主环境类型：desktop 为桌面版，web 为网页/CLI版 */
  environment?: 'desktop' | 'web';
}

export interface UpgradeExecutionResult {
  ok: boolean;
  message: string;
  needRestart: boolean;
  errorType?: UpgradeErrorType;
  log?: string;
  environment?: 'desktop' | 'web';
}

