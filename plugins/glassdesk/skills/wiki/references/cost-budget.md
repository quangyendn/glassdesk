# Cost Budget

CLI-first decision rules + token estimation procedure + model tier defaults. Single source of truth — `maintaining.md`, `querying.md`, `linting.md` all defer here for cost questions.

## CLI vs LLM (use CLI whenever possible)

| Step | Tool | Why |
|---|---|---|
| Diff parse | `git diff --stat`, `git log --name-only` | Deterministic; LLM adds nothing |
| Wikilink scan | `grep -oP '\[\[\K[^\]\|#^]+'` | Regex fits exactly |
| Frontmatter parse | `yq -r '.field'` | YAML lib > LLM JSON guess |
| Filename / path matching | `find`, `comm`, `sort` | Set ops are exact |
| Empty-file detection | `awk` + `wc -l` | Counting |
| Stale-date check | `date` arithmetic | Deterministic |
| Token estimate | `wc -c` ÷ ~3.5 chars/token | Cheap pre-flight |
| `qmd query` | `qmd query --json` | BM25 + vector + rerank, local, fast |
| **Distill diff → page edit** | **LLM (Sonnet)** | Required — semantic compression |
| **Synthesize wiki answer** | **LLM (Sonnet)** | Required — coherent narrative from snippets |
| **`--deep` contradiction sweep** | **LLM (Sonnet, opt-in)** | Required — semantic comparison |

If a step is in the lower three rows, it MUST go to LLM. Everything else MUST stay in CLI. Drift = bug.

## Token Estimate Procedure

Pre-flight before any LLM call that ingests user content.

```bash
# Rough char→token: divide by 3.5 (English-text heuristic)
EST=$(node -e 'const fs=require("fs"); const f=process.argv[1];
  console.log(Math.ceil(fs.statSync(f).size / 3.5))' /tmp/wiki-diff-stat.txt)

MAX=$(jq -r '.query.max_tokens // 1000000' .gd-wiki/.config.json)

if [ "$EST" -gt "$MAX" ]; then
  echo "ABORT: estimated $EST tokens exceeds budget $MAX"
  echo "Hint: split via 'git rev-list <last>..HEAD | split -l N' and run /wiki:update on each chunk"
  exit 1
fi
```

For finer estimation install `tiktoken` (`pip install tiktoken`) and substitute `node -e` with a Python one-liner. The 3.5 heuristic is fine for budget gating; it overshoots for code (more punctuation), undershoots for prose.

## Model Tier Defaults

`.config.json::models` — all default to `sonnet`.

```json
{
  "models": {
    "curator":   "claude-sonnet-4-6",
    "deep_lint": "claude-sonnet-4-6",
    "ask_wiki":  "claude-sonnet-4-6"
  }
}
```

Override path:

| Want | Set |
|---|---|
| Cheaper distill on small diffs | `models.curator: "claude-haiku-4-5"` |
| Higher-quality synthesis on critical questions | `models.ask_wiki: "claude-opus-4-7"` |
| Aggressive deep-lint accuracy | `models.deep_lint: "claude-opus-4-7"` |

Opus is opt-in only — never the default. The wiki maintainer is a high-frequency tool; cost compounds.

## First-Embed Warning

`qmd embed` downloads ~2GB of models on first run (per machine, not per project). `/wiki:init` MUST:

1. Detect if first embed: `[ ! -d ~/.qmd/models ]`
2. Print the size warning
3. Ask Y/n via `AskUserQuestion`
4. Abort cleanly on N — leave `.gd-wiki/` and config in place; user can re-run

## Cost Comparison vs `/ask` General

| Scenario | `/ask` general | `/ask:wiki` |
|---|---|---|
| Single project question | full codebase grep + read 5-20 files (~50K input tokens) | QMD lookup (~0 tokens) + 5 snippets (~3K input) | 
| Repeated questions on same area | each call re-greps | snippets already retrieved by QMD; near-cached |
| Cross-project / general programming | works | likely [] miss → fallback to `/ask` |

Rule of thumb: `/ask:wiki` ≈ 10x cheaper when wiki has the answer. `/wiki:update` amortizes its own cost over many `/ask:wiki` calls.

## Caching Posture

QMD itself maintains a SQLite + vector index — it IS the cache. No additional layer needed in v0.3.0. If wiki grows past ~500 pages, revisit chunking strategy in v0.4.

## Budget Levers

User-tunable knobs in `.config.json`:

```json
{
  "query": {
    "default_n": 5,
    "min_score": 0.3,
    "max_tokens": 1000000
  },
  "lint": {
    "stale_days": 60,
    "warn_unsynced_commits": 20
  }
}
```

Lower `default_n` → cheaper synthesis. Raise `min_score` → fewer noisy hits. `max_tokens` is the hard abort threshold for `/wiki:update`.
