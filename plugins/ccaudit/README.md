# ccaudit — Claude Code Audit

Audit Claude Code setup against a 20-pattern catalog (9 cost-overhead + 11 best-practice compliance) and recommend prioritized fixes. The cost-overhead tier is grounded in a 90-day, 430-hour, $1,340 instrumentation study showing these waste patterns can consume up to 73% of input tokens before any prompt is read.

## Quick start (npx)

Run the audit against the current project — no install:

```bash
npx -y @yennqdn/ccaudit
```

The audit reads `~/.claude/CLAUDE.md`, `./CLAUDE.md`, `./.claude/CLAUDE.md`, and `./CLAUDE.local.md` from the directory you invoke it in. Run from a project root for project-scoped findings.

## Install as Claude Code plugin

For users inside Claude Code who want the skill auto-loaded:

```
/plugin marketplace add glassdesk-marketplace <marketplace-source>
/plugin install ccaudit@glassdesk-marketplace
```

Replace `<marketplace-source>` with the path or URL where `glassdesk-marketplace` is hosted (a local clone of this repo, or a remote git URL).

Then invoke directly:

```
/ccaudit:audit
```

Or trigger by natural language — the skill auto-activates on phrases like "audit claude code", "optimize claude code", "tối ưu claude code", "kiểm tra claude code", "claude code đang tốn token".

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

## System requirements

- macOS, Linux, or WSL (Windows native not supported — no `bash` by default).
- `bash` 3.2+ (stock macOS works).
- Standard POSIX tools: `awk`, `grep`, `sort`, `tr`, `cut`, `wc`, `mktemp`.
- For npx path only: Node.js 18+.
- Optional: `yq` (mikefarah v4+) for faster YAML parsing — `brew install yq`. Awk fallback used if absent.
- Optional: `git` for Tier 2 compliance patterns that read repo state.

## Layout

```
plugins/ccaudit/
├── package.json                   # npm package manifest (npx entry)
├── bin/ccaudit.js                 # node wrapper that spawns audit.sh
├── .claude-plugin/plugin.json     # Claude Code plugin manifest
└── skills/audit/
    ├── SKILL.md
    ├── references/
    │   ├── patterns.md            # Index of all 20 audit patterns
    │   ├── patterns/              # 20 individual pattern files (T1-01..T1-09, T2-01..T2-11)
    │   └── fixes.md               # 30-second fix recipe per pattern
    └── scripts/
        ├── audit.sh               # Diagnostic script
        └── analyze-session.py     # Optional deep per-session log analysis
```

## Re-audit cadence

Run weekly. Overhead creep is the default state.

## Maintainers

See [PUBLISHING.md](./PUBLISHING.md) for the npm release flow.
