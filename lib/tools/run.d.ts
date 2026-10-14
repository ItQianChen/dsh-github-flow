import type { GhExecutor } from '../executor.js';
export declare function createRunTool(executor: GhExecutor): {
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
            run_id: {
                type: string;
                description: string;
            };
            repo: {
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
            status: {
                type: string;
                enum: string[];
                description: string;
            };
            workflow: {
                type: string;
                description: string;
            };
            all: {
                type: string;
                description: string;
            };
            ref: {
                type: string;
                description: string;
            };
            inputs: {
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
