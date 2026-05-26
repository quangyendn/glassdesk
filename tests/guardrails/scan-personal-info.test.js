import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPT = resolve(__dirname, '..', '..', 'scripts', 'guardrails', 'scan-personal-info.js');
const REPO_ROOT = resolve(__dirname, '..', '..');

function run(args, { cwd = REPO_ROOT } = {}) {
  try {
    execFileSync(process.execPath, [SCRIPT, ...args], { cwd, stdio: 'pipe' });
    return { ok: true };
  } catch (err) {
    return { ok: false, stderr: err.stderr?.toString() ?? '' };
  }
}

test('--files flags a leaky file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'guardrails-pi-'));
  const file = join(dir, 'leak.js');
  writeFileSync(file, 'const home = "/Users/jdoe/secrets";\n');
  const res = run(['--files', file]);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(res.ok, false);
  assert.match(res.stderr, /personal-macos-home/);
});

test('--files passes on clean content', () => {
  const dir = mkdtempSync(join(tmpdir(), 'guardrails-pi-'));
  const file = join(dir, 'ok.js');
  writeFileSync(file, 'export const x = 1;\n');
  const res = run(['--files', file]);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(res.ok, true, res.stderr);
});
