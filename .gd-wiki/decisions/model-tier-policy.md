---
title: "Model Tier Policy"
updated: 2026-05-01
tags: [category/decision, model-routing, cost-optimization, agents]
summary: "Agents declare a tier in frontmatter; a central models.yml maps tier to Claude model; bin/sync-models resolves and commits model: fields to prevent drift."
---

Agents declare a `tier:` in frontmatter; `plugins/glassdesk/config/models.yml` maps tier → model; `bin/sync-models` resolves and commits the `model:` field to every agent file.

## Problem

Triggering any glassdesk command starts the main Claude session at Opus. Heavy work (coding, scouting, simple edits) inherits Opus, causing high token cost. Manually setting `model:` in each agent is tedious and drifts when policy changes.

## Decision

Introduce a four-tier model policy. Agents declare `tier:` in frontmatter. A central `config/models.yml` maps tier → Claude model alias. `bin/sync-models` resolves tier → model and rewrites the `model:` field that Claude Code reads at dispatch time. A pre-commit hook prevents drift.

## Tiers

| Tier | Model | Use cases |
|---|---|---|
| `premium` | opus | Brainstorm, plan, spec, deep review, design judgment |
| `standard` | sonnet | Coding, refactoring, doc writing, structured analysis (e.g. `gd-implementer`, `gd-project-manager`, `gd-tester`) |
| `fast` | haiku | Trivial edits, simple scout, comment checks |
| `external` | sonnet (fallback) + gemini-2.5-flash CLI | High-volume scout via Gemini |

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
    model: opus  # change this; affects all premium agents
```

Then sync:

```bash
node plugins/glassdesk/bin/sync-models
```

Use `--check` to preview without writing. Use `--verbose` for per-agent logging.

## Manual Override

To pin a specific agent to a model regardless of tier policy, **omit `tier:`** from its frontmatter and set `model:` directly. `bin/sync-models` will WARN and skip that agent.

## Drift Guard

Optional pre-commit hook installed via:

```bash
bash plugins/glassdesk/scripts/install-dev-hooks.sh
```

Blocks commits when any agent's `model:` is out of sync with its `tier:`. Zero external dependencies.

## Consequences

- Changing model policy across all agents is now a one-file edit + one command
- New agents must declare `tier:` to be managed by the policy; missing `tier:` = WARN + skip (not error) to preserve manual override path
- Setting an unknown `tier:` produces ERROR + exit 1

## Related Pages

- [[ghost-agent-resolution]] — four agents were missing, causing silent policy bypass
- [[plugin-system]] — agent topology overview
