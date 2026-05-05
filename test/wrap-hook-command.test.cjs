'use strict';

// Unit tests for wrapHookCommand and WRAPPED_GLASSDESK_HOOK_RE.
// Uses node:test (built-in since Node 18) with dynamic import() to load the
// ESM bin/cli.js from this CommonJS test file.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Resolve the CLI path relative to this test file's directory (test/ -> bin/).
const CLI_PATH = pathToFileURL(path.resolve(__dirname, '..', 'bin', 'cli.js')).href;

// ---------------------------------------------------------------------------
// Canonical output: locked literal from plan.md §Locked Constraints and
// research/02-wrapper-compat.md §D, substituting session-init.cjs.
// ---------------------------------------------------------------------------
const CANONICAL_SESSION_INIT =
  "bash -c 'C=\"${CLAUDE_PROJECT_DIR:-$PWD}\"; " +
  'H="$C/.claude/hooks/session-init.cjs"; ' +
  'if [ ! -e "$H" ]; then ' +
  'G=$(git -C "$C" rev-parse --git-common-dir 2>/dev/null); ' +
  'if [ -n "$G" ]; then ' +
  'M=$(dirname "$G"); ' +
  'if [ -d "$M/.claude/hooks" ] && [ "$M" != "$C" ]; then ' +
  'mkdir -p "$C/.claude"; ' +
  'ln -sfn "$M/.claude/hooks" "$C/.claude/hooks"; ' +
  "fi; fi; fi; " +
  '[ -e "$H" ] && exec node "$H"\'';

test('wrapHookCommand("session-init.cjs") returns canonical locked literal', async (t) => {
  const { wrapHookCommand } = await import(CLI_PATH);
  const result = wrapHookCommand('session-init.cjs');
  assert.equal(result, CANONICAL_SESSION_INIT,
    'Output must match locked literal from plan.md byte-for-byte');
});

test('JSON round-trip: JSON.parse(JSON.stringify(wrapHookCommand(...))) is identical', async (t) => {
  const { wrapHookCommand } = await import(CLI_PATH);
  const original = wrapHookCommand('foo.cjs');
  const roundTripped = JSON.parse(JSON.stringify(original));
  assert.equal(roundTripped, original,
    'JSON round-trip must produce identical string');
});

test('JSON-stringified value contains no unescaped double-quotes', async (t) => {
  const { wrapHookCommand } = await import(CLI_PATH);
  const cmd = wrapHookCommand('session-init.cjs');
  const jsonStr = JSON.stringify(cmd);
  // jsonStr starts and ends with a literal `"`. The interior must not contain
  // unescaped `"` — i.e. every `"` inside must be preceded by `\`.
  const interior = jsonStr.slice(1, -1);
  // Verify no raw (unescaped) double-quote in interior
  assert.doesNotMatch(interior, /(?<!\\)"/,
    'JSON interior must not contain unescaped double-quotes');
});

test('three hook filenames produce three different literals differing only in hook filename', async (t) => {
  const { wrapHookCommand } = await import(CLI_PATH);
  const hooks = ['session-init.cjs', 'dev-rules-reminder.cjs', 'session-end.cjs'];
  const results = hooks.map((h) => wrapHookCommand(h));

  // All three must be distinct
  assert.notEqual(results[0], results[1], 'session-init vs dev-rules-reminder must differ');
  assert.notEqual(results[0], results[2], 'session-init vs session-end must differ');
  assert.notEqual(results[1], results[2], 'dev-rules-reminder vs session-end must differ');

  // They must differ ONLY in the hook filename slot — verify by normalising
  // the hook filename back to a placeholder and checking the rest is identical.
  const normalised = results.map((r, i) => r.replace(hooks[i], '<HOOK>'));
  assert.equal(normalised[0], normalised[1],
    'session-init and dev-rules-reminder wrappers must be identical except for hook filename');
  assert.equal(normalised[0], normalised[2],
    'session-init and session-end wrappers must be identical except for hook filename');
});

test('invalid inputs throw TypeError: empty string', async (t) => {
  const { wrapHookCommand } = await import(CLI_PATH);
  assert.throws(() => wrapHookCommand(''), { name: 'TypeError' });
});

test('invalid inputs throw TypeError: path with slash "a/b.cjs"', async (t) => {
  const { wrapHookCommand } = await import(CLI_PATH);
  assert.throws(() => wrapHookCommand('a/b.cjs'), { name: 'TypeError' });
});

test('invalid inputs throw TypeError: path traversal "../bad.cjs"', async (t) => {
  const { wrapHookCommand } = await import(CLI_PATH);
  assert.throws(() => wrapHookCommand('../bad.cjs'), { name: 'TypeError' });
});

test('invalid inputs throw TypeError: null', async (t) => {
  const { wrapHookCommand } = await import(CLI_PATH);
  assert.throws(() => wrapHookCommand(null), { name: 'TypeError' });
});

test('invalid inputs throw TypeError: undefined', async (t) => {
  const { wrapHookCommand } = await import(CLI_PATH);
  assert.throws(() => wrapHookCommand(undefined), { name: 'TypeError' });
});

test('WRAPPED_GLASSDESK_HOOK_RE matches wrapped session-init command', async (t) => {
  const { wrapHookCommand, WRAPPED_GLASSDESK_HOOK_RE } = await import(CLI_PATH);
  const cmd = wrapHookCommand('session-init.cjs');
  assert.match(cmd, WRAPPED_GLASSDESK_HOOK_RE,
    'WRAPPED_GLASSDESK_HOOK_RE must match output of wrapHookCommand');
});

test('WRAPPED_GLASSDESK_HOOK_RE matches wrapped dev-rules-reminder command', async (t) => {
  const { wrapHookCommand, WRAPPED_GLASSDESK_HOOK_RE } = await import(CLI_PATH);
  const cmd = wrapHookCommand('dev-rules-reminder.cjs');
  assert.match(cmd, WRAPPED_GLASSDESK_HOOK_RE);
});

test('WRAPPED_GLASSDESK_HOOK_RE does not match plain node hook command', async (t) => {
  const { WRAPPED_GLASSDESK_HOOK_RE } = await import(CLI_PATH);
  const staleCmd = 'node .claude/hooks/session-init.cjs';
  assert.doesNotMatch(staleCmd, WRAPPED_GLASSDESK_HOOK_RE,
    'WRAPPED_GLASSDESK_HOOK_RE must not match legacy stale hook format');
});

test('WRAPPED_GLASSDESK_HOOK_RE does not match unrelated bash -c command', async (t) => {
  const { WRAPPED_GLASSDESK_HOOK_RE } = await import(CLI_PATH);
  const unrelated = 'bash -c \'echo hello\'';
  assert.doesNotMatch(unrelated, WRAPPED_GLASSDESK_HOOK_RE,
    'WRAPPED_GLASSDESK_HOOK_RE must not match unrelated bash commands');
});
