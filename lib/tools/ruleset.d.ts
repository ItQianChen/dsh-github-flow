import type { GhExecutor } from '../executor.js';
export interface ParsedRule {
    name: string;
    params: string;
    source: string;
}
export interface ParsedRulesetCheck {
    ruleCount: number;
    branch: string;
    repo: string;
    rules: ParsedRule[];
    rawText: string;
}
/**
 * 解析 gh ruleset check 的纯文本输出，提取适用规则数、分支、仓库以及具体规则详情
 */
export declare function parseRulesetCheckOutput(output: string): ParsedRulesetCheck;
export declare function createRulesetTool(executor: GhExecutor): {
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
            branch: {
                type: string;
                description: string;
            };
            default_branch: {
                type: string;
                description: string;
            };
            ruleset_id: {
                type: string;
                description: string;
            };
            org: {
                type: string;
                description: string;
            };
            no_parents: {
                type: string;
                description: string;
            };
            limit: {
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
    execute(args: any, execContext: any): Promise<ParsedRulesetCheck | {
        rawText: string;
        org: any;
        repo: string;
        ruleset_id?: undefined;
    } | {
        ruleset_id: string;
        rawText: string;
        org: any;
        repo: string;
    }>;
};
