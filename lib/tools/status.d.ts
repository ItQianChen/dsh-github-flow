import type { GhExecutor } from '../executor.js';
export declare function createStatusTool(executor: GhExecutor): {
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
    execute(args: any, execContext: any): Promise<{
        parsed: import("../renderers/status.js").ParsedStatusReport;
        rawText: string;
    }>;
};
