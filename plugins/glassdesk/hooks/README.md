# Hooks

Claude Code hooks for automated reminders and workflow enhancements.

## Available Hooks

### session-init.cjs

**Triggers:** SessionStart (on session start)
**Purpose:** Initializes session ID, state, and plugin path

Sets these environment variables:
- `GD_SESSION_ID` - Unique session identifier (always regenerated per session)
- `GD_PLUGIN_PATH` - Absolute path to plugin installation. Hook is **idempotent across re-runs in the same process tree** — preserves existing `GD_PLUGIN_PATH` (inherited from parent shell or a prior hook invocation whose export was already sourced). Note: when marketplace + project-local hooks fire in parallel during the same `SessionStart`, neither sees the other's export, so the value written to `CLAUDE_ENV_FILE` last wins — see "Dual-registration" below.
- `GD_SERENA_AVAILABLE` - `"1"` if Serena MCP plugin is enabled, `"0"` otherwise. Detected via `~/.claude/settings.json` `enabledPlugins` (loose match `/^serena@/`) with `claude plugin list --json` fallback (3s timeout). When `"0"`, a one-shot install hint is printed to stdout (auto-injected as session context). Skills and commands gate "prefer Serena" routing on this flag.

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

### Marketplace install (auto-registration)

`session-init.cjs` (SessionStart) and `dev-rules-reminder.cjs` (UserPromptSubmit) are auto-registered via `hooks/hooks.json` for any consumer of the marketplace plugin. No per-project wiring needed — Claude Code reads `hooks/hooks.json` at plugin load, and Codex reads the same manifest for plugins installed from a marketplace. `${CLAUDE_PLUGIN_ROOT}` resolves to the installed plugin directory in both.

Do **not** also register these hooks by hand when the marketplace plugin is enabled. Claude Code keeps plugin handlers and project-settings handlers separate and runs both, so a duplicate registration fires the hook twice per event. `dev-rules-reminder.cjs` guards against the resulting double context injection with a per-prompt lock file, but the duplicate process still runs.

### Manual / per-project (optional override or npx install)

You can still wire hooks explicitly in `.claude/settings.json` or `.claude/settings.local.json` — this is how `npx glassdesk init` installs them (see `templates/settings.local.json`), and it is useful when developing the plugin locally so the project source runs instead of the marketplace copy:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node plugins/glassdesk/hooks/session-init.cjs"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node plugins/glassdesk/hooks/dev-rules-reminder.cjs"
          }
        ]
      }
    ]
  }
}
```

**Dual-registration is not recommended.** When both marketplace `hooks.json` and project-local `settings.json` register `session-init.cjs`, Claude Code spawns both invocations in parallel — neither process sees the other's export (writes go to `CLAUDE_ENV_FILE`, sourced after both exit). Resulting behavior is non-deterministic:
- `GD_PLUGIN_PATH`: the last write to `CLAUDE_ENV_FILE` wins. Both processes pass the `if (!process.env.GD_PLUGIN_PATH)` guard unless the parent shell already exported it. The two writes typically resolve to similar paths (project-local install vs. marketplace plugin dir), but neither is guaranteed.
- `GD_SESSION_ID`: unconditionally regenerated each run, last write wins. One of the two `/tmp/gd-session-{id}.json` files becomes orphan.

To avoid ambiguity, register `session-init.cjs` in exactly one place — either let the marketplace `hooks/hooks.json` auto-register it (preferred), or disable that and wire it manually in `.claude/settings.json` (useful for local plugin development). The npx installer skips copying `hooks/hooks.json` into `<project>/.claude/hooks/` precisely to keep the marketplace path single-source.

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
