'use strict';

// Fixture-based migration tests for mergeSettings + migrateHookCommandsToWrapped.
// Covers: legacy hooks, already-wrapped hooks, mixed state, and foreign hooks.
//
// Uses node:test (built-in since Node 18) with dynamic import() to load the
// ESM bin/cli.js from this CommonJS test file.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const CLI_PATH = pathToFileURL(path.resolve(__dirname, '..', 'bin', 'cli.js')).href;

// ---------------------------------------------------------------------------
// Shared hook basenames used across all fixtures.
// ---------------------------------------------------------------------------
const HOOKS = ['session-init.cjs', 'dev-rules-reminder.cjs', 'session-end.cjs'];
const EVENTS = { 'session-init.cjs': 'SessionStart', 'dev-rules-reminder.cjs': 'UserPromptSubmit', 'session-end.cjs': 'SessionEnd' };

// Build a settings object with legacy `node "${CLAUDE_PROJECT_DIR:-$PWD}/..."` hook commands.
function makeLegacySettings() {
  return {
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PROJECT_DIR:-$PWD}/.claude/hooks/session-init.cjs"' }] }],
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PROJECT_DIR:-$PWD}/.claude/hooks/dev-rules-reminder.cjs"' }] }],
      SessionEnd: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PROJECT_DIR:-$PWD}/.claude/hooks/session-end.cjs"' }] }],
    },
    permissions: { allow: [], deny: [] },
    env: {},
  };
}

// ---------------------------------------------------------------------------
// Fixture A: legacy settings → after merge, all three hooks wrapped.
// Non-glassdesk hooks untouched.
// ---------------------------------------------------------------------------
test('Fixture A (legacy): legacy node commands become wrapped after mergeSettings', async (_t) => {
  const { mergeSettings, wrapHookCommand, isWrappedHook } = await import(CLI_PATH);

  const existing = makeLegacySettings();
  // Add a non-glassdesk hook to SessionStart to verify it is untouched.
  existing.hooks.SessionStart.push({ hooks: [{ type: 'command', command: 'echo "foreign hook"' }] });

  const template = {
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: wrapHookCommand('session-init.cjs') }] }],
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: wrapHookCommand('dev-rules-reminder.cjs') }] }],
      SessionEnd: [{ hooks: [{ type: 'command', command: wrapHookCommand('session-end.cjs') }] }],
    },
    permissions: { allow: [], deny: [] },
    env: {},
  };

  const { merged } = mergeSettings(existing, template);

  for (const hookFile of HOOKS) {
    const event = EVENTS[hookFile];
    const entries = merged.hooks[event];
    assert.ok(Array.isArray(entries) && entries.length > 0, `${event} should have entries`);
    // Collect all command strings across all inner hook arrays for this event.
    const cmds = entries.flatMap((e) => (e.hooks ?? []).map((h) => h.command));
    const wrappedCmd = wrapHookCommand(hookFile);
    assert.ok(
      cmds.includes(wrappedCmd),
      `${event}: merged result must include wrapped command for ${hookFile}`
    );
    // Verify no legacy node form survives.
    for (const cmd of cmds) {
      if (cmd.includes(hookFile)) {
        assert.ok(
          isWrappedHook(cmd),
          `${event}: surviving glassdesk command for ${hookFile} must be in wrapped form, got: ${cmd}`
        );
      }
    }
  }

  // Foreign hook must still be present in SessionStart.
  const sessionStartCmds = merged.hooks.SessionStart.flatMap((e) => (e.hooks ?? []).map((h) => h.command));
  assert.ok(
    sessionStartCmds.includes('echo "foreign hook"'),
    'foreign hook must survive migration untouched'
  );
});

