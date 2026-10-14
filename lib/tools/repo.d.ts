import type { GhExecutor } from '../executor.js';
export declare function createRepoTool(executor: GhExecutor): {
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
            image_urls: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            include_badges: {
                type: string;
                description: string;
            };
            query: {
                type: string;
                description: string;
            };
            path: {
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
            branch: {
                type: string;
                description: string;
            };
            source: {
                type: string;
                description: string;
            };
            force: {
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
        render(args: any, value: any): any[];
    };
    execute(args: any, execContext: any): Promise<Record<string, any>>;
};
