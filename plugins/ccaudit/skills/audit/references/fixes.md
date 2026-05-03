# Fix Recipes — 20 Patterns (9 Cost / 11 Compliance)

Each recipe is the 30-second action that eliminates the pattern.
Apply Tier 1 fixes in order of cost share for maximum ROI.
Tier 2 fixes improve best-practice compliance.

---

## Tier 1 — Cost-Overhead Fixes

### fix-T1-01 — Trim CLAUDE.md (saves ~14%) {#fix-T1-01}

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

### fix-T1-02 — Cap conversation length (saves ~13%) {#fix-T1-02}

Habit fixes:
- Edit the prior message instead of stacking follow-ups (up-arrow → edit → re-send).
- Hard cap at 20 messages/session.
- When approaching the cap, ask Claude to summarize, then start fresh with that summary as message #1.
- Use `/compact` (preserves summary) over `/clear` (nukes everything).

**Reversible:** Yes — purely behavioral.
**Expected savings:** ~40% drop in per-turn re-read cost when going from 60-msg to 15-msg average.

---

### fix-T1-03 — Audit UserPromptSubmit hooks (saves ~11%) {#fix-T1-03}

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

### fix-T1-04 — Keep cache warm or upgrade lifetime (saves ~10%) {#fix-T1-04}

Options:
- **Free workaround:** Bind a hotkey to send a tiny ping prompt every < 4 minutes when breaks loom.
- **Paid plans:** Enable 1-hour cache lifetime. Cache writes are 2× base price (one-time on first write); reads are 0.1×. Pays for itself with > 10 resumes per session.

**Reversible:** Yes (config flag).
**Expected savings:** ~80% cache miss reduction in observed runs.

---

### fix-T1-05 — Disable unused skills (saves ~7%) {#fix-T1-05}

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

### fix-T1-06 — Cut MCP servers (saves ~6%) {#fix-T1-06}

```bash
/mcp                      # list connected
/mcp disable <server>     # current session
```

For permanent control, edit `~/.claude/settings.json` → remove unused entries from `mcpServers`. Re-enable per-session when needed.

**Target:** 3 always-on MCPs. Re-enable rest on demand.

**Reversible:** Yes — paste back into settings.json.
**Expected savings:** ~6,000 tokens per request when going from 12 → 3.

---

### fix-T1-07 — Default Extended Thinking OFF (saves ~5%) {#fix-T1-07}

In Claude Code settings, set Extended Thinking default = OFF.

Toggle ON per-message via Alt+T only when:
- Architecture decisions
- Complex debugging
- First attempt was unsatisfactory and a retry needs deeper reasoning

About 80% of tasks don't need it.

**Reversible:** Yes — flip the setting back.

---

### fix-T1-08 — Stop runaway generation early (saves ~4%) {#fix-T1-08}

Train the reflex:
- **Mac:** Cmd+. interrupts immediately. Claude keeps what it already wrote.
- **Win/Linux:** Ctrl+.
- **Terminal:** Double-Esc opens a checkpoint scroller — rewind to any prior state without re-running.

Watch the first 50 lines of every response. If it's drifting, kill it within 5 seconds.

**Reversible:** N/A — pure habit.
**Expected savings:** ~$15/month at typical Pro spend.

---

### fix-T1-09 — Trim SessionStart hooks (saves ~3%) {#fix-T1-09}

```bash
cat ~/.claude/settings.json | jq '.hooks.SessionStart'
```

Kill anything that's just a "loaded successfully" notification. Keep only:
- Branch context
- Required env vars

**Reversible:** Yes.
**Expected savings:** ~1,200 tokens per session start.

---

## Tier 2 — Best-Practice Compliance Fixes

### fix-T2-01 — Improve CLAUDE.md content quality {#fix-T2-01}

Replace vague meta-instructions with specific imperatives:
- "Remember to always X" → "X."
- "Important: never forget Y" → "Never Y."
- "Keep in mind Z" → remove or convert to a concrete rule.

Aim for imperative, specific, actionable instructions only. Every line should survive the question: "Is this actionable and non-obvious?"

---

### fix-T2-02 — Scope @-imports to small files {#fix-T2-02}

