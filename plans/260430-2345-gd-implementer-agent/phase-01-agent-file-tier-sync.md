---
phase: 01
title: "Agent file + tier sync"
status: done
completed_at: 2026-05-01
effort: S
depends_on: none
---

# Phase 01 — Agent file + tier sync

## Context Links

- Parent plan: [plan.md](./plan.md)
- Brainstorm: `plans/reports/brainstorm-260430-2345-gd-implementer-agent.md`
- Wiki — tier policy: `.gd-wiki/decisions/model-tier-policy.md`
- Wiki — ghost-agent: `.gd-wiki/decisions/ghost-agent-resolution.md` (HARD ordering: this phase MUST land + commit BEFORE Phase 2)
- Sibling agent (closest match — copy frontmatter shape): `plugins/glassdesk/agents/gd-tester.agent.md`
- Sibling agent (code-editing standard tier — copy tool list & protocol): `plugins/glassdesk/agents/gd-code-simplifier.agent.md`
- Sibling agent (orchestrator pattern): `plugins/glassdesk/agents/gd-planner.agent.md`

## Goal

Tạo `gd-implementer` agent file (tier=standard) + chạy `bin/sync-models` để resolve `model: sonnet`. Không touch skill files.

## Key Insights

1. **Ghost-agent trap**: nếu commit skill ref `gd-implementer` trước khi agent file tồn tại, Claude Code silent fallback về Opus main thread → toàn bộ cost-shift goal phá sản. Atomic commit phase này = một cứng tính một-cứng.
2. **Type-check resolution sống trong agent body** (per user answer #4 + KISS): main thread KHÔNG pre-resolve command. Agent đọc phase metadata + project, tự chọn từ table.
3. **Tools list** mirror code-simplifier: full Serena MCP surface + Read/Edit/Write/MultiEdit/Glob/Grep/Bash/TodoWrite. Serena cho code, built-in cho non-code (đúng convention `building/SKILL.md` § Tool Preference).

## Requirements

- Agent file: `plugins/glassdesk/agents/gd-implementer.agent.md` (SoT — KHÔNG mirror sang `.claude/agents/`)
- Frontmatter: `name`, `description` (multi-line với 3 examples), `tools`, `tier: standard`, `model: sonnet`, `color`
- Body sections:
  - **Core mission**: phase-scoped first-draft implementation, type-check, structured return
  - **Tool preference**: Serena cho code file, built-in cho non-code (cite `${CLAUDE_PLUGIN_ROOT}/docs/serena-preference.md`)
  - **Operational protocol**: read phase + plan → loop tasks via internal TodoWrite → run type-check (per phase declaration) → return summary
  - **Type-check resolution table** (TS / Rust / Ruby / Python / Go / skip-with-reason)
  - **Output contract schema** (structured return: files_changed[], type_check_status, blockers[], retry_hint?)
  - **Forbidden patterns**: no commenting tests, no `as any`, no skip type-check, no delegating edit-work back to main, no test execution, no test loop
  - **Boundaries**: first-draft only; tests = `gd-tester` Step 3
- Type-check parallelism rule: phase frontmatter declares `typecheck_parallel_safe: true|false`; default false (sequential).

## Architecture Notes (Pseudocode — illustrate contract only)

Output contract schema agent MUST return:

```
## Implementation Summary
files_changed: [path1, path2, ...]
type_check_status: success | failed | skipped
type_check_output: <stdout/stderr if failed; reason if skipped>
blockers: [{task_id, reason}, ...]   # empty array if none
retry_hint: <delta context for re-dispatch, optional>
```

Phase frontmatter convention (consumed by implementer):

```yaml
typecheck_parallel_safe: false   # default
typecheck_stacks: [ts, rust]     # optional explicit list
```

## Files Touched

| Path | Action |
|---|---|
| `plugins/glassdesk/agents/gd-implementer.agent.md` | CREATE |

(That's it. NO `.claude/agents/`, NO skill edits, NO wiki edits, NO models.yml edits.)

## Implementation Steps

1. Read 3 sibling agents (gd-tester, gd-code-simplifier, gd-planner) → distill frontmatter shape, body conventions, wording style
2. Draft `gd-implementer.agent.md` frontmatter (name, description with 3 examples, tools, tier, model placeholder, color)
3. Draft body: Core mission, Tool preference, Operational protocol, Type-check resolution table, Output contract, Forbidden patterns, Boundaries
4. Write file
5. Run `node plugins/glassdesk/bin/sync-models` → verify `model:` field resolved sang `sonnet`
6. Run drift hook check manually: `bash plugins/glassdesk/scripts/install-dev-hooks.sh --dry-run` (or whatever invocation pattern hook supports)
7. `git add plugins/glassdesk/agents/gd-implementer.agent.md` + commit. Phase 2 KHÔNG được start trước commit này.

## Todo List

- [ ] Read 3 sibling agent files
- [ ] Write agent frontmatter (tier=standard, tools list, color)
- [ ] Write body — core mission + tool preference
- [ ] Write body — operational protocol + type-check table
- [ ] Write body — output contract + forbidden patterns + boundaries
- [ ] Run `bin/sync-models` → confirm `model: sonnet` resolved
- [ ] Verify pre-commit drift hook passes
- [ ] Commit (atomic — agent file only)

## Acceptance Criteria

- File exists at `plugins/glassdesk/agents/gd-implementer.agent.md`
- Frontmatter has `tier: standard` AND `model: sonnet` (post sync-models)
- Tools list contains: `Read, Edit, Write, MultiEdit, Glob, Grep, Bash, TodoWrite, mcp__plugin_serena_serena__*`
- Body has all 7 sections (mission / tools / protocol / type-check table / output contract / forbidden / boundaries)
- Type-check table covers: TS, Rust, Ruby, Python, Go, skip-with-reason
- `bin/sync-models` exits 0 with no drift warnings on the new file
- Pre-commit hook passes
- Commit boundary: this file standalone — NO skill or wiki changes in same commit
- `.claude/agents/` UNCHANGED (no new file there)

## Type-check / Verification Commands

```bash
# 1. Run sync-models — verify model field resolves
node plugins/glassdesk/bin/sync-models

# 2. Confirm tier + model in agent file
head -20 plugins/glassdesk/agents/gd-implementer.agent.md | grep -E "tier:|model:"

# 3. Verify drift hook (whatever invocation install-dev-hooks.sh exposes)
bash plugins/glassdesk/scripts/install-dev-hooks.sh
# Then trigger pre-commit:
git add plugins/glassdesk/agents/gd-implementer.agent.md
git diff --cached --name-only

# 4. Confirm .claude/agents/ NOT touched
git status -- .claude/agents/   # expect: nothing
```

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Forget `bin/sync-models` → `model:` field stays placeholder → drift hook fails on commit | HIGH | Step 5 explicit; commit step requires hook PASS |
| Accidentally write to `.claude/agents/` (muscle memory / hook redirect) | MED | Step 4 explicit "ONLY plugin dir"; Step verification grep `git status -- .claude/agents/` empty |
| Tools list missing Serena MCP → agent falls back to built-in always (still works but slower for code) | LOW | Mirror code-simplifier tools list verbatim |
| Description block too short → agent description-matching dispatch heuristic mismatches | LOW | Include 3 example bullets per tier-policy convention |

## Out of Scope

- ANY edit to `plugins/glassdesk/skills/building/**` (that's Phase 2)
- ANY edit to `.gd-wiki/**` (that's Phase 3)
- `.claude/agents/` mirroring or cleanup
- Changes to `config/models.yml` or `bin/sync-models`
- Pre-writing `.gd-wiki/decisions/implementer-agent.md` (let `/learn` handle post-merge)

## Next

Once committed, Phase 2 unblocks. Phase 2 is the FIRST place where any skill file may reference `gd-implementer`.
