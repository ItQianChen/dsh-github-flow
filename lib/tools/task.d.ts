/**
 * `github_task`：任务级原语（s8）。
 *
 * 为什么需要它：现有 18 个工具是**动词表**（list / view / diff / checks / review…），
 * 而用户真正说的是**任务**（"帮我审一下这个 PR" / "CI 为什么挂" / "该发什么版本"）。
 * 一个任务要 Agent 自己串 5–10 个动词，每一步都可能选错参数。
 *
 * 三条纪律（写在最前面，因为它们是这个工具能存在的前提）：
 * 1. **不自己拼 gh 命令**：全部经 executor 与既有工具函数，`phase34` 的 argv 契约网
 *    因此能覆盖到这里的每一次调用；
 * 2. **默认零写回**：三个原语里只有 `review_pr` 会写远端，且必须 `write: true` +
 *    `confirm: true` 双门（闸门见 `destructive.ts` 的 `github_task` 段）；
 * 3. **任何裁剪都显式**：装不下就写进 `truncated`，并区分「裁了多少」与「连总数都不知道」。
 */
import type { GhExecutor } from '../executor.js';
export declare function createTaskTool(executor: GhExecutor): {
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
            run_id: {
                type: string;
                description: string;
            };
            repo: {
                type: string;
                description: string;
            };
            focus: {
                type: string;
                enum: string[];
                description: string;
            };
            budget_chars: {
                type: string;
                description: string;
            };
            write: {
                type: string;
                description: string;
            };
            body: {
                type: string;
                description: string;
            };
            comments: {
                type: string;
                items: {
                    type: string;
                    properties: {
                        path: {
                            type: string;
                        };
                        line: {
                            type: string;
                        };
                        side: {
                            type: string;
                            enum: string[];
                        };
                        start_line: {
                            type: string;
                        };
                        body: {
                            type: string;
                        };
                    };
                    required: string[];
                };
                description: string;
            };
            review_decision: {
                type: string;
                enum: string[];
                description: string;
            };
            framework: {
                type: string;
                enum: string[];
                description: string;
            };
            from_tag: {
                type: string;
                description: string;
            };
            bump: {
                type: string;
                enum: string[];
                description: string;
            };
            draft: {
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
    execute(args: any, execContext: any): Promise<import("../task-primitives.js").TaskEnvelope<{
        pr: number;
        title: string;
        sha: string | undefined;
        baseSha: string | undefined;
        changedFiles: number;
        filesTruncated: boolean;
        files: import("../task-primitives.js").BudgetFile[];
        checks: {
            pass: number;
            fail: number;
            pending: number;
            skipped: number;
            failing: string[];
        };
        rules: {
            sources: {
                path: string;
                content: string;
            }[];
            truncated: boolean;
        } | null;
        existingLineComments: number;
    }> | import("../task-primitives.js").TaskEnvelope<{
        runId: number;
        name: any;
        status: any;
        conclusion: any;
        url: any;
        failedJobs: any;
        excerpts: {
            file: string;
            line: number;
            message: string;
        }[];
        suspectedFiles: string[];
        framework: any;
        totalBlocks: number;
        logError?: string | undefined;
    }> | import("../task-primitives.js").TaskEnvelope<{
        fromTag: string | null;
        commitCount: number;
        suggestedVersion: string;
        bump: "major" | "minor" | "patch";
        bumpReason: string;
        groups: import("../task-primitives.js").CommitGroups;
        health: {
            clean: boolean;
            synced: boolean;
            ciGreen: boolean | null;
            branch: string;
        };
        notes: string;
        commits: {
            sha: string;
            subject: string;
        }[];
    }> | {
        summary: string;
        facts: {
            pr: number;
            title: string;
            sha: string | undefined;
            baseSha: string | undefined;
            changedFiles: number;
            filesTruncated: boolean;
            files: import("../task-primitives.js").BudgetFile[];
            checks: {
                pass: number;
                fail: number;
                pending: number;
                skipped: number;
                failing: string[];
            };
            rules: {
                sources: {
                    path: string;
                    content: string;
                }[];
                truncated: boolean;
            } | null;
            existingLineComments: number;
            written: {
                htmlUrl: any;
                state: any;
                degraded: boolean;
            };
        };
        truncated?: {
            fields: string[];
            reason: string;
            totalUnknown: boolean;
        };
        nextActions: string[];
        cost: {
            chars: number;
            ghCalls: number;
            elapsedMs: number;
        };
        degraded: boolean;
        degradedReason: string | undefined;
    }>;
};
