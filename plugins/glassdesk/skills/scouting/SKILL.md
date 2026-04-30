---
name: scouting
description: Use when exploring a codebase to find relevant files, understand project structure, or locate implementation patterns before starting a task. Use for /scout and /scout:ext workflows.
---

# Scouting

Rapidly locate relevant files and understand codebase structure using internal tools or external agentic tools.

## Tool Preference

For source-code files (`.ts`, `.tsx`, `.py`, `.rb`, `.go`, `.rs`, `.js`, `.jsx`, `.java`, `.php`, `.vue`, etc.): if `$GD_SERENA_AVAILABLE=1`, prefer Serena MCP tools — e.g. `mcp__plugin_serena_serena__find_symbol` over `Grep`+`Read` for symbol lookup, `mcp__plugin_serena_serena__find_referencing_symbols` over `Grep -r`, `mcp__plugin_serena_serena__get_symbols_overview` for first-look, `mcp__plugin_serena_serena__replace_symbol_body` over `Edit`. If those names are unavailable, try the flat fallback `mcp__serena__<tool>` (manual installs). Otherwise fall back to built-in. See `${CLAUDE_PLUGIN_ROOT}/docs/serena-preference.md` for full mapping. Non-code files (markdown, JSON, YAML, configs) always use built-in.

## When to Use

- Finding files needed before implementing a feature
- Understanding project layout before planning
- Locating references to a pattern or symbol across the codebase
- NOT for deep implementation analysis (use `planning` skill) or debugging (use `fixing` skill)

## Core Pattern

| Mode | When | Tools |
|------|------|-------|
| Internal | Default | Glob, Grep, Bash, Explore subagents |
| External | Large codebases, token efficiency | gemini CLI, opencode CLI |

## Implementation

Load: `references/internal-scout.md` for codebase exploration heuristics and tool selection.
Load: `references/external-tools.md` for external agentic tool (gemini/opencode) invocation patterns.

## Common Mistakes

- Using external tools when internal grep would suffice (overkill)
- Running agents serially instead of in parallel
- Not dividing search areas intelligently across agents
- Calling search tools yourself when the task is to kick off external agents (use Bash → gemini/opencode instead)
