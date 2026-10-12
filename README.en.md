# DSH GitHub Flow (`dsh-github-flow`)

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-github-flow"><img src="https://img.shields.io/npm/v/dsh-github-flow.svg?style=flat-square&color=0969da" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/dsh-github-flow"><img src="https://img.shields.io/npm/dm/dsh-github-flow.svg?style=flat-square&color=2ea043" alt="npm downloads" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="license" /></a>
  <a href="https://deepseek-harness.github.io/deepseek-harness/"><img src="https://img.shields.io/badge/Cordis-Compatible-8957e5.svg?style=flat-square" alt="Cordis" /></a>
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-informational.svg?style=flat-square" alt="Platform" />
</p>

<p align="center">
  <b>Give DeepSeek Harness Agents native hands and feet to operate GitHub, crafting an immersive collaboration cockpit for developers.</b><br>
  Natively reuses host <code>gh</code> CLI login credentials to eliminate Personal Access Token (PAT) leaks; deeply bridges local Git workspaces with remote GitHub collaboration, equipped with <b>5 core domain Agent tools</b>, <b>human slash commands</b>, <b>Web UI visual cockpits</b>, and <b>cross-platform one-click seamless upgrades</b>.
</p>

<p align="center">
  <b><a href="./README.md">简体中文</a></b> | <b>English</b>
</p>

---

## 🎯 Why `dsh-github-flow`?

When using AI Agents for collaborative coding, developers frequently hit these fragmentation friction points:

| Collaborative Scenario | Traditional Approach (Friction-Heavy) | `dsh-github-flow` (Native Experience) |
| :--- | :--- | :--- |
| **Agent PRs & Code Review** | Manually push branch in browser, click through GitHub web pages to open PRs, breaking autonomous loops. | **Autonomous PRs & Reviews**: Just tell the Agent *"Create a PR for this branch"*; Agent calls `github_pr` to publish and review diffs automatically. |
| **CI / Actions Failure Debugging** | Sifting through pages of Actions logs in a browser, copying stack traces to chat for debugging. | **Pinpoint Error Extraction**: Tell the Agent *"Why did CI fail?"*; Agent calls `github_run(log_failed)` to grab failed step logs and patch code instantly. |
| **Security & Token Management** | Pasting plain-text Personal Access Tokens (PATs) in plugin configs, risking token leaks and permission sprawl. | **Zero Token Exposure**: Directly reuses local `gh auth login` credentials via native OS Keychains/Keyrings securely. |
| **Context Switching Overhead** | Jumping back and forth between VS Code, browser GitHub tabs, and DSH chat windows. | **Immersive Dual Cockpit**: Live PR status, Actions pipelines, and 3D issue matrices right inside DSH. |
| **First-Screen Latency & Loading** | Staring at full-screen spinners for 8~15s while waiting for heavy background `gh` processes. | **SWR 0ms Instant Render**: Instantly displays local persistent snapshots; dedicated settings modal to customize sync intervals and manual mode. |
| **Plugin Upgrades & Maintenance** | Manually checking npm registry versions, complicated commands, fear of breaking configs. | **Idle Silent Detection + One-Click Upgrade**: Dual-registry acceleration, auto macOS/Windows adaptation, upgrade with one click. |

---

## 🤖 Core Agent Tools: Equipping Agents with Native GitHub Powers

Consolidates scattered GitHub endpoints into **5 core domain tools**, featuring **Token Budget Protection (default 24KB intelligent truncation)** and **Zero-argument CWD auto-binding**.

### 1. `github_pr`: Pull Request Lifecycle & Automated Code Review
> **Example Agent Prompts**:
> - *"Check if there are any open PRs awaiting my review in this repository."*
> - *"Create a PR for the current branch titled 'feat: add dark mode' with a brief summary of changes."*
> - *"Review code diffs in PR #12 and provide security and refactoring suggestions."*
> - *"Did CI checks pass for PR #8? If so, squash merge it and delete the source branch."*

