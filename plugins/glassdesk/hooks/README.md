# Hooks

Claude Code hooks for automated reminders and workflow enhancements.

## Available Hooks

### session-init.cjs

**Triggers:** SessionStart (on session start)
**Purpose:** Initializes session ID, state, and plugin path

Sets these environment variables:
- `GD_SESSION_ID` - Unique session identifier (always regenerated per session)
- `GD_PLUGIN_PATH` - Absolute path to plugin installation. **First-writer-wins** — preserves existing value to avoid dual-install collision (marketplace plugin + npx install both register a SessionStart hook).

Creates session temp file at `/tmp/gd-session-{id}.json`.

**Required for:**
- Plan state persistence via `set-active-plan.cjs`
- Subagent plan context propagation
- Session-scoped state management
- Script path resolution for marketplace-installed plugins (the runtime env-var path)

**Note for npx-installed projects:** dollar-prefixed `GD_PLUGIN_PATH` references inside command/skill markdown files are rewritten at install time to project-relative `.claude/...` paths. Claude Code spawns Bash with `cwd=project root` in both main session and subagent contexts, so relative paths resolve correctly without needing env-var propagation (works around bug #46696). The runtime env var is therefore not consumed by markdown in this install mode; it remains set for any custom hooks/scripts that read it. Marketplace install path continues to use the env var at runtime.

### dev-rules-reminder.cjs

**Triggers:** UserPromptSubmit (on each user message)
**Purpose:** Reminds development principles (YAGNI, KISS, DRY)

This hook automatically injects development rules and session context at the start of each Claude Code conversation.

**Key Features:**
- Injects development rules from workflows
- Provides plan context and naming conventions
- Sets up validation mode for plans
- Reminds YAGNI/KISS/DRY principles

## Configuration

Hooks are configured in `.claude/settings.json` or `.claude/settings.local.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "node plugins/glassdesk/hooks/session-init.cjs"
      }
    ],
    "UserPromptSubmit": [
      {
        "type": "command",
        "command": "node plugins/glassdesk/hooks/dev-rules-reminder.cjs"
      }
    ]
  }
}
```

**Important:** `session-init.cjs` must run on `SessionStart` to set `GD_SESSION_ID` before other hooks execute.

## Adding Custom Hooks

1. Create `.cjs` file in this directory
2. Import utilities from `./lib/gd-config-utils.cjs` if needed
3. Register in `.claude/settings.json` or `.claude/settings.local.json`

### Hook Specification

```javascript
#!/usr/bin/env node
// Hooks receive stdin JSON payload and can output to stdout
// Exit code 0 = success (non-blocking)

const fs = require('fs');

// Read stdin payload (for UserPromptSubmit hooks)
const stdin = fs.readFileSync(0, 'utf-8').trim();
const payload = stdin ? JSON.parse(stdin) : {};

// Write env vars via CLAUDE_ENV_FILE (for SessionStart hooks)
const envFile = process.env.CLAUDE_ENV_FILE;
if (envFile) {
  fs.appendFileSync(envFile, 'export MY_VAR="value"\n');
}

// Output injected context (stdout)
console.log('Injected context here');

process.exit(0);
```

## Dependencies

- Node.js runtime required for `.cjs` hooks
- Hooks execute in the Claude Code environment
