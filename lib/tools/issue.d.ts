import type { GhExecutor } from '../executor.js';
/**
 * 从 Issue 正文提取图片 URL（用户拖拽上传 / 旧版上传 / 仓库引用 / camo 代理 / 带扩展名外链）。
 * 为什么域名白名单 + 扩展名兜底双条件：GitHub 会把外链图片代理成 camo 域名，
 * 用户上传走 user-attachments；仓库内图片是 raw 域名——三类是最常见可信来源。
 * 任意公网 URL 必须带图片扩展名才纳入，避免把截图里的按钮链接误当图片下载。
 */
export declare function extractIssueImageUrls(body: unknown): string[];
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
        render(args: any, value: any): any[];
    };
    execute(args: any, execContext: any): Promise<Record<string, any>>;
};
