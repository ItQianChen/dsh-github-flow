export interface PrDetailModalProps {
    prNumber: number;
    repoNameWithOwner?: string;
    cwd?: string | null;
    onClose: () => void;
    showToast?: (msg: string) => void;
}
/**
 * PR 在线完整审阅与代码比对工作台模态弹窗组件。
 *
 * 架构设计：
 * 1. 单次网络往返拉取元数据与 Diff 切片，按文件切换比对 0ms 瞬间响应；
 * 2. 覆盖作者卡片、状态徽章、分支流向、正文描述、CI 与审查决定；
 * 3. 评论回复流 Timeline（Issue Comments + Review 评注）；
 * 4. 变动文件清单与行级高保真 Unified Diff 比对（绿色新增、红色删除、灰底 Hunk）。
 */
export declare function PrDetailModal(props: PrDetailModalProps): any;
