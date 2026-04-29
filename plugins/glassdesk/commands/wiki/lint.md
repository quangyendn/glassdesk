---
description: ⚡ Lint .gd-wiki/ for broken links, orphans, stale, empty (--deep adds LLM contradiction sweep)
argument-hint: [--deep]
---

Activate the `wiki` skill. Load `references/linting.md` (4 deterministic rules + `--deep` mode + report format).

## Variables

- `DEEP`: $1 == `--deep` (boolean)
- `OUT`: `plans/reports/wiki-lint-$(date +%y%m%d-%H%M).md`

## Pre-flight

```bash
[ -f .gd-wiki/.config.json ] || { echo "ERROR: .gd-wiki/ not initialized. Run /wiki:init."; exit 1; }
command -v yq >/dev/null || { echo "ERROR: yq required for stale-frontmatter check. brew install yq"; exit 1; }
mkdir -p plans/reports
```

## Deterministic Checks (always run)

Implement the 4 rules from `references/linting.md` exactly:

1. **Broken `[[wikilinks]]`** — `grep -roP '\[\[\K[^\]\|#^]+'` → diff against page basenames
2. **Orphan pages** — page basenames not appearing as any `[[X]]` target (exclude `README.md`, `index/**`, `tags: [orphan-ok]`)
3. **Stale frontmatter** — `yq '.updated'` per page; older than `lint.stale_days` (default 60)
4. **Empty / near-empty** — body (excluding frontmatter) < 5 non-blank lines

Collect findings into 4 arrays for the report.

## Sync Drift Warning

```bash
LAST=$(jq -r '.sync.last_synced_commit' .gd-wiki/.config.json)
WARN_AT=$(jq -r '.lint.warn_unsynced_commits // 20' .gd-wiki/.config.json)
[ "$LAST" != "null" ] && {
  BEHIND=$(git rev-list --count "$LAST..HEAD")
  [ "$BEHIND" -gt "$WARN_AT" ] && SYNC_WARN="WARN: wiki is $BEHIND commits behind HEAD (threshold $WARN_AT). Consider /wiki:update."
}
```

## `--deep` Contradiction Sweep (opt-in)

When `$DEEP`:

1. Cluster pages via `qmd query --type vec -c $COLL --json -n 50 --min-score 0.6 ""` — group hits with score-to-each-other ≥ 0.6.
2. For each cluster (size ≥ 2), call Sonnet with the contradiction-check prompt from `references/linting.md`.
3. Append findings to the report under `## Contradictions (--deep)`.

Cost note: see `references/cost-budget.md`. Skip on default invocation.

## Output

Write `$OUT` per the report format in `references/linting.md`:

```markdown
# Wiki Lint Report — <timestamp>

## Summary
- Broken wikilinks: N
- Orphan pages: N
- Stale frontmatter: N (cutoff: YYYY-MM-DD)
- Empty/near-empty: N
- Sync delta: N commits behind
- Contradictions (--deep only): N

## Broken Wikilinks
...

## Orphan Pages
...

## Stale Frontmatter
...

## Empty / Near-Empty
...

## Contradictions (--deep only)
...

## Proposed Actions
*(human reviews + applies; lint never auto-fixes)*
- ...
```

Echo a one-line summary to stdout: `Wrote $OUT — N issues found.`

## Exit Code

| Findings | Exit |
|---|---|
| 0 issues across all rules | 0 |
| Any deterministic findings | 1 |
| `--deep` contradictions ≥ 1 high-severity | 2 |

CI integrations gate on exit code without parsing the report.
