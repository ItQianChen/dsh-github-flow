/**
 * 分支查看与快速切换下拉选择器组件
 */
export declare function BranchSelectorDropdown(props: {
    currentBranch: string;
    cwd: string | null;
    branchesData?: any;
    onBranchSwitched?: (branch: string) => void;
    showToast?: (msg: string) => void;
}): any;
