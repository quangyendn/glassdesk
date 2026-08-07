import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EXIT } from '../../plugins/glassdesk/bin/lib/exit-codes.mjs';
import {
  which,
  probeProvider,
  probeAll,
} from '../../plugins/glassdesk/bin/lib/provider-availability.mjs';

// Build a scratch dir holding one executable stub, and scope PATH to it so the
// probe cannot see the developer's real CLIs.
function stubPath(binNames) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-ext-bin-'));
  for (const n of binNames) {
    const p = path.join(dir, n);
    fs.writeFileSync(p, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(p, 0o755);
  }
  return dir;
}

function withPath(dir, fn) {
  const saved = process.env.PATH;
  process.env.PATH = dir;
  try {
    return fn();
  } finally {
    process.env.PATH = saved;
  }
}

test('EXIT codes match the documented contract', () => {
  assert.deepEqual(EXIT, {
    OK: 0, UNAVAILABLE: 10, AUTH: 11, UNSUPPORTED: 12,
    PRIVACY: 13, TIMEOUT: 14, FAILURE: 20,
  });
});

test('which finds an executable on PATH and misses a non-executable', () => {
  const dir = stubPath(['fakecli']);
  fs.writeFileSync(path.join(dir, 'notexec'), 'x');
  fs.chmodSync(path.join(dir, 'notexec'), 0o644);
  withPath(dir, () => {
    assert.equal(which('fakecli'), path.join(dir, 'fakecli'));
    assert.equal(which('notexec'), null);
    assert.equal(which('definitely-not-here'), null);
  });
});

test('cli-agent with its binary present is available', () => {
  const dir = stubPath(['opencode']);
  withPath(dir, () => {
    const p = probeProvider('opencode', { type: 'cli-agent', enabled: 'auto', bin: 'opencode' });
    assert.equal(p.available, true);
    assert.equal(p.reason, null);
  });
});

test('cli-agent with a missing binary reports UNAVAILABLE', () => {
  const dir = stubPath([]);
  withPath(dir, () => {
    const p = probeProvider('codex', { type: 'cli-agent', enabled: 'auto', bin: 'codex' });
    assert.equal(p.available, false);
    assert.equal(p.code, EXIT.UNAVAILABLE);
    assert.match(p.reason, /not on PATH/);
  });
});

test('enabled:false is UNAVAILABLE even when the binary exists', () => {
  const dir = stubPath(['opencode']);
  withPath(dir, () => {
    const p = probeProvider('opencode', { type: 'cli-agent', enabled: false, bin: 'opencode' });
    assert.equal(p.available, false);
    assert.equal(p.code, EXIT.UNAVAILABLE);
    assert.match(p.reason, /disabled/);
  });
});

test('openai-compatible without base_url is UNAVAILABLE, not AUTH', () => {
  delete process.env.TEST_BASE;
  delete process.env.TEST_KEY;
  const p = probeProvider('t', {
    type: 'openai-compatible', enabled: 'auto',
    env: { base_url: 'TEST_BASE', api_key: 'TEST_KEY', model: 'TEST_MODEL' },
    endpoint_defaults: {},
  });
  assert.equal(p.available, false);
  assert.equal(p.code, EXIT.UNAVAILABLE);
});

test('openai-compatible with base_url but no key is AUTH', () => {
  process.env.TEST_BASE = 'https://example.test/v1';
  delete process.env.TEST_KEY;
  const p = probeProvider('t', {
    type: 'openai-compatible', enabled: 'auto',
    env: { base_url: 'TEST_BASE', api_key: 'TEST_KEY', model: 'TEST_MODEL' },
    endpoint_defaults: {},
  });
  assert.equal(p.available, false);
  assert.equal(p.code, EXIT.AUTH);
  delete process.env.TEST_BASE;
});

test('a local-only provider needs no api_key to be available', () => {
  process.env.TEST_BASE = 'http://127.0.0.1:11434/v1';
  delete process.env.TEST_KEY;
  const p = probeProvider('local', {
    type: 'openai-compatible', enabled: 'auto',
    privacy: { execution: 'local-only', restricted_data_allowed: true },
    env: { base_url: 'TEST_BASE', api_key: 'TEST_KEY', model: 'TEST_MODEL' },
    endpoint_defaults: {},
  });
  assert.equal(p.available, true);
  delete process.env.TEST_BASE;
});

test('endpoint_defaults.base_url does NOT make a provider available on its own', () => {
  delete process.env.TEST_BASE;
  const p = probeProvider('t', {
    type: 'openai-compatible', enabled: 'auto',
    env: { base_url: 'TEST_BASE', api_key: 'TEST_KEY', model: 'TEST_MODEL' },
    endpoint_defaults: { base_url: 'https://api.example.test/v1' },
  });
  assert.equal(p.available, false, 'a shipped default must not imply the user configured it');
});

test('probeAll orders by priority', () => {
  const dir = stubPath([]);
  withPath(dir, () => {
    const reg = {
      providers: {
        b: { type: 'cli-agent', enabled: 'auto', bin: 'x', priority: 5 },
        a: { type: 'cli-agent', enabled: 'auto', bin: 'x', priority: 1 },
      },
    };
    assert.deepEqual(probeAll(reg).map((p) => p.name), ['a', 'b']);
  });
});
