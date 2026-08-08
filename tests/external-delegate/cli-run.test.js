import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, '../../plugins/glassdesk/bin/external-ai.mjs');

// A registry whose single cli-agent provider is a stub script we control.
function scenario({ providerScript = '#!/bin/sh\necho PROVIDER_OUTPUT\nexit 0\n', extraProviders = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-ext-clirun-'));
  const binDir = path.join(dir, 'bin');
  fs.mkdirSync(binDir);
  const stub = path.join(binDir, 'stubcli');
  fs.writeFileSync(stub, providerScript);
  fs.chmodSync(stub, 0o755);

  const registry = {
    version: 1,
    defaults: { timeout_seconds: 5, mode: 'advisory', max_context_bytes: 400000 },
    providers: {
      stub: {
        type: 'cli-agent', enabled: 'auto', priority: 1, bin: 'stubcli',
        default_model: 'stub-model',
        modes: ['advisory'],
        capabilities: ['code-review', 'analysis'],
        privacy: { execution: 'external-service', restricted_data_allowed: false },
        notes: 'test stub',
        invoke: { advisory: { argv: ['-p', '{prompt}', '-m', '{model}'], env: {} } },
      },
      ...extraProviders,
    },
  };
  const registryPath = path.join(dir, 'registry.json');
  fs.writeFileSync(registryPath, JSON.stringify(registry));
  return { dir, binDir, registryPath };
}

function writeTask(dir, task) {
  const p = path.join(dir, 'task.json');
  fs.writeFileSync(p, JSON.stringify(task));
  return p;
}

function run(args, env) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
}

