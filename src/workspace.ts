/**
 * 工作区解析的单一数据源。
 *
 * 为什么独立成模块：`~/.dsh/storages/workspace.json` 的读取与「会话 ID → 物理路径」的
 * 反查逻辑原先在 executor.ts 与 api/routes.ts 里各写了一份（routes.ts 内还写了两遍），
 * 三份实现的字段兜底行为已有细微差异。同一份事实在多个地方各自解析，迟早会出现
 * 「工具看到的工作区」与「面板显示的工作区」不一致，因此收敛到这里。
 *
 * 本模块刻意不依赖 GhExecutor，只做纯文件读取，便于单元测试与复用。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface WorkspaceRecord {
  id: string;
  title: string;
  path: string;
  sessionIds: string[];
  updatedAt: string;
}

/** 缓存时长：workspace.json 变更频率低，但面板会反复读取，缓存可显著降低磁盘 IO 与解析开销 */
const WORKSPACE_CACHE_TTL_MS = 5_000;

interface CacheEntry {
  at: number;
  records: WorkspaceRecord[];
}

let cache: CacheEntry | null = null;

/** 仅供测试与配置变更后失效使用 */
export function resetWorkspaceCache(): void {
  cache = null;
}

export function workspaceJsonPath(): string {
  return path.join(os.homedir(), '.dsh', 'storages', 'workspace.json');
}

/**
 * 读取全部工作区记录。
 * 返回空数组表示「文件不存在」，抛错表示「文件存在但无法解析」——调用方必须区分这两种情况，
 * 否则 workspace.json 损坏时会显示成「你没有工作区」，把故障伪装成正常空状态。
 */
export function readWorkspaces(options: { bypassCache?: boolean } = {}): WorkspaceRecord[] {
  const now = Date.now();
  if (!options.bypassCache && cache && now - cache.at < WORKSPACE_CACHE_TTL_MS) {
    return cache.records;
  }

  const file = workspaceJsonPath();
  if (!fs.existsSync(file)) {
    cache = { at: now, records: [] };
    return [];
  }

  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const raw = parsed?.tables?.workspaces ?? {};

  const records: WorkspaceRecord[] = Object.keys(raw).map((id) => {
    const item = raw[id] ?? {};
    return {
      id,
      title: typeof item.title === 'string' ? item.title : '',
      path: typeof item.path === 'string' ? item.path : '',
      sessionIds: Array.isArray(item.sessionIds) ? item.sessionIds : [],
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '',
    };
  });

  cache = { at: now, records };
  return records;
}

/** 容错读取：读取失败时返回空数组并把原因交给调用方，绝不静默吞掉 */
export function tryReadWorkspaces(): { workspaces: WorkspaceRecord[]; error?: string } {
  try {
    return { workspaces: readWorkspaces() };
  } catch (err: any) {
    return { workspaces: [], error: err?.message || '工作区数据读取失败' };
  }
}

/**
 * 按会话 ID 反查物理工作区路径。
 * 命中要求路径真实存在——workspace.json 里可能残留已删除的目录。
 */
export function findWorkspacePathBySession(sessionId: string): string | undefined {
  try {
    const { workspaces } = tryReadWorkspaces();
    for (const ws of workspaces) {
      if (ws.sessionIds.includes(sessionId) && ws.path && fs.existsSync(ws.path)) {
        return ws.path;
      }
    }
  } catch {
    // 会话反查是可选的尽力而为路径，失败时由调用方回退到其他策略
  }
  return undefined;
}

/**
 * 匹配最近活跃的工作区路径。
 * 注意 updatedAt 可能缺失或非 ISO 格式，统一用时间戳比较，无效值视为 0 而非 NaN——
 * 后者会让所有比较都返回 false，导致永远选不中任何工作区。
 */
export function findMostRecentWorkspacePath(): string | undefined {
  try {
    const { workspaces } = tryReadWorkspaces();
    let best: WorkspaceRecord | null = null;
    let bestAt = -1;
    for (const ws of workspaces) {
      const at = Date.parse(ws.updatedAt || '');
      const score = Number.isFinite(at) ? at : 0;
      if (score > bestAt && ws.path && fs.existsSync(ws.path)) {
        best = ws;
        bestAt = score;
      }
    }
    return best?.path;
  } catch {
    return undefined;
  }
}

export function hasGitDir(dir: string): boolean {
  try {
    return fs.existsSync(path.join(dir, '.git'));
  } catch {
    return false;
  }
}

/**
 * 有界并发 map。
 * 为什么必须有：每个工作区探测最多 spawn 2 个 gh 进程，而 Node 的 libuv 线程池默认只有 4 个
 * 线程可用。工作区一多，无上限的 Promise.all 会把进程全部排进队列，单次 spawn 超时 10s × 排队
 * 造成整体秒级到十几秒的延迟（实测 /api/github/global-overview 曾达 18.9s）。
 * 这里显式限制在途数量，让延迟可预期，而不是随工作区数量线性劣化。
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const effectiveLimit = Math.max(1, Math.min(limit, items.length));
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: effectiveLimit }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}
