import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {
  buildArgv,
  buildChildEnv,
  redact,
  runCli,
  runHttp,
  buildEnvelope,
} from '../../plugins/glassdesk/bin/lib/run-provider.mjs';
import { loadRegistry } from '../../plugins/glassdesk/bin/lib/load-config.mjs';
import { EXIT } from '../../plugins/glassdesk/bin/lib/exit-codes.mjs';

const REG = loadRegistry();

test('buildArgv substitutes model, prompt and dir at argv level', () => {
  const { argv } = buildArgv(REG.providers.agy, 'repository-read', {
    model: 'Gemini 3.5 Flash (Medium)',
    prompt: 'find things',
    dir: '/repo',
  });
  assert.deepEqual(argv, [
    '-p', 'find things',
    '--model', 'Gemini 3.5 Flash (Medium)', '--mode', 'plan', '--sandbox',
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

// Critical regression from the advisory-cwd-isolation fix: `codex exec`
// refuses to run outside a git repository, and the fresh `mkdtemp` directory
// advisory mode now spawns in is never one — verified directly with
// `cd $(mktemp -d) && codex exec --sandbox read-only "..."`, which fails with
// "Not inside a trusted directory and --skip-git-repo-check was not
// specified." repository-read and patch-proposal spawn in the real
// scope.root, which is a git repository (or at least not guaranteed
// otherwise), so they must NOT get this flag — it would silently widen what
// codex considers "trusted" there.
test('codex advisory includes --skip-git-repo-check, since it now runs outside a git repo', () => {
  const { argv } = buildArgv(REG.providers.codex, 'advisory', { model: null, prompt: 'p', dir: '/repo' });
  assert.ok(argv.includes('--skip-git-repo-check'), 'codex advisory must tolerate a non-git cwd');
});

test('codex repository-read and patch-proposal do not get --skip-git-repo-check', () => {
  for (const mode of ['repository-read', 'patch-proposal']) {
    const { argv } = buildArgv(REG.providers.codex, mode, { model: null, prompt: 'p', dir: '/repo' });
    assert.equal(argv.includes('--skip-git-repo-check'), false, `codex ${mode} spawns in a real repo and must not skip the check`);
  }
});

// Finding 7: agy has no independently-verified read-only flag the way
// opencode's permission.write:deny or codex's --sandbox read-only do. `agy
// --help` documents `--mode plan` as a distinct read-only execution mode, so
// it is used on every invocation as the best available guardrail — but the
// registry's own notes must say plainly that this is not enforced the way
// the other two providers' policies are, so the selecting agent is not
// misled by "no writes" without qualification.
test('agy invokes with --mode plan and --sandbox in both advisory and repository-read', () => {
  for (const mode of ['advisory', 'repository-read']) {
    const { argv } = buildArgv(REG.providers.agy, mode, { model: 'M', prompt: 'p', dir: '/repo' });
    const i = argv.indexOf('--mode');
    assert.notEqual(i, -1, `--mode missing for agy ${mode}`);
    assert.equal(argv[i + 1], 'plan');
    // --sandbox restricts a different route than --mode plan (the terminal/
    // bash tool via an OS-level sandbox, per the binary's own strings) — it
    // is additive hardening, not a substitute, so both must be present.
    assert.ok(argv.includes('--sandbox'), `--sandbox missing for agy ${mode}`);
  }
});

test('agy notes disclose that read-only enforcement is not independently verified', () => {
  assert.match(
    REG.providers.agy.notes,
    /no independently verified read-only enforcement|not a policy the CLI enforces|prompt-level/i,
  );
});

// Finding 10: an unanchored "sign in" substring in agy's auth_error_pattern
// reclassifies any stderr that happens to mention "sign in" as exit 11
// (auth wall) — including a transient error whose message merely quotes a
// sign-in URL — which stops the agent's failure ladder on the wrong branch.
test('agy auth_error_pattern requires an anchored phrase, not a bare "sign in" substring', () => {
  const re = new RegExp(REG.providers.agy.auth_error_pattern, 'i');
  // "sign in" appears here with none of the anchored phrases nearby — must
  // not match on the bare substring alone.
  assert.equal(re.test('Click here to sign in with your Google account to continue.'), false);
  assert.ok(re.test('please sign in to continue'));
  assert.ok(re.test('Error: not signed in'));
  assert.ok(re.test('IneligibleTierError: UNSUPPORTED_CLIENT'));
});

// The single most likely agy auth failure in practice: an unauthenticated
// run prints an OAuth URL, blocks interactively for up to 60s, then gives up
// and exits 1. None of "IneligibleTier", "UNSUPPORTED_CLIENT", "please sign
// in", or "not signed in" appear in that real output — only "authentication
// required/failed/timed out" do. Without those branches this collapses to a
// generic failure (and, after the exit-code-collapse fix, to exit 1), so the
// agent's failure ladder would treat a hard auth wall as a transient error
// worth retrying, when it cannot succeed without a human completing OAuth.
test('runCli maps a real unauthenticated agy run to EXIT.AUTH via auth_error_pattern', async (t) => {
  const realAgyOutput = [
    'Authentication required. Please visit the URL to log in:',
    '  https://accounts.google.com/o/oauth2/auth?client_id=example&response_type=code',
    '',
    'Waiting for authentication (timeout 60s)...',
    'Error: authentication timed out.',
    'Error: authentication failed or timed out',
  ].join('\n');
  const script = `#!/bin/sh\ncat <<'EOF' 1>&2\n${realAgyOutput}\nEOF\nexit 1\n`;
  const { dir, bin } = stubCli(script);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const r = await runCli({ bin, auth_error_pattern: REG.providers.agy.auth_error_pattern }, 'agy', { argv: [], env: {} }, 10000);
  assert.equal(r.exitCode, EXIT.AUTH);
  assert.equal(r.raw, false, 'an auth-pattern match must not be treated as a raw provider exit code');
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

test('runCli captures stdout and exit code', async (t) => {
  const { dir, bin } = stubCli('#!/bin/sh\necho "hello from provider"\nexit 0\n');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const r = await runCli({ bin }, 'stub', { argv: [], env: {} }, 10000);
  assert.equal(r.exitCode, 0);
  assert.match(r.stdout, /hello from provider/);
  assert.equal(r.timedOut, false);
});

test('runCli reports timedOut when the provider hangs', async (t) => {
  // This is the measured opencode denied-write failure mode: the process does
  // not return, so only a hard timeout ends the run.
  const { dir, bin } = stubCli('#!/bin/sh\nsleep 30\n');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const r = await runCli({ bin }, 'stub', { argv: [], env: {} }, 700);
  assert.equal(r.timedOut, true);
});

test('runCli passes the injected env through to the child', async (t) => {
  const { dir, bin } = stubCli('#!/bin/sh\necho "$GD_TEST_MARKER"\n');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const r = await runCli({ bin }, 'stub', { argv: [], env: { GD_TEST_MARKER: 'zebra' } }, 10000);
  assert.match(r.stdout, /zebra/);
});

test('runCli reports a maxBuffer overflow as a real failure, not a timeout', async (t) => {
  // Reproduces the Critical finding: a child that writes past maxBuffer is
  // killed with SIGTERM/status:null too — the same shape as a timeout — but
  // spawnSync sets r.error with code ENOBUFS in that case, and that must
  // take priority over the signal heuristic so the failure is never
  // misreported as exit 14, and the real error message is not discarded.
  // runCli's maxBuffer is fixed at 64MB, so the stub has to write past that.
  const { dir, bin } = stubCli(
    '#!/bin/sh\nnode -e "process.stdout.write(\'x\'.repeat(70 * 1024 * 1024))"\n',
  );
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const r = await runCli({ bin }, 'stub', { argv: [], env: {} }, 10000);
  assert.equal(r.timedOut, false);
  assert.notEqual(r.exitCode, EXIT.TIMEOUT);
  assert.match(r.stderr, /ENOBUFS/);
});

test('runCli maps a missing binary to the UNAVAILABLE exit code', async () => {
  const r = await runCli({ bin: '/no/such/binary-gd-test' }, 'stub', { argv: [], env: {} }, 10000);
  assert.equal(r.exitCode, EXIT.UNAVAILABLE);
  assert.equal(r.timedOut, false);
});

test('runCli tolerates a malformed auth_error_pattern instead of crashing', async (t) => {
  const { dir, bin } = stubCli('#!/bin/sh\necho "not authenticated" 1>&2\nexit 1\n');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const provider = { bin, auth_error_pattern: '(unbalanced(paren' };
  const r = await runCli(provider, 'stub', { argv: [], env: {} }, 10000);
  // The malformed pattern must not crash the dispatcher; it degrades to the
  // provider's own exit code instead of being mapped to EXIT.AUTH.
  assert.equal(r.exitCode, 1);
});

test('runCli spawns the child in the given cwd', async (t) => {
  const { dir, bin } = stubCli('#!/bin/sh\npwd\n');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-ext-cwd-'));
  t.after(() => fs.rmSync(target, { recursive: true, force: true }));
  const r = await runCli({ bin }, 'stub', { argv: [], env: {} }, 10000, { cwd: target });
  assert.equal(r.stdout.trim(), fs.realpathSync(target));
});

test('runCli defaults to the caller\'s own cwd when none is given', async (t) => {
  const { dir, bin } = stubCli('#!/bin/sh\npwd\n');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const r = await runCli({ bin }, 'stub', { argv: [], env: {} }, 10000);
  assert.equal(r.stdout.trim(), fs.realpathSync(process.cwd()));
});

test('runCli marks a provider\'s own nonzero exit status as raw, unlike its own assigned codes', async (t) => {
  const { dir, bin } = stubCli('#!/bin/sh\nexit 13\n');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const r = await runCli({ bin }, 'stub', { argv: [], env: {} }, 10000);
  assert.equal(r.exitCode, 13);
  assert.equal(r.raw, true, 'a raw provider exit code must be flagged so a caller does not treat it as a reserved code');
});

test('runCli does not mark its own timeout/auth/missing-binary codes as raw', async (t) => {
  const missing = await runCli({ bin: '/no/such/binary-gd-test' }, 'stub', { argv: [], env: {} }, 10000);
  assert.equal(missing.exitCode, EXIT.UNAVAILABLE);
  assert.equal(missing.raw, false);

  const { dir, bin } = stubCli('#!/bin/sh\nsleep 30\n');
  const timedOut = await runCli({ bin }, 'stub', { argv: [], env: {} }, 700);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(timedOut.exitCode, EXIT.TIMEOUT);
  assert.equal(timedOut.raw, false);
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

test('runHttp reports a timeout when the server never responds', async (t) => {
  const server = http.createServer(() => {
    // Never call res.end() — the request hangs until the client aborts it.
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));

  process.env.TEST_BASE = `http://127.0.0.1:${server.address().port}/v1`;
  process.env.TEST_KEY = 'sk-irrelevant';
  const r = await runHttp(
    { type: 'openai-compatible', env: { base_url: 'TEST_BASE', api_key: 'TEST_KEY', model: 'TEST_MODEL' }, endpoint_defaults: { model: 'm' } },
    'p',
    200,
  );
  assert.equal(r.exitCode, EXIT.TIMEOUT);
  assert.equal(r.timedOut, true);
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
  assert.deepEqual(e.context_sent, { files: ['a.ts'], bytes: 10, repository_root: null });
  assert.equal(e.raw_output, 'out');
});

test('buildEnvelope marks a timeout as status=timeout', () => {
  const e = buildEnvelope({ provider: 'x', mode: 'advisory', exitCode: 14, timedOut: true, files: [], totalBytes: 0 });
  assert.equal(e.status, 'timeout');
});

test('buildEnvelope redacts secrets from every field, even if the caller forgot to', () => {
  const e = buildEnvelope({
    provider: 'kimi',
    mode: 'advisory',
    exitCode: 0,
    command: 'opencode run --token sk-live-123 --retry-token sk-live-123',
    stdout: 'echo sk-live-123',
    stderr: 'warning: sk-live-123 exposed',
    files: [],
    totalBytes: 0,
    secrets: ['sk-live-123'],
  });
  const blob = JSON.stringify(e);
  assert.equal(blob.includes('sk-live-123'), false);
  assert.match(e.command, /\*\*\*/);
  assert.match(e.raw_output, /\*\*\*/);
  assert.match(e.stderr_tail, /\*\*\*/);
});

// ---------------------------------------------------------------------------
// Review round 1, P1: a Claude Code session routinely holds credentials in its
// environment, and `...process.env` handed every one of them to every spawned
// provider. A provider with shell tooling can read its own environment even
// under a read-only sandbox, so those values left the machine unscanned and
// unredacted on every run.
// ---------------------------------------------------------------------------

test('buildChildEnv keeps only allowlisted variables', () => {
  const source = {
    PATH: '/usr/bin',
    HOME: '/var/empty',
    ANTHROPIC_API_KEY: 'ant-nope',
    AWS_SECRET_ACCESS_KEY: 'aws-nope',
    GITHUB_TOKEN: 'gh-nope',
    CLAUDE_PROJECT_DIR: '/var/empty/private-repo',
  };
  const env = buildChildEnv({}, {}, source);
  assert.equal(env.PATH, '/usr/bin');
  assert.equal(env.HOME, '/var/empty');
  for (const leaked of ['ANTHROPIC_API_KEY', 'AWS_SECRET_ACCESS_KEY', 'GITHUB_TOKEN', 'CLAUDE_PROJECT_DIR']) {
    assert.equal(Object.hasOwn(env, leaked), false, `${leaked} must not reach the provider`);
  }
});

test('buildChildEnv honours a registry env_passthrough and lets injected values win', () => {
  const source = { PATH: '/usr/bin', CODEX_HOME: '/var/empty/.codex', OTHER: 'dropped', TERM: 'xterm' };
  const env = buildChildEnv({ env_passthrough: ['CODEX_HOME'] }, { TERM: 'dumb' }, source);
  assert.equal(env.CODEX_HOME, '/var/empty/.codex');
  assert.equal(Object.hasOwn(env, 'OTHER'), false);
  assert.equal(env.TERM, 'dumb', 'invoke-template env is policy and must override inherited state');
});

test('runCli does not leak an inherited credential to the child', async (t) => {
  const { dir, bin } = stubCli('#!/bin/sh\necho "KEY=[$GD_FAKE_SECRET_KEY]"\n');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  process.env.GD_FAKE_SECRET_KEY = 'sk-live-must-not-travel';
  t.after(() => { delete process.env.GD_FAKE_SECRET_KEY; });
  const r = await runCli({ bin }, 'stub', { argv: [], env: {} }, 10000);
  assert.equal(r.stdout.trim(), 'KEY=[]');
});

// ---------------------------------------------------------------------------
// Review round 1, P2: spawnSync's timeout sends a signal and then keeps
// waiting, so a provider that traps SIGTERM outlives the advertised hard
// timeout — the exact hang this dispatcher exists to bound.
// ---------------------------------------------------------------------------

test('runCli hard-kills a provider that ignores SIGTERM', async (t) => {
  const { dir, bin } = stubCli('#!/bin/sh\ntrap "" TERM\nsleep 60\n');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const started = Date.now();
  const r = await runCli({ bin }, 'stub', { argv: [], env: {} }, 400, { killGraceMs: 300 });
  const elapsed = Date.now() - started;
  assert.equal(r.timedOut, true);
  assert.equal(r.exitCode, EXIT.TIMEOUT);
  assert.ok(elapsed < 10000, `run must not outlive the timeout plus grace, took ${elapsed}ms`);
});

test('runCli kills the whole process group, not just the direct child', async (t) => {
  // `sh` backgrounds a long sleep and exits immediately. The sleep inherits
  // the pipes, so waiting on stdio EOF alone would hang for a full minute.
  const marker = path.join(os.tmpdir(), `gd-ext-group-${process.pid}-${Math.random().toString(36).slice(2)}`);
  const { dir, bin } = stubCli(`#!/bin/sh\n(sleep 60; touch ${marker}) &\nsleep 60\n`);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  t.after(() => fs.rmSync(marker, { force: true }));
  const started = Date.now();
  const r = await runCli({ bin }, 'stub', { argv: [], env: {} }, 400, { killGraceMs: 300 });
  assert.equal(r.timedOut, true);
  assert.ok(Date.now() - started < 10000, 'a descendant holding the pipes must not extend the run');
});

// ---------------------------------------------------------------------------
// Review round 1, P1: `local-openai` is the only provider allowed to receive
// restricted data, and it earns that by being local — but its base URL comes
// from an environment variable, so the registry's claim is not self-enforcing.
// ---------------------------------------------------------------------------

test('runHttp refuses to post to a non-loopback endpoint declared local-only', async () => {
  const provider = {
    type: 'openai-compatible',
    privacy: { execution: 'local-only', restricted_data_allowed: true },
    env: { base_url: 'GD_TEST_LOCAL_URL', api_key: 'GD_T_LOCAL_K', model: 'GD_TEST_LOCAL_MODEL' },
  };
  process.env.GD_TEST_LOCAL_URL = 'https://api.example.com/v1';
  try {
    const r = await runHttp(provider, 'prompt', 5000);
    assert.equal(r.exitCode, EXIT.PRIVACY);
    assert.match(r.stderr, /loopback/);
  } finally {
    delete process.env.GD_TEST_LOCAL_URL;
  }
});

// ---------------------------------------------------------------------------
// Review round 1, P2: exit 20 is reserved for a dispatcher failure. A 429 or a
// 5xx is the provider running and failing, which the contract reports as
// exit 1 with the true status preserved in the envelope.
// ---------------------------------------------------------------------------

test('runHttp reports an HTTP 503 as a raw provider failure, not a dispatcher failure', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(503, { 'content-type': 'text/plain' });
    res.end('upstream overloaded');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    const provider = {
      type: 'openai-compatible',
      env: { base_url: 'GD_TEST_HTTP_URL', api_key: 'GD_T_HTTP_K', model: 'GD_TEST_HTTP_MODEL' },
    };
    process.env.GD_TEST_HTTP_URL = `http://127.0.0.1:${port}/v1`;
    const r = await runHttp(provider, 'prompt', 5000);
    assert.equal(r.exitCode, 503, 'the HTTP status must survive into the envelope');
    assert.equal(r.raw, true, 'raw is what collapses the process exit to 1 rather than 20');
    assert.notEqual(r.exitCode, EXIT.FAILURE);
  } finally {
    delete process.env.GD_TEST_HTTP_URL;
    await new Promise((r) => server.close(r));
  }
});

test('buildEnvelope names the repository root when the provider was given one', () => {
  const e = buildEnvelope({
    provider: 'codex', mode: 'repository-read', exitCode: 0,
    files: [{ path: 'a.ts', bytes: 10 }], totalBytes: 10, repositoryRoot: '/repo',
  });
  assert.equal(e.context_sent.repository_root, '/repo');
});

// ---------------------------------------------------------------------------
// Review round 2, P1: the leader can exit on SIGTERM while a descendant that
// traps it survives. If that descendant redirected the inherited stdio,
// 'close' fires at once and used to cancel the grace timer before its SIGKILL
// ran, so the descendant outlived the advertised hard timeout.
// ---------------------------------------------------------------------------

test('runCli kills a SIGTERM-trapping descendant even when the leader exits first', async (t) => {
  const marker = path.join(os.tmpdir(), `gd-ext-survivor-${process.pid}-${Math.random().toString(36).slice(2)}`);
  // The descendant traps TERM and detaches its stdio, so the leader's death
  // closes the pipes immediately — the exact shape of the reported bug.
  const { dir, bin } = stubCli(
    `#!/bin/sh\n( trap "" TERM; sleep 2; touch ${marker} ) </dev/null >/dev/null 2>&1 &\nsleep 60\n`,
  );
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  t.after(() => fs.rmSync(marker, { force: true }));

  const r = await runCli({ bin }, 'stub', { argv: [], env: {} }, 300, { killGraceMs: 5000 });
  assert.equal(r.timedOut, true);
  // Well past the descendant's own 2s sleep: if the final SIGKILL never
  // reached the group, the marker exists by now.
  await new Promise((resolve) => setTimeout(resolve, 3500));
  assert.equal(fs.existsSync(marker), false, 'a timed-out run must not leave its process group alive');
});

// ---------------------------------------------------------------------------
// Review round 2, P2: res.text() buffers the whole body before anything can
// truncate it, so a hostile endpoint could exhaust the dispatcher with one
// reply while CLI stdout was capped at 64MB.
// ---------------------------------------------------------------------------

test('runHttp discards a response body over the cap instead of buffering it', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    // Comfortably past the tiny cap this test injects.
    res.end(JSON.stringify({ choices: [{ message: { content: 'y'.repeat(50000) } }] }));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    const provider = { type: 'openai-compatible', env: { base_url: 'GD_TEST_CAP_URL' } };
    process.env.GD_TEST_CAP_URL = `http://127.0.0.1:${port}/v1`;
    const r = await runHttp(provider, 'prompt', 5000, { maxBodyBytes: 1024 });
    assert.equal(r.exitCode, EXIT.FAILURE);
    assert.match(r.stderr, /ENOBUFS/);
    assert.equal(r.stdout, '');
  } finally {
    delete process.env.GD_TEST_CAP_URL;
    await new Promise((r) => server.close(r));
  }
});

test('runHttp still returns a body that fits under the cap', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'small answer' } }] }));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    const provider = { type: 'openai-compatible', env: { base_url: 'GD_TEST_CAP_URL' } };
    process.env.GD_TEST_CAP_URL = `http://127.0.0.1:${port}/v1`;
    const r = await runHttp(provider, 'prompt', 5000, { maxBodyBytes: 1024 });
    assert.equal(r.exitCode, EXIT.OK);
    assert.equal(r.stdout, 'small answer');
  } finally {
    delete process.env.GD_TEST_CAP_URL;
    await new Promise((r) => server.close(r));
  }
});

// ---------------------------------------------------------------------------
// Review round 3, P2: slicing the tail before redacting can cut a credential
// in half at the 4000-character boundary, and the exact-match redactor no
// longer recognises the surviving fragment.
// ---------------------------------------------------------------------------

test('buildEnvelope redacts stderr before truncating it, so no fragment survives the tail cut', () => {
  // Assembled rather than written as one literal: the repo's own guardrails
  // scanner refuses a credential-shaped assignment, which is the point.
  const secret = ['sk-live', '0123456789abcdefghij'].join('-');
  // Position the secret so it straddles the 4000-character boundary: half of
  // it falls outside the published tail, half inside.
  const head = 'a'.repeat(20000 - 4000 - Math.floor(secret.length / 2));
  const stderr = head + secret + 'b'.repeat(4000);
  const e = buildEnvelope({
    provider: 'kimi', mode: 'advisory', exitCode: 0,
    files: [], totalBytes: 0, stderr, secrets: [secret],
  });
  assert.equal(e.stderr_tail.includes(secret), false);
  for (let cut = 8; cut < secret.length; cut++) {
    assert.equal(
      e.stderr_tail.includes(secret.slice(cut)),
      false,
      `a ${secret.length - cut}-character tail of the credential survived`,
    );
  }
});
