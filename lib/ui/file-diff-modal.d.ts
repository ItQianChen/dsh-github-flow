/**
 * 文件 Diff 预览弹窗（未提交清单 / 提交详情共用）。
 *
 * 为什么合成一个组件：
 * 1. 未提交清单原本把整个 section 换成「二级视图」（`activeDiffFile ? 二级视图 : 列表`），
 *    观感像另开一页；改成弹窗后列表留在原位，返回成本从一次重渲染变成一次 Esc；
 * 2. 提交详情也要「点文件看 diff」，两处只是**数据来源**不同（一个是 `/api/github/file-diff`，
 *    一个是整包 patch 切出来的一段），外壳/配色/错误态/复制逻辑完全同构，分两份必然漂移。
 *
 * 404 降级保留：桌面端未重启时新路由不存在，先回退到常驻的 `/api/github/action`，
 * 再不行才显式提示「重启桌面端」——这是 file-diff 链路既有的自愈策略。
 */
export declare function FileDiffModal(props: {
    file: {
        path: string;
        status?: string;
        additions?: number;
        deletions?: number;
        isBinary?: boolean;
    };
    cwd?: string | null;
    /** 已有补丁正文（提交详情场景：由整包 patch 切出）；缺省时按未提交路由自行拉取 */
    diffText?: string | null;
    /** 顶部副标题（如提交短 SHA） */
    subtitle?: string | null;
    /** 附加提示（如补丁被截断） */
    note?: string | null;
    loading?: boolean;
    error?: string | null;
    zIndex?: number;
    onClose: () => void;
    onOpenInDsh?: ((filePath: string) => void) | null;
}): any;
