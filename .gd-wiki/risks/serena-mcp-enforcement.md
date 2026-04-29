---
title: "Serena MCP Code-File Enforcement"
updated: 2026-04-29
tags: [category/risk, serena, enforcement, code-files]
summary: "A PreToolUse hook blocks built-in Read/Edit/Grep/Glob on code files (.js, .ts, .py, etc.); all code-file access must go through Serena MCP tools or calls will be denied silently."
---

A `PreToolUse` hook at `~/.claude/hooks/enforce-serena.sh` blocks built-in `Read`, `Edit`, `Grep`, and `Glob` tool calls on code files (`.js`, `.ts`, `.tsx`, `.jsx`, `.py`, `.go`, `.rs`, `.rb`, and others). All code-file access must go through Serena MCP tools.

## Risk

Any agent or command that calls the built-in `Read` tool on a code file will have its call denied by the hook. The agent receives no output and may silently skip the read, produce incorrect results, or retry in an infinite loop.

## Tool Mapping

| Instead of | Use Serena MCP tool |
|---|---|
| `Read` a code file | `find_symbol` (include_body=True), `get_symbols_overview`, or `read_file` (Serena) |
| `Edit` a code file | `replace_symbol_body`, `replace_content`, `insert_after_symbol` |
| `Grep` for code | `search_for_pattern`, `find_symbol`, `find_referencing_symbols` |
| `Glob` for code files | `find_file`, `list_dir` |

## Files NOT Affected

Non-code files use built-in tools normally: `.md`, `.json`, `.yaml`, `.yml`, `.toml`, `.env`, `.txt`, `.csv`, `.lock`, `.sql`, `.graphql`, `.html`, `.css`, `.scss`, `.xml`, `.svg`, `.sh`.

## Activation

Serena must be activated before code work begins:

```
ToolSearch query="+serena"   → load Serena MCP tools
get_current_config           → check active project
activate_project             → activate if not set
check_onboarding_performed   → run onboarding if needed
list_memories → read_memory  → restore project context
```

If Serena is not initialized, do not proceed — ask the user to set up Serena first.

## See Also

- [[plugin-system]] — agents that read code files must comply with this constraint
