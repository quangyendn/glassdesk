---
title: "Compounding"
updated: 2026-04-30
tags: [category/feature, compounding, knowledge-base, skill]
summary: "The compounding feature makes glassdesk self-improving through /spec (brainstorm→formal spec), /learn (session→wiki insights), /improve (gated improvement proposals), and Wiki Recall (read-back at DISCOVERY Step 0)."
---

Compounding is the set of commands and pre-flight hooks that make glassdesk self-improving: spec formalization, session insight extraction, improvement proposals, and the read-back of prior knowledge into DISCOVERY workflows.

## Read/Write Loop

| Direction | Mechanism | Where |
|---|---|---|
| **Write** | `/learn` extracts session insights | `.gd-wiki/insights/` |
| **Write** | `/wiki:update` distills commits into pages | `.gd-wiki/{architecture,decisions,features,risks}/` |
| **Read** | **Wiki Recall** (Step 0 of DISCOVERY skills) | `brainstorming`, `planning`, `scouting` query `.gd-wiki/` before Discovery |

Recall side closes the loop — without it, prior decisions/architecture/insights never influence new proposals. See `plugins/glassdesk/skills/wiki/references/recall.md`.

## Commands

| Command | Description |
|---|---|
| `/spec [topic]` | Formalize a brainstorm into a spec document in `docs/specs/` |
| `/learn` | Extract session insights into `.gd-wiki/insights/` (auto-mkdir) |
| `/improve [--plugin\|--project]` | Read knowledge entries, propose diffs to `plans/improvements/` — never auto-applied |

## /learn Write Target

Since v0.3.0, `/learn` writes exclusively to `.gd-wiki/insights/`. The old `.glassdesk-knowledge/` folder is no longer read or written. The folder is auto-created if missing — no prerequisite `/wiki:init` needed.

## /improve Read Target

`/improve` scans only `.gd-wiki/insights/`. Entries from the old `.glassdesk-knowledge/` are ignored. Users on v0.2.x who want to retain prior insights must move them manually:

```bash
mkdir -p .gd-wiki/insights && git mv .glassdesk-knowledge/*.md .gd-wiki/insights/
```

## Gating

`/improve` proposals are written to `plans/improvements/` and are **never auto-applied**. Human review is required before any improvement diff is executed. This is a deliberate trust boundary — the compounding loop cannot self-modify without explicit approval.

## Related Pages

- [[wiki-maintainer]] — curator does not touch insights/; /learn owns it
- [[wiki-migration-from-glassdesk-knowledge]] — breaking change detail for v0.2.x → v0.3.0
