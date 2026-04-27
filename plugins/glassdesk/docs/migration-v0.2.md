# Glassdesk v0.2.0 Migration Guide

v0.2.0 is a **breaking-change release**. 21 commands were removed; 3 new compound-engineering commands were added. The taxonomy was restructured from 40 commands across 9 ad-hoc groups to 23 across 8 SDLC phases.

## Quick migration

```bash
bash plugins/glassdesk/bin/migrate-glassdesk-v0.2.sh
```

## Full command mapping

| Old command | New command | Notes |
|-------------|-------------|-------|
| `/plan:fast` | `/plan` | Renamed; same behavior |
| `/plan:two` | _(deleted)_ | Aspirational, not used in practice |
| `/plan:parallel` | `/plan:hard` | Parallelism handled internally |
| `/plan:ci` | `/fix` or `/debug` | Depends on intent |
| `/code:no-test` | `/code` | Test step optional via prompt |
| `/code:parallel` | `/code:auto` | Parallel execution in auto mode |
| `/fix:fast` | `/fix` | Renamed |
| `/fix:test` | `/fix` | Merged; pass test failure description as input |
| `/fix:logs` | `/debug` | Debug handles log analysis |
| `/fix:types` | `/fix` | Type errors are general fixes |
| `/fix:ui` | `/fix` | UI fixes are general fixes |
| `/fix:ci` | `/fix` or `/debug` | Depends on intent |
| `/fix:parallel` | `/fix:hard` | Deep investigation mode |
| `/git:merge` | `git merge` | Use raw git command |
| `/docs:init` | _(deleted)_ | Out of scope — software dev only |
| `/docs:update` | _(deleted)_ | Out of scope — software dev only |
| `/review:codebase` | `/scout` | Renamed |
| `/write` | _(deleted)_ | Out of scope — software dev only |
| `/write:micro` | _(deleted)_ | Out of scope |
| `/write:pyramid` | _(deleted)_ | Out of scope |
| `/write:synthesis` | _(deleted)_ | Out of scope |

## New commands

| Command | Description |
|---------|-------------|
| `/spec [topic]` | Run after `/brainstorm` to formalize output into `docs/specs/{YYMMDD}-{slug}.md` |
| `/learn` | Parse current session JSONL, extract insights, write to `.glassdesk-knowledge/` |
| `/improve [--plugin\|--project]` | Generate improvement proposal to `plans/improvements/` — never auto-applied |

## Breaking change rationale

**Why 40 → 23?** Half the commands were aspirational (never used), had confusing overlaps (`/fix:logs` vs `/debug`), or were out of scope for a software-dev toolkit (writing, docs generation). Collapsing variants into a single command with routing logic reduces cognitive load and maintenance surface.

**Why restructure into 8 SDLC phases?** The old 9 ad-hoc groups had no conceptual model. The new DISCOVER→PLAN→BUILD→VERIFY→REVIEW→SHIP→COMPOUND taxonomy maps to how developers actually work and makes command selection obvious.

**Why remove `/write` and `/docs`?** Glassdesk is a software development toolkit. Writing assistance and docs generation are out of scope and better served by general-purpose AI tools.

## Knowledge base note

`.glassdesk-knowledge/` is **local-only and gitignored by design**. Each developer builds their own. To share learnings across a team, manually copy files or commit explicitly after reviewing content.
