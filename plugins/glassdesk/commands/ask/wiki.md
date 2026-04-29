---
description: ⚡ Query .gd-wiki/ via QMD + Sonnet synthesis (falls back to /ask general when wiki absent)
argument-hint: [question]
---

Activate the `wiki` skill. Load `references/querying.md` (CLI form, JSON schema, miss policy, synthesis prompt).

## Variables

- `Q`: $ARGUMENTS — the user's question

## Wiki-Absent Fallback (delegate to `/ask` general)

If `.gd-wiki/.config.json` does NOT exist, you (the model) MUST execute `/ask "$Q"` and surface its output to the user — do NOT exit silently.

Detection (Bash):
```bash
[ -f .gd-wiki/.config.json ] || echo "WIKI_ABSENT"
```

When `WIKI_ABSENT` is printed, your next action MUST be: invoke the `/ask` slash command with the user's original `$Q` as input. Prefix the response with `(wiki not initialized → /ask general)` so the user knows the fallback fired. Do not stop after detecting absence; the contract is "fall back", not "no-op".

## Query

```bash
COLL=$(jq -r '.query.qmd_collection' .gd-wiki/.config.json)
MAX=$(jq -r '.query.default_n // 5' .gd-wiki/.config.json)
MIN=$(jq -r '.query.min_score // 0.3' .gd-wiki/.config.json)

RESULTS=$(qmd query "$Q" -c "$COLL" --json -n "$MAX" --min-score "$MIN")
```

## Empty Result Handling

Per `.config.json::query.miss_policy` (default `surface`):

```bash
COUNT=$(echo "$RESULTS" | jq 'length')
if [ "$COUNT" -eq 0 ]; then
  POLICY=$(jq -r '.query.miss_policy // "surface"' .gd-wiki/.config.json)
  case "$POLICY" in
    surface)  echo "No wiki match for: $Q"
              echo "Run \`/ask $Q\` for general answer." ;;
    fallback) echo "(wiki miss → /ask)"
              # invoke /ask "$Q" ;;
    silent)   ;;  # caller decides
  esac
  exit 0
fi
```

## Synthesis

Call Sonnet (model from `.config.json::models.ask_wiki`, default `claude-sonnet-4-6`) with the synthesis prompt from `references/querying.md`:

System prompt (verbatim):
```
You are answering a question about a project. You have N wiki snippets retrieved
by semantic + lexical search. You MUST:

1. Synthesize from the snippets ONLY. Do not invent facts.
2. Cite every claim with `path:line` (matching the snippet metadata).
3. If the snippets are insufficient, say so explicitly — do not extrapolate.
4. Use the project's own terminology from the snippets.

Question: <Q>

Snippets (sorted by score, highest first):
<for each result: --- {path}:{line} (score: {score}) --- {snippet} --->
```

User message: just `$Q`.

## Output

```
<3-5 sentence direct answer with [path:line] citations inline>

Related pages:
- .gd-wiki/decisions/caching-strategy.md
- .gd-wiki/architecture/data-flow.md
```

## Score Interpretation Hint

If top hit score < 0.5, prefix the answer with: `(low confidence — top snippet score 0.XX)`. Lets the reader weigh it. See `references/querying.md` § Score Interpretation.

## Cost

See `references/cost-budget.md` § Cost Comparison vs `/ask` General. Single `/ask:wiki` round ≈ 1 QMD CLI call (sub-second, 0 LLM tokens) + 1 Sonnet synthesis (~3K input, ~500 output). ~10× cheaper than `/ask` general when wiki has the answer.
