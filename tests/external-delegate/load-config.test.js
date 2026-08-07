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
