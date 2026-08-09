import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EXIT } from '../../plugins/glassdesk/bin/lib/exit-codes.mjs';
import {
  gateMode,
  gateCapability,
  gatePrivacy,
  gateEndpoint,
  gateRepositoryExposure,
  isLoopbackHost,
  gateContext,
  GateError,
} from '../../plugins/glassdesk/bin/lib/policy-gates.mjs';

const REMOTE = {
  modes: ['advisory', 'repository-read'],
  capabilities: ['code-review', 'analysis'],
  privacy: { execution: 'external-service', restricted_data_allowed: false },
};
const LOCAL = {
  modes: ['advisory'],
  capabilities: ['analysis'],
  privacy: { execution: 'local-only', restricted_data_allowed: true },
};

function scratch(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-ext-ctx-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

function cleanup(t, dir) {
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
}

test('gateMode accepts a declared mode', () => {
  assert.equal(gateMode(REMOTE, 'advisory'), null);
});

test('gateMode rejects an undeclared mode with UNSUPPORTED', () => {
  const g = gateMode(REMOTE, 'patch-proposal');
  assert.equal(g.code, EXIT.UNSUPPORTED);
  assert.match(g.message, /patch-proposal/);
});

test('gateCapability rejects an unsupported task type', () => {
  assert.equal(gateCapability(REMOTE, 'code-review'), null);
  assert.equal(gateCapability(REMOTE, 'multimodal-analysis').code, EXIT.UNSUPPORTED);
});

test('gateCapability passes when the task type is absent', () => {
  assert.equal(gateCapability(REMOTE, undefined), null);
});

test('gatePrivacy blocks restricted data on a remote provider', () => {
  const g = gatePrivacy(REMOTE, { privacy: { classification: 'restricted' } });
  assert.equal(g.code, EXIT.PRIVACY);
  assert.match(g.message, /restricted/);
});

test('gatePrivacy allows restricted data on a local-only provider', () => {
  assert.equal(gatePrivacy(LOCAL, { privacy: { classification: 'restricted' } }), null);
});

test('gatePrivacy allows internal data on a remote provider', () => {
  assert.equal(gatePrivacy(REMOTE, { privacy: { classification: 'internal' } }), null);
});

test('gatePrivacy rejects an unknown classification — fail closed', () => {
  const g = gatePrivacy(REMOTE, { privacy: { classification: 'top-secret-ish' } });
  assert.equal(g.code, EXIT.PRIVACY);
});

test('gatePrivacy defaults a missing classification to internal', () => {
  assert.equal(gatePrivacy(REMOTE, {}), null);
});

test('gateContext reads declared files and reports bytes', (t) => {
  const dir = scratch({ 'src/a.ts': 'export const a = 1;\n' });
  cleanup(t, dir);
  const out = gateContext({ scope: { files: ['src/a.ts'] } }, { max_context_bytes: 1000 }, dir);
  assert.equal(out.files.length, 1);
  assert.equal(out.files[0].path, 'src/a.ts');
  assert.match(out.files[0].content, /export const a/);
  assert.ok(out.totalBytes > 0);
});

test('gateContext aborts the whole run on a denied path — never a silent drop', (t) => {
  const dir = scratch({ '.env': 'SECRET=1\n', 'src/a.ts': 'ok\n' });
  cleanup(t, dir);
  try {
    gateContext({ scope: { files: ['src/a.ts', '.env'] } }, {}, dir);
    assert.fail('expected GateError');
  } catch (e) {
    assert.ok(e instanceof GateError);
    assert.equal(e.code, EXIT.PRIVACY);
    assert.match(e.message, /\.env/);
  }
});

test('gateContext rejects a secret found inside an allowed file', (t) => {
  const dir = scratch({ 'src/config.ts': 'const k = "sk-abcdefghijklmnopqrstuvwx";\n' });
  cleanup(t, dir);
  try {
    gateContext({ scope: { files: ['src/config.ts'] } }, {}, dir);
    assert.fail('expected GateError');
  } catch (e) {
    assert.equal(e.code, EXIT.PRIVACY);
    assert.match(e.message, /openai-style-key/);
    assert.equal(e.message.includes('sk-abcdefghijklmnopqrstuvwx'), false, 'secret leaked into the error');
  }
});

test('gateContext rejects a secret in inline context', (t) => {
  const dir = scratch({});
  cleanup(t, dir);
  try {
    gateContext(
      { context: { inline: [{ label: 'log', content: 'AKIAIOSFODNN7EXAMPLE' }] } },
      {},
      dir,
    );
    assert.fail('expected GateError');
  } catch (e) {
    assert.equal(e.code, EXIT.PRIVACY);
    assert.match(e.message, /aws-access-key/);
  }
});

test('gateContext rejects a path escaping the scope root', (t) => {
  const dir = scratch({ 'src/a.ts': 'ok\n' });
  cleanup(t, dir);
  try {
    gateContext({ scope: { files: ['../../../etc/hosts'] } }, {}, dir);
    assert.fail('expected GateError');
  } catch (e) {
    assert.equal(e.code, EXIT.PRIVACY);
    assert.match(e.message, /outside/);
  }
});

test('gateContext rejects a missing file — fail closed', (t) => {
  const dir = scratch({});
  cleanup(t, dir);
  try {
    gateContext({ scope: { files: ['nope.ts'] } }, {}, dir);
    assert.fail('expected GateError');
  } catch (e) {
    assert.equal(e.code, EXIT.PRIVACY);
    assert.match(e.message, /cannot read/);
  }
});

test('gateContext enforces max_context_bytes', (t) => {
  const dir = scratch({ 'big.txt': 'x'.repeat(5000) });
  cleanup(t, dir);
  try {
    gateContext({ scope: { files: ['big.txt'] } }, { max_context_bytes: 100 }, dir);
    assert.fail('expected GateError');
  } catch (e) {
    assert.equal(e.code, EXIT.PRIVACY);
    assert.match(e.message, /max_context_bytes/);
  }
});

// --- Fix 1: symlinks must not defeat scope-root containment ---------------

test('gateContext rejects a symlink inside the scope root pointing outside it', (t) => {
  const dir = scratch({ 'src/a.ts': 'ok\n' });
  cleanup(t, dir);
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-ext-outside-'));
  t.after(() => fs.rmSync(outsideDir, { recursive: true, force: true }));
  const outsideFile = path.join(outsideDir, 'secret.txt');
  fs.writeFileSync(outsideFile, 'outside content\n');
  fs.symlinkSync(outsideFile, path.join(dir, 'link.txt'));

  try {
    gateContext({ scope: { files: ['link.txt'] } }, {}, dir);
    assert.fail('expected GateError');
  } catch (e) {
    assert.ok(e instanceof GateError);
    assert.equal(e.code, EXIT.PRIVACY);
    assert.match(e.message, /outside/);
  }
});

test('gateContext allows a symlink inside the scope root pointing at another file inside it', (t) => {
  const dir = scratch({ 'src/real.ts': 'export const real = 1;\n' });
  cleanup(t, dir);
  fs.symlinkSync(path.join(dir, 'src/real.ts'), path.join(dir, 'src/link.ts'));

  const out = gateContext({ scope: { files: ['src/link.ts'] } }, {}, dir);
  assert.equal(out.files.length, 1);
  assert.match(out.files[0].content, /export const real/);
});

// --- Fix 2: context.summary bytes must count toward the cap ---------------

test('gateContext counts context.summary bytes toward max_context_bytes', (t) => {
  const dir = scratch({});
  cleanup(t, dir);
  try {
    gateContext(
      { context: { summary: 'x'.repeat(1_000_000) } },
      { max_context_bytes: 100 },
      dir,
    );
    assert.fail('expected GateError');
  } catch (e) {
    assert.equal(e.code, EXIT.PRIVACY);
    assert.match(e.message, /max_context_bytes/);
  }
});

// --- Fix 3: non-string entries must fail closed, not throw a raw TypeError -

test('gateContext rejects a non-string scope.files entry — fail closed', (t) => {
  const dir = scratch({});
  cleanup(t, dir);
  try {
    gateContext({ scope: { files: [123] } }, {}, dir);
    assert.fail('expected GateError');
  } catch (e) {
    assert.ok(e instanceof GateError, `expected GateError, got ${e.constructor.name}`);
    assert.equal(e.code, EXIT.PRIVACY);
  }
});

test('gateContext rejects non-string inline context content — fail closed', (t) => {
  const dir = scratch({});
  cleanup(t, dir);
  try {
    gateContext({ context: { inline: [{ label: 'bad', content: 123 }] } }, {}, dir);
    assert.fail('expected GateError');
  } catch (e) {
    assert.ok(e instanceof GateError, `expected GateError, got ${e.constructor.name}`);
    assert.equal(e.code, EXIT.PRIVACY);
  }
});

// --- Fix 4: free-text envelope fields must be scanned and counted ---------

test('gateContext rejects a secret in constraints', (t) => {
  const dir = scratch({});
  cleanup(t, dir);
  try {
    gateContext(
      { constraints: ['keep it simple', 'do not use AKIAIOSFODNN7EXAMPLE'] },
      {},
      dir,
    );
    assert.fail('expected GateError');
  } catch (e) {
    assert.equal(e.code, EXIT.PRIVACY);
    assert.match(e.message, /aws-access-key/);
    assert.match(e.message, /constraints\[1\]/);
  }
});

test('gateContext counts objective/constraints/out_of_scope/acceptance_criteria bytes toward the cap', (t) => {
  const dir = scratch({});
  cleanup(t, dir);
  try {
    gateContext(
      {
        objective: 'x'.repeat(1000),
        constraints: ['y'.repeat(1000)],
        out_of_scope: ['z'.repeat(1000)],
        acceptance_criteria: ['w'.repeat(1000)],
      },
      { max_context_bytes: 100 },
      dir,
    );
    assert.fail('expected GateError');
  } catch (e) {
    assert.equal(e.code, EXIT.PRIVACY);
    assert.match(e.message, /max_context_bytes/);
  }
});

// --- Round 2 review: field-type guards, not just element-type guards ------

test('gateContext rejects a non-array constraints field — fail closed', (t) => {
  const dir = scratch({});
  cleanup(t, dir);
  try {
    gateContext({ constraints: 'not an array' }, {}, dir);
    assert.fail('expected GateError');
  } catch (e) {
    assert.ok(e instanceof GateError, `expected GateError, got ${e.constructor.name}`);
    assert.equal(e.code, EXIT.PRIVACY);
    assert.match(e.message, /constraints/);
  }
});

test('gateContext rejects a non-array out_of_scope field — fail closed', (t) => {
  const dir = scratch({});
  cleanup(t, dir);
  try {
    gateContext({ out_of_scope: 42 }, {}, dir);
    assert.fail('expected GateError');
  } catch (e) {
    assert.ok(e instanceof GateError, `expected GateError, got ${e.constructor.name}`);
    assert.equal(e.code, EXIT.PRIVACY);
    assert.match(e.message, /out_of_scope/);
  }
});

test('gateContext rejects a non-array acceptance_criteria field — fail closed', (t) => {
  const dir = scratch({});
  cleanup(t, dir);
  try {
    gateContext({ acceptance_criteria: { not: 'an array' } }, {}, dir);
    assert.fail('expected GateError');
  } catch (e) {
    assert.ok(e instanceof GateError, `expected GateError, got ${e.constructor.name}`);
    assert.equal(e.code, EXIT.PRIVACY);
    assert.match(e.message, /acceptance_criteria/);
  }
});

test('gateContext rejects a non-object context.inline entry — fail closed', (t) => {
  const dir = scratch({});
  cleanup(t, dir);
  try {
    gateContext({ context: { inline: [123] } }, {}, dir);
    assert.fail('expected GateError');
  } catch (e) {
    assert.ok(e instanceof GateError, `expected GateError, got ${e.constructor.name}`);
    assert.equal(e.code, EXIT.PRIVACY);
  }
});

// --- Post-review fixes: index reporting and secret masking in error messages --

test('gateContext rejects a secret in context.inline[].label and names the index', (t) => {
  const dir = scratch({});
  cleanup(t, dir);
  try {
    gateContext(
      {
        context: {
          inline: [
            { label: 'first entry', content: 'nothing here' },
            { label: 'secret is AKIAIOSFODNN7EXAMPLE', content: 'safe' },
          ],
        },
      },
      {},
      dir,
    );
    assert.fail('expected GateError');
  } catch (e) {
    assert.equal(e.code, EXIT.PRIVACY);
    assert.match(e.message, /context\.inline\[1\]\.label/);
    assert.match(e.message, /aws-access-key/);
    assert.equal(e.message.includes('AKIA'), false, 'error message must not expose secret');
  }
});

test('gateContext rejects a secret in context.inline[].content and names the index', (t) => {
  const dir = scratch({});
  cleanup(t, dir);
  try {
    gateContext(
      {
        context: {
          inline: [
            { label: 'first entry', content: 'safe content' },
            { label: 'second entry', content: 'secret is AKIAIOSFODNN7EXAMPLE here' },
          ],
        },
      },
      {},
      dir,
    );
    assert.fail('expected GateError');
  } catch (e) {
    assert.equal(e.code, EXIT.PRIVACY);
    assert.match(e.message, /context\.inline\[1\]\.content/);
    assert.match(e.message, /aws-access-key/);
    assert.equal(e.message.includes('AKIA'), false, 'error message must not expose secret');
  }
});

// ---------------------------------------------------------------------------
// Review round 1, P1: gatePrivacy lets `local-openai` receive restricted data
// because the registry says execution is local-only. The base URL, however,
// comes from LOCAL_OPENAI_BASE_URL — so without this gate, exporting a remote
// URL keeps the local-only label and ships restricted data off the machine.
// ---------------------------------------------------------------------------

const LOCAL_PROVIDER = {
  type: 'openai-compatible',
  privacy: { execution: 'local-only', restricted_data_allowed: true },
  env: { base_url: 'GD_TEST_BASE_URL', api_key: 'GD_TEST_KEY', model: 'GD_TEST_MODEL' },
  endpoint_defaults: { base_url: 'http://127.0.0.1:11434/v1', model: 'qwen' },
};

test('isLoopbackHost accepts only addresses that cannot leave the machine', () => {
  for (const host of ['localhost', '127.0.0.1', '127.1.2.3', '::1', '[::1]', 'LOCALHOST']) {
    assert.equal(isLoopbackHost(host), true, `${host} is loopback`);
  }
  for (const host of ['api.example.com', '10.0.0.5', '192.168.1.10', '0.0.0.0', 'evil.localhost', '', null]) {
    assert.equal(isLoopbackHost(host), false, `${host} is not loopback`);
  }
});

test('gateEndpoint refuses a local-only provider pointed at a remote host', () => {
  const gate = gateEndpoint(LOCAL_PROVIDER, { GD_TEST_BASE_URL: 'https://api.example.com/v1' });
  assert.equal(gate?.code, EXIT.PRIVACY);
  assert.match(gate.message, /loopback/);
});

test('gateEndpoint allows loopback and the loopback default', () => {
  assert.equal(gateEndpoint(LOCAL_PROVIDER, { GD_TEST_BASE_URL: 'http://127.0.0.1:11434/v1' }), null);
  assert.equal(gateEndpoint(LOCAL_PROVIDER, {}), null, 'the registry default is itself loopback');
});

test('gateEndpoint refuses a malformed or non-http base URL', () => {
  assert.equal(gateEndpoint(LOCAL_PROVIDER, { GD_TEST_BASE_URL: 'not a url' })?.code, EXIT.PRIVACY);
  assert.equal(gateEndpoint(LOCAL_PROVIDER, { GD_TEST_BASE_URL: 'file:///etc/passwd' })?.code, EXIT.PRIVACY);
});

test('gateEndpoint does not constrain a provider that never claimed to be local', () => {
  const remote = {
    type: 'openai-compatible',
    privacy: { execution: 'remote-api', restricted_data_allowed: false },
    env: { base_url: 'GD_TEST_BASE_URL' },
  };
  assert.equal(gateEndpoint(remote, { GD_TEST_BASE_URL: 'https://api.moonshot.ai/v1' }), null);
  assert.equal(gateEndpoint({ type: 'cli-agent' }, {}), null, 'a CLI provider has no endpoint to gate');
});

test('the shipped local-openai entry is the only registry provider that takes restricted data', () => {
  const reg = JSON.parse(
    fs.readFileSync(new URL('../../plugins/glassdesk/config/external-providers.json', import.meta.url), 'utf8'),
  );
  const restricted = Object.entries(reg.providers).filter(
    ([, p]) => p.privacy?.restricted_data_allowed === true,
  );
  assert.deepEqual(restricted.map(([n]) => n), ['local-openai']);
  // …and its shipped default must itself pass the gate, or the entry ships broken.
  assert.equal(gateEndpoint(reg.providers['local-openai'], {}), null);
});

// ---------------------------------------------------------------------------
// Review round 1, P1: in repository-read and patch-proposal the provider is
// handed scope.root and reads it itself, so deny-listing only `scope.files`
// left an unlisted .env one `cat` away while `context_sent` never named it.
// ---------------------------------------------------------------------------

function repoFixture(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-ext-expose-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return dir;
}

test('gateRepositoryExposure passes a tree with nothing denied in it', (t) => {
  const dir = repoFixture(t, { 'src/index.ts': 'export const a = 1;\n', 'README.md': '# hi\n' });
  assert.equal(gateRepositoryExposure(dir), null);
});

test('gateRepositoryExposure refuses a tree holding an undeclared .env', (t) => {
  const dir = repoFixture(t, { 'src/index.ts': 'x', '.env': 'TOKEN=abc\n' });
  const gate = gateRepositoryExposure(dir);
  assert.equal(gate?.code, EXIT.PRIVACY);
  assert.match(gate.message, /\.env/);
});

test('gateRepositoryExposure finds a denied file nested below the root', (t) => {
  const dir = repoFixture(t, { 'deploy/keys/server.pem': 'x' });
  assert.equal(gateRepositoryExposure(dir)?.code, EXIT.PRIVACY);
});

test('gateRepositoryExposure skips vendored trees, and says so rather than claiming completeness', (t) => {
  const dir = repoFixture(t, { 'node_modules/pkg/.env': 'TOKEN=abc\n', 'src/a.ts': 'x' });
  assert.equal(gateRepositoryExposure(dir), null, 'documented limit: node_modules is not swept');
});

test('gateRepositoryExposure fails closed when the tree is too large to sweep', (t) => {
  const files = {};
  for (let i = 0; i < 40; i++) files[`f${i}.txt`] = 'x';
  const dir = repoFixture(t, files);
  const gate = gateRepositoryExposure(dir, { maxEntries: 10 });
  assert.equal(gate?.code, EXIT.PRIVACY);
  assert.match(gate.message, /narrow scope\.root|advisory/);
});

test('gateRepositoryExposure refuses a scope root that does not exist', () => {
  assert.equal(gateRepositoryExposure('/no/such/dir-gd-test')?.code, EXIT.PRIVACY);
});

// ---------------------------------------------------------------------------
// Review round 2, P1: Dirent reports a symlink as neither file nor directory,
// so the sweep checked only the link's own name. A link called `notes.txt`
// pointing at `.env`, or anywhere outside the root, walked straight past the
// gate and would then be followed by the provider handed that root.
// ---------------------------------------------------------------------------

test('gateRepositoryExposure rejects a symlink whose target is denied', (t) => {
  // The target sits inside node_modules, which the walk skips — so only the
  // symlink's target check can catch this, and the test cannot pass by
  // accidentally finding the denied file on its own.
  const dir = repoFixture(t, { 'src/a.ts': 'x', 'node_modules/pkg/server.pem': 'key' });
  fs.symlinkSync(path.join(dir, 'node_modules/pkg/server.pem'), path.join(dir, 'notes.txt'));
  const gate = gateRepositoryExposure(dir);
  assert.equal(gate?.code, EXIT.PRIVACY);
  assert.match(gate.message, /notes\.txt/);
  assert.match(gate.message, /server\.pem/);
});

test('gateRepositoryExposure rejects a symlink pointing outside the scope root', (t) => {
  const outside = repoFixture(t, { 'elsewhere.txt': 'data' });
  const dir = repoFixture(t, { 'src/a.ts': 'x' });
  fs.symlinkSync(outside, path.join(dir, 'escape'));
  const gate = gateRepositoryExposure(dir);
  assert.equal(gate?.code, EXIT.PRIVACY);
  assert.match(gate.message, /outside/);
});

test('gateRepositoryExposure rejects a symlink it cannot resolve', (t) => {
  const dir = repoFixture(t, { 'src/a.ts': 'x' });
  fs.symlinkSync(path.join(dir, 'does-not-exist'), path.join(dir, 'dangling'));
  assert.equal(gateRepositoryExposure(dir)?.code, EXIT.PRIVACY);
});

test('gateRepositoryExposure allows an ordinary symlink inside the root', (t) => {
  const dir = repoFixture(t, { 'src/a.ts': 'x' });
  fs.symlinkSync(path.join(dir, 'src/a.ts'), path.join(dir, 'alias.ts'));
  assert.equal(gateRepositoryExposure(dir), null);
});

test('gateRepositoryExposure does not loop on a symlink cycle', (t) => {
  const dir = repoFixture(t, { 'src/a.ts': 'x' });
  fs.symlinkSync(dir, path.join(dir, 'src', 'self'));
  // The link resolves to the root itself, which is inside the root, so it is
  // allowed — and must not be descended into a second time.
  assert.equal(gateRepositoryExposure(dir), null);
});

// ---------------------------------------------------------------------------
// Review round 2, P2: a string `scope.files` iterates character by character,
// turning one declared path into a dozen unrelated ones; any other
// non-iterable throws a raw TypeError out of the gate meant to fail closed.
// ---------------------------------------------------------------------------

test('gateContext rejects a scope.files that is not an array', () => {
  for (const bad of ['a.ts', 42, {}, true]) {
    assert.throws(
      () => gateContext({ scope: { files: bad } }, {}, process.cwd()),
      (e) => e instanceof GateError && e.code === EXIT.PRIVACY && /must be an array/.test(e.message),
      `scope.files: ${JSON.stringify(bad)} must be refused, not iterated`,
    );
  }
});
