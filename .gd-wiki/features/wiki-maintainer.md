---
title: "Wiki Maintainer"
updated: 2026-04-29
tags: [category/feature, wiki, qmd, knowledge-base]
summary: "The wiki maintainer feature incrementally distills git commits into an Obsidian-flavored .gd-wiki/ vault, searchable by both human and LLM via QMD."
---

The wiki maintainer (shipped in v0.3.0) incrementally distills git commits on `main` into an Obsidian-flavored `.gd-wiki/` vault that is committed to the repo and searchable via QMD (BM25 + vector + rerank, local).

## Commands

| Command | Tier | What it does |
|---|---|---|
| `/wiki:init [path]` | fast (Bash) | Bootstrap `.gd-wiki/` vault, register QMD collection, prompt for first embed |
| `/wiki:update [--dry-run]` | standard (Sonnet) | Distill commits since `last_synced_commit` into wiki edits; re-index; advance pointer |
| `/wiki:lint [--deep]` | fast (Bash) + opt-in Sonnet | Detect broken links, orphans, stale frontmatter, empty pages; `--deep` adds LLM contradiction sweep |
| `/ask:wiki <q>` | standard (Sonnet) | QMD search + Sonnet synthesis with path:line citations |

## Vault Structure

```
.gd-wiki/
├── .config.json          # sync pointer, QMD settings, model tiers, lint config
├── README.md             # human entry point
├── architecture/         # how the system fits together
├── features/             # one page per shipped feature
├── decisions/            # ADR-style trade-off records
├── risks/                # known landmines + mitigations
├── manual/               # 100% human-authored, curator never touches
├── insights/             # /learn outputs (auto-mkdir, no /wiki:init prerequisite)
└── index/                # .base aggregator files (Obsidian Bases)
```

## Update Workflow

`/wiki:update` is strictly main-branch only. It follows this pipeline:

1. **Pre-flight** — verify on `main`, wiki initialized, `last_synced_commit` reachable, diff non-empty
2. **Token budget** — estimate diff size; abort if > `max_tokens` (default 1M)
3. **Curator dispatch** — `gd-wiki-curator` agent (Sonnet) reads diff stat + commit log, decides which pages to create/update/skip
4. **Post-run boundary check** — any file outside `.gd-wiki/` triggers hard revert (`git checkout` for tracked, `rm` for untracked)
5. **Re-index** — `qmd update -c <collection> && qmd embed`
6. **Pointer advance** — writes new `last_synced_commit` + `last_synced_at` to `.config.json`

The command itself never auto-commits the wiki changes — it prints a suggested `chore(wiki): sync to <sha>` commit message.

## Curator Agent Scope

`gd-wiki-curator` may only write within `.gd-wiki/`. It respects `<!-- manual -->` blocks (human-owned sections inside curator-managed pages) and never touches `manual/` or `insights/` folders. It drops cosmetic-only changes and keeps only semantic signal (new features, decisions, behavior changes, risks).

## Knowledge Query

`/ask:wiki` runs QMD lookup first (local, ~0 tokens), then feeds 5 top-scored snippets to Sonnet for synthesis. This is approximately 10x cheaper than `/ask` general when the wiki has the answer. On cache miss, it falls back to general `/ask`.

## /learn Integration

`/learn` writes to `.gd-wiki/insights/` automatically (auto-mkdir). It does not require `/wiki:init` to have run first. The curator never reads or modifies `insights/` — that subfolder belongs to `/learn` exclusively.

## Required Dependencies

| Dependency | Install | Purpose |
|---|---|---|
| `qmd` CLI ≥ 2.1.0 | `npm i -g @tobilu/qmd` | BM25 + vector + rerank index |
| `yq` | `brew install yq` | Stale frontmatter check in `/wiki:lint` |
| SQLite | `brew install sqlite` (macOS) | QMD SQLite extension support |

First `qmd embed` downloads ~2GB of models machine-wide (one-time). `/wiki:init` prompts Y/n before proceeding.

## Related Pages

- [[plugin-system]] — command/agent architecture
- [[qmd-first-embed-risk]] — 2GB download risk and mitigation
- [[wiki-migration-from-glassdesk-knowledge]] — breaking change in v0.3.0
