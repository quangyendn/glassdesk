# Migration: v0.5 → v0.6 — flat command names

All namespaced commands lost their colon. `/plan:hard` is now `/plan-hard`.

## Why

Claude Code Desktop's plugin scanner names legacy commands from the file **basename**, dropping the parent directory. The `skills/` branch uses the full `componentPath`; the `commands/` branch does not. On v0.5.1 that produced three failures:

1. `commands/plan/hard.md` registered as `glassdesk:hard`, not `glassdesk:plan:hard`. Autocomplete showed `plan:hard` (its label comes from `location.componentPath`), so the name on screen was not the name in the dispatch table — typing it returned Unknown.
2. Two silent collisions, unchecked on that code path: `plan/hard.md` ↔ `fix/hard.md` (both `hard`), `review/pr.md` ↔ `git/pr.md` (both `pr`). Both entries were pushed; which one answered was undefined.
3. `commands/wiki.md` was dropped entirely — it collided with `skills/wiki`. Visible in `~/Library/Logs/Claude/main.log`:
   `[warn] [PluginScan] Skipping legacy command "glassdesk:wiki" — name collides with skills/ entry`

Flat kebab-case names have one representation everywhere: the file basename, the autocomplete label, and the dispatch key are the same string.

## How to upgrade

- **Marketplace plugin** — update the plugin, then restart Claude Code.
- **npx install** — `npx glassdesk update`. This release also deletes files the previous install left behind, so the old `.claude/commands/plan/` tree is removed rather than lingering as ghost commands.

## Name table

| Old | New |
|---|---|
| `/ask:wiki` | `/ask-wiki` |
| `/code:auto` | `/code-auto` |
| `/fix:hard` | `/fix-hard` |
| `/git:cm` | `/git-cm` |
| `/git:cp` | `/git-cp` |
| `/git:pr` | `/git-pr` |
| `/plan:archive` | `/plan-archive` |
| `/plan:hard` | `/plan-hard` |
| `/plan:list` | `/plan-list` |
| `/plan:status` | `/plan-status` |
| `/plan:validate` | `/plan-validate` |
| `/review:pr` | `/review-pr` |
| `/scout:ext` | `/scout-ext` |
| `/test:ui` | `/test-ui` |
| `/wiki:init` | `/wiki-init` |
| `/wiki:lint` | `/wiki-lint` |
| `/wiki:update` | `/wiki-update` |
| `/wiki` | `/wiki-run` |

Unchanged: `/ask`, `/brainstorm`, `/code`, `/debug`, `/fix`, `/improve`, `/learn`, `/plan`, `/scout`, `/spec`.

npx-install-only rename, unchanged in intent: `commands/plan.md` lands as `plan-fast.md` (`/plan-fast`) instead of `plan/fast.md`, and `commands/debug.md` still lands as `gd-debug.md` — both avoid the Claude Code built-ins that shadow project-scope `/plan` and `/debug`.

## Keeping it flat

Two tests in `tests/integration.test.js` fail the build if `plugins/glassdesk/commands/` grows a subdirectory, or if a command basename ever matches a `skills/` directory name.
