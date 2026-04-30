---
title: "Planning"
updated: 2026-05-01
tags: [category/feature, planning, agents, skill]
summary: "The planning feature provides research-driven implementation plan creation via /plan and /plan:hard, with structured phase decomposition, spec auto-detection, and YAGNI/KISS/DRY principles."
---

The planning feature creates structured, phased implementation plans via `/plan` (fast, no research) and `/plan:hard` (full research with parallel agents).

## Commands

| Command | Description |
|---|---|
| `/plan` | Fast analysis + plan creation, no external research |
| `/plan:hard` | Full analysis with parallel researcher agents |
| `/plan:validate` | Critical Q&A review of an existing plan |
| `/plan:status [path]` | Show detailed status of a specific plan (Bash, zero LLM) |
| `/plan:list` | List all plans with status and progress (Bash, zero LLM) |
| `/plan:archive` | Archive completed plans, write journal entries (fast tier) |

## Plan Storage

Plans live in `plans/` at the project root (flat, no nested subfolders):

```
plans/
├── {YYMMDD-HHmm-slug}/
│   ├── plan.md              # Overview with YAML frontmatter (status, phase count)
│   ├── phase-01-*.md        # Phase implementation details
│   └── research/            # Research reports (optional, /plan:hard only)
└── reports/                 # Standalone reports
```

## Spec→Plan Auto-Detection (Step 0)

Both `/plan` and `/plan:hard` run `resolve-spec-input.cjs` as Step 0 before any other planning step. The resolver inspects `$ARGUMENTS` and `docs/specs/` and returns one of four modes:

| Mode | Trigger | Behavior |
|---|---|---|
| `spec` | Arg is a valid file path | Use that spec directly; skip confirmation |
| `spec-confirm` | No arg, latest spec auto-detected | Show confirmation prompt (Y / n / other path) |
| `task` | No arg, no spec found | Ask user for free-text task description |
| `error` | Arg looks like a path but file missing | Abort with message; do NOT silently fall back to task mode |

After Step 0 resolves, planning proceeds with either `spec_path` or `task_text` as input. Spec path is passed to `gd-planner` as a file reference (not inline content) to avoid context bloat.

## Agent Dispatch

`/plan:hard` dispatches three agents in sequence:

1. `gd-researcher` (standard/Sonnet) — web/topic research, structured reports
2. `gd-planner` (premium/Opus) — synthesizes research into implementation plan
3. `gd-project-manager` (standard/Sonnet) — phase decomposition, TodoWrite coordination

The main thread acts as orchestrator only when `gd-planner` is dispatched, avoiding double Opus spend. The planning skill enforces this via the "orchestrate-only" pattern.

## Design Principles

The planning skill applies YAGNI, KISS, and DRY when structuring plans. Plans include explicit verification gates between phases — each phase must pass its gate before the next begins. See the building skill for gate enforcement during execution.

## /plan:archive Behavior

When no path argument is given, `/plan:archive` archives ONLY plans with `status: done` or `status: completed` in their frontmatter. In-progress plans receive a WARN and are skipped. Pass an explicit path to force-archive an in-progress plan.

## Related Pages

- [[building]] — phase-by-phase execution of plans, including gd-implementer (Step 2)
- [[model-tier-policy]] — why planner is premium (Opus) tier
- [[ghost-agent-resolution]] — how planner, debugger, project-manager, tester were added
