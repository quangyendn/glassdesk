# PR Review — Orchestration & Agent Descriptions

## Review Aspects

| Aspect | Description |
|--------|-------------|
| `comments` | Analyze code comment accuracy and maintainability |
| `tests` | Review test coverage quality and completeness |
| `errors` | Check error handling for silent failures |
| `types` | Analyze type design and invariants (if new types added) |
| `code` | General code review for project guidelines |
| `simplify` | Simplify code for clarity and maintainability |
| `all` | Run all applicable reviews (default) |

## Severity Tier Mapping

| Score | Tier | Action |
|-------|------|--------|
| 91-100 | CRITICAL | Block merge, require fix |
| 76-90 | IMPORTANT | Continue, flag for attention |
| 51-75 | SUGGESTIONS | Continue, optional |
| 0-50 | INFORMATIONAL | Continue, FYI |

## Agent Descriptions

**comment-analyzer** — Verifies comment accuracy vs code; identifies comment rot; checks documentation completeness.

**pr-test-analyzer** — Reviews behavioral test coverage; identifies critical gaps; evaluates test quality.

**silent-failure-hunter** — Finds silent failures; reviews catch blocks; checks error logging.

**type-design-analyzer** — Analyzes type encapsulation; reviews invariant expression; rates type design quality.

**code-reviewer** — Checks CLAUDE.md compliance; detects bugs and issues; reviews general code quality.

**code-simplifier** — Simplifies complex code; improves clarity and readability; applies project standards; preserves functionality.

## Cascade Condition

If ANY critical agent reports severity ≥91, STOP. Display:

```
⚠️  CRITICAL issues found. Fix before running compliance checks.

Blocking agents:
- <agent>: Severity <N> (<reason>)

Fix critical issues before continuing.
```

## Result Summary Template

```markdown
# PR Review Summary

## Critical Issues (N found)
- [agent]: <issue> [file:line]

## Important Issues (N found)
- [agent]: <issue> [file:line]

## Suggestions (N found)
- [agent]: <note> [file:line]

## Strengths
- <observation>

## Recommended Action
1. Fix CRITICAL issues
2. Address IMPORTANT issues
3. Review suggestions (optional)
```

## Notes

- Agents run autonomously and return detailed reports
- Each agent focuses on its specialty for deep analysis
- Results are actionable with specific file:line references
- All agents available in `/agents` list
