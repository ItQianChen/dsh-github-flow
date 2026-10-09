export interface WorkspaceRecord {
    id: string;
    title: string;
    path: string;
    sessionIds: string[];
    updatedAt: string;
}
/** 仅供测试与配置变更后失效使用 */
export declare function resetWorkspaceCache(): void;
export declare function workspaceJsonPath(): string;
/**
 * 读取全部工作区记录。
 * 返回空数组表示「文件不存在」，抛错表示「文件存在但无法解析」——调用方必须区分这两种情况，
 * 否则 workspace.json 损坏时会显示成「你没有工作区」，把故障伪装成正常空状态。
 */
export declare function readWorkspaces(options?: {
    bypassCache?: boolean;
}): WorkspaceRecord[];
/** 容错读取：读取失败时返回空数组并把原因交给调用方，绝不静默吞掉 */
export declare function tryReadWorkspaces(): {
    workspaces: WorkspaceRecord[];
    error?: string;
};
/**
 * 按会话 ID 反查物理工作区路径。
 * 命中要求路径真实存在——workspace.json 里可能残留已删除的目录。
 */
export declare function findWorkspacePathBySession(sessionId: string): string | undefined;
/**
 * 匹配最近活跃且包含 Git 仓库的工作区路径。
 *
 * 为什么必须优先检查 hasGitDir：workspace.json 中可能记录了父级纯文件夹工作区（例如工程聚合根目录，本身非 Git 仓库），
 * 当它被打开过导致 updatedAt 较新时，若不检查 .git 就会误把该父目录当成当前仓库执行路径，
 * 进而导致后续 gh 命令报出 "fatal: not a git repository"。
 * 策略：优先选取最近活跃且明确具备 .git 的工作区；若均无 .git 再优雅回退到任意普通工作区。
 */
export declare function findMostRecentWorkspacePath(): string | undefined;
export declare function hasGitDir(dir: string): boolean;
/**
 * 有界并发 map。
 * 为什么必须有：每个工作区探测最多 spawn 2 个 gh 进程，而 Node 的 libuv 线程池默认只有 4 个
 * 线程可用。工作区一多，无上限的 Promise.all 会把进程全部排进队列，单次 spawn 超时 10s × 排队
 * 造成整体秒级到十几秒的延迟（实测 /api/github/global-overview 曾达 18.9s）。
 * 这里显式限制在途数量，让延迟可预期，而不是随工作区数量线性劣化。
 */
export declare function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]>;
