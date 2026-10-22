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
  Natively reuses host <code>gh</code> CLI login credentials to eliminate Personal Access Token (PAT) leaks; deeply bridges local Git workspaces with remote GitHub collaboration, equipped with <b>18 core domain Agent tools (103 actions covering PR review/Issue tracking/Actions workflow & cache governance/clone-free file reads/branch ruleset policy diagnosis/Gist snippets/labels & global status dashboards/secrets & variables/agent tasks/discussions/projects v2/codespaces/runtime telemetry)</b>, <b>human slash commands</b>, <b>Web UI visual cockpits</b>, and <b>cross-platform one-click seamless upgrades</b>.
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
| **Branch Switching & Real-Time Sync** | Switching branches requires hopping into a terminal, while the sidebar remains stale regarding local stage/commit changes. | **Safe In-UI Branch Switching + Live Git Watch**: Instant keyword filter with uncommitted dirty change guard; 800ms debounced `.git` watcher aligns right sidebar in milliseconds. |
| **First-Screen Latency & Loading** | Staring at full-screen spinners for 8~15s while waiting for heavy background `gh` processes. | **SWR 0ms Instant Render + Scheduled Sync**: Instantly displays local persistent snapshots; features a 3-way mutually exclusive sync model (SWR, Cloud Auto-Sync with visibility pause, Manual) and standalone local Git watch. |
| **Plugin Upgrades & Maintenance** | Manually checking npm registry versions, complicated commands, fear of breaking configs. | **Idle Silent Detection + One-Click Upgrade**: Dual-registry acceleration, auto macOS/Windows adaptation, upgrade with one click. |

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

