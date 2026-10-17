import type { GhExecutor } from '../executor.js';
import type { UpdateChecker } from '../updater.js';
import { TelemetryCollector } from '../telemetry.js';
/**
 * 注册人类 Slash 快捷指令集
 * 采用扁平化一级指令 + 二级参数容错双轨机制，消除用户“敲了 /gh 不会加参数”的交互盲区
 */
export declare function registerGhCommand(commandsService: any, executor: GhExecutor, updateChecker?: UpdateChecker, telemetryCollector?: TelemetryCollector): void;
