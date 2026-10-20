export interface RepoSelectorProps {
    associatedRepos?: any[];
    currentRepo?: string;
    cwd: string | null;
    onRepoSwitched?: (repo: string) => void;
    showToast?: (msg: string) => void;
}
/**
 * 关联仓库（上游源仓库 ↔ 个人复刻 Fork）切换下拉组件。
 *
 * 为什么单仓库时返回 null：单仓库场景没有切换意义，保持现有卡片外观 100% 纯净零噪音；
 * 仅在检测到当前工作区存在双 remote 或 Fork 关联拓扑时激活。
 */
export declare function RepoSelectorDropdown(props: RepoSelectorProps): any;
