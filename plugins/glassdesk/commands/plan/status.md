---
description: Show detailed status of a specific plan
argument-hint: [plan-path]
---

## Your mission
Display detailed progress and status of a specific implementation plan.

## Plan Resolution

1. If `$ARGUMENTS` provided → Use that path
2. Else check `## Plan Context` section → Use active plan path
3. If no plan found → List available plans and ask user to specify

## Workflow

### Step 1: Resolve and Validate Path
Confirm plan exists by checking for `{plan-path}/plan.md`.
If not found, use Glob to list available plans and ask user to choose.

### Step 2: Read Plan Overview
Read `{plan-path}/plan.md`:
- Parse YAML frontmatter (title, status, priority, effort, created, description)
- Note any validation summary if present

### Step 3: Analyze Phases
For each `{plan-path}/phase-*.md`:
- Parse frontmatter for: phase number, title, status, effort
- Categorize: completed, in-progress, pending, blocked
- Extract blockers or risks if mentioned

### Step 4: Calculate Progress
```
completed_count = phases with status "completed" or "done"
total_count = all phase files
progress_pct = (completed_count / total_count) * 100
```

### Step 5: Output Report

```markdown
# Plan Status: {title}

**Status:** {status} | **Progress:** {progress}% | **Priority:** {priority} | **Effort:** {effort}

> {description}

## Phase Breakdown

| # | Phase | Status | Effort |
|---|-------|--------|--------|
| 01 | {title} | {status} | {effort} |
| 02 | {title} | {status} | {effort} |

## Summary

- Completed: {X} phases
- In Progress: {X} phases
- Pending: {X} phases
- Blocked: {X} phases

## Next Actions

{Extract next steps from first pending or in-progress phase}

## Blockers

{List any blockers found, or "None identified"}
```

## Output Format
- Clear status indicators with emoji: ✅ completed, 🔄 in-progress, ⏳ pending, 🚫 blocked
- Actionable next steps from phase files
- Concise, scannable format

## Important Notes

**IMPORTANT:** Default missing status to "pending".
**IMPORTANT:** If no phases found, note "No phase files found".
**IMPORTANT:** Keep output focused on actionable information.
