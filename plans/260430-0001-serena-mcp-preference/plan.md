---
title: Serena MCP as Preferred LSP Tool — Plugin Integration
slug: serena-mcp-preference
status: in-progress
priority: P2
effort: 5h
branch: main
created: 2026-04-30
tags: [plugin, mcp, serena, integration, dx]
spec: docs/specs/260430-serena-mcp-preference.md
---

# Plan: Serena MCP as Preferred LSP Tool

## Overview

Wire Serena MCP into glassdesk as the **preferred** symbol-aware code tool for the 5 code-centric skills (`scouting`, `building`, `fixing`, `debugging`, `planning`) and their commands (`/scout`, `/code`, `/fix`, `/debug`, `/plan`). Detection runs once per session via SessionStart hook; install hint emitted when Serena absent. Plugin must continue to work cleanly without Serena (soft preference, no hard dependency).

Driver: 50–90% token reduction on symbol-finding/refactor flows over large codebases. Built-in `Read`/`Grep` return raw bytes; Serena returns just the symbol body or LSP-resolved references.

## Phases

| # | Name | Effort | Outputs |
|---|------|-------:|---------|
| 01 | Reference file + scope definition | 1h | `plugins/glassdesk/docs/serena-preference.md` |
| 02 | SessionStart hook detection + install hint | 1.5h | Extended `hooks/session-init.cjs`, helper in `hooks/lib/gd-config-utils.cjs` |
| 03 | Skill + command integration | 1.5h | 5 skills + 5 commands updated with reference pointer |
| 04 | Docs (no optional artifacts) | 0.5h | `README.md`, `docs/quick-start.md`, `CHANGELOG.md` |

**Total: ~4.5h**

## Locked Constraints (overrides spec where they conflict)

These are decisions resolved by research; do **not** revisit during implementation.

