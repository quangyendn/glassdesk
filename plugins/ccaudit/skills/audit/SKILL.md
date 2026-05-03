---
name: audit
description: Audit and optimize Claude Code setup to eliminate token overhead waste. Use when the user asks to audit Claude Code, optimize Claude Code, reduce token usage, hits Claude usage limits, complains "Claude got dumber", or mentions any of the 9 waste patterns (CLAUDE.md bloat, conversation re-reads, hook injection, cache misses, skill loading, MCP tool definitions, extended thinking, wrong-direction generation, plugin auto-update). Triggers on phrases like "audit claude code", "optimize claude code", "claude code usage limit", "claude code expensive", "claude code waste", "tối ưu claude code", "kiểm tra claude code".
---

# Claude Code Audit Skill

Detect and eliminate the 9 invisible token-waste patterns that consume up to 73% of Claude Code spend before a prompt is even read.

## When to use

Trigger this skill when the user wants to:
- Audit their Claude Code setup
- Reduce Claude Code token usage / cost
- Diagnose why they hit usage limits faster than expected
- Investigate "Claude got dumber" complaints (usually overhead bloat, not the model)
- Get a baseline health-check of CLAUDE.md, hooks, plugins, skills, MCPs
- Apply the 9 known waste-pattern fixes systematically

## Workflow

Follow these phases in order. Do NOT skip the diagnostic phase — recommendations without measurements are guesses.

### Phase 1 — Diagnose (always run first)

Run the audit script to capture the current state of all 9 patterns:

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.sh
```

The script prints a structured report covering:
1. CLAUDE.md size (user + project level)
2. Active hooks (UserPromptSubmit, SessionStart, PreToolUse)
3. Installed plugins
4. Installed skills
5. Connected MCP servers
6. Recent session token usage (if logs available)

Read the full output before recommending anything. If a section returns empty (e.g. no logs, no project-level CLAUDE.md), note it explicitly — don't infer.

### Phase 2 — Map findings to patterns

For each of the 9 patterns, classify the user's setup as PASS / WARN / FAIL using the thresholds in `${CLAUDE_PLUGIN_ROOT}/skills/audit/references/patterns.md`. Use this table format:

| # | Pattern | Status | Measured | Target |
|---|---------|--------|----------|--------|

Be specific with numbers. "Your CLAUDE.md is 4,800 tokens" beats "your CLAUDE.md is large".

### Phase 3 — Recommend fixes (prioritized)

Rank fixes by estimated token savings per pattern (see `${CLAUDE_PLUGIN_ROOT}/skills/audit/references/patterns.md` for the cost share). Present them as an ordered checklist, highest impact first. For each fix:
- State the exact action (commands, file edits)
- State the expected savings
- State whether it's reversible

Pull concrete fix steps from `${CLAUDE_PLUGIN_ROOT}/skills/audit/references/fixes.md`.

### Phase 4 — Verify & schedule re-audit

After the user applies fixes, re-run `${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.sh` to confirm the deltas. Suggest scheduling a weekly re-audit — overhead creep is the default state.

## Reference files

- `${CLAUDE_PLUGIN_ROOT}/skills/audit/references/patterns.md` — The 9 patterns, cost share, thresholds, and detection logic
- `${CLAUDE_PLUGIN_ROOT}/skills/audit/references/fixes.md` — Concrete fix recipes for each pattern
- `${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.sh` — The diagnostic script
- `${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/analyze-session.py` — Deeper per-session analysis (optional, when logs exist)

## Output expectations

Always finish with:
1. A one-line summary of total estimated savings (e.g. "Estimated 38% token reduction available")
2. The top 3 fixes ranked by impact
3. An offer to walk through applying them one by one

Never produce a wall of text without numbers. The whole point of this skill is to replace vibes with measurements.
