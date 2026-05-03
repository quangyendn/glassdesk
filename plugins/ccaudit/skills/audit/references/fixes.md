# Fix Recipes — 9 Patterns

Each recipe is the 30-second action that eliminates the pattern. Apply in order of cost share for maximum ROI.

---

## Fix 1 — Trim CLAUDE.md (saves ~14%)

```bash
wc -w ~/.claude/CLAUDE.md
wc -w .claude/CLAUDE.md
```

If combined > 1,500 tokens (~1,200 words):
1. Move framework-specific rules into project-level `.claude/CLAUDE.md` (only loads in that project).
2. Extract repeated patterns into skills (loaded only when invoked).
3. Delete anything you can't remember writing.
4. Convert verbose "explain why" rules into 3-word imperatives.

**Reversible:** Yes (keep a `.bak`).
**Expected savings:** ~31% baseline reduction in observed runs.

---

## Fix 2 — Cap conversation length (saves ~13%)

Habit fixes:
- Edit the prior message instead of stacking follow-ups (up-arrow → edit → re-send).
- Hard cap at 20 messages/session.
- When approaching the cap, ask Claude to summarize, then start fresh with that summary as message #1.
- Use `/compact` (preserves summary) over `/clear` (nukes everything).

**Reversible:** Yes — purely behavioral.
**Expected savings:** ~40% drop in per-turn re-read cost when going from 60-msg to 15-msg average.

---

## Fix 3 — Audit UserPromptSubmit hooks (saves ~11%)

```bash
cat ~/.claude/settings.json | jq '.hooks.UserPromptSubmit'
cat .claude/settings.json   | jq '.hooks.UserPromptSubmit'
```

For each hook listed, ask: "Can I justify this firing on every prompt?" If no:

```bash
/plugin disable <plugin-name>
```

Keep at most one (e.g. git branch context).

**Reversible:** Yes — `/plugin enable <name>`.
**Expected savings:** ~5,800 tokens per prompt in observed runs.

---

## Fix 4 — Keep cache warm or upgrade lifetime (saves ~10%)

Options:
- **Free workaround:** Bind a hotkey to send a tiny ping prompt every < 4 minutes when breaks loom.
- **Paid plans:** Enable 1-hour cache lifetime. Cache writes are 2× base price (one-time on first write); reads are 0.1×. Pays for itself with > 10 resumes per session.

**Reversible:** Yes (config flag).
**Expected savings:** ~80% cache miss reduction in observed runs.

---

## Fix 5 — Disable unused skills (saves ~7%)

```bash
# 7-day audit of skills actually invoked
grep -h "skill_invoked" ~/.claude/logs/*.log | sort | uniq -c | sort -rn
```

Anything not in the output → disable:

```bash
/plugin disable <skill-name>
```

**Reversible:** Yes.
**Expected savings:** ~9,000 tokens per task when shrinking from 11 → 4 active skills.

---

## Fix 6 — Cut MCP servers (saves ~6%)

```bash
/mcp                      # list connected
/mcp disable <server>     # current session
```

For permanent control, edit `~/.claude/settings.json` → remove unused entries from `mcpServers`. Re-enable per-session when needed.

**Target:** 3 always-on MCPs. Re-enable rest on demand.

**Reversible:** Yes — paste back into settings.json.
**Expected savings:** ~6,000 tokens per request when going from 12 → 3.

---

## Fix 7 — Default Extended Thinking OFF (saves ~5%)

In Claude Code settings, set Extended Thinking default = OFF.

Toggle ON per-message via Alt+T only when:
- Architecture decisions
- Complex debugging
- First attempt was unsatisfactory and a retry needs deeper reasoning

About 80% of tasks don't need it.

**Reversible:** Yes — flip the setting back.

---

## Fix 8 — Stop runaway generation early (saves ~4%)

Train the reflex:
- **Mac:** Cmd+. interrupts immediately. Claude keeps what it already wrote.
- **Win/Linux:** Ctrl+.
- **Terminal:** Double-Esc opens a checkpoint scroller — rewind to any prior state without re-running.

Watch the first 50 lines of every response. If it's drifting, kill it within 5 seconds.

**Reversible:** N/A — pure habit.
**Expected savings:** ~$15/month at typical Pro spend.

---

## Fix 9 — Trim SessionStart hooks (saves ~3%)

```bash
cat ~/.claude/settings.json | jq '.hooks.SessionStart'
```

Kill anything that's just a "loaded successfully" notification. Keep only:
- Branch context
- Required env vars

**Reversible:** Yes.
**Expected savings:** ~1,200 tokens per session start.

---

## Verification

After applying fixes, re-run:

```bash
bash scripts/audit.sh
```

Compare against the pre-fix run. Track productive-token share over 7 days. Target: ≥ 60% productive (vs 27% baseline).
