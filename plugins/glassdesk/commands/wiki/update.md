---
description: ⚡⚡ Distill commits since last sync into wiki edits (main only); re-index QMD; advance pointer
argument-hint: [--dry-run]
---

Activate the `wiki` skill. Load `references/maintaining.md` (full workflow) and `references/cost-budget.md` (token budget pre-flight).

Dispatch the LLM-bound distill step to the `gd-wiki-curator` subagent. Do everything else (pre-flight, diff parse, re-index, pointer advance, post-run check) in this command via Bash. NEVER run the curator without all pre-flight gates passing.

## Variables

- `DRY_RUN`: $1 == `--dry-run` → run pre-flight + diff parse + curator dispatch, but skip writes (curator outputs proposed edits only) and skip re-index + pointer advance.

## Pre-flight (abort on first failure)

```bash
# 1. Wiki initialized?
[ -f .gd-wiki/.config.json ] || { echo "ERROR: .gd-wiki/.config.json missing. Run /wiki:init first."; exit 1; }

# 2. On the configured main branch?
MAIN=$(jq -r '.sync.main_branch' .gd-wiki/.config.json)
HEAD_BRANCH=$(git rev-parse --abbrev-ref HEAD)
[ "$HEAD_BRANCH" = "$MAIN" ] || {
  echo "ERROR: /wiki:update runs only on '$MAIN' (currently on '$HEAD_BRANCH')."
  echo "Hint: edit .gd-wiki/.config.json::sync.main_branch to override."
  exit 1
}

# 3. last_synced_commit reachable?
LAST=$(jq -r '.sync.last_synced_commit' .gd-wiki/.config.json)
if [ "$LAST" = "null" ] || [ -z "$LAST" ]; then
  # First-time run — use root commit or merge-base with origin
  LAST=$(git rev-list --max-parents=0 HEAD | tail -1)
  echo "First sync — anchoring at root commit ${LAST:0:8}"
elif ! git cat-file -e "$LAST^{commit}" 2>/dev/null; then
  FALLBACK=$(git merge-base origin/"$MAIN" HEAD~50 2>/dev/null || git merge-base origin/"$MAIN" HEAD)
  echo "WARN: $LAST unreachable (rebase/squash?). Fall back to merge-base ${FALLBACK:0:8}? [Y/n]"
  # Use AskUserQuestion in actual run; honor user choice
  LAST="$FALLBACK"
fi

HEAD_SHA=$(git rev-parse HEAD)

# 4. Diff non-empty after stop_paths filter?
STOP=$(jq -r '.sync.stop_paths // [] | join("|")' .gd-wiki/.config.json)
git diff --stat "$LAST..$HEAD_SHA" | grep -vE "^\s*(${STOP})" > /tmp/wiki-diff-stat.txt
[ -s /tmp/wiki-diff-stat.txt ] || { echo "Wiki up to date (no curator-relevant changes since ${LAST:0:8})."; exit 0; }

git log --name-only --pretty=format:'COMMIT|%H|%s' "$LAST..$HEAD_SHA" > /tmp/wiki-commit-log.txt
```

## Token Budget Pre-flight

```bash
EST=$(node -e 'console.log(Math.ceil(require("fs").statSync("/tmp/wiki-diff-stat.txt").size / 3.5))')
MAX=$(jq -r '.query.max_tokens // 1000000' .gd-wiki/.config.json)
[ "$EST" -gt "$MAX" ] && {
  echo "ABORT: estimated $EST tokens exceeds budget $MAX."
  echo "Hint: split via 'git rev-list ${LAST:0:8}..HEAD | split -l N' and call /wiki:update per chunk."
  exit 1
}
```

## Curator Dispatch

Invoke the `gd-wiki-curator` subagent with this prompt:

```
You are operating on plan: <project>. Distill the diff into wiki edits.

Inputs:
- Diff stat: /tmp/wiki-diff-stat.txt
- Commit log: /tmp/wiki-commit-log.txt
- Config: cat .gd-wiki/.config.json
- Existing pages: find .gd-wiki -name "*.md" -not -path "*/manual/*"

Diff range: ${LAST:0:8}..${HEAD_SHA:0:8}
Mode: $( [ "$DRY_RUN" = "--dry-run" ] && echo "DRY-RUN — output proposed edits only, do not write" || echo "WRITE" )

Follow the wiki skill's references/maintaining.md (distill loop) and references/obsidian-conventions.md (categories, frontmatter). Boundary: every Edit/Write must target .gd-wiki/.

Return the list of edited paths + 1-line summary each.
```

Wait for curator to complete. Capture its output.

## Post-Curator Boundary Check

Cover BOTH tracked-modified AND untracked files (curator could create new files outside `.gd-wiki/`). `git status --porcelain` reports both with a 2-char status prefix.

```bash
# Status format: "XY path" — strip prefix, find anything not under .gd-wiki/
OUTSIDE=$(git status --porcelain | sed -E 's/^.{2,3} //' | grep -vE '^"?\.gd-wiki/')

if [ -n "$OUTSIDE" ]; then
  echo "ERROR: curator wrote outside .gd-wiki/. Reverting:"
  printf '%s\n' "$OUTSIDE"
  # Revert tracked-modified
  printf '%s\n' "$OUTSIDE" | while IFS= read -r p; do
    [ -z "$p" ] && continue
    if git ls-files --error-unmatch -- "$p" >/dev/null 2>&1; then
      git checkout HEAD -- "$p"
    else
      rm -rf -- "$p"   # untracked — remove
    fi
  done
  exit 1
fi
```

This catches: (1) modified files outside `.gd-wiki/`, (2) untracked files curator created outside `.gd-wiki/`. Filenames with spaces are preserved via `IFS= read`.

If `$DRY_RUN`, stop here — print curator output, do NOT re-index or advance pointer.

## Re-index

```bash
COLL=$(jq -r '.query.qmd_collection' .gd-wiki/.config.json)
qmd update -c "$COLL" || { echo "ERROR: qmd update failed"; exit 1; }
qmd embed              # global; intentional; documented in cost-budget.md
```

## Pointer Advance

```bash
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
jq --arg sha "$HEAD_SHA" --arg ts "$NOW" \
   '.sync.last_synced_commit = $sha | .sync.last_synced_at = $ts' \
   .gd-wiki/.config.json > .gd-wiki/.config.json.tmp
mv .gd-wiki/.config.json.tmp .gd-wiki/.config.json
```

## Output

```
✓ Wiki synced ${LAST:0:8} → ${HEAD_SHA:0:8}
  Edited: <N> pages (curator output above)
  Re-indexed: collection $COLL
  Pointer: sync.last_synced_commit = ${HEAD_SHA:0:8}

Suggested commit: chore(wiki): sync to ${HEAD_SHA:0:8}
```

User stages + commits the wiki changes themselves. The command never auto-commits.
