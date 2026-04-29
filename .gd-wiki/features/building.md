---
title: "Building"
updated: 2026-04-29
tags: [category/feature, building, execution, skill]
summary: "The building feature executes implementation plans phase-by-phase with verification gates via /code and /code:auto."
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

The building skill dispatches agents based on the current phase type:

- `gd-project-manager` (standard) — phase decomposition, TodoWrite coordination, finalize
- `gd-tester` (standard) — run test suites, interpret pass/fail, detect flakes
- `gd-debugger` (premium) — root cause analysis when tests fail

The test-driven loop runs: implement → test → fix (if fail) → gate → next phase.

## Related Pages

- [[planning]] — creating the plans that building executes
- [[debugging-and-fixing]] — dedicated fix workflow when building encounters persistent failures
- [[ghost-agent-resolution]] — how tester, debugger, project-manager were added as real agents
