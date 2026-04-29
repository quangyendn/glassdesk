---
title: "Code Review"
updated: 2026-04-29
tags: [category/feature, code-review, agents, skill]
summary: "The code review feature provides PR analysis and adherence checks via /review:pr, powered by the code-review skill and specialized reviewer agents."
---

The code review feature provides structured PR review and code adherence checks, powered by the `code-review` skill.

## Commands

| Command | Description |
|---|---|
| `/review:pr` | Comprehensive PR review using specialized review agents |

## Reviewer Agents

| Agent | Tier | Focus |
|---|---|---|
| `gd-code-reviewer` | premium (Opus) | Adherence to project guidelines and CLAUDE.md |
| `gd-silent-failure-hunter` | premium (Opus) | Detect silent failures and inadequate error handling |
| `gd-type-design-analyzer` | premium (Opus) | Type design quality, encapsulation, invariants |
| `gd-comment-analyzer` | standard (Sonnet) | Comment accuracy and long-term maintainability |
| `gd-pr-test-analyzer` | standard (Sonnet) | PR test coverage analysis |
| `gd-code-simplifier` | standard (Sonnet) | Simplify code for clarity and maintainability |

The premium-tier assignment for `gd-code-reviewer`, `gd-silent-failure-hunter`, and `gd-type-design-analyzer` reflects the design judgment needed for correctness and architectural concerns. `gd-code-simplifier` was intentionally downgraded from Opus to Sonnet — coding/refactor work, Opus is overkill.

## Request vs Receive

The code-review skill includes two modes:

- **Requesting a review** — guidance for asking another agent or human to review your code
- **Receiving a review** — verification gates after review feedback is provided

## Related Pages

- [[model-tier-policy]] — tier assignments for reviewer agents
