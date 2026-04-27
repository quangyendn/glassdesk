---
name: fixing
description: Use when debugging errors, fixing failing tests, resolving reported issues, or investigating root causes. Use for /fix and /fix:hard workflows.
---

# Fixing

Systematically diagnose and fix issues using debugger/researcher/tester subagents and structured investigation patterns.

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

- Jumping to fix without understanding root cause (always run `debugger` first)
- Missing multimodal context — if user provides screenshot/video, use `ai-multimodal` to describe the issue first
- Not verifying fix with `tester` before reporting success
- Skipping `code-reviewer` on hard fixes
