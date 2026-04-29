---
title: "Agent Naming Standardization (gd- Prefix)"
updated: 2026-04-29
tags: [category/decision, agents, naming, refactor]
summary: "All 25 plugin agents were renamed with a gd- prefix to namespace them within the Claude Code agent registry and avoid collisions with user-defined agents."
---

All 25 plugin agents were renamed from bare names (e.g., `scout.md`) to `gd-`-prefixed names (e.g., `gd-scout.agent.md`) to namespace them within the Claude Code agent registry.

## Problem

Agents without a namespace prefix could collide with user-defined agents or agents from other plugins in the Claude Code registry. The old names (`scout`, `researcher`, `planner`, etc.) are generic enough to cause silent shadowing.

## Decision

Rename all plugin agents with the `gd-` prefix. The prefix is short, memorable, and scoped to glassdesk. File extension also standardized to `.agent.md` (e.g., `gd-scout.agent.md`) for discoverability.

The rename was done in two sequential commits:

1. `refactor(agents): rename all 25 plugin agents with gd- prefix` — file renames
2. `refactor(agents): update name frontmatter to gd- prefix in 25 plugin agents` — frontmatter `name:` field updates
3. `refactor(agents): update internal references to gd-prefixed agent names` — update all skill/command files that reference agents by name

## Impact

All command and skill files that dispatch agents by name were updated in the same PR. Internal references use the new `gd-` prefixed names. No user-facing command names changed.

## Related Pages

- [[plugin-system]] — agent topology and dispatch patterns
