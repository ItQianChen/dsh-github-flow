import type { GhExecutor } from './executor.js';
import type { GhExecutionOptions, GhResult, AuthStatus, RepoMetadata } from './types.js';

declare module '@deepseek-ai/cordis' {
  interface Context {
    github: GitHubService;
  }
}

/**
 * DSH GitHub 原生微内核服务
 * 允许生态内其他插件通过 ctx.github 或 inject: ['github'] 消费 GitHub CLI 能力
 */
export class GitHubService {
  constructor(private ctx: any, public executor: GhExecutor) {
    // 挂载到 ctx 上
    if (ctx) {
      ctx.github = this;
    }
  }

  /**
   * 执行原生 gh 命令
   */
  async run<T = unknown>(args: string[], options: GhExecutionOptions = {}): Promise<GhResult<T>> {
    return this.executor.run<T>(args, options);
  }

  /**
   * 检查宿主机 GitHub CLI 认证状态
   */
  async checkAuth(cwd?: string): Promise<AuthStatus> {
    return this.executor.checkAuth(cwd);
  }

  /**
   * 获取指定工作区路径下的 Git 关联元数据
   */
  async getRepoMetadata(cwd?: string): Promise<RepoMetadata | null> {
    return this.executor.getRepoMetadata(cwd);
  }
}
