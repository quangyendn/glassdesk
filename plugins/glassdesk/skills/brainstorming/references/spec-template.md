# Spec Template

Output format for `/spec` — converting a brainstorm into a formal spec document.

## Destination

```
docs/specs/{YYMMDD}-{slug}.md
```

- Date = today
- Slug = 3-5 word kebab-case summary of the feature/topic

## Template

```markdown
---
date: YYYY-MM-DD
status: draft
tags: [tag1, tag2]
---

# Spec: {Feature Title}

## Problem
{1-2 sentences: what user need or pain point this addresses}

## Proposed Solution
{2-4 sentences: the approach chosen and why}

## Scope

**In scope:**
- {item}

**Out of scope:**
- {item}

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| {topic} | {choice} | {why} |

## Open Questions
- {question} — {owner if known}

## Acceptance Criteria
- [ ] {testable criterion}
```

## Rules

- One spec per `/spec` invocation
- Status starts as `draft` — never `approved` or `done` unless user sets it
- Keep each section short — this is a decision record, not full documentation
- If `docs/specs/` doesn't exist, create it before writing