# Scenario B: DSH Web / CLI Environment (--profile is required by the official CLI; fill in your actual profile name)
dsh plugin --profile web add dsh-github-flow
```

> 💡 **Notice (24-Hour Supply-Chain Security Lock Window)**:  
> DSH's bundled package manager enforces a supply-chain safety policy (`minimum-release-age = 24h`) by default to mitigate malicious package takeovers. Within **24 hours** of a new version release, running bare-name install commands without a version suffix will automatically fall back to the preceding stable version that has matured past 24 hours. To **install a newly released version immediately**, append the explicit version tag:
> ```bash
> dsh plugin --profile desktop add dsh-github-flow@<latest-version>
> ```
> Once 24 hours have passed since release, the standard bare-name command will resolve to the latest version automatically.

---

## 🤖 Core Agent Tools: Equipping Agents with Native GitHub Powers

Consolidates scattered GitHub endpoints into **18 core domain tools (103 actions)**, featuring **Token Budget Protection (default 24KB intelligent truncation)**, **High-density Native Markdown Rendering (70%+ list output token reduction)**, **OAuth Scope self-healing guidance**, and **Zero-argument CWD auto-binding**.

### 1. `github_pr`: Pull Request Lifecycle & Automated Code Review
> **Example Agent Prompts**:
> - *"Check if there are any open PRs awaiting my review in this repository."*
> - *"Create a PR for the current branch titled 'feat: add dark mode' with a brief summary of changes."*
> - *"Review code diffs in PR #12 and provide security and refactoring suggestions."*
> - *"Did CI checks pass for PR #8? If so, squash merge it and delete the source branch."*

* **Supported Actions**:
  * `list`: List open PRs with author, review decisions, and CI status (`state` / `author` / `limit` filters);
  * `view`: Inspect PR description, metadata, and mergeability;
  * `diff`: Retrieve complete code diffs (`stat_only` for file-change overview, safely truncated against token limits);
  * `checks`: Audit CI gate status (pass/fail/skip category badges, owning workflow, and detail links);
  * `create`: Auto-create PRs (supports draft mode & `--dry-run`, supports `attach_images` local uploads);
  * `edit`: 🆕 Edit PR title, body description, and metadata with image attachment support;
  * `comment`: 🆕 Post comments and reviews to pull requests with image attachment support;
  * `checkout`: 🆕 Check out PR code to a local branch so the Agent can run tests in the local workspace (requires a clean working tree; an existing branch is not reset unless `force: true` + `confirm: true` are passed);
  * `status`: 🆕 Inspect merge conflict status (`CLEAN` / `CONFLICT`) for the current branch's PR;
  * `review`: Submit code reviews (`APPROVE`, `REQUEST_CHANGES`, `COMMENT`);
  * `merge`: Merge pull requests (`squash` / `merge` / `rebase`, optional `delete_branch`; requires `confirm: true`);
  * `ready`: 🆕 Toggle Draft ↔ Ready (`undo: true` converts back to Draft — fully reversible);
  * `revert`: 🆕 Create a revert commit (generates a new revert PR on the remote; requires `confirm: true`);
  * `update_branch`: 🆕 Sync the latest base-branch commits into the PR branch — the self-healing action for "branch is out-of-date" CI gate failures;
  * `view_images`: 🆕 Download PR discussion screenshots (body + comments; `image_urls` targeting with budget-overflow resume list);
  * `attach_images` (param): 🆕 Upload local images/attachments to PRs (up to 50 files/batch, symmetric with view_images, requires gh ≥ 2.99).

---

### 2. `github_issue`: Issue Tracking & Branch Creation
> **Example Agent Prompts**:
> - *"List all open issues assigned to me."*
> - *"Branch off a local fix branch 'fix-login-error' from Issue #42 and start working."*
> - *"Add a comment to Issue #15 summarizing the edge cases we just discovered with screenshots."*

* **Supported Actions**:
  * `list`: List issues with flexible filtering (`state` / `labels` / `assignees`);
  * `view`: Inspect full issue threads, body descriptions, and assignees;
  * `create`: Create new issue tickets (supports `attach_images` local uploads);
  * `comment`: Add comments to issue threads (supports `attach_images` error screenshot uploads);
  * `edit`: Update titles, `add_labels`, or `remove_labels`;
  * `close` / `reopen`: Manage lifecycle status (`close` requires `confirm: true`);
  * `develop`: 🆕 Automatically branch off a local Git branch linked to the issue;
  * `delete`: 🆕 Irreversible physical deletion (requires `confirm: true`);
  * `transfer`: 🆕 Move issue to another repository with 301 redirects (requires `confirm: true`);
  * `pin` / `unpin`: 🆕 Manage pinned issues on the repository;
  * `lock` / `unlock`: 🆕 Lock discussions with standard reasons (`off_topic`, `resolved`, `spam`, `too_heated`);
  * `status`: 🆕 Retrieve a comprehensive dashboard of issues assigned to the active user;
  * `view_images`: 🆕 Download screenshot attachments from issue descriptions and comments into local image blocks;
  * `attach_images` (param): 🆕 Upload local file screenshots alongside issues (up to 50 local files/batch, requires gh ≥ 2.99).

---

### 3. `github_run`: Actions Monitoring & Intelligent Troubleshooting
> **Example Agent Prompts**:
> - *"Did the latest CI run on main fail?"*
> - *"Extract the failed step logs from the recent failed run and debug the root cause."*
> - *"Re-run the latest failed CI pipeline."*

* **Supported Actions**:
  * `list`: Query workflow runs by branch or status;
  * `view`: Inspect step breakdown and conclusion states;
  * `log_failed`: **🔥 Troubleshooting Swiss Army Knife**! Pinpoints exact failing jobs and steps, extracting only the critical failure lines;
  * `rerun`: Re-trigger failed workflows with one click;
  * `cancel`: Cancel in-progress or queued runs;
  * `trigger`: Manually dispatch `workflow_dispatch` workflows with custom parameters;
  * `workflow_list`: 🆕 List all workflows in the repository (`all: true` includes disabled ones);
  * `workflow_view`: 🆕 Inspect workflow YAML definitions and total run metrics;
  * `workflow_enable` / `workflow_disable`: 🆕 Toggle workflow status dynamically;
  * `download`: 🆕 Download build artifacts (strictly adhering to GHSA path-traversal safeguards).

---

### 4. `github_repo`: Metadata, Fork Sync, Clone-Free File Reads & Global Search
> **Example Agent Prompts**:
> - *"Sync my fork with the upstream repository."*
> - *"Search where 'useAuthToken' is used across this repository."*
> - *"Read 'src/utils.ts' on the remote repository without cloning."*
> - *"Fetch the README, and download the architecture diagrams inside it."*

* **Supported Actions**:
  * `view`: Inspect repository metadata, default branch, Star/Fork counts, licenses, and topics;
  * `readme`: 🆕 Read README text and extract all referenced image URLs, with optional `image_urls` batch downloads;
  * `sync`: Sync fork branch with upstream (`--force` hard reset supported);
  * `read_file`: 🆕 Clone-free remote file reading (`gh ≥ 2.95` direct, older CLI versions auto-fallback to REST API);
  * `read_dir`: 🆕 Clone-free remote directory enumeration with file types and sizes;
  * `search_code`: Search code across GitHub repositories;
  * `search_repos`: Search repositories by keywords and topics;
  * `search_issues` / `search_prs`: Global issue and pull request queries;
  * `search_commits`: Global commit message search.

---

### 5. `github_release`: Release Governance & Build Artifact Delivery
> **Example Agent Prompts**:
> - *"Check the latest release notes and assets for this repository."*
> - *"Draft a new v0.4.0 release using commits since the last tag."*
> - *"Upload the local build artifact 'dsh-github-flow-0.4.0.tgz' to the latest release."*

* **Supported Actions**:
  * `list`: Query release history;
  * `view`: Inspect notes and asset manifests for a given tag;
  * `create`: Publish releases (supports `generate_notes`, drafts, prereleases, and asset attachments);
  * `upload`: Attach build assets to an existing release (`clobber: true` requires `confirm: true`);
  * `download`: Download release artifacts with glob pattern filters;
  * `delete`: Delete releases (`cleanup_tag: true` deletes associated Git tag; requires `confirm: true`).

---

### 6. `github_secret`: CI/CD Secrets & Variables Governance
> **Example Agent Prompts**:
> - *"List the names of all configured Actions secrets."*
> - *"Set a repository secret named 'DEPLOY_KEY'."*
> - *"Read the value of plaintext variable 'NODE_ENV'."*

* **Supported Actions**:
  * `list`: Enumerate secret or variable names (secret values are never echoed);
  * `set`: Configure secrets (**Security Invariant: ciphertext safely passed via stdin, never in command arguments or process tables**) or variables;
  * `get`: 🆕 Read variable values (available only for `kind: 'variable'`; secrets are cryptographically shielded by GitHub);
  * `delete`: Remove secrets or variables (secret deletion requires `confirm: true`).

---

### 7. `github_skill`: Agent Skills Ecosystem Discovery & Local Installation 🧪 Preview

> 🧪 **Preview dependency**: built on `gh skill`, which is currently in public preview (`subject to change without notice`); the command surface may change with gh releases.
> **Example Agent Prompts**:
> - *"Search GitHub for open-source Agent skills related to 'markdown'."*
> - *"Preview and install the code review skill from 'github/awesome-copilot' into this project."*

* **Supported Actions**:
  * `search`: Discover compliant Agent skills across open-source GitHub repositories;
  * `preview`: Preview `SKILL.md` rule instructions without installing;
  * `install`: Install skills locally (`scope: 'project'` or `'user'`; requires `confirm: true`);
  * `list`: Inspect installed skills in the current environment;
  * `publish`: 🆕 **Skill Compliance Validation & Publishing Loop**: Safe `--dry-run` inspection against agentskills.io specifications, `--fix` metadata stripping, and release publishing with required `tag` and `confirm: true`;
  * `update`: 🆕 **Batch Inspection & Sync Updates**: Safe `--dry-run` check comparing local and remote tree SHAs, with `--all` batch synchronization.

---

### 8. `github_help`: Comprehensive Mapping, Official Syntax & Self-Healing
> **Example Agent Prompts**:
> - *"I am not sure which tool manages Discussions; check the mapping table for me."*
> - *"What is the syntax for filtering GitHub search results by date?"*
> - *"How do I debug 'authentication failed' errors from gh?"*

* **Supported Actions**:
  * `overview`: Complete toolbox navigation and summary table (18 core tools);
  * `mapping`: **Official gh Command ↔ Tool Action Mapping Table**, detailing exact tool calls and REST/GraphQL fallback routes;
  * `search_syntax`: Date ranges, qualifiers, and boolean query syntax;
  * `troubleshooting`: Self-healing recipes for authentication loss, timeouts, SOCKS5 proxy configs, and permissions;
  * Domain guides: In-depth usage guides for `pr`, `issue`, `run`, `repo`, `release`, `secret`, `skill`, `label`, `ruleset`, `cache`, `gist`, `status`, `agent_task`, `discussion`, `project`, and `codespace`;
  * `gh_command`: Direct pass-through lookup of official gh manual entries (e.g. `gh_command: 'ruleset'`).

---

### 9. `github_api`: Raw GitHub REST & GraphQL Escape Hatch
> **Example Agent Prompts**:
> - *"Call GitHub API to fetch the current user's profile JSON."*
> - *"Run a GraphQL query to inspect repository Discussions."*

* **Supported Features**: Direct invocation of arbitrary GitHub REST or GraphQL endpoints using host credentials, supporting `--jq` filtering, auto-pagination (`paginate: true`), and `raw: true` mode.

---

### 10. `github_label`: Label System Management & Cross-Repo Cloning
> **Example Agent Prompts**:
> - *"List all labels in this repository sorted by name."*
> - *"Create a label 'priority/p0' with color #d73a4a for critical bugs."*
> - *"Clone the label system from 'cli/cli' repository into our new repository."*
> - *"Delete the deprecated 'invalid' label."*

* **Supported Actions**:
  * `list`: List repository labels (supports `search` regex/keyword, `sort: 'created' | 'name'`, and `order: 'asc' | 'desc'`);
  * `create`: Create a new label (hex color normalization, optional `force: true` to update existing);
  * `edit`: Update label color, description, or rename via `new_name`;
  * `delete`: Safe deletion (affects associated issues/PRs; requires `confirm: true` confirmation, injects `--yes`);
  * `clone`: 🆕 **One-click cross-repo label cloning**: Copy all labels from a source repository (`source_repo`) into the target repository (supports `force: true` to overwrite conflicts).

---

### 11. `github_ruleset`: Branch Protection Rules & Policy Diagnosis
> **Example Agent Prompts**:
> - *"Why can't I merge this PR? Check all applicable rules for this branch."*
> - *"Verify whether branch master requires CI status checks or 2 approvals."*
> - *"List all repository rulesets."*

* **Supported Actions**:
  * `check`: **🔥 Core PR Merge Blocker Diagnosis**! View all protective rules governing a branch (e.g. required approvals, required status checks, linear history, force-push denial), complementing `github_pr(action: 'checks')` with authoritative policy perspective;
  * `list`: List rulesets for repository or organization (`--org` and `--no-parents` support);
  * `view`: Inspect ruleset configuration and target branches (requires `ruleset_id`).

---

### 12. `github_cache`: Actions Build Cache Auditing & Safe Cleanup
> **Example Agent Prompts**:
> - *"How much cache space is consumed by GitHub Actions in this repository?"*
> - *"List build caches sorted by size in descending order."*
> - *"Purge all build caches in this repository."*

* **Supported Actions**:
  * `list`: Audit Actions caches with human-readable size formatting (KB/MB/GB), key prefix and ref filtering, and size/access sorting;
  * `delete`: Precise 3-way cleanup (by `cache_id`, by `key`, or purge everything via `all: true`; **all three paths require `confirm: true`**; purge additionally injects `--succeed-on-no-caches` for idempotency).

---

### 13. `github_gist`: Code Snippets & Diagnostics Archiving
> **Example Agent Prompts**:
> - *"Publish this diagnostic error log as a Secret Gist and share the link."*
> - *"List all gists on my user account."*
> - *"Inspect the contents of Gist '5b0e0062eb8e9654adad7bb1d81cc75f'."*

* **Supported Actions**:
  * `list`: List user gists (structured TSV parser, supports `public` / `secret` / `filter` options);
  * `view`: View raw code contents of a gist (optional `filename` targeting, requires `gist_id`);
  * `create`: Create gists from `content` string (streamed via safe stdin pipeline) or local `files`, defaults to Secret mode with **explicit unlisted security warnings**;
  * `edit`: Update descriptions or files in a gist;
  * `delete`: Permanently delete a gist (requires `confirm: true` and `--yes`).

---

### 14. `github_status`: Cross-Repository Todo & Runtime Health Dashboard
> **Example Agent Prompts**:
> - *"What tasks and pull requests need my attention on GitHub today?"*
> - *"Check recent @mentions and activity across all repositories I follow."*
> - *"Audit the runtime health score and degradation rate report of our GitHub tools."*

* **Supported Actions**:
  * `view`: **Account-level global status cockpit** (default), aggregating Assigned Issues, Assigned PRs, Review Requests, Mentions, and Repository Activity across all subscribed repositories without needing repository context; supports `-o` org filtering and `-e` noise repository exclusion;
  * `health`: 🆕 **Toolchain Runtime Health & Degradation Audit Report**: Powered by Cordis `tools/result` event telemetry, audits total calls, success rates, comprehensive health score (0-100), API degradation rates, and actionable self-healing upgrade suggestions across all 18 tools.

---

### 15. `github_agent_task`: Cloud Coding Agent Session Governance 🧪 Preview

> 🧪 **Preview dependency**: built on `gh agent-task`, which is currently in public preview (`subject to change without notice`); the command surface may change with gh releases.
> **Example Agent Prompts**:
> - *"List all GitHub Copilot Coding Agent task sessions assigned under my account."*
> - *"View task 'e2fa49d2' details and fetch its execution logs."*
> - *"Dispatch a task to the cloud Agent: 'Refactor network layer with retry support', based on branch develop."*

* **Supported Actions**:
  * `list`: List agent tasks (supports `-L/--limit`; `gh agent-task list` does not accept `-R/--repo`, which has no effect on this action);
  * `view`: View task session details and logs (supports `--log`, strictly requires `task_id` to prevent TTY hangs);
  * `create`: Create and dispatch a cloud agent coding task (supports `-b/--base` and `-a/--custom-agent`).

---

### 16. `github_discussion`: Team Discussions & Open-Source RFC Loop 🧪 Preview

> 🧪 **Preview dependency**: built on `gh discussion`, which is currently in public preview (`subject to change without notice`); the command surface may change with gh releases.
> **Example Agent Prompts**:
> - *"List open discussions in category 'Ideas' for this repository."*
> - *"View discussion #101 body and comment thread."*
> - *"Start a discussion under 'RFC': 'Proposal on telemetry observability'."*
> - *"Post a reply comment to discussion #101."*

* **Supported Actions**:
  * `list`: Query discussions (supports `-c/--category`, `-s/--state`, `--labels`, and `-S/--search`);
  * `view`: Read discussion body and replies (supports `--comments`, requires `discussion_number`);
  * `create`: Start a discussion (requires `category`, `title`, and `body`);
  * `edit`: Update discussion title or body;
  * `comment`: Post a comment reply to an existing discussion.

---

### 17. `github_project`: Projects v2 Board & Item Planning
> **Example Agent Prompts**:
> - *"List all Projects v2 boards under my account."*
> - *"View items in project board #1 with filter query 'is:open'."*
> - *"Add Issue 'https://github.com/owner/repo/issues/10' to project board #1."*
> - *"Create a draft issue item in project #1 titled 'Review unit test coverage'."*

* **Supported Actions**:
  * `list`: List user or organization projects (default `owner: '@me'`, natively handles `--format json`);
  * `view`: Inspect project metadata, visibility, description, and README;
  * `item-list`: Inspect board items (supports Projects query filter syntax `--query`, e.g., `is:open assignee:@me`);
  * `item-add`: Associate existing Issue/PR URLs to a project board;
  * `item-create`: Create draft issue items;
  * `item-delete`: Remove items from board (guarded by required `confirm: true`);
  * 🔑 **Scope Self-Healing**: Automatically renders a single-line self-healing command card (`gh auth refresh -s read:project`) when permissions are missing.

---

### 18. `github_codespace`: Cloud Remote Development Environment (MVP)
> **Example Agent Prompts**:
> - *"Check which cloud Codespace environments are currently running."*
> - *"Inspect instance specs and idle timeout for 'fuzzy-spoon-69vj'."*
> - *"Stop 'fuzzy-spoon-69vj' to avoid billable core-hour consumption."*
> - *"Permanently delete an unused temporary Codespace."*

* **Supported Actions**:
  * `list`: List Codespaces under current user or organization;
  * `view`: Inspect environment specs, DevContainer path, and status (requires `codespace` name);
  * `stop`: Stop running instances to halt billing immediately;
  * `delete`: Safely delete instances (requires `confirm: true`, passes `-f` for non-interactive execution);
  * 🔑 **Scope Self-Healing**: Automatically renders a single-line self-healing command card (`gh auth refresh -h github.com -s codespace`) when missing required scopes.

---

## 🖥️ Web UI Cockpit & Right Sidebar Workspace Panel

`dsh-github-flow` delivers native visual controls alongside its Agent toolset:

### 1. Global Cockpit (Main Dashboard)
Click the **Octocat icon** in DSH's left navigation bar to open the full-screen cockpit:
* **⚡ 0ms Instant Render (SWR Persistent Cache)**: Powered by local snapshot persistence; enjoy instant dashboard loading;
* **📦 Live Freshness Status Pill**: Transparently communicates data freshness right next to the title (`[📦 Local Snapshot (21m ago)]` ➔ `[⏳ Syncing in background...]` ➔ `[✅ Up to date (15:30)]` ➔ `[⚠️ Network failed, offline snapshot displayed]`);
* **Account-Wide Overview**: Live view of all cloud repositories, default branches, and star counts;
* **Local Workspace Matrix**: Automatically detects open projects and bridges local directories with remote repos;
* **3D Issue Governance Matrix**: Categorizes issues into *"📥 User Reported"*, *"🎯 Assigned to Me"*, and *"✍️ Created by Me"* with responsive pill filters;
* **Update Notification Banner**: Smoothly glides down when an update is available with one-click automated upgrade;
* **🔀 PR Review Workbench**: Click any PR to review author, branch flow, CI/review status, Markdown description, comment timeline, and the changed-file list with high-fidelity unified diffs — all without leaving DSH (diffs are sliced per file in memory, so switching files is instant);
* **📝 Issue Online Viewer**: Click any Issue to read the full discussion — body and comments rendered as Markdown, long content collapsed, GitHub-hidden (SPAM) comments explicitly flagged, with label chips, assignees, milestone, sub-issue progress, and linked PRs.

<p align="center">
  <img src="./docs/images/1.png" alt="GitHub Global Cockpit" width="100%" />
</p>

### 2. Session Right Sidebar Panel (Workspace Drawer)
Located in the right drawer of every chat workspace, seamlessly bridging your local Git workspace with remote GitHub repositories:
* **Context Auto-Binding**: Automatically locks onto the active Git repository of the current session;
* **Branch Viewing & Safe In-UI Switching (Branch Selector)**:
  * Visual branch dropdown directly inside the repository card;
  * Built with official **Git diamond vector icons (`#1296db` SVG)**;
  * Pre-fetched with the overview payload for an **instant 0ms dropdown opening**, featuring live keyword search across local and remote branches;
  * **Dirty File Guard**: Strict pre-flight checks block switching if there are uncommitted changes, protecting work from destructive overwrites;
