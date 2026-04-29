import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const SCRIPT = path.resolve('plugins/glassdesk/scripts/resolve-spec-input.cjs');
const FIXTURES = path.resolve('tests/fixtures/specs');
const FIXTURES_SKIPPED = path.resolve('tests/fixtures/specs-skipped');
const FIXTURES_EMPTY = path.resolve('tests/fixtures/specs-empty');

function runResolve(arg, specsDir = FIXTURES) {
  const args = arg === undefined ? [SCRIPT] : [SCRIPT, arg];
  const out = execFileSync('node', args, {
    env: { ...process.env, GLASSDESK_SPECS_DIR: specsDir },
    encoding: 'utf8',
  });
  return JSON.parse(out.trim());
}

test('empty arg + populated specs dir → spec-confirm with latest eligible', () => {
  const r = runResolve(undefined, FIXTURES);
  assert.equal(r.mode, 'spec-confirm');
  // Same-day (260429) tiebreak: feature-a wins lexicographically over feature-b
  assert.match(r.path, /260429-feature-a\.md$/);
  assert.equal(r.date, '260429');
  assert.equal(r.status, 'draft');
  assert.match(r.summary, /Feature A handles the alpha workflow/);
});

test('empty arg + empty specs dir → task mode with empty text', () => {
  const r = runResolve(undefined, FIXTURES_EMPTY);
  assert.equal(r.mode, 'task');
  assert.equal(r.text, '');
});

test('empty arg + only done/archived specs → task mode with empty text', () => {
  const r = runResolve(undefined, FIXTURES_SKIPPED);
  assert.equal(r.mode, 'task');
  assert.equal(r.text, '');
});

test('arg = existing file path → spec mode', () => {
  const file = path.join(FIXTURES, '260428-feature-e.md');
  const r = runResolve(file, FIXTURES);
  assert.equal(r.mode, 'spec');
  assert.equal(r.path, file);
});

test('arg = path-like but missing → error mode', () => {
  const missing = 'docs/specs/does-not-exist.md';
  const r = runResolve(missing, FIXTURES);
  assert.equal(r.mode, 'error');
  assert.equal(r.reason, 'path-not-found');
  assert.equal(r.arg, missing);
});

test('arg = path-like with slash but missing → error mode', () => {
  const missing = 'some/nope/path';
  const r = runResolve(missing, FIXTURES);
  assert.equal(r.mode, 'error');
  assert.equal(r.reason, 'path-not-found');
});

test('arg = free text → task mode', () => {
  const r = runResolve('add login feature', FIXTURES);
  assert.equal(r.mode, 'task');
  assert.equal(r.text, 'add login feature');
});

test('two specs same date → lexicographically first wins', () => {
  // Test fixtures contain 260429-feature-a.md (draft) and 260429-feature-b.md (approved).
  // Resolver should pick feature-a (lex first), regardless of status as long as both eligible.
  const r = runResolve(undefined, FIXTURES);
  assert.equal(r.mode, 'spec-confirm');
  assert.match(r.path, /260429-feature-a\.md$/);
});

test('GLASSDESK_SPECS_DIR override works (sanity)', () => {
  // Build a tmp dir on the fly with a single eligible spec.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-resolve-'));
  fs.writeFileSync(
    path.join(tmp, '260101-isolated.md'),
    '---\nstatus: draft\n---\n\n## Problem\nIsolated fixture.\n'
  );
  const r = runResolve(undefined, tmp);
  assert.equal(r.mode, 'spec-confirm');
  assert.match(r.path, /260101-isolated\.md$/);
  fs.rmSync(tmp, { recursive: true, force: true });
});
