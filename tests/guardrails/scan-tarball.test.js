import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSensitiveBasename } from '../../scripts/guardrails/scan-tarball.js';

test('blocks plain dotenv files', () => {
  assert.equal(isSensitiveBasename('.env'), true);
  assert.equal(isSensitiveBasename('.env.local'), true);
  assert.equal(isSensitiveBasename('.env.production'), true);
});

test('blocks env-segment basenames without leading dot', () => {
  // Regression: previously only `base.startsWith('.env')` was checked, so
  // `prod.env.local` and `staging.env` slipped through.
  assert.equal(isSensitiveBasename('prod.env.local'), true);
  assert.equal(isSensitiveBasename('staging.env'), true);
  assert.equal(isSensitiveBasename('app.env.production'), true);
});

test('blocks known SSH key filenames', () => {
  assert.equal(isSensitiveBasename('id_rsa'), true);
  assert.equal(isSensitiveBasename('id_rsa.pub'), true);
});

test('allows ordinary basenames', () => {
  assert.equal(isSensitiveBasename('README.md'), false);
  assert.equal(isSensitiveBasename('package.json'), false);
  assert.equal(isSensitiveBasename('envelope.txt'), false);
  assert.equal(isSensitiveBasename('environment-helpers.js'), false);
});
