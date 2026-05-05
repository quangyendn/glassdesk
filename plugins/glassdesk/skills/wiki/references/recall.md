# Wiki Recall (DISCOVERY pre-flight)

Auto-invoked at Step 0 of `brainstorming`, `planning`, `scouting` skills. Closes the read-side of the compounding loop — `/learn` writes to `.gd-wiki/`, this reads back at the start of every DISCOVERY workflow so prior decisions/architecture/insights influence new proposals.

## Contract

| Aspect | Spec |
|---|---|
| Input | `$Q` = user task/question (skill caller passes `$ARGUMENTS`) |
| Output | Markdown block with raw QMD JSON + Citation Gate notice |
| Cost | 0 LLM tokens (raw inject); ~10s wall observed 2026-04-30 (qmd query reranking — verify if qmd version changes) |
| Token cap | 2500 tokens injected; drop low-score hits first |
| Behavior | **Hard citation gate** — see § Citation Gate |

## Pre-flight

```bash
[ -f .gd-wiki/.config.json ] || { echo "(wiki absent — recall skipped)"; exit 0; }
command -v qmd >/dev/null 2>&1 || { echo "(qmd CLI absent — recall skipped)"; exit 0; }
```

## Query (single `qmd query` with `intent:` bias)

**Why single, not parallel-3**: Empirical check (2026-04-30) — `qmd query` already does query expansion + reranking across categories. Single `-n 9` returns multi-category mix (decisions / architecture / insights / risks) via score ranking. Three parallel calls × ~10s each = ~30s wall — too slow for skill activation. Single call ≈ 10s, acceptable trade-off.

`--intent` is **not** a CLI flag — `intent:` is a query document line in the multi-line grammar (see `qmd query --help` § Query syntax). Pass via inline argument:

```bash
COLL=$(jq -r '.query.qmd_collection' .gd-wiki/.config.json)
MIN=$(jq -r '.query.min_score // 0.3' .gd-wiki/.config.json)

QUERY_DOC=$(printf 'intent: prior decisions, architecture, and insights about %s\nlex: %s\nvec: %s\n' "$Q" "$Q" "$Q")

OUT=$(mktemp -t wiki-recall.XXXXXX.json)
trap 'rm -f "$OUT"' EXIT
qmd query "$QUERY_DOC" -c "$COLL" --json -n 9 --min-score "$MIN" > "$OUT" 2>/dev/null || echo '[]' > "$OUT"
```

`mktemp` isolates concurrent invocations (e.g. `/plan:hard` parallel researchers). On non-zero exit, file holds `[]` so downstream parsing stays graceful — never block the skill.

## JSON Schema (empirical, 2026-04-30)

```json
{
  "docid": "#a1b2c3",
  "score": 0.88,
  "file": "qmd://wiki-glassdesk-93bc79f5/features/compounding.md",
  "title": "Compounding",
  "snippet": "@@ -1,3 @@ (0 before, 35 after)\n---\ntitle: ..."
}
```

**Citation path extraction**: strip `qmd://<collection>/` prefix, prepend `.gd-wiki/`. The `@@ -N,M @@` line range in the snippet header gives an approximate line — cite as `.gd-wiki/<path>` (no `:line` for v1; line is approximate, not precise).

## Output Format (inject into skill context)

```markdown
## Wiki Recall

**Top hits** (by score, highest first):
- `.gd-wiki/<path>` — `<title>` (score: X.XX) — <first 120 chars of snippet>
- ... (up to 9, dropped if token budget exceeded)

### Citation Gate

- **Top score ≥ 0.5**: skill output MUST cite at least one wiki path in rationale, OR justify divergence ("Wiki has `<path>` decided X, but proposing Y because <new reason>").
- **Top score < 0.5**: low-confidence — treat hits as hint, no hard gate.
- **Empty result**: log "no prior wiki context for: $Q" and proceed normally.
```

## Token Cap

Most outputs < 1500 tokens (9 hits × ~120-char snippet). If ever > 2500, drop low-score hits first (qmd already returns sorted). Defensive only — cap rarely fires.

## Citation Gate Enforcement (skill self-check)

The skill (Opus/Sonnet) MUST verify before final output:

1. Did Wiki Recall return hits with top score ≥ 0.5?
2. If yes, does my output contain either:
   - `.gd-wiki/<path>` reference in rationale, OR
   - Explicit divergence note ("wiki says X, but I propose Y because Z")?
3. If neither → output is incomplete; revise to include one.

No PostToolUse hook validates this in v1 (YAGNI). Track repeat misses via `/learn`.

## Miss Policy

| Scenario | Detection | Behavior |
|---|---|---|
| Wiki absent | `.gd-wiki/.config.json` missing | Silent skip, 1-line log |
| QMD CLI absent | `command -v qmd` fails | Silent skip, 1-line log |
| QMD error / empty | JSON `[]` (rare) | Log "no prior wiki context for: $Q"; continue |
| **Low-score top hit** | top `.score < 0.5` | Inject as low-confidence hint; **no gate** |
| **High-score hit** | top `.score ≥ 0.5` | Inject + **Hard citation gate active** |

**Note on empty result**: Empirically (smoke test 2026-04-30), `qmd query` with vector reranking almost always returns hits — even for nonsense queries (semantic similarity floors at ~0.3+). The practical gate is **score threshold (≥ 0.5)**, not array emptiness. The empty-array path covers only QMD errors / non-zero exit / fully-empty wiki collection.

## Examples

### Example 1: High-score hit

User runs `/brainstorm "should we cache API responses?"`.

QMD returns:
```json
[{"score": 0.88, "file": "qmd://wiki-.../decisions/caching-strategy.md", ...}]
```

Skill output MUST contain something like:
> Per `.gd-wiki/decisions/caching-strategy.md`, we chose Redis over in-memory caching last quarter. Aligning with that decision, I propose...

Or, if diverging:
> Wiki has `decisions/caching-strategy.md` decided Redis, but proposing CDN-edge cache instead because <new requirement Z>.

### Example 2: Low-score (<0.5)

QMD returns hits with top score 0.42. Skill treats as hint, no gate. May still mention "(low-confidence wiki match: ...)" but not required to cite.

### Example 3: Empty / Absent

Skill prints `(no prior wiki context for: $Q)` and proceeds with standard Discovery flow.

## Security

- `$Q` is user-controlled — always quote `"$Q"` in Bash; never `eval`. The query document construction via `printf '%s' "$Q"` is safe (printf treats `%s` argument as literal).
- QMD CLI is the trust boundary; assume it sanitizes its own input.
- Recall output paths are all `.gd-wiki/`-rooted — bounded.

## Latency Note

~10s per skill activation observed 2026-04-30 in DISCOVERY workflows (verify if qmd version changes). Acceptable trade-off:
- Compounding signal worth more than 10s
- Skill activation already includes user clarification turns (much longer)
- Defer optimization to v2 if telemetry shows latency complaints

## Deviations from Brainstorm Spec

Plan `plans/260430-1637-discovery-wiki-recall/` and brainstorm report assumed:
1. `--intent` is a CLI flag → **wrong**; it's a query document line
2. Sub-second latency → **wrong**; ~10s due to reranking
3. 3 parallel queries → **dropped**; 30s wall too slow, single query covers categories naturally

Course-corrected here based on empirical CLI testing on 2026-04-30.
