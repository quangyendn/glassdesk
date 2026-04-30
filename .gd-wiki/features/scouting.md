---
title: "Scouting"
updated: 2026-05-01
tags: [category/feature, scouting, exploration, skill]
summary: "The scouting feature provides codebase exploration via /scout (internal) and /scout:ext (external tools like Gemini CLI), with Wiki Recall pre-flight at Step 0."
---

The scouting feature enables structured codebase exploration using internal tools (`/scout`) or external agentic tools (`/scout:ext`), powered by the `scouting` skill.

## Commands

| Command | Agent | Tier | Description |
|---|---|---|---|
| `/scout` | `gd-scout` | fast (Haiku) | Fast local codebase exploration, file discovery |
| `/scout:ext` | `gd-scout-external` | external | External-tool reconnaissance via Gemini CLI |

## External Tier

`gd-scout-external` is the only agent in the `external` tier. It shells out to `gemini-2.5-flash` via the Gemini CLI for high-volume exploration where token cost would be prohibitive with Claude. When the Gemini CLI is absent, it falls back to Sonnet (standard tier behavior). This fallback is intentionally silent — it does not fail loud, to allow function on fresh clones without external setup.

## Wiki Recall (Step 0)

The `scouting` skill runs Wiki Recall as Step 0 before any codebase exploration. It queries `.gd-wiki/` via QMD for prior decisions, architecture notes, and insights relevant to the exploration task. If a high-confidence hit (score ≥ 0.5) is returned, the scout output must cite or explicitly diverge from the matched page. This ensures scouting results align with established architecture decisions rather than re-discovering them.

See `plugins/glassdesk/skills/wiki/references/recall.md` for the full protocol and citation gate spec.

## Related Pages

- [[model-tier-policy]] — external tier definition and fallback behavior
- [[plugin-system]] — how scouting fits in the SDLC phase taxonomy
- [[compounding]] — the read/write loop that Wiki Recall closes
