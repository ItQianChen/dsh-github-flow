import type { GhExecutor } from '../executor.js';
export declare function createCacheTool(executor: GhExecutor): {
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
            repo: {
                type: string;
                description: string;
            };
            cache_id: {
                type: string;
                description: string;
            };
            key: {
                type: string;
                description: string;
            };
            ref: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            sort: {
                type: string;
                enum: string[];
                description: string;
            };
            order: {
                type: string;
                enum: string[];
                description: string;
            };
            all: {
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
    execute(args: any, execContext: any): Promise<Record<string, any>>;
};
