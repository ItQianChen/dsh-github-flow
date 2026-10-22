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
export const TOOL_PRESETS: Record<string, string[]> = {
  full: [],
  /** 最小可用面：提 PR、看/回 Issue、看 CI、认仓库、查指南 */
  core: ['github_pr', 'github_issue', 'github_run', 'github_repo', 'github_help'],
  /** 流水线值守：CI 诊断与排障所需的只读面更大 */
  ci: [
    'github_run', 'github_pr', 'github_issue', 'github_repo',
    'github_status', 'github_ruleset', 'github_help',
  ],
  /** 社区维护：议题/评审/发版/标签/看板 */
  maintain: [
    'github_issue', 'github_pr', 'github_label', 'github_release',
    'github_discussion', 'github_project', 'github_skill', 'github_help',
  ],
};

/**
 * 写 action 清单：只读档位下这些 action 会从 enum 里被**注册期剔除**（不是运行时 if）。
 *
 * 判定口径：逐个 `case '...'` 分支看它是否产生远端写、本地落盘或不可逆副作用；
 * 读不准的一律保守归为写（例如 `run download` 会往本地磁盘写文件，计入写）。
 * `github_api` 记 `'*'`：端点与 method 均可任意，无法降级，只读模式下整体剔除。
 */
export const WRITE_ACTIONS: Record<string, string[] | '*'> = {
  github_pr: ['checkout', 'create', 'review', 'merge', 'ready', 'revert', 'update_branch', 'comment', 'edit'],
  github_issue: ['create', 'edit', 'develop', 'comment', 'close', 'reopen', 'pin', 'unpin', 'lock', 'unlock', 'delete', 'transfer'],
  github_run: ['workflow_enable', 'workflow_disable', 'trigger', 'rerun', 'cancel', 'download'],
  github_repo: ['sync'],
  github_cache: ['delete'],
  github_release: ['create', 'upload', 'delete', 'download'],
  github_secret: ['set', 'delete'],
  github_label: ['create', 'edit', 'delete', 'clone'],
  github_gist: ['create', 'edit', 'delete'],
  github_project: ['item-add', 'item-create', 'item-delete'],
  github_codespace: ['stop', 'delete'],
  github_discussion: ['create', 'edit', 'comment'],
  github_agent_task: ['create'],
  github_skill: ['install', 'publish', 'update'],
  github_ruleset: [],
  github_status: [],
  github_help: [],
  github_api: '*',
};

/**
 * 把 `toolsets` 配置解析成具体工具名清单。
 *
 * - `undefined` / 空数组 → 返回 `'all'`（默认全量，零破坏）
 * - 预设名与裸工具名可混用，取并集
 * - 未知名字：console.warn 一次并忽略。**不静默**——静默减少工具会让模型
 *   「看不见工具」却不知道为什么，是比多注册一个工具更难排查的故障。
 */
export function resolveToolNames(
  toolsets: string[] | undefined,
  allNames: string[]
): string[] | 'all' {
  if (!toolsets || toolsets.length === 0) return 'all';
  const picked = new Set<string>();
  const unknown: string[] = [];
  for (const raw of toolsets) {
    const name = typeof raw === 'string' ? raw.trim() : '';
    if (!name) continue;
    const preset = TOOL_PRESETS[name];
    if (preset) {
      if (name === 'full') return 'all';
      for (const t of preset) picked.add(t);
      continue;
    }
    if (allNames.includes(name)) {
      picked.add(name);
      continue;
    }
    unknown.push(name);
  }
  if (unknown.length > 0) {
    console.warn(
      `[dsh-github-flow] toolsets 中存在未知档位/工具名：${unknown.join(', ')}。` +
      `可用档位：${Object.keys(TOOL_PRESETS).join(' / ')}；也可直接写工具名（如 github_pr）。已忽略未知项。`
    );
  }
  // 过滤掉本版本不存在的预设成员（预设表可能超前于实际注册的工具）
  return allNames.filter((n) => picked.has(n));
}

/**
 * 按档位裁剪工具列表（纯函数，不修改入参）。
 *
 * 只读档位下对**混合工具**剪 action enum 而不是整只剔除：模型在 schema 层就看不到
 * 写 action，宿主的参数校验会直接拒绝，可审计且不需要运行时分支。
 */
export function applyTier(
  tools: ToolLike[],
  cfg: TierConfig
): {
  kept: ToolLike[];
  /** 被整体剔除的工具名（只读模式下的 github_api，或档位外的工具） */
  dropped: string[];
  /** 被剪掉写 action 的工具名 → 剪掉前的完整 enum（供诊断与测试消费） */
  pruned: Record<string, string[]>;
} {
  const allNames = tools.map((t) => t.name);
  const names = resolveToolNames(cfg.toolsets, allNames);

  let kept = names === 'all' ? [...tools] : tools.filter((t) => names.includes(t.name));
  const dropped = allNames.filter((n) => !kept.some((t) => t.name === n));
  const pruned: Record<string, string[]> = {};
  if (cfg.read_only !== true) return { kept, dropped, pruned };

  const readOnlyKept: ToolLike[] = [];
  for (const tool of kept) {
    const writes = WRITE_ACTIONS[tool.name] ?? [];
    if (writes === '*') {
      dropped.push(tool.name);
      continue;
    }
    const params = tool.parameters;
    const actionSchema = params?.properties?.action;
    if (!params || !Array.isArray(actionSchema?.enum) || writes.length === 0) {
      // 没有 action 维度的工具（github_help / github_status / github_ruleset）原样保留
      readOnlyKept.push(tool);
      continue;
    }
    const keptEnum = actionSchema.enum.filter((a: string) => !writes.includes(a));
    if (keptEnum.length === 0) {
      // 整只工具都是写操作 → 剔除，而不是留一个空 enum
      dropped.push(tool.name);
      continue;
    }
    pruned[tool.name] = [...actionSchema.enum];
    const allowed = new Set<string>(keptEnum);
    readOnlyKept.push({
      ...tool,
      description: `[只读模式] ${tool.description ?? ''}`.trim(),
      parameters: {
        ...params,
        properties: {
          ...params.properties,
          action: { ...actionSchema, enum: keptEnum },
        },
      },
      /**
       * 只读档位的**执行期**拦截。
       *
       * 为什么剪了 enum 还要再拦一次：本插件的工具是手写 descriptor，不是
       * `defineTool` 产物——宿主只把 parameters 当 JSON Schema 发给模型，**不做执行前
       * 参数校验**。所以模型只要发出一个被剪掉的 action（最常见的是从历史消息里复读，
       * 或用户手工构造），执行路径会照常走到 `gh pr merge`。实测确认过：
       * `applyTier([pr], {read_only:true})` 之后调 `{action:'merge', confirm:true}`
       * 仍然会真的发起合并。只剪 schema 等于只做了「看不见」，没做「做不到」。
       *
       * 位置在闸门之外（applyTier 在工厂 wrapWithGate 之后套），所以先拒只读违规，
       * 再走 confirm 闸门。
       */
      async execute(args: any, ctx: any) {
        const action = args?.action;
        if (typeof action === 'string' && !allowed.has(action)) {
          throw new Error(
            `只读模式（read_only: true）下 ${tool.name} 不允许 action "${action}"；可用: ${keptEnum.join(' / ')}`
          );
        }
        return tool.execute(args, ctx);
      },
    });
  }
  return { kept: readOnlyKept, dropped, pruned };
}
