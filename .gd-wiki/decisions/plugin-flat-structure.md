---
title: "Plugin Flat Structure (No .claude/ Wrapper)"
updated: 2026-04-29
tags: [category/decision, plugin, structure, installation]
summary: "Plugin source uses a flat directory structure without a .claude/ wrapper — Claude Code's plugin system adds the .claude/ context automatically at install time."
---

Plugin source files live directly under `plugins/glassdesk/` with no `.claude/` wrapper folder, because Claude Code's plugin system adds the `.claude/` context automatically when the plugin is installed into a project.

## Problem

Adding `.claude/` inside plugin source creates double-nesting at install time:

```
# Wrong result when .claude/ is in plugin source:
.claude/commands/.claude/commands/scout.md  # broken path, command not discovered
```

## Decision

Plugin source uses a flat structure:

```
plugins/glassdesk/
├── commands/scout.md     → installs as .claude/commands/scout.md   → /scout
├── skills/planning/      → installs as .claude/skills/planning/
└── agents/gd-scout.agent.md
```

The Claude Code marketplace install step wraps the plugin content in the project's `.claude/` automatically.

## Consequences

- Commands, skills, and agents in plugin source are discoverable without `.claude/` prefix
- Plugin developers must not add `.claude/` in plugin source — it is the most common mistake for new plugin authors
- This is enforced via documentation only (CLAUDE.md plugin development section); no tooling guard exists

## Related Pages

- [[plugin-system]] — full plugin directory structure
- [[plugin-double-nesting-trap]] — risk entry for this mistake
