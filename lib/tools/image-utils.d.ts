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
/** 图片下载护栏：与 Token 防溢出同哲学——单图/单次数量/总量三重上限 */
export declare const IMG_MAX_BYTES: number;
export declare const IMG_MAX_COUNT = 5;
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
}
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
