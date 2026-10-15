/**
 * spawn 形态的执行通道（stdin 可选注入）。
 *
 * 为什么存在：execFile 的 input 选项在本机（node 22.18.0 + Windows）实测从不写入
 * 子进程 stdin——既无数据也无 EOF，管道永久悬空（gh secret set 等需要 stdin 的
 * 命令会一直等到超时）。最小复现：execFile+input 对 `cmd /c more` 与 node 子进程
 * 均挂起；而 spawn + stdin.end(data) 全部正常。此函数即为后者的工程化封装，
 * 仅在调用方显式传入 stdin 时使用，其余路径保持 execFileAsync 零改动。
 *
 * 为什么超时要自己管：spawn 无 timeout 选项，用 kill + SIGTERM 兜底；
 * 输出按 maxBuffer 手工聚合（上限与 execFile 路径一致，15MB）。
 */
export declare function spawnWithStdin(ghPath: string, args: string[], opts: {
    cwd?: string;
    timeout: number;
    env: NodeJS.ProcessEnv;
    stdin: string;
}): Promise<{
    stdout: string | Buffer;
    stderr: string | Buffer;
    killed: boolean;
}>;
/**
 * 按码点安全截取字符串，等价于 String.prototype.slice 但对孤立的代理对（surrogate pair）做占位替换。
 * 为什么必须这样截：本文件末尾会按 UTF-8 字节数截断，而 node:child_process 把 stdout 按字节缓冲区
 * 切分后再 toString('utf8')，一个汉字被从中间切开时会变成 U+FFFD 替换字符。直接用 slice 会把半截
 * 代理对留在结果里，导致下游 JSON.stringify 产出孤立转义序列、写入文件时编码报错。
 */
export declare function safeSlice(input: string, start: number, end?: number): string;
/**
 * 以 UTF-8 字节数（而非字符串长度）为口径，从两端保留内容。
 * 为什么需要：maxOutputChars 数的是字符，中文一个字占 3 字节。只按字符限长时，
 * 中文环境下真实放行的字节量可达标称值的数倍，Token 预算保护会失真。
 * 采用二分查找定位截断点，避免对超大输出逐字符累加造成 O(n) 反复编码。
 */
export declare function cutByUtf8Bytes(input: string, headBytes: number, tailBytes: number): {
    head: string;
    tail: string;
    keptHeadBytes: number;
    keptTailBytes: number;
    truncated: boolean;
};
/**
 * 按「字符数 + UTF-8 字节数」双口径截断输出。
 * 抽成纯函数是刻意的：截断逻辑是崩溃高发区（切碎多字节字符、误伤 JSON、把二进制流截成垃圾），
 * 但通过真实 gh 命令很难稳定复现超限输出，抽出来才能用单元测试覆盖边界。
 */
export declare function truncateOutput(input: string, maxChars: number, maxBytes: number): {
    text: string;
    truncated: boolean;
};
