# Improve Proposal

How to generate a self-improvement proposal from accumulated knowledge entries.

## Gate Check (required before generating)

1. `mkdir -p .gd-wiki/insights` (normalizes empty case to `0 files` not `directory not found`)
2. Scan `.gd-wiki/insights/` for existing entries
3. If zero entries found: **STOP** — inform user to run `/learn` first
4. If ≥1 entry found: proceed

## Scope Flags

| Flag | Target |
|------|--------|
| `--plugin` (default) | glassdesk plugin files in `plugins/glassdesk/` |
| `--project` | project-level files (CLAUDE.md, `.claude/`, workflow docs) |

When no flag given, default to `--plugin`.

## Proposal Location

```
plans/improvements/{YYMMDD}-{slug}-proposal.md
```

- One file per proposal
- Slug = 3-5 word summary of the improvement theme

## Proposal Format

```markdown
---
date: YYYY-MM-DD
scope: plugin | project
based-on: [.gd-wiki/insights/YYMMDD-slug.md, ...]
status: draft
---

# Improvement Proposal: {title}

## Motivation
{1-2 sentences: what knowledge entries drove this proposal}

## Proposed Changes

### {Change title}

**File:** `{relative path}`

\`\`\`diff
--- a/{relative path}
+++ b/{relative path}
@@ -{line},{count} +{line},{count} @@
 context line
-removed line
+added line
 context line
\`\`\`

**Why:** {1 sentence rationale}

---

## How to Apply

1. Review each diff above carefully
2. Apply manually: `patch -p1 < <(pbpaste)` or edit files directly
3. Run tests to verify no regressions
4. Delete this proposal file after applying

## ⚠️ This proposal is NEVER applied automatically.
```

## CRITICAL Rules

- **NEVER write code changes directly to source files** — proposals are read-only suggestions
- **NEVER modify CLAUDE.md** in an improve proposal — CLAUDE.md changes require explicit user instruction
- **NEVER auto-apply** — the proposal file is the final output; the user applies manually
- Each diff block must be a valid unified diff (proper `---`/`+++`/`@@` headers)
- Limit to ≤5 proposed changes per proposal — quality over quantity
- Reference the specific `.gd-wiki/insights/` entries that drove each change
