---
title: "Model Tier Drift"
updated: 2026-06-12
tags: [category/risk, model-routing, agents, drift]
summary: "Agent model:/effort: fields can drift from their tier: declaration if bin/sync-models is not run after models.yml or agent frontmatter changes; the optional pre-commit hook prevents this."
---

Agent `model:` and `effort:` fields can silently drift from their `tier:` declaration if `bin/sync-models` is not run after changing `models.yml` or agent frontmatter. The result is agents running at an unintended model or reasoning effort without any error.

## Risk

A developer adds a new agent with `tier: premium` but forgets to run `bin/sync-models`. The agent's `model:`/`effort:` fields are either absent (Claude Code falls back to session model and effort) or set to stale values (wrong tier). The diff shows only `tier: premium` but not `model: opus` / `effort: xhigh`, and reviewers may miss it. Effort drift is especially quiet: the agent still works, it just silently over- or under-spends reasoning tokens.

## Mitigation Options

### Option 1: Pre-commit Hook (recommended, opt-in)

```bash
bash plugins/glassdesk/scripts/install-dev-hooks.sh
```

Installs a pre-commit hook that runs `bin/sync-models --check`. If any agent's `model:` or `effort:` is out of sync with its `tier:`, the commit is blocked with an actionable message. This includes a stray `effort:` on an agent whose tier defines none (haiku tiers don't support effort) — sync removes it.

### Option 2: Manual Sync

```bash
node plugins/glassdesk/bin/sync-models
```

Run after any change to `models.yml` or agent `tier:` field. Use `--check` to preview without writing.

### Option 3: PR Review

`bin/sync-models --check` can be added to CI. It exits 1 when drift is present, 0 when clean.

## Non-Error Cases

Missing `tier:` in an agent produces a WARN and the agent is skipped (not an error). This preserves the manual override path where `model:` is set directly. Unknown `tier:` values do produce ERROR + exit 1.

## See Also

- [[model-tier-policy]] — the tier system and sync mechanism