* **Supported Actions**:
  * `list`: List open PRs with author, review decisions, and CI status;
  * `view`: Inspect PR description, metadata, and mergeability;
  * `diff`: Retrieve complete code diffs (safely truncated against token limits);
  * `checks`: Audit CI status check rollups and test suites;
  * `create`: Auto-create PRs (supports draft mode & `--dry-run`);
  * `review`: Submit code reviews (`APPROVE`, `REQUEST_CHANGES`, `COMMENT`);
  * `merge`: Merge pull requests (`squash` / `merge` / `rebase`, optional `delete_branch`).

---

### 2. `github_run`: Actions CI Pipeline & Failure Diagnostics (Agent Auto-Fix Core)
> **Example Agent Prompts**:
> - *"Why did the latest Actions workflow fail? Extract failed step logs and fix the code."*
> - *"Show me the status of the last 5 CI runs in this repository."*
> - *"Rerun the failed workflow from earlier."*

* **Supported Actions**:
  * `log_failed` (🔥 **Killer Feature**): **Optimized for Agents**; automatically extracts isolated error logs from failed steps for instant root-cause analysis;
  * `list`: View recent workflow runs and conclusions;
  * `view`: Inspect jobs and steps for a specific run ID;
  * `rerun`: Re-trigger failed CI runs;
  * `cancel`: Cancel in-progress workflows.

---

### 3. `github_issue`: Issue Tracking & Closed-Loop Tasks
> **Example Agent Prompts**:
> - *"File an issue for the memory leak we just reproduced, labeled 'bug' and 'backend'."*
> - *"List all open issues assigned to me."*
> - *"Comment on Issue #45: 'Fixed on master branch, awaiting verification'."*
> - *"Close Issue #45."*

* **Supported Actions**:
  * `list`: Query issues with flexible filters;
  * `view`: Read issue body and discussion history;
  * `create`: Create new issues (title, body, labels, assignees);
  * `comment`: Append debugging updates or notes;
  * `close` / `reopen`: Manage issue lifecycle states.

---

### 4. `github_repo`: Repository Exploration & Cross-Repo Code Search
> **Example Agent Prompts**:
> - *"Search for usages of 'createPrTool' across this repository."*
> - *"Search GitHub for popular open-source repositories related to 'dsh-plugin'."*
> - *"Show repository metadata and star count for cli/cli."*

* **Supported Actions**:
  * `view`: View repository metadata (default branch, stars, description, visibility);
  * `search_code`: Search code symbols in current or specified repositories;
  * `search_repos`: Search open-source GitHub repositories globally.

---

### 5. `github_api`: Low-Level Escape Hatch
> **Example Agent Prompts**:
> - *"Call GitHub API to fetch latest releases of current repository and parse tag names with jq."*

* **Core Strength**: Call any GitHub REST or GraphQL API using local credentials with `--jq` filtering and `raw` text mode.

---

## 🖥️ Native Web UI Workspace & Sync Preferences

No more window switching! Seamlessly integrated into DSH with DSW design tokens and instant light/dark theme adaptation.

### 1. Global Cockpit (Main Navigation Slot)
Access via the GitHub icon in the main left navigation:
* **⚡ 0ms Instant Render (SWR Persistent Cache)**: Powered by local snapshot persistence; say goodbye to full-screen 8~15s spinner freezes and enjoy instant dashboard loading;
* **📦 Live Freshness Status Pill**: Transparently communicates data freshness right next to the title (`[📦 Local Snapshot (21m ago)]` ➔ `[⏳ Syncing in background...]` ➔ `[✅ Up to date (15:30)]` ➔ `[⚠️ Timeout, cached data preserved]`);
* **Account-Wide Overview**: Live view of all cloud repositories, default branches, and star counts;
* **Local Workspace Matrix**: Automatically detects open projects and bridges local directories with remote repos;
* **3D Issue Governance Matrix**: Categorizes issues into *"📥 User Reported"*, *"🎯 Assigned to Me"*, and *"✍️ Created by Me"* with responsive pill filters;
* **Update Notification Banner**: Smoothly glides down when an update is available with one-click automated upgrade.

