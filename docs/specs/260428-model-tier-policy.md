---
date: 2026-04-28
status: draft
tags: [model-routing, cost-optimization, agents, infra]
---

# Spec: Model Tier Policy for AIDLC Workflow

## Problem

Triggering any glassdesk command starts the main Claude session in Opus 4.7. Heavy work (coding, scouting, simple edits) inherits Opus, causing high token cost. Manually setting `model:` in each of 10+ agent frontmatters is tedious and drifts when policy changes.

## Proposed Solution

Introduce a tier-based model policy. Agents declare `tier:` in frontmatter (`premium` / `standard` / `fast` / `external`). A central `config/models.yml` maps tier → Claude model. Sync script `bin/sync-models` resolves `tier:` and rewrites the `model:` field that Claude Code reads. Pre-commit hook prevents drift. External tier shells out to Gemini CLI (`gemini-2.5-flash`) for high-volume scout work.

## Scope

**In scope:**
- 4 tiers: `premium` (opus), `standard` (sonnet), `fast` (haiku), `external` (sonnet fallback + gemini-2.5-flash CLI)
- `plugins/glassdesk/config/models.yml` — single source of truth for tier → model mapping
- `plugins/glassdesk/bin/sync-models` — Node.js script with `--check` and `--verbose` modes
- Add `tier:` field to all existing agents in `plugins/glassdesk/agents/`
- Pre-commit hook running `bin/sync-models --check`
- Documentation: README section explaining tier system

**Out of scope:**
- Phase 2 — auditing skills/commands to enforce delegation via Task tool (separate spec when ready)
- Env var runtime override (e.g., `GLASSDESK_TIER_PREMIUM=sonnet`)
- Per-project policy override (plugin-level only for now)
- Expanding Gemini beyond `scout-external` agent
- Build-time generator pattern (rejected — committed `model:` chosen for debuggability)
- Runtime PreToolUse hook resolution (rejected — uncertain Claude Code support)

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Pain point optimized | Token cost | User-stated primary concern |
| Switch mechanism | Subagent dispatch via Task tool | Main thread cannot change model mid-session |
| Implementation pattern | Pre-resolve sync script (Approach 1) | Simplest, deterministic, no Claude Code internals dep |
| Source of truth | `tier:` in agent frontmatter + `models.yml` | Locality of info per agent, central mapping for policy |
| `model:` field | Auto-synced, committed to repo | Claude Code reads it directly, no build step needed |
| Sync script language | Node.js | Project already requires Node 18+, no extra runtime |
| Drift protection | Pre-commit hook (`--check` mode) | Ensures repo never has out-of-sync agents |
| Gemini integration | Only `scout-external` agent, CLI shell-out | Single-point integration, avoid dual-maintaining prompts |
| External CLI model | `gemini-2.5-flash` | User explicitly chose this |
| External tier fallback | Sonnet (when Gemini CLI absent) | Allows agent to function without Gemini install |
| Tier names | `premium` / `standard` / `fast` / `external` | Business-level vocabulary, not Claude-specific |

## Tier Mapping (initial)

| Agent | Tier |
|-------|------|
| `code-reviewer` | premium |
| `silent-failure-hunter` | premium |
| `type-design-analyzer` | premium |
| `researcher` | standard |
| `pr-test-analyzer` | standard |
| `code-simplifier` | standard |
| `comment-analyzer` | standard |
| `docs-manager` | standard |
| `scout` | fast |
| `scout-external` | external |

## Open Questions

- 11th agent identification — listing showed 10, README claims 11; verify during implementation
- External tier fallback semantics — silent fallback to Sonnet or fail loud when Gemini CLI absent? Affects DX in CI/fresh-clone
- Env var override deferred — confirm not needed in Phase 1
- Per-project policy override deferred — plugin-level only acceptable?

## Acceptance Criteria

- [ ] `plugins/glassdesk/config/models.yml` exists with 4 tiers and matches schema in spec
- [ ] All agents in `plugins/glassdesk/agents/` have `tier:` field in frontmatter
- [ ] All agents' `model:` field matches `models.yml[tier].model`
- [ ] `bin/sync-models` runs without error on clean repo, exits 0
- [ ] `bin/sync-models --check` exits 0 when synced, exit 1 when drift introduced
- [ ] Manually setting wrong `model:` and running `bin/sync-models` corrects it
- [ ] Setting unknown `tier:` produces clear ERROR with exit 1
- [ ] Missing `tier:` produces WARN, agent untouched (manual override path preserved)
- [ ] Pre-commit hook blocks commit when drift present, with actionable message
- [ ] `scout-external` agent body references `gemini-2.5-flash` and gracefully handles `gemini` CLI missing
- [ ] README documents tier system, how to change policy, and override path
