#!/usr/bin/env node
/**
 * SessionEnd hook — auto-cleanup managed worktree symlinks on Claude session exit.
 *
 * Behavior:
 *   - Detects whether the CWD is a git worktree managed by glassdesk
 *     (via .gd-worktree-symlinks.lock presence).
 *   - If yes, and there are no uncommitted changes, unlinks the symlinks
 *     and removes the worktree via `git worktree remove` (no --force).
 *   - If there are uncommitted changes, logs a warning and skips — user
 *     keeps their work; cleanup retries on the next session exit.
 *
 * Safety: never throws, always exits 0 (must not block session exit).
 *
 * NOTE: Uses "SessionEnd" event name per claude-plugins-official convention.
 * If this hook does not fire, try "Stop" as the event key in settings.local.json.
 */

const path = require('path');
try {
  const { cleanupWorktreeOnExit } = require(path.join(__dirname, 'lib', 'gd-config-utils.cjs'));
  const cwd = process.cwd();
  Promise.resolve(cleanupWorktreeOnExit(cwd))
    .catch(() => {})
    .finally(() => process.exit(0));
} catch (_) {
  process.exit(0);
}
