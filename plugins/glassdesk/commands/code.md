---
description: ⚡⚡⚡ Start coding & testing an existing plan
argument-hint: [plan]
---

**MUST READ** `CLAUDE.md` then **THINK HARDER**.
<plan>$ARGUMENTS</plan>

Activate 'building' skill.
Load 'references/execution-gates.md' for step format, blocking gates, TodoWrite tracking.
Load 'references/test-driven-loop.md' for testing standards and TDD patterns.

## Step 0: Plan Detection

**If empty:** `find ./plans -name "plan.md" -type f -exec stat -f "%m %N" {} \; 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-` → auto-select next incomplete phase.
**If provided:** Use that plan; detect phase (auto-detect or use argument like "phase-2").
**Output:** `✓ Step 0: [Plan Name] - [Phase Name]`

## Steps 1–6

Follow execution-gates.md for all step format, gate requirements, and mandatory subagents.
Step 5 is a **BLOCKING GATE** — wait for explicit user approval before Step 6.
