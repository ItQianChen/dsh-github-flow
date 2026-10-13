/**
 * Issue / PR 共享的图片附件工具链。
 *
 * 为什么从 issue.ts 抽出：PR 与 Issue 的图片机制完全同构（同样的
 * user-attachments 域名、<img>/![]() 双语法、同一评论 API），view_images
 * 在两侧落地时共享提取/嗅探/护栏/落盘全部逻辑，避免两份拷贝漂移。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
/**
 * 从正文（Issue/PR body 或评论）提取图片 URL。
 * 域名白名单 + https 扩展名双条件：
 * - GitHub 四资产域名直接放行（用户上传/旧版上传/仓库引用/camo 代理）；
 * - 外链强制 https 且带图片扩展名——关闭恶意正文诱导访问内网元数据端点
 *   （169.254.169.254）等 SSRF 面，file:/// 与 http:// 一律拒绝。
 */
export function extractImageUrls(body) {
    if (typeof body !== 'string' || !body)
        return [];
    const urls = new Set();
    // HTML <img src="..."> 与 Markdown ![alt](url) 两种形态
    const pattern = /(?:<img[^>]+src="([^"]+)"|!\[[^\]]*\]\(([^)\s]+)[^)]*\))/gi;
    let m;
    while ((m = pattern.exec(body)) !== null) {
        const url = m[1] || m[2];
        if (!url)
            continue;
        const isGithubAsset = url.startsWith('https://github.com/user-attachments/') ||
            url.startsWith('https://user-images.githubusercontent.com/') ||
            url.startsWith('https://raw.githubusercontent.com/') ||
            url.startsWith('https://camo.githubusercontent.com/');
        const looksLikeImage = url.startsWith('https://') &&
            /\.(png|jpe?g|gif|webp|bmp|svg)([?#]|$)/i.test(url);
        if (isGithubAsset || looksLikeImage)
            urls.add(url);
    }
    return Array.from(urls);
}
/** 从魔数推断图片 MIME（下载内容才是事实源——URL 扩展名可伪造） */
export function sniffImageMime(buf) {
    // 长度下限只挡二进制格式（PNG/JPEG/GIF/WEBP 均有 ≥12 字节头）；SVG 是文本，
    // 无固定头长度——短到 4 字节的 '<svg' 也合法，必须在长度检查之前判定
    if (buf.slice(0, 4).toString('ascii').toLowerCase() === '<svg')
        return 'image/svg+xml';
    if (buf.length < 12)
        return null;
    if (buf[0] === 0x89 && buf[1] === 0x50)
        return 'image/png'; // PNG
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
        return 'image/jpeg'; // JPEG
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46)
        return 'image/gif'; // GIF
    if (buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50)
        return 'image/webp'; // RIFF....WEBP
    return null;
}
/** 图片下载护栏：与 Token 防溢出同哲学——单图/单次数量/总量三重上限 */
export const IMG_MAX_BYTES = 5 * 1024 * 1024; // 单图 5MB
export const IMG_MAX_COUNT = 5; // 单次最多 5 张
export const IMG_DIR_MAX_BYTES = 15 * 1024 * 1024; // 图片缓存目录总量 15MB
/** 图片落盘目录（按内容寻址命名，重复下载天然去重） */
function imageStoreDir() {
    return path.join(os.homedir(), '.dsh', 'data', 'dsh-github-flow', 'images');
}
/** 粗略统计图片目录现有总量（遍历一次，文件数有护栏上限不会失控） */
function imageDirSize(dir) {
    let total = 0;
    try {
        for (const f of fs.readdirSync(dir)) {
            try {
                total += fs.statSync(path.join(dir, f)).size;
            }
            catch { }
        }
    }
    catch { }
    return total;
}
/**
 * 批量下载图片并落盘（Issue/PR 的 view_images 共用执行体）。
 * 每张经 executor 的二进制通道（gh api），魔数校验 + 三重护栏 + 内容寻址；
 * 权威目录不可写时降级系统临时目录（只损失跨会话去重）。
 * 单张失败不中断批次——failures 记录原因由调用方透传给 Agent。
 */
export async function downloadImages(urls, run) {
    let dir = imageStoreDir();
    try {
        fs.mkdirSync(dir, { recursive: true });
    }
    catch {
        dir = path.join(os.tmpdir(), 'dsh-github-flow-images');
        fs.mkdirSync(dir, { recursive: true });
    }
    let dirSize = imageDirSize(dir);
    const images = [];
    const failures = [];
    for (const url of urls.slice(0, IMG_MAX_COUNT)) {
        const res = await run(url);
        const buf = res.ok && Buffer.isBuffer(res.data) ? res.data : null;
        if (!buf) {
            failures.push(`${url.slice(-24)}: ${res.error || '非二进制响应'}`);
            continue;
        }
        if (buf.length > IMG_MAX_BYTES) {
            failures.push(`${url.slice(-24)}: 超过单图 5MB 上限（${(buf.length / 1024 / 1024).toFixed(1)}MB）`);
            continue;
        }
        const mime = sniffImageMime(buf);
        if (!mime) {
            failures.push(`${url.slice(-24)}: 内容不是图片（魔数校验失败）`);
            continue;
        }
        if (dirSize + buf.length > IMG_DIR_MAX_BYTES) {
            failures.push(`${url.slice(-24)}: 图片缓存目录超过 15MB 总量上限，请清理后重试`);
            continue;
        }
        // 内容寻址（sha256 前 16 位）+ 扩展名：重复下载同一图去重，文件名可读
        const ext = mime.includes('svg') ? 'svg' : mime.split('/')[1].replace('jpeg', 'jpg');
        const file = path.join(dir, `${crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16)}.${ext}`);
        fs.writeFileSync(file, buf);
        // 累计已写入量：下张图的总量护栏判定必须基于最新值（否则多图可突破上限）
        dirSize += buf.length;
        images.push({ file, mimeType: mime, url, bytes: buf.length });
    }
    return { images, failures };
}
/** render 的 image 内容块构造（text 块由调用方自行拼）：仅双合法字段才产出块 */
export function buildImageBlocks(value) {
    const blocks = [];
    if (Array.isArray(value?.images)) {
        for (const img of value.images) {
            if (img && typeof img.file === 'string' && typeof img.mimeType === 'string') {
                blocks.push({ type: 'image', path: img.file, mimeType: img.mimeType });
            }
        }
    }
    return blocks;
}
