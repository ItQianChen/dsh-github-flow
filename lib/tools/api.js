import { wrapWithGate } from '../destructive.js';
import { resolveBodySource } from './body-input.js';
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
                    description: 'HTTP 方法，默认为 GET（GraphQL 端点或提供 input_file 时默认 POST）。',
                },
                jq: {
                    type: 'string',
                    description: '用于在 gh 内部预先过滤结果的 jq 表达式，极大精简返回结果。',
                },
                fields: {
                    type: 'object',
                    description: '请求参数或请求体键值对。所有值按字面字符串（gh -f）发送，不做布尔/数字类型转换；嵌套结构无法作为表单参数，请把完整请求体写入本地文件后用 input_file 传入。',
                },
                input_file: {
                    type: 'string',
                    description: '请求体来源：本地文件路径（相对路径按当前工作区解析）。映射 gh api --input，文件内容原样作为请求体（GraphQL 需写 {"query":...} 形式的 JSON）；与 fields 并用时 gh 会把 fields 追加为查询参数。',
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
            /*
             * 请求体可来自本地文件（`--input -` + stdin）。
             *
             * 只接文件、不接内联：`fields` 就是内联通道，二者按契约可共存（gh 把 fields 追加为
             * 查询参数），所以这里不传 inline——传了会被 helper 判成互斥而误拒合法调用。
             * `maxChars: 0`：`--input` 的请求体是 JSON/GraphQL，不受 GitHub「正文 65536 字符」
             * 口径约束，套用正文上限会把合法的大 mutation 拦死。
             */
            const inputFileGiven = typeof args.input_file === 'string' && args.input_file.trim().length > 0;
            const body = resolveBodySource({ file: args.input_file }, { cwd, flag: '--input', fileFlag: '--input', inlineField: 'fields', fileField: 'input_file', maxChars: 0 });
            // 空文件若静默放过，发出去的是一个没有请求体的请求——服务端报的错与真实原因无关，极难排查
            if (inputFileGiven && body.chars === 0) {
                throw new Error(`input_file 内容为空：指向的文件没有任何内容（"${args.input_file}"）。请写入完整请求体后重试，或改用 fields。`);
            }
            // 请求体来自文件时经 stdin 注入（`--input -`）：绕开 Windows 约 32K 的命令行上限
            const stdinPatch = (b) => (b.stdin === undefined ? {} : { stdin: b.stdin });
            // gh api 默认在提供 -f/-F 时会自动将 HTTP 方法隐式切换为 POST。
            // 若调用方未指定 method，且 endpoint 不是以 graphql 开头，则按契约默认为 GET。
            // 必须显式传入 -X，防止带有 fields 参数的 GET 请求被 gh 自动改写为 POST 导致 422 报错。
            const isGraphql = endpoint.toLowerCase().startsWith('graphql');
            // 带了 `--input` 却不给 -X 时，gh 仍按 GET 发出，请求体会被服务端静默丢弃——有正文即 POST
            const method = args.method || (isGraphql || body.chars > 0 ? 'POST' : 'GET');
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
                        // 宁可显式报错，让调用方改用 input_file 传完整请求体，或把结构序列化后作为字符串字段。
                        throw new Error(`github_api 的字段 "${k}" 是嵌套结构，无法作为表单参数发送。请把完整请求体写入本地 JSON 文件后用 input_file 传入（映射 gh api --input），或先把该结构序列化后作为字符串字段传入。`);
                    }
                    // 用 -f（字面字符串）而非 -F：-F 会做 "true"→布尔、"1"→数字的类型转换，
                    // 导致字符串请求体被悄悄改写，是跨 fork 提 PR 等场景失败的常见根因。
                    cmd.push('-f', `${k}=${String(v)}`);
                }
            }
            // 与 fields 并用时 gh 会把 fields 追加为查询参数，两者不互斥
            cmd.push(...body.argv);
            const res = await executor.run(cmd, { cwd, sessionId, rawText: args.raw === true, ...stdinPatch(body) });
            if (!res.ok)
                throw new Error(res.error);
            return normalizeOutput(res.data !== undefined ? res.data : res.rawOutput);
        },
    });
}
