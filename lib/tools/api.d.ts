import type { GhExecutor } from '../executor.js';
export declare function createApiTool(executor: GhExecutor): {
    name: string;
    description: string;
    parameters: {
        endpoint: {
            type: string;
            required: boolean;
            description: string;
        };
        method: {
            type: string;
            enum: string[];
            description: string;
        };
        jq: {
            type: string;
            description: string;
        };
        fields: {
            type: string;
            description: string;
        };
        raw: {
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