<p align="center">
  <img src="./docs/images/1.png" alt="GitHub Global Cockpit" width="100%" />
</p>

### 2. Session Right Sidebar Panel (Workspace Drawer)
Located in the right drawer of every chat workspace:
* **Context Auto-Binding**: Automatically locks onto the active Git repository;
* **Freshness Pill Alignment**: Compact indicator `[📦 Local Snapshot (2m ago)]` with live `[🔄 Refresh]` button, 100% aligned with global rules;
* **PR Status Pills**: Live PR inspection with CI checks and review badges;
* **Workspace Open Issues List**: Direct issue task review with author badges and external links;
* **Latest Actions Pipeline**: Real-time CI workflow status tracking;
* **Quick Action Grid**: Open repo in browser, jump to Issues/PRs, create PRs with one click.

<p align="center">
  <img src="./docs/images/2.png" alt="Session Right Sidebar Panel" width="100%" />
</p>

### 3. Data Sync & Cache Settings (Sync Preferences Modal)
Click **`[⚙️ Sync Settings]`** in the top right of the Cockpit to adjust synchronization:
* **Three Flexible Sync Strategies**:
  * **⚡ Instant Render (SWR, Recommended)**: Instantly displays local cache (0ms), silently syncing latest state in background;
  * **📋 Manual Only (Energy Saver)**: Browse local cache only; zero background `gh` processes triggered;
  * **⏱️ Periodic Auto Poll**: Background polling according to custom intervals while cockpit is open.
* **Custom Polling Intervals**: Choose from 1 min / 5 mins (Default) / 15 mins / 30 mins (Energy Saver) / 1 hour / Never;
* **Visual Cache Management**: Real-time snapshot size and timestamp visibility with one-click `[🗑️ Clear Cache]`.

<p align="center">
  <img src="./docs/images/3.png" alt="Data Sync Settings Modal" width="85%" />
</p>

---

## 🚀 Installation Guide

### Step 1: Prerequisites
Ensure GitHub CLI (`gh`) is installed and authenticated:
```bash
# Windows
winget install --id GitHub.cli

# macOS
brew install gh

# Login (one-time setup)
gh auth login
```

### Step 2: Install into DSH

Run in your DSH environment:

```bash
# Scenario A: DSH Desktop Edition (Desktop Profile)
dsh plugin --profile desktop add dsh-github-flow

# Scenario B: DSH Web / CLI Environment
pnpm dsh plugin add dsh-github-flow
```

> 💡 **Notice (24-Hour Supply-Chain Security Lock Window)**:  
> DSH's bundled package manager enforces a supply-chain safety policy (`minimum-release-age = 24h`) by default to mitigate malicious package takeovers. Within **24 hours** of a new version release, running bare-name install commands without a version suffix will automatically fall back to the preceding stable version that has matured past 24 hours. To **install a newly released version immediately**, append the explicit version tag:
> ```bash
> dsh plugin --profile desktop add dsh-github-flow@0.1.8
> ```
> Once 24 hours have passed since release, the standard bare-name command will resolve to the latest version automatically.

---

## ⚡ Smart Upgrades & Cross-Platform Engine

Never miss an update! Built-in industrial-grade update management:

1. **Business-First, Idle Background Detection**:
   - Primary PR/Issue data loads and renders **instantly in milliseconds**;
   - Update checks run **1.5 seconds later during idle periods**, ensuring zero impact on user workflows.
2. **Dual-Registry Acceleration**:
   - Prioritizes npmmirror for ultra-fast checks (50~150ms in mainland regions) with seamless fallback to official npmjs.
