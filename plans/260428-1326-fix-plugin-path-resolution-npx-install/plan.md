---
title: "Fix $GD_PLUGIN_PATH resolution fragility for npx install/update"
description: "Eliminate runtime env-var dependency in npx-installed markdown by rewriting $GD_PLUGIN_PATH to ${CLAUDE_PROJECT_DIR}/.claude at install time, plus first-writer-wins guard in session-init."
status: pending
priority: P2
effort: 2.5h
branch: main
tags: [bugfix, infra, cli, plugin]
created: 2026-04-28
planType: hard
---

## Problem

`npx glassdesk init/update` copies plugin markdown into `<project>/.claude/`. Markdown files invoke scripts via `node "$GD_PLUGIN_PATH/scripts/set-active-plan.cjs" ...`. `$GD_PLUGIN_PATH` is set by `session-init.cjs` SessionStart hook, written to `$CLAUDE_ENV_FILE`.

Two confirmed failure modes (research `01-plugin-path-conventions.md`):

1. **Subagent inheritance gap (bug #46696)** — subagents get a fresh empty `CLAUDE_ENV_FILE`. `$GD_PLUGIN_PATH` is undefined inside any subagent Bash call. Affected: `/plan`, `/plan:hard`, planning skill calls when invoked from a subagent.
2. **Dual-install collision** — when a user has both marketplace plugin + npx install, two SessionStart hooks both write `GD_PLUGIN_PATH` with no deterministic ordering guarantee. Last-writer wins silently.

`${CLAUDE_PLUGIN_ROOT}` does not work in markdown (bug #9354, open). Glassdesk's env-var-via-SessionStart pattern is novel and unvalidated.

## Solution

**Option A (primary)** — at npx `init`/`update`, walk `<project>/.claude/**/*.md` and rewrite the literal token `$GD_PLUGIN_PATH` → `${CLAUDE_PROJECT_DIR}/.claude`. `CLAUDE_PROJECT_DIR` is a built-in absolute path inherited by all subagent Bash calls. Eliminates env-var dependency in npx mode.

**Option B (secondary)** — first-writer-wins guard in `session-init.cjs`: only set `GD_PLUGIN_PATH` if not already in `process.env`. Solves dual-install collision deterministically.

Combined: subagent-safe (A) + collision-safe (B).

## Out of Scope

- **Option C (post-install diagnostic)** — defer; A+B sufficient.
- **Option D (CLI shim `npx glassdesk set-active-plan`)** — overengineered; adds package surface.
- **Option E (self-locating Node script)** — changes invocation contract.
- **Marketplace plugin path resolution** — unaffected; marketplace install still uses runtime `$GD_PLUGIN_PATH` from SessionStart, which works fine in parent session and is the documented workaround.
- **PreToolUse env-source hook** — community workaround for #46696; not needed once A removes the dependency.

## Success Criteria

1. After `npx glassdesk init` in a clean project, `grep -r '\$GD_PLUGIN_PATH' <project>/.claude/` returns zero matches in `.md` files.
2. After `npx glassdesk update`, same assertion holds (idempotent).
3. `node "${CLAUDE_PROJECT_DIR}/.claude/scripts/set-active-plan.cjs" <plan-dir>` works from a subagent Bash call (manual smoke test).
4. With `GD_PLUGIN_PATH` pre-set in env, running session-init does not overwrite it.
5. `tests/integration.test.js` passes including new assertions.
6. Marketplace install path (no `bin/cli.js` involvement) is unaffected — markdown still contains `$GD_PLUGIN_PATH`, still resolved at runtime by SessionStart.

## Phases

| # | Name | Effort | Files | Status |
|---|------|--------|-------|--------|
| 1 | Path rewrite at npx install/update | 1.0h | `bin/cli.js`, `tests/integration.test.js` | DONE 2026-04-28 13:55 |
| 2 | First-writer-wins guard in session-init | 0.5h | `plugins/glassdesk/hooks/session-init.cjs`, test | |
| 3 | Documentation + version bump | 1.0h | `CHANGELOG.md`, `hooks/README.md`, `package.json`, `plugin.json` | |

Total: ~2.5h.

## Locked Constraints

- Replacement token: `${CLAUDE_PROJECT_DIR}/.claude` (absolute, subagent-inheritable, no leading-cwd assumption).
- Regex: `/\$GD_PLUGIN_PATH\b/g` — word boundary required to avoid `$GD_PLUGIN_PATH_FOO` collisions (none exist today, but defensive).
- Scope: only `.md` files under `<project>/.claude/`. Do not touch `.cjs`, `.json`, `.sh`, or files in `scripts/`/`hooks/` (those run inside parent session and use runtime env).
- Skip files already in `copyPluginFiles` skiplist: `settings.local.json`, `.DS_Store`, `CHANGELOG.md`.
- Marketplace bundle (`plugins/glassdesk/**/*.md`) stays unchanged — keeps `$GD_PLUGIN_PATH` for marketplace install path.

## Risks

1. **Drift between npx and marketplace markdown** — npx-installed copies will differ from upstream. Mitigated: `update` re-copies fresh from bundle, then re-rewrites. Manifest `files[]` already tracks them.
2. **Future markdown adds new `$GD_PLUGIN_PATH` reference** — won't get rewritten if `init`/`update` not re-run. Mitigated: rewrite is idempotent; documenting in `hooks/README.md` and CHANGELOG signals contributors.
3. **`${CLAUDE_PROJECT_DIR}` not interpolated inside markdown bash blocks** — research note (Q3 unresolved). Manual smoke test required in Phase 1 verification before merging. Fallback: hard-code `.claude` (project-relative) since Claude Code spawns Bash with cwd=project root.
4. **Word-boundary regex misses cases like `"$GD_PLUGIN_PATH"`** — `\b` matches at non-word char boundary; `"` is non-word so it works. Verify in Phase 1.
5. **First-writer-wins masks legitimate path change** — if user moves project directory mid-session, env var stays stale. Acceptable: session restart re-fires SessionStart with empty env.

## Unresolved Questions

- Is `${CLAUDE_PROJECT_DIR}` interpolated inside markdown bash blocks before being passed to the Bash tool? Research could not confirm. Phase 1 must include a manual smoke test (run `/plan` after init, verify `set-active-plan.cjs` is called with a real path). If interpolation fails, fall back to `.claude/scripts/set-active-plan.cjs` (project-relative; relies on Claude Code's cwd contract).
- Should `update` also re-rewrite previously-copied files even if bundle markdown unchanged? Current plan says yes (always re-rewrite post-copy). Confirms idempotency.

## Validation Summary

**Validated:** 2026-04-28
**Questions asked:** 4 (test coverage focus)

### Confirmed Decisions

- **Subagent verification:** Add automated env-isolation test (spawn child Bash with only `CLAUDE_PROJECT_DIR`, no `GD_PLUGIN_PATH`, execute rewritten command, assert script runs). Replaces manual-smoke-test-only approach.
- **Update flow tests:** Add 2 tests — (a) pre-tampered re-rewrite, (b) double-update no-op (rewrite count = 0 second run). Locks idempotency claim.
- **Content assertion:** Assert both `$GD_PLUGIN_PATH` absent AND `${CLAUDE_PROJECT_DIR}/.claude` present at correct count. Stronger than current "absent only".
- **Bundle invariant:** Add test asserting source bundle `plugins/glassdesk/**/*.md` STILL contains `$GD_PLUGIN_PATH` in the 4 known files. Guards marketplace path against accidental contamination.
- **Dry-run test:** Add explicit test — `--dry-run` reports rewrite count but writes nothing.
- **Skipped:** Adversarial regex test (word boundary). Acceptable risk; covered by content assertion + manual review.

### Action Items (Phase 1 test additions)

- [ ] Add subagent env-isolation test: spawn child process with `env={CLAUDE_PROJECT_DIR: tmpProject}` only, execute the rewritten `node "${CLAUDE_PROJECT_DIR}/.claude/scripts/set-active-plan.cjs" <plan>` line, assert exit 0 and active plan written.
- [ ] Add `update`-tampered test: overwrite a `.md` to contain `$GD_PLUGIN_PATH` again, run `update --yes`, assert rewritten back to `${CLAUDE_PROJECT_DIR}/.claude`.
- [ ] Add `update`-idempotent test: run `update --yes` twice in a row, assert second run's stdout reports `rewrote 0/N` (or equivalent).
- [ ] Strengthen content assertion: count `${CLAUDE_PROJECT_DIR}/.claude` occurrences post-rewrite ≥ 4 (the 4 known references) AND `$GD_PLUGIN_PATH` count = 0.
- [ ] Add bundle-invariant test: scan `plugins/glassdesk/**/*.md` from repo root, assert `$GD_PLUGIN_PATH` present in exactly the 4 expected files.
- [ ] Add `--dry-run` test: snapshot `.claude/` mtimes (or content hash) → run `init --yes --dry-run` → assert post-state unchanged AND stdout includes rewrite count.

### Action Items (Phase 2)

No changes — Phase 2 unit tests already cover set/unset cases adequately.

### Recommendation

Proceed with implementation. Phase 1 todo list must be updated with the 6 new test items above before `/code` execution.
