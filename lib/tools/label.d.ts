import type { GhExecutor } from '../executor.js';
/**
 * 校验并归一化 6 位十六进制颜色（去除前导 #）
 */
export declare function normalizeHexColor(rawColor?: string): string | undefined;
export declare function createLabelTool(executor: GhExecutor): {
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
            new_name: {
                type: string;
                description: string;
            };
            color: {
                type: string;
                description: string;
            };
            description: {
                type: string;
                description: string;
            };
            force: {
                type: string;
                description: string;
            };
            source_repo: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            search: {
                type: string;
                description: string;
            };
            sort: {
                type: string;
                enum: string[];
                description: string;
            };
            order: {
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
