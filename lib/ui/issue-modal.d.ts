export interface IssueDetailModalProps {
    issueNumber: number;
    repoNameWithOwner?: string;
    cwd?: string | null;
    onClose: () => void;
    showToast?: (msg: string) => void;
}
/**
 * Issue 在线查看弹窗（详情 + 元数据 + 评论时间线）。
 *
 * 与 PrDetailModal 的差异：Issue 没有 diff 载荷，因此不做双栏文件区，
 * 单列纵向滚动即可——多出来的宽度全部让给 Markdown 正文，可读性更好。
 */
export declare function IssueDetailModal(props: IssueDetailModalProps): any;
