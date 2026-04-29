---
description: ⚡ Project wiki maintainer — see /wiki:init, /wiki:update, /wiki:lint, /ask:wiki
argument-hint: [subcommand]
---

# `/wiki` — Project Wiki Maintainer

Bootstrap and maintain a committed, Obsidian-flavored knowledge base under `.gd-wiki/`. Curated incrementally on `main`. Queryable via QMD (BM25 + vector + rerank, local) for ~10x token savings vs `/ask` general.

## Subcommands

| Command | Purpose |
|---|---|
| `/wiki:init [path?]` | Bootstrap `.gd-wiki/` vault, register QMD collection, run first embed (~2GB model download) |
| `/wiki:update` | Distill commits since last sync into wiki edits (main branch only). Curator subagent does the LLM work; CLI does the rest |
| `/wiki:lint [--deep]` | Deterministic checks (broken links, orphans, stale, empty); `--deep` adds LLM contradiction sweep |
| `/ask:wiki <q>` | Query wiki via QMD + Sonnet synthesis. Falls back to `/ask` general when wiki absent |

## Prerequisites

- `qmd` CLI ≥ 2.1.0 — install via `npm i -g @tobilu/qmd`
- macOS: `brew install sqlite` (QMD SQLite extension support)
- Obsidian skills plugin (auto-resolved via plugin dependency)

See `plugins/glassdesk/docs/quick-start.md` § Wiki Maintainer Setup for full install steps.

## Skill

All four subcommands activate the `wiki` skill — see `plugins/glassdesk/skills/wiki/SKILL.md` for the storage contract, decision tree, and boundaries.
