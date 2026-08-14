---
title: "Plugin Path Resolution Fix (npx install)"
updated: 2026-05-26
tags: [category/decision, npx, plugin, path-resolution, bugfix, command-collision]
summary: "npx glassdesk init/update rewrites $GD_PLUGIN_PATH literals and renames colliding built-in command files (/debug→/gd-debug, /plan→/plan-fast) in copied .md files."
---

`npx glassdesk init/update` rewrites the `$GD_PLUGIN_PATH` token in all copied `.md` files to project-relative `.claude/...` paths at install time, working around Claude Code bug #46696.

## Problem

Subagents spawned by Claude Code do not inherit `CLAUDE_ENV_FILE` environment variables (Claude Code bug #46696). The `session-init.cjs` hook sets `GD_PLUGIN_PATH` in the main session, but subagents dispatched via Task tool start with a clean env. Any `node "$GD_PLUGIN_PATH/scripts/..."` call inside a skill or command therefore fails silently in subagent context.

## Decision

At `npx glassdesk init/update` time, `bin/cli.js` rewrites `$GD_PLUGIN_PATH` literals in all copied `.md` files to project-relative `.claude/...` paths. Project-relative paths work in both main session and subagent context because Claude Code spawns Bash with `cwd=project root` in both cases.

`${CLAUDE_PROJECT_DIR}` was considered but empirically not exported to Bash by Claude Code 2.1.x despite documentation.

## Scope

The rewrite applies only to the npx-installed copies in `.claude/`. The marketplace bundle under `plugins/glassdesk/**/*.md` is intentionally not modified — marketplace installs have a different path resolution context where runtime `$GD_PLUGIN_PATH` still works.

## Dual-Install Collision Guard

`session-init.cjs` uses a first-writer-wins guard for `GD_PLUGIN_PATH`. When both marketplace plugin and npx install register a `SessionStart` hook, the env var is no longer silently overwritten by the last-registering hook. `GD_SESSION_ID` continues to regenerate each session.

## Built-in Command Collision Renaming

Claude Code 2.x introduced built-in slash commands (`/debug`, `/plan`) that silently shadow same-named entries in `.claude/commands/`. The npx installer (`bin/cli.js`) handles this via two mechanisms:

**`RENAME_MAP`** — maps plugin-source paths to different destination paths on copy:

| Source (plugin) | Destination (npx `.claude/`) | Reason |
|---|---|---|
| `commands/debug.md` | `commands/gd-debug.md` | Built-in `/debug` enables debug logging |
| `commands/plan.md` | `commands/plan-fast.md` | Built-in `/plan` enters plan-mode |

**`rewriteCommandRefs()`** — walks all copied `.md` files and rewrites slash-command references using `COMMAND_REWRITES` map (`/debug` → `/gd-debug`, `/plan` → `/plan-fast`). The regex uses a negative lookahead `(?![\w.:/-])` so colon variants (`/plan-hard`), path segments (`commands/plan-hard.md`), and identifier extensions (`/planning`) are preserved. The rewrite is idempotent — re-running `npx glassdesk update` does not double-mangle.

Marketplace installs are unaffected: plugin namespacing exposes `glassdesk:debug` and `glassdesk:plan` naturally.

Re-run `npx glassdesk update` once to apply to existing installs.

## Related Pages

- [[plugin-system]] — `GD_PLUGIN_PATH` and `session-init.cjs` in context
- [[serena-mcp-enforcement]] — separate enforcement around code file reads
- [[planning]] — `/plan-fast` command name used by npx installs
