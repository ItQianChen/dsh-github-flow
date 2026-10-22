/**
 * 工具档位（toolsets）+ 只读档位（read_only）。
 *
 * 为什么单独成文件：档位与写清单必须是**一张可读的表**。散落在 18 个工具文件里的话，
 * 「当前到底有哪些工具、哪些是写」就无法一眼回答，也就无法被测试穷举。
 * 本文件是纯函数 + 纯数据，零 I/O、零依赖，可离线单测。
 *
 * 默认零破坏：`toolsets` 缺省 → full 全量 18 个；`read_only` 缺省 → 不剪任何 action。
 */
/** 工具的最小结构面（只需要 name / description / parameters 三个字段）。 */
export interface ToolLike {
    name: string;
    description?: string;
    parameters?: {
        type?: string;
        properties?: Record<string, any>;
        required?: string[];
        [key: string]: any;
    };
    [key: string]: any;
}
export interface TierConfig {
    toolsets?: string[];
    read_only?: boolean;
}
/** 预设档位。`full` 不代表具体名单，由 resolveToolNames 特判为「全部」。 */
export declare const TOOL_PRESETS: Record<string, string[]>;
/**
 * 写 action 清单：只读档位下这些 action 会从 enum 里被**注册期剔除**（不是运行时 if）。
 *
 * 判定口径：逐个 `case '...'` 分支看它是否产生远端写、本地落盘或不可逆副作用；
 * 读不准的一律保守归为写（例如 `run download` 会往本地磁盘写文件，计入写）。
 * `github_api` 记 `'*'`：端点与 method 均可任意，无法降级，只读模式下整体剔除。
 */
export declare const WRITE_ACTIONS: Record<string, string[] | '*'>;
/**
 * 把 `toolsets` 配置解析成具体工具名清单。
 *
 * - `undefined` / 空数组 → 返回 `'all'`（默认全量，零破坏）
 * - 预设名与裸工具名可混用，取并集
 * - 未知名字：console.warn 一次并忽略。**不静默**——静默减少工具会让模型
 *   「看不见工具」却不知道为什么，是比多注册一个工具更难排查的故障。
 */
export declare function resolveToolNames(toolsets: string[] | undefined, allNames: string[]): string[] | 'all';
/**
 * 按档位裁剪工具列表（纯函数，不修改入参）。
 *
 * 只读档位下对**混合工具**剪 action enum 而不是整只剔除：模型在 schema 层就看不到
 * 写 action，宿主的参数校验会直接拒绝，可审计且不需要运行时分支。
 */
export declare function applyTier(tools: ToolLike[], cfg: TierConfig): {
    kept: ToolLike[];
    /** 被整体剔除的工具名（只读模式下的 github_api，或档位外的工具） */
    dropped: string[];
    /** 被剪掉写 action 的工具名 → 剪掉前的完整 enum（供诊断与测试消费） */
    pruned: Record<string, string[]>;
};
