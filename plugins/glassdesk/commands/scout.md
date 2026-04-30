---
description: ⚡ Explore the codebase to find relevant files and understand project structure
argument-hint: [user-prompt] [scale]
---

Activate 'scouting' skill.
Load 'references/internal-scout.md' for tool selection and parallel exploration patterns.

> **Tool note:** For code work in this command, prefer Serena MCP (`mcp__plugin_serena_serena__*`, or `mcp__serena__*` for manual installs) when `$GD_SERENA_AVAILABLE=1`. See `${CLAUDE_PLUGIN_ROOT}/docs/serena-preference.md`.

## Variables

- `USER_PROMPT`: $1 — what to find
- `SCALE`: $2 — number of agents (default: 3)
- `RELEVANT_FILE_OUTPUT_DIR`: Use `Report:` from `## Naming` section

## Mission

<prompt>$ARGUMENTS</prompt>

Use internal scouting tools (Glob, Grep, Bash, Explore subagents) to find relevant files.
Report: list file paths with one-line relevance descriptions.
