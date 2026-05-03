---
date: 2026-05-03
session: cc0aaaaf-4bfb-4285-bb80-6c2f0b57457f
tags: [plugin, hooks, cli, settings, migration]
types: [PROBLEM, PATTERN, DECISION, MISTAKE]
---

# Hook path CWD resolution

## Insights

### Plugin hook commands must be CWD-independent
**Type:** MISTAKE
Plugin templates that hardcode `node .claude/hooks/X.cjs` (relative path) break whenever Claude Code spawns the hook from a CWD ≠ project root — subdirectory launch, nested `.claude/` collisions (e.g. `<root>/app/.claude/`), or subagent contexts. Failure mode: `MODULE_NOT_FOUND` at `node:internal/modules/cjs/loader:1404`, status non-blocking so the prompt still goes through with only a warning. Fix: `node "${CLAUDE_PROJECT_DIR:-$PWD}/.claude/hooks/X.cjs"` — env-var first, `$PWD` fallback.

> Evidence: `templates/settings.local.json` patch + e2e verify with `CLAUDE_PROJECT_DIR=/tmp/proj` while CWD=`/tmp` succeeded after fix.

---

### `$CLAUDE_PROJECT_DIR` reliability differs by context
**Type:** DECISION
Claude Code 2.1.x bug #46696 makes `CLAUDE_PROJECT_DIR` unreliable for **Bash-tool spawn** and **subagent** contexts (empirically verified empty in this codebase, hence the `$GD_PLUGIN_PATH → .claude` rewrite for in-markdown command refs). But the variable IS set reliably for **hook processes** (`UserPromptSubmit`, `SessionStart`, etc.). The two contexts must be treated separately — generalising "env var unreliable" into "never use it" loses a working escape hatch.

> Evidence: `bin/cli.js` comment on line ~251 marked env var unreliable; verify run with hook process showed it works with `${CLAUDE_PROJECT_DIR:-$PWD}` fallback.

---

### Plugin-distribution bug fix needs three layers
**Type:** PATTERN
A relative-path-style bug shipped by a plugin distributor must be fixed at three layers in one PR: (1) **source template** so future installs are clean; (2) **CLI migration helper** that purges legacy stale entries on `update`, otherwise dedup-by-string-equality leaves duplicates after the template string changes; (3) **hot-fix already-installed workspaces** so the user is unblocked immediately, not after the next `npx … update`. Single-layer fixes leave silent rot in deployed installs.

> Evidence: This session shipped `templates/settings.local.json` + `purgeStaleGlassdeskHooks()` in `bin/cli.js` + manual edit of `short-video-maker/{,app/}.claude/settings.local.json`.

---

### Settings dedup-by-string-equality misses semantic upgrades
**Type:** PATTERN
Hook merge in `cli.js` deduped by `(type, command)` string equality. When a template upgrades only the command string (here: relative → env-var path), the old entry is treated as a different hook and both end up in user's settings — the broken one keeps firing alongside the new one. Need an explicit regex-based purge keyed on the *legacy* command shape, run before merge. Generalisation: any installer that owns a slot in a user-merged config must carry a migration list, not just a current desired state.

> Evidence: New `purgeStaleGlassdeskHooks(hooksObj, eventNames)` + `STALE_GLASSDESK_HOOK_RE` constant; e2e upgrade test showed both stale entries removed and conflict reported in CLI output.

---

### Self-modification denial — design around it from the start
**Type:** PROBLEM
Claude Code blocks the agent from editing the running session's own `.claude/settings.local.json` ("Self-Modification of agent permissions/behavior"). Recovery cost is real: had to present diff and ask user to apply by hand for the local workspace. Plan plugin/template changes so the *template* (a user-editable artefact, not a live config) carries the canonical fix; downstream installs sync via `npx ... update` rather than via direct settings edits. Hot-fix workspaces other than the running one — those are not denied.

> Evidence: Edit on `/Users/yen.nq/Projects/indie/asdlc/glassdesk/.claude/settings.local.json` returned permission-denied; same edit on `/Users/yen.nq/Projects/indie/short-video-maker/.claude/settings.local.json` succeeded.
