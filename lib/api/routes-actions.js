import { isSafeExternalUrl, sendJson } from './route-helpers.js';
export function registerActionRoutes(deps, executor, cacheMap, globalCache) {
    const { bindRoute } = deps;
    // 1. 强制刷新缓存
    bindRoute({
        kind: 'exact',
        path: '/api/github/refresh',
        handler: async (req, res) => {
            cacheMap.clear();
            globalCache.clear();
            sendJson(res, 200, { ok: true, message: '缓存已清空，下次读取将拉取最新数据' });
        },
    });
    // 2. 右侧栏快捷操作代理接口
    bindRoute({
        kind: 'exact',
        path: '/api/github/action',
        handler: async (req, res) => {
            if (req.method !== 'POST') {
                sendJson(res, 405, { ok: false, message: '仅支持 POST 请求' });
                return;
            }
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', async () => {
                try {
                    const payload = body ? JSON.parse(body) : {};
                    const cwd = payload.cwd || process.cwd();
                    switch (payload.action) {
                        case 'create_pr': {
                            const cmd = ['pr', 'create', '--title', payload.title || 'Update', '--body', payload.body || 'Created from DSH Rightbar'];
                            if (payload.draft)
                                cmd.push('--draft');
                            const r = await executor.run(cmd, { cwd });
                            if (!r.ok)
                                throw new Error(r.error);
                            sendJson(res, 200, { ok: true, message: 'PR 创建成功', url: r.rawOutput });
                            break;
                        }
                        case 'create_issue': {
                            const cmd = ['issue', 'create', '--title', payload.title || 'New Issue', '--body', payload.body || 'Created from DSH Rightbar'];
                            const r = await executor.run(cmd, { cwd });
                            if (!r.ok)
                                throw new Error(r.error);
                            sendJson(res, 200, { ok: true, message: 'Issue 创建成功', url: r.rawOutput });
                            break;
                        }
                        case 'open_browser': {
                            // 原实现把 payload.url 直接拼进 shell 字符串再交给 exec()，
                            // 形如 https://x" & calc & " 的 URL 可闭合引号并追加任意命令——本机任意页面
                            // 都能通过 POST 这个端点触发命令执行。
                            // 现在改为：先用 URL 解析白名单协议，再用 execFile 参数数组传递，全程不经过 shell。
                            if (!isSafeExternalUrl(payload.url)) {
                                throw new Error('url 参数无效：只允许 http/https 开头的完整地址');
                            }
                            const { execFile } = await import('node:child_process');
                            const [bin, args] = process.platform === 'win32'
                                ? ['cmd', ['/c', 'start', '', payload.url]]
                                : process.platform === 'darwin'
                                    ? ['open', [payload.url]]
                                    : ['xdg-open', [payload.url]];
                            // 不 await，也不让打开失败反向影响接口语义；仅记录以便排查
                            execFile(bin, args, (err) => {
                                if (err)
                                    console.warn('[dsh-github-flow] 打开浏览器失败:', err?.message || err);
                            });
                            sendJson(res, 200, { ok: true, message: '已在浏览器打开' });
                            break;
                        }
                        case 'open_terminal': {
                            const command = typeof payload.command === 'string' ? payload.command.trim() : 'gh auth login';
                            // 严格白名单过滤，严防任意命令注入
                            const allowedCommands = [
                                'gh auth login',
                                'winget install --id GitHub.cli',
                                'brew install gh',
                                'sudo apt install gh',
                                'sudo dnf install gh',
                            ];
                            if (!allowedCommands.includes(command)) {
                                throw new Error(`不支持唤起该指令: ${command}`);
                            }
                            const { execFile } = await import('node:child_process');
                            let bin = 'cmd';
                            let args = [];
                            if (process.platform === 'win32') {
                                bin = 'cmd';
                                args = ['/c', 'start', 'powershell', '-NoExit', '-Command', command];
                            }
                            else if (process.platform === 'darwin') {
                                bin = 'osascript';
                                args = ['-e', `tell application "Terminal" to do script "${command}"`, '-e', 'tell application "Terminal" to activate'];
                            }
                            else {
                                bin = 'x-terminal-emulator';
                                args = ['-e', command];
                            }
                            execFile(bin, args, (err) => {
                                if (err)
                                    console.warn('[dsh-github-flow] 唤起终端失败:', err?.message || err);
                            });
                            sendJson(res, 200, { ok: true, message: '已请求唤起系统终端' });
                            break;
                        }
                        default:
                            sendJson(res, 400, { ok: false, message: `未知的操作类型: ${payload.action}` });
                    }
                }
                catch (err) {
                    sendJson(res, 500, { ok: false, error: err.message || '操作执行失败' });
                }
            });
        },
    });
}
