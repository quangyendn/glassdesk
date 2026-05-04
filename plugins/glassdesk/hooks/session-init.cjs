#!/usr/bin/env node
/**
 * Session Init - SessionStart Hook
 *
 * Initializes session context for GlassDesk:
 * - Generates unique session ID
 * - Sets GD_SESSION_ID env var via CLAUDE_ENV_FILE
 * - Sets GD_PLUGIN_PATH for script resolution (works with global installs)
 * - Creates session temp file for state persistence
 *
 * This hook enables plan state persistence across subagents.
 * Without it, set-active-plan.cjs cannot persist session state.
 *
 * Exit Codes:
 *   0 - Success (non-blocking, allows continuation)
 */

const crypto = require('crypto');
const path = require('path');
const { writeEnv, writeSessionState, detectSerena, buildSerenaHint, isGitWorktree, buildWorktreeActivationHint, ensureWorktreeSerenaProject } = require('./lib/gd-config-utils.cjs');

const envFile = process.env.CLAUDE_ENV_FILE;

// Generate 8-char session ID (sufficient for session isolation)
let sessionId;
try {
  sessionId = crypto.randomUUID().slice(0, 8);
} catch (e) {
  // Fallback if crypto.randomUUID unavailable
  sessionId = Math.random().toString(36).slice(2, 10);
}

// Resolve plugin root path (works for both local and global installs)
// __dirname is hooks/, so parent is plugin root
const pluginPath = path.resolve(__dirname, '..');

// Set env vars for current session.
// GD_SESSION_ID: always regenerate (uniqueness per session).
// GD_PLUGIN_PATH: first-writer-wins to handle dual-install collisions
// (marketplace plugin + npx install both register a SessionStart hook).
writeEnv(envFile, 'GD_SESSION_ID', sessionId);
if (!process.env.GD_PLUGIN_PATH) {
  writeEnv(envFile, 'GD_PLUGIN_PATH', pluginPath);
}

// Initialize session temp file with origin context
writeSessionState(sessionId, {
  sessionOrigin: process.cwd(),
  activePlan: null,
  timestamp: Date.now()
});

// ───────── Serena MCP detection (non-blocking) ─────────
// Sets GD_SERENA_AVAILABLE=1|0 for skill/command conditional logic.
// Prints one-shot install hint to stdout when 0 (auto-injected as session context).
let serenaActive = false;
try { serenaActive = detectSerena(); } catch (_) { serenaActive = false; }
writeEnv(envFile, 'GD_SERENA_AVAILABLE', serenaActive ? '1' : '0');
if (!serenaActive) {
  console.log(buildSerenaHint());
} else if (isGitWorktree(process.cwd())) {
  // Serena IS active AND we're in a git worktree → make the activation safe:
  //   1. Auto-write a per-worktree `.serena/project.yml` with a unique
  //      `project_name` and `ignored_paths: ["../**"]` (idempotent).
  //   2. Inject an absolute-path activation hint so subsequent
  //      `activate_project` calls don't fall back to name-based lookup
  //      (which would route edits to the wrong worktree).
  ensureWorktreeSerenaProject(process.cwd());
  console.log(buildWorktreeActivationHint(process.cwd()));
}

process.exit(0);
