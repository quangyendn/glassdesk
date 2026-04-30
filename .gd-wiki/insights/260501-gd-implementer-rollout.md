---
title: gd-implementer rollout — execution-time learnings
date: 2026-05-01
session: d8799c9a-6572-43ad-a1eb-41f25656c143
tags: [building, plan-execution, wiki, git, agents]
types: [DECISION, MISTAKE, PATTERN]
---

# gd-implementer rollout — execution-time learnings

## Insights

### Wiki curator races with /code Edits on the same file
**Type:** PATTERN
Background wiki curator/linter modifies `.gd-wiki/**` files while `/code:auto` is running a phase that also edits them. Two consecutive `Edit` calls on `building.md` failed with "File has been modified since read" because the curator updated the frontmatter between Read and Edit. Mitigation: when editing wiki pages during a phase, expect to Re-Read before each Edit retry; do not assume read-edit atomicity for `.gd-wiki/`.

> Evidence: `<tool_use_error>File has been modified since read, either by the user or by a linter</tool_use_error>` × 2 on `.gd-wiki/features/building.md`

---

### Doc descriptions of protocol can silently reverse semantics
**Type:** MISTAKE
Initial wiki copy described escalation as "debugger invoked before retry" while the source-of-truth in `building/SKILL.md` says "retry once with `retry_hint`, escalate `gd-debugger` only on retry exhaustion". The reversal slipped past until `gd-code-reviewer` cross-checked. Whenever wiki/doc text restates a protocol, diff it against the canonical skill/agent file before commit — paraphrasing is a known semantic-drift risk.

> Evidence: gd-code-reviewer Phase 03 review flagged "the wiki reverses the ordering (it implies debugger first, retry after)"

---

### `plans/` gitignore policy + already-tracked plan.md
**Type:** DECISION
With `.gitignore` entry `plans/` (trailing slash), new files under that directory are ignored, but `git add` on already-tracked files still succeeds with a warning. plan.md (added pre-policy) keeps receiving status updates; phase-N.md files born after the policy stay local-only. Don't reach for `-f` reflexively — try the plain `git add` first; if the file was tracked legacy, it goes through.

> Evidence: `git add plans/.../plan.md` printed `paths are ignored` warning yet staged the file (status `M  ` in column 1)

---

### Phase commit boundary requires explicit paths, never `-A`
**Type:** DECISION
Across all 3 phases, the working tree carried unrelated changes (wiki curator updates to 5+ pages, .gitignore policy edit, untracked website.md). Only `git add <explicit-path>` for files in the phase's `Files Touched` table kept the commit boundary clean. Reviewer at Phase 03 specifically flagged that two extra dirty wiki files would have leaked into the commit if not stopped.

> Evidence: gd-code-reviewer Phase 03: "stage only `building.md` for the Phase 03 commit (e.g. `git add .gd-wiki/features/building.md`) and handle the other five files in separate commits"

---

### Bootstrapping an agent the skill mandates: main thread executes Step 2 itself
**Type:** PATTERN
Phase 01 created `gd-implementer.agent.md` — the very agent that `building/SKILL.md` Step 2 (post-Phase 02) requires for first-draft edits. During this run the agent did not yet exist, so the main thread had to perform Step 2 work directly. The "MUST dispatch / MUST NOT edit" rule activates from the next `/code:auto` run onward. Treat "create-the-tool-that-mandates-itself" plans as bootstrap exceptions and document the cutover commit explicitly so future runs know which side of the rule they're on.

> Evidence: Phase 01 main-thread `Write` of `gd-implementer.agent.md` directly; only Phase 02 added the dispatch mandate to the skill
