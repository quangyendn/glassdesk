---
phase: 01
title: Reference File + Scope Definition
status: done
completed: 2026-04-30
priority: P2
effort: 1h
depends_on: []
---

# Phase 01: Reference File + Scope Definition

## Context Links
- Spec: `docs/specs/260430-serena-mcp-preference.md` §Acceptance Criteria, §Scope
- Research 01 (tool inventory): `plans/260430-0001-serena-mcp-preference/research/researcher-01-serena-mcp-api.md` §1, §2
- Research 02 (`_shared/` not supported): `plans/260430-0001-serena-mcp-preference/research/researcher-02-claude-code-plugin-infra.md` §7
- Plan: `plan.md` Locked Constraint #1 (revised namespace), #3, #9
- Validation Summary: `plan.md` §Validation Summary (nested namespace decision)

## Overview

Single source of truth for "when to use Serena vs built-in". Lives at plugin root (`docs/`), referenced from all 5 code skills via `${CLAUDE_PLUGIN_ROOT}`. Pure documentation phase — no skill or command edits yet. Foundation for Phases 02-04.

**Effort: 1h. Priority: P2 (blocking subsequent phases).**

## Key Insights

- `skills/_shared/` does NOT exist as a Claude Code convention. Skill loader scans `skills/<name>/SKILL.md`; a `_shared/` dir would be ignored or treated as invalid.
- `${CLAUDE_PLUGIN_ROOT}` is the documented way to reference plugin-internal absolute paths from skill content.
- **Namespace correction (revised 2026-04-30)**: Marketplace-installed Serena exposes tools under nested form `mcp__plugin_serena_serena__<tool>`. Researcher 01's flat-namespace claim was contradicted by direct evidence (deferred-tools list in active session). Flat `mcp__serena__<tool>` is fallback for non-marketplace installs only.
- Serena LSP gaps: Svelte, Astro, ERB, Slim, Haml — must be listed as fallback-to-built-in.

## Requirements

- File MUST live at `plugins/glassdesk/docs/serena-preference.md` (NOT `skills/_shared/`).
- MUST contain ≥7 tool-mapping entries with `mcp__plugin_serena_serena__<tool>` as primary form.
- MUST list ≥10 source-code extensions.
- MUST document namespace patterns: nested primary, flat fallback, wildcard `mcp__*serena*__*` for conditionals.
- MUST mention conditional `$GD_SERENA_AVAILABLE` decision tree.
- MUST flag language-coverage gaps explicitly.
- MUST NOT prescribe auto-onboarding (user-triggered only).
- Length target: ≤200 lines, ≤6KB. Junior dev should grok in <2 minutes.

## Architecture

```
plugins/glassdesk/
├── docs/
│   └── serena-preference.md       ← NEW (this phase)
├── skills/
│   ├── scouting/SKILL.md          ← unchanged this phase
│   ├── building/SKILL.md          ← unchanged this phase
│   ├── fixing/SKILL.md            ← unchanged this phase
│   ├── debugging/SKILL.md         ← unchanged this phase
│   └── planning/SKILL.md          ← unchanged this phase
└── ...
```

## Related Code Files

| Path | Action | Notes |
|------|--------|-------|
| `plugins/glassdesk/docs/serena-preference.md` | CREATE | Sole deliverable this phase |
| `plugins/glassdesk/docs/` | ENSURE_EXISTS | Already exists per `ls` of plugin root |

## Implementation Steps

