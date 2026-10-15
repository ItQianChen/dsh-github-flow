/**
 * 全景驾驶舱「⚙️ 设置」模态弹窗组件：左侧分区导航（数据同步 / 网络代理 / 更新设置 / 关于）+ 右侧内容区
 */
export declare function GlobalSyncSettingsModal(props: {
    isOpen: boolean;
    onClose: () => void;
    currentSettings: any;
    onSave: (newSettings: any) => void;
    onClearCache: () => void;
    initialSection?: string;
}): any;