* **Freshness Pill Alignment**: Compact indicator `[📦 Local Snapshot (2m ago)]` with live `[🔄 Refresh]` button;
* **Quick Action Grid**: Open repo in browser, jump to Issues/PRs, create PRs with one click;
* **Five Mutually Exclusive Tabs**: Compact tabbed navigation directly below the quick action grid:
  * **Git Records (`Git`)** (Default tab):
    * Branch & Remote Sync: Real-time branch indicator (e.g. `master`) with tracking sync status (`✓ Up to date` or `↑N to push` / `↓N to pull`);
    * Three-Section Commit View: Unpushed commits (ahead of remote), unpulled commits (behind remote), and recent commit history;
    * 15 commits displayed by default, with **infinite scroll loading** when scrolling to the bottom (with live `15 / 74` progress counter and click trigger);
    * Latest Release badge (`🏷️ v0.4.0`) anchored in the top right with hover details and direct release link;
    * **Commit Detail Modal**: Click any commit row to open a clean modal dialog centered within the right sidebar, featuring smooth vertical scrolling, full 40-char SHA, author email, date, multi-line commit message body, and file diff stat table (`--stat`), pure local 0ms instant display;
  * **Uncommitted Changes (`📁 Uncommitted (N)`)**: Full-width list of uncommitted files with color-coded status codes (`??` untracked, `M` modified, `D` deleted, `R` renamed) and change counts;
  * **Pull Requests (`🔀 PR (N)`)**: Shows **all** PRs (merged/closed included, default "All"), with status pills `All / 🟢 Open / 🟣 Merged / ⚪ Closed` showing per-state counts; 3-state CI rollup (`✅ CI Passed` / `❌ CI Failed` / `⏳ CI Pending`), merge conflict detection, review decisions (`✔ Approved` / `✋ Changes Requested` / `👀 Review Required`), Draft pills, and humanized timestamps; **click a card to open the in-app PR review workbench**, while `GitHub ↗` still jumps to the browser;
  * **Workspace Issues (`📋 Issues (N)`)**: Shows **all** issues (closed included, default "All"), with status pills `All / 🟢 Open / ⚪ Closed`; **click a card to open the in-app Issue viewer** (Markdown body / comment timeline / labels & milestone, Esc to close), while `GitHub ↗` still jumps to the browser;
  * **Actions Pipeline (`⚡ Actions (N)`)**: Real-time CI workflow status tracking with trigger event badges (`push`/`schedule`/`manual`/`PR`), relative time, and self-healing diagnostic notes for failed runs (embedding `run_id` for Agent one-click log inspection);
