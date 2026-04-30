---
name: building
description: Use when executing an implementation plan phase-by-phase with verification gates, test-driven loops, and subagent orchestration. Use for /code and /code:auto workflows.
---

# Building

Execute implementation plans with structured phase gates, mandatory testing, code review, and finalization steps.

## Tool Preference

For source-code files (`.ts`, `.tsx`, `.py`, `.rb`, `.go`, `.rs`, `.js`, `.jsx`, `.java`, `.php`, `.vue`, etc.): if `$GD_SERENA_AVAILABLE=1`, prefer Serena MCP tools — e.g. `mcp__plugin_serena_serena__find_symbol` over `Grep`+`Read` for symbol lookup, `mcp__plugin_serena_serena__find_referencing_symbols` over `Grep -r`, `mcp__plugin_serena_serena__get_symbols_overview` for first-look, `mcp__plugin_serena_serena__replace_symbol_body` over `Edit`. If those names are unavailable, try the flat fallback `mcp__serena__<tool>` (manual installs). Otherwise fall back to built-in. See `${CLAUDE_PLUGIN_ROOT}/docs/serena-preference.md` for full mapping. Non-code files (markdown, JSON, YAML, configs) always use built-in.

## When to Use

- Executing a plan phase (`/code`, `/code:auto`)
- Implementing tasks with test-driven verification
- Orchestrating subagent teams for plan delivery
- NOT for planning (use `planning` skill) or debugging alone (use `fixing` skill)

## Core Pattern

| Step | Who | Gate |
|------|-----|------|
| 0 — Plan detection | main | auto-select next incomplete phase |
| 1 — Analysis + TodoWrite | project-manager | map dependencies, extract tasks |
| 2 — Implementation | gd-implementer (mandatory) | implementer return success + type-check pass |
| 3 — Testing | tester | 100% pass required |
| 4 — Code review | code-reviewer | 0 critical issues required |
| 5 — Approval / Finalize | main + git-manager | user approval (code.md) or auto (code:auto) |

## Step 2 Orchestrate-only main thread

The main thread **MUST dispatch `gd-implementer`** for Step 2 implementation. The main thread **MUST NOT** Edit, Write, or MultiEdit source files in Step 2 — file edits are owned by the implementer subagent.

The main thread orchestrates only:
- Read the phase file + `plan.md` (Locked Constraints, Acceptance Criteria, Out of Scope)
- Dispatch `gd-implementer` once per phase with `phase_path`, `plan_path`, `typecheck_parallel_safe` (from phase frontmatter, default `false`)
- Receive structured Implementation Summary; gate on `success` + `type_check_status: success | skipped`
- On `partial` or `type_check_status: failed`: re-dispatch with `retry_hint` (cap 1 retry per failure mode); on retry exhausted, escalate `gd-debugger`

This mirrors `planning` skill § Orchestrate-only main thread. Rationale: avoids paying premium-tier (Opus) token cost for Step 2 first-draft edits that the standard tier (Sonnet) handles. See `references/execution-gates.md` for the Failure Escalation table.

If `gd-implementer` is unavailable (ghost-agent fallback), STOP and surface the warning — do NOT silently fall back to main-thread edits.

## Implementation

Load: `references/execution-gates.md` for step format, blocking gate rules, TodoWrite tracking.
Load: `references/auto-execution.md` for auto-mode ($ALL_PHASES) and summary report logic.
Load: `references/test-driven-loop.md` for testing standards and TDD patterns.

## Common Mistakes

- Skipping `✓ Step N:` output markers (step is INCOMPLETE without them)
- Marking step complete before gate passes
- Commenting out tests or changing assertions to make them pass
- Assuming user approval without explicit response
- Running `gd-project-manager` and `gd-docs-manager` sequentially (must be parallel)
- **Main thread Edit/Write source files in Step 2 — forbidden, MUST dispatch `gd-implementer`**
