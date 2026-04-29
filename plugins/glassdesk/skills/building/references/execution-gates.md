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
| 3 | `gd-tester` | `gd-tester` |
| 4 | `gd-code-reviewer` | `gd-code-reviewer` |
| 5 (code) | `gd-project-manager` + `gd-docs-manager` | — |
| 5 (auto) | — | `gd-project-manager` + `gd-docs-manager` + `gd-git-manager` |

Steps 5 agents MUST run in parallel.

## Blocking Gates

| Gate | Condition |
|------|-----------|
| Step 3 | Tests = 100% passing (no exceptions) |
| Step 4 | Critical issues = 0 |
| Step 5 (code.md) | User must explicitly approve in writing |
| Step 5 (auto) | `gd-project-manager` AND `gd-docs-manager` must complete successfully |

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
