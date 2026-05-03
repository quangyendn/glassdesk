# Audit Pattern Index — 20 Patterns (9 Cost / 11 Compliance)

Each pattern lives in `patterns/<id>.md` as a single YAML-frontmatter source of truth.
`audit.sh` loops over these files to produce the 2-section report.

## Pattern Catalog

| ID | Name | Tier | Severity | Cost % | File |
|----|------|------|----------|--------|------|
| T1-01 | CLAUDE.md bloat | cost | high | 14% | [patterns/T1-01.md](patterns/T1-01.md) |
| T1-02 | Conversation history re-reads | cost | high | 13% | [patterns/T1-02.md](patterns/T1-02.md) |
| T1-03 | Hook injection waste | cost | high | 11% | [patterns/T1-03.md](patterns/T1-03.md) |
| T1-04 | Cache miss on session resume | cost | medium | 10% | [patterns/T1-04.md](patterns/T1-04.md) |
| T1-05 | Skill loading on irrelevant tasks | cost | medium | 7% | [patterns/T1-05.md](patterns/T1-05.md) |
| T1-06 | Just-in-case MCP tool definitions | cost | medium | 6% | [patterns/T1-06.md](patterns/T1-06.md) |
| T1-07 | Extended thinking on simple questions | cost | medium | 5% | [patterns/T1-07.md](patterns/T1-07.md) |
| T1-08 | Wrong-direction generation | cost | low | 4% | [patterns/T1-08.md](patterns/T1-08.md) |
| T1-09 | Plugin auto-update redundancy | cost | low | 3% | [patterns/T1-09.md](patterns/T1-09.md) |
| T2-01 | CLAUDE.md content quality | compliance | warn | — | [patterns/T2-01.md](patterns/T2-01.md) |
| T2-02 | @-imports scoped | compliance | warn | — | [patterns/T2-02.md](patterns/T2-02.md) |
| T2-03 | CLAUDE.md scope split | compliance | info | — | [patterns/T2-03.md](patterns/T2-03.md) |
| T2-04 | Permissions configured | compliance | warn | — | [patterns/T2-04.md](patterns/T2-04.md) |
| T2-05 | CLI tools available | compliance | info | — | [patterns/T2-05.md](patterns/T2-05.md) |
| T2-06 | Skill frontmatter integrity | compliance | fail | — | [patterns/T2-06.md](patterns/T2-06.md) |
| T2-07 | Subagents present | compliance | info | — | [patterns/T2-07.md](patterns/T2-07.md) |
| T2-08 | Personality instructions banned | compliance | warn | — | [patterns/T2-08.md](patterns/T2-08.md) |
| T2-09 | Linter-handled formatting rules | compliance | warn | — | [patterns/T2-09.md](patterns/T2-09.md) |
| T2-10 | Duplicate user vs project rules | compliance | warn | — | [patterns/T2-10.md](patterns/T2-10.md) |
| T2-11 | Auto-memory awareness | compliance | info | — | [patterns/T2-11.md](patterns/T2-11.md) |

## Severity ordinal map (used by audit.sh for ranking)

`high=3, fail=3, medium=2, warn=2, low=1, info=0`

## What does NOT move the needle

These were tested and rejected as primary levers:
- Switching to Haiku for "simple" tasks → ~3% reduction. Bloated context still costs more on cheap models.
- Aggressive `/clear` between every task → loses needed context, net negative.
- Disabling all skills entirely → forces manual repetition of instructions, net negative.
- Off-peak hours scheduling → ~7% of users affected by peak-hour quota; minor lever for most.
- Subscription downgrade → cost per work-hour unchanged.

The real lever is the constant overhead tax. Cut it once, capacity 2-3×.
