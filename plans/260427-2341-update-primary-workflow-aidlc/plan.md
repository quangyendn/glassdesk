---
title: Update primary-workflow.md → AIDLC taxonomy
description: Rewrite primary-workflow.md to reflect the 8-phase AIDLC command taxonomy from the commands restructure (v0.2.0).
status: completed
priority: P2
effort: 15m
branch: main
tags: [docs, plugin, refactor]
created: 2026-04-27
---

# Update primary-workflow.md → AIDLC

## Overview

`plugins/glassdesk/workflows/primary-workflow.md` still reflects old agent-delegation workflow (planner/tester/code-reviewer/debugger agents). The v0.2.0 restructure introduced an 8-phase AIDLC taxonomy with slash commands + skills. This plan rewrites the file to match.

## Source of Truth

- Commands restructure plan: `plans/260427-2043-glassdesk-commands-restructure/plan.md`
- **8 SDLC phases**: DISCOVER / SPEC / PLAN / BUILD / VERIFY / REVIEW / SHIP / COMPOUND
- Command placement: `/debug` → DISCOVER (diagnosis); `/spec` → SPEC (own phase, not COMPOUND)
- Skills: `planning`, `building`, `code-review`, `debugging`, `fixing`, `scouting`, `brainstorming`, `pair-programming`, `compounding`, `ai-multimodal`, `media-processing`

## What Changes

| Old | New |
|-----|-----|
| Agent delegation (`planner`, `tester`, `code-reviewer`, `debugger`) | Slash commands + skill activation |
| 5 generic sections (Code/Testing/Quality/Integration/Debugging) | 8 AIDLC phases |
| No SPEC/COMPOUND phases | SPEC (`/spec`) + COMPOUND (`/learn`, `/improve`) |

## Implementation

Single phase — direct file rewrite.

**Target:** `plugins/glassdesk/workflows/primary-workflow.md`

### New Content (final)

```markdown
# Primary Workflow (AIDLC)

**IMPORTANT:** Activate relevant skills as needed. Ensure token efficiency.

## AIDLC Phases

### 1. DISCOVER
Understand requirements, explore codebase, diagnose issues.
- `/ask`, `/brainstorm`, `/scout`, `/scout:ext`, `/debug`
- Skills: `brainstorming` (ideation), `scouting` (exploration), `debugging` (root cause)

### 2. SPEC
Formalize brainstorm/discovery output into a spec document.
- `/spec` — writes spec doc to `docs/specs/`
- Skills: `brainstorming`

### 3. PLAN
Create implementation plan from spec or task.
- `/plan` (fast), `/plan:hard` (deep + research)
- Lifecycle: `/plan:validate`, `/plan:list`, `/plan:status`, `/plan:archive`
- Plans saved to `./plans/{YYMMDD-HHmm-slug}/`
- Skills: `planning`

### 4. BUILD
Execute the plan.
- `/code` (step-by-step), `/code:auto` (unattended)
- Update existing files; never create new enhanced files
- Run compile check after every code modification
- Skills: `building`

### 5. VERIFY
Catch and fix issues.
- `/fix`, `/fix:hard`, `/test:ui`
- Never fake, mock, or bypass failing tests
- Skills: `fixing`

### 6. REVIEW
Comprehensive PR review via specialized agents.
- `/review:pr`
- Skills: `code-review`

### 7. SHIP
Commit, push, open PR.
- `/git:cm` → `/git:cp` → `/git:pr`
- Commit messages always in English

### 8. COMPOUND
Session compounding — use after meaningful work sessions.
- `/learn` — extract insights → `.glassdesk-knowledge/{slug}.md` (local-only, gitignored)
- `/improve` — generate gated proposal (`plans/improvements/`); never auto-applied; needs ≥1 `/learn` first
- Skills: `compounding`

## Key Rules

- Write clean, readable, maintainable code
- Follow established architectural patterns; handle edge cases
- Never ignore failing tests
- Update existing files directly — no new enhanced files
- After significant doc changes, update `./docs/` accordingly
```

## Success Criteria

- [ ] File rewritten with AIDLC 8-phase structure
- [ ] No agent-delegation references remain
- [ ] All 23 commands referenced correctly under correct phases
- [ ] `/debug` in DISCOVER, `/spec` in own SPEC phase
- [ ] Concise (≤70 lines)

## Validation Summary

**Validated:** 2026-04-27 (2 rounds)
**Questions asked:** 3 + 3 = 6 total

### Confirmed Decisions

| Topic | Decision |
|---|---|
| Scope | Only `primary-workflow.md` — other workflow files updated separately |
| Skills coverage | Core skills only (matching AIDLC phases) |
| Backward compat | No migration notes — hard replace, delete all agent-delegation references |
| Phase count | **8 phases** — SPEC tách ra làm phase riêng giữa DISCOVER và PLAN |
| `/debug` placement | DISCOVER (diagnosis verb in description) |
| `/spec` placement | SPEC phase (own, not COMPOUND) |
| Inline content sync | Updated inline `New Content (final)` immediately |

### Action Items

None — plan is implementation-ready. Inline content already reflects all decisions.

Completed: 2026-04-27
