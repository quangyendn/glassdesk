# Learn Output

How to write a knowledge base entry after extracting session insights.

## Destination

```
.glassdesk-knowledge/{YYMMDD}-{slug}.md
```

- Hidden directory — gitignored, never committed
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

- NEVER write to `docs/`, `plans/`, or any tracked file
- NEVER include file contents, credentials, or tool_result data
- NEVER create `.glassdesk-knowledge/` if it doesn't exist yet — run `mkdir -p .glassdesk-knowledge` first
- Keep entries terse — each insight body ≤3 sentences
- If `.glassdesk-knowledge/` is missing from `.gitignore`, append it before writing
