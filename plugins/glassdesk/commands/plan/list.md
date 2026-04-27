---
description: List all plans with status and progress
argument-hint: [status-filter] (active|completed|archived|all)
---

## Your mission
List all plans in the `plans` directory with their status, phase count, and dates.

## Workflow

### Step 1: Scan Plans Directory
Use Glob to find all `plans/*/plan.md` files.
If no plans found, output "No plans found in plans/ directory."

### Step 2: Read Plan Metadata
For each `plan.md` found:
- Parse YAML frontmatter (title, status, priority, effort, created)
- Count `phase-*.md` files in same directory
- Get directory name as plan identifier

### Step 3: Apply Filter
If `$ARGUMENTS` provided (active, completed, archived, pending):
- Filter plans by matching status value
- Default: show all plans

### Step 4: Output Table

Sort by created date (newest first) and output:

## Plans Overview

| Plan | Status | Priority | Phases | Effort | Created |
|------|--------|----------|--------|--------|---------|
| {directory-name} | {status} | {priority} | {count} | {effort} | {date} |

**Total:** {count} plans

### Status Legend
- `pending` - Not started
- `active` - In progress
- `completed` - Done
- `archived` - Archived

## Output Format
- Table sorted by created date (newest first)
- Show total count at bottom
- If filter applied, show "{X} plans matching '{filter}'"

## Important Notes

**IMPORTANT:** Handle missing frontmatter fields gracefully (show "-" for missing values).
**IMPORTANT:** Keep output concise and scannable.
