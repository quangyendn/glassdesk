---
title: "Plugin Double-Nesting Trap"
updated: 2026-04-29
tags: [category/risk, plugin, structure, installation]
summary: "Adding a .claude/ folder inside plugin source creates double-nesting at install time, breaking command discovery silently."
---

Adding a `.claude/` folder inside plugin source creates a double-nested path at install time that silently breaks all command discovery.

## Symptom

Commands appear to install but are not discovered by Claude Code. No error is thrown — the paths resolve to an invalid location like `.claude/commands/.claude/commands/scout.md`.

## Root Cause

The Claude Code plugin system automatically wraps plugin content in the project's `.claude/` at install time. Plugin source that already contains `.claude/` results in:

```
# Plugin source:    .claude/commands/scout.md
# After install:    .claude/.claude/commands/scout.md  ← never found
```

## Mitigation

Plugin source MUST use flat structure:

```
plugins/glassdesk/
├── commands/scout.md       → installs correctly as .claude/commands/scout.md
└── skills/planning/        → installs correctly as .claude/skills/planning/
```

## Detection

If commands are not appearing after plugin install, check:

```bash
ls .claude/commands/
# Should see scout.md, plan.md, etc.
# If you see a nested .claude/ folder, the plugin source has the double-nesting bug
```

## See Also

- [[plugin-flat-structure]] — decision record explaining the correct approach