For each `@path` reference in CLAUDE.md:
1. Measure: `wc -w <target-file>`
2. If > ~1,150 words (1,500 tokens): extract only the relevant section into a smaller file.
3. Never `@`-import full API docs, READMEs, or changelogs.

Keep total resolved @-import content under 1,200 words combined.

---

### fix-T2-03 — Split CLAUDE.md by scope {#fix-T2-03}

Create both levels if missing:
- `~/.claude/CLAUDE.md` — cross-project preferences (coding style, commit conventions, language)
- `.claude/CLAUDE.md` — repo-specific rules (stack, team conventions, file layout)

Move any project-specific rules out of the user-level file.

---

### fix-T2-04 — Configure permissions allow-list {#fix-T2-04}

Add an explicit allow-list to `~/.claude/settings.json`:

```json
{
  "permissions": {
    "allow": ["Bash", "Read", "Edit", "Write"]
  }
}
```

Or enable sandbox mode for stricter isolation. Review and tighten the list quarterly.

---

### fix-T2-05 — Install missing CLI tools {#fix-T2-05}

Install `gh` CLI (required for most workflows):

```bash
brew install gh        # macOS
gh auth login
```

Optional stack-specific tools:
```bash
brew install awscli        # AWS workflows
brew install google-cloud-sdk  # GCP workflows
```

---

### fix-T2-06 — Fix SKILL.md frontmatter {#fix-T2-06}

Every `SKILL.md` must have both `name` and `description` in YAML frontmatter:

```yaml
---
name: my-skill
description: One sentence describing when Claude should invoke this skill.
---
```

Without these, Claude Code cannot discover the skill.

---

### fix-T2-07 — Consider adding subagent definitions {#fix-T2-07}

If you run parallel tasks frequently, create `.claude/agents/` with subagent spec files. This is informational — no action required if you don't use multi-agent workflows.

See Anthropic docs: claude.ai/code → subagents.

---

### fix-T2-08 — Remove personality framing {#fix-T2-08}

Search CLAUDE.md for phrases like "act as a senior engineer", "you are an expert", "be a principal":

```bash
grep -i -E '\b(be|act as|you are) (a |an )?(senior|expert|principal|10x|world-class)\b' ~/.claude/CLAUDE.md .claude/CLAUDE.md
```

Delete every match. Replace with specific behavioral rules instead ("Prefer typed over untyped code", "Always run tests before committing").

---

### fix-T2-09 — Remove duplicate linter rules from CLAUDE.md {#fix-T2-09}

If a linter config (`.eslintrc`, `.prettierrc`, `.editorconfig`, `ruff.toml`, `.rubocop.yml`) already enforces formatting:
1. Remove any mention of indent size, line length, trailing commas, or semicolons from CLAUDE.md.
2. Let the linter be the single source of truth.

This eliminates conflicting instructions and reduces CLAUDE.md token count.

---

### fix-T2-10 — Deduplicate user vs project rules {#fix-T2-10}

Find duplicate lines between the two files:

```bash
comm -12 \
  <(grep -v '^\s*$\|^#' ~/.claude/CLAUDE.md | sort -u) \
  <(grep -v '^\s*$\|^#' .claude/CLAUDE.md | sort -u)
```

For each duplicate: keep it in user-level only (applies everywhere) and delete from the project file. Project CLAUDE.md should hold only project-specific overrides.

---

### fix-T2-11 — Reconcile auto-memory with CLAUDE.md {#fix-T2-11}

Run `/memory` in Claude Code to review auto-saved entries. Compare with your CLAUDE.md rules:
- If an auto-memory entry duplicates a CLAUDE.md rule → delete the memory entry.
- If auto-memory has evolved beyond CLAUDE.md → promote the memory entry to an explicit CLAUDE.md rule, then delete the memory entry.

Goal: single SoT per rule.

---

## Verification

After applying fixes, re-run:

```bash
CLAUDE_PLUGIN_ROOT=/path/to/ccaudit bash ${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.sh
```

Compare against the pre-fix run. Track productive-token share over 7 days. Target: ≥ 60% productive (vs 27% baseline).
