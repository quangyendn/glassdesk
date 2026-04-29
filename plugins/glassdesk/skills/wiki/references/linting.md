# Linting

`/wiki:lint` integrity audit — deterministic by default, `--deep` adds LLM contradiction sweep. Always propose-only; never auto-fix.

## Deterministic Rules (no LLM)

### 1. Broken `[[wikilinks]]`

```bash
# Extract every wikilink target
grep -roP '\[\[\K[^\]|#^]+' .gd-wiki/ | sort -u > /tmp/wiki-links.txt

# Build set of existing page basenames (without .md)
find .gd-wiki -name "*.md" -not -path "*/node_modules/*" -printf "%f\n" \
  | sed 's/\.md$//' | sort -u > /tmp/wiki-pages.txt

# Diff: links that target nonexistent pages
comm -23 /tmp/wiki-links.txt /tmp/wiki-pages.txt > /tmp/wiki-broken.txt
```

For each broken link, also report the source page (`grep -rln "\[\[X\]\]" .gd-wiki/`) so the reader can find the typo.

### 2. Orphan Pages

A page is orphan if zero `[[X]]` link points to it.

```bash
comm -13 /tmp/wiki-links.txt /tmp/wiki-pages.txt > /tmp/wiki-orphans.txt
```

Exclude expected orphans:
- `README.md` (entry point, not linked from inside)
- Anything under `.gd-wiki/index/` (`.base` aggregators)
- Anything tagged `tags: [orphan-ok]` in frontmatter

### 3. Stale Frontmatter

```bash
STALE_DAYS=$(jq -r '.lint.stale_days // 60' .gd-wiki/.config.json)
CUTOFF=$(date -u -v-${STALE_DAYS}d +%Y-%m-%d 2>/dev/null \
       || date -u -d "${STALE_DAYS} days ago" +%Y-%m-%d)

for f in $(find .gd-wiki -name "*.md" -not -path "*/manual/*"); do
  UPD=$(yq -r '.updated // ""' "$f" 2>/dev/null)
  [ -z "$UPD" ] && echo "MISSING_UPDATED: $f" && continue
  [ "$UPD" \< "$CUTOFF" ] && echo "STALE: $f (updated: $UPD)"
done
```

### 4. Empty / Near-Empty

```bash
for f in $(find .gd-wiki -name "*.md"); do
  # Strip frontmatter, count remaining non-blank lines
  BODY_LINES=$(awk '/^---$/{c++; next} c<2{next} NF' "$f" | wc -l)
  [ "$BODY_LINES" -lt 5 ] && echo "EMPTY: $f ($BODY_LINES body lines)"
done
```

## Last-Sync Warning

```bash
LAST=$(jq -r '.sync.last_synced_commit' .gd-wiki/.config.json)
BEHIND=$(git rev-list --count "$LAST..HEAD")
WARN_AT=$(jq -r '.lint.warn_unsynced_commits // 20' .gd-wiki/.config.json)

[ "$BEHIND" -gt "$WARN_AT" ] && \
  echo "WARN: wiki is $BEHIND commits behind HEAD; consider /wiki:update"
```

## `--deep` LLM Contradiction Sweep

Opt-in; runs only when user passes `--deep`. Higher cost — see `cost-budget.md`.

1. **Cluster** semantically similar pages via QMD vector search:
   ```bash
   qmd query --type vec -c "$COLL" --json -n 50 --min-score 0.6 ""
   # Group hits by score-band; pages above 0.6 to each other = candidate cluster
   ```
2. **LLM compare within cluster only** — never cross-cluster (cost). Sonnet system prompt:
   ```
   You are checking N wiki pages for factual contradictions. For each pair,
   report only ACTUAL conflicting claims (not just different phrasing).
   Output JSON: [{ pages: [a, b], claim_a, claim_b, severity: high|medium|low }]
   ```
3. **Render** findings into the report.

## Output

Always write to `plans/reports/wiki-lint-{YYMMDD-HHmm}.md`. **Never auto-fix**. Report sections:

```markdown
# Wiki Lint Report — {timestamp}

## Summary
- Broken wikilinks: N
- Orphan pages: N
- Stale frontmatter: N (cutoff: YYYY-MM-DD)
- Empty/near-empty: N
- Sync delta: N commits behind
- Contradictions (--deep only): N

## Broken Wikilinks
- `<source-page>` → `[[<missing-target>]]`  *(propose: rename to `[[<close-match>]]` OR create `<missing-target>.md`)*

## Orphan Pages
...

## Proposed Actions
*(human reviews, applies via standard editor)*
- ...
```

## Exit Codes

| Issues found | Exit |
|---|---|
| 0 | 0 |
| Any deterministic findings | 1 |
| `--deep` contradictions ≥ 1 high | 2 |

CI integrations can gate on exit code without reading the report.
