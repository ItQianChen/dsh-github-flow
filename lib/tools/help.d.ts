import type { GhExecutor } from '../executor.js';
export declare function createHelpTool(executor: GhExecutor): {
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: {
            topic: {
                type: string;
                enum: string[];
                description: string;
            };
            gh_command: {
                type: string;
                description: string;
            };
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
    execute(args: any, execContext: any): Promise<{
        result: string | undefined;
    }>;
};