1. **Namespace = `mcp__plugin_serena_serena__*` (nested) — primary.** ⚠️ REVISED 2026-04-30 after user-observed evidence (deferred-tools list in active session shows nested form). Researcher 01's flat-namespace claim was WRONG for marketplace installs. Reference file uses nested pattern as primary; flat `mcp__serena__*` documented as fallback for non-marketplace installs (e.g., user manually adding Serena to `mcp.json`). (Spec Open Q #2 → resolved with correction.)
2. **No `optional: true` flag in `plugin.json` dependencies.** Field does not exist in marketplace schema. Serena stays **out** of `dependencies[]`. Hook-based hint is the only portable path. (Spec Open Q #2 / Phase 4 brainstorm → resolved: do NOT add.)
3. **No `skills/_shared/` directory.** Claude Code skills loader does not support it; would create a phantom skill. Reference file lives at `plugins/glassdesk/docs/serena-preference.md` and is referenced via `${CLAUDE_PLUGIN_ROOT}/docs/serena-preference.md`. **This overrides spec acceptance criterion** that names `skills/_shared/serena-preference.md`.
4. **SessionStart stdout = auto context injection (≤10K chars).** Plain `console.log()` is sufficient — no JSON wrapper. Existing hook pattern preserved.
5. **`CLAUDE_ENV_FILE` format = bash `export` statements.** Existing `writeEnv()` helper handles this — reuse, don't reinvent.
6. **Detection chain**: read `~/.claude/settings.json` `enabledPlugins` for any key matching `/^serena@/` → fallback `claude plugin list --json` (timeout 3s) → fallback `false`. Settings.json is fastest and authoritative for "enabled" state.
7. **No auto-onboarding.** Serena requires explicit `onboarding` tool call; hint must mention this is one-time per project, user-triggered.
8. **No PreToolUse enforcement hook in plugin.** Yen already has a global one (`~/.claude/hooks/enforce-serena.sh`); plugin-shipped hook would double-block. May ship as `.example` file in Phase 04 (opt-in).
9. **Language coverage gaps**: Svelte/Astro/ERB/Slim/Haml are NOT confirmed in Serena LSP. Reference file lists them explicitly under "fallback to built-in".
10. **Project activation**: Serena's official `.mcp.json` runs without `--project-from-cwd` flag (no `--context` either) — defaults apply. Glassdesk does not set this; nothing to do.

## Acceptance Criteria

- [ ] `plugins/glassdesk/docs/serena-preference.md` exists with: tool-mapping table (≥7 entries), source-code extension whitelist (≥10), namespace pattern guidance (flat primary + wildcard fallback), conditional logic (`$GD_SERENA_AVAILABLE` decision tree), language-coverage gap list.
- [ ] `hooks/session-init.cjs` detects Serena via settings.json → CLI fallback → assume-false; sets `GD_SERENA_AVAILABLE=1|0`; prints install hint (≤10 lines) to stdout when 0; non-blocking on detection failure.
- [ ] 5 skills (`scouting`, `building`, `fixing`, `debugging`, `planning`) carry an identical "Tool Preference" block (≤5 lines) referencing `${CLAUDE_PLUGIN_ROOT}/docs/serena-preference.md`.
- [ ] 5 commands (`/scout`, `/code`, `/fix`, `/debug`, `/plan`) carry a 1-line Serena availability check at the head of body.
- [ ] Skills `wiki`, `compounding`, `brainstorming`, `media-processing`, `ai-multimodal`, `pair-programming`, `code-review` are **not** modified.
- [ ] `README.md` has "Recommended optional dependencies" section listing Serena, why, and verified install commands.
- [ ] `docs/quick-start.md` carries a one-paragraph Serena note.
- [ ] `CHANGELOG.md` has a v0.4.0 (or appropriate) entry.
- [ ] **Validation**: run `/scout` on glassdesk repo (TS-heavy) before/after Serena install; record token diff. Target ≥40% reduction.
- [ ] Plugin runs clean both with and without Serena installed (no errors, no broken commands).

## Validation Summary

**Validated:** 2026-04-30
**Questions asked:** 4

### Confirmed Decisions

- **Namespace presentation**: Nested `mcp__plugin_serena_serena__*` primary, flat `mcp__serena__*` as fallback. Researcher 01's claim invalidated by direct observation in deferred-tools list.
- **Detection mechanism**: Keep `~/.claude/settings.json` `enabledPlugins` check only. No MCP runtime probe (research confirmed no such state file exists).
- **PreToolUse `.example` hook**: DROP. Do not ship. User already has global `~/.claude/hooks/enforce-serena.sh`; plugin-shipped duplicate would confuse. Phase 04 simplifies.
- **Validation target**: Keep ≥40% token reduction on `/scout` A/B test. Re-scope to skill-instructions-only if missed.

### Action Items (for Phase 01–04 implementation)

- [ ] **Phase 01** (`docs/serena-preference.md`): Tool-mapping table uses nested namespace `mcp__plugin_serena_serena__<tool>` as primary. Add note: "If user installs Serena outside marketplace, namespace may be flat `mcp__serena__<tool>` — Claude should match either pattern."
- [ ] **Phase 03** (skill blocks): Skill instruction blocks reference nested pattern explicitly when illustrating preferred tools (e.g., "prefer `mcp__plugin_serena_serena__find_symbol` over `Grep`+`Read`"). Wildcard `mcp__*serena*__*` acceptable in conditional logic.
- [ ] **Phase 04**: Remove the optional `hooks/serena-enforce.cjs.example` artifact from acceptance criteria + implementation steps. README + quick-start + CHANGELOG remain.
- [ ] **Phase 02** (hook detection): No change — settings.json detection is correct.
- [ ] **Validation step** in Phase 03 unchanged — keep ≥40% target.

## Open Questions (carry-forward)

- **Onboarding token cost on glassdesk-sized repo**: still unmeasured. Anecdotal range 30k–80k tokens for ~1000-file repos. Consider measuring during Phase 04 validation.
- **`claude plugin list --json` output stability**: schema not formally versioned. Detection logic must tolerate missing fields; never throw.
- **Whether to ship `serena-enforce.cjs.example`**: defer decision to Phase 04. Risk: users who copy without reading may double-block themselves.
- **Conflict with user's global `~/.claude/CLAUDE.md` Serena rules**: accepted as redundant-but-harmless. Reference file notes this explicitly.
- **MCP namespace under future Claude Code versions**: nested form `mcp__plugin_serena_serena__*` confirmed for marketplace installs as of 2026-04-30. If Anthropic ever flattens to `mcp__serena__*`, reference file's documented fallback covers it; revisit if user reports `find_symbol` not being called.

## Risks (cross-phase)

| Risk | Mitigation |
|------|-----------|
| Detection false-negative (settings.json schema drift) | Loose key match `/^serena@/`; CLI fallback; final fallback = assume false (hint shows; no break) |
| Hint dropped if SessionStart stdout overflows 10K cap | Keep hint ≤10 lines (~500 chars); existing hook output is small |
| Redundancy with user's global Serena rules | Reference file notes redundancy; zero-harm |
| Phase 04 `.example` file confuses users | Clear filename suffix + README warning; ship only if Phase 04 validation flags need |
| Serena's own onboarding cost surprises users | Hint message explicitly mentions one-time per-project onboarding |
| Skill instruction "rationalized away" by Claude (uses Grep anyway) | Phase 03 validation step: A/B token measurement on glassdesk repo |

## Validation Strategy

In Phase 03 or 04: run `/scout` on this repo (TS-heavy) twice — once with Serena disabled, once enabled. Sample 5 sessions each side; measure prompt+output tokens via Claude Code `/cost` or transcript inspection. Record in plan dir as `validation-results.md`. Target ≥40% reduction; flag for revisit if <25%.

## References

- Spec: `docs/specs/260430-serena-mcp-preference.md`
- Brainstorm: `plans/reports/brainstorm-260430-0001-serena-mcp-preference-integration.md`
- Research 01 (Serena API): `plans/260430-0001-serena-mcp-preference/research/researcher-01-serena-mcp-api.md`
- Research 02 (Plugin infra): `plans/260430-0001-serena-mcp-preference/research/researcher-02-claude-code-plugin-infra.md`
