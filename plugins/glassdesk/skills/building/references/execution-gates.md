# Execution Gates

## Step Output Format

Every step MUST output: `✓ Step [N]: [Brief status] - [Key metrics]`

Examples:
- `✓ Step 0: [Plan Name] - [Phase Name]`
- `✓ Step 1: Found [N] tasks - Ambiguities: [list or "none"]`
- `✓ Step 2: Implemented [N] files - [X/Y] tasks complete`
- `✓ Step 3: Tests [X/X passed] - All requirements met`
- `✓ Step 4: Code reviewed - [0] critical issues`
- `✓ Step 5: Approved` or `⏸ Step 5: WAITING`
- `✓ Step 6: Finalize - Status updated - Committed`

Missing marker = step INCOMPLETE.

## TodoWrite Tracking

- Initialize at Step 0 with all steps (Step 1–6 for code.md, Step 1–5 for code:auto)
- Mark each step complete BEFORE proceeding to next
- Phase tasks → Step 2.X (impl), Step 3.X (tests), Step 4.X (review)

## Mandatory Subagents

| Step | code.md | code:auto |
|------|---------|-----------|
| 2 | `gd-implementer` | `gd-implementer` |
| 3 | `gd-tester` | `gd-tester` |
| 4 | `gd-code-reviewer` | `gd-code-reviewer` |
| 5 (code) | `gd-project-manager` + `gd-docs-manager` | — |
| 5 (auto) | — | `gd-project-manager` + `gd-docs-manager` + `gd-git-manager` |

Steps 5 agents MUST run in parallel.

### Step 2 Dispatch Contract

Main thread MUST dispatch `gd-implementer` exactly once per phase. Main thread MUST NOT Edit/Write source files in Step 2.

Input:
- `phase_path` — current phase file (e.g., `plans/<plan>/phase-01-<slug>.md`)
- `plan_path` — `plans/<plan>/plan.md`
- `typecheck_parallel_safe` — from phase frontmatter; default `false`

Return: structured Implementation Summary with fields `files_changed[]`, `type_check_status` (`success` | `failed` | `skipped`), `type_check_output`, `blockers[]`, `retry_hint?`.

## Blocking Gates

| Gate | Condition |
|------|-----------|
| Step 2 | `gd-implementer` returns `success` AND `type_check_status` = `success` (or `skipped` with documented reason) |
| Step 3 | Tests = 100% passing (no exceptions) |
| Step 4 | Critical issues = 0 |
| Step 5 (code.md) | User must explicitly approve in writing |
| Step 5 (auto) | `gd-project-manager` AND `gd-docs-manager` must complete successfully |

## Step 2 Failure Escalation

Cap = **1 retry** per failure mode. Apply uniformly to `partial` and `type_check_failed` (per plan validation 2026-05-01).

| Implementer return | Main thread action |
|---|---|
| `success` + type_check `success` (or `skipped` with reason) | Proceed to Step 3 |
| `partial` (blockers non-empty) | Re-dispatch `gd-implementer` with `retry_hint` + blocker context (cap 1 retry) |
| `type_check_status: failed` | Re-dispatch `gd-implementer` with compile errors + `retry_hint` (cap 1 retry) |
| Retry already exhausted (any failure mode) | Escalate `gd-debugger` (premium tier) — STOP gate; do NOT proceed to Step 3 |

The retry MUST go through `gd-implementer` again — main thread MUST NOT bypass and Edit source files itself even after a failure.

## Testing Standards

- Unit tests: mocks OK for external dependencies (APIs, DB)
- Integration tests: test environment only
- E2E tests: real but isolated data

**Forbidden:**
- Commenting out failing tests
- Changing assertions to pass
- TODO/FIXME to defer test fixes

## Critical Issues (Step 4 blockers)

- Security: XSS, SQL injection, OWASP top 10
- Performance bottlenecks
- Architectural violations
- YAGNI/KISS/DRY violations

## Per-Phase Rule

One plan phase per command run. Never process multiple phases in one run.