* **⚙️ Full Settings Access**: Dedicated settings button reusing the same settings modal as the cockpit (all four sections: Sync / Proxy / Update Source / About) — no need to switch back to the main page.

<p align="center">
  <img src="./docs/images/2.png" alt="Session Right Sidebar Panel" width="100%" />
</p>

### 3. Help & Playbook Modal
Click **`[📖 Help]`** in the top right of the Cockpit (or the ❓ button in the right sidebar) to open the 920px immersive manual; press Esc or click the backdrop to close. Five sections:
* **🚀 3-Minute Quickstart**: login check → workspace binding → first Agent instruction, plus a capability overview (18 tools / 103 business actions / 2 workbenches);
* **🤖 Agent Prompt Playbook**: 7 high-frequency scenarios (open a PR, CI triage, daily standup, diff review, screenshot triage, bulk label governance, RFC discussion), each with one-click prompt copy;
* **🖥️ UI Walkthrough**: per-tab documentation for the 4-tab Cockpit and the 5-tab right sidebar, plus shared modal interaction habits;
* **🧰 18-Tool Reference**: all tools and actions grouped into daily development / delivery & config / ecosystem & collaboration / escape hatches, with a `/gh` command cheat sheet;
* **🔑 Troubleshooting**: login, missing scopes, the 24h supply-chain protection window, proxy flapping, empty lists, and why a DSH restart is needed.

