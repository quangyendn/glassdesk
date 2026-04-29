---
title: "Debugging and Fixing"
updated: 2026-04-29
tags: [category/feature, debugging, fixing, skill]
summary: "The debugging and fixing features provide systematic root cause analysis (/debug, /fix:hard) and fast recovery workflows (/fix) for bugs and test failures."
---

Glassdesk ships two overlapping but distinct skills for dealing with failures: `debugging` (systematic four-phase root cause tracing) and `fixing` (fast recovery + test-failure loop).

## Commands

| Command | Tier | Description |
|---|---|---|
| `/fix` | standard | Fast fix for known or obvious issues |
| `/fix:hard` | premium | Deep investigation, comprehensive fix |
| `/debug` | premium | Systematic debugging, root cause analysis |

## Debugging Skill

`/debug` activates the `debugging` skill, which uses a four-phase approach:

1. **Reproduce** — confirm the failure is deterministic
2. **Isolate** — narrow down the failing component or path
3. **Root cause** — trace to the originating defect
4. **Fix + verify** — apply fix, re-run, confirm clean

`gd-debugger` (premium/Opus) is dispatched for root cause work. The premium tier is chosen because root cause analysis has high false-positive cost — Opus reasoning reduces misdiagnosis.

## Fixing Skill

`/fix` activates the `fixing` skill and branches:

- **Fast fix** — direct edit for obvious single-cause issues; early-exit if tests already pass
- **Hard fix** — deep investigation delegating to `gd-debugger`
- **Test failure flow** — run tests → if fail: fix → re-run; repeat until clean or escalate

The test-failure branch has an explicit early-exit guard: if tests pass on the first run, the command exits immediately without running any agents.

## Related Pages

- [[building]] — building's test-driven loop calls the fixing skill on failures
- [[ghost-agent-resolution]] — how gd-debugger was added as a real agent
- [[model-tier-policy]] — why debugger is premium (Opus) tier
