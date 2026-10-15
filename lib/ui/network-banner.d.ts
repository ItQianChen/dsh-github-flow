/**
 * 网络连接异常与离线状态醒目横幅组件
 */
export declare function NetworkAlertBanner(props: {
    isRightbar?: boolean;
    networkErrorReason?: string | null;
    lastSyncedAt?: number;
    onRefresh?: () => void;
    onOpenProxy?: () => void;
}): any;
