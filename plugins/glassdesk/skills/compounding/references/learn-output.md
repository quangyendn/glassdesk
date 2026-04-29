# Learn Output

How to write a knowledge base entry after extracting session insights.

## Destination

```
.gd-wiki/insights/{YYMMDD}-{slug}.md
```

- Auto-mkdir on every `/learn` invocation — no `/wiki:init` prerequisite
- Committed alongside the wiki vault (since v0.3.0); previously gitignored under `.glassdesk-knowledge/` (dropped, no compat read)
- One file per session (not per insight)
- Date = session date (today if running same day, else use session timestamp)
- Slug = 3-5 word kebab-case summary of the session topic

## Frontmatter

```yaml
---
date: YYYY-MM-DD
session: <session UUID or "unknown">
tags: [tag1, tag2]
types: [PROBLEM|PATTERN|DECISION|MISTAKE, ...]
---
```

- `date` — ISO 8601
- `session` — UUID from the JSONL filename (e.g. `19dbee80-1992-4851-95fe-44a25a68a639`)
- `tags` — 1-4 lowercase keywords describing the domain (e.g. `plugin`, `testing`, `git`)
- `types` — list of insight types present in this entry

## Body Format

```markdown
# {Session title — same as slug but sentence case}

## Insights

### {Insight title}
**Type:** PROBLEM | PATTERN | DECISION | MISTAKE
{1-3 sentence body}

> Evidence: {brief quote or tool name}

---
```

Repeat `### {Insight title}` block for each insight (max 5).

## Rules

- NEVER write to `docs/`, `plans/`, or any tracked file outside `.gd-wiki/insights/`
- NEVER include file contents, credentials, or tool_result data
- ALWAYS run `mkdir -p .gd-wiki/insights` before writing — auto-create is the contract
- Keep entries terse — each insight body ≤3 sentences
- `.gd-wiki/insights/` IS committed (curator skips it; `/learn` owns it)
