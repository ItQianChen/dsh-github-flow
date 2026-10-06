import type { GhExecutor } from '../executor.js';
export declare function createPrTool(executor: GhExecutor): {
    name: string;
    description: string;
    parameters: {
        action: {
            type: string;
            enum: string[];
            required: boolean;
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
        head: {
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
        delete_branch: {
            type: string;
            description: string;
        };
        dry_run: {
            type: string;
            description: string;
        };
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
