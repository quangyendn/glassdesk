---
title: "Wiki Curator Boundary Escape"
updated: 2026-04-29
tags: [category/risk, wiki, curator, boundary]
summary: "The wiki curator agent could write files outside .gd-wiki/ if it hallucinates paths; a post-run boundary check using git status --porcelain catches and reverts any such files before they are committed."
---

The `gd-wiki-curator` agent could, if it hallucinated a target path, write or modify files outside `.gd-wiki/`. The `/wiki:update` command enforces a hard post-run boundary check to catch and revert any such writes before the user commits.

## Risk

An LLM agent given Write and Edit tools can produce an incorrect path. A curator that writes to `src/auth/auth-flow.md` instead of `.gd-wiki/features/auth-flow.md` would corrupt source code with wiki content.

## Mitigation: Post-Run Boundary Check

`/wiki:update` runs `git status --porcelain` after the curator exits, covering both tracked-modified and untracked files (the curator could create new files outside `.gd-wiki/`):

```bash
OUTSIDE=$(git status --porcelain | sed -E 's/^.{2,3} //' | grep -vE '^"?\.gd-wiki/')
if [ -n "$OUTSIDE" ]; then
  # Revert tracked-modified
  git checkout HEAD -- <tracked files>
  # Remove untracked files curator created outside .gd-wiki/
  rm -rf -- <untracked files>
  exit 1
fi
```

The check fails hard (exit 1) and does not proceed to re-index or pointer advance.

## Curator Prompt Enforcement

The curator's system prompt explicitly states: "every Edit/Write call MUST target a path under `.gd-wiki/`. Reject anything else." The post-run check is defense-in-depth, not a replacement for the prompt constraint.

## See Also

- [[wiki-maintainer]] — full update workflow
