import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  pluginRoot,
  registryPath,
  loadRegistry,
  loadSpecialist,
  listSpecialists,
} from '../../plugins/glassdesk/bin/lib/load-config.mjs';

// Fixtures for the specialist-parsing edge-case tests below must never be
// written into the shipped plugins/glassdesk/config/specialists/ directory —
// that is the real directory listSpecialists()/loadSpecialist() read for
// every consumer of this loader, including the copy `npx glassdesk init`
// installs into a user's project. Building each fixture under its own
// mkdtempSync() directory and passing it as the dirOverride argument means an
// abrupt test termination (timeout, SIGKILL, CI cancellation) leaves, at
// worst, a stray file under os.tmpdir() — never a phantom specialist profile
// in the production tree.
function makeSpecialistFixtureDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gd-specialist-fixture-'));
}

test('pluginRoot resolves to the directory holding bin/ and config/', () => {
  const root = pluginRoot();
  assert.ok(fs.existsSync(path.join(root, 'bin')), 'bin/ missing under plugin root');
  assert.ok(fs.existsSync(path.join(root, 'config')), 'config/ missing under plugin root');
});

test('registryPath defaults to config/external-providers.json under the plugin root', () => {
  delete process.env.GD_EXTERNAL_PROVIDERS;
  assert.equal(registryPath(), path.join(pluginRoot(), 'config', 'external-providers.json'));
});

test('GD_EXTERNAL_PROVIDERS overrides the registry path', () => {
  process.env.GD_EXTERNAL_PROVIDERS = '/tmp/custom-registry.json';
  assert.equal(registryPath(), '/tmp/custom-registry.json');
  delete process.env.GD_EXTERNAL_PROVIDERS;
});

test('loadRegistry returns the shipped registry with all six providers', () => {
  const reg = loadRegistry();
  assert.equal(reg.version, 1);
  assert.deepEqual(
    Object.keys(reg.providers).sort(),
    ['agy', 'codex', 'deepseek', 'kimi', 'local-openai', 'opencode'],
  );
  assert.equal(reg.defaults.mode, 'advisory');
});

test('loadRegistry throws a readable error on invalid JSON', () => {
  const tmp = path.join(os.tmpdir(), `bad-registry-${process.pid}.json`);
  fs.writeFileSync(tmp, '{ not json');
  assert.throws(() => loadRegistry(tmp), /external-providers/);
  fs.unlinkSync(tmp);
});

test('loadSpecialist parses frontmatter and body', () => {
  const s = loadSpecialist('code-reviewer');
  assert.equal(s.name, 'code-reviewer');
  assert.deepEqual(s.useFor, ['code-review']);
  assert.match(s.instructions, /severity/);
  assert.equal(s.instructions.includes('---'), false, 'frontmatter leaked into instructions');
});

test('loadSpecialist parses a multi-entry use_for list', () => {
  const s = loadSpecialist('adversarial-reviewer');
  assert.deepEqual(s.useFor, ['analysis', 'architecture-review', 'code-review', 'debugging']);
});

test('loadSpecialist returns null for an unknown profile', () => {
  assert.equal(loadSpecialist('no-such-profile'), null);
});

test('loadSpecialist rejects a path-traversal name', () => {
  assert.equal(loadSpecialist('../../../etc/passwd'), null);
});

test('listSpecialists returns the six shipped profiles', () => {
  assert.deepEqual(listSpecialists().sort(), [
    'adversarial-reviewer',
    'architecture-critic',
    'code-reviewer',
    'implementation-worker',
    'root-cause-debugger',
    'security-auditor',
  ]);
});

test('loadSpecialist tolerates CRLF line endings', () => {
  const dir = makeSpecialistFixtureDir();
  const name = 'crlf-test';
  const file = path.join(dir, `${name}.md`);
  const content =
    '---\r\n' +
    `name: ${name}\r\n` +
    'use_for: [debugging]\r\n' +
    '---\r\n' +
    '\r\n' +
    'Body text with CRLF endings.\r\n';
  fs.writeFileSync(file, content);
  try {
    const s = loadSpecialist(name, dir);
    assert.ok(s, 'a profile with CRLF line endings should still load');
    assert.equal(s.name, name);
    assert.deepEqual(s.useFor, ['debugging']);
    assert.match(s.instructions, /Body text with CRLF endings\./);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('loadSpecialist loads a profile with an inline use_for array', () => {
  const dir = makeSpecialistFixtureDir();
  const name = 'inline-usefor';
  const file = path.join(dir, `${name}.md`);
  fs.writeFileSync(file, `---\nname: ${name}\nuse_for: [debugging, analysis]\n---\n\nBody.\n`);
  try {
    const s = loadSpecialist(name, dir);
    assert.ok(s, 'inline use_for array should load');
    assert.deepEqual(s.useFor, ['debugging', 'analysis']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('loadSpecialist rejects a multi-line use_for list as malformed', () => {
  const dir = makeSpecialistFixtureDir();
  const name = 'multiline-usefor';
  const file = path.join(dir, `${name}.md`);
  fs.writeFileSync(
    file,
    `---\nname: ${name}\nuse_for:\n  - code-review\n  - debugging\n---\n\nBody.\n`,
  );
  try {
    assert.equal(
      loadSpecialist(name, dir),
      null,
      'a use_for key present but not in inline-array form must fail closed',
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('loadSpecialist loads with an empty useFor when the key is absent', () => {
  const dir = makeSpecialistFixtureDir();
  const name = 'no-usefor';
  const file = path.join(dir, `${name}.md`);
  fs.writeFileSync(file, `---\nname: ${name}\n---\n\nBody.\n`);
  try {
    const s = loadSpecialist(name, dir);
    assert.ok(s, 'a profile with no use_for key at all should still load');
    assert.deepEqual(s.useFor, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('loadSpecialist rethrows non-ENOENT read errors instead of swallowing them', { skip: process.getuid && process.getuid() === 0 }, () => {
  const dir = makeSpecialistFixtureDir();
  const name = 'unreadable';
  const file = path.join(dir, `${name}.md`);
  fs.writeFileSync(file, `---\nname: ${name}\nuse_for: [debugging]\n---\n\nBody.\n`);
  fs.chmodSync(file, 0o000);
  try {
    assert.throws(() => loadSpecialist(name, dir), /cannot read specialist profile/);
  } finally {
    fs.chmodSync(file, 0o644);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
