import type { GhExecutor } from '../executor.js';
export declare function createPrTool(executor: GhExecutor): {
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
            pr_number: {
                type: string;
                description: string;
            };
            repo: {
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
            base: {
                type: string;
                description: string;
            };
            draft: {
                type: string;
                description: string;
            };
            review_decision: {
                type: string;
                enum: string[];
                description: string;
            };
            merge_method: {
                type: string;
                enum: string[];
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
            text: any;
        }[];
    };
    execute(args: any, execContext: any): Promise<Record<string, any>>;
};