> The same knowledge is exposed to Agents via the `github_help` tool — both sides are asserted against the source tree by phase33, so docs drifting from code fails the test suite.

### 4. Settings Center (Settings Modal)
Click **`[⚙️ Settings]`** in the top right of the Cockpit (or the ⚙️ button in the right sidebar) to open the sectioned settings modal:

**🔄 Data Sync Section** — tune data fetching rhythm and perception sensitivity:
* **Three Mutually Exclusive Data Refresh Strategies**:
  * **⚡ Instant Render (SWR, Default)**: Instantly displays local cache (0ms), then silently syncs the latest state in the background on initial load;
  * **☁️ Cloud Scheduled Auto-Sync (SWR + Polling)**: Instantly renders local cache and syncs once on mount, then counts down cyclically (**5/10/30/60 minutes** selectable; features automatic window visibility pause to prevent API quota drain in background tabs);
  * **📋 Manual Only (Energy Saver)**: Browse local cache only; zero background `gh` processes triggered; click `[🔄 Refresh]` whenever you want updates.
* **Advanced Automation & Status Perception**:
  * **📁 Local Git Real-Time Watch (Right Sidebar Only, Enabled by Default)**: Monitors `.git/HEAD` and `.git/index` metadata directly; staging, commit, and branch changes synchronize to the sidebar within milliseconds with an 800ms debounce, consuming zero external network quota; omitted from the main cockpit to preserve lightweight performance.
