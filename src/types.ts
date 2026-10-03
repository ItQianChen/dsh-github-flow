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
  /** Web API 概览数据缓存时长（毫秒），默认 15,000ms */
  cacheTtlMs?: number;
  /** 查询列表默认限制条数，默认 20 */
  defaultListLimit?: number;
}

export interface GhExecutionOptions {
  /** 命令执行的工作目录，优先使用当前 Agent 会话所在的 Workspace 物理路径 */
  cwd?: string;
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

export interface AuthStatus {
  installed: boolean;
  loggedIn: boolean;
  platform?: string;
  user?: string;
  host?: string;
  activeAccount?: boolean;
  protocol?: string;
  scopes?: string[];
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

export interface IssueItem {
  number: number;
  title: string;
  state: 'OPEN' | 'CLOSED';
  author: { login: string };
  labels: Array<{ name: string; color: string }>;
  assignees: Array<{ login: string }>;
  url: string;
  updatedAt: string;
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
  myIssues: Array<{
    number: number;
    title: string;
    repository: { nameWithOwner: string };
    url: string;
    updatedAt: string;
  }>;
  lastUpdated: string;
  error?: string;
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    'github/pr:create'(repo: string, pr: { title: string; url: string }): void;
    'github/pr:merge'(repo: string, prNumber: number): void;
    'github/issue:create'(repo: string, issue: { title: string; url: string }): void;
  }
}
