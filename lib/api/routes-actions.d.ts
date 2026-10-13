import type { GhExecutor } from '../executor.js';
import { TtlCache } from '../cache.js';
import type { GitHubOverviewData, GlobalOverviewData } from '../types.js';
import { type RouteDeps } from './route-helpers.js';
/**
 * 构造「在新终端窗口运行命令」的平台命令（execFile 数组形态，不经 shell）。
 *
 * Issue #2 修复要点：
 * - Windows：cmd.exe（显式 .exe，规避 GUI 父进程 PATH 解析差异）+ start 的窗口标题
 *   占位 "DSH GitHub"——start 的首个带引号参数会被解析为标题而非程序，占位后
 *   powershell.exe 才能被稳定识别为目标程序；
 * - macOS：osascript 驱动 Terminal.app，命令经引号转义拼入 AppleScript；
 * - Linux：发行版终端二进制与参数形态各异（gnome-terminal 用 `--`、konsole 用
 *   `-e`、xfce4-terminal 用 `-x`），单一硬编码在主流桌面大概率不存在——由
 *   detectLinuxTerminal 按探测结果返回对应形态。
 */
export declare function buildTerminalCommand(command: string): {
    bin: string;
    args: string[];
} | null;
/** 测试辅助：重置 Linux 终端探测缓存（便于单测注入不同探测环境） */
export declare function resetLinuxTerminalCache(): void;
export declare function registerActionRoutes(deps: RouteDeps, executor: GhExecutor, cacheMap: TtlCache<GitHubOverviewData>, globalCache: TtlCache<GlobalOverviewData>): void;
