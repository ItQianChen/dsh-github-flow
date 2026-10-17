import type { GhExecutor } from '../executor.js';
export declare function createSkillTool(executor: GhExecutor): {
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
            query: {
                type: string;
                description: string;
            };
            owner: {
                type: string;
                description: string;
            };
            repository: {
                type: string;
                description: string;
            };
            skill_name: {
                type: string;
                description: string;
            };
            agent: {
                type: string;
                description: string;
            };
            scope: {
                type: string;
                enum: string[];
                description: string;
            };
            all: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            directory: {
                type: string;
                description: string;
            };
            dry_run: {
                type: string;
                description: string;
            };
            fix: {
                type: string;
                description: string;
            };
            tag: {
                type: string;
                description: string;
            };
            skill_names: {
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
        render(args: any, value: any): {
            type: string;
            text: string;
        }[];
    };
    execute(args: any, execContext: any): Promise<Record<string, any> | import("../renderers/skill.js").SkillPublishReport>;
};
