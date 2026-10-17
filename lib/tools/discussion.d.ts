import type { GhExecutor } from '../executor.js';
export declare function createDiscussionTool(executor: GhExecutor): {
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
            discussion_number: {
                type: string;
                description: string;
            };
            title: {
                type: string;
                description: string;
            };
            body: {
                type: string;
                description: string;
            };
            category: {
                type: string;
                description: string;
            };
            state: {
                type: string;
                enum: string[];
                description: string;
            };
            labels: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            search: {
                type: string;
                description: string;
            };
            comments: {
                type: string;
                description: string;
            };
            limit: {
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
