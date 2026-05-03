---
title: "ccaudit — Claude Code Audit Plugin"
updated: 2026-05-03
tags: [category/feature, ccaudit, audit, token-optimization, plugin]
summary: "ccaudit audits a Claude Code setup against a 2-tier 20-pattern catalog (9 cost-overhead + 11 compliance) and emits prioritized fixes. Usable as npx one-shot or as an installable Claude Code plugin."
---

ccaudit detects and scores 20 known overhead and compliance patterns in a Claude Code project, grounded in a 90-day, 430-hour, $1,340 instrumentation study. The 9 cost-overhead patterns account for up to 73% of input tokens before any prompt is read. The 11 compliance patterns check adherence to Anthropic's official guidelines.

## Installation

### npx (no install required)

```bash
npx -y @yennqdn/ccaudit
```

Run from the project root. The script reads `~/.claude/CLAUDE.md`, `./CLAUDE.md`, `./.claude/CLAUDE.md`, and `./CLAUDE.local.md` from the current directory.

### Claude Code plugin

```
/plugin marketplace add glassdesk-marketplace <marketplace-source>
/plugin install ccaudit@glassdesk-marketplace
```

Then invoke via slash command:

```
/ccaudit:audit
```

The skill also auto-activates on natural-language phrases such as "audit claude code", "optimize claude code", "claude code expensive", and their Vietnamese equivalents.

## Audit Workflow

The skill runs four phases in order:

1. **Diagnose** — execute `audit.sh` to capture current state of all 20 patterns
2. **Map** — classify each pattern as PASS / WARN / FAIL / INFO using per-pattern thresholds
3. **Recommend** — emit Top-3 Fixes ranked by `cost_share_pct` descending, then severity
4. **Verify** — re-run after fixes; schedule weekly re-audits (overhead creep is the default state)

## Pattern Catalog

### Tier 1 — Cost Overhead (9 patterns)

| ID | Pattern | Severity | Approx. cost share |
|-----|---------|----------|--------------------|
| T1-01 | CLAUDE.md bloat | high | 14% |
| T1-02 | Conversation history re-reads | high | 13% |
| T1-03 | Hook injection waste | high | 11% |
| T1-04 | Cache miss on session resume | medium | 10% |
| T1-05 | Skill loading on irrelevant tasks | medium | 7% |
| T1-06 | Just-in-case MCP tool definitions | medium | 6% |
| T1-07 | Extended thinking on simple questions | medium | 5% |
| T1-08 | Wrong-direction generation | low | 4% |
| T1-09 | Plugin auto-update redundancy | low | 3% |

### Tier 2 — Best-Practice Compliance (11 patterns)

| ID | Pattern | Severity |
|-----|---------|----------|
| T2-01 | CLAUDE.md content quality | warn |
| T2-02 | @-imports scoped | warn |
| T2-03 | CLAUDE.md scope split | info |
| T2-04 | Permissions configured | warn |
| T2-05 | CLI tools available | info |
| T2-06 | Skill frontmatter integrity | fail |
| T2-07 | Subagents present | info |
| T2-08 | Personality instructions banned | warn |
| T2-09 | Linter-handled formatting rules | warn |
| T2-10 | Duplicate user vs project rules | warn |
| T2-11 | Auto-memory awareness | info |

Severity ordinal map used for ranking: `high=3, fail=3, medium=2, warn=2, low=1, info=0`.

## Expected Improvement Targets

| Metric | Before | After |
|--------|--------|-------|
| Productive token share | 27% | ~65% |
| CLAUDE.md combined size | 4,800 tokens | <1,500 tokens |
| UserPromptSubmit hooks | 4 | 1 |
| Active skills | 11 | 4 |
| Always-on MCPs | 12 | 3 |
| SessionStart hooks | 9 | 2 |

## System Requirements

- macOS, Linux, or WSL (Windows native not supported — no `bash` by default)
- `bash` 3.2+ (stock macOS works)
- Standard POSIX tools: `awk`, `grep`, `sort`, `tr`, `cut`, `wc`, `mktemp`
- Node.js 18+ (npx path only)
- Optional: `yq` (mikefarah v4+) for faster YAML parsing; awk fallback used if absent
- Optional: `git` for Tier 2 compliance patterns that read repo state

## Plugin Layout

```
plugins/ccaudit/
├── package.json                     # npm package manifest (npx entry)
├── bin/ccaudit.js                   # Node wrapper that spawns audit.sh
├── .claude-plugin/plugin.json       # Claude Code plugin manifest
└── skills/audit/
    ├── SKILL.md
    ├── references/
    │   ├── patterns.md              # Index of all 20 patterns
    │   ├── patterns/                # 20 individual pattern files (T1-01..T1-09, T2-01..T2-11)
    │   └── fixes.md                 # 30-second fix recipe per pattern
    └── scripts/
        ├── audit.sh                 # Catalog-driven diagnostic script
        └── analyze-session.py       # Optional deep per-session log analysis
```

## npm Package

Published as `@yennqdn/ccaudit` (scoped). The unscoped name `ccaudit` is blocked by npm's name-similarity policy. See [[ccaudit-npm-scoped-name]] for the decision record.

Current version: **0.2.0**. `package.json` and `.claude-plugin/plugin.json` versions must stay in sync.

## Related Pages

- [[ccaudit-npm-scoped-name]] — why the package is scoped to `@yennqdn/ccaudit`
- [[plugin-system]] — how plugins are structured and installed in glassdesk
- [[plugin-flat-structure]] — flat plugin directory convention (no `.claude/` wrapper)
