'use strict';

/**
 * Tests for ensureClaudeSubdirSymlinks and cleanupClaudeSubdirSymlinks.
 * Uses node:test (built-in since Node 18) with os.tmpdir() fixtures.
 * Does NOT test ensureWorktreeSymlinks end-to-end (that requires a live git worktree).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { ensureClaudeSubdirSymlinks, cleanupClaudeSubdirSymlinks } = require(
  path.resolve(__dirname, '..', 'plugins', 'glassdesk', 'hooks', 'lib', 'gd-config-utils.cjs')
);

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/**
 * Creates a pair of temp directories simulating <mainRoot> and <worktreeRoot>.
 * Returns { mainRoot, worktreeRoot, cleanup }.
 */
function makeFixtureDirs() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-test-'));
  const mainRoot = path.join(base, 'main');
  const worktreeRoot = path.join(base, 'worktree');
  fs.mkdirSync(mainRoot, { recursive: true });
  fs.mkdirSync(worktreeRoot, { recursive: true });

  function cleanup() {
    fs.rmSync(base, { recursive: true, force: true });
  }

  return { mainRoot, worktreeRoot, cleanup };
}

/**
 * Creates a `.claude/<name>` directory in the given root (simulates main having the subdir).
 */
function createClaudeSubdir(root, name) {
  fs.mkdirSync(path.join(root, '.claude', name), { recursive: true });
}

