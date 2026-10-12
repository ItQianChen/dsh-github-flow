import type { GhExecutor } from '../executor.js';
export declare function createSecretTool(executor: GhExecutor): {
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
            name: {
                type: string;
                description: string;
            };
            value: {
                type: string;
                description: string;
            };
            org: {
                type: string;
                description: string;
            };
            env: {
                type: string;
                description: string;
            };
            app: {
                type: string;
                enum: string[];
                description: string;
            };
            visibility: {
                type: string;
                enum: string[];
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
            text: string;
        }[];
    };
    execute(args: any, execContext: any): Promise<Record<string, any>>;
};
