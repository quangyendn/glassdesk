---
name: scouting
description: Use when exploring a codebase to find relevant files, understand project structure, or locate implementation patterns before starting a task. Use for /scout and /scout:ext workflows.
---

# Scouting

Rapidly locate relevant files and understand codebase structure using internal tools or external agentic tools.

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