* **Visual Cache Management**: Real-time snapshot size and timestamp visibility with one-click `[🗑️ Clear Cache]`.

**🌐 Network Proxy Section** — route all plugin traffic through your proxy:
* **Global Scope**: Once configured, the cockpit, right-sidebar panel, all 18 Agent tool invocations, and one-click upgrades route through the proxy;
* **Protocol Support**: `http://` / `https://` / `socks5://` / `socks5h://` (`socks5h` delegates DNS resolution to the proxy for stronger pollution resistance);
* **`[🧪 Test Connectivity]`**: One-click latency probe against the GitHub API through the current proxy;
* **Instant Effect**: Persisted to `~/.dsh/data/dsh-github-flow/proxy.json` (auto-restored on DSH restart) — no restart, no plugin reload;
* **NO_PROXY Exclusions**: `localhost` and `127.0.0.1` are forcibly included.

**⬆️ Update Source Section** — choose which npm registry checks for new versions:
* **Three options**: 🌍 npm official registry (default — new releases visible immediately) / 🇨🇳 npmmirror (fast in China; minutes-level sync delay) / ⛔ No update checks (only silences the upgrade banner; `/gh upgrade` and one-click upgrade remain available);
* **Strict single-source**: the selected source is never silently swapped — probe failures are reported honestly;
* **Verify on save**: switching sources immediately probes the new registry and shows the latest version.

