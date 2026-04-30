---
description: ⚡ Analyze and fix issues (general, tests, or reported failures)
argument-hint: [issues]
---

Activate 'fixing' skill.

**If input mentions test failures, failing tests, "run test suite", or "fix tests":** Load 'references/test-failure-flow.md'.
**Otherwise (general fix):** Load 'references/fast-fix.md'.

> **Tool note:** For code work in this command, prefer Serena MCP (`mcp__plugin_serena_serena__*`, or `mcp__serena__*` for manual installs) when `$GD_SERENA_AVAILABLE=1`. See `${CLAUDE_PLUGIN_ROOT}/docs/serena-preference.md`.

## Issues
<issues>$ARGUMENTS</issues>