// ---------------------------------------------------------------------------
// T1: Fresh worktree (no .claude/) — all subdirs created as symlinks
// ---------------------------------------------------------------------------
test('T1: fresh worktree gets all subdirs created as symlinks pointing to main', (_t) => {
  const { mainRoot, worktreeRoot, cleanup } = makeFixtureDirs();
  try {
    const names = ['commands', 'agents', 'skills'];
    // Create target dirs in main
    names.forEach(n => createClaudeSubdir(mainRoot, n));

    const result = ensureClaudeSubdirSymlinks(worktreeRoot, mainRoot, names);

    assert.deepEqual(result.created, names, 'all three names should be created');
    assert.equal(result.skipped.length, 0, 'nothing should be skipped');
    assert.equal(result.warned.length, 0, 'no warnings');

    // Verify each is a symlink pointing to main
    for (const name of names) {
      const linkPath = path.join(worktreeRoot, '.claude', name);
      const st = fs.lstatSync(linkPath);
      assert.ok(st.isSymbolicLink(), `${name} should be a symlink`);
      const resolved = fs.realpathSync(linkPath);
      const expected = fs.realpathSync(path.join(mainRoot, '.claude', name));
      assert.equal(resolved, expected, `${name} symlink should point to main`);
    }
  } finally {
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// T2: Re-run on already-symlinked worktree — idempotent (no diff)
// ---------------------------------------------------------------------------
test('T2: re-run on already-symlinked worktree is idempotent (mtime unchanged)', (_t) => {
  const { mainRoot, worktreeRoot, cleanup } = makeFixtureDirs();
  try {
    const names = ['commands', 'skills'];
    names.forEach(n => createClaudeSubdir(mainRoot, n));

    // First run
    ensureClaudeSubdirSymlinks(worktreeRoot, mainRoot, names);

    // Capture mtimes after first run
    const mtimesAfterFirst = names.map(n => {
      const st = fs.lstatSync(path.join(worktreeRoot, '.claude', n));
      return st.mtimeMs;
    });

    // Second run
    const result2 = ensureClaudeSubdirSymlinks(worktreeRoot, mainRoot, names);

    assert.equal(result2.created.length, 0, 'second run should create nothing');
    assert.deepEqual(result2.skipped, names, 'second run should skip all (already correct)');

    // Verify mtimes unchanged
    const mtimesAfterSecond = names.map(n => {
      const st = fs.lstatSync(path.join(worktreeRoot, '.claude', n));
      return st.mtimeMs;
    });
    assert.deepEqual(mtimesAfterFirst, mtimesAfterSecond, 'lstat mtimes must be unchanged on idempotent run');
  } finally {
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// T3: Worktree has real .claude/commands/ (not symlink) — skip, others created
// ---------------------------------------------------------------------------
test('T3: worktree with real .claude/commands/ — skipped, others created', (_t) => {
  const { mainRoot, worktreeRoot, cleanup } = makeFixtureDirs();
  try {
    const names = ['commands', 'agents'];
    names.forEach(n => createClaudeSubdir(mainRoot, n));

    // Create real dir for 'commands' in worktree
    fs.mkdirSync(path.join(worktreeRoot, '.claude', 'commands'), { recursive: true });

    const result = ensureClaudeSubdirSymlinks(worktreeRoot, mainRoot, names);

    assert.ok(result.skipped.includes('commands'), 'commands should be skipped (real dir)');
    assert.ok(result.created.includes('agents'), 'agents should be created');

    // commands must still be a real dir (untouched)
    const commandsSt = fs.lstatSync(path.join(worktreeRoot, '.claude', 'commands'));
    assert.ok(!commandsSt.isSymbolicLink(), 'commands must remain a real dir');

    // agents must be a symlink
    const agentsSt = fs.lstatSync(path.join(worktreeRoot, '.claude', 'agents'));
    assert.ok(agentsSt.isSymbolicLink(), 'agents must be a symlink');
  } finally {
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// T4: Stale symlink (target deleted) — re-created on next run
// ---------------------------------------------------------------------------
test('T4: stale symlink (target deleted from main) is re-created when target is restored', (_t) => {
  const { mainRoot, worktreeRoot, cleanup } = makeFixtureDirs();
  try {
    const names = ['skills'];
    createClaudeSubdir(mainRoot, 'skills');

    // First run — creates symlink
    ensureClaudeSubdirSymlinks(worktreeRoot, mainRoot, names);

    // Delete target in main — symlink becomes dangling
    fs.rmSync(path.join(mainRoot, '.claude', 'skills'), { recursive: true, force: true });

    // Second run with deleted target — should skip (target missing in main)
    const result2 = ensureClaudeSubdirSymlinks(worktreeRoot, mainRoot, names);
    // When target is gone, the symlink is dangling. We skip because target doesn't exist.
    // (ensureClaudeSubdirSymlinks checks fs.existsSync(target) before proceeding)
    assert.equal(result2.created.length, 0, 'should not create when target is missing');

    // Restore target in main
    createClaudeSubdir(mainRoot, 'skills');

    // Third run — now stale symlink should be removed and recreated
    const result3 = ensureClaudeSubdirSymlinks(worktreeRoot, mainRoot, names);
    assert.ok(
      result3.created.includes('skills') || result3.skipped.includes('skills'),
      'skills should be created or skipped (already correct) after target is restored'
    );

    // Confirm symlink is valid
    const st = fs.lstatSync(path.join(worktreeRoot, '.claude', 'skills'));
    assert.ok(st.isSymbolicLink(), 'skills should be a symlink after restore');
    const resolved = fs.realpathSync(path.join(worktreeRoot, '.claude', 'skills'));
    const expected = fs.realpathSync(path.join(mainRoot, '.claude', 'skills'));
    assert.equal(resolved, expected, 'skills symlink should resolve to main');
  } finally {
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// T5: Main has no .claude/<name>/ for one entry — logged + skipped, rest created
// ---------------------------------------------------------------------------
test('T5: missing target in main is skipped; other names still created', (_t) => {
  const { mainRoot, worktreeRoot, cleanup } = makeFixtureDirs();
  try {
    // Only create 'agents' in main; 'workflows' is absent
    createClaudeSubdir(mainRoot, 'agents');

    const names = ['agents', 'workflows'];
    const result = ensureClaudeSubdirSymlinks(worktreeRoot, mainRoot, names);

    assert.ok(result.created.includes('agents'), 'agents should be created');
    assert.ok(result.skipped.includes('workflows'), 'workflows should be skipped (no target in main)');

    // agents is a symlink
    const agentsSt = fs.lstatSync(path.join(worktreeRoot, '.claude', 'agents'));
    assert.ok(agentsSt.isSymbolicLink(), 'agents must be a symlink');

    // workflows does not exist in worktree
    assert.throws(
      () => fs.lstatSync(path.join(worktreeRoot, '.claude', 'workflows')),
      { code: 'ENOENT' },
      'workflows should not exist in worktree'
    );
  } finally {
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// T6: cleanupClaudeSubdirSymlinks removes symlinks but leaves real dirs
// ---------------------------------------------------------------------------
test('T6: cleanup removes symlinks but leaves real dirs; hooks/ is never removed', (_t) => {
  const { mainRoot, worktreeRoot, cleanup } = makeFixtureDirs();
  try {
    const names = ['commands', 'agents', 'skills'];
    names.forEach(n => createClaudeSubdir(mainRoot, n));

    // Ensure worktree has all symlinks
    ensureClaudeSubdirSymlinks(worktreeRoot, mainRoot, names);

    // Also create a real dir for 'commands' replacement scenario:
    // We'll re-create 'commands' as a real dir (after removing the symlink) to test
    // that cleanup leaves real dirs alone.
    const commandsLink = path.join(worktreeRoot, '.claude', 'commands');
    fs.unlinkSync(commandsLink); // remove symlink first
    fs.mkdirSync(commandsLink, { recursive: true }); // replace with real dir

    // Also create a simulated hooks symlink (should be excluded from cleanup)
    createClaudeSubdir(mainRoot, 'hooks');
    ensureClaudeSubdirSymlinks(worktreeRoot, mainRoot, ['hooks']);

    // Run cleanup on all + hooks
    const result = cleanupClaudeSubdirSymlinks(worktreeRoot, [...names, 'hooks']);

    // agents and skills (symlinks) should be removed
    assert.ok(result.unlinked.includes('agents'), 'agents symlink should be unlinked');
    assert.ok(result.unlinked.includes('skills'), 'skills symlink should be unlinked');

    // commands (real dir) should not be touched
    assert.ok(!result.unlinked.includes('commands'), 'real dir commands must not be unlinked');
    const commandsSt = fs.lstatSync(path.join(worktreeRoot, '.claude', 'commands'));
    assert.ok(!commandsSt.isSymbolicLink(), 'commands must still be a real dir after cleanup');

    // hooks should be skipped (excluded by design)
    assert.ok(result.skipped.includes('hooks'), 'hooks must be in skipped list');
    const hooksSt = fs.lstatSync(path.join(worktreeRoot, '.claude', 'hooks'));
    assert.ok(hooksSt.isSymbolicLink(), 'hooks symlink must persist after cleanup');

    // agents and skills should no longer exist
    assert.throws(
      () => fs.lstatSync(path.join(worktreeRoot, '.claude', 'agents')),
      { code: 'ENOENT' },
      'agents should not exist after cleanup'
    );
    assert.throws(
      () => fs.lstatSync(path.join(worktreeRoot, '.claude', 'skills')),
      { code: 'ENOENT' },
      'skills should not exist after cleanup'
    );
  } finally {
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// Extra: self-symlink guard (mainRoot === worktreeRoot returns empty result)
// ---------------------------------------------------------------------------
test('self-symlink guard: mainRoot === worktreeRoot returns empty result', (_t) => {
  const { mainRoot, cleanup } = makeFixtureDirs();
  try {
    const result = ensureClaudeSubdirSymlinks(mainRoot, mainRoot, ['commands']);
    assert.deepEqual(result, { created: [], skipped: [], warned: [] },
      'self-symlink must return empty result without throwing');
  } finally {
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// Extra: invalid names are warned and not created
// ---------------------------------------------------------------------------
test('invalid name (with slash) is warned and not created', (_t) => {
  const { mainRoot, worktreeRoot, cleanup } = makeFixtureDirs();
  try {
    const result = ensureClaudeSubdirSymlinks(worktreeRoot, mainRoot, ['../evil', '.hidden', 'valid-name']);
    assert.ok(result.warned.includes('../evil'), '../evil should be warned');
    assert.ok(result.warned.includes('.hidden'), '.hidden should be warned');
    // valid-name would be skipped (no target in main), not warned
    assert.ok(!result.warned.includes('valid-name'), 'valid-name should not be warned');
  } finally {
    cleanup();
  }
});
