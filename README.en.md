# DSH GitHub Flow (`dsh-github-flow`)

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-github-flow"><img src="https://img.shields.io/npm/v/dsh-github-flow.svg?style=flat-square&color=0969da" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/dsh-github-flow"><img src="https://img.shields.io/npm/dm/dsh-github-flow.svg?style=flat-square&color=2ea043" alt="npm downloads" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="license" /></a>
  <a href="https://deepseek-harness.github.io/deepseek-harness/"><img src="https://img.shields.io/badge/Cordis-Compatible-8957e5.svg?style=flat-square" alt="Cordis" /></a>
</p>

<p align="center">
  <b>Modern, native GitHub workflow integration plugin for DeepSeek Harness (DSH) powered by GitHub CLI (<code>gh</code>).</b><br>
  Deeply connects local Git repository development with remote GitHub collaboration (PRs, Issues, Actions CI diagnosis, and code reviews), featuring Agent model tools, human slash commands, and dual native Web UI views.
</p>

<p align="center">
  <b><a href="./README.md">简体中文</a></b> | <b>English</b>
</p>

---

## 🌟 Key Features

1. **Zero-Configuration Authentication**:
   - Seamlessly reuses existing host credentials from `gh auth login` (OAuth tokens / system Keyrings) without exposing plain-text Personal Access Tokens (PATs) in DSH.
2. **Deep Workspace Affinity & Zero-Config Detection**:
   - Automatically scopes commands to the active session workspace by natively reading local `.git/config` and mapping DSH `workspace.json`. Neither models nor humans need to supply redundant `owner/repo` arguments.
3. **High Signal-to-Noise Ratio & Token Budget Protection**:
   - Consolidates over 70+ scattered micro-tools into **5 focused domain tools**.
   - Queries use `--json <fields>` projections by default; long diffs and failed CI logs are safely truncated (default 24KB) to protect the model's context window.
   - All tool outputs are defensively normalized into root objects to strictly comply with DSH Tool Gateway schema validation.
4. **Dual Native Web UI Views & Dynamic Dual-Theme Support**:
   - **Global Cockpit** (`sidebar.panellist`, Order 20): Account-wide repository overview, local workspace matrix, and pending personal PRs/issues.
   - **Right Sidebar Panel** (`sidebarRightTabs`, Order 40): Shows current repository status, PR list with CI check pills, and a 2x2 quick action grid (Open Repo, View PRs, Create PR, New Issue) with zero popup dependencies.
   - **Native Light/Dark Dual-Theme Adaptation**: Deeply aligned with DSH official DSW (DeepSeek Web) design tokens, seamlessly reacting to `body[data-ds-dark-theme]` without lag or flickering.
5. **Standard Cordis Microkernel Compliance**:
   - Exposes native `GitHubService` (`ctx.github`) for ecosystem extensibility;
   - Strongly typed runtime validation via Standard Schema (`Config`);
   - Domain event broadcasting (`github/pr:create`, `github/issue:create`).

---

## 🚀 Installation

Run in your DSH terminal to install directly from npm:

```bash
# Install to desktop profile
dsh plugin --profile desktop add dsh-github-flow

# Or install to web profile
dsh plugin --profile web add dsh-github-flow
```

---

## 🛠️ Agent Tools Reference

| Tool Name | Actions | Typical Use Cases |
|---|---|---|
| `github_pr` | `list`, `view`, `create`, `diff`, `checks`, `review`, `merge` | Inspect PR details, verify CI checks, conduct code reviews, merge pull requests |
| `github_issue` | `list`, `view`, `create`, `comment`, `close`, `reopen` | Search and view issues, create issues, add comments |
| `github_run` | `list`, `view`, `log_failed`, `rerun`, `cancel` | Monitor Actions workflows; `log_failed` extracts failure logs for automatic fixes |
| `github_repo` | `view`, `search_code`, `search_repos` | Query repository metadata, search cross-repo code |
| `github_api` | Any GitHub REST / GraphQL endpoint | Universal escape hatch for custom queries (supports `--jq`) |

---

## 💬 Human Slash Commands

In any DSH chat prompt:
- `/gh status`: Check current GitHub CLI authentication status, granted scopes, and active repository;
- `/gh help`: Display quick reference and help information.

---

## ⚙️ Configuration

Customize options in your `cordis.patch.yml` or profile:

```yaml
- insert:
    - id: github-flow
      name: dsh-github-flow
      config:
        ghPath: 'gh'              # Custom path to gh binary
        defaultTimeoutMs: 30000   # Timeout in milliseconds
        maxOutputChars: 24000     # Maximum characters per output (Token guard)
        cacheTtlMs: 15000         # Web overview cache time
        defaultListLimit: 20      # Default page size
```

---

## 🔌 Ecosystem Service Extension (Cordis Service)

Other DSH plugins can consume GitHub CLI capabilities via dependency injection:

```ts
import type { Context } from '@deepseek-ai/cordis';

export const inject = ['github'];

export function apply(ctx: Context) {
  // Directly invoke the underlying secure execution engine via ctx.github
  const auth = await ctx.github.checkAuth();
  const repo = await ctx.github.getRepoMetadata();
}
```

---

## 📚 Documentation

- [npm Publishing & Maintenance Guide](./docs/npm-publish-guide.md)
- [Architecture & Design Specifications](./docs/architecture.md)

---

## 📄 License

This project is licensed under the [MIT License](./LICENSE).
