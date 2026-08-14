---
description: "Comprehensive PR review using specialized agents"
argument-hint: "[review-aspects]"
allowed-tools: ["Bash", "Glob", "Grep", "Read", "Task"]
---

Activate 'code-review' skill.
Load 'references/pr-orchestration.md' for severity tier cascade and agent descriptions.
Load 'references/pr-usage.md' for usage examples and workflow integration.

**Review Aspects (optional):** "$ARGUMENTS"

## Workflow

1. **Determine Scope** — Check git status; parse arguments for specific aspects; default: all.

2. **Identify Changed Files** — Run `git diff --name-only`; check `gh pr view`; identify applicable reviews.

3. **Launch Critical Agents (Phase 1)**
   - Always: `gd-code-reviewer`
   - If test files changed: `gd-pr-test-analyzer`
   - If error handling changed: `gd-silent-failure-hunter`
   - If types added/modified: `gd-type-design-analyzer`

4. **Check Cascade** — If ANY critical agent severity ≥91: STOP. See `pr-orchestration.md` for blocking message format.

5. **Launch Optional Agents (Phase 2)** — `gd-comment-analyzer`, `gd-code-simplifier` (independent of critical results).

6. **Parallel approach** (advanced) — Launch all agents via MCP simultaneously; no cascade checking; user reviews all results.

7. **Aggregate & Report** — Summarize by severity tier. See `pr-orchestration.md` for result summary template.
