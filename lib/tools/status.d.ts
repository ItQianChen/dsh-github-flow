import type { GhExecutor } from '../executor.js';
import { TelemetryCollector } from '../telemetry.js';
export declare function createStatusTool(executor: GhExecutor, telemetryCollector?: TelemetryCollector): {
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: {
            action: {
                type: string;
                enum: string[];
                description: string;
            };
            org: {
                type: string;
                description: string;
            };
            exclude: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
        };
    };
    output: {
        schema: {
            type: string;
        };
        render(args: any, value: any): {
            type: string;
            text: string;
        }[];
    };
    execute(args: any, execContext: any): Promise<import("../telemetry.js").TelemetrySummary | {
        parsed: import("../renderers/status.js").ParsedStatusReport;
        rawText: string;
    }>;
};
