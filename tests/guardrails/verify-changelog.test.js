import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPT = resolve(__dirname, '..', '..', 'scripts', 'guardrails', 'verify-changelog.js');

function setupSandbox({ version, changelog }) {
  const dir = mkdtempSync(join(tmpdir(), 'guardrails-changelog-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version }));
  if (changelog !== undefined) {
    writeFileSync(join(dir, 'CHANGELOG.md'), changelog);
  }
  return dir;
}

function run(cwd) {
  try {
    execFileSync(process.execPath, [SCRIPT], { cwd, stdio: 'pipe' });
    return { ok: true };
  } catch (err) {
    return { ok: false, stderr: err.stderr?.toString() ?? '' };
  }
}

test('passes when changelog mentions the version', () => {
  const dir = setupSandbox({ version: '1.2.3', changelog: '# Changelog\n\n## [1.2.3] - 2026-01-01\n' });
  const res = run(dir);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(res.ok, true);
});

test('fails when changelog missing version', () => {
  const dir = setupSandbox({ version: '9.9.9', changelog: '# Changelog\n\n## [1.0.0] - 2025-01-01\n' });
  const res = run(dir);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(res.ok, false);
  assert.match(res.stderr, /does not mention version 9\.9\.9/);
});

test('fails when no changelog file present', () => {
  const dir = setupSandbox({ version: '1.0.0' });
  const res = run(dir);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(res.ok, false);
  assert.match(res.stderr, /No CHANGELOG\.md found/);
});
