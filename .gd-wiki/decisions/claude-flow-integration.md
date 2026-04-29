---
title: "Claude Flow Integration"
updated: 2026-04-29
tags: [category/decision, claude-flow, multi-agent, orchestration]
summary: "Claude Flow is an opt-in external dependency for parallel multi-agent execution; glassdesk functions fully without it using sequential Task tool dispatch."
---

Claude Flow (`claude-flow@alpha`) is an opt-in external dependency for parallel multi-agent execution. Glassdesk functions fully without it using sequential Task tool dispatch via the standard Claude Code agent system.

## Decision

Claude Flow is not a hard dependency. The plugin uses Claude Code's built-in Task tool for subagent dispatch in all commands and skills. Claude Flow's `swarm_init`, `agent_spawn`, and `task_orchestrate` MCP tools are available as additive capabilities for users who want parallel execution on large tasks.

## When Claude Flow Adds Value

- Running multiple independent research agents in parallel during `/plan:hard`
- Fan-out exploration across many files simultaneously during deep `/scout:ext` runs
- Batch operations where sequential Task calls would take too long

## Installation

```bash
npm install -g claude-flow@alpha
```

Install once per machine. The plugin checks for Claude Flow availability at dispatch time and degrades gracefully to sequential dispatch when absent.

## Related Pages

- [[plugin-system]] — base agent dispatch architecture without Claude Flow
