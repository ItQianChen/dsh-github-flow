/**
 * 独立沉浸式指南大窗口组件 (Dedicated Large Reader Modal)
 *
 * 核心设计理由与交互契约：
 * 1. 彻底从设置小窗口剥离，打造 920px 宽屏、85vh 高度的沉浸式阅读视界；
 * 2. 深度适配 DSH 主题系统，全套样式基于 CSS 类与主题变量，支持深色 (data-ds-dark-theme) 与浅色无缝自适应；
 * 3. 拒绝技术自嗨清单，从用户行动视角组织：3分钟快速上手、Agent实战Prompt、双界面图解与常见排错；
 * 4. 宽屏卡片排列，配备 Prompt 一键复制到剪贴板与短暂反馈气泡；
 * 5. 监听键盘 Esc 键与遮罩点击秒关，复制完指令直接回到聊天输入框发送，零打扰、不中断工作流。
 *
 * 【内容与代码同步的纪律】
 * 本文件里出现的工具数量、action 数量、Tab 名称、按钮文案，全部以当前代码为准：
 * 工具矩阵 = src/main.ts 的 18 处 ctx.tools.register；
 * Tab 布局 = src/client.ts 的 TAB_DEFS 与 src/ui/workspace-panel.ts 的四个标签；
 * 若后续增删工具或 Tab，必须同步改这里，否则用户会照着过时说明去找不存在的入口。
 */
export declare function GithubHelpModal(props: {
    isOpen: boolean;
    onClose: () => void;
    initialTab?: string;
}): any;
