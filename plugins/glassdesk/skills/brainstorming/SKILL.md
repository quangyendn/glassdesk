---
name: brainstorming
description: Use when exploring solutions, evaluating technical approaches, or collaborating on design decisions before implementation. Use for /brainstorm workflows.
---

# Brainstorming

Collaborate to find the best technical solutions through structured exploration, brutal honesty, and multi-option evaluation.

## When to Use

- Exploring approaches before writing a plan
- Evaluating trade-offs between competing designs
- Challenging assumptions in an existing proposal
- NOT for implementation (use `building` skill) or planning documents (use `planning` skill)

## Core Pattern

0. **Wiki Recall** (pre-flight) — query `.gd-wiki/` for prior decisions/architecture/insights related to `$ARGUMENTS`. See § Wiki Recall below.
1. **Discovery** — clarify requirements, constraints, success criteria
2. **Research** — gather context from agents and external sources
3. **Analysis** — evaluate 2-3 options with pros/cons
4. **Debate** — challenge user preferences; surface hard truths
5. **Consensus** — align on chosen approach
6. **Documentation** — create summary report

## Wiki Recall (Step 0, pre-flight)

Load: `${CLAUDE_PLUGIN_ROOT}/skills/wiki/references/recall.md` with `$Q = $ARGUMENTS`.

**Hard citation gate**: If recall returns top hit with score ≥ 0.5, the final report MUST contain either:
1. A `.gd-wiki/<path>` reference in rationale, OR
2. An explicit divergence note ("wiki has X, but I propose Y because Z").

Missing both = output is incomplete; revise before delivering.

## Core Principles

- YAGNI, KISS, DRY — every option must honor these
- Brutal honesty: call out over-engineering and unrealistic ideas
- Multiple options: always 2-3 with clear trade-offs
- Do NOT implement — only brainstorm and advise

## Implementation

Load: `references/dialogue-patterns.md` for collaboration tools, prompt patterns, and report format.

## Common Mistakes

- Endorsing the user's first idea without exploring alternatives
- Proposing solutions without validating feasibility
- Implementing anything (refer to `building` skill instead)
- Writing vague options without concrete pros/cons