3. **Cross-Platform One-Click Upgrade**:
   - **Click to Upgrade**: Click **`[⚡ Upgrade]`** in the UI to update in the background;
   - **Auto OS Adaptation**: Differentiates macOS and Windows; auto-injects Homebrew PATH variables on macOS GUI launches;
   - **Source Protection**: Automatically aborts npm overwrites when running in local Git linked development mode (`link:`);
   - **Restart Guidance**: Clearly notifies users to restart DSH service to reload backend tools, with instant web refresh options.

---

## ⏱️ SWR Instant Render & Sync Rhythm Control

Why did the Global Cockpit take several seconds to load in earlier releases? Because it concurrently executes a dozen `gh` processes scanning multiple repositories and workspaces. This plugin integrates the **Stale-While-Revalidate (SWR)** caching pattern, putting total control back in your hands:

```
Initial Mount (0ms) ──────────> Instantly render local persistent snapshot
                                       │
                                       ├── SWR Mode: Idle 300ms delay, silently revalidate in background
                                       ├── Manual Mode: Browse offline snapshot, only fetch on click [🔄 Refresh]
                                       └── Auto Poll: Periodically update according to chosen interval (e.g., 5m/30m)
```

### Strategy Comparison & Recommendations:

| Sync Strategy | Mechanism | Recommended Use Case |
| :--- | :--- | :--- |
| **⚡ Instant Render (SWR, Default)** | **0ms instantaneous mount** from local cache, silently revalidating in background. | **Recommended for all developers**. Eliminates spinner freezes, delivering seamless UX. |
| **📋 Manual Only (Energy Saver)** | Browse local cache only; zero automated background `gh` processes. | **Battery-powered laptops, low-spec hardware, or metered networks**. Zero background waste. |
| **⏱️ Periodic Auto Poll** | Background polls status at user-specified intervals (1m to 1h). | **Maintainer workstations & dedicated monitoring setups**. Keep tasks strictly up to date. |

* **Offline Resilience (Fail-Safe)**: Even when disconnected or hitting network timeouts, **your dashboard preserves the complete snapshot for searching, navigation, and review—zero blank screens or crash popups!**

---

## 💬 Human Slash Commands

Type directly into the DSH chat box:

* `/gh status`: Diagnostics for GitHub account authentication, scopes, repository binding, and plugin version;
* `/gh upgrade`: Check latest npm version with platform-adapted upgrade commands;
* `/gh help`: View command usage and Agent prompt examples.

---

## ⚙️ Configuration (`cordis.patch.yml`)

Works out of the box, with optional tweaks in `cordis.patch.yml` or your profile:

```yaml
- insert:
    - id: github-flow
      name: dsh-github-flow
      config:
        ghPath: 'gh'              # GitHub CLI executable path
        defaultTimeoutMs: 30000   # Command timeout in milliseconds (default 30s)
        maxOutputChars: 24000     # Safe output character ceiling (Token protection)
        maxOutputBytes: 96000     # Safe UTF-8 byte ceiling (default maxOutputChars * 4)
        cacheTtlMs: 15000         # Repository overview cache TTL (default 15s)
        checkUpdate: true         # Enable automatic update checks (default true)
        updateCheckIntervalMs: 86400000 # Check interval in ms (default 24h)
        registryUrl: ''           # Custom private npm registry URL
```

---

## 🔌 Ecosystem Extensibility (Cordis Service)

Provides standard Cordis service `ctx.github`. Other plugins can reuse it directly:

```typescript
import type { Context } from '@deepseek-ai/cordis';

export const inject = ['github'];

export function apply(ctx: Context) {
  const auth = await ctx.github.checkAuth();
  const repo = await ctx.github.getRepoMetadata();
  const prs = await ctx.github.run(['pr', 'list', '--json', 'number,title']);
}
```

---

## 📚 Documentation

- [npm Publishing & Automated CI Guide](./docs/npm-publish-guide.md)
- [Architecture & Technical Specifications](./docs/architecture.md)

---

## Friendship links
- [LINUX DO - A new ideal community](https://linux.do/)

## 📄 License

Open-sourced under the [MIT License](./LICENSE). Contributions, PRs, and Issues are welcome!
