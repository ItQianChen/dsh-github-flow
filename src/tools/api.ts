import type { GhExecutor } from '../executor.js';

function normalizeOutput(data: any): Record<string, any> {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(data)) {
    return { items: data, count: data.length };
  }
  return { result: data !== undefined && data !== null ? data : '' };
}

export function createApiTool(executor: GhExecutor) {
  return {
    name: 'github_api',
    description: '通过 GitHub CLI 认证环境直接调用任意 GitHub REST 或 GraphQL API 端点（兜底逃生门）。支持 --jq 过滤。',
    parameters: {
      type: 'object',
      properties: {
        endpoint: {
          type: 'string',
          description: 'API 端点路径，例如 repos/{owner}/{repo}/releases 或 /user',
        },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PATCH', 'DELETE'],
          description: 'HTTP 方法，默认为 GET。',
        },
        jq: {
          type: 'string',
          description: '用于在 gh 内部预先过滤结果的 jq 表达式，极大精简返回结果。',
        },
        fields: {
          type: 'object',
          description: '请求参数或请求体键值对。',
        },
      },
      required: ['endpoint'],
    },
    output: {
      schema: { type: 'object' },
      render(args: any, value: any) {
        if (!value) return [{ type: 'text', text: '无返回内容' }];
        if (typeof value.result === 'string') {
          return [{ type: 'text', text: value.result }];
        }
        if (Array.isArray(value.items)) {
          return [{ type: 'text', text: JSON.stringify(value.items, null, 2) }];
        }
        return [{ type: 'text', text: JSON.stringify(value, null, 2) }];
      },
    },
    async execute(args: any, execContext: any) {
      const cwd = execContext?.cwd || process.cwd();
      const cmd = ['api', args.endpoint];

      if (args.method && args.method !== 'GET') {
        cmd.push('-X', args.method);
      }
      if (args.jq) {
        cmd.push('--jq', args.jq);
      }
      if (args.fields && typeof args.fields === 'object') {
        for (const [k, v] of Object.entries(args.fields)) {
          cmd.push('-F', `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`);
        }
      }

      const res = await executor.run(cmd, { cwd });
      if (!res.ok) throw new Error(res.error);
      return normalizeOutput(res.data !== undefined ? res.data : res.rawOutput);
    },
  };
}
