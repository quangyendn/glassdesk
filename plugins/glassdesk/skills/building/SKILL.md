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
| 2 — Implementation | main + subagents | run type checks |
| 3 — Testing | tester | 100% pass required |
| 4 — Code review | code-reviewer | 0 critical issues required |
| 5 — Approval / Finalize | main + git-manager | user approval (code.md) or auto (code:auto) |

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
