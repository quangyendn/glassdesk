---
description: ⚡ Bootstrap .gd-wiki/ vault, register QMD collection, run first embed
argument-hint: [path?]
---

Activate the `wiki` skill. Load `references/maintaining.md` (init/recovery section) and `references/cost-budget.md` (first-embed warning).

## Variables

- `WIKI_PATH`: $1 — defaults to `.gd-wiki`
- `PROJECT_SLUG`: derive from git remote URL — last path segment + 8-char remote-sha hash. Fallback to current folder name when no remote.
- `COLLECTION`: `wiki-${PROJECT_SLUG}`

## Pre-flight

Run sequentially; abort on first failure with exact remediation:

1. **`qmd` installed**
   ```bash
   command -v qmd >/dev/null || { echo "Install: npm i -g @tobilu/qmd"; exit 1; }
   ```

2. **`qmd` ≥ 2.1.0**
   ```bash
   QMD_VER=$(qmd --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
   node -e "process.exit(require('semver').satisfies('$QMD_VER','>=2.1.0')?0:1)" \
     || { echo "Need qmd >= 2.1.0 (have $QMD_VER). npm i -g @tobilu/qmd"; exit 1; }
   ```
   (If `semver` unavailable, fall back to a `sort -V` comparison.)

3. **macOS sqlite warning** (non-fatal)
   ```bash
   [[ "$OSTYPE" == darwin* ]] && (brew list sqlite &>/dev/null || \
     echo "Hint: brew install sqlite (recommended for QMD on macOS)")
   ```

4. **`yq` installed** (recommended, used by `/wiki:lint`)
   ```bash
   command -v yq >/dev/null || echo "Hint: brew install yq (recommended)"
   ```

## State Detection (idempotent recovery)

| `$WIKI_PATH` | `$WIKI_PATH/.config.json` | Action |
|---|---|---|
| ✅ exists | ✅ exists | Print "wiki already initialized at $WIKI_PATH" + collection name; exit 0 (no-op) |
| ✅ exists | ❌ missing | Write config only; register collection; offer embed |
| ❌ missing | ✅ exists (orphan) | Recreate folder structure; preserve config; re-register if needed |
| ❌ both | ❌ both | Full init |

## Init Sequence

```bash
mkdir -p "$WIKI_PATH"/{architecture,features,decisions,risks,manual,insights,index}

# Drop a .gitkeep in empty folders so they survive commits
for d in architecture features decisions risks manual insights index; do
  [ -z "$(ls -A "$WIKI_PATH/$d")" ] && touch "$WIKI_PATH/$d/.gitkeep"
done
```

Write `$WIKI_PATH/README.md`:

```markdown
---
title: "Project Wiki"
updated: <today>
tags: [category/index]
---

# Project Wiki

Curated by `gd-wiki-curator` (glassdesk plugin). See `plugins/glassdesk/skills/wiki/SKILL.md` for the storage contract.

## Folders

- `architecture/` — how the system fits together
- `features/` — per-feature pages
- `decisions/` — ADR-style trade-off records
- `risks/` — known landmines + mitigations
- `manual/` — 100% human-authored, never touched by curator
- `insights/` — `/learn` outputs
- `index/` — Obsidian Bases (`.base`) aggregators

## Querying

Use `/ask:wiki <question>` for grounded answers. Use `/wiki:update` on `main` after merges.
```

Write `$WIKI_PATH/.config.json` (canonical nested schema — matches `wiki` skill SKILL.md):

```json
{
  "version": 1,
  "sync": {
    "main_branch": "main",
    "last_synced_commit": null,
    "last_synced_at": null,
    "stop_paths": ["node_modules/", "dist/", ".next/", "vendor/", ".git/", ".gd-wiki/insights/"],
    "auto_index_base": false
  },
  "query": {
    "qmd_collection": "wiki-${PROJECT_SLUG}",
    "default_n": 5,
    "min_score": 0.3,
    "max_tokens": 1000000,
    "miss_policy": "surface"
  },
  "lint": {
    "stale_days": 60,
    "warn_unsynced_commits": 20,
    "min_links_per_page": 1
  },
  "models": {
    "curator": "claude-sonnet-4-6",
    "deep_lint": "claude-sonnet-4-6",
    "ask_wiki": "claude-sonnet-4-6"
  },
  "obsidian": {
    "wikilinks": true,
    "frontmatter_required": ["title", "updated", "tags"],
    "use_bases_for_index": true
  }
}
```

Substitute `${PROJECT_SLUG}` literally before write.

## Register QMD Collection

```bash
qmd collection add "$WIKI_PATH" --name "$COLLECTION" --mask "**/*.md"
```

## First-Embed Confirmation

If `~/.qmd/models/` is empty (first embed on this machine):

> Use `AskUserQuestion`:
> "First `qmd embed` will download ~2GB of models (one-time, machine-wide). Proceed?"
> Options: **Yes, embed now (Recommended)** / **Skip — embed later via `qmd embed`**

If user confirms (or models already present):

```bash
qmd embed
```

## Output

```
✓ Wiki initialized at $WIKI_PATH
  Collection: $COLLECTION
  Folders: architecture, features, decisions, risks, manual, insights, index
  Config: $WIKI_PATH/.config.json (nested schema, sync.last_synced_commit=null)

Next: commit your wiki on main, then run /wiki:update after future merges.
```
