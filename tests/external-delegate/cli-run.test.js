import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, '../../plugins/glassdesk/bin/external-ai.mjs');

// scenario() is called from ~20 call sites in this file, several inside
// loops, so it does not thread a per-test `t` through to register its own
// t.after() cleanup. Instead every mkdtemp'd dir it creates is tracked here
// and removed once, after all tests in this file finish — previously none
// of them were ever removed, and a full run of this file alone leaked
// dozens of directories per run (676 had accumulated on the machine that
// caught this).
const scenarioDirs = [];
after(() => {
  for (const dir of scenarioDirs) fs.rmSync(dir, { recursive: true, force: true });
});

// A registry whose single cli-agent provider is a stub script we control.
function scenario({ providerScript = '#!/bin/sh\necho PROVIDER_OUTPUT\nexit 0\n', extraProviders = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-ext-clirun-'));
  scenarioDirs.push(dir);
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

for (const bad of ['abc', '-1', '0']) {
  test(`--timeout ${bad} is rejected instead of crashing or disabling the timeout`, () => {
    const s = scenario({ providerScript: '#!/bin/sh\nsleep 3\necho SHOULD_NOT_COMPLETE\nexit 0\n' });
    const task = writeTask(s.dir, { objective: 'x' });
    const r = run(['run', '--provider', 'stub', '--task-file', task, '--timeout', bad], {
      PATH: s.binDir, GD_EXTERNAL_PROVIDERS: s.registryPath,
    });
    assert.equal(r.status, 12, r.stderr);
    assert.match(r.stderr, new RegExp(`--timeout.*${bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    // Must fail before spawning the provider at all, not merely time out.
    assert.equal(r.stdout.includes('SHOULD_NOT_COMPLETE'), false);
  });
}

test('an unwritable --output path still emits the envelope to stdout and reports the failure on stderr', () => {
  const s = scenario();
  const task = writeTask(s.dir, { objective: 'x' });
  const badOutput = path.join(s.dir, 'no-such-dir', 'result.json');
  const r = run(['run', '--provider', 'stub', '--task-file', task, '--output', badOutput], {
    PATH: s.binDir, GD_EXTERNAL_PROVIDERS: s.registryPath,
  });
  // The provider ran and succeeded; a write failure afterward must not change
  // the exit code the run itself earned.
  assert.equal(r.status, 0);
  const env = JSON.parse(r.stdout);
  assert.match(env.raw_output, /PROVIDER_OUTPUT/);
  assert.match(r.stderr, /cannot write --output/);
  assert.equal(fs.existsSync(badOutput), false);
});

// Finding 1: a valueless --output must be rejected before the provider is
// ever spawned, not after it has already run and returned. The stub writes a
// marker file as a side effect visible from outside the child process, so
// "the provider never ran" is checkable independently of the exit code.
test('a valueless --output is rejected before the provider is spawned', () => {
  const marker = path.join(os.tmpdir(), `gd-ext-marker-${process.pid}-${Date.now()}`);
  const s = scenario({ providerScript: `#!/bin/sh\ntouch ${marker}\necho PROVIDER_OUTPUT\nexit 0\n` });
  const task = writeTask(s.dir, { objective: 'x' });
  try {
    const r = run(['run', '--provider', 'stub', '--task-file', task, '--output'], {
      PATH: s.binDir, GD_EXTERNAL_PROVIDERS: s.registryPath,
    });
    assert.equal(r.status, 12, r.stderr);
    assert.match(r.stderr, /--output requires a value/);
    assert.equal(r.stdout.trim(), '', 'no envelope should be emitted for a request that never ran');
    assert.equal(fs.existsSync(marker), false, 'the provider must never have been spawned');
  } finally {
    fs.rmSync(marker, { force: true });
  }
});

// Finding 4: --output must not be usable to silently overwrite a file that
// already exists — the dispatcher has no Edit/Write tool of its own, and an
// unscoped overwrite through --output would hand that capability back.
// Fold-in from the re-review: the pre-flight existsSync check is advisory
// only. fs.existsSync follows symlinks and reports false for a *dangling*
// one (its target doesn't exist), so a dangling symlink at --output's path
// sails through that check — unlike the "existing file" case above, the
// provider DOES run here. The write itself must still refuse: `wx` fails
// with EEXIST on any symlink component regardless of where it points, per
// POSIX, so the run's own already-computed envelope goes to stdout instead,
// and — the actual point of the test — nothing is ever written to whatever
// the symlink points at.
test('--output pointing at a dangling symlink is refused at write time, and the link target is never created', () => {
  const s = scenario();
  const task = writeTask(s.dir, { objective: 'x' });
  const linkPath = path.join(s.dir, 'dangling-link.json');
  const linkTarget = path.join(s.dir, 'wherever-the-symlink-points.json');
  fs.symlinkSync(linkTarget, linkPath);
  try {
    const r = run(['run', '--provider', 'stub', '--task-file', task, '--output', linkPath], {
      PATH: s.binDir, GD_EXTERNAL_PROVIDERS: s.registryPath,
    });
    assert.equal(r.status, 12, r.stderr);
    assert.match(r.stderr, /already exists/);
    const env = JSON.parse(r.stdout);
    assert.match(env.raw_output, /PROVIDER_OUTPUT/, 'the already-paid-for run must still be visible on stdout');
    assert.equal(fs.existsSync(linkTarget), false, 'the symlink target must never be written to');
  } finally {
    fs.rmSync(linkPath, { force: true });
  }
});

test('--output refuses to overwrite an existing file, and never spawns the provider', () => {
  const marker = path.join(os.tmpdir(), `gd-ext-marker-${process.pid}-${Date.now()}`);
  const s = scenario({ providerScript: `#!/bin/sh\ntouch ${marker}\necho PROVIDER_OUTPUT\nexit 0\n` });
  const task = writeTask(s.dir, { objective: 'x' });
  const existing = path.join(s.dir, 'already-here.json');
  fs.writeFileSync(existing, 'do not touch me');
  try {
    const r = run(['run', '--provider', 'stub', '--task-file', task, '--output', existing], {
      PATH: s.binDir, GD_EXTERNAL_PROVIDERS: s.registryPath,
    });
    assert.equal(r.status, 12, r.stderr);
    assert.match(r.stderr, /already exists/);
    assert.equal(fs.readFileSync(existing, 'utf8'), 'do not touch me');
    assert.equal(fs.existsSync(marker), false, 'the provider must never have been spawned');
  } finally {
    fs.rmSync(marker, { force: true });
  }
});

// Finding 3: a provider's own exit code lives in a namespace it does not
// coordinate with this contract's reserved values. Exit 13 from the
// dispatcher means EXIT.PRIVACY ("refused, nothing sent") — a provider that
// merely happens to exit 13 after a completed run must not be reported that
// way, or the agent will wrongly conclude nothing left the machine.
for (const providerExit of [10, 11, 12, 13, 14, 20]) {
  test(`a provider exiting ${providerExit} does not collide with the reserved exit-code contract`, () => {
    const s = scenario({ providerScript: `#!/bin/sh\necho PROVIDER_OUTPUT\nexit ${providerExit}\n` });
    const task = writeTask(s.dir, { objective: 'x' });
    const r = run(['run', '--provider', 'stub', '--task-file', task], {
      PATH: s.binDir, GD_EXTERNAL_PROVIDERS: s.registryPath,
    });
    assert.equal(r.status, 1, `dispatcher exit code must collapse to 1, not pass through ${providerExit} raw`);
    const env = JSON.parse(r.stdout);
    // The true value is not lost — it is still visible in the envelope.
    assert.equal(env.exit_code, providerExit);
    assert.equal(env.status, 'failed');
  });
}

// Finding 2: `advisory` promises the provider "no access to the repository"
// (build-prompt.mjs's MODE_CONTRACT), but a spawned child inherits this
// process's cwd unless told otherwise. Prove the isolation at the process
// level, not just in the prompt text: a provider whose own tools try to
// read a file relative to its cwd must fail to see it in `advisory` mode,
// and must succeed in `repository-read` mode, where it is deliberately
// handed the repository.
test('advisory mode spawns the provider with no view of the repository; repository-read hands it scope.root', () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-ext-repo-'));
  fs.writeFileSync(path.join(repoDir, 'marker.txt'), 'REPO_MARKER_CONTENT');
  try {
    const s = scenario({
      extraProviders: {
        stub: {
          type: 'cli-agent', enabled: 'auto', priority: 1, bin: 'stubcli',
          default_model: 'stub-model',
          modes: ['advisory', 'repository-read'],
          capabilities: ['code-review', 'analysis'],
          privacy: { execution: 'external-service', restricted_data_allowed: false },
          notes: 'test stub',
          invoke: {
            advisory: { argv: ['-p', '{prompt}'], env: {} },
            'repository-read': { argv: ['-p', '{prompt}', '--dir', '{dir}'], env: {} },
          },
        },
      },
      providerScript: '#!/bin/sh\ncat marker.txt 2>/dev/null || echo NO_ACCESS\n',
    });

    // `cat` itself has to resolve from PATH inside the stub script, so PATH
    // must include the real system path, not just the stub's own directory
    // (a PATH scoped to only the stub would make `cat` unresolvable and
    // produce "command not found" on stderr, which the script's `|| echo
    // NO_ACCESS` would mask as if the file were merely absent).
    const scopedPath = `${s.binDir}${path.delimiter}${process.env.PATH || ''}`;

    const advisoryTask = writeTask(s.dir, { objective: 'x', scope: { root: repoDir } });
    const advisoryRun = run(['run', '--provider', 'stub', '--task-file', advisoryTask, '--mode', 'advisory'], {
      PATH: scopedPath, GD_EXTERNAL_PROVIDERS: s.registryPath,
    });
    assert.equal(advisoryRun.status, 0, advisoryRun.stderr);
    assert.match(JSON.parse(advisoryRun.stdout).raw_output, /NO_ACCESS/);

    const readTask = writeTask(s.dir, { objective: 'x', scope: { root: repoDir } });
    const readRun = run(['run', '--provider', 'stub', '--task-file', readTask, '--mode', 'repository-read'], {
      PATH: scopedPath, GD_EXTERNAL_PROVIDERS: s.registryPath,
    });
    assert.equal(readRun.status, 0, readRun.stderr);
    assert.match(JSON.parse(readRun.stdout).raw_output, /REPO_MARKER_CONTENT/);
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

// Finding 8: the envelope's `command` field should not embed the whole
// prompt a second time — every CLI template contains `{prompt}`, and at the
// byte cap that one argv element can be most of the envelope.
test('the command field carries a byte-length placeholder for the prompt, not the prompt itself', () => {
  // The stub echoes its own argv so the test can see exactly what commandLine
  // captured, same technique as the specialist-profile test above.
  const s = scenario({ providerScript: '#!/bin/sh\necho "$2"\n' });
  const longObjective = 'x'.repeat(5000);
  const task = writeTask(s.dir, { objective: longObjective });
  const r = run(['run', '--provider', 'stub', '--task-file', task], {
    PATH: s.binDir, GD_EXTERNAL_PROVIDERS: s.registryPath,
  });
  assert.equal(r.status, 0, r.stderr);
  const env = JSON.parse(r.stdout);
  // The full prompt did reach the provider (raw_output proves it, since the
  // stub echoed its own second argv element back).
  assert.match(env.raw_output, /x{5000}/);
  // But the command field must not carry that same text again.
  assert.equal(env.command.includes('x'.repeat(5000)), false, 'the prompt must not be duplicated into `command`');
  assert.match(env.command, /<prompt:\d+B>/);
});

// ---------------------------------------------------------------------------
// Review round 1, P1: repository-visible modes hand the provider scope.root
// itself. The per-file deny list therefore governs only what is pushed into
// the prompt, and an unlisted credential file in that tree stays readable
// while `context_sent` reports just the declared files.
// ---------------------------------------------------------------------------

const REPO_PROVIDER = {
  repo: {
    type: 'cli-agent', enabled: 'auto', priority: 2, bin: 'stubcli',
    default_model: 'stub-model',
    modes: ['advisory', 'repository-read'],
    capabilities: ['code-review', 'analysis'],
    privacy: { execution: 'external-service', restricted_data_allowed: false },
    notes: 'test stub with repository access',
    invoke: {
      advisory: { argv: ['-p', '{prompt}'], env: {} },
      'repository-read': { argv: ['-p', '{prompt}', '--dir', '{dir}'], env: {} },
    },
  },
};

test('repository-read exits 13 when the scope root holds an undeclared .env', () => {
  const s = scenario({ providerScript: '#!/bin/sh\necho SHOULD_NOT_RUN\nexit 0\n', extraProviders: REPO_PROVIDER });
  const root = path.join(s.dir, 'repo');
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, 'a.ts'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(root, '.env'), 'TOKEN=abc\n');
  const task = writeTask(s.dir, { objective: 'x', scope: { files: ['a.ts'], root } });
  const r = run(['run', '--provider', 'repo', '--mode', 'repository-read', '--task-file', task], {
    PATH: s.binDir, GD_EXTERNAL_PROVIDERS: s.registryPath,
  });
  assert.equal(r.status, 13, r.stderr);
  assert.match(r.stderr, /\.env/);
  assert.doesNotMatch(r.stdout, /SHOULD_NOT_RUN/, 'the gate must run before the provider is spawned');
});

test('repository-read records the exposed root in the envelope, advisory records null', () => {
  const s = scenario({ extraProviders: REPO_PROVIDER });
  const root = path.join(s.dir, 'repo');
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, 'a.ts'), 'export const a = 1;\n');
  const task = writeTask(s.dir, { objective: 'x', scope: { files: ['a.ts'], root } });

  const repoRun = run(['run', '--provider', 'repo', '--mode', 'repository-read', '--task-file', task], {
    PATH: s.binDir, GD_EXTERNAL_PROVIDERS: s.registryPath,
  });
  assert.equal(repoRun.status, 0, repoRun.stderr);
  assert.equal(JSON.parse(repoRun.stdout).context_sent.repository_root, root);

  const advisoryRun = run(['run', '--provider', 'repo', '--mode', 'advisory', '--task-file', task], {
    PATH: s.binDir, GD_EXTERNAL_PROVIDERS: s.registryPath,
  });
  assert.equal(advisoryRun.status, 0, advisoryRun.stderr);
  assert.equal(JSON.parse(advisoryRun.stdout).context_sent.repository_root, null);
});

test('a provider declared local-only but pointed at a remote endpoint exits 13', () => {
  const s = scenario({
    extraProviders: {
      localish: {
        type: 'openai-compatible', enabled: 'auto', priority: 3,
        modes: ['advisory'], capabilities: ['analysis'],
        privacy: { execution: 'local-only', restricted_data_allowed: true },
        env: { base_url: 'GD_TEST_LOCALISH_URL', api_key: 'GD_T_LOCALISH_K', model: 'GD_TEST_LOCALISH_MODEL' },
        endpoint_defaults: { base_url: 'http://127.0.0.1:11434/v1', model: 'm' },
        notes: 'test stub',
      },
    },
  });
  const task = writeTask(s.dir, { objective: 'x', privacy: { classification: 'restricted' } });
  const r = run(['run', '--provider', 'localish', '--task-file', task], {
    PATH: s.binDir, GD_EXTERNAL_PROVIDERS: s.registryPath,
    GD_TEST_LOCALISH_URL: 'https://api.example.com/v1',
  });
  assert.equal(r.status, 13, r.stderr);
  assert.match(r.stderr, /loopback/);
});

test('the child provider does not inherit this process\'s credentials', () => {
  // The stub prints what it can see of the parent's environment. Only shell
  // builtins are used: the child's PATH is now allowlisted down to the stub's
  // own directory, so /usr/bin/env is not reachable from it.
  const s = scenario({
    providerScript: '#!/bin/sh\necho "ANTHROPIC_API_KEY=[$ANTHROPIC_API_KEY]"\n'
      + 'echo "GD_FAKE_TOKEN=[$GD_FAKE_TOKEN]"\necho "PATH=[$PATH]"\n',
  });
  const task = writeTask(s.dir, { objective: 'x' });
  const r = run(['run', '--provider', 'stub', '--task-file', task], {
    PATH: s.binDir,
    GD_EXTERNAL_PROVIDERS: s.registryPath,
    ANTHROPIC_API_KEY: 'ant-must-not-travel',
    GD_FAKE_TOKEN: 'gh-must-not-travel',
  });
  assert.equal(r.status, 0, r.stderr);
  const env = JSON.parse(r.stdout);
  assert.doesNotMatch(env.raw_output, /must-not-travel/);
  assert.match(env.raw_output, /ANTHROPIC_API_KEY=\[\]/);
  assert.match(env.raw_output, /GD_FAKE_TOKEN=\[\]/);
  assert.match(env.raw_output, /PATH=\[.+\]/, 'the child still needs a usable environment');
});

// ---------------------------------------------------------------------------
// Review round 2, P2: an explicitly empty flag value was folded into "absent"
// and silently replaced with the fallback. `--output ""` was the worst of
// them: it spawned the provider and then printed the envelope to stdout, so a
// caller whose output path came out empty got a successful-looking run whose
// result went somewhere it was not expecting.
// ---------------------------------------------------------------------------

test('an explicitly empty flag value exits 12 rather than falling back', () => {
  for (const flag of ['--output', '--mode', '--timeout', '--specialist']) {
    const s = scenario({ providerScript: '#!/bin/sh\necho SHOULD_NOT_RUN\nexit 0\n' });
    const task = writeTask(s.dir, { objective: 'x' });
    const r = run(['run', '--provider', 'stub', '--task-file', task, flag, ''], {
      PATH: s.binDir, GD_EXTERNAL_PROVIDERS: s.registryPath,
    });
    assert.equal(r.status, 12, `${flag} "" must be refused: ${r.stderr}`);
    assert.match(r.stderr, /non-empty/);
    assert.doesNotMatch(r.stdout, /SHOULD_NOT_RUN/, `${flag} "" must be refused before the provider runs`);
  }
});

test('a scope.files given as a string exits 13 instead of being iterated', () => {
  const s = scenario({ providerScript: '#!/bin/sh\necho SHOULD_NOT_RUN\nexit 0\n' });
  const task = writeTask(s.dir, { objective: 'x', scope: { files: 'a.ts', root: s.dir } });
  const r = run(['run', '--provider', 'stub', '--task-file', task], {
    PATH: s.binDir, GD_EXTERNAL_PROVIDERS: s.registryPath,
  });
  assert.equal(r.status, 13, r.stderr);
  assert.match(r.stderr, /must be an array/);
});

test('repository-read exits 13 when a symlink in the scope root points at a denied file', () => {
  const s = scenario({ providerScript: '#!/bin/sh\necho SHOULD_NOT_RUN\nexit 0\n', extraProviders: REPO_PROVIDER });
  const root = path.join(s.dir, 'repo');
  fs.mkdirSync(path.join(root, 'conf'), { recursive: true });
  fs.writeFileSync(path.join(root, 'a.ts'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(root, 'conf', 'server.pem'), 'key\n');
  fs.symlinkSync(path.join(root, 'conf', 'server.pem'), path.join(root, 'notes.txt'));
  const task = writeTask(s.dir, { objective: 'x', scope: { files: ['a.ts'], root } });
  const r = run(['run', '--provider', 'repo', '--mode', 'repository-read', '--task-file', task], {
    PATH: s.binDir, GD_EXTERNAL_PROVIDERS: s.registryPath,
  });
  assert.equal(r.status, 13, r.stderr);
  assert.doesNotMatch(r.stdout, /SHOULD_NOT_RUN/);
});
