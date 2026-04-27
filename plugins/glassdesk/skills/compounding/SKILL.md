---
name: compounding
description: Use when capturing session insights, writing knowledge base entries, or proposing self-improvement patches based on session history. Use for /learn and /improve workflows.
---

# Compounding

Extract durable knowledge from Claude Code sessions and convert it into persisted learning entries or improvement proposals.

## When to Use

- After a session: capturing patterns, decisions, and recurring problems
- Writing a `.glassdesk-knowledge/` entry (`/learn`)
- Generating an improvement proposal for review (`/improve`)
- NOT for implementation (use `building` skill) or design exploration (use `brainstorming` skill)

## Core Pattern

1. **Parse** — run `find-current-session.cjs` + `parse-session-insights.cjs` to extract raw signals
2. **Extract** — apply insight-extraction prompt to identify problems, patterns, decisions
3. **Output** — write knowledge entry (`/learn`) OR write improvement proposal (`/improve`)

## Implementation

- Session data conventions: `references/session-parsing.md`
- Insight extraction prompt: `references/insight-extraction.md`
- `/learn` output rules: `references/learn-output.md`
- `/improve` proposal rules: `references/improve-proposal.md`

## Common Mistakes

- Auto-applying patches from `/improve` — proposals are NEVER applied automatically
- Writing to `docs/` or any tracked file — knowledge base lives in `.glassdesk-knowledge/` (gitignored)
- Generating an improve proposal without a prior learning entry — gate: ≥1 entry required
- Including tool_result content (file contents, credentials) in extracted insights
