# Claude Code Audit — Skill + Command

Optimize Claude Code by eliminating the 9 invisible token-waste patterns that consume up to 73% of input tokens before any prompt is read.

Based on a 90-day, 430-hour, $1,340 instrumentation study.

## What's in this bundle

```
claude-code-audit/
├── SKILL.md                       # Skill manifest + workflow
├── commands/
│   └── audit-claude.md            # /audit-claude slash command
├── scripts/
│   ├── audit.sh                   # Diagnostic script (run anywhere)
│   └── analyze-session.py         # Optional deeper proxy-log analysis
└── references/
    ├── patterns.md                # The 9 patterns + cost share
    └── fixes.md                   # 30-second fix recipe per pattern
```

## Install

### As a Claude Code skill (user-level)

```bash
# 1. Copy the skill folder
mkdir -p ~/.claude/skills
cp -r claude-code-audit ~/.claude/skills/

# 2. Copy the slash command
mkdir -p ~/.claude/commands
cp claude-code-audit/commands/audit-claude.md ~/.claude/commands/

# 3. Make scripts executable
chmod +x ~/.claude/skills/claude-code-audit/scripts/audit.sh
chmod +x ~/.claude/skills/claude-code-audit/scripts/analyze-session.py
```

### As a project-scoped skill

```bash
mkdir -p .claude/skills .claude/commands
cp -r claude-code-audit .claude/skills/
cp claude-code-audit/commands/audit-claude.md .claude/commands/
chmod +x .claude/skills/claude-code-audit/scripts/audit.sh
```

## Use

In Claude Code:

```
/audit-claude
```

Or simply describe the goal — the skill auto-triggers on phrases like:
- "audit claude code"
- "optimize claude code"
- "tối ưu claude code"
- "kiểm tra claude code"
- "claude code đang tốn token / hit usage limit"

## What you'll get

1. A diagnostic report covering all 9 patterns with PASS / WARN / FAIL.
2. The top 3 fixes ranked by token savings.
3. An offer to walk through each fix interactively.

## Targets after applying all fixes

| Metric                   | Before | After |
|--------------------------|--------|-------|
| Productive token share   | 27%    | ~65%  |
| CLAUDE.md combined size  | 4,800  | <1,500 tokens |
| UserPromptSubmit hooks   | 4      | 1     |
| Active skills            | 11     | 4     |
| Always-on MCPs           | 12     | 3     |
| SessionStart hooks       | 9      | 2     |

## Re-audit cadence

Run weekly. Overhead creep is the default state.

```bash
bash ~/.claude/skills/claude-code-audit/scripts/audit.sh
```