// spawnSync blocks this process's event loop until the child exits. That is
// fine for every other scenario here, but the API-key test below runs an
// HTTP server in this same process for the child to call back into — with
// spawnSync, the event loop that would accept that connection is exactly the
// one being blocked, so the child can never get a response and the test
// deadlocks until it times out. Use a non-blocking spawn for that one case
// so this process keeps servicing the server while the child runs.
function runAsync(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { env: { ...process.env, ...env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

test('a successful run writes an envelope to stdout and exits 0', () => {
  const s = scenario();
  const task = writeTask(s.dir, { task_type: 'code-review', objective: 'Check this.' });
  const r = run(['run', '--provider', 'stub', '--task-file', task], {
    PATH: s.binDir, GD_EXTERNAL_PROVIDERS: s.registryPath,
  });
  assert.equal(r.status, 0, r.stderr);
  const env = JSON.parse(r.stdout);
  assert.equal(env.version, 'external-ai-run-v1');
  assert.equal(env.provider, 'stub');
  assert.equal(env.status, 'completed');
  assert.match(env.raw_output, /PROVIDER_OUTPUT/);
});

test('--output writes the envelope to a file and keeps stdout empty', () => {
  const s = scenario();
  const task = writeTask(s.dir, { objective: 'x' });
  const out = path.join(s.dir, 'result.json');
  const r = run(['run', '--provider', 'stub', '--task-file', task, '--output', out], {
    PATH: s.binDir, GD_EXTERNAL_PROVIDERS: s.registryPath,
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), '');
  assert.match(JSON.parse(fs.readFileSync(out, 'utf8')).raw_output, /PROVIDER_OUTPUT/);
});

test('a specialist profile is prepended to the prompt the provider receives', () => {
  // The stub echoes its own argv so the test can inspect the prompt.
  const s = scenario({ providerScript: '#!/bin/sh\necho "$2"\n' });
  const task = writeTask(s.dir, { task_type: 'code-review', objective: 'Check this.' });
  const r = run(['run', '--provider', 'stub', '--specialist', 'code-reviewer', '--task-file', task], {
    PATH: s.binDir, GD_EXTERNAL_PROVIDERS: s.registryPath,
  });
  assert.equal(r.status, 0, r.stderr);
  const env = JSON.parse(r.stdout);
  assert.match(env.raw_output, /actionable findings/);
  assert.equal(env.specialist, 'code-reviewer');
});

test('an unknown specialist exits 12', () => {
  const s = scenario();
  const task = writeTask(s.dir, { objective: 'x' });
  const r = run(['run', '--provider', 'stub', '--specialist', 'no-such', '--task-file', task], {
    PATH: s.binDir, GD_EXTERNAL_PROVIDERS: s.registryPath,
  });
  assert.equal(r.status, 12);
});

test('a denied path in scope.files exits 13 before the provider is spawned', () => {
  // The stub fails loudly if it ever runs, proving the gate came first.
  const s = scenario({ providerScript: '#!/bin/sh\necho SHOULD_NOT_RUN\nexit 0\n' });
  fs.writeFileSync(path.join(s.dir, '.env'), 'SECRET=1\n');
  const task = writeTask(s.dir, { objective: 'x', scope: { files: ['.env'], root: s.dir } });
  const r = run(['run', '--provider', 'stub', '--task-file', task], {
    PATH: s.binDir, GD_EXTERNAL_PROVIDERS: s.registryPath,
  });
  assert.equal(r.status, 13);
  assert.equal(r.stdout.includes('SHOULD_NOT_RUN'), false);
  assert.match(r.stderr, /\.env/);
});

test('restricted classification against a remote provider exits 13', () => {
  const s = scenario();
  const task = writeTask(s.dir, { objective: 'x', privacy: { classification: 'restricted' } });
  const r = run(['run', '--provider', 'stub', '--task-file', task], {
    PATH: s.binDir, GD_EXTERNAL_PROVIDERS: s.registryPath,
  });
  assert.equal(r.status, 13);
});

test('a task type outside the provider capabilities exits 12', () => {
  const s = scenario();
  const task = writeTask(s.dir, { task_type: 'multimodal-analysis', objective: 'x' });
  const r = run(['run', '--provider', 'stub', '--task-file', task], {
    PATH: s.binDir, GD_EXTERNAL_PROVIDERS: s.registryPath,
  });
  assert.equal(r.status, 12);
});

test('a hanging provider exits 14 and the envelope says timeout', () => {
  // `sleep` is a real binary, not a shell builtin, so the scoped PATH must
  // still resolve it — otherwise the stub's shell fails with "command not
  // found" (exit 127) almost instantly, before the timeout has a chance to
  // fire, and the test would pass for the wrong reason (or fail outright).
  const s = scenario({ providerScript: '#!/bin/sh\nsleep 30\n' });
  const task = writeTask(s.dir, { objective: 'x' });
  const r = run(['run', '--provider', 'stub', '--task-file', task, '--timeout', '1'], {
    PATH: `${s.binDir}${path.delimiter}${process.env.PATH || ''}`, GD_EXTERNAL_PROVIDERS: s.registryPath,
  });
  assert.equal(r.status, 14);
  assert.equal(JSON.parse(r.stdout).status, 'timeout');
});

test('--provider auto picks the lowest-priority available provider', () => {
  const s = scenario({
    extraProviders: {
      missing: {
        type: 'cli-agent', enabled: 'auto', priority: 0, bin: 'definitely-absent',
        modes: ['advisory'], capabilities: ['analysis'],
        privacy: { execution: 'external-service', restricted_data_allowed: false },
        invoke: { advisory: { argv: [], env: {} } },
      },
    },
  });
  const task = writeTask(s.dir, { task_type: 'analysis', objective: 'x' });
  const r = run(['run', '--provider', 'auto', '--task-file', task], {
    PATH: s.binDir, GD_EXTERNAL_PROVIDERS: s.registryPath,
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).provider, 'stub');
});

test('--provider auto with no eligible provider exits 10', () => {
  const s = scenario();
  const task = writeTask(s.dir, { task_type: 'analysis', objective: 'x' });
  const r = run(['run', '--provider', 'auto', '--task-file', task], {
    PATH: path.join(s.dir, 'empty'), GD_EXTERNAL_PROVIDERS: s.registryPath,
  });
  assert.equal(r.status, 10);
});

test('the API key never appears in the envelope', async () => {
  const http = await import('node:http');
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/v1`;

  const s = scenario({
    extraProviders: {
      remote: {
        type: 'openai-compatible', enabled: 'auto', priority: 9,
        modes: ['advisory'], capabilities: ['analysis'],
        privacy: { execution: 'remote-api', restricted_data_allowed: false },
        env: { base_url: 'T_BASE', api_key: 'T_KEY', model: 'T_MODEL' },
        endpoint_defaults: { model: 'm' },
      },
    },
  });
  const task = writeTask(s.dir, { task_type: 'analysis', objective: 'x' });
  const r = await runAsync(['run', '--provider', 'remote', '--task-file', task], {
    PATH: s.binDir,
    GD_EXTERNAL_PROVIDERS: s.registryPath,
    T_BASE: base,
    T_KEY: 'sk-super-secret-value-1234',
    T_MODEL: 'm',
  });
  server.close();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.includes('sk-super-secret-value-1234'), false, 'API key leaked into the envelope');
});

test('a malformed task file exits 20', () => {
  const s = scenario();
  const bad = path.join(s.dir, 'bad.json');
  fs.writeFileSync(bad, '{{{');
  const r = run(['run', '--provider', 'stub', '--task-file', bad], {
    PATH: s.binDir, GD_EXTERNAL_PROVIDERS: s.registryPath,
  });
  assert.equal(r.status, 20);
});

test('--task-file is required', () => {
  const s = scenario();
  const r = run(['run', '--provider', 'stub'], { PATH: s.binDir, GD_EXTERNAL_PROVIDERS: s.registryPath });
  assert.notEqual(r.status, 0);
});
