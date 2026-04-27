# Session Parsing

How to locate and parse the current Claude Code session.

## Step 1: Find the session JSONL

Run the bundled script:

```bash
node plugins/glassdesk/scripts/find-current-session.cjs
```

**What it does:**
- Encodes `process.cwd()` — every non-alphanumeric character becomes `-`
- Looks up `~/.claude/projects/<encoded-cwd>/`
- Returns the most-recently-modified `.jsonl` file path (absolute) on stdout

**Fallback:** If the exact directory is missing, the script scans all dirs under `~/.claude/projects/` and matches by suffix.

## Step 2: Parse the session

```bash
node plugins/glassdesk/scripts/parse-session-insights.cjs <path.jsonl>
```

**Output JSON shape:**

```json
{
  "prompts": ["user message text", ...],
  "assistant_texts": ["assistant response text", ...],
  "tool_calls": [{ "name": "Read", "success": true }, ...],
  "errors": [{ "timestamp": "..." }]
}
```

**Security constraints (enforced by script):**
- `tool_result` content is NEVER read — it may contain file contents or credentials
- Only tool call NAMES are captured (not inputs or outputs)
- `success` is a heuristic: `stop_reason === "end_turn"`

## JSONL Record Schema

Each line is one record:

```json
{ "type": "user" | "assistant", "timestamp": "ISO8601", "message": { ... } }
```

- `message.role` — `"user"` | `"assistant"`
- `message.content` — array of blocks (`type: "text"`, `type: "tool_use"`, `type: "tool_result"`)
- `message.stop_reason` — `"end_turn"` | `"tool_use"` | `"error"` (assistant only)

## Encoding Reference

| CWD | Encoded |
|-----|---------|
| `/Users/alice/projects/myapp` | `-Users-alice-projects-myapp` |
| `/home/bob/work/api` | `-home-bob-work-api` |
