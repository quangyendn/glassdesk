# The 9 Token-Waste Patterns

Each pattern is documented with: cost share of total tokens, detection signal, threshold, and root cause.
Source: 90-day, 430-hour, $1,340 instrumentation study.

Total measured overhead: 73% of input tokens were unproductive. After applying all fixes: productive share rose from 27% to ~65%.

## Pattern 1 — CLAUDE.md bloat (~14%)
- **Signal:** Combined user + project CLAUDE.md > 1,500 tokens (~1,200 words).
- **Why expensive:** Loaded every turn, every session. Multiplied by ~200 turns/week.
- **Detection:** `wc -w ~/.claude/CLAUDE.md .claude/CLAUDE.md`
- **Target:** Combined < 1,200 words.

## Pattern 2 — Conversation history re-reads (~13%)
- **Signal:** Sessions exceed 20 messages.
- **Why expensive:** Message N pays to re-tokenize messages 1..N-1. Cost grows linearly per turn → quadratic per session.
- **Detection:** Habit audit. No reliable log unless proxy is in place.
- **Target:** Hard cap 20 messages/session. Use `/compact` (not `/clear`) to retain summary.

## Pattern 3 — Hook injection waste (~11%)
- **Signal:** > 1 UserPromptSubmit hook fires on every prompt.
- **Why expensive:** Each hook injects context (branch, files, instinct, memory) before Claude reads the user prompt.
- **Detection:** `jq '.hooks.UserPromptSubmit' ~/.claude/settings.json`
- **Target:** ≤ 1 hook (e.g. only git branch context).

## Pattern 4 — Cache miss on session resume (~10%)
- **Signal:** Default 5-minute prompt cache expires during breaks.
- **Why expensive:** System prompt + CLAUDE.md + tools schema re-tokenize at full price (vs 0.1× cache read).
- **Detection:** Compare first vs subsequent message latency after a break.
- **Target:** Upgrade to 1-hour cache lifetime on paid plans, or warm cache with a ping if breaks > 4 min.

## Pattern 5 — Skill loading on irrelevant tasks (~7%)
- **Signal:** > 5 active skills with auto-invoke.
- **Why expensive:** Each SKILL.md is 800-2,500 tokens. Conservative auto-load = "when in doubt, load".
- **Detection:** `ls ~/.claude/skills/` and grep invocation logs.
- **Target:** 3-5 skills matching daily work.

## Pattern 6 — "Just in case" tool definitions (~6%)
- **Signal:** > 4 always-on MCP servers.
- **Why expensive:** Each MCP ships its full tool schema (~600-1,200 tokens) on every request.
- **Detection:** `jq '.mcpServers | keys' ~/.claude/settings.json`
- **Target:** 3 always-on. Per-session enable for the rest.

## Pattern 7 — Extended thinking on simple questions (~5%)
- **Signal:** Extended thinking left ON globally.
- **Why expensive:** Simple tasks burn 3,000+ tokens of `<thinking>` they don't need.
- **Detection:** Setting check in Claude Code (Alt+T toggle).
- **Target:** OFF by default. Toggle ON for genuinely complex reasoning (~20% of tasks).

## Pattern 8 — Wrong-direction generation (~4%)
- **Signal:** Letting a 400-line response finish even after 50 lines clearly drift.
- **Why expensive:** Output tokens are billed. Wasted output = direct cost.
- **Detection:** Self-observation. Run a 1-week habit log.
- **Target:** Use Cmd+. (Mac) / Ctrl+. within 5 seconds of detecting drift. Double-Esc opens checkpoint scroller for terminal users.

## Pattern 9 — Plugin auto-update redundancy (~3%)
- **Signal:** > 2 SessionStart hooks; many plugins emit "loaded successfully" messages.
- **Why expensive:** ~50 tokens per plugin × every session start = compounding overhead.
- **Detection:** `jq '.hooks.SessionStart' ~/.claude/settings.json`
- **Target:** ≤ 2 SessionStart hooks (branch context, env vars only).

## Cost share table

| # | Pattern                            | Share  | Severity |
|---|------------------------------------|--------|----------|
| 1 | CLAUDE.md bloat                    | ~14%   | High     |
| 2 | Conversation history re-reads      | ~13%   | High     |
| 3 | Hook injection waste               | ~11%   | High     |
| 4 | Cache miss on session resume       | ~10%   | Medium   |
| 5 | Skill loading on irrelevant tasks  | ~7%    | Medium   |
| 6 | "Just in case" tool definitions    | ~6%    | Medium   |
| 7 | Extended thinking on simple Qs     | ~5%    | Medium   |
| 8 | Wrong-direction generation         | ~4%    | Low      |
| 9 | Plugin auto-update redundancy      | ~3%    | Low      |
|   | **Total overhead**                 | **73%**|          |

## What does NOT move the needle

These were tested and rejected as primary levers:
- Switching to Haiku for "simple" tasks → ~3% reduction. Bloated context still costs more on cheap models.
- Aggressive `/clear` between every task → loses needed context, net negative.
- Disabling all skills entirely → forces manual repetition of instructions, net negative.
- Off-peak hours scheduling → ~7% of users affected by peak-hour quota; minor lever for most.
- Subscription downgrade → cost per work-hour unchanged.

The real lever is the constant overhead tax. Cut it once, capacity 2-3×.
