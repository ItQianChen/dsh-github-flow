import type { GhExecutor } from '../executor.js';
export declare function createCodespaceTool(executor: GhExecutor): {
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
            codespace: {
                type: string;
                description: string;
            };
            repo: {
                type: string;
                description: string;
            };
            org: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            confirm: {
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
    execute(args: any, execContext: any): Promise<Record<string, any> | {
        status: string;
        scope: string;
        command: string;
        tool: string;
    }>;
};
