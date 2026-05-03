---
name: audit
description: Audit and optimize Claude Code setup to eliminate token overhead waste and best-practice gaps. Use when the user asks to audit Claude Code, optimize Claude Code, reduce token usage, hits Claude usage limits, complains "Claude got dumber", or mentions any of the 20 patterns (9 cost overhead: CLAUDE.md bloat, conversation re-reads, hook injection, cache misses, skill loading, MCP tool definitions, extended thinking, wrong-direction generation, plugin auto-update; 11 compliance: content quality, @-imports scope, scope split, permissions, CLI tools, skill frontmatter, subagents, personality instructions, linter rules, duplicate rules, auto-memory). Triggers on phrases like "audit claude code", "optimize claude code", "claude code usage limit", "claude code expensive", "claude code waste", "tối ưu claude code", "kiểm tra claude code".
---

# Claude Code Audit Skill

Detect and eliminate 20 patterns across 2 tiers — 9 cost-overhead patterns that consume up to 73% of Claude Code spend before a prompt is even read, plus 11 best-practice compliance checks derived from Anthropic's official guidelines.

## When to use

Trigger this skill when the user wants to:
- Audit their Claude Code setup
- Reduce Claude Code token usage / cost
- Diagnose why they hit usage limits faster than expected
- Investigate "Claude got dumber" complaints (usually overhead bloat, not the model)
- Get a baseline health-check of CLAUDE.md, hooks, plugins, skills, MCPs, and compliance posture
- Apply the 20 known pattern fixes systematically (9 cost / 11 compliance)

## Workflow

Follow these phases in order. Do NOT skip the diagnostic phase — recommendations without measurements are guesses.

### Phase 1 — Diagnose (always run first)

Run the audit script to capture the current state of all 20 patterns (9 cost / 11 compliance):

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.sh
```

The script prints a 2-section structured report covering:
- Section A: Tier 1 — Cost Overhead (9 patterns with cost_share_pct, ranked by impact)
- Section B: Tier 2 — Best-Practice Compliance (11 patterns, PASS/WARN/FAIL/INFO)
- Top 3 Fixes block (ranked cost_share_pct desc → severity desc)
- Estimated savings summary (% of productive-token uplift available)

Read the full output before recommending anything. If a section returns empty (e.g. no logs, no project-level CLAUDE.md), note it explicitly — don't infer.

### Phase 2 — Map findings to patterns

The audit script auto-classifies all 20 patterns (9 cost / 11 compliance) as PASS / WARN / FAIL / INFO using the thresholds in each pattern's frontmatter. Review the output table:

| ID | Pattern | Status | Measured | Target |
|----|---------|--------|----------|--------|

Be specific with numbers. "Your CLAUDE.md is 4,800 tokens" beats "your CLAUDE.md is large". Consult `${CLAUDE_PLUGIN_ROOT}/skills/audit/references/patterns.md` for the full index.

### Phase 3 — Recommend fixes (prioritized)

The script emits a Top-3 Fixes block ranked by cost_share_pct desc → severity desc. Use that as the starting list. Present fixes as an ordered checklist, highest impact first. For each fix:
- State the exact action (commands, file edits)
- State the expected savings
- State whether it's reversible

Pull concrete fix steps from `${CLAUDE_PLUGIN_ROOT}/skills/audit/references/fixes.md`.

### Phase 4 — Verify & schedule re-audit

After the user applies fixes, re-run `${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.sh` to confirm the deltas. Suggest scheduling a weekly re-audit — overhead creep is the default state.

## Reference files

- `${CLAUDE_PLUGIN_ROOT}/skills/audit/references/patterns.md` — Index of all 20 patterns (9 cost / 11 compliance) with links to individual pattern files
- `${CLAUDE_PLUGIN_ROOT}/skills/audit/references/patterns/` — Individual pattern files (T1-01..T1-09, T2-01..T2-11), each with YAML frontmatter (id, tier, severity, detection, threshold, fix_ref)
- `${CLAUDE_PLUGIN_ROOT}/skills/audit/references/fixes.md` — Concrete fix recipes keyed by pattern id (#fix-T1-01 .. #fix-T2-11)
- `${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.sh` — The catalog-driven diagnostic script (yq + awk fallback)
- `${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/analyze-session.py` — Deeper per-session analysis (optional, when logs exist)

## Output expectations

Always finish with:
1. A one-line summary of total estimated savings (e.g. "Estimated 38% token reduction available")
2. The top 3 fixes ranked by impact
3. An offer to walk through applying them one by one

Never produce a wall of text without numbers. The whole point of this skill is to replace vibes with measurements.
