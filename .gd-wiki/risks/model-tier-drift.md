---
title: "Model Tier Drift"
updated: 2026-04-29
tags: [category/risk, model-routing, agents, drift]
summary: "Agent model: fields can drift from their tier: declaration if bin/sync-models is not run after models.yml or agent frontmatter changes; the optional pre-commit hook prevents this."
---

Agent `model:` fields can silently drift from their `tier:` declaration if `bin/sync-models` is not run after changing `models.yml` or agent frontmatter. The result is agents running at an unintended model without any error.

## Risk

A developer adds a new agent with `tier: premium` but forgets to run `bin/sync-models`. The agent's `model:` field is either absent (Claude Code falls back to session model) or set to a stale value (wrong tier). The diff shows only `tier: premium` but not `model: opus`, and reviewers may miss it.

## Mitigation Options

### Option 1: Pre-commit Hook (recommended, opt-in)

```bash
bash plugins/glassdesk/scripts/install-dev-hooks.sh
```

Installs a pre-commit hook that runs `bin/sync-models --check`. If any agent's `model:` is out of sync with its `tier:`, the commit is blocked with an actionable message.

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
