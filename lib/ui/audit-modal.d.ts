export declare function AuditModal(props: {
    isOpen: boolean;
    onClose: () => void;
    /**
     * 作用域：
     * - `global`（默认）：全景驾驶舱入口，展示本机**全部**工作区的记录；
     * - `workspace`：右栏工作区入口，只展示**当前工作区**（按 cwd 精确匹配）的记录。
     *
     * 为什么由入口决定而不是在弹窗里自己判断：同一个弹窗组件两种语义，
     * 判定依据只能是"从哪儿打开的"；让组件去猜 cwd 属于哪个作用域只会出现
     * "驾驶舱里也只剩一个仓库的记录"这种自相矛盾的状态。
     */
    scope?: 'global' | 'workspace';
    cwd?: string | null;
}): any;
