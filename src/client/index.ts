import { GITHUB_PANEL_CSS } from './style.js';
import { createGithubPanelComponent } from './panel.js';

declare const React: any;
declare const styles: any;

export const name = 'dsh-github-flow';
export const inject = ['slots'] as const;

export function apply(ctx: any) {
  // 1. 注入样式
  if (typeof styles !== 'undefined' && styles.insert) {
    styles.insert(GITHUB_PANEL_CSS);
  } else if (typeof document !== 'undefined') {
    const styleEl = document.createElement('style');
    styleEl.textContent = GITHUB_PANEL_CSS;
    document.head.appendChild(styleEl);
  }

  // 2. 侧边栏图标组件
  function GithubSidebarIcon() {
    return React.createElement(
      'div',
      { className: 'dsh-github-icon', title: 'GitHub 工作台' },
      React.createElement(
        'svg',
        { viewBox: '0 0 16 16', width: 18, height: 18, fill: 'currentColor' },
        React.createElement('path', {
          d: 'M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z',
        })
      )
    );
  }

  // 3. 注册到 sidebar.panellist（排在 schedules 自动任务后，workspaces 工作区前）
  if (ctx.slots && typeof ctx.slots.register === 'function') {
    ctx.slots.register(
      {
        slot: 'sidebar.panellist',
        id: 'github',
        order: 20,
        label: 'GitHub',
      },
      GithubSidebarIcon
    );

    // 4. 注册中央主视图（main slot, key: 'github'）
    const GithubWorkspacePanel = createGithubPanelComponent();
    ctx.slots.register(
      {
        slot: 'main',
        key: 'github',
      },
      GithubWorkspacePanel
    );
  }
}
