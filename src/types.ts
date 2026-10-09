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
}

export interface GhResult<T = unknown> {
  ok: boolean;
  data?: T;
  rawOutput?: string;
  error?: string;
  /** 是否因超出安全阈值而被截断 */
  truncated?: boolean;
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
  /** 工作区矩阵读取失败的原因。区分「没有工作区」与「读不到工作区」，避免把故障显示成空状态 */
  workspaceError?: string;
}
