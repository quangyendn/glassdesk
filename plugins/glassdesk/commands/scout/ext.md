---
description: ⚡ Use external agentic tools to scout given directories
argument-hint: [user-prompt] [scale]
---

Activate 'scouting' skill.
Load 'references/external-tools.md' for gemini/opencode invocation and parallel dispatch patterns.

> **Tool note:** For code work in this command, prefer Serena MCP (`mcp__plugin_serena_serena__*`, or `mcp__serena__*` for manual installs) when `$GD_SERENA_AVAILABLE=1`. See `${CLAUDE_PLUGIN_ROOT}/docs/serena-preference.md`.

## Variables

- `USER_PROMPT`: $1 — what to find
- `SCALE`: $2 — number of agents (default: 3)
- `RELEVANT_FILE_OUTPUT_DIR`: Use `Report:` from `## Naming` section

## Mission

<prompt>$ARGUMENTS</prompt>

Dispatch SCALE external agents in parallel (see external-tools.md for commands and patterns).
Report findings to `RELEVANT_FILE_OUTPUT_DIR`.
