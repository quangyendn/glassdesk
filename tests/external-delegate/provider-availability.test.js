import { test, after } from 'node:test';
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

// stubPath() is called from inside plain test bodies that take no `t`, so it
// cannot register its own t.after() cleanup. Instead every mkdtemp'd dir it
// creates is tracked here and removed once, after all tests in this file
// finish — previously none of them were ever removed and each run of this file
// leaked five directories.
const stubDirs = [];
after(() => {
  for (const dir of stubDirs) fs.rmSync(dir, { recursive: true, force: true });
});

// Build a scratch dir holding one executable stub, and scope PATH to it so the
// probe cannot see the developer's real CLIs.
function stubPath(binNames) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-ext-bin-'));
  stubDirs.push(dir);
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

// ---------------------------------------------------------------------------
// Review round 3, P1: the docs say kimi and deepseek need only their API key,
// and the entries ship a base URL for exactly that reason — but probing
// ignored the default and reported exit 10, so a user who followed the
// documented setup found both providers permanently unusable.
// ---------------------------------------------------------------------------

test('a remote provider is available on its API key alone, using its shipped default URL', () => {
  process.env.TEST_KEY = 'set';
  delete process.env.TEST_BASE;
  const p = probeProvider('t', {
    type: 'openai-compatible', enabled: 'auto',
    privacy: { execution: 'remote-api' },
    env: { base_url: 'TEST_BASE', api_key: 'TEST_KEY', model: 'TEST_MODEL' },
    endpoint_defaults: { base_url: 'https://api.example.test/v1' },
  });
  delete process.env.TEST_KEY;
  assert.equal(p.available, true);
  assert.equal(p.detail, 'https://api.example.test/v1');
});

test('an exported base URL still overrides the shipped default', () => {
  process.env.TEST_KEY = 'set';
  process.env.TEST_BASE = 'https://override.test/v1';
  const p = probeProvider('t', {
    type: 'openai-compatible', enabled: 'auto',
    privacy: { execution: 'remote-api' },
    env: { base_url: 'TEST_BASE', api_key: 'TEST_KEY', model: 'TEST_MODEL' },
    endpoint_defaults: { base_url: 'https://api.example.test/v1' },
  });
  delete process.env.TEST_KEY;
  delete process.env.TEST_BASE;
  assert.equal(p.detail, 'https://override.test/v1');
});

test('a local-only provider still needs its base URL exported explicitly', () => {
  // It has no API key to gate on, so the exported URL is the only thing
  // separating "the user runs a local model" from "this entry ships a
  // plausible default".
  delete process.env.TEST_BASE;
  const p = probeProvider('t', {
    type: 'openai-compatible', enabled: 'auto',
    privacy: { execution: 'local-only', restricted_data_allowed: true },
    env: { base_url: 'TEST_BASE', api_key: 'TEST_KEY', model: 'TEST_MODEL' },
    endpoint_defaults: { base_url: 'http://127.0.0.1:11434/v1' },
  });
  assert.equal(p.available, false);
  assert.equal(p.code, EXIT.UNAVAILABLE);
});

test('the shipped kimi and deepseek entries come up on their key alone', () => {
  const reg = JSON.parse(
    fs.readFileSync(new URL('../../plugins/glassdesk/config/external-providers.json', import.meta.url), 'utf8'),
  );
  for (const nm of ['kimi', 'deepseek']) {
    const entry = reg.providers[nm];
    process.env[entry.env.api_key] = 'set';
    delete process.env[entry.env.base_url];
    const p = probeProvider(nm, entry);
    delete process.env[entry.env.api_key];
    assert.equal(p.available, true, `${nm} must be usable with only ${entry.env.api_key} exported`);
  }
});
