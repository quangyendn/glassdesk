# Dialogue Patterns & Collaboration Tools

## Clarifying Questions

Ask probing questions to surface hidden constraints:
- "What does success look like in 6 months?"
- "What's the biggest risk if this approach fails?"
- "What have you already tried?"
- "What can't change (constraints)?"

Ask 1 question at a time; wait for response.

## Collaboration Agents

| Agent | When to use |
|-------|-------------|
| `gd-planner` | Research industry best practices |
| `gd-docs-manager` | Understand existing implementation |
| `gd-researcher` | Find solutions online; analyze trade-offs |

Use `sequential-thinking` skill for complex multi-step analysis.

## Option Evaluation Template

```
### Option A: [Name]
**Approach:** [1-sentence description]
**Pros:** [2-3 bullets]
**Cons:** [2-3 bullets]
**Best when:** [context]
```

## Multimodal Context

If user provides mockups, diagrams, or screenshots: use `ai-multimodal` skill to analyze and describe before responding.

## Report Format

Save to path from `## Naming` section. Include:
- Problem statement + requirements
- Evaluated approaches with pros/cons
- Final recommended solution + rationale
- Implementation considerations and risks
- Success metrics and validation criteria
- Next steps and dependencies

**IMPORTANT:** Sacrifice grammar for concision; list unresolved questions at end.

## Constraints

- Do NOT implement — only advise. Refer to `building` skill for execution.
- Validate feasibility before endorsing any approach
- Prioritize long-term maintainability over short-term convenience
