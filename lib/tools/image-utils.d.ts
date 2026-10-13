/**
 * 从正文（Issue/PR body 或评论）提取图片 URL。
 * 域名白名单 + https 扩展名双条件：
 * - GitHub 四资产域名直接放行（用户上传/旧版上传/仓库引用/camo 代理）；
 * - 外链强制 https 且带图片扩展名——关闭恶意正文诱导访问内网元数据端点
 *   （169.254.169.254）等 SSRF 面，file:/// 与 http:// 一律拒绝。
 */
export declare function extractImageUrls(body: unknown): string[];
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