// ---------------------------------------------------------------------------
// Fixture B (already wrapped): second update produces no diff (idempotency).
// ---------------------------------------------------------------------------
test('Fixture B (already wrapped): second mergeSettings pass produces zero diff', async (_t) => {
  const { mergeSettings, wrapHookCommand } = await import(CLI_PATH);

  const template = {
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: wrapHookCommand('session-init.cjs') }] }],
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: wrapHookCommand('dev-rules-reminder.cjs') }] }],
      SessionEnd: [{ hooks: [{ type: 'command', command: wrapHookCommand('session-end.cjs') }] }],
    },
    permissions: { allow: [], deny: [] },
    env: {},
  };

  // First pass: start from empty, install fresh.
  const { merged: afterFirst } = mergeSettings({}, template);

  // Second pass: feed first pass output as input.
  const { merged: afterSecond } = mergeSettings(afterFirst, template);

  // The two outputs must be deep-equal.
  assert.deepEqual(
    afterSecond,
    afterFirst,
    'second mergeSettings pass must produce identical output (idempotency)'
  );
});

// ---------------------------------------------------------------------------
// Fixture C (mixed): one wrapped + two legacy → after merge all three wrapped.
// No double-wrapping.
// ---------------------------------------------------------------------------
test('Fixture C (mixed): one wrapped + two legacy → all three wrapped, no double-wrapping', async (_t) => {
  const { mergeSettings, wrapHookCommand, isWrappedHook } = await import(CLI_PATH);

  const existing = {
    hooks: {
      // Already wrapped.
      SessionStart: [{ hooks: [{ type: 'command', command: wrapHookCommand('session-init.cjs') }] }],
      // Legacy.
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PROJECT_DIR:-$PWD}/.claude/hooks/dev-rules-reminder.cjs"' }] }],
      // Legacy.
      SessionEnd: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PROJECT_DIR:-$PWD}/.claude/hooks/session-end.cjs"' }] }],
    },
    permissions: { allow: [], deny: [] },
    env: {},
  };

  const template = {
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: wrapHookCommand('session-init.cjs') }] }],
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: wrapHookCommand('dev-rules-reminder.cjs') }] }],
      SessionEnd: [{ hooks: [{ type: 'command', command: wrapHookCommand('session-end.cjs') }] }],
    },
    permissions: { allow: [], deny: [] },
    env: {},
  };

  const { merged } = mergeSettings(existing, template);

  for (const hookFile of HOOKS) {
    const event = EVENTS[hookFile];
    const cmds = (merged.hooks[event] ?? []).flatMap((e) => (e.hooks ?? []).map((h) => h.command));
    const wrappedCmd = wrapHookCommand(hookFile);

    // Wrapped form must appear exactly once (no double-wrapping).
    const occurrences = cmds.filter((c) => c === wrappedCmd).length;
    assert.equal(
      occurrences,
      1,
      `${event}: wrapped command for ${hookFile} must appear exactly once, found ${occurrences}`
    );

    // No legacy form should survive.
    for (const cmd of cmds) {
      if (cmd.includes(hookFile)) {
        assert.ok(
          isWrappedHook(cmd),
          `${event}: all glassdesk commands must be in wrapped form after migration, got: ${cmd}`
        );
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Fixture D (foreign hook): non-glassdesk hook coexisting with glassdesk hooks
// → migration touches only glassdesk entries.
// ---------------------------------------------------------------------------
test('Fixture D (foreign hook): foreign hook entries are never rewritten', async (_t) => {
  const { mergeSettings, wrapHookCommand } = await import(CLI_PATH);

  const foreignCmd = 'bash -c \'echo "not a glassdesk hook"\'';
  const existing = {
    hooks: {
      SessionStart: [
        { hooks: [{ type: 'command', command: 'node "${CLAUDE_PROJECT_DIR:-$PWD}/.claude/hooks/session-init.cjs"' }] },
        { hooks: [{ type: 'command', command: foreignCmd }] },
      ],
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PROJECT_DIR:-$PWD}/.claude/hooks/dev-rules-reminder.cjs"' }] }],
      SessionEnd: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PROJECT_DIR:-$PWD}/.claude/hooks/session-end.cjs"' }] }],
    },
    permissions: { allow: [], deny: [] },
    env: {},
  };

  const template = {
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: wrapHookCommand('session-init.cjs') }] }],
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: wrapHookCommand('dev-rules-reminder.cjs') }] }],
      SessionEnd: [{ hooks: [{ type: 'command', command: wrapHookCommand('session-end.cjs') }] }],
    },
    permissions: { allow: [], deny: [] },
    env: {},
  };

  const { merged } = mergeSettings(existing, template);

  // Foreign hook must survive verbatim.
  const sessionStartCmds = (merged.hooks.SessionStart ?? []).flatMap((e) => (e.hooks ?? []).map((h) => h.command));
  assert.ok(
    sessionStartCmds.includes(foreignCmd),
    `foreign hook command must survive mergeSettings untouched; SessionStart commands: ${JSON.stringify(sessionStartCmds)}`
  );

  // Glassdesk entry must have been migrated to wrapped form.
  const wrappedInit = wrapHookCommand('session-init.cjs');
  assert.ok(
    sessionStartCmds.includes(wrappedInit),
    'session-init.cjs must be in wrapped form after migration'
  );
});


