# ccaudit — Claude Code Audit Plugin

Audit Claude Code setup against a 20-pattern catalog (9 cost-overhead + 11 best-practice compliance) and recommend prioritized fixes. The cost-overhead tier is grounded in a 90-day, 430-hour, $1,340 instrumentation study showing these waste patterns can consume up to 73% of input tokens before any prompt is read.

## Install

From the `glassdesk-marketplace`:

```
/plugin marketplace add glassdesk-marketplace <marketplace-source>
/plugin install ccaudit@glassdesk-marketplace
```

Replace `<marketplace-source>` with the path or URL where the `glassdesk-marketplace` is hosted (e.g. a local clone of this repo, or a remote git URL once published).

## Use

Invoke the audit skill directly:

```
/ccaudit:audit
```

Or trigger by natural language — the skill auto-activates on phrases like:

- "audit claude code"
- "optimize claude code"
- "tối ưu claude code"
- "kiểm tra claude code"
- "claude code đang tốn token / hit usage limit"

## What you get

1. A diagnostic report covering all 20 patterns with PASS / WARN / FAIL.
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

## Layout

```
plugins/ccaudit/
├── .claude-plugin/plugin.json
└── skills/audit/
    ├── SKILL.md
    ├── references/
    │   ├── patterns.md          # Index of all 20 audit patterns
    │   ├── patterns/            # 20 individual pattern files (T1-01..T1-09, T2-01..T2-11)
    │   └── fixes.md             # 30-second fix recipe per pattern
    └── scripts/
        ├── audit.sh             # Diagnostic script
        └── analyze-session.py
```

## Re-audit cadence

Run weekly. Overhead creep is the default state.
