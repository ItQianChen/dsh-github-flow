import type { GhExecutor } from '../executor.js';
import type { UpdateChecker } from '../updater.js';
import { TelemetryCollector } from '../telemetry.js';
export declare function registerGhCommand(commandsService: any, executor: GhExecutor, updateChecker?: UpdateChecker, telemetryCollector?: TelemetryCollector): void;
