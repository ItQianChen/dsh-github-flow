/**
 * DSH GitHub 插件核心数据类型定义
 */

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
