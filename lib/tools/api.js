import { wrapWithGate } from '../destructive.js';
function normalizeOutput(data) {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        return data;
    }
    if (Array.isArray(data)) {
        return { items: data, count: data.length };
    }
    return { result: data !== undefined && data !== null ? data : '' };
}
export function createApiTool(executor) {
    return wrapWithGate({
        name: 'github_api',
        description: '通过 GitHub CLI 认证环境直接调用任意 GitHub REST 或 GraphQL API 端点（兜底逃生门）。支持 --jq 过滤；fields 一律按字面字符串传参，避免 gh 的 -F 类型转换改写请求体。',
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
                    description: 'HTTP 方法，默认为 GET（GraphQL 端点默认 POST）。',
                },
                jq: {
                    type: 'string',
                    description: '用于在 gh 内部预先过滤结果的 jq 表达式，极大精简返回结果。',
                },
                fields: {
                    type: 'object',
                    description: '请求参数或请求体键值对。所有值按字面字符串（gh -f）发送，不做布尔/数字类型转换；嵌套对象请先在端点里用 JSON 字段或改用 raw 模式。',
                },
                raw: {
                    type: 'boolean',
                    description: '是否以原始响应体模式调用（附加 Accept: application/vnd.github.raw 并强制纯文本返回）。默认 false。适用于读取仓库文件内容，避免拿到 base64 编码的一整行。',
                },
                paginate: {
                    type: 'boolean',
                    description: '是否自动翻页聚合全部数据（映射为 gh api --paginate）。默认 false。适用于获取完整列表数据。',
                },
            },
            required: ['endpoint'],
        },
        output: {
            schema: { type: 'object' },
            render(args, value) {
                if (!value)
                    return [{ type: 'text', text: '无返回内容' }];
                if (typeof value.result === 'string') {
                    return [{ type: 'text', text: value.result }];
                }
                if (Array.isArray(value.items)) {
                    return [{ type: 'text', text: JSON.stringify(value.items, null, 2) }];
                }
                return [{ type: 'text', text: JSON.stringify(value, null, 2) }];
            },
        },
        async execute(args, execContext) {
            const { cwd, sessionId } = executor.resolveExecScope(execContext);
            // schema 声明了 required: ['endpoint']，但宿主校验不一定兜住（模型可能传空串）。
            // 不校验时 `gh api ""` 退出码 0 并返回整个 API 索引 JSON，模型会误以为"查到了数据"。
            const endpoint = typeof args.endpoint === 'string' ? args.endpoint.trim() : '';
            if (!endpoint) {
                throw new Error('endpoint 为必填参数：请传入 REST 路径（如 "repos/owner/repo/pulls" 或 "user"）或 graphql 查询。');
            }
            // 只拒绝以 - 开头的形态：那才是真正的注入面（会被 gh 当成 flag 吃掉）。
            // 注意不要要求"必须含 /"——`user` / `rate_limit` / `notifications` 都是合法单段端点，
            // 实测 `gh api user --jq .login` 正常返回；按"/"判形态会误杀这些合法调用。
            if (endpoint.startsWith('-')) {
                throw new Error(`endpoint 不能以 - 开头（会被 gh 当作命令行 flag）："${endpoint}"。`);
            }
            const cmd = ['api', endpoint];
            // gh api 默认在提供 -f/-F 时会自动将 HTTP 方法隐式切换为 POST。
            // 若调用方未指定 method，且 endpoint 不是以 graphql 开头，则按契约默认为 GET。
            // 必须显式传入 -X，防止带有 fields 参数的 GET 请求被 gh 自动改写为 POST 导致 422 报错。
            const isGraphql = endpoint.toLowerCase().startsWith('graphql');
            const method = args.method || (isGraphql ? 'POST' : 'GET');
            cmd.push('-X', method);
            if (args.jq) {
                cmd.push('--jq', args.jq);
            }
            if (args.paginate === true) {
                cmd.push('--paginate');
            }
            if (args.raw === true) {
                // 让 GitHub 直接返回文件字节而不是 {"content":"<base64>"} 包装。
                // 没有这个出口时，读任何仓库文件都只能拿到一整行 base64——既不可读，
                // 又会在超过截断阈值时被从中间切断而彻底无法还原。
                cmd.push('-H', 'Accept: application/vnd.github.raw');
            }
            if (args.fields && typeof args.fields === 'object') {
                for (const [k, v] of Object.entries(args.fields)) {
                    if (v === undefined || v === null)
                        continue;
                    if (typeof v === 'object') {
                        // 不把嵌套结构 JSON.stringify 后塞进 -F：gh 侧解析结果不可预期，且会静默产出错误请求体。
                        // 宁可显式报错，让调用方改用 raw 模式或把结构放进端点自身的 JSON 字段。
                        throw new Error(`github_api 的字段 "${k}" 是嵌套结构，无法作为表单参数发送。请改用 raw 模式传原始 JSON 请求体，或先把该结构序列化后作为字符串字段传入。`);
                    }
                    // 用 -f（字面字符串）而非 -F：-F 会做 "true"→布尔、"1"→数字的类型转换，
                    // 导致字符串请求体被悄悄改写，是跨 fork 提 PR 等场景失败的常见根因。
                    cmd.push('-f', `${k}=${String(v)}`);
                }
            }
            const res = await executor.run(cmd, { cwd, sessionId, rawText: args.raw === true });
            if (!res.ok)
                throw new Error(res.error);
            return normalizeOutput(res.data !== undefined ? res.data : res.rawOutput);
        },
    });
}
