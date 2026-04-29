---
title: ".gd-wiki/ Vault Adoption"
updated: 2026-04-29
tags: [category/decision, wiki, knowledge-base, obsidian]
summary: "Project knowledge is consolidated in a committed .gd-wiki/ Obsidian vault, replacing the ad-hoc .glassdesk-knowledge/ folder adopted in v0.2.0."
---

The `.gd-wiki/` Obsidian-flavored vault was adopted in v0.3.0 as the single source of truth for project knowledge, replacing the `.glassdesk-knowledge/` folder introduced in v0.2.0.

## Problem

Project knowledge (architecture, feature specs, decisions, lessons) was scattered across code, commit history, ad-hoc docs, and the flat `.glassdesk-knowledge/` folder from v0.2.0. No consolidated, evergreen, query-able source existed for both human and LLM use. Every `/ask` or debug session required re-grepping the codebase.

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Storage location | `.gd-wiki/` (dot-prefix, committed) | Plugin-internal namespace; no pollution of `docs/`; clear ownership |
| vs `docs/specs/` | Separate | `docs/specs/` = change intent (input for `/plan`); wiki = consolidated production state |
| vs `.glassdesk-knowledge/` | Replaced entirely | Simpler, one source; user migrates manually if needed |
| Page format | Obsidian Flavored Markdown | Reuses `obsidian-markdown` skill; industry standard |
| Index pages | `.base` files (Obsidian Bases) | YAML readable without Obsidian; auto-renders in Obsidian |
| Update trigger | Manual `/wiki:update` only (v1) | Hooks deferred; user controls timing |
| Branch model | Main branch only | Wiki = SoT of production state; refuse on feature branches |
| Retrieval backend | QMD (local BM25 + vector + rerank) | ~10x token saving vs grep+LLM; local = no API cost |
| Default model | Sonnet for all wiki operations | Cost-conscious; Opus reserved for explicit flag |
| Manual edit protection | `<!-- manual -->` marker | Curator skips block; human authority respected |

## Breaking Change (v0.2.x → v0.3.0)

`/learn` now writes only to `.gd-wiki/insights/`. `/improve` reads only from `.gd-wiki/insights/`. Users on v0.2.x must migrate manually:

```bash
mkdir -p .gd-wiki/insights && git mv .glassdesk-knowledge/*.md .gd-wiki/insights/
```

## Inspiration

Karpathy's gist on LLM-friendly project wikis: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f

## Related Pages

- [[wiki-maintainer]] — full feature description
- [[wiki-migration-from-glassdesk-knowledge]] — risk entry for the migration
- [[compounding]] — /learn and /improve integration
