# Obsidian Conventions (wiki-specific overrides)

Defers all syntax-level concerns to upstream `obsidian:obsidian-markdown` and `obsidian:obsidian-bases` skills. This file documents ONLY the conventions specific to `.gd-wiki/`.

## Page Categories (initial set, extensible)

| Folder | Tag prefix | Purpose |
|---|---|---|
| `architecture/` | `category/architecture` | How the system fits together; component diagrams; data flow |
| `features/` | `category/feature` | One page per shipped feature; what + why + entry points |
| `decisions/` | `category/decision` | ADR-style; problem → options → choice → consequences |
| `risks/` | `category/risk` | Known landmines; mitigations; trip-wires |
| `manual/` | `category/manual` | 100% human-authored. Curator MUST NOT touch this folder ever |
| `insights/` | `category/insight` | `/learn` entries; auto-mkdir on first `/learn` |
| `index/` | (n/a — `.base` files) | Obsidian Bases aggregators |

Adding a new category: create folder + add to this table. Curator picks correct folder by inferring from commit subject + diff content.

## Required Frontmatter (every `.md` page)

```yaml
---
title: "Human-Readable Title"
updated: 2026-04-29
tags: [category/<name>, ...]
---
```

| Field | Required | Notes |
|---|---|---|
| `title` | ✅ | Quoted; spaces allowed |
| `updated` | ✅ | ISO date `YYYY-MM-DD`; curator must bump on every edit |
| `tags` | ✅ | Always include exactly one `category/<name>` tag; additional topical tags optional |
| `aliases` | optional | List of synonyms for fuzzy [[wikilink]] resolution |
| `summary` | optional | One-sentence; consumed by `qmd query` snippet preview |

Pages missing required keys are flagged by `/wiki:lint` rule 3.

## Filename Convention

- kebab-case, lowercase only: `caching-strategy.md`, `auth-flow.md`
- Scoped by category folder; no global namespace collision worry
- No date prefix (use frontmatter `updated` instead)

## `<!-- manual -->` Block Marker

Open: `<!-- manual -->`
Close: `<!-- /manual -->` (preferred, explicit) OR next `## ` H2 (implicit)

Curator MUST:
1. Parse blocks first when editing a page
2. Carve them out
3. Operate on the remainder
4. Re-stitch identically

Linter checks for orphan close (`<!-- /manual -->` with no opener) but does not enforce explicit-close style.

## `[[wikilinks]]` Discipline

- Internal page reference → `[[page-name]]` or `[[page-name|Display Text]]`
- External URL → standard Markdown `[text](url)`
- Heading anchor → `[[page-name#Heading]]`
- Block reference → `[[page-name^block-id]]`

Defer all syntax detail to `obsidian:obsidian-markdown`. The above is the ALLOWED subset for curator-authored pages — humans may use anything Obsidian supports inside `manual/` or `<!-- manual -->` blocks.

## `.base` Index Conventions

Place at `.gd-wiki/index/by-<dimension>.base`.

Minimal example — `.gd-wiki/index/by-category.base`:

```yaml
filters:
  and:
    - file.inFolder(".gd-wiki/")
    - not:
        - file.hasTag("index")
views:
  - type: table
    name: "Wiki Pages by Category"
    order: [file.name, tags, updated]
    sort:
      - property: updated
        direction: DESC
```

Defer all other `.base` syntax to `obsidian:obsidian-bases`.

Curator may auto-create new `.base` files when a new category folder is introduced — but only if `.config.json::sync.auto_index_base` is `true` (default `false`; opt-in for v0.3.0).

## Style — One-Sentence Summaries

Each page MUST open (after frontmatter) with a single sentence stating what the page is about. This sentence is what QMD surfaces in snippet previews and what `/ask:wiki` synthesizes from when the page is the top hit.

Bad: "Caching." (label, not sentence)
Good: "Project-wide caching strategy: when to cache, where (Redis vs in-memory), and how invalidation works."
