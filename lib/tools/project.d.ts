import type { GhExecutor } from '../executor.js';
/**
 * 检测错误信息是否属于 Scope 权限不足，并返回标准自愈对象
 */
export declare function checkScopeRequired(errorMsg: string, scope: string, command: string, tool: string): {
    status: string;
    scope: string;
    command: string;
    tool: string;
} | null;
export declare function createProjectTool(executor: GhExecutor): {
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
            owner: {
                type: string;
                description: string;
            };
            project_number: {
                type: string;
                description: string;
            };
            item_id: {
                type: string;
                description: string;
            };
            url: {
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
            query: {
                type: string;
                description: string;
            };
            closed: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
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
    execute(args: any, execContext: any): Promise<Record<string, any> | {
        status: string;
        scope: string;
        command: string;
        tool: string;
    }>;
};
