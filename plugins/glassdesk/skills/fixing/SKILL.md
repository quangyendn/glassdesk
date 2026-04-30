---
name: fixing
description: Use when debugging errors, fixing failing tests, resolving reported issues, or investigating root causes. Use for /fix and /fix:hard workflows.
---

# Fixing

Systematically diagnose and fix issues using debugger/researcher/tester subagents and structured investigation patterns.

## Tool Preference

For source-code files (`.ts`, `.tsx`, `.py`, `.rb`, `.go`, `.rs`, `.js`, `.jsx`, `.java`, `.php`, `.vue`, etc.): if `$GD_SERENA_AVAILABLE=1`, prefer Serena MCP tools — e.g. `mcp__plugin_serena_serena__find_symbol` over `Grep`+`Read` for symbol lookup, `mcp__plugin_serena_serena__find_referencing_symbols` over `Grep -r`, `mcp__plugin_serena_serena__get_symbols_overview` for first-look, `mcp__plugin_serena_serena__replace_symbol_body` over `Edit`. If those names are unavailable, try the flat fallback `mcp__serena__<tool>` (manual installs). Otherwise fall back to built-in. See `${CLAUDE_PLUGIN_ROOT}/docs/serena-preference.md` for full mapping. Non-code files (markdown, JSON, YAML, configs) always use built-in.

## When to Use

- Fixing bugs, errors, or unexpected behavior
- Resolving failing tests
- Investigating root causes before implementing a fix
- NOT for new feature implementation (use `building` skill)

## Core Pattern

| Mode | When | Flow |
|------|------|------|
| Fast | Simple/small issue | debugger → fix → tester |
| Hard | Complex/multi-file | clarify → debugger → researcher → planner → /code → tester |
| Test failure | "run tests" request | compile → tester → if fail: debugger → planner → fix → tester |

## Implementation

Load: `references/fast-fix.md` for fast single-issue fix flow.
Load: `references/hard-fix.md` for deep investigation with parallel agents.
Load: `references/test-failure-flow.md` for test-suite-run and fix loop.

## Common Mistakes

- Jumping to fix without understanding root cause (always run `gd-debugger` first)
- Missing multimodal context — if user provides screenshot/video, use `ai-multimodal` to describe the issue first
- Not verifying fix with `gd-tester` before reporting success
- Skipping `gd-code-reviewer` on hard fixes
