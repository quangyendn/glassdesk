import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPT = resolve(__dirname, '..', '..', 'scripts', 'guardrails', 'lint-commit-msg.js');
const REPO_ROOT = resolve(__dirname, '..', '..');

function runWith(message) {
  const dir = mkdtempSync(join(tmpdir(), 'guardrails-msg-'));
  const file = join(dir, 'COMMIT_EDITMSG');
  writeFileSync(file, message);
  try {
    execFileSync(process.execPath, [SCRIPT, file], {
      cwd: REPO_ROOT,
      stdio: 'pipe',
    });
    return { ok: true, stderr: '' };
  } catch (err) {
    return { ok: false, stderr: err.stderr ? err.stderr.toString() : String(err) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('accepts a valid Conventional Commits English subject', () => {
  const res = runWith('feat: add new scanner module\n');
  assert.equal(res.ok, true, res.stderr);
});

test('rejects Vietnamese diacritics', () => {
  const res = runWith('fix: sửa lỗi đăng nhập\n');
  assert.equal(res.ok, false);
  assert.match(res.stderr, /Vietnamese/);
});

test('rejects non-Conventional subject', () => {
  const res = runWith('updated some stuff\n');
  assert.equal(res.ok, false);
  assert.match(res.stderr, /Conventional Commits/);
});

test('rejects personal home path in body', () => {
  const res = runWith('feat: add config\n\nReads from /Users/yennq/.config/app\n');
  assert.equal(res.ok, false);
  assert.match(res.stderr, /personal-macos-home/);
});

test('strips comment lines before validating', () => {
  const res = runWith('feat: add scanner\n# Sửa lỗi (this is a comment)\n');
  assert.equal(res.ok, true, res.stderr);
});

test('rejects empty message', () => {
  const res = runWith('# only comments\n');
  assert.equal(res.ok, false);
  assert.match(res.stderr, /Empty commit message/);
});
