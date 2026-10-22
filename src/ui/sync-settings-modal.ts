declare const React: any;
declare function renderOctocatBadge(size?: number): any;
declare function getCacheStorageMeta(): any;
declare function saveLocalSyncSettings(settings: any): void;
declare function clearStoredGlobalOverview(): void;

/**
 * 全景驾驶舱「⚙️ 设置」模态弹窗组件：左侧分区导航（数据同步 / 网络代理 / 更新设置 / 关于）+ 右侧内容区
 */
export function GlobalSyncSettingsModal(props: {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: any;
  onSave: (newSettings: any) => void;
  onClearCache: () => void;
  initialSection?: string;
}) {
  if (!props.isOpen) return null;

  var [activeSection, setActiveSection] = React.useState(props.initialSection || "sync");
  var [strategy, setStrategy] = React.useState(props.currentSettings.strategy || "swr");
  var [localGitWatch, setLocalGitWatch] = React.useState(props.currentSettings.localGitWatch !== false);
  var [cloudSyncIntervalMs, setCloudSyncIntervalMs] = React.useState(Number(props.currentSettings.cloudSyncIntervalMs) || 600000);
  var [cacheMeta, setCacheMeta] = React.useState(getCacheStorageMeta());
  var [clearTip, setClearTip] = React.useState("");

  React.useEffect(function () {
    if (props.isOpen && props.currentSettings) {
      setStrategy(props.currentSettings.strategy || "swr");
      setLocalGitWatch(props.currentSettings.localGitWatch !== false);
      setCloudSyncIntervalMs(Number(props.currentSettings.cloudSyncIntervalMs) || 600000);
    }
  }, [props.isOpen, props.currentSettings]);

  var [updateMode, setUpdateMode] = React.useState("official");
  var [updateBusy, setUpdateBusy] = React.useState(false);
  var [updateMsg, setUpdateMsg] = React.useState(null as { kind: "ok" | "err" | "info"; text: string } | null);
  var [aboutVersion, setAboutVersion] = React.useState(null as string | null);

  React.useEffect(function () {
    if (!props.isOpen) return;
    fetch("/api/github/update-settings")
      .then(function (r: any) { return r.json(); })
      .then(function (j: any) {
        if (j && j.ok && j.data && j.data.mode) {
          setUpdateMode(j.data.mode);
        }
      })
      .catch(function () {});
    fetch("/api/github/check-update")
      .then(function (r: any) { return r.json(); })
      .then(function (j: any) {
        if (j && j.ok && j.data && j.data.currentVersion) setAboutVersion(j.data.currentVersion);
      })
      .catch(function () {});
  }, [props.isOpen]);

  var [proxyEnabled, setProxyEnabled] = React.useState(false);
  var [proxyUrl, setProxyUrl] = React.useState("");
  var [proxyNoProxy, setProxyNoProxy] = React.useState("localhost,127.0.0.1");
  var [proxyApplyNpm, setProxyApplyNpm] = React.useState(true);
  var [proxyBusy, setProxyBusy] = React.useState(false);
  var [proxyMsg, setProxyMsg] = React.useState(null as { kind: "ok" | "err" | "info"; text: string } | null);
  var [proxyProbe, setProxyProbe] = React.useState(null as { ok: boolean; latencyMs?: number; error?: string } | null);

  React.useEffect(function () {
    if (!props.isOpen) return;
    fetch("/api/github/proxy")
      .then(function (r: any) { return r.json(); })
      .then(function (j: any) {
        if (j && j.ok && j.state) {
          setProxyEnabled(Boolean(j.state.config && j.state.config.url));
          setProxyUrl((j.state.config && j.state.config.url) || "");
          setProxyNoProxy((j.state.config && j.state.config.noProxy) || "localhost,127.0.0.1");
          setProxyApplyNpm(j.state.config ? j.state.config.applyToPackageManager !== false : true);
          if (j.state.lastProbe) setProxyProbe(j.state.lastProbe);
        }
      })
      .catch(function () {});
  }, [props.isOpen]);

  React.useEffect(function () {
    var onKeyDown = function (e: any) {
      if (e.key === "Escape" || e.keyCode === 27) {
        props.onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return function () { window.removeEventListener("keydown", onKeyDown); };
  }, [props.onClose]);

  React.useEffect(function () {
    if (props.isOpen && props.initialSection) {
      setActiveSection(props.initialSection);
    }
  }, [props.isOpen, props.initialSection]);

  var handleUpdateSave = function () {
    setUpdateBusy(true);
    setUpdateMsg(null);
    fetch("/api/github/update-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: updateMode }),
    })
      .then(function (r: any) { return r.json(); })
      .then(function (j: any) {
        setUpdateBusy(false);
        if (j && j.ok && j.data) {
          var d = j.data;
          var text = "";
          if (d.mode === "off") {
            text = "✅ 已关闭自动检查更新（/gh upgrade 与一键升级仍可用），无需重启";
          } else if (d.probe && d.probe.latestVersion) {
            text = "✅ 已切换至" + d.description + "，当前最新版本 v" + d.probe.latestVersion
              + (d.probe.hasUpdate ? "（有可用更新）" : "（已是最新）") + "，无需重启";
          } else {
            text = "✅ 已切换至" + d.description + "，但新源暂时不可达（版本探测失败，稍后会自动重试）；设置已生效，无需重启";
          }
          if (d.persisted === false) {
            text += "；⚠️ 设置写盘失败，重启后需重新选择";
          }
          setUpdateMsg({ kind: "ok", text: text });
        } else {
          setUpdateMsg({ kind: "err", text: (j && j.message) || "保存失败" });
        }
      })
      .catch(function (e: any) {
        setUpdateBusy(false);
        setUpdateMsg({ kind: "err", text: "网络请求失败: " + (e && e.message ? e.message : e) });
      });
  };

  var h = React.createElement;

  var handleSave = function () {
    var updated = {
      strategy: strategy,
      localGitWatch: localGitWatch,
      cloudSyncIntervalMs: Number(cloudSyncIntervalMs) || 600000,
    };
    saveLocalSyncSettings(updated);
    props.onSave(updated);
    props.onClose();
  };

  var handleClear = function () {
    clearStoredGlobalOverview();
    props.onClearCache();
    setCacheMeta({ exists: false, sizeKb: 0, savedAt: 0 });
    setClearTip("本地缓存已彻底清空！");
    setTimeout(function () { setClearTip(""); }, 2000);
  };

  var handleProxySave = function () {
    setProxyBusy(true);
    setProxyMsg(null);
    fetch("/api/github/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: proxyEnabled ? proxyUrl.trim() : "",
        noProxy: proxyNoProxy,
        applyToPackageManager: proxyApplyNpm,
      }),
    })
      .then(function (r: any) { return r.json(); })
      .then(function (j: any) {
        setProxyBusy(false);
        if (j && j.ok) {
          setProxyMsg({
            kind: "ok",
            text: j.state && j.state.config && j.state.config.url
              ? "🌐 代理已保存并全局生效（驾驶舱 / 右侧栏 / Agent 工具 / 升级链路），无需重启"
              : "已切换为系统默认网络（直连或系统环境代理），无需重启",
          });
          if (j.state && j.state.lastProbe) setProxyProbe(j.state.lastProbe);
        } else {
          setProxyMsg({ kind: "err", text: (j && j.message) || "保存失败" });
        }
      })
      .catch(function (e: any) {
        setProxyBusy(false);
        setProxyMsg({ kind: "err", text: "网络请求失败: " + (e && e.message ? e.message : e) });
      });
  };

  var handleProxyProbe = function () {
    setProxyBusy(true);
    setProxyMsg(null);
    fetch("/api/github/proxy/probe", { method: "POST" })
      .then(function (r: any) { return r.json(); })
      .then(function (j: any) {
        setProxyBusy(false);
        if (j && j.ok && j.probe) {
          setProxyProbe(j.probe);
          setProxyMsg(j.probe.ok
            ? { kind: "ok", text: "✅ GitHub API 可达 (" + j.probe.latencyMs + "ms)" }
            : { kind: "err", text: "❌ " + (j.probe.error || "探测失败") });
        } else {
          setProxyMsg({ kind: "err", text: (j && j.message) || "探测失败" });
        }
      })
      .catch(function (e: any) {
        setProxyBusy(false);
        setProxyMsg({ kind: "err", text: "探测请求失败: " + (e && e.message ? e.message : e) });
      });
  };

  return h(
    "div",
    { className: "dsh-github-modal-overlay", onClick: props.onClose },
    h(
      "div",
      {
        className: "dsh-github-modal-dialog",
        onClick: function (e: any) { e.stopPropagation(); },
      },
      h("div", { className: "dsh-github-modal-header" },
        h("h3", { style: { margin: 0, fontSize: "16px", fontWeight: 600 } }, "⚙️ 设置"),
        h("button", {
          style: { background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "var(--dsw-alias-label-secondary, #656d76)" },
          onClick: props.onClose,
        }, "✕")
      ),
      h("div", { className: "dsh-github-modal-body" },
        h("div", { className: "dsh-github-settings-nav" },
          h("button", {
            className: "dsh-github-settings-nav-item" + (activeSection === "sync" ? " active" : ""),
            onClick: function () { setActiveSection("sync"); },
          }, "🔄 数据同步"),
          h("button", {
            className: "dsh-github-settings-nav-item" + (activeSection === "proxy" ? " active" : ""),
            onClick: function () { setActiveSection("proxy"); },
          }, "🌐 网络代理"),
          h("button", {
            className: "dsh-github-settings-nav-item" + (activeSection === "update" ? " active" : ""),
            onClick: function () { setActiveSection("update"); },
          }, "⬆️ 更新设置"),
          h("button", {
            className: "dsh-github-settings-nav-item" + (activeSection === "about" ? " active" : ""),
            onClick: function () { setActiveSection("about"); },
          }, "ℹ️ 关于")
        ),
        h("div", { className: "dsh-github-settings-content" },
          activeSection === "sync" ? h("div", null,
            h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginBottom: "14px", lineHeight: "1.5" } },
              "配置 GitHub 全景驾驶舱的数据拉取节奏。启用秒开模式可利用本地持久化缓存消除每次打开时的漫长等待。"
            ),
            h("div", { style: { marginBottom: "16px" } },
              h("div", { style: { fontSize: "13px", fontWeight: 600, marginBottom: "8px" } }, "数据刷新策略（三选一）"),
              h("div", {
                className: "dsh-github-radio-card" + (strategy === "swr" ? " active" : ""),
                onClick: function () { setStrategy("swr"); },
              },
                h("input", { type: "radio", name: "sync-strategy", className: "dsh-github-radio", checked: strategy === "swr", readOnly: true }),
                h("div", null,
                  h("div", { style: { fontWeight: 600, fontSize: "13px" } }, "⚡ 秒开展示旧数据 (SWR, 强烈推荐)"),
                  h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } },
                    "打开立即展示上次本地缓存（0ms秒开），后台静默同步一次最新状态。"
                  )
                )
              ),
              h("div", {
                className: "dsh-github-radio-card" + (strategy === "auto" ? " active" : ""),
                onClick: function () { setStrategy("auto"); },
              },
                h("input", { type: "radio", name: "sync-strategy", className: "dsh-github-radio", checked: strategy === "auto", readOnly: true }),
                h("div", { style: { flex: 1 } },
                  h("div", { style: { fontWeight: 600, fontSize: "13px" } }, "☁️ 云端数据定时自动同步 (SWR + 定时轮询)"),
                  h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } },
                    "首屏秒开旧数据并立即拉新，拉取完成后开始计时；循环静默更新 PR、Issue 与 Actions。内置窗口息屏自动避让，防止耗尽配额。"
                  ),
                  strategy === "auto"
                    ? h("div", {
                        style: { display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" },
                        onClick: function (e: any) { e.stopPropagation(); },
                      },
                        h("span", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", fontWeight: 500 } }, "同步周期:"),
                        h("select", {
                          className: "dsh-github-btn-sm",
                          style: { padding: "4px 8px", fontSize: "12px", cursor: "pointer", background: "var(--dsw-alias-bg-base, #fff)" },
                          value: cloudSyncIntervalMs,
                          onChange: function (e: any) { setCloudSyncIntervalMs(Number(e.target.value)); },
                        },
                          h("option", { value: 300000 }, "5 分钟 (高频感知)"),
                          h("option", { value: 600000 }, "10 分钟 (标准推荐)"),
                          h("option", { value: 1800000 }, "30 分钟 (轻量节省)"),
                          h("option", { value: 3600000 }, "1 小时 (极低频)")
                        )
                      )
                    : null
                )
              ),
              h("div", {
                className: "dsh-github-radio-card" + (strategy === "manual" ? " active" : ""),
                onClick: function () { setStrategy("manual"); },
              },
                h("input", { type: "radio", name: "sync-strategy", className: "dsh-github-radio", checked: strategy === "manual", readOnly: true }),
                h("div", null,
                  h("div", { style: { fontWeight: 600, fontSize: "13px" } }, "📋 仅在手动点击时拉取 (Manual Only)"),
                  h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } },
                    "打开只浏览本地缓存，绝不自动触发后台 gh 进程，最省电、最省资源；想更新时点击「🔄 刷新」即可。"
                  )
                )
              )
            ),
            h("div", { style: { marginBottom: "16px", borderTop: "1px solid var(--dsw-alias-border-l2, #e1e4e8)", paddingTop: "14px" } },
              h("div", { style: { fontSize: "13px", fontWeight: 600, marginBottom: "8px" } }, "高级自动化与状态感知"),
              h("label", {
                style: { display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer", padding: "6px 8px", borderRadius: "6px", background: localGitWatch ? "var(--dsw-alias-bg-module-platform, rgba(9, 105, 218, 0.06))" : "transparent" },
              },
                h("input", {
                  type: "checkbox",
                  style: { marginTop: "3px" },
                  checked: localGitWatch,
                  onChange: function (e: any) { setLocalGitWatch(e.target.checked); },
                }),
                h("div", null,
                  h("div", { style: { fontWeight: 600, fontSize: "12px" } }, "📁 本地 Git 改动实时感知 (仅右侧栏生效)"),
                  h("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } },
                    "定向监听当前仓库的 .git 核心元数据，代码修改、暂存与分支切换毫秒级自动对齐右侧栏，零网络流量消耗；全景首页不挂载，保持轻量。"
                  )
                )
              )
            ),
            h("div", {
              className: "dsh-github-cache-info-box",
            },
              h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                h("span", null, cacheMeta.exists
                  ? `📦 本地缓存: 约 ${cacheMeta.sizeKb} KB (上次保存: ${new Date(cacheMeta.savedAt).toLocaleTimeString()})`
                  : "📦 暂无本地持久化缓存"
                ),
                cacheMeta.exists ? h("button", {
                  className: "dsh-github-btn-sm",
                  style: { padding: "3px 8px", fontSize: "11px", color: "var(--dsw-alias-state-error-primary, #cf222e)" },
                  onClick: handleClear,
                }, "🗑️ 清空缓存") : null
              ),
              clearTip ? h("div", { style: { color: "var(--dsw-alias-state-success, #2ea043)", marginTop: "4px", fontWeight: 500 } }, clearTip) : null
            )
          ) : activeSection === "update" ? h("div", null,
            h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginBottom: "14px", lineHeight: "1.5" } },
              "选择插件新版本检测所用的 npm 源。检测与升级流量均遵循「🌐 网络代理」分区设置：启用 http/https 代理时自动经代理访问；socks5 代理下 npm 检测为直连（gh 与升级子进程链路仍走代理）。无论选择哪个源，安装与升级流程本身不受影响。"
            ),
            h("div", { style: { marginBottom: "16px" } },
              h("div", { style: { fontSize: "13px", fontWeight: 600, marginBottom: "8px" } }, "更新源"),
              h("div", {
                className: "dsh-github-radio-card" + (updateMode === "official" ? " active" : ""),
                onClick: function () { setUpdateMode("official"); },
              },
                h("input", { type: "radio", className: "dsh-github-radio", checked: updateMode === "official", readOnly: true }),
                h("div", null,
                  h("div", { style: { fontWeight: 600, fontSize: "13px" } }, "🌍 npm 官方源 (推荐)"),
                  h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } },
                    "版本全球首发最及时，刚发布的新版立即可见；国内直连可能较慢。"
                  )
                )
              ),
              h("div", {
                className: "dsh-github-radio-card" + (updateMode === "mirror" ? " active" : ""),
                onClick: function () { setUpdateMode("mirror"); },
              },
                h("input", { type: "radio", className: "dsh-github-radio", checked: updateMode === "mirror", readOnly: true }),
                h("div", null,
                  h("div", { style: { fontWeight: 600, fontSize: "13px" } }, "🇨🇳 国内镜像 (npmmirror)"),
                  h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } },
                    "阿里云镜像，国内访问快；同步存在分钟级延迟，刚发布的新版可能暂时查不到。"
                  )
                )
              ),
              h("div", {
                className: "dsh-github-radio-card" + (updateMode === "off" ? " active" : ""),
                onClick: function () { setUpdateMode("off"); },
              },
                h("input", { type: "radio", className: "dsh-github-radio", checked: updateMode === "off", readOnly: true }),
                h("div", null,
                  h("div", { style: { fontWeight: 600, fontSize: "13px" } }, "⛔ 不检查更新"),
                  h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } },
                    "关闭自动检查与新版提示横幅；/gh upgrade 命令与一键升级仍然可用。"
                  )
                )
              )
            ),
            h("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } },
              h("button", {
                className: "dsh-github-btn-sm dsh-github-primary-btn",
                disabled: updateBusy,
                onClick: handleUpdateSave,
              }, updateBusy ? "验证中..." : "💾 保存并全局应用"),
              updateMsg ? h("span", {
                style: {
                  fontSize: "12px",
                  lineHeight: "1.5",
                  color: updateMsg.kind === "ok"
                    ? "var(--dsw-alias-state-success, #2ea043)"
                    : updateMsg.kind === "err"
                      ? "var(--dsw-alias-state-error-primary, #cf222e)"
                      : "var(--dsw-alias-label-secondary, #656d76)",
                },
              }, updateMsg.text) : null
            )
          ) : activeSection === "about" ? h("div", null,
            h("div", { style: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" } },
              renderOctocatBadge(40),
              h("div", null,
                h("div", { style: { fontSize: "15px", fontWeight: 600 } }, "DSH GitHub Flow"),
                h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } },
                  "当前版本: v" + (aboutVersion || "…")
                )
              )
            ),
            h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginBottom: "14px", lineHeight: "1.6" } },
              "让 DeepSeek Harness Agent 拥有操作 GitHub 的原生手脚。原生复用宿主机 gh CLI 安全凭据，深度打通本地 Git 工作区与云端协作，提供 19 大领域 Agent 工具、人类 Slash 指令、Web 全景驾驶舱与一键跨平台升级。"
            ),
            h("div", { style: { display: "flex", flexDirection: "column", gap: "8px", marginBottom: "14px" } },
              h("div", { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" } },
                h("span", { style: { minWidth: "64px", color: "var(--dsw-alias-label-secondary, #656d76)" } }, "仓库地址"),
                h("a", { href: "https://github.com/ItQianChen/dsh-github-flow", target: "_blank", rel: "noopener noreferrer", style: { color: "var(--dsw-alias-link, #0969da)" } }, "github.com/ItQianChen/dsh-github-flow")
              ),
              h("div", { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" } },
                h("span", { style: { minWidth: "64px", color: "var(--dsw-alias-label-secondary, #656d76)" } }, "npm 包"),
                h("a", { href: "https://www.npmjs.com/package/dsh-github-flow", target: "_blank", rel: "noopener noreferrer", style: { color: "var(--dsw-alias-link, #0969da)" } }, "npmjs.com/package/dsh-github-flow")
              ),
              h("div", { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" } },
                h("span", { style: { minWidth: "64px", color: "var(--dsw-alias-label-secondary, #656d76)" } }, "开源协议"),
                h("a", { href: "https://github.com/ItQianChen/dsh-github-flow/blob/master/LICENSE", target: "_blank", rel: "noopener noreferrer", style: { color: "var(--dsw-alias-link, #0969da)" } }, "MIT License")
              )
            ),
            h("div", {
              className: "dsh-github-about-star-box",
              style: {
                display: "flex",
                alignItems: "center",
                gap: "10px",
              },
            },
              h("span", { style: { fontSize: "18px" } }, "⭐"),
              h("div", { style: { flex: 1, fontSize: "12px", lineHeight: "1.5" } },
                "如果这个插件对你的日常研发有帮助，欢迎到 GitHub 仓库点个 Star 支持一下——你的 Star 是持续迭代的动力！也欢迎提交 Issue 与 PR。"
              ),
              h("a", {
                target: "_blank",
                href: "https://github.com/ItQianChen/dsh-github-flow",
                rel: "noopener noreferrer",
                className: "dsh-github-btn-sm dsh-github-primary-btn",
              }, "🌟 去点 Star")
            )
          ) : h("div", null,
            h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginBottom: "14px", lineHeight: "1.5" } },
              "设置后插件的 GitHub 数据链路（本页面、右侧栏、Agent 工具调用、版本升级）全部经代理访问；未启用时默认使用系统环境代理或直连。保存后立即生效，无需重启。"
            ),
            h("label", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", cursor: "pointer", fontSize: "13px" } },
              h("input", {
                type: "checkbox",
                checked: proxyEnabled,
                onChange: function (e: any) { setProxyEnabled(Boolean(e.target.checked)); },
              }),
              "启用代理"
            ),
            proxyEnabled ? h("div", null,
              h("div", { style: { fontSize: "12px", marginBottom: "4px" } }, "代理地址"),
              h("input", {
                className: "dsh-github-input",
                style: { width: "100%", boxSizing: "border-box", padding: "6px 10px", fontSize: "13px", marginBottom: "10px" },
                placeholder: "http://127.0.0.1:7890 或 socks5h://127.0.0.1:1080（DNS 由代理解析）",
                value: proxyUrl,
                onChange: function (e: any) { setProxyUrl(e.target.value); },
              }),
              h("div", { style: { fontSize: "12px", marginBottom: "4px" } }, "NO_PROXY 排除列表（逗号分隔，localhost 与 127.0.0.1 强制包含）"),
              h("input", {
                className: "dsh-github-input",
                style: { width: "100%", boxSizing: "border-box", padding: "6px 10px", fontSize: "12px", marginBottom: "10px" },
                value: proxyNoProxy,
                onChange: function (e: any) { setProxyNoProxy(e.target.value); },
              }),
              h("label", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", cursor: "pointer", fontSize: "12px" } },
                h("input", {
                  type: "checkbox",
                  checked: proxyApplyNpm,
                  onChange: function (e: any) { setProxyApplyNpm(Boolean(e.target.checked)); },
                }),
                "同时应用于 npm 版本探测与一键升级"
              )
            ) : null,
            h("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } },
              h("button", {
                className: "dsh-github-btn-sm",
                style: { padding: "5px 12px", fontSize: "12px" },
                disabled: proxyBusy || !proxyEnabled,
                onClick: handleProxyProbe,
                title: "经当前配置探测 GitHub API 连通性（约 2.5 秒）",
              }, "🧪 测试连通性"),
              h("button", {
                className: "dsh-github-btn-sm",
                style: {
                  padding: "5px 14px",
                  fontSize: "12px",
                  background: "var(--dsw-alias-link, #0969da)",
                  color: "#ffffff",
                  borderColor: "var(--dsw-alias-link, #0969da)",
                  fontWeight: 600,
                },
                disabled: proxyBusy,
                onClick: handleProxySave,
              }, proxyBusy ? "处理中..." : "💾 保存并全局应用"),
              proxyProbe ? h("span", {
                style: {
                  fontSize: "12px",
                  fontWeight: 500,
                  color: proxyProbe.ok ? "var(--dsw-alias-state-success, #2ea043)" : "var(--dsw-alias-state-error-primary, #cf222e)",
                },
                title: proxyProbe.error || "",
              }, proxyProbe.ok ? "✅ " + proxyProbe.latencyMs + "ms" : "❌ 探测失败") : null
            ),
            proxyMsg ? h("div", {
              style: {
                marginTop: "8px",
                fontSize: "12px",
                lineHeight: "1.5",
                color: proxyMsg.kind === "ok"
                  ? "var(--dsw-alias-state-success, #2ea043)"
                  : proxyMsg.kind === "err"
                    ? "var(--dsw-alias-state-error-primary, #cf222e)"
                    : "var(--dsw-alias-label-secondary, #656d76)",
              },
            }, proxyMsg.text) : null
          )
        )
      ),
      h("div", { className: "dsh-github-modal-footer" },
        activeSection === "sync" ? h("button", {
          className: "dsh-github-btn-sm",
          style: {
            padding: "6px 16px",
            background: "var(--dsw-alias-link, #0969da)",
            color: "#ffffff",
            borderColor: "var(--dsw-alias-link, #0969da)",
            fontWeight: 600,
          },
          onClick: handleSave,
        }, "保存同步设置") : null,
        h("button", {
          className: "dsh-github-btn-sm",
          style: { padding: "6px 14px" },
          onClick: props.onClose,
        }, activeSection === "sync" ? "取消" : "完成")
      )
    )
  );
}
