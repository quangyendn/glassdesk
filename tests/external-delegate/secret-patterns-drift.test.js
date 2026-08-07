import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DENY_PATH_GLOBS,
  SECRET_CONTENT_PATTERNS,
  globToRegExp,
  matchesDenyGlob,
  scanForSecrets,
} from '../../plugins/glassdesk/bin/lib/secret-patterns.mjs';
import { CLOUD_TOKEN_PATTERNS } from '../../scripts/guardrails/lib/patterns.js';

test('globToRegExp: * does not cross a path separator', () => {
  assert.equal(globToRegExp('*.pem').test('key.pem'), true);
  assert.equal(globToRegExp('*.pem').test('certs/key.pem'), false);
});

test('globToRegExp: ** crosses separators', () => {
  assert.equal(globToRegExp('**/secrets/**').test('a/b/secrets/c/d.txt'), true);
  assert.equal(globToRegExp('**/secrets/**').test('secrets/d.txt'), true);
});

test('matchesDenyGlob: matches on basename as well as full path', () => {
  assert.ok(matchesDenyGlob('config/.env.local'));
  assert.ok(matchesDenyGlob('.env'));
  assert.ok(matchesDenyGlob('deploy/id_rsa'));
  assert.equal(matchesDenyGlob('src/environment.ts'), null);
});

test('scanForSecrets: finds a private key header and an AWS key', () => {
  const hits = scanForSecrets('-----BEGIN RSA PRIVATE KEY-----\nAKIAIOSFODNN7EXAMPLE\n');
  const ids = hits.map((h) => h.id).sort();
  assert.deepEqual(ids, ['aws-access-key', 'private-key-block']);
});

test('scanForSecrets: never returns the matched text', () => {
  const hits = scanForSecrets('token = "ghp_abcdefghijklmnopqrstuvwxyz0123456789"');
  assert.ok(hits.length > 0);
  assert.equal(JSON.stringify(hits).includes('ghp_'), false);
});

test('scanForSecrets: clean text yields no hits', () => {
  assert.deepEqual(scanForSecrets('export function add(a, b) { return a + b; }'), []);
});

// Drift guard: the plugin copy must not silently fall behind the guardrails
// source. Every cloud-token pattern id there must exist here.
test('no drift from scripts/guardrails/lib/patterns.js', () => {
  const local = new Set(SECRET_CONTENT_PATTERNS.map((p) => p.id));
  for (const p of CLOUD_TOKEN_PATTERNS) {
    assert.ok(local.has(p.id), `secret-patterns.mjs is missing pattern id "${p.id}"`);
  }
});

test('DENY_PATH_GLOBS covers the documented set', () => {
  for (const g of ['.env*', '**/secrets/**', '**/credentials*', '*.pem', 'id_rsa*']) {
    assert.ok(DENY_PATH_GLOBS.includes(g), `missing deny glob ${g}`);
  }
});
