import type { GhExecutor } from '../executor.js';
export { extractImageUrls as extractPrImageUrls, validateAttachPaths } from './image-utils.js';
export declare function createPrTool(executor: GhExecutor): {
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
            pr_number: {
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
            base: {
                type: string;
                description: string;
            };
            head: {
                type: string;
                description: string;
            };
            draft: {
                type: string;
                description: string;
            };
            review_decision: {
                type: string;
                enum: string[];
                description: string;
            };
            merge_method: {
                type: string;
                enum: string[];
                description: string;
            };
            delete_branch: {
                type: string;
                description: string;
            };
            force: {
                type: string;
                description: string;
            };
            undo: {
                type: string;
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
            author: {
                type: string;
                description: string;
            };
            stat_only: {
                type: string;
                description: string;
            };
            confirm: {
                type: string;
                description: string;
            };
            dry_run: {
                type: string;
                description: string;
            };
            image_urls: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            attach_images: {
                type: string;
                items: {
                    type: string;
                };
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