**ℹ️ About Section** — plugin identity & project info:
* Current running version, project description, GitHub repository, npm package page, and MIT license;
* Star card — if the plugin helps your workflow, a Star on the repo powers continued iteration.

> 🏷️ **Plugin Identity Badge**: Panel titles (cockpit & right sidebar) carry a small "Plugin" badge, clearly marking the UI as provided by the third-party plugin `dsh-github-flow` (not a DSH / GitHub official feature). Click the badge to open the About page.

| 🔄 Data Sync Section | 🌐 Network Proxy Section |
| :---: | :---: |
| ![Settings Center · Data Sync](./docs/images/3.png) | ![Settings Center · Network Proxy](./docs/images/4.png) |

---

## ⚡ Smart Upgrades & Cross-Platform Engine

Never miss an update! Built-in industrial-grade update management:

1. **Parallel Detection, Zero gh-Dependency**:
   - Update checks fire **in parallel with the gh environment chain** on mount — never serialized behind gh overviews; gh failures never block upgrade banners;
   - Server-side `inFlightPromise` merging + 24h cache keeps multi-panel mounting storm-free.
2. **Selectable Update Source** (see the "⬆️ Update Source" settings section):
   - Defaults to the **npm official registry** (new releases visible immediately), or switch to **npmmirror** (minutes-level sync delay);
   - Auto checks can be disabled entirely.
3. **Cross-Platform One-Click Upgrade**:
   - **Click to Upgrade**: Click **`[⚡ Upgrade]`** in the UI to update in the background;
   - **Auto OS Adaptation**: Differentiates macOS and Windows; auto-injects Homebrew PATH variables on macOS GUI launches;
   - **Source Protection**: Automatically aborts npm overwrites when running in local Git linked development mode (`link:`);
   - **Restart Guidance**: Clearly notifies users to restart DSH service to reload backend tools, with instant web refresh options.

---

## ⏱️ SWR Instant Render & Sync Rhythm Control

Why did the Global Cockpit take several seconds to load in earlier releases? Because it concurrently executes a dozen `gh` processes scanning multiple repositories and workspaces. This plugin integrates the **Stale-While-Revalidate (SWR)** caching pattern, putting total control back in your hands:

```text
Initial Mount (0ms) ──────────> Instantly render local persistent snapshot
                                       │
                                       ├── SWR Mode: Idle 300ms delay, silently revalidate in background once
                                       ├── Cloud Scheduled Sync: Starts countdown after initial sync (5/10/30/60m pause on hide)
                                       └── Manual Mode: Browse offline snapshot, only fetch on click [🔄 Refresh]
```

### Strategy Comparison & Recommendations:

| Sync Strategy | Mechanism | Recommended Use Case |
| :--- | :--- | :--- |
| **⚡ Instant Render (SWR, Default)** | **0ms instantaneous mount** from local cache, silently revalidating in background once on mount — however stale the snapshot, opening the panel self-heals to fresh data. | **Recommended for all developers**. Eliminates spinner freezes, delivering seamless UX. |
| **☁️ Cloud Scheduled Auto-Sync (SWR + Polling)** | Instantly renders local cache and revalidates on mount, then starts a recurring timer (5/10/30/60m); features visibility-change pause to prevent background API quota drain. | **Active developers managing multiple repositories, PR workflows, and team issues**. |
| **📋 Manual Only (Energy Saver)** | Browse local cache only; zero automated background `gh` processes. | **Battery-powered laptops, low-spec hardware, or metered networks**. Zero background waste. |

