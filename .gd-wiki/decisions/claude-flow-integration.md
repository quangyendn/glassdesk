---
title: "Claude Flow Integration (Superseded)"
updated: 2026-05-05
status: superseded
tags: [category/decision, claude-flow, multi-agent, orchestration, superseded]
summary: "Superseded 2026-05-05: Claude Flow integration removed from glassdesk. Plugin uses Claude Code's built-in Task tool exclusively for subagent dispatch."
---

> **Status: SUPERSEDED (2026-05-05)** — Claude Flow integration has been removed from glassdesk. Plugin now relies solely on Claude Code's built-in Task tool for subagent dispatch. References, docs, the `pair-programming` skill, and the `claude-flow-parallel-guide.md` reference doc were removed in the same change.
>
> Rationale: external dependency added cost and maintenance overhead while providing limited additional value over sequential Task dispatch in real-world use. Removing it simplifies the install path and aligns with YAGNI.

## Original Decision (kept for ADR history)

Claude Flow (`claude-flow@alpha`) was an opt-in external dependency for parallel multi-agent execution. Glassdesk functioned fully without it using sequential Task tool dispatch via the standard Claude Code agent system.

Claude Flow was not a hard dependency. The plugin used Claude Code's built-in Task tool for subagent dispatch in all commands and skills. Claude Flow's `swarm_init`, `agent_spawn`, and `task_orchestrate` MCP tools were available as additive capabilities for users who wanted parallel execution on large tasks.

### When Claude Flow Added Value

- Running multiple independent research agents in parallel during `/plan:hard`
- Fan-out exploration across many files simultaneously during deep `/scout:ext` runs
- Batch operations where sequential Task calls would take too long

## Related Pages

- [[plugin-system]] — base agent dispatch architecture
