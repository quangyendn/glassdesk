---
title: "Serena MCP Code-File Enforcement"
updated: 2026-05-01
tags: [category/risk, serena, enforcement, code-files]
summary: "A PreToolUse hook blocks built-in Read/Edit/Grep/Glob on code files; Serena MCP preference is wired into 5 skills, 9 commands, and the gd-implementer agent as of v0.4.0."
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

## Plugin Integration (v0.4.0)

As of v0.4.0, Serena preference is wired into the plugin at three levels:

**Skills** (5): `building`, `debugging`, `fixing`, `planning`, `scouting` — each skill's `SKILL.md` includes the Serena tool-preference table and instructs agents to prefer Serena when `$GD_SERENA_AVAILABLE=1`.

**Commands** (9): `code`, `code:auto`, `debug`, `fix`, `fix:hard`, `plan`, `plan:hard`, `scout`, `scout:ext` — each command header includes a Serena activation reminder.

**Agent**: `gd-implementer` — built with Serena MCP tools in its `tools:` list; uses Serena for code-file edits when available, falls back to built-in tools otherwise.

**SessionStart hook** (`hooks/session-init.cjs`): detects whether Serena MCP is active at session start and exports `GD_SERENA_AVAILABLE=1` into the session environment. Skills and agents read this flag to branch tool preference at runtime without hard-failing when Serena is absent.

Reference doc: `plugins/glassdesk/docs/serena-preference.md` — full tool-mapping table, decision tree, and non-code file exceptions.

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
- [[building]] — gd-implementer is the primary code-editing agent subject to this enforcement
