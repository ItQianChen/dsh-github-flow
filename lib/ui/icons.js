/**
 * 官方高清 SVG 矢量组件与图标徽章
 */
export function renderOctocat(size = 18, color = "currentColor") {
    return React.createElement("svg", {
        viewBox: "0 0 16 16",
        width: size,
        height: size,
        fill: color,
        style: { flexShrink: 0, display: "inline-block", verticalAlign: "middle" }
    }, React.createElement("path", {
        fillRule: "evenodd",
        clipRule: "evenodd",
        d: "M8 0C3.58 0 0 3.58 0 8C0 11.54 2.29 14.53 5.47 15.59C5.87 15.66 6.02 15.42 6.02 15.21C6.02 15.02 6.01 14.39 6.01 13.72C4 14.09 3.48 13.23 3.32 12.78C3.23 12.55 2.84 11.84 2.5 11.65C2.22 11.5 1.82 11.13 2.49 11.12C3.12 11.11 3.57 11.7 3.72 11.94C4.44 13.15 5.59 12.81 6.05 12.6C6.12 12.08 6.33 11.72 6.56 11.52C4.78 11.32 2.92 10.63 2.92 7.58C2.92 6.71 3.23 5.99 3.74 5.43C3.66 5.23 3.38 4.41 3.82 3.31C3.82 3.31 4.49 3.1 6.02 4.13C6.66 3.95 7.34 3.86 8.02 3.86C8.7 3.86 9.38 3.95 10.02 4.13C11.55 3.09 12.22 3.31 12.22 3.31C12.66 4.41 12.38 5.23 12.3 5.43C12.81 5.99 13.12 6.7 13.12 7.58C13.12 10.65 11.25 11.32 9.47 11.52C9.76 11.77 10.01 12.25 10.01 13C10.01 14.08 10 14.95 10 15.21C10 15.42 10.15 15.67 10.55 15.59C13.71 14.53 16 11.53 16 8C16 3.58 12.42 0 8 0Z"
    }));
}
export function renderGitIcon(size = 14, color = "#1296db") {
    return React.createElement("svg", {
        viewBox: "0 0 1024 1024",
        width: size,
        height: size,
        style: { flexShrink: 0, display: "inline-block", verticalAlign: "middle" }
    }, React.createElement("path", {
        fill: color,
        d: "M943.078 472.342L551.076 80.34c-21.859-21.859-57.626-21.859-79.485 0L79.589 472.342c-21.859 21.859-21.859 57.626 0 79.485l392.002 392.002c21.859 21.859 57.626 21.859 79.485 0l392.002-392.002c21.858-21.858 21.858-57.626 0-79.485z m-249.083 113.12c-37.939 0-68.693-30.755-68.693-68.693a68.532 68.532 0 0 1 4.136-23.521l-86.88-86.88v237.369c21.391 11.639 35.908 34.313 35.908 60.378 0 37.939-30.755 68.693-68.693 68.693s-68.693-30.755-68.693-68.693c0-27.314 15.944-50.903 39.03-61.973v-250.25c-23.022-10.642-39.03-33.879-39.03-60.907 0-7.808 1.401-15.272 3.853-22.243L344.061 207.871l44.159-44.159L490.738 266.23c5.58-1.503 11.418-2.378 17.473-2.378 37.076 0 67.132 30.056 67.132 67.132 0 6.055-0.875 11.893-2.378 17.473l102.241 102.241a68.68 68.68 0 0 1 18.789-2.623c37.939 0 68.693 30.755 68.693 68.693s-30.754 68.694-68.693 68.694z"
    }));
}
export function renderOctocatBadge(size = 32) {
    return React.createElement("div", {
        className: "dsh-octocat-badge",
        style: {
            width: size + "px",
            height: size + "px",
            borderRadius: Math.round(size * 0.25) + "px",
        }
    }, renderOctocat(Math.round(size * 0.58), "#ffffff"));
}
export function renderPluginBadge(hFactory) {
    var h = hFactory;
    return h("button", {
        className: "dsh-github-plugin-badge",
        type: "button",
        title: "本界面由第三方插件 dsh-github-flow 提供（非 DSH / GitHub 官方）。点击查看关于。",
        onClick: function (e) {
            e.stopPropagation();
            e.preventDefault();
            try {
                window.dispatchEvent(new CustomEvent("dsh-github-open-about"));
            }
            catch (err) { }
        },
    }, "插件");
}
