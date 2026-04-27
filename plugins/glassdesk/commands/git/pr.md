---
description: Create a pull request
argument-hint: [to-branch] [from-branch]
---

Use `git-manager` agent to create a pull request.

Pass:
- `TO_BRANCH`: $1 (default `main`)
- `FROM_BRANCH`: $2 (default current branch)

Agent must analyze REMOTE diff (`git diff <remote>/<TO>...<remote>/<FROM>`),
not local WIP. Push current branch first if unpushed. Generate conventional-commit
title and structured body, then run `gh pr create`. Return PR URL.
