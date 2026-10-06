import type { GhExecutor } from '../executor.js';
export declare function createRunTool(executor: GhExecutor): {
    name: string;
    description: string;
    parameters: {
        action: {
            type: string;
            enum: string[];
            required: boolean;
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
