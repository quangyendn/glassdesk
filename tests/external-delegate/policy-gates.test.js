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

test('gateContext reads declared files and reports bytes', () => {
  const dir = scratch({ 'src/a.ts': 'export const a = 1;\n' });
  const out = gateContext({ scope: { files: ['src/a.ts'] } }, { max_context_bytes: 1000 }, dir);
  assert.equal(out.files.length, 1);
  assert.equal(out.files[0].path, 'src/a.ts');
  assert.match(out.files[0].content, /export const a/);
  assert.ok(out.totalBytes > 0);
});

test('gateContext aborts the whole run on a denied path — never a silent drop', () => {
  const dir = scratch({ '.env': 'SECRET=1\n', 'src/a.ts': 'ok\n' });
  try {
    gateContext({ scope: { files: ['src/a.ts', '.env'] } }, {}, dir);
    assert.fail('expected GateError');
  } catch (e) {
    assert.ok(e instanceof GateError);
    assert.equal(e.code, EXIT.PRIVACY);
    assert.match(e.message, /\.env/);
  }
});

test('gateContext rejects a secret found inside an allowed file', () => {
  const dir = scratch({ 'src/config.ts': 'const k = "sk-abcdefghijklmnopqrstuvwx";\n' });
  try {
    gateContext({ scope: { files: ['src/config.ts'] } }, {}, dir);
    assert.fail('expected GateError');
  } catch (e) {
    assert.equal(e.code, EXIT.PRIVACY);
    assert.match(e.message, /openai-style-key/);
    assert.equal(e.message.includes('sk-abcdefghijklmnopqrstuvwx'), false, 'secret leaked into the error');
  }
});

test('gateContext rejects a secret in inline context', () => {
  const dir = scratch({});
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

test('gateContext rejects a path escaping the scope root', () => {
  const dir = scratch({ 'src/a.ts': 'ok\n' });
  try {
    gateContext({ scope: { files: ['../../../etc/hosts'] } }, {}, dir);
    assert.fail('expected GateError');
  } catch (e) {
    assert.equal(e.code, EXIT.PRIVACY);
    assert.match(e.message, /outside/);
  }
});

test('gateContext rejects a missing file — fail closed', () => {
  const dir = scratch({});
  try {
    gateContext({ scope: { files: ['nope.ts'] } }, {}, dir);
    assert.fail('expected GateError');
  } catch (e) {
    assert.equal(e.code, EXIT.PRIVACY);
    assert.match(e.message, /cannot read/);
  }
});

test('gateContext enforces max_context_bytes', () => {
  const dir = scratch({ 'big.txt': 'x'.repeat(5000) });
  try {
    gateContext({ scope: { files: ['big.txt'] } }, { max_context_bytes: 100 }, dir);
    assert.fail('expected GateError');
  } catch (e) {
    assert.equal(e.code, EXIT.PRIVACY);
    assert.match(e.message, /max_context_bytes/);
  }
});
