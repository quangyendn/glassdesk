---
title: "Glassdesk Project Wiki"
updated: 2026-04-29
tags: [category/index]
---

# Glassdesk Project Wiki

Demo vault seeded by Phase 05 of the wiki-maintainer plan. Curated by `gd-wiki-curator` (glassdesk plugin). See `plugins/glassdesk/skills/wiki/SKILL.md` for the storage contract.

## Folders

- `architecture/` — how the system fits together
- `features/` — per-feature pages
- `decisions/` — ADR-style trade-off records
- `risks/` — known landmines + mitigations
- `manual/` — 100% human-authored, never touched by curator
- `insights/` — `/learn` outputs
- `index/` — Obsidian Bases (`.base`) aggregators (see `index/by-category.base`)

## Querying

Use `/ask:wiki <question>` for grounded answers. Use `/wiki:update` on `main` after merges. Run `/wiki:lint` periodically to catch broken links + stale frontmatter.

## Status

This is a seed vault. Live `qmd embed` registration deferred to user (requires ~2GB model download). After running `/wiki:init`, the curator can incrementally distill commits via `/wiki:update`.
