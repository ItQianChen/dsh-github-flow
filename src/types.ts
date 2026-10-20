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
  author: { login: string; avatarUrl?: string };
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

/**
 * Issue 分类维度契约：
 * - reported: 用户提起的（他人向我名下项目或本仓库提交的 Issue 反馈）
 * - assigned: 分配给我的（指派给当前账号的待办任务，跨仓库通用）
 * - created: 我创建的（由当前账号亲自发起的 Issue）
 */
export type IssueCategory = 'reported' | 'assigned' | 'created';

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
    repository: { nameWithOwner: string };
    url: string;
    updatedAt: string;
  }>;
  myIssues: GlobalIssueItem[];
  issueStats?: IssueStats;
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

