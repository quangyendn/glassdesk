import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {
  buildArgv,
  redact,
  runCli,
  runHttp,
  buildEnvelope,
} from '../../plugins/glassdesk/bin/lib/run-provider.mjs';
import { loadRegistry } from '../../plugins/glassdesk/bin/lib/load-config.mjs';

const REG = loadRegistry();

test('buildArgv substitutes model, prompt and dir at argv level', () => {
  const { argv } = buildArgv(REG.providers.agy, 'repository-read', {
    model: 'Gemini 3.5 Flash (Medium)',
    prompt: 'find things',
    dir: '/repo',
  });
  assert.deepEqual(argv, [
    '-p', 'find things',
    '--model', 'Gemini 3.5 Flash (Medium)',
    '--add-dir', '/repo',
    '--dangerously-skip-permissions',
  ]);
});

test('buildArgv never joins arguments into a shell string', () => {
  const { argv } = buildArgv(REG.providers.agy, 'advisory', {
    model: 'M',
    prompt: 'rm -rf / ; echo "pwned" `whoami`',
    dir: '/repo',
  });
  // The dangerous text survives intact as ONE element — nothing was split or
  // interpolated, so there is no shell to exploit.
  assert.ok(argv.includes('rm -rf / ; echo "pwned" `whoami`'));
});

test('buildArgv serialises the opencode read-only policy into env', () => {
  const { argv, env } = buildArgv(REG.providers.opencode, 'advisory', {
    model: 'opencode/deepseek-v4-flash-free',
    prompt: 'p',
    dir: '/repo',
  });
  assert.ok(argv.includes('--pure'), 'missing --pure: global MCP servers would leak in');
  assert.ok(argv.includes('--agent') && argv.includes('plan'), 'missing --agent plan');
  assert.equal(env.OPENCODE_DISABLE_PROJECT_CONFIG, '1');
  const policy = JSON.parse(env.OPENCODE_CONFIG_CONTENT);
  assert.equal(policy.permission.write, 'deny');
  assert.equal(policy.permission.bash, 'deny');
  assert.equal(policy.permission.task, 'deny', 'task must be denied or opencode spawns subagents');
  assert.deepEqual(policy.mcp, {});
});

test('buildArgv builds codex patch-proposal with a read-only sandbox', () => {
  const { argv, env } = buildArgv(REG.providers.codex, 'patch-proposal', {
    model: null, prompt: 'propose a fix', dir: '/repo',
  });
  assert.deepEqual(argv, ['exec', '--sandbox', 'read-only', '--cd', '/repo', 'propose a fix']);
  assert.deepEqual(env, {});
});

test('buildArgv throws for a mode the provider does not declare', () => {
  assert.throws(() => buildArgv(REG.providers.agy, 'patch-proposal', {}), /patch-proposal/);
});

test('redact replaces every occurrence of each secret', () => {
  const out = redact('Authorization: Bearer sk-live-123 and again sk-live-123', ['sk-live-123']);
  assert.equal(out.includes('sk-live-123'), false);
  assert.match(out, /\*\*\*/);
});

test('redact tolerates empty and undefined secrets', () => {
  assert.equal(redact('plain', ['', undefined, null]), 'plain');
});

function stubCli(script) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-ext-run-'));
  const p = path.join(dir, 'stubcli');
  fs.writeFileSync(p, script);
  fs.chmodSync(p, 0o755);
  return { dir, bin: p };
}

test('runCli captures stdout and exit code', () => {
  const { bin } = stubCli('#!/bin/sh\necho "hello from provider"\nexit 0\n');
  const r = runCli({ bin }, 'stub', { argv: [], env: {} }, 10000);
  assert.equal(r.exitCode, 0);
  assert.match(r.stdout, /hello from provider/);
  assert.equal(r.timedOut, false);
});

test('runCli reports timedOut when the provider hangs', () => {
  // This is the measured opencode denied-write failure mode: the process does
  // not return, so only a hard timeout ends the run.
  const { bin } = stubCli('#!/bin/sh\nsleep 30\n');
  const r = runCli({ bin }, 'stub', { argv: [], env: {} }, 700);
  assert.equal(r.timedOut, true);
});

test('runCli passes the injected env through to the child', () => {
  const { bin } = stubCli('#!/bin/sh\necho "$GD_TEST_MARKER"\n');
  const r = runCli({ bin }, 'stub', { argv: [], env: { GD_TEST_MARKER: 'zebra' } }, 10000);
  assert.match(r.stdout, /zebra/);
});

test('runHttp posts to /chat/completions and returns the message content', async () => {
  let seenAuth = null;
  let seenBody = null;
  const server = http.createServer((req, res) => {
    seenAuth = req.headers.authorization;
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seenBody = JSON.parse(body);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'remote answer' } }] }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/v1`;

  process.env.TEST_BASE = base;
  process.env.TEST_KEY = 'sk-test-secret-value';
  process.env.TEST_MODEL = 'test-model';
  const provider = {
    type: 'openai-compatible',
    env: { base_url: 'TEST_BASE', api_key: 'TEST_KEY', model: 'TEST_MODEL' },
    endpoint_defaults: {},
  };

  const r = await runHttp(provider, 'the prompt', 10000);
  server.close();

  assert.equal(r.exitCode, 0);
  assert.match(r.stdout, /remote answer/);
  assert.equal(seenAuth, 'Bearer sk-test-secret-value');
  assert.equal(seenBody.model, 'test-model');
  assert.equal(seenBody.messages[0].content, 'the prompt');
  assert.equal(r.apiKey, 'sk-test-secret-value');

  delete process.env.TEST_BASE;
  delete process.env.TEST_KEY;
  delete process.env.TEST_MODEL;
});

test('runHttp maps a 401 to the AUTH exit code', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end('{"error":"bad key"}');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  process.env.TEST_BASE = `http://127.0.0.1:${server.address().port}/v1`;
  process.env.TEST_KEY = 'wrong';
  const r = await runHttp(
    { type: 'openai-compatible', env: { base_url: 'TEST_BASE', api_key: 'TEST_KEY', model: 'TEST_MODEL' }, endpoint_defaults: { model: 'm' } },
    'p',
    10000,
  );
  server.close();
  assert.equal(r.exitCode, 11);
  delete process.env.TEST_BASE;
  delete process.env.TEST_KEY;
});

test('buildEnvelope produces the documented shape', () => {
  const e = buildEnvelope({
    provider: 'opencode',
    specialist: 'code-reviewer',
    mode: 'advisory',
    exitCode: 0,
    durationMs: 1234,
    command: 'opencode run --pure',
    files: [{ path: 'a.ts', bytes: 10 }],
    totalBytes: 10,
    stdout: 'out',
    stderr: 'err',
    timedOut: false,
  });
  assert.equal(e.version, 'external-ai-run-v1');
  assert.equal(e.status, 'completed');
  assert.deepEqual(e.context_sent, { files: ['a.ts'], bytes: 10 });
  assert.equal(e.raw_output, 'out');
});

test('buildEnvelope marks a timeout as status=timeout', () => {
  const e = buildEnvelope({ provider: 'x', mode: 'advisory', exitCode: 14, timedOut: true, files: [], totalBytes: 0 });
  assert.equal(e.status, 'timeout');
});
