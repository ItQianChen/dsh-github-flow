import type { GhExecutor } from '../executor.js';
export declare function createReleaseTool(executor: GhExecutor): {
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
            tag: {
                type: string;
                description: string;
            };
            title: {
                type: string;
                description: string;
            };
            notes: {
                type: string;
                description: string;
            };
            generate_notes: {
                type: string;
                description: string;
            };
            draft: {
                type: string;
                description: string;
            };
            prerelease: {
                type: string;
                description: string;
            };
            target: {
                type: string;
                description: string;
            };
            assets: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            clobber: {
                type: string;
                description: string;
            };
            pattern: {
                type: string;
                description: string;
            };
            dir: {
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
            cleanup_tag: {
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
