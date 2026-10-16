/**
 * 把 README 中的仓库内相对图片路径解析为 raw.githubusercontent 绝对 URL。
 * 强制落在 raw 域名模板内——不存在拼出任意域名的可能（SSRF 白名单天然覆盖）。
 * 路径以 ./ ../ /docs/ 等形态出现；URL 编码空格等字符；无效形态返回 null。
 */
export declare function resolveRelativeImageUrl(rel: string, owner: string, repo: string, branch: string): string | null;
/**
 * 判断 URL 是否为徽章类小图标（shields.io / badge 类 svg）。
 * README 图片场景默认过滤：用户要看的是截图/架构图，版本徽章是排版噪音；
 * include_badges=true 时保留（有人确实要查徽章状态）。
 */
export declare function isBadgeImageUrl(url: string): boolean;
/**
 * 从正文（Issue/PR body 或评论）提取图片 URL。
 * 域名白名单 + https 扩展名双条件：
 * - GitHub 四资产域名直接放行（用户上传/旧版上传/仓库引用/camo 代理）；
 * - 外链强制 https 且带图片扩展名——关闭恶意正文诱导访问内网元数据端点
 *   （169.254.169.254）等 SSRF 面，file:/// 与 http:// 一律拒绝。
 */
export declare function extractImageUrls(body: unknown): string[];
/**
 * README 专用提取：绝对 URL 走通用提取器；仓库内相对路径解析为 raw URL。
 * 默认过滤徽章小图标（isBadgeImageUrl），include_badges 开关保留。
 */
export declare function extractReadmeImageUrls(body: unknown, ctx: {
    owner: string;
    repo: string;
    branch: string;
    includeBadges?: boolean;
}): {
    urls: string[];
    relativeResolved: number;
    badgeFiltered: number;
};
/** 从魔数推断图片 MIME（下载内容才是事实源——URL 扩展名可伪造） */
export declare function sniffImageMime(buf: Buffer): string | null;
/** 图片下载护栏：按真实资源消耗计算——单图字节与目录总量，无张数截断 */
export declare const IMG_MAX_BYTES: number;
export declare const IMG_DIR_MAX_BYTES: number;
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
export declare function filterRequestedUrls(requested: unknown, extracted: string[]): {
    matched: string[];
    rejected: string[];
};
/**
 * 批量下载图片并落盘（Issue/PR 的 view_images 共用执行体）。
 * 每张经 executor 的二进制通道（gh api），魔数校验 + 三重护栏 + 内容寻址；
 * 权威目录不可写时降级系统临时目录（只损失跨会话去重）。
 * 单张失败不中断批次——failures 记录原因由调用方透传给 Agent。
 */
export declare function downloadImages(urls: string[], run: (url: string) => Promise<{
    ok: boolean;
    data?: unknown;
    error?: string;
}>): Promise<ImageBatchResult>;
/** render 的 image 内容块构造（text 块由调用方自行拼）：仅双合法字段才产出块 */
export declare function buildImageBlocks(value: any): any[];
/**
 * 校验并解析本地附件路径列表（Issue/PR --attach 专用）。
 * - 仅接受本地绝对路径或工作区相对路径
 * - 严格拒绝 URL（HTTP/HTTPS）
 * - 单批限制最多 50 个文件（GitHub 限制）
 * - 校验本地文件物理存在性
 */
export declare function validateAttachPaths(attachImages: unknown, cwd: string): string[];
