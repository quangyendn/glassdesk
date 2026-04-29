---
title: "Ghost Agent Resolution"
updated: 2026-04-29
tags: [category/decision, agents, model-routing, infra]
summary: "Four agents referenced by skills but missing from agents/ were created to close silent fallback holes where Claude used general-purpose Sonnet instead of the intended tier-policy model."
---

Four agents (`debugger`, `planner`, `project-manager`, `tester`) were referenced by skills and commands but missing from `agents/`, causing Claude to fall back to general-purpose Sonnet and bypass the [[model-tier-policy]] entirely.

## Problem

After the tier policy shipped in Phase 1, an audit found four "GHOST" agents — names referenced in skill dispatch calls with no corresponding agent file. When dispatched, Claude Code fell back silently to the main session model (Sonnet or Opus depending on context) instead of routing through the intended tier.

## Decision

Create all four missing agents with appropriate tiers. Half-measures (e.g., aliasing, generic fallback agents) would leave tier inconsistency. Each agent was ~30 lines.

## Agents Created

| Agent | Tier | Rationale |
|---|---|---|
| `gd-debugger` | premium (Opus) | Root cause analysis has high false-positive cost; Opus reasoning reduces misdiagnosis |
| `gd-planner` | premium (Opus) | Synthesis quality matters; main thread is orchestrate-only to avoid 2x Opus spend |
| `gd-project-manager` | standard (Sonnet) | Task extraction is mostly mechanical; Sonnet sufficient |
| `gd-tester` | standard (Sonnet) | Test runs are Bash; failure interpretation needs medium judgment; Haiku risks missing subtle failures |

## Planner Double-Spend Mitigation

When `gd-planner` (premium) is dispatched from `/plan:hard` (which also runs as Opus in the main thread), the planning skill was updated so the main thread acts as orchestrator only — it does not write plan content. This prevents 2x Opus token spend.

## Related Pages

- [[model-tier-policy]] — the tier system these agents now participate in
- [[plugin-system]] — agent dispatch architecture