1. **Create the file** with these sections (in order):

   **a. Title + 1-line summary** ("When to prefer Serena MCP over built-in tools").

   **b. Decision rule** (3 lines):
   "If `$GD_SERENA_AVAILABLE=1` AND target file extension ∈ source-code list → prefer Serena. Else use built-in."

   **c. Tool mapping table** (markdown table, ≥7 rows). Columns: Task | Built-in (fallback) | Serena MCP (preferred) | Notes.

   | Task | Built-in (fallback) | Serena MCP (preferred) | Notes |
   |------|---------------------|------------------------|-------|
   | Read full file body | `Read` | `mcp__plugin_serena_serena__find_symbol(include_body=True)` or `mcp__plugin_serena_serena__read_file` | Prefer `find_symbol` if symbol name known |
   | Find symbol/definition | `Grep` + `Read` | `mcp__plugin_serena_serena__find_symbol` | LSP-resolved |
   | Find references | `Grep -r` | `mcp__plugin_serena_serena__find_referencing_symbols` | LSP-backed; structural |
   | List symbols in file | `Read` + parse | `mcp__plugin_serena_serena__get_symbols_overview` | Cheapest first-look |
   | Edit symbol body | `Edit` | `mcp__plugin_serena_serena__replace_symbol_body` | Structure-aware |
   | Find file by name | `Glob` | `mcp__plugin_serena_serena__find_file` | Respects gitignore |
   | Search pattern | `Grep` | `mcp__plugin_serena_serena__search_for_pattern` | Adds glob filtering |

   **d. Namespace patterns** (NEW section, replaces old "Namespace patterns" stub):
   - **Primary (marketplace install)**: `mcp__plugin_serena_serena__<tool>` — nested form. This is the default for users who install Serena via `/plugin install serena@claude-plugins-official`. Confirmed via deferred-tools list in active Claude Code sessions (2026-04-30).
   - **Fallback (manual install)**: `mcp__serena__<tool>` — flat form. Applies when user adds Serena directly to `~/.claude/mcp.json` outside the marketplace flow.
   - **Recommended in conditional logic**: match wildcard `mcp__*serena*__<tool>` to cover both forms. Example skill phrasing: "prefer `mcp__plugin_serena_serena__find_symbol` (or `mcp__serena__find_symbol` if installed manually) over `Grep`+`Read`".
   - If Claude reports the tool is unavailable under the nested name, retry the flat name once before falling back to built-in.

   **e. Source-code extension whitelist** (bullet list, ≥10):
   `.ts .tsx .js .jsx .mjs .cjs .py .rb .go .rs .java .php .c .cpp .h .vue`

   **f. Fallback-to-built-in extensions** (separate bullet list):
   `.svelte .astro .erb .slim .haml .md .json .yaml .yml .toml .sql .html .css .scss`
   Note: Svelte/Astro/ERB/Slim/Haml are NOT confirmed in Serena's LSP language pack as of 2026-04-30 — treat as built-in territory until verified.

   **g. Onboarding note** (3 lines):
   Serena requires `mcp__plugin_serena_serena__onboarding` once per project. User-triggered, NOT auto. Hooks must NOT call this. First call indexes the repo (~30k–80k tokens for ~1000-file repos).

   **h. Conflict note** (2 lines):
   If user has global `~/.claude/CLAUDE.md` Serena rules, plugin instruction is redundant but harmless. No deduplication required.

2. **Cross-link comment** at top of file:
   ```html
   <!-- Referenced from skills/{scouting,building,fixing,debugging,planning}/SKILL.md via ${CLAUDE_PLUGIN_ROOT}/docs/serena-preference.md -->
   ```

3. **Lint check**: ensure no broken outbound links (this file does not link out — skills link in).

## Todo List

- [ ] Create `plugins/glassdesk/docs/serena-preference.md` with all sections above
- [ ] Verify ≥7 tool-mapping entries, all using `mcp__plugin_serena_serena__<tool>` primary form
- [ ] Verify "Namespace patterns" section documents nested primary, flat fallback, wildcard for conditionals
- [ ] Verify ≥10 source-code extensions in whitelist
- [ ] Verify language-coverage gaps listed in fallback section
- [ ] Verify file ≤200 lines
- [ ] `git diff --stat` shows only the new file

## Success Criteria

- File exists at exact path `plugins/glassdesk/docs/serena-preference.md`.
- Markdown valid (table renders, no broken syntax).
- All Serena tool names match registry (cross-check Research 01 §1 verbatim).
- Primary namespace in every table row uses nested form `mcp__plugin_serena_serena__*`.
- Namespace fallback (`mcp__serena__*`) and wildcard pattern documented.
- No reference to `skills/_shared/` anywhere.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Tool name typo (e.g. `find_symbols` vs `find_symbol`) | Med | Cross-check Research 01 §1 verbatim |
| Wrong namespace prefix shipped (revert to flat) | High | Plan §Locked Constraint #1 + Validation Summary explicit; reviewer must verify |
| Extension list drift (claim Svelte LSP support) | Low | Use Research 01 §2 as source of truth |
| File overlong → not read by Claude when referenced | Low | Hard cap 200 lines |

## Security Considerations

- None. Static markdown documentation. No secrets, no executable content.

## Next Steps

- Phase 02 will reference this file from the SessionStart hint message ("see `${CLAUDE_PLUGIN_ROOT}/docs/serena-preference.md`").
- Phase 03 will inject the reference pointer into 5 skills using nested namespace form in illustrative examples.
