// Integration test: --staged mode must read the index blob (`git show :path`),
// NOT the working tree. Otherwise a contributor can stage a leaky blob, revert
// the working tree to clean content, and bypass the scanner while still
// committing the sensitive staged blob.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT_REL = 'scripts/guardrails/scan-personal-info.js';

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

function setupSandbox() {
  const sandbox = mkdtempSync(join(tmpdir(), 'guardrails-staged-'));

  // Vendor in the scanner + lib so it runs with an identical relative layout.
  mkdirSync(join(sandbox, 'scripts', 'guardrails', 'lib'), { recursive: true });
  cpSync(join(REPO_ROOT, SCRIPT_REL), join(sandbox, SCRIPT_REL));
  cpSync(
    join(REPO_ROOT, 'scripts', 'guardrails', 'lib'),
    join(sandbox, 'scripts', 'guardrails', 'lib'),
    { recursive: true },
  );
  // Minimal guardrails config in sandbox (no path allowlist).
  writeFileSync(
    join(sandbox, '.guardrails.json'),
    JSON.stringify({
      internalRefs: [],
      emailAllowlist: ['@example.com'],
      pathAllowlist: [],
    }),
  );

  git(['init', '-q', '-b', 'main'], sandbox);
  git(['config', 'user.email', 'test@example.com'], sandbox);
  git(['config', 'user.name', 'Test'], sandbox);
  return sandbox;
}

function run(cwd) {
  try {
    execFileSync(process.execPath, [SCRIPT_REL, '--staged'], { cwd, stdio: 'pipe' });
    return { ok: true, stderr: '' };
  } catch (err) {
    return { ok: false, stderr: err.stderr?.toString() ?? '' };
  }
}

test('flags a leaky staged blob (working tree clean)', () => {
  const dir = setupSandbox();
  const file = join(dir, 'leak.js');
  // Stage a leaky version, then overwrite working tree with clean content.
  writeFileSync(file, 'const home = "/Users/jdoe/secrets";\n');
  git(['add', 'leak.js'], dir);
  writeFileSync(file, 'export const x = 1;\n');

  const res = run(dir);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(res.ok, false, 'scanner should have detected the staged blob');
  assert.match(res.stderr, /personal-macos-home/);
});

test('passes when staged blob is clean even if working tree is dirty', () => {
  const dir = setupSandbox();
  const file = join(dir, 'ok.js');
  writeFileSync(file, 'export const x = 1;\n');
  git(['add', 'ok.js'], dir);
  // Working tree introduces a leak that is NOT staged.
  writeFileSync(file, 'const p = "/Users/jdoe/wip";\n');

  const res = run(dir);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(res.ok, true, res.stderr);
});

test('flags partial stage (`git add -p`) when leak is in the staged hunk', () => {
  const dir = setupSandbox();
  const file = join(dir, 'mixed.js');
  writeFileSync(file, 'export const x = 1;\n');
  git(['add', 'mixed.js'], dir);
  git(['commit', '-m', 'init', '-q'], dir);

  // Stage a leaky update, then revert working tree.
  writeFileSync(file, 'const home = "/Users/jdoe/.config";\nexport const x = 1;\n');
  git(['add', 'mixed.js'], dir);
  writeFileSync(file, 'export const x = 1;\n');

  const res = run(dir);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(res.ok, false, 'scanner should have detected the staged leak');
  assert.match(res.stderr, /personal-macos-home/);
});
