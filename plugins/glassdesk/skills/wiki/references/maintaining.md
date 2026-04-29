# Maintaining

`/wiki:update` workflow — distill new commits since `last_synced_commit` into wiki pages on `main` only.

## Pre-flight Checks

All must pass before invoking the curator agent. Fail-fast with clear error.

| Check | Command | Fail action |
|---|---|---|
| On main branch | `git rev-parse --abbrev-ref HEAD` == `.config.json::sync.main_branch` | Refuse with hint to switch |
| QMD CLI installed | `command -v qmd` | Print install command, abort |
| QMD ≥ 2.1.0 | `qmd --version` | Print upgrade command, abort |
| `sync.last_synced_commit` reachable | `git cat-file -e <sha>^{commit}` | Fall back to `git merge-base origin/main HEAD~50`; prompt user to confirm anchor |
| Diff non-empty | `git rev-list --count <last>..HEAD` | If 0: print "wiki up to date", exit 0 |

## Diff Parse (CLI, no LLM)

```bash
LAST=$(jq -r '.sync.last_synced_commit' .gd-wiki/.config.json)
HEAD=$(git rev-parse HEAD)

# stop_paths from config — pipe-joined for grep -E
STOP=$(jq -r '.sync.stop_paths // [] | join("|")' .gd-wiki/.config.json)

# File-level summary
git diff --stat "$LAST..$HEAD" | grep -vE "^\s*(${STOP})" > /tmp/wiki-diff-stat.txt

# Commit list (for distill grouping)
git log --name-only --pretty=format:'COMMIT|%H|%s' "$LAST..$HEAD" > /tmp/wiki-commit-log.txt
```

If every changed file matches `stop_paths` → exit 0 with "no curator-relevant changes".

## Token Budget Pre-flight

See `cost-budget.md` for the procedure. Abort + report when estimate exceeds `.config.json::query.max_tokens` (default 1_000_000).

```bash
EST=$(node -e 'console.log(Math.ceil(require("fs").statSync("/tmp/wiki-diff-stat.txt").size / 3.5))')
MAX=$(jq -r '.query.max_tokens // 1000000' .gd-wiki/.config.json)
[ "$EST" -gt "$MAX" ] && { echo "diff exceeds token budget ($EST > $MAX); split into chunks via git rev-list"; exit 1; }
```

## Distill Loop (curator agent — Sonnet)

The `gd-wiki-curator` agent receives:

1. The two `/tmp/wiki-*.txt` files
2. List of existing pages: `find .gd-wiki -name "*.md" -not -path "*/manual/*"`
3. Config: `cat .gd-wiki/.config.json`

Curator produces a sequence of edits. Each edit is one of:
- **CREATE** new page in correct category (see `obsidian-conventions.md`)
- **UPDATE** existing page (must respect `<!-- manual -->` blocks)
- **NO-OP** when commit is purely cosmetic / refactor with no semantic delta

## Manual-Block Respect

`<!-- manual -->` opens a block the curator must skip. Block ends at:

1. Matching `<!-- /manual -->` (preferred, explicit), OR
2. Next H2 (`## `) at the same level

Curator implementation: when editing a page, parse blocks first → carve them out → operate on remainder → re-stitch.

## Re-index

After all edits applied:

```bash
COLL=$(jq -r '.query.qmd_collection' .gd-wiki/.config.json)
qmd update -c "$COLL"
qmd embed                       # NB: global; touches all collections; acceptable cost
```

## Pointer Advance

Only after re-index succeeds:

```bash
NEW=$(git rev-parse HEAD)
jq --arg sha "$NEW" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
   '.sync.last_synced_commit = $sha | .sync.last_synced_at = $ts' \
   .gd-wiki/.config.json > .gd-wiki/.config.json.tmp
mv .gd-wiki/.config.json.tmp .gd-wiki/.config.json
```

Commit pointer change with message `chore(wiki): sync to <short-sha>` so the next `/wiki:update` sees the advance.

## Post-run Verification

```bash
git diff --name-only | grep -v '^\.gd-wiki/' && {
  echo "ERROR: curator wrote outside .gd-wiki/ — reverting"
  git checkout HEAD -- $(git diff --name-only | grep -v '^\.gd-wiki/')
  exit 1
}
```

## Future Hooks (v2 placeholder)

- post-merge git hook → auto-trigger `/wiki:update`
- SessionEnd hook → batch unsynced sessions before EOD
- CI job on `main` → fail PR merge if `last_synced_commit` more than N commits behind

Out of scope for v0.3.0.