* **Offline Resilience (Fail-Safe)**: Even when disconnected or hitting network timeouts, **your dashboard preserves the complete snapshot for searching, navigation, and review, paired with prominent offline warning banners and toasts—zero blank screens or crash popups!**

---

## 💬 Human Slash Commands

Enter in any DSH chat window:

* `/gh status`: Diagnostics for GitHub CLI auth status, scopes, active workspace repository, plugin version, and **runtime toolchain telemetry (health score & degradation rates)**;
* `/gh upgrade`: Check the latest npm release and output platform-tailored upgrade instructions (macOS / Windows / Linux);
* `/gh help`: View help documentation and example Agent dialogue recipes.

---

## ⚙️ Plugin Configuration (`cordis.yml`)

Fine-tune options via DSH config:

```yaml
- id: github-flow
  name: dsh-github-flow
  config:
    ghPath: 'gh'              # GitHub CLI executable path (default 'gh')
    defaultTimeoutMs: 30000   # Command execution timeout in ms (default 30s)
    maxOutputChars: 24000     # Max character output threshold (Token overflow protection)
    maxOutputBytes: 96000     # Hard UTF-8 byte output cap, defaults to maxOutputChars * 4
    defaultListLimit: 20      # Default query limit for list operations across PR/Issue/Run/Release/Skill
    cacheTtlMs: 15000         # Repository overview cache TTL in ms (default 15s)
    checkUpdate: true         # Enable automated version checks (default true)
    agentEnvInjection: true   # Inject AI_AGENT=dsh for gh CLI recognition (default true)
    updateCheckIntervalMs: 86400000 # Update check interval in ms (default 24h)
    registryUrl: ''           # Custom npm registry (defaults to Update Source setting)
    proxyUrl: ''              # Default proxy URL (overridden by UI settings)
    toolsets: ['core']        # Tool tier: unset/full = all 18; core=5 / ci=7 / maintain=8; bare tool names allowed
    read_only: true           # Read-only tier: write actions pruned from the schema at registration; github_api not registered
```

> `toolsets` controls **which tools get registered to the model**, not a runtime permission check: unset = all 18 resident (~24,000 chars of schema), `core` = 5 (~8,500 chars, **65% smaller**). A misspelled tier name logs a `console.warn` listing the available tiers instead of silently dropping every tool.
> `read_only` is a hard semantic enforced in two layers: (1) write actions are removed from the argument `enum` at registration time (invisible at the schema layer); (2) **the execution entry rejects them again** — this plugin ships hand-rolled descriptors, so the host does not validate arguments on our behalf; a pruned action is refused before it ever reaches `gh`, even with `confirm: true`. `github_api` accepts any endpoint and method, so it cannot be degraded — it is simply not registered.
> Boundary note: `github_help` output is **documentation**, so it still lists every capability (including write usage) in read-only mode. It is not an executable contract — what actually blocks writes is the two layers above.

> Config is validated by a Schemastery schema: a wrong type (e.g. `maxOutputChars: '24000'` as a string) now **fails loudly** instead of silently falling back to the default.
> `maxOutputChars` / `defaultTimeoutMs` / `defaultListLimit` are **volatile fields** — editing only these hot-commits the new values into the running instance without reloading the plugin; editing any other field (including `checkUpdate`) still triggers a plugin reload.

---

## 🔌 Cordis Ecosystem Service (`ctx.github`)

Exports a standard Cordis service `ctx.github` for other DSH plugins:

```typescript
import type { Context } from '@deepseek-ai/cordis';
// Optional but recommended: load the declaration merge shipped with this package
// so `ctx.github` gets full types and autocompletion.
import type {} from 'dsh-github-flow/host';

export const inject = ['github'];

export async function apply(ctx: Context) {
  const auth = await ctx.github.checkAuth();
  const repo = await ctx.github.getRepoMetadata();
  const prs = await ctx.github.run(['pr', 'list', '--json', 'number,title']);
}
```

---

## 📚 Documentation & Technical References

- [npm Publishing & Automated CI Guide](./docs/npm-publish-guide.md)
- [Architecture & Technical Specifications](./docs/architecture.md)
- [Release Checklist & Pitfall Guide](./docs/UPGRADE-NOTES.md)

---

## Community Links

- [LINUX DO - A New Community for Developers](https://linux.do/)

---

## 📄 License

Open-sourced under the [MIT License](./LICENSE). Contributions and PRs welcome!
