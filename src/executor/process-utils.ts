import { spawn } from 'node:child_process';

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
export function spawnWithStdin(
  ghPath: string,
  args: string[],
  opts: { cwd?: string; timeout: number; env: NodeJS.ProcessEnv; stdin: string }
): Promise<{ stdout: string | Buffer; stderr: string | Buffer; killed: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn(ghPath, args, {
      cwd: opts.cwd,
      env: opts.env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let totalBytes = 0;
    let killed = false;
    let settled = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill();
    }, opts.timeout);

    const settle = (err?: Error & { killed?: boolean; stderr?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve({ stdout: Buffer.concat(outChunks), stderr: Buffer.concat(errChunks), killed });
    };

    // 聚合上限：超出即杀（与 execFile maxBuffer 语义一致；gh 正常输出远小于此）
    const MAX_BYTES = 15 * 1024 * 1024;
    child.stdout?.on('data', (d: Buffer) => {
      totalBytes += d.length;
      outChunks.push(d);
      if (totalBytes > MAX_BYTES) { killed = true; child.kill(); }
    });
    child.stderr?.on('data', (d: Buffer) => { errChunks.push(d); });
    child.on('error', (err) => {
      // spawn 失败（如 ENOENT）对齐 execFile 的错误形状：code 保留在 Error 上
      const e = Object.assign(new Error(err.message), { code: (err as NodeJS.ErrnoException).code });
      settle(e);
    });
    child.on('close', (code, signal) => {
      if (killed) {
        // 超时/超量被杀：对齐 execFile 的 Timeout 错误形状（err.killed + signal）
        const e = Object.assign(new Error(`Command timed out after ${opts.timeout}ms`), { killed: true, signal: signal || 'SIGTERM' });
        settle(e);
        return;
      }
      if (code !== 0) {
        const e = Object.assign(new Error(`Command failed with exit code ${code}`), { code, stderr: Buffer.concat(errChunks).toString('utf8').slice(0, 800) });
        settle(e);
        return;
      }
      settle();
    });
    // stdin 注入：end(data) 半关闭（写完即 EOF），子进程流式读取或一次性读取均可
    child.stdin?.end(opts.stdin, (err?: Error | null) => {
      if (err && !settled) {
        const e = Object.assign(new Error(`stdin write failed: ${err.message}`), { code: 'EPIPE' });
        settle(e);
      }
    });
  });
}

/**
 * 按码点安全截取字符串，等价于 String.prototype.slice 但对孤立的代理对（surrogate pair）做占位替换。
 * 为什么必须这样截：本文件末尾会按 UTF-8 字节数截断，而 node:child_process 把 stdout 按字节缓冲区
 * 切分后再 toString('utf8')，一个汉字被从中间切开时会变成 U+FFFD 替换字符。直接用 slice 会把半截
 * 代理对留在结果里，导致下游 JSON.stringify 产出孤立转义序列、写入文件时编码报错。
 */
export function safeSlice(input: string, start: number, end?: number): string {
  const chars = Array.from(input);
  const from = Math.max(0, start);
  const to = end === undefined ? chars.length : Math.max(from, end);
  return chars.slice(from, to).map((c) => (c.length === 1 && c.charCodeAt(0) >= 0xd800 && c.charCodeAt(0) <= 0xdfff ? '\ufffd' : c)).join('');
}

/**
 * 以 UTF-8 字节数（而非字符串长度）为口径，从两端保留内容。
 * 为什么需要：maxOutputChars 数的是字符，中文一个字占 3 字节。只按字符限长时，
 * 中文环境下真实放行的字节量可达标称值的数倍，Token 预算保护会失真。
 * 采用二分查找定位截断点，避免对超大输出逐字符累加造成 O(n) 反复编码。
 */
export function cutByUtf8Bytes(input: string, headBytes: number, tailBytes: number): { head: string; tail: string; keptHeadBytes: number; keptTailBytes: number; truncated: boolean } {
  const encoder = new TextEncoder();
  const totalBytes = encoder.encode(input).length;
  if (totalBytes <= headBytes + tailBytes) {
    return { head: input, tail: '', keptHeadBytes: totalBytes, keptTailBytes: 0, truncated: false };
  }

  const chars = Array.from(input);
  const atByte = (limit: number, fromEnd: boolean): { count: number; bytes: number } => {
    let lo = 0;
    let hi = chars.length;
    let bytes = 0;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      const slice = fromEnd ? chars.slice(chars.length - mid) : chars.slice(0, mid);
      const size = encoder.encode(slice.join('')).length;
      if (size <= limit) {
        lo = mid;
        bytes = size;
      } else {
        hi = mid - 1;
      }
    }
    return { count: lo, bytes };
  };

  const headPart = atByte(headBytes, false);
  const tailPart = atByte(tailBytes, true);
  return {
    head: safeSlice(input, 0, headPart.count),
    tail: safeSlice(input, chars.length - tailPart.count),
    keptHeadBytes: headPart.bytes,
    keptTailBytes: tailPart.bytes,
    truncated: true,
  };
}

/**
 * 按「字符数 + UTF-8 字节数」双口径截断输出。
 * 抽成纯函数是刻意的：截断逻辑是崩溃高发区（切碎多字节字符、误伤 JSON、把二进制流截成垃圾），
 * 但通过真实 gh 命令很难稳定复现超限输出，抽出来才能用单元测试覆盖边界。
 */
export function truncateOutput(input: string, maxChars: number, maxBytes: number): { text: string; truncated: boolean } {
  // 双重口径限长：字符数守住 Token 预算，字节数守住真实传输量。
  // 中文场景下两者会分别触发，因此两条路径的提示文案必须区分，避免用户按错误的配置项去调参。
  if (input.length > maxChars) {
    // 保留前 1/3 字符和尾部 1/2 字符，保留开头上下文和错误尾部
    const headLen = Math.floor(maxChars * 0.35);
    const tailLen = Math.floor(maxChars * 0.55);
    const head = safeSlice(input, 0, headLen);
    const tail = safeSlice(input, input.length - tailLen);
    return {
      text: `${head}\n\n... [⚠️ 提示：内容过长已由 DSH GitHub 插件截断中间部分，当前截取前 ${Math.round(headLen / 1024)}KB 与后 ${Math.round(tailLen / 1024)}KB] ...\n\n${tail}`,
      truncated: true,
    };
  }

  const byteCut = cutByUtf8Bytes(input, Math.floor(maxBytes * 0.35), Math.floor(maxBytes * 0.55));
  if (byteCut.truncated) {
    // 这里必须用「实际保留的字节数」而非 maxChars 推导值：字节口径触发时 maxChars 往往远大于
    // 字节上限，早先版本照抄字符分支的算法，会报出与实际严重不符的「已保留 100KB」（实际仅数百字节）。
    return {
      text: `${byteCut.head}\n\n... [⚠️ 提示：内容超出 UTF-8 字节上限 (${maxBytes} bytes) 已截断中间部分，实际保留前 ${byteCut.keptHeadBytes} 字节与后 ${byteCut.keptTailBytes} 字节；如需放宽请调大配置项 maxOutputBytes] ...\n\n${byteCut.tail}`,
      truncated: true,
    };
  }

  return { text: input, truncated: false };
}
