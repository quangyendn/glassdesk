---
description: ⚡⚡⚡ [AUTO] Start coding & testing an existing plan ("trust me bro")
argument-hint: [plan] [all-phases-yes-or-no] (default: yes)
---

**MUST READ** `CLAUDE.md` then **THINK HARDER**.
<plan>$ARGUMENTS</plan>

Activate 'building' skill.
Load 'references/execution-gates.md' for step format, blocking gates, TodoWrite tracking.
Load 'references/auto-execution.md' for $ALL_PHASES behavior, git-manager, and summary report.
Load 'references/test-driven-loop.md' for testing standards and TDD patterns.

## Arguments
- $PLAN: $1 (specific plan path or auto-detected)
- $ALL_PHASES: $2 (`Yes` = run all phases; `No` = wait per phase; default: `Yes`)

## Step 0: Plan Detection

**If $PLAN empty:** `find ./plans -name "plan.md" -type f -exec stat -f "%m %N" {} \; 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-` → auto-select next incomplete phase.
**If provided:** Use that plan; detect phase (auto-detect or use argument like "phase-2").
**Output:** `✓ Step 0: [Plan Name] - [Phase Name]`

## Steps 1–5

Follow execution-gates.md for all step format, gate requirements, and mandatory subagents.
Step 5 has NO blocking gate — finalize automatically (see auto-execution.md).
