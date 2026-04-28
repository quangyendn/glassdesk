---
description: Write journal entries and archive specific plans or all completed plans
argument-hint: [path-to-plan] (default: all plans with status=done|completed)
---

Use `plan-archiver` agent to read plans, write journal entries, and archive.

Pass:
- `PLAN_PATH`: $1 — optional explicit plan dir; if omitted, agent archives only `done`/`completed` plans

Agent must skip in-progress plans with WARN, create `plans/journals/` if missing, and never delete files (use `mv` to `plans/archive/`).
