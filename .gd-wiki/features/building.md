---
title: "Building"
updated: 2026-05-01
tags: [category/feature, building, execution, skill, agents]
summary: "The building feature executes implementation plans phase-by-phase with verification gates via /code and /code:auto, dispatching gd-implementer for Step 2 first-draft code edits."
---

The building feature executes implementation plans phase-by-phase with explicit verification gates between each phase, powered by the `building` skill.

## Commands

| Command | Description |
|---|---|
| `/code` | Execute implementation plan step-by-step with gate prompts |
| `/code:auto` | Auto-execute all phases without blocking gates |

## Verification Gates

Each phase ends with a gate check before the next phase starts. Gates verify that the phase deliverables meet acceptance criteria defined in the plan. `/code` blocks at each gate for human confirmation; `/code:auto` passes gates automatically.

## Agent Dispatch Chain

The building skill dispatches agents by step number:

| Step | Agent | Tier | Responsibility |
|---|---|---|---|
| 1 | _(orchestrator)_ | — | Read phase, plan constraints, set up TodoWrite |
| 2 | `gd-implementer` | standard | First-draft code edits per phase Todo List + type-check |
| 3 | `gd-tester` | standard | Run test suites, interpret pass/fail, detect flakes |
| 4 | `gd-code-reviewer` | — | Polish issues (Step 4) |
| 5 | `gd-git-manager` | fast | Commit phase changes |

On type-check or test failure, the orchestrator re-dispatches the same agent once with a `retry_hint` (cap: 1 retry per failure mode); only on retry exhaustion is `gd-debugger` (premium) escalated for root cause analysis.

### gd-implementer (Step 2)

`gd-implementer` is a phase-scoped first-draft agent. Given a phase file, it:

- Walks the phase's `## Todo List` in order, honoring the `Files Touched` whitelist
- Uses Serena MCP tools for code files when `$GD_SERENA_AVAILABLE=1`; falls back to built-in tools
- Runs the declared type-check (`tsc --noEmit`, `cargo check`, `mypy`, etc.) after edits
- Returns a structured **Implementation Summary** (`files_changed`, `type_check_status`, `blockers`, optional `retry_hint`)
- Does NOT run tests (Step 3 owns that), does NOT commit, does NOT wander outside the phase scope

Phase frontmatter keys consumed by `gd-implementer`: `typecheck_stacks` (explicit stack list) and `typecheck_parallel_safe` (run multi-stack checks concurrently).

Forbidden patterns: commenting out tests to pass build, `as any` / `@ts-ignore` suppression, editing files outside `Files Touched`, new architecture decisions not in the phase.

The test-driven loop runs: implement (Step 2) → test (Step 3) → fix if fail → gate → next phase.

### Orchestrate-only constraint

Step 2 dispatch to `gd-implementer` is **mandatory** — the main `/code` and `/code:auto` thread MUST NOT directly Edit/Write source files. The orchestrator role is restricted to dispatch, gate evaluation, and TodoWrite updates. On dispatch failure, the orchestrator may retry once with a `retry_hint`; on `type_check_failed` or `partial`, escalate to `gd-debugger` rather than retrying `gd-implementer` again. Cap: 1 retry per failure mode.

## Related Pages

- [[planning]] — creating the plans that building executes, including spec→plan auto-detect
- [[debugging-and-fixing]] — dedicated fix workflow when building encounters persistent failures
- [[ghost-agent-resolution]] — how tester, debugger, project-manager were added as real agents
- [[model-tier-policy]] — gd-implementer is standard (Sonnet) tier
- [[serena-mcp-enforcement]] — code-file tool preference wired into gd-implementer
