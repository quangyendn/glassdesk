---
title: "Model Tier Policy"
updated: 2026-06-12
tags: [category/decision, model-routing, cost-optimization, agents]
summary: "Agents declare a tier in frontmatter; a central models.yml maps tier to Claude model and reasoning effort; bin/sync-models resolves and commits model:/effort: fields to prevent drift."
---

Agents declare a `tier:` in frontmatter; `plugins/glassdesk/config/models.yml` maps tier → model + effort; `bin/sync-models` resolves and commits the `model:` and `effort:` fields to every agent file.

## Problem

Triggering any glassdesk command starts the main Claude session at Opus. Heavy work (coding, scouting, simple edits) inherits Opus, causing high token cost. Manually setting `model:` in each agent is tedious and drifts when policy changes.

Effort is a second cost lever: Claude Code's session effort defaults to `high`, so routine subagents burn reasoning tokens they don't need, while critical agents never get `xhigh`. The per-subagent `effort:` frontmatter field overrides session effort while the agent runs.

## Decision

Introduce a tier policy covering both model and effort. Agents declare `tier:` in frontmatter. A central `config/models.yml` maps tier → Claude model alias + effort level. `bin/sync-models` resolves tier → model + effort and rewrites the `model:`/`effort:` fields that Claude Code reads at dispatch time. A pre-commit hook prevents drift.

Effort follows a **balanced policy**: `xhigh` only where misdiagnosis is costliest (`deep` = debugging), `high` for premium judgment work, real token savings on routine structured work (`standard` = `medium`, `light`/`external` = `low`).

## Tiers

| Tier | Model | Effort | Use cases |
|---|---|---|---|
| `deep` | opus | xhigh | Root-cause debugging (`gd-debugger`) — misdiagnosis cost justifies the spend-up |
| `premium` | opus | high | Brainstorm, plan, spec, deep review, design judgment, security review |
| `thorough` | sonnet | high | Sonnet review agents where missed findings are costly (e.g. `gd-rust-reviewer`) |
| `standard` | sonnet | medium | Coding, refactoring, doc writing, structured analysis (e.g. `gd-implementer`, `gd-tester`) |
| `light` | sonnet | low | Trivial analysis and status reporting needing tool use (e.g. `gd-comment-analyzer`, `gd-project-manager`) |
| `fast` | haiku | — | Trivial edits, simple scout, comment checks |
| `external` | sonnet (fallback) + gemini-2.5-flash CLI | low | High-volume scout via Gemini |

**Haiku caveat:** effort is supported on Sonnet 4.6+, Opus 4.6+, and Fable — not Haiku. Tiers backed by haiku omit `effort:` in `models.yml`, and `bin/sync-models` removes any hand-added `effort:` field from agents in those tiers (self-healing).

## Options Considered

| Option | Decision | Rationale |
|---|---|---|
| Pre-resolve sync script (chosen) | ✅ | Simplest, deterministic, no Claude Code internals dependency |
| Runtime PreToolUse hook resolution | ❌ rejected | Uncertain Claude Code support |
| Build-time generator pattern | ❌ rejected | Committed `model:` chosen for debuggability |
| Env var runtime override | ❌ deferred | Not needed in Phase 1 |
| Per-project policy override | ❌ deferred | Plugin-level only for now |

## How to Change Policy

Edit `plugins/glassdesk/config/models.yml`:

```yaml
tiers:
  premium:
    model: opus   # change these; affects all premium agents
    effort: high  # low | medium | high | xhigh | max; omit for haiku tiers
```

Then sync:

```bash
node plugins/glassdesk/bin/sync-models
```

Use `--check` to preview without writing. Use `--verbose` for per-agent logging.

## Manual Override

To pin a specific agent to a model/effort regardless of tier policy, **omit `tier:`** from its frontmatter and set `model:` (and optionally `effort:`) directly. `bin/sync-models` will WARN and skip that agent. To give one agent a different effort while staying policy-managed, move it to another tier (or add a tier) rather than hand-editing `effort:` — hand edits are reverted by the next sync.

## Drift Guard

Optional pre-commit hook installed via:

```bash
bash plugins/glassdesk/scripts/install-dev-hooks.sh
```

Blocks commits when any agent's `model:` or `effort:` is out of sync with its `tier:`. Zero external dependencies.

## Consequences

- Changing model or effort policy across all agents is now a one-file edit + one command
- New agents must declare `tier:` to be managed by the policy; missing `tier:` = WARN + skip (not error) to preserve manual override path
- Setting an unknown `tier:` or an invalid `effort:` value in `models.yml` produces ERROR + exit 1
- `gd-debugger` (`deep`) now runs at `xhigh` (deliberate spend-up vs the `high` session default); `standard` agents run at `medium` (token savings on the bulk of dispatches)

## Related Pages

- [[ghost-agent-resolution]] — four agents were missing, causing silent policy bypass
- [[plugin-system]] — agent topology overview
