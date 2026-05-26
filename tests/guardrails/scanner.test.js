import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanText } from '../../scripts/guardrails/lib/scanner.js';

const baseConfig = {
  internalRefs: [],
  emailAllowlist: ['@example.com', '@anthropic.com'],
  pathAllowlist: [],
};

test('detects macOS personal home path', () => {
  const findings = scanText('const p = "/Users/john/secrets.txt";', baseConfig, { path: 'a.js' });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'personal-macos-home');
});

test('detects Linux personal home path', () => {
  const findings = scanText('cd /home/alice/project', baseConfig, { path: 'a.sh' });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'personal-linux-home');
});

test('detects AWS access key id', () => {
  const findings = scanText('AKIAIOSFODNN7EXAMPLZ', baseConfig, { path: 'a.js' });
  assert.ok(findings.some((f) => f.rule === 'aws-access-key'));
});

test('detects unallowlisted email', () => {
  const findings = scanText('contact: dev@randomcorp.io', baseConfig, { path: 'a.md' });
  assert.equal(findings.filter((f) => f.rule === 'unallowlisted-email').length, 1);
});

test('skips allowlisted emails', () => {
  const findings = scanText('contact: dev@example.com', baseConfig, { path: 'a.md' });
  assert.equal(findings.filter((f) => f.rule === 'unallowlisted-email').length, 0);
});

test('flags configured internal refs case-insensitively', () => {
  const findings = scanText('Bug for AcmeCorp', { ...baseConfig, internalRefs: ['acmecorp'] }, { path: 'a.md' });
  assert.equal(findings.filter((f) => f.rule === 'internal-ref').length, 1);
});

test('detects private key marker', () => {
  const findings = scanText('-----BEGIN RSA PRIVATE KEY-----', baseConfig, { path: 'a.key' });
  assert.ok(findings.some((f) => f.rule === 'private-key'));
});

test('reports line numbers correctly', () => {
  const text = 'line1\nline2\n/Users/yennq/x';
  const findings = scanText(text, baseConfig, { path: 'a.js' });
  assert.equal(findings[0].line, 3);
});

test('clean input yields no findings', () => {
  const findings = scanText('const x = 1;', baseConfig, { path: 'a.js' });
  assert.equal(findings.length, 0);
});
