import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, '../../plugins/glassdesk/bin/external-ai.mjs');

function stubBinDir(names) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-ext-cli-'));
  for (const n of names) {
    const p = path.join(dir, n);
    fs.writeFileSync(p, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(p, 0o755);
  }
  return dir;
}

function run(args, env = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('list --json reports every registry provider with availability', (t) => {
  const binDir = stubBinDir(['opencode']);
  t.after(() => fs.rmSync(binDir, { recursive: true, force: true }));
  const r = run(['list', '--json'], { PATH: binDir, KIMI_API_KEY: '', DEEPSEEK_API_KEY: '' });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.version, 'external-ai-list-v1');
  const byName = Object.fromEntries(out.providers.map((p) => [p.name, p]));
  assert.equal(byName.opencode.available, true);
  assert.equal(byName.codex.available, false);
  assert.equal(byName.codex.code, 10);
});

test('list --json carries the notes field so the agent sees provider traps', (t) => {
  const binDir = stubBinDir([]);
  t.after(() => fs.rmSync(binDir, { recursive: true, force: true }));
  const r = run(['list', '--json'], { PATH: binDir });
  const out = JSON.parse(r.stdout);
  const agy = out.providers.find((p) => p.name === 'agy');
  assert.match(agy.notes, /exact display label/);
});

test('list (human form) prints one line per provider', (t) => {
  const binDir = stubBinDir(['opencode']);
  t.after(() => fs.rmSync(binDir, { recursive: true, force: true }));
  const r = run(['list'], { PATH: binDir });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /opencode/);
  assert.match(r.stdout, /codex/);
});

test('check on an available provider exits 0', (t) => {
  const binDir = stubBinDir(['opencode']);
  t.after(() => fs.rmSync(binDir, { recursive: true, force: true }));
  const r = run(['check', '--provider', 'opencode'], { PATH: binDir });
  assert.equal(r.status, 0, r.stderr);
});

test('check on a missing binary exits 10', (t) => {
  const binDir = stubBinDir([]);
  t.after(() => fs.rmSync(binDir, { recursive: true, force: true }));
  const r = run(['check', '--provider', 'codex'], { PATH: binDir });
  assert.equal(r.status, 10);
  assert.match(r.stderr, /not on PATH/);
});

test('check on an unsupported mode exits 12', (t) => {
  const binDir = stubBinDir(['opencode']);
  t.after(() => fs.rmSync(binDir, { recursive: true, force: true }));
  const r = run(['check', '--provider', 'opencode', '--mode', 'patch-proposal'], { PATH: binDir });
  assert.equal(r.status, 12);
  assert.match(r.stderr, /patch-proposal/);
});

test('check on an openai-compatible provider without a key exits 11', (t) => {
  const binDir = stubBinDir([]);
  t.after(() => fs.rmSync(binDir, { recursive: true, force: true }));
  const r = run(['check', '--provider', 'kimi'], {
    PATH: binDir,
    KIMI_BASE_URL: 'https://example.test/v1',
    KIMI_API_KEY: '',
  });
  assert.equal(r.status, 11);
});

test('an unknown provider name exits 12', () => {
  const r = run(['check', '--provider', 'nope']);
  assert.equal(r.status, 12);
  assert.match(r.stderr, /unknown provider/);
});

test('an unknown subcommand exits 20 and prints usage', () => {
  const r = run(['frobnicate']);
  assert.equal(r.status, 20);
  assert.match(r.stderr, /usage/i);
});

test('GD_EXTERNAL_PROVIDERS pointing at a broken file exits 20', () => {
  const tmp = path.join(os.tmpdir(), `broken-${process.pid}.json`);
  fs.writeFileSync(tmp, '{{{');
  const r = run(['list'], { GD_EXTERNAL_PROVIDERS: tmp });
  assert.equal(r.status, 20);
  fs.unlinkSync(tmp);
});

test('check --mode with no value exits 12 and says it requires a value', (t) => {
  const binDir = stubBinDir(['opencode']);
  t.after(() => fs.rmSync(binDir, { recursive: true, force: true }));
  const r = run(['check', '--provider', 'opencode', '--mode'], { PATH: binDir });
  assert.equal(r.status, 12);
  assert.match(r.stderr, /--mode requires a value/);
});

test('check --task-type with no value exits 12 and says it requires a value', (t) => {
  const binDir = stubBinDir(['opencode']);
  t.after(() => fs.rmSync(binDir, { recursive: true, force: true }));
  const r = run(['check', '--provider', 'opencode', '--task-type'], { PATH: binDir });
  assert.equal(r.status, 12);
  assert.match(r.stderr, /--task-type requires a value/);
});

test('check with no --provider at all still exits 12 and says it is required', () => {
  const r = run(['check']);
  assert.equal(r.status, 12);
  assert.match(r.stderr, /--provider is required/);
});

test('--help with no subcommand prints usage and exits 0', () => {
  const r = run(['--help']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /usage/i);
});
