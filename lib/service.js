/**
 * DSH GitHub 原生微内核服务
 * 允许生态内其他插件通过 ctx.github 或 inject: ['github'] 消费 GitHub CLI 能力
 */
export class GitHubService {
    ctx;
    executor;
    constructor(ctx, executor) {
        this.ctx = ctx;
        this.executor = executor;
        // 挂载到 ctx 上
        if (ctx) {
            ctx.github = this;
        }
    }
    /**
     * 执行原生 gh 命令
     */
    async run(args, options = {}) {
        return this.executor.run(args, options);
    }
    /**
     * 检查宿主机 GitHub CLI 认证状态
     */
    async checkAuth(cwd) {
        return this.executor.checkAuth(cwd);
    }
    /**
     * 获取指定工作区路径下的 Git 关联元数据
     */
    async getRepoMetadata(cwd) {
        return this.executor.getRepoMetadata(cwd);
    }
}
