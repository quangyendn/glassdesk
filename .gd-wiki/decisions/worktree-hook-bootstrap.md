---
title: "Worktree Hook Bootstrap"
updated: 2026-05-05
tags: [category/decision, hooks, worktree, npx]
summary: "Hook commands in settings.local.json are wrapped in a self-bootstrapping shell preamble that symlinks the main repo's .claude/hooks/ into the worktree on first SessionStart, then exec-s the real hook — resolving the MODULE_NOT_FOUND chicken-and-egg crash in fresh worktrees."
---

`npx glassdesk init/update` now wraps every hook command entry in a self-bootstrapping bash preamble. On first SessionStart inside a git worktree the wrapper creates `<worktree>/.claude/hooks → <main>/.claude/hooks` as a symlink, then `exec`s the real hook. The symlink persists; subsequent sessions skip bootstrap.

## Problem

A chicken-and-egg crash blocked every fresh git worktree session:

1. Claude Code fires the `SessionStart` hook by running the command string stored in `.claude/settings.local.json`.
2. That command is `node "${CLAUDE_PROJECT_DIR}/.claude/hooks/session-init.cjs"`.
3. In a fresh worktree, `.claude/hooks/` does not exist — it is neither committed nor symlinked yet.
4. Node exits with `MODULE_NOT_FOUND` at `cjs/loader:1404` before any glassdesk code runs.
5. No hook runs, so no bootstrap can happen — the hook cannot bootstrap itself.

The symlink-based worktree support added in an earlier cycle (`ensureWorktreeSymlinks`) runs *inside* `session-init.cjs`, so it never fires if Node crashes before reaching it.

## Decision

Wrap every hook command at install time with a self-bootstrapping shell preamble (the "wrapper"). The wrapper:

1. Detects whether `.claude/hooks/<HOOK_FILE>` exists in the current worktree.
2. If missing, resolves the main repo via `git rev-parse --git-common-dir` and creates the symlink `<worktree>/.claude/hooks → <main>/.claude/hooks`.
3. If the hook file still does not exist after bootstrap (bare repo, no hooks installed), exits silently with code 0.
4. Otherwise `exec node "<hook>"` — replaces the shell process with Node.

The wrapper is generated at `npx glassdesk init/update` time by `wrapHookCommand(hookFile)` in `bin/cli.js` and written verbatim into the `"command"` field of each hook entry. `JSON.stringify` handles all escaping — no manual quoting.

Migration: `bin/cli.js::migrateHookCommandsToWrapped` detects legacy bare `node "..."` entries via `STALE_GLASSDESK_HOOK_RE` and rewrites them. Idempotent — the wrapped form does not match the legacy regex, so re-running `npx glassdesk update` is a no-op on already-migrated files.

## Wrapper anatomy

Final locked literal (single-line; `<HOOK_FILE>` is substituted per hook at generate time):

```
bash -c 'C="${CLAUDE_PROJECT_DIR:-$PWD}"; H="$C/.claude/hooks/<HOOK_FILE>"; if [ ! -e "$H" ]; then G=$(git -C "$C" rev-parse --git-common-dir 2>/dev/null); if [ -n "$G" ]; then M=$(dirname "$G"); if [ -d "$M/.claude/hooks" ] && [ "$M" != "$C" ]; then mkdir -p "$C/.claude"; ln -sfn "$M/.claude/hooks" "$C/.claude/hooks"; fi; fi; fi; [ -e "$H" ] && exec node "$H"'
```

Line-by-line explanation:

| Fragment | Purpose |
|---|---|
| `C="${CLAUDE_PROJECT_DIR:-$PWD}"` | Resolve project root. `CLAUDE_PROJECT_DIR` is always set for hook processes; `$PWD` is the fallback for manual testing. |
| `H="$C/.claude/hooks/<HOOK_FILE>"` | Absolute path to the target hook file. Substituted by `wrapHookCommand`. |
| `if [ ! -e "$H" ]` | Guard: only bootstrap when the hook file is absent (symlink not yet created, or stale). |
| `G=$(git -C "$C" rev-parse --git-common-dir 2>/dev/null)` | Locate the common `.git` directory. In a worktree this is `.git/worktrees/<name>/..` → returns the main repo `.git`. In the main repo it returns `.git`. Stderr suppressed — non-repo CWD exits silently. |
| `if [ -n "$G" ]` | Skip if not a git repo (bare terminal, CI with no git, etc.). |
| `M=$(dirname "$G")` | Main repo root = parent of the common git dir. |
| `if [ -d "$M/.claude/hooks" ] && [ "$M" != "$C" ]` | Only bootstrap when (a) main has a hooks dir and (b) we are in a worktree, not the main repo itself. |
| `mkdir -p "$C/.claude"` | Ensure `.claude/` exists in the worktree before creating the symlink. |
| `ln -sfn "$M/.claude/hooks" "$C/.claude/hooks"` | Create (or replace) the symlink. `-s` symbolic, `-f` force-overwrite stale, `-n` treat existing symlink-as-symlink not dir. |
| `[ -e "$H" ] && exec node "$H"` | After bootstrap attempt, run the hook if it exists. `exec` replaces the shell — no zombie shell process. If hook still missing (main has no hooks dir), exits 0 silently. |

Compatibility: POSIX sh + bash 3.2 (macOS `/bin/bash`). No bash 4+ syntax.

## Rejected alternatives

**Option A — track `.claude/hooks/` into git.** Would require every project using glassdesk to commit generated hook files. Conflicts with glassdesk's install-time codegen model (`$GD_PLUGIN_PATH` rewriting). Creates merge noise in multi-developer repos. Rejected: wrong layer.

**Option C — user-global hook install (`~/.glassdesk/bin/run-hook.sh`).** Requires out-of-band install step, breaks zero-config promise. Complicates marketplace vs npx co-install scenarios. Rejected: violates KISS.

**`.worktreeinclude` copy approach.** Claude Code does not yet ship a `.worktreeinclude` feature. A file-copy fallback would need to track drift between main and worktree copies — complexity without benefit over symlinks. Rejected: premature, higher maintenance.

**Inlining bootstrap in `session-init.cjs`.** The hook cannot self-bootstrap because Node must successfully load the file before any JS runs. A shell preamble is the only layer that executes before Node resolves the module path. Rejected: technically impossible.

## Related

- [[260504-serena-worktree-isolation]] — three-layer defense pattern this decision extends (docs + hint + auto-bootstrap)
- [[plugin-path-resolution-fix]] — install-time codegen precedent (`$GD_PLUGIN_PATH` rewriting in `.md` files)
- [[plugin-system]] — `session-init.cjs` and `ensureWorktreeSymlinks` in context
