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
 * 把 README 中的仓库内相对图片路径解析为 raw.githubusercontent 绝对 URL。
 * 强制落在 raw 域名模板内——不存在拼出任意域名的可能（SSRF 白名单天然覆盖）。
 * 路径以 ./ ../ /docs/ 等形态出现；URL 编码空格等字符；无效形态返回 null。
 */
export function resolveRelativeImageUrl(rel: string, owner: string, repo: string, branch: string): string | null {
  if (typeof rel !== 'string' || !rel || rel.startsWith('#')) return null;
  // 任何带 scheme 的（http/javascript/data/file）与 Windows 盘符/UNC 路径都不是
  // 仓库内相对路径——统一拒绝，只接受纯 POSIX 相对形态
  if (/^[a-z][a-z0-9+.-]*:/i.test(rel)) return null;
  if (/^[a-z]:[\\/]/i.test(rel) || rel.startsWith('\\\\') || rel.includes('\\')) return null;
  // 去掉 ./ 前缀；拒绝越出仓库的绝对路径与查询串
  let p = rel.replace(/^\.\//, '');
  if (p.startsWith('/') || p.includes('..') || p.includes('?') || p.includes('#')) return null;
  // 只放行仓库路径的合法字符集（字母数字、CJK/Unicode 文件名、._/- 空格），
  // 从根上挡住把控制字符/协议残留拼进 raw URL 的畸形输入
  if (!/^[\w\-. /\u0080-\uffff]+$/u.test(p)) return null;
  try {
    const encoded = p.split('/').map(encodeURIComponent).join('/');
    return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${encoded}`;
  } catch {
    return null;
  }
}

/**
 * 判断 URL 是否为徽章类小图标（shields.io / badge 类 svg）。
 * README 图片场景默认过滤：用户要看的是截图/架构图，版本徽章是排版噪音；
 * include_badges=true 时保留（有人确实要查徽章状态）。
 */
export function isBadgeImageUrl(url: string): boolean {
  return /img\.shields\.io|badgen\.net|badge|\/svg\?style=/i.test(url);
}

/**
 * 从正文（Issue/PR body 或评论）提取图片 URL。
 * 域名白名单 + https 扩展名双条件：
 * - GitHub 四资产域名直接放行（用户上传/旧版上传/仓库引用/camo 代理）；
 * - 外链强制 https 且带图片扩展名——关闭恶意正文诱导访问内网元数据端点
 *   （169.254.169.254）等 SSRF 面，file:/// 与 http:// 一律拒绝。
 */
export function extractImageUrls(body: unknown): string[] {
  if (typeof body !== 'string' || !body) return [];
  const urls = new Set<string>();
  // HTML <img src="..."> 与 Markdown ![alt](url) 两种形态
  const pattern = /(?:<img[^>]+src="([^"]+)"|!\[[^\]]*\]\(([^)\s]+)[^)]*\))/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(body)) !== null) {
    const url = m[1] || m[2];
    if (!url) continue;
    const isGithubAsset =
      url.startsWith('https://github.com/user-attachments/') ||
      url.startsWith('https://user-images.githubusercontent.com/') ||
      url.startsWith('https://raw.githubusercontent.com/') ||
      url.startsWith('https://camo.githubusercontent.com/');
    const looksLikeImage = url.startsWith('https://') &&
      /\.(png|jpe?g|gif|webp|bmp|svg)([?#]|$)/i.test(url);
    if (isGithubAsset || looksLikeImage) urls.add(url);
  }
  return Array.from(urls);
}

/**
 * README 专用提取：绝对 URL 走通用提取器；仓库内相对路径解析为 raw URL。
 * 默认过滤徽章小图标（isBadgeImageUrl），include_badges 开关保留。
 */
export function extractReadmeImageUrls(
  body: unknown,
  ctx: { owner: string; repo: string; branch: string; includeBadges?: boolean }
): { urls: string[]; relativeResolved: number; badgeFiltered: number } {
  if (typeof body !== 'string' || !body) return { urls: [], relativeResolved: 0, badgeFiltered: 0 };
  const absolute = extractImageUrls(body);
  const result: string[] = [];
  let badgeFiltered = 0;

  const keep = (u: string) => {
    if (!ctx.includeBadges && isBadgeImageUrl(u)) { badgeFiltered++; return; }
    result.push(u);
  };
  for (const u of absolute) keep(u);

  // 相对路径：同一正则源头重新扫，取原始 src 再解析（绝对 URL 的正则会漏掉 ./docs/x.png）
  let relativeResolved = 0;
  const pattern = /(?:<img[^>]+src="([^"]+)"|!\[[^\]]*\]\(([^)\s]+)[^)]*\))/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(body)) !== null) {
    const raw = m[1] || m[2];
    if (!raw || /^[a-z]+:\/\//i.test(raw)) continue; // 只处理相对路径
    const resolved = resolveRelativeImageUrl(raw, ctx.owner, ctx.repo, ctx.branch);
    if (resolved) { keep(resolved); relativeResolved++; }
  }
  return { urls: Array.from(new Set(result)), relativeResolved, badgeFiltered };
}

/** 从魔数推断图片 MIME（下载内容才是事实源——URL 扩展名可伪造） */
export function sniffImageMime(buf: Buffer): string | null {
  // 长度下限只挡二进制格式（PNG/JPEG/GIF/WEBP 均有 ≥12 字节头）；SVG 是文本，
  // 无固定头长度——短到 4 字节的 '<svg' 也合法，必须在长度检查之前判定
  if (buf.slice(0, 4).toString('ascii').toLowerCase() === '<svg') return 'image/svg+xml';
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';                     // PNG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'; // JPEG
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';  // GIF
  if (buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp'; // RIFF....WEBP
  return null;
}

/** 图片下载护栏：按真实资源消耗计算——单图字节与目录总量，无张数截断 */
export const IMG_MAX_BYTES = 5 * 1024 * 1024;      // 单图 5MB
export const IMG_DIR_MAX_BYTES = 15 * 1024 * 1024;  // 图片缓存目录总量 15MB
export const IMG_DIR_LOW_WATERMARK = 10 * 1024 * 1024; // LRU 淘汰低水位目标 10MB

/**
 * 图片落盘目录（按内容寻址命名，重复下载天然去重）。
 *
 * 为什么支持 DSH_IMAGE_DIR 覆盖：目录里有 LRU 淘汰，按 mtime 删最旧文件。
 * 若测试把 13MB 假数据写进真实用户目录，淘汰就会优先命中用户更早下载的
 * 真图（用户图 mtime 更老，排序更靠前），造成静默数据丢失。
 * 测试必须能把目录重定向到临时区——这与 upgrade-manager 的 DSH_CLI_BIN /
 * DSH_PROFILE_DIR 覆盖是同一套思路。
 */
export function imageStoreDir(): string {
  const override = (process.env.DSH_IMAGE_DIR || '').trim();
  if (override) return path.resolve(override);
  return path.join(os.homedir(), '.dsh', 'data', 'dsh-github-flow', 'images');
}

/** 粗略统计图片目录现有总量（遍历一次，文件数有护栏上限不会失控） */
export function imageDirSize(dir: string): number {
  let total = 0;
  try {
    for (const f of fs.readdirSync(dir)) {
      try { total += fs.statSync(path.join(dir, f)).size; } catch {}
    }
  } catch {}
  return total;
}

export interface LruEvictionResult {
  freedBytes: number;
  evictedCount: number;
  evictedFiles: string[];
}

/**
 * LRU 图片缓存淘汰：当目录空间不足以容纳新图片时，按最后修改时间（mtime）淘汰最旧的历史文件。
 *
 * 护栏纪律：
 * 1. 保护当前批次已写入的文件（protectFiles）：避免同一批次内前一张图被后一张图立即顶替；
 * 2. 仅淘汰历史文件：按 mtime 升序排列（最旧优先），逐一清理直到目录大小降至目标低水位；
 * 3. 容错防御：单文件删除失败（如文件被锁定）静默跳过继续尝试下一个，绝不崩溃中断。
 */
export function evictLruImages(
  dir: string,
  neededBytes: number,
  protectFiles: Set<string> = new Set(),
  maxDirBytes: number = IMG_DIR_MAX_BYTES,
  targetBytes: number = IMG_DIR_LOW_WATERMARK
): LruEvictionResult {
  const result: LruEvictionResult = { freedBytes: 0, evictedCount: 0, evictedFiles: [] };
  if (!fs.existsSync(dir)) return result;

  let currentSize = imageDirSize(dir);
  if (currentSize + neededBytes <= maxDirBytes) {
    return result;
  }

  const candidates: Array<{ path: string; size: number; mtime: number }> = [];
  try {
    const entries = fs.readdirSync(dir);
    for (const name of entries) {
      const fullPath = path.join(dir, name);
      if (protectFiles.has(fullPath)) continue;
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) {
          candidates.push({ path: fullPath, size: stat.size, mtime: stat.mtimeMs });
        }
      } catch {}
    }
  } catch {
    return result;
  }

  candidates.sort((a, b) => a.mtime - b.mtime);

  for (const item of candidates) {
    if (currentSize + neededBytes <= maxDirBytes && currentSize <= targetBytes) {
      break;
    }
    try {
      fs.unlinkSync(item.path);
      currentSize -= item.size;
      result.freedBytes += item.size;
      result.evictedCount++;
      result.evictedFiles.push(item.path);
    } catch {}
  }

  return result;
}

export interface DownloadedImage {
  file: string;
  mimeType: string;
  url: string;
  bytes: number;
}

export interface ImageBatchResult {
  images: DownloadedImage[];
  failures: string[];
  /**
   * 因目录总量护栏触顶而未处理的 URL（结构化续传清单）。
   * Agent 可直接 image_urls: result.remaining 发起下一批——remaining 中的
   * URL 本就来自正文合法清单，交集校验天然通过，分批获取无需清理目录。
   */
  remaining?: string[];
}

/**
 * 交集过滤：把调用方请求的 URL 硬约束在正文实际提取的合法清单内。
 * 为什么必须交集而非直接信任传入：image_urls 来自模型生成参数，存在幻觉或
 * 被诱导传入任意 URL 的可能——交集把下载目标限定在本条 Issue/PR 引用过的
 * 图片范围，SSRF 防线（提取阶段的 https+域名白名单）自动覆盖全部下载目标。
 * 返回 { matched, rejected }：matched 保持请求顺序（Agent 按自己的关注顺序拿结果）。
 */
export function filterRequestedUrls(requested: unknown, extracted: string[]): { matched: string[]; rejected: string[] } {
  const matched: string[] = [];
  const rejected: string[] = [];
  const allow = new Set(extracted);
  for (const u of Array.isArray(requested) ? requested : []) {
    if (typeof u === 'string' && u && allow.has(u)) {
      matched.push(u);
    } else {
      rejected.push(typeof u === 'string' && u ? u : JSON.stringify(u));
    }
  }
  return { matched, rejected };
}

/**
 * 批量下载图片并落盘（Issue/PR 的 view_images 共用执行体）。
 * 每张经 executor 的二进制通道（gh api），魔数校验 + 三重护栏 + 内容寻址；
 * 权威目录不可写时降级系统临时目录（只损失跨会话去重）。
 * 单张失败不中断批次——failures 记录原因由调用方透传给 Agent。
 */
export async function downloadImages(
  urls: string[],
  run: (url: string) => Promise<{ ok: boolean; data?: unknown; error?: string }>
): Promise<ImageBatchResult> {
  let dir = imageStoreDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    dir = path.join(os.tmpdir(), 'dsh-github-flow-images');
    fs.mkdirSync(dir, { recursive: true });
  }
  let dirSize = imageDirSize(dir);
  const images: DownloadedImage[] = [];
  const failures: string[] = [];
  const remaining: string[] = [];
  const currentBatchFiles = new Set<string>();
  let budgetExhausted = false;

  // 无张数截断：字节护栏按真实资源消耗逐张判定。触顶后仍继续遍历——
  // 剩余 URL 全部收进 remaining 供 Agent 分批续传，而非静默丢弃。
  for (const url of urls) {
    if (budgetExhausted) {
      remaining.push(url);
      continue;
    }
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

    // 空间护栏检查：若超出目录上限，优先触发 LRU 淘汰历史文件以腾出预算
    if (dirSize + buf.length > IMG_DIR_MAX_BYTES) {
      const { freedBytes } = evictLruImages(dir, buf.length, currentBatchFiles);
      dirSize = Math.max(0, dirSize - freedBytes);
    }

    if (dirSize + buf.length > IMG_DIR_MAX_BYTES) {
      budgetExhausted = true;
      remaining.push(url);
      continue;
    }
    // 内容寻址（sha256 前 16 位）+ 扩展名：重复下载同一图去重，文件名可读
    const ext = mime.includes('svg') ? 'svg' : mime.split('/')[1].replace('jpeg', 'jpg');
    const file = path.join(dir, `${crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16)}.${ext}`);
    fs.writeFileSync(file, buf);
    currentBatchFiles.add(file);
    // 累计已写入量：下张图的总量护栏判定必须基于最新值（否则多图可突破上限）
    dirSize += buf.length;
    images.push({ file, mimeType: mime, url, bytes: buf.length });
  }

  // 触顶反馈（用户裁定的续传闭环）：已获取 N/M + 结构化剩余清单，
  // Agent 直接 image_urls: remaining 续传，无需从文本里解析 URL
  if (remaining.length > 0) {
    failures.push(`图片缓存目录达 15MB 上限：本次获取 ${images.length}/${urls.length} 张，剩余 ${remaining.length} 张未下载（可分批续传）`);
  }
  return { images, failures, remaining: remaining.length ? remaining : undefined };
}

/** render 的 image 内容块构造（text 块由调用方自行拼）：仅双合法字段才产出块 */
export function buildImageBlocks(value: any): any[] {
  const blocks: any[] = [];
  if (Array.isArray(value?.images)) {
    for (const img of value.images) {
      if (img && typeof img.file === 'string' && typeof img.mimeType === 'string') {
        blocks.push({ type: 'image', path: img.file, mimeType: img.mimeType });
      }
    }
  }
  return blocks;
}

/**
 * 校验并解析本地附件路径列表（Issue/PR --attach 专用）。
 * - 仅接受本地绝对路径或工作区相对路径
 * - 严格拒绝 URL（HTTP/HTTPS）
 * - 单批限制最多 50 个文件（GitHub 限制）
 * - 校验本地文件物理存在性
 */
export function validateAttachPaths(attachImages: unknown, cwd: string): string[] {
  if (!attachImages) return [];
  if (!Array.isArray(attachImages)) {
    throw new Error('`attach_images` 必须为本地文件路径数组（string[]）。');
  }
  if (attachImages.length > 50) {
    throw new Error(`单次上传附件数量超出 GitHub 限制（单批上限 50 个文件），当前提供: ${attachImages.length} 个。`);
  }

  const resolvedPaths: string[] = [];
  for (const item of attachImages) {
    if (typeof item !== 'string' || !item.trim()) {
      throw new Error('`attach_images` 数组中的文件路径不能为空。');
    }
    const trimmed = item.trim();
    // 严格禁止 URL
    if (/^https?:\/\//i.test(trimmed)) {
      throw new Error(
        `\`attach_images\` 仅支持本地文件路径上传，不支持网络 URL: "${trimmed}"。\n若需引用网络图片，请直接在正文/评论中使用 Markdown 语法 \`![说明](URL)\`，或先将其下载至本地再上传。`
      );
    }
    const absPath = path.isAbsolute(trimmed) ? trimmed : path.resolve(cwd, trimmed);
    if (!fs.existsSync(absPath)) {
      throw new Error(`指定的附件文件不存在: "${absPath}"（输入路径: "${trimmed}"）。`);
    }
    resolvedPaths.push(absPath);
  }
  return resolvedPaths;
}
