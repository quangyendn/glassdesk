# Querying

`/ask:wiki` retrieval contract — QMD lookup → Sonnet synthesis with citations.

## CLI Form (default, v0.3.0)

```bash
COLL=$(jq -r '.query.qmd_collection' .gd-wiki/.config.json)
MAX=$(jq -r '.query.default_n // 5' .gd-wiki/.config.json)
MIN=$(jq -r '.query.min_score // 0.3' .gd-wiki/.config.json)

qmd query "$Q" -c "$COLL" --json -n "$MAX" --min-score "$MIN" \
  ${INTENT:+--intent "$INTENT"}
```

`--intent` is optional; pass when caller has prior context narrowing the search domain (e.g. "decisions about caching").

## JSON Schema

QMD returns an array. Each hit:

```json
{
  "path": ".gd-wiki/decisions/caching-strategy.md",
  "title": "Caching Strategy",
  "snippet": "We chose Redis over in-memory because...",
  "score": 0.78,
  "line": 42,
  "context": "## Trade-offs\n...\n"
}
```

Always cite by `path:line` in the synthesized answer.

## Empty Result Handling

When the array is `[]`:

| Mode (`.config.json::query.miss_policy`) | Behavior |
|---|---|
| `surface` (v1 default) | Print "No wiki match for: <Q>. Run `/ask` for general answer?" — no auto-escalate |
| `fallback` | Auto-invoke `/ask` general with same query, prefix output with `(wiki miss → /ask)` |
| `silent` | Return empty answer; caller decides |

## Score Interpretation

| Range | Confidence | Action |
|---|---|---|
| ≥ 0.8 | High | Use as primary source, cite directly |
| 0.5 – 0.8 | Moderate | Use with hedging language ("based on the wiki, …") |
| < 0.5 | Low | Skip; if nothing else, surface as miss |

`min_score` filters anything below the threshold at QMD layer — caller almost always sees ≥ 0.3.

## Synthesis Prompt Template

System prompt to Sonnet:

```
You are answering a question about a project. You have N wiki snippets retrieved
by semantic + lexical search. You MUST:

1. Synthesize from the snippets ONLY. Do not invent facts.
2. Cite every claim with `path:line` (matching the snippet metadata).
3. If the snippets are insufficient, say so explicitly — do not extrapolate.
4. Use the project's own terminology from the snippets.

Question: {Q}

Snippets (sorted by score, highest first):
{for each: --- path:line (score: X.XX) --- snippet body ---}
```

User message: just `{Q}`. Keep system message snippet bodies under ~6KB total to leave room for synthesis.

## MCP Form (opt-in, v2 placeholder)

QMD ships an MCP server (`mcp__qmd__*`). Form when adopted:

```
mcp__qmd__query({
  query: Q,
  collection: COLL,
  searches: [{ type: "lex" }, { type: "vec" }],
  n: 5,
  min_score: 0.3
})
```

Inert in v0.3.0 — CLI is the contract. Documented for forward compat.

## Cost

See `cost-budget.md`. Single `/ask:wiki` round = ~1 QMD call (sub-second, no LLM) + 1 Sonnet synthesis (~2-5K input tokens, ~500 output). Cheaper than `/ask` general by ~10x because no codebase grep.
