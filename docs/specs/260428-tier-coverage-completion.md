---
date: 2026-04-28
status: draft
tags: [model-routing, cost-optimization, agents, infra, ghost-agents]
---

# Spec: Tier Coverage Completion (Phase 2)

## Problem

After Phase 1 tier policy ([260428-model-tier-policy](./260428-model-tier-policy.md)) shipped, audit revealed two gaps that prevent the policy from being effective end-to-end:

1. **4 GHOST agents** referenced by skills/commands but missing from `agents/`: `debugger`, `planner`, `project-manager`, `tester`. When dispatched, Claude falls back to general-purpose (Sonnet), bypassing tier policy entirely → silent inconsistency.

2. **Trivial commands waste Opus** by running entirely in main thread without subagent delegation. Specifically: `/plan:list`, `/plan:status` (pure mechanical), `/plan:archive` (low-judgment write), `/test:ui` (browser automation).

`/ask` and `/learn` keep current behavior — judgment-critical and acceptable as Opus.

## Proposed Solution

Ship as **two sequential PRs**:

**PR1 — Close GHOST holes:** create 4 missing agents with appropriate tiers. After merge, every subagent dispatch hits the tier policy.

**PR2 — Cut cost on trivial commands:** add 2 new agents + 2 Bash scripts; rewrite 4 commands as thin shims.

## Scope

### PR1 — GHOST agents

**In scope:**
- `agents/debugger.md` — tier `premium` (opus). Root cause analysis from logs/stack traces.
- `agents/planner.md` — tier `premium` (opus). Synthesizes research reports into implementation plans.
- `agents/project-manager.md` — tier `standard` (sonnet). Task extraction, dependency mapping, TodoWrite coordination.
- `agents/tester.md` — tier `standard` (sonnet). Runs test suites and interprets failures.
- README agent count update 11 → 15.
- CHANGELOG entry under `[Unreleased]`.

**Out of scope (PR1):**
- Modifying existing skills/commands that reference these agents — references already correct, just unblocking.
- Trivial command optimization — separate PR.

### PR2 — Trivial command thinning

**In scope:**
- `agents/plan-archiver.md` — tier `fast` (haiku). For `/plan:archive`.
- `agents/ui-tester.md` — tier `standard` (sonnet). For `/test:ui`.
- `bin/plan-list` — Node script: glob plans, parse frontmatter, format table.
- `bin/plan-status` — Node script: read 1 plan dir, count phases, format report.
- `commands/plan/list.md` — thin shim: `Run: bash plugins/glassdesk/bin/plan-list`.
- `commands/plan/status.md` — thin shim: `Run: bash plugins/glassdesk/bin/plan-status [path]`.
- `commands/plan/archive.md` — thin shim: delegate to `plan-archiver`.
- `commands/test/ui.md` — thin shim: delegate to `ui-tester` (current chrome-devtools instructions move to agent body).
- README agent count update 15 → 17.
- CHANGELOG entry.

**Out of scope:**
- `/ask`, `/learn` — kept as-is (judgment-critical, Opus acceptable).
- `/scout`, `/scout:ext` orchestration cost — separate concern, defer.
- `/code`, `/code:auto`, `/fix*`, `/debug` — composite workflows, tier already routed via sub-dispatches.
- `/brainstorm`, `/plan`, `/plan:hard`, `/plan:validate`, `/spec`, `/improve` — judgment-heavy, Opus correct.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| GHOST handling | Create all 4 agents (Option A) | Closes silent fallback hole completely. Each agent ~30 LOC, total ~1h. Half-measures leave inconsistency. |
| `debugger` tier | premium | Root cause work has high false-positive cost; Opus reasoning needed. |
| `planner` tier | premium | Synthesis quality matters; main thread orchestrates lightly, planner does heavy lifting. Context isolation justifies dedicated dispatch. |
| `project-manager` tier | standard | Task extraction is mostly mechanical; sonnet sufficient. |
| `tester` tier | standard | Test runs are bash; failure interpretation needs medium judgment. Haiku risks missing subtle failures. |
| `plan-archiver` tier | fast | Journal entries are templated narrative — haiku fine. |
| `ui-tester` tier | standard | Browser automation + screenshot interpretation needs sonnet quality, opus overkill. |
| `/plan:list`, `/plan:status` mechanism | Pure Bash (zero LLM) | Mechanical glob+parse — no judgment needed. Token cost = dispatch overhead only. |
| `/plan:archive`, `/test:ui` mechanism | Thin-shim subagent dispatch | Need LLM for narrative/interpretation; tier-appropriate subagent reroutes work to cheaper model. |
| `/ask`, `/learn` | No change | `/ask` is judgment-variable (architecture Q&A); `/learn` extraction acceptable at Opus quality given infrequent invocation. |
| Naming clash check | `tester` vs `pr-test-analyzer` | Distinct purposes (run tests vs review test code). Both coexist. |
| PR strategy | Sequential 2 PRs (Option B) | PR1 = bug-fix scope (close GHOSTs); PR2 = feature scope (cost cut). Easier review, isolated rollback. |
| New agent total | 6 (4 GHOST + 2 new) | Accepted scope. Agent file count: 11 → 15 (PR1) → 17 (PR2). |

## Open Questions

- Are 4 GHOST agents intentionally deferred (waiting for user definition) or developer oversight? Treating as oversight per Option A. — answered by user choice
- Does `planner` (premium) being dispatched from `/plan:hard` (also Opus main thread) cause 2x Opus cost? Mitigation: skill prompt makes main thread orchestrate-only, no plan content writing. Document in `planning` skill instructions.
- Should `/test:ui` keep chrome-devtools tools in command body or move to `ui-tester` agent body? Decision: move to agent body for consistency with thin-shim pattern.
- `bin/plan-list` and `bin/plan-status` — should they also be exposed via package.json `bin:` (so users can run `glassdesk plan-list` from CLI)? Defer — not in current scope, easy to add later.

## Acceptance Criteria

### PR1 (GHOST close)

- [ ] `agents/debugger.md`, `planner.md`, `project-manager.md`, `tester.md` exist
- [ ] Each has `tier:` and `model:` matching policy
- [ ] `bin/sync-models --check` exits 0 with 15 agents
- [ ] No skill/command references `git-manager`, `debugger`, `planner`, `project-manager`, `tester` without those agents existing
- [ ] README agent count updated 11 → 15, table updated
- [ ] CHANGELOG `[Unreleased]` entry

### PR2 (trivial command thinning)

- [ ] `agents/plan-archiver.md` (fast) and `ui-tester.md` (standard) exist
- [ ] `bin/plan-list` and `bin/plan-status` are executable Node scripts, output table/report respectively
- [ ] `commands/plan/list.md`, `commands/plan/status.md` are thin shims (≤5 lines body) running bash
- [ ] `commands/plan/archive.md`, `commands/test/ui.md` are thin shims (≤15 lines) delegating to subagent
- [ ] `bin/sync-models --check` exits 0 with 17 agents
- [ ] Smoke: invoke each modified command — no crash, output sane
- [ ] README agent count updated 15 → 17, table updated
- [ ] CHANGELOG `[Unreleased]` entry
