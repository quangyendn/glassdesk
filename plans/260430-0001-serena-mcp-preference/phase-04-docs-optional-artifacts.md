---
phase: 04
title: Docs + Optional Artifacts
status: done
completed: 2026-04-30
priority: P3
effort: 0.5h
depends_on: [01, 02, 03]
---

# Phase 04: Docs + Optional Artifacts

## Context Links
- Spec: `docs/specs/260430-serena-mcp-preference.md` §Acceptance Criteria (README, quick-start, CHANGELOG items)
- Phase 03 output: `validation-results.md` (token-reduction A/B)
- Plan: `plan.md` Locked Constraint #8 (no PreToolUse hook in plugin)
- Validation Summary: `plan.md` §Validation Summary (`.example` hook DROPPED)

## Overview

User-facing surfaces: README "Recommended optional dependencies" section, `docs/quick-start.md` Serena note, `CHANGELOG.md` entry. Makes the integration discoverable for new users.

**The optional `hooks/serena-enforce.cjs.example` artifact is DROPPED per validation summary** — user already has a global enforcer at `~/.claude/hooks/enforce-serena.sh`; a plugin-shipped duplicate would confuse users and risk double-blocking.

**Effort: ~0.5h. Priority: P3 (polish).**

## Key Insights

- Serena is OPTIONAL; docs must NOT make it sound mandatory. Frame as "recommended for code-heavy work".
- Quick-start already lists optional deps in a table — extend the table, don't add a new section.
- CHANGELOG entry grouped under "Added" with brief rationale.
- No plugin-shipped enforcement hook (decision finalized in Validation Summary). Avoids foot-gun + double-block risk.

## Requirements

- README section MUST include verified install command (`/plugin install serena@claude-plugins-official`).
- README MUST mention prerequisite: Python + `uv` (Serena's `.mcp.json` uses `uvx`).
- Quick-start update MUST be ≤1 paragraph or 1 table row addition.
- CHANGELOG entry MUST follow existing format and bump version.
- MUST NOT ship any `hooks/serena-enforce.cjs.example` file.

## Architecture

```
plugins/glassdesk/
├── README.md                              ← EDIT (add Serena to optional deps)
├── docs/
│   └── quick-start.md                     ← EDIT (mention Serena)
├── CHANGELOG.md                           ← EDIT (new version entry)
└── plugin.json                            ← EDIT (version bump)
```

## Related Code Files

| Path | Action | Notes |
|------|--------|-------|
| `plugins/glassdesk/README.md` | EDIT | Extend "Optional by feature" table or add subsection |
| `plugins/glassdesk/docs/quick-start.md` | EDIT | Add 1 sentence + install command in optional deps area |
| `plugins/glassdesk/CHANGELOG.md` | EDIT | New version entry under "Added" |
| `plugins/glassdesk/plugin.json` | EDIT | Bump `version` to next minor (e.g., `0.4.0`) |

## Implementation Steps

1. **README.md** — add Serena to "Optional by feature" table (or wherever existing optional deps live). Example row:

   ```markdown
   | Serena MCP (recommended for code) | `/plugin install serena@claude-plugins-official` (requires Python + `uv`) | 50–90% token reduction on symbol/refactor work; auto-detected by glassdesk SessionStart hook |
   ```

   Add a note below the table:
   "When Serena is absent, glassdesk shows a one-time install hint per session and falls back to built-in `Read`/`Grep`/`Edit`. No commands break."

2. **`docs/quick-start.md`** — add a single line in the optional dependencies section:

   ```markdown
   | Symbol-aware code tools (50–90% token reduction) | `/plugin install serena@claude-plugins-official` (needs `uv`) |
   ```

3. **`CHANGELOG.md`** — new version entry. Use next minor bump (e.g., `0.4.0`):

   ```markdown
   ## [0.4.0] — 2026-04-30

   ### Added
   - Serena MCP integration: SessionStart hook detects Serena (via `~/.claude/settings.json` and `claude plugin list --json` fallback), sets `GD_SERENA_AVAILABLE` env var, prints install hint when absent.
   - Tool-preference reference at `docs/serena-preference.md` (single source of truth for built-in vs Serena tool mapping; nested namespace `mcp__plugin_serena_serena__*` documented as primary).
   - Skill instructions in `scouting`, `building`, `fixing`, `debugging`, `planning` now prefer Serena symbol tools when available; clean fallback to built-in otherwise.
   - Commands `/scout`, `/code`, `/fix`, `/debug`, `/plan` carry tool-preference note.

   ### Notes
   - Serena is **not** a hard dependency. Plugin works without it.
   - First-time use per project: Serena prompts a one-time `onboarding` task.
   ```

4. **`plugin.json`** — bump `version` to `"0.4.0"` (or matching CHANGELOG entry).

5. **Validation: docs render**:
   - Open README in markdown preview, confirm table renders cleanly.
   - Confirm CHANGELOG version matches `plugin.json` `version`.
   - Run `claude plugin validate` (or `/plugin validate` in-session) to ensure manifest still loads.

## Todo List

- [ ] Edit `README.md` — add Serena to optional deps + fallback note
- [ ] Edit `docs/quick-start.md` — add Serena row
- [ ] Edit `CHANGELOG.md` — new version entry
- [ ] Bump `plugin.json` `version` to next minor
- [ ] Run `claude plugin validate`
- [ ] Final smoke test: install plugin from clean state, verify hint shows, verify install instructions copy-paste correctly
- [ ] Update plan.md status to `completed`

## Success Criteria

- README clearly lists Serena as recommended optional, with verified install command.
- Quick-start mentions Serena in optional-deps area.
- CHANGELOG entry committed with correct version.
- `plugin.json` version bumped, matches CHANGELOG.
- `claude plugin validate` passes.
- No `hooks/serena-enforce.cjs.example` shipped.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Install command in README is wrong/typo'd | High | Cross-check Research 01 §6 verbatim before commit |
| Version bump conflicts with parallel work | Low | Check git log before bump |
| `claude plugin validate` fails after version bump | Low | Run validate; fix manifest if needed |
| Marketplace name typo (supply-chain risk) | High | Verify `claude-plugins-official` exactly; do not paste from memory |

## Security Considerations

- README install commands: ensure they point at `anthropics/claude-plugins-official` (verified) — not a typo'd marketplace name (supply-chain risk).
- No executable artifacts shipped this phase (`.example` hook dropped).

## Next Steps

- Archive plan via `/plan:archive` once all criteria met.
- Track Serena adoption qualitatively (user feedback) for 4 weeks.
- If validation reduction in Phase 03 was <40%, open follow-up plan to investigate why Claude isn't picking up Serena despite preference (skill-block phrasing, namespace mismatch, or onboarding friction).
