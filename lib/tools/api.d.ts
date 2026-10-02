import type { GhExecutor } from '../executor.js';
export declare function createApiTool(executor: GhExecutor): {
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: {
            endpoint: {
                type: string;
                description: string;
            };
            method: {
                type: string;
                enum: string[];
                description: string;
            };
            jq: {
                type: string;
                description: string;
            };
            fields: {
                type: string;
                description: string;
            };
        };
        required: string[];
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
    execute(args: any, execContext: any): Promise<{} | undefined>;
};
