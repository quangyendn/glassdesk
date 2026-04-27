# Insight Extraction

How to extract durable insights from parsed session data.

## Input

The parsed JSON from `parse-session-insights.cjs`:
- `prompts` — what the user asked
- `assistant_texts` — what was answered
- `tool_calls` — which tools were used (names only)
- `errors` — session error events

## Extraction Prompt

Apply this prompt to the parsed data:

```
Given the following session data, identify up to 5 durable insights.

For each insight, classify it as one of:
- PROBLEM: a recurring difficulty or friction point
- PATTERN: a repeated approach or convention that worked well
- DECISION: an architectural or design choice with rationale
- MISTAKE: an error made and corrected (include the fix)

Format each insight as:

TYPE: <PROBLEM|PATTERN|DECISION|MISTAKE>
Title: <short title>
Body: <1-3 sentences — what happened, why it matters, what to do next time>
Evidence: <brief quote or tool name from the session>

Session data:
{{prompts}}
{{assistant_texts}}
{{tool_calls}}
```

## Filtering Rules

- **Skip** insights that are project-specific implementation details (file paths, variable names)
- **Keep** insights about workflow, conventions, tooling, and recurring errors
- **Deduplicate** — if the same lesson appears multiple times in the session, merge into one
- **Max 5** — quality over quantity; discard weak signals

## Signal Weights

| Source | Signal strength |
|--------|----------------|
| User repeated the same request 2+ times | High — friction point |
| `errors` array non-empty | Medium — investigate cause |
| Tool called `>5` times in one turn | Medium — workflow inefficiency |
| User explicitly said "remember" or "always" | High — explicit preference |
| Long `assistant_texts` followed by correction | Medium — misunderstanding |
