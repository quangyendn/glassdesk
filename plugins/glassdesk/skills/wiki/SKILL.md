---
name: wiki
description: Use when maintaining a project knowledge base in `.gd-wiki/`, distilling commits into wiki pages, querying wiki content, or linting wiki integrity. Powers /wiki:init, /wiki:update, /wiki:lint, /ask:wiki. Page authoring defers to obsidian:obsidian-markdown; index files defer to obsidian:obsidian-bases.
---

# Wiki

Maintain an evergreen, query-able project wiki under `.gd-wiki/` (committed, Obsidian-flavored vault). Curator agent distills new commits into pages incrementally; QMD (BM25 + vector + rerank, local) powers retrieval. Replaces ad-hoc `.glassdesk-knowledge/` for `/learn` and `/improve` (v0.3.0+).

## When to Use

- Bootstrap `.gd-wiki/` in a project (`/wiki:init`)
- Sync new commits on `main` into the wiki incrementally (`/wiki:update`)
- Answer a project-knowledge question grounded in wiki content (`/ask:wiki`)
- Audit wiki integrity — broken links, orphans, stale, contradictions (`/wiki:lint`)
- NOT for capturing session insights alone — that's `/learn` (writes to `.gd-wiki/insights/`)
- NOT for code-search — use `/scout` or `grep`

## Storage Contract

```
.gd-wiki/
├── .config.json              # see schema below
├── README.md                 # human entry point
├── architecture/             # how the system fits together
├── features/                 # per-feature pages
├── decisions/                # ADR-style
├── risks/                    # known landmines
├── manual/                   # 100% human-authored, never touched by curator
├── insights/                 # `/learn` outputs (auto-mkdir)
└── index/                    # `.base` aggregator files (Obsidian Bases)
```

`.config.json` canonical schema (all keys are nested; flat shape is a bug):

```json
{
  "sync": {
    "main_branch": "main",
    "last_synced_commit": "<sha>",
    "last_synced_at": "<ISO-8601>",
    "stop_paths": ["node_modules/", "dist/", ".gd-wiki/insights/"],
    "auto_index_base": false
  },
  "query": {
    "qmd_collection": "<project-slug>-<remote-sha8>",
    "default_n": 5,
    "min_score": 0.3,
    "max_tokens": 1000000,
    "miss_policy": "surface"
  },
  "lint": {
    "stale_days": 60,
    "warn_unsynced_commits": 20
  },
  "models": {
    "curator": "claude-sonnet-4-6",
    "deep_lint": "claude-sonnet-4-6",
    "ask_wiki": "claude-sonnet-4-6"
  }
}
```

Curator scope: edit ONLY paths under `.gd-wiki/`. Reject any write outside.

## Page Authoring

Defer to `obsidian:obsidian-markdown` skill for syntax (callouts, embeds, properties, links). Wiki-specific overrides live in `references/obsidian-conventions.md`.

Required frontmatter on every page:

```yaml
---
title: "Human-Readable Title"
updated: 2026-04-29
tags: [category/<name>, ...]
---
```

## Index Pages

Defer to `obsidian:obsidian-bases` skill for `.base` YAML syntax. Place index files at `.gd-wiki/index/by-<dimension>.base`. See `references/obsidian-conventions.md` for minimal example.

## Decision Tree

| Task | Load |
|---|---|
| `/wiki:update` (curator distill loop) | `references/maintaining.md` + `references/cost-budget.md` |
| `/ask:wiki` (retrieval + synthesis) | `references/querying.md` |
| `/wiki:lint` (integrity audit) | `references/linting.md` |
| Page format / frontmatter / categories question | `references/obsidian-conventions.md` |
| Token budget / model tier / CLI-vs-LLM trade-off | `references/cost-budget.md` |

## Boundaries

- Never edit outside `.gd-wiki/`. Post-run check: `git diff --name-only` must all start with `.gd-wiki/`.
- Never read or write `.glassdesk-knowledge/` (deprecated v0.3.0).
- Respect `<!-- manual -->` blocks — curator skips entire block (scope: marker → next H2 OR matching `<!-- /manual -->`).
- Respect `sync.stop_paths` from `.config.json` — never distill diffs touching only these paths.
- `/wiki:update` runs ONLY on `sync.main_branch` (configurable, default `main`). Refuse on feature branches.
- First `qmd embed` triggers a ~2GB model download — `/wiki:init` must confirm Y/n before invoking.

## Common Mistakes

- Running `/wiki:update` on a feature branch — refuse and point to `main_branch` config
- Letting curator edit `manual/` or files inside `<!-- manual -->` blocks
- Skipping the token budget pre-flight — large diffs blow context silently
- Forgetting `qmd update -c <coll> && qmd embed` after page edits — search returns stale content
- Hardcoding collection name `wiki` — multi-repo machines collide; derive from project slug + git remote sha8
