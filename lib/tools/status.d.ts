import type { GhExecutor } from '../executor.js';
import { TelemetryCollector } from '../telemetry.js';
import type { AuditStore } from '../audit.js';
export declare function createStatusTool(executor: GhExecutor, telemetryCollector?: TelemetryCollector, auditStore?: AuditStore): {
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
        totalCalls: number;
        successCount: number;
        failureCount: number;
        degradedCount: number;
        degradationRate: number;
        scopeBlockedCount: number;
        confirmBlockedCount: number;
        healthScore: number;
        statusLevel: 'EXCELLENT' | 'GOOD' | 'NEEDS_ATTENTION';
        toolStats: Record<string, import("../telemetry.js").ToolUsageStat>;
        recommendations: string[];
        approvalLine: string;
        parsed?: undefined;
        rawText?: undefined;
    } | {
        parsed: import("../renderers/status.js").ParsedStatusReport;
        rawText: string;
    }>;
};
