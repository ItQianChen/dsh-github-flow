import type { GhExecutor } from '../executor.js';
export declare function createAgentTaskTool(executor: GhExecutor): {
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
            task_id: {
                type: string;
                description: string;
            };
            prompt: {
                type: string;
                description: string;
            };
            base_branch: {
                type: string;
                description: string;
            };
            custom_agent: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            log: {
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
    execute(args: any, execContext: any): Promise<any>;
};
