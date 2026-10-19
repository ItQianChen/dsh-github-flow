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
/**
 * 确定性降级说明条（非错误）。
 *
 * 为什么要与 NetworkAlertBanner 分开：仓库关闭了 Issues、未启用 Discussions
 * 属于仓库的**稳定配置事实**，不是故障。把它塞进「网络连接失败」横幅会产生
 * 三重误导——用户去查网线、客户端启动阶梯重试、自动同步每 5 分钟空转一轮。
 * 这里只做安静陈述：一句话说明为什么列表是空的，不提供重试按钮。
 */
export declare function RepoNoticeBar(props: {
    isRightbar?: boolean;
    notices?: string[] | null;
}): any;
