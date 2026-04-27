# External Scouting Tools

## When to Use

Use external tools when:
- Codebase is large (>500 files) and token efficiency matters
- Need parallel multi-agent search across many dirs
- Want 1M+ token context window for holistic analysis

## Tool Commands

```bash
# Gemini (for SCALE ≤3)
gemini -p "[prompt]" --model gemini-2.5-flash-preview-09-2025

# OpenCode (for SCALE 4-5)
opencode run "[prompt]" --model opencode/grok-code
```

## Availability Check

If `gemini` or `opencode` not found, ask user:
- Yes → install it (or instruct manual install + auth steps if permission issues)
- No → fall back to `Explore` subagents (internal-scout.md pattern)

## Parallel Dispatch Pattern

Write N Task calls in a single message (runs in parallel). Each Task immediately calls Bash to invoke the external tool:

```
Task(prompt="Call Bash: gemini -p 'Search src/ for payment-related files' --model gemini-2.5-flash-preview-09-2025")
Task(prompt="Call Bash: gemini -p 'Search lib/ for database schema files' --model gemini-2.5-flash-preview-09-2025")
```

**Critical:** These agents run OTHER tools. Do NOT call search tools yourself.

## Timeout

Each Bash call: 3-minute timeout. Skip agents that don't return; do not restart them.

## Scaling

| SCALE | Tool | Agent count |
|-------|------|-------------|
| ≤3 | gemini | SCALE agents |
| 4-5 | opencode | SCALE agents |
| ≥6 | Explore subagents | SCALE agents |

## Variables (from command)

- `USER_PROMPT` — the search objective
- `SCALE` — number of agents (default: 3)
- `RELEVANT_FILE_OUTPUT_DIR` — report output path from `## Naming` section
