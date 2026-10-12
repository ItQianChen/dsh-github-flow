import type { GhExecutor } from '../executor.js';
export declare function createIssueTool(executor: GhExecutor): {
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
            issue_number: {
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
            labels: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            assignees: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            state: {
                type: string;
                enum: string[];
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            branch_name: {
                type: string;
                description: string;
            };
            add_labels: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            remove_labels: {
                type: string;
                items: {
                    type: string;
                };
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
            text: any;
        }[];
    };
    execute(args: any, execContext: any): Promise<Record<string, any>>;
};
