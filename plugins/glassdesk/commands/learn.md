---
description: ⚡ Extract and persist insights from the current session
argument-hint: [optional: focus area]
---

Activate 'compounding' skill.

## Focus
<focus>$ARGUMENTS</focus>

Follow the Core Pattern:
1. **Parse** — Load 'references/session-parsing.md'; run the two scripts to get session data
2. **Extract** — Load 'references/insight-extraction.md'; apply extraction prompt to parsed data
3. **Write** — Load 'references/learn-output.md'; write entry to `.glassdesk-knowledge/{YYMMDD}-{slug}.md`

Report: file path written + count of insights captured.
If no meaningful insights found, say so and do not write an empty file.
