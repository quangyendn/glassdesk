---
description: ⚡⚡ Debugging technical issues and providing solutions.
argument-hint: [issues]
---
 
**Reported Issues**:
 $ARGUMENTS

> **Tool note:** For code work in this command, prefer Serena MCP (`mcp__plugin_serena_serena__*`, or `mcp__serena__*` for manual installs) when `$GD_SERENA_AVAILABLE=1`. See `${CLAUDE_PLUGIN_ROOT}/docs/serena-preference.md`.

Use the `gd-debugger` subagent to find the root cause of the issues, then analyze and explain the reports to the user.

**IMPORTANT**: **Do not** implement the fix automatically.
**IMPORTANT:** Analyze the skills catalog and activate the skills that are needed for the task during the process.
**IMPORTANT:** Sacrifice grammar for the sake of concision when writing outputs.