// ---------------------------------------------------------------------------
// Fixture E (migration fires): legacy absolute-env entry, template does NOT
// include that hook event → migration must produce the wrapped command.
// This proves migrateHookCommandsToWrapped fires and rewrites the entry,
// as opposed to the wrapped command being added by mergeHookEntries.
// Regression guard for the "purge-before-migrate dead-path" bug.
// ---------------------------------------------------------------------------
test('Fixture E (migration fires): migration rewrites absolute-env legacy entry even when template omits that event', async (_t) => {
  const { mergeSettings, wrapHookCommand, isWrappedHook } = await import(CLI_PATH);

  // Existing settings: only SessionStart with the legacy absolute-env form.
  const existing = {
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PROJECT_DIR:-$PWD}/.claude/hooks/session-init.cjs"' }] }],
    },
    permissions: { allow: [], deny: [] },
    env: {},
  };

  // Template intentionally has ONLY UserPromptSubmit — no SessionStart entry.
  // If migration were dead (purge destroys before migration), SessionStart would
  // be empty after purge and the template would not re-add it (different event).
  // A live migration path rewrites the existing SessionStart entry in-place.
  const template = {
    hooks: {
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: wrapHookCommand('dev-rules-reminder.cjs') }] }],
    },
    permissions: { allow: [], deny: [] },
    env: {},
  };

  const { merged } = mergeSettings(existing, template);

  // SessionStart MUST still exist in merged output (not purged to nothing).
  assert.ok(
    Array.isArray(merged.hooks.SessionStart) && merged.hooks.SessionStart.length > 0,
    'SessionStart must still exist after migration — legacy entry should have been rewritten, not purged'
  );

  // The surviving command must be in wrapped form (migration fired).
  const sessionStartCmds = (merged.hooks.SessionStart ?? []).flatMap((e) => (e.hooks ?? []).map((h) => h.command));
  assert.ok(
    sessionStartCmds.length > 0,
    'SessionStart must have at least one command after migration'
  );
  for (const cmd of sessionStartCmds) {
    assert.ok(
      isWrappedHook(cmd),
      `SessionStart command must be in wrapped form after migration, got: ${cmd}`
    );
  }

  // The wrapped command must exactly match wrapHookCommand output (byte-for-byte).
  const expectedWrapped = wrapHookCommand('session-init.cjs');
  assert.ok(
    sessionStartCmds.includes(expectedWrapped),
    `SessionStart must contain the canonical wrapped command; found: ${JSON.stringify(sessionStartCmds)}`
  );

  // UserPromptSubmit must have been added by mergeHookEntries (template entry).
  const upsCmds = (merged.hooks.UserPromptSubmit ?? []).flatMap((e) => (e.hooks ?? []).map((h) => h.command));
  assert.ok(
    upsCmds.includes(wrapHookCommand('dev-rules-reminder.cjs')),
    'UserPromptSubmit template entry must be present'
  );
});
