# Workflow: how changes get from a branch to the live site

How work on this repo is done day to day, mostly by Claude (Claude Code in
the desktop app, working on the owner's Mac). The site is deployed by GitHub
Pages straight from `main`, so **merging a PR is publishing it**.

## Roles

| Role | Who | Does | Writes to |
|---|---|---|---|
| Owner | Jens | Decides: what gets built, data sources, visual options, anything sent outside the project | — |
| Developer | The main Claude session | Builds, tests, opens and merges PRs, checks the deploy, keeps the docs current | Code and `docs/` |
| UX specialist | `ux-specialist` agent (`.claude/agents/`) | Reviews the running app's usability; never edits files | Report, filed in [UX_FINDINGS.md](./UX_FINDINGS.md) |
| Product owner | `product-owner` agent (`.claude/agents/`) | Gap analysis against other ski-conditions apps and product priorities; never edits files | Report, filed in [PRODUCT_GAPS.md](./PRODUCT_GAPS.md) |

The two reviewer roles only propose. Items the owner picks become entries in
[PROPOSALS.md](./PROPOSALS.md), and the developer builds them.

## Setup

- Repo: `cedjec-sketcher/foray-ski-adventure`, default branch `main`.
- Git runs with the owner's own git config and SSH key. Nothing is stored in
  the repo.
- The GitHub CLI (`gh`) is installed from GitHub's official release in
  `~/.local/bin` (there's no Homebrew on this Mac) and signed in with
  `gh auth login` (GitHub.com, SSH, browser login). Check with
  `gh auth status`. No token is ever written into the repo, chat or docs.
- Not installed locally: `node`. See "Tests" below.

## One change, start to finish

1. **Branch from an up-to-date `main`**, one branch per logical change (a
   fix and a feature are separate PRs). Never commit directly to `main`.
   There's no branch protection, so this is a working rule, not something
   GitHub enforces.
   ```bash
   git switch main && git pull
   git switch -c <short-descriptive-name>
   ```
2. **Make the change, then rebuild** if code or data changed (docs-only
   changes don't need it):
   ```bash
   ruby scripts/build_data.rb   # regenerates data/ski_data.json and index.html
   ```
   It calls Open-Meteo for every resort; several builds in a row can hit the
   free tier's per-minute limit. Wait a minute and retry.
3. **Test locally:** `rake test`. For anything the page renders, also check
   it in the browser preview (see "Tests").
4. **Push and open a PR:**
   ```bash
   git push -u origin <branch>
   gh pr create --base main --title "..." --body "..."
   ```
   The PR description says what changed, why, and how it was checked,
   including anything that couldn't be run locally.
5. **Wait for CI.** The `Test` workflow (`.github/workflows/test.yml`) runs
   `rake test` and `node --test test/js` on every PR:
   ```bash
   gh pr checks <n> --watch
   ```
6. **Merge when CI is green,** with a merge commit (the history is all merge
   commits; keep it that way):
   ```bash
   gh pr merge <n> --merge
   ```
   The branch is deleted on GitHub automatically (the repo's "Automatically
   delete head branches" setting is on). Delete the local one with
   `git branch -d <branch>` after `git pull`.
7. **Verify the deploy, not just CI.** After merging:
   - `Test` and `pages build and deployment` both finish with `success` for
     the merge commit (`gh run list --commit <sha>`).
   - The live page's `assets/app.js?v=` hash equals the first 8 hex
     characters of the local `md5 -q assets/app.js`. GitHub Pages caches
     assets for 10 minutes, so this catches a stale deploy that "CI passed"
     wouldn't.
   Only then is the change done.

## Tests

| What | Where it runs |
|---|---|
| `rake test` (Ruby: importer, season curve, providers, theme tokens, region consistency, build output) | Locally and in CI |
| `node --test test/js` (the pure functions in `assets/app.js`) | CI only, because there's no `node` locally. Locally they run through a small shim in the browser preview; the PR says so. |
| `test/browser/*.js` (drive the real page against a mocked winter) | By hand in the browser preview; not in CI yet (see PROPOSALS.md, "Structure & maintainability" (b)) |

## Docs to keep current

- Something shipped: its write-up goes to [CHANGELOG.md](./CHANGELOG.md), and
  it's removed from [PROPOSALS.md](./PROPOSALS.md) (not marked done there).
- The design changed: update [ARCHITECTURE.md](./ARCHITECTURE.md) in the same
  PR.
- UX review findings go to [UX_FINDINGS.md](./UX_FINDINGS.md) until they're
  acted on.

## Rules

- Changes to the data model (`data/resorts.json`'s shape), data sources or
  dependencies (the first npm package, a new API) are agreed with the owner
  before they're built, not just mentioned in the PR.
- Visual UI changes are mocked up first, with a choice of options, before
  they're coded.
- No keys, passwords or tokens in the repo, the chat or the docs.
