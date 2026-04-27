---
description: Validate plan with critical questions interview
argument-hint: [plan-path]
---

Activate `planning` skill.

## Your mission

Interview the user with critical questions to validate assumptions, confirm decisions, and surface potential issues in an implementation plan before coding begins.

## Workflow (follow in order)

1. **Resolve plan path** (see Plan Resolution below)
2. **Generate questions** — Load 'references/validation-questions.md'; execute Steps 1-3 there (read plan files, extract topics, formulate questions)
3. **Interview user** — Use `AskUserQuestion` tool per Interview section below
4. **Document answers** — Update plan per Document Answers section below

## Plan Resolution

1. If `$ARGUMENTS` provided → Use that path
2. Else check `## Plan Context` section → Use active plan path
3. If no plan found → Ask user to specify path or run `/plan:hard` first

## Configuration (from injected context)

Check `## Plan Context` for:
- `mode` — Controls auto/prompt/off behavior
- `questions` — Range like `3-8` (min-max)

## Interview

Use `AskUserQuestion` tool. Rules:
- Use question count from `## Plan Context` → `Validation: questions=MIN-MAX`
- Group related questions when possible (max 4 per tool call)
- Focus on: assumptions, risks, tradeoffs, architecture

## Document Answers

After collecting answers, update the plan:

1. Add `## Validation Summary` section to `plan.md`:
```markdown
## Validation Summary

**Validated:** {date}
**Questions asked:** {count}

### Confirmed Decisions
- {decision}: {user choice}

### Action Items
- [ ] {changes needed}
```

2. If answers require plan changes, note them — **do not modify phase files**.

## Output

Provide summary: questions asked, key decisions confirmed, items flagged for revision, recommendation (proceed or revise first).

## Important Notes

- Only ask about genuine decision points — don't manufacture choices.
- If plan is simple, fewer than min questions is fine.
- Prioritize questions that could change implementation significantly.
