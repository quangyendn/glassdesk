---
description: ⚡ Generate an improvement proposal from knowledge entries
argument-hint: [--plugin | --project]
---

Activate 'compounding' skill.
Load 'references/improve-proposal.md'.

## Scope
<scope>$ARGUMENTS</scope>

Follow the proposal workflow:
1. **Gate** — scan `.glassdesk-knowledge/`; if empty, stop and ask user to run `/learn` first
2. **Analyze** — read existing entries; identify improvement themes for the given scope
3. **Write** — generate proposal to `plans/improvements/{YYMMDD}-{slug}-proposal.md`

Report: file path written + number of proposed changes.

**⚠️ NEVER apply changes automatically. The proposal is read-only.**
**⚠️ NEVER modify CLAUDE.md — that requires an explicit user instruction.**
