---
title: "Wiki Migration from .glassdesk-knowledge/"
updated: 2026-04-29
tags: [category/risk, wiki, migration, breaking-change]
summary: "v0.3.0 breaking change: /learn and /improve no longer read or write .glassdesk-knowledge/; users on v0.2.x must manually migrate existing insight files or they will be silently ignored."
---

In v0.3.0, `/learn` and `/improve` were updated to use exclusively `.gd-wiki/insights/`. The `.glassdesk-knowledge/` folder is no longer read or written. Existing insight files left in the old location are silently ignored.

## Risk

Users who ran `/learn` on v0.2.x have insight files in `.glassdesk-knowledge/*.md`. After upgrading to v0.3.0, `/improve` will not see these files. `/ask:wiki` will also not index them. The old folder is not deleted by the upgrade — it simply stops being used.

## Mitigation

Manual migration before or after upgrading:

```bash
mkdir -p .gd-wiki/insights
git mv .glassdesk-knowledge/*.md .gd-wiki/insights/
git rm -r .glassdesk-knowledge/
git commit -m "chore: migrate insights from .glassdesk-knowledge to .gd-wiki/insights"
```

## Why the Breaking Change

The decision was to have a single source of truth. Maintaining two read paths (`.glassdesk-knowledge/` as fallback + `.gd-wiki/insights/` as primary) adds complexity and ambiguity. The clean break enforces the new contract immediately.

## See Also

- [[gd-wiki-vault-adoption]] — decision that drove this breaking change
- [[compounding]] — /learn and /improve current behavior
