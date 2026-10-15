import fs from 'node:fs';
import path from 'node:path';

/**
 * Git 元数据变更事件载荷
 */
export interface GitChangeEvent {
  /** 是否检测到本地 Git 元数据变动 */
  changed?: boolean;
  /** 触发时间戳（毫秒） */
  at?: number;
  /** 是否因达到长轮询上限而超时返回 */
  timeout?: boolean;
}

/**
 * Git 监听器配置项
 */
export interface GitWatchOptions {
  /** 防抖时间（毫秒），默认 800ms */
  debounceMs?: number;
  /** 长轮询超时时间（毫秒），默认 35,000ms */
  timeoutMs?: number;
}

/**
 * 定向针对 .git/HEAD 与 .git/index 创建非递归文件系统监听器。
 * 零源码目录遍历，避免句柄耗尽与高 CPU 占用。
 *
 * 核心机制：
 * 1. 靶向监听：仅监控 .git/HEAD 与 .git/index，若都不存在则兜底监控 .git 目录；
 * 2. 800ms 防抖合并：避免连续 git 操作（如 git add 多个文件）产生事件风暴；
 * 3. 单次触发保证（At-Most-Once）：变更触发或超时熔断后，立即自动执行清理并释放全部句柄；
 * 4. 显式释放：返回可随时主动调用的清理函数 stop()。
 *
 * @param cwd 目标 Git 仓库根目录
 * @param onTrigger 变更发生或超时触发时的回调函数
 * @param options 可选配置项（防抖与超时时间）
 * @returns 停止监听并释放全部句柄的清理函数
 */
export function watchGitMetadata(
  cwd: string,
  onTrigger: (event: GitChangeEvent) => void,
  options?: GitWatchOptions
): () => void {
  const debounceMs = options?.debounceMs ?? 800;
  const timeoutMs = options?.timeoutMs ?? 35_000;

  const gitDir = path.join(cwd, '.git');
  let stopped = false;
  let debounceTimer: NodeJS.Timeout | null = null;
  let timeoutTimer: NodeJS.Timeout | null = null;
  const watchers: fs.FSWatcher[] = [];

  const cleanup = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
    for (const w of watchers) {
      try {
        w.close();
      } catch {}
    }
    watchers.length = 0;
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    cleanup();
  };

  const triggerChange = () => {
    if (stopped) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (stopped) return;
      stopped = true;
      cleanup();
      try {
        onTrigger({ changed: true, at: Date.now() });
      } catch {}
    }, debounceMs);
  };

  try {
    const targets = [path.join(gitDir, 'HEAD'), path.join(gitDir, 'index')];
    for (const target of targets) {
      if (fs.existsSync(target)) {
        watchers.push(fs.watch(target, triggerChange));
      }
    }
    if (watchers.length === 0 && fs.existsSync(gitDir)) {
      watchers.push(fs.watch(gitDir, triggerChange));
    }

    timeoutTimer = setTimeout(() => {
      if (stopped) return;
      stopped = true;
      cleanup();
      try {
        onTrigger({ timeout: true });
      } catch {}
    }, timeoutMs);
  } catch (err) {
    cleanup();
    throw err;
  }

  return stop;
}
