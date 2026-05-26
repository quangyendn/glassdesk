// Policy guard: the committed `.guardrails.json` pathAllowlist must not
// silently skip public source files. Path-level skips are reserved for
// scanner-self-reference files and large machine-generated artifacts.
//
// If you need to suppress a specific value (e.g. a fixture string in docs),
// add a narrow `regexes` entry to .gitleaks.toml [allowlist] instead.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPathAllowed, scanText } from '../../scripts/guardrails/lib/scanner.js';
import { loadConfig } from '../../scripts/guardrails/lib/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');

const PUBLIC_PATHS_THAT_MUST_BE_SCANNED = [
  'docs/guardrails.md',
  'docs/specs/some-future-spec.md',
  'plugins/glassdesk/CHANGELOG.md',
  'CHANGELOG.md',
  'README.md',
  'plugins/glassdesk/docs/serena-preference.md',
  'templates/github-actions/pr-review.yml',
  'plugins/glassdesk/skills/debugging/SKILL.md',
];

test('pathAllowlist does not skip public source files', () => {
  const config = loadConfig(REPO_ROOT);
  for (const path of PUBLIC_PATHS_THAT_MUST_BE_SCANNED) {
    assert.equal(
      isPathAllowed(path, config.pathAllowlist),
      false,
      `${path} must not be in pathAllowlist — it is public and shipped/visible in git history`,
    );
  }
});

test('scanner catches a secret planted in a hypothetical doc/spec file', () => {
  const config = loadConfig(REPO_ROOT);
  const planted = '# Spec\n\nExample creds: AKIAIOSFODNN7EXAMPLZ\nContact: leak@randomcorp.io\n';
  const findings = scanText(planted, config, { path: 'docs/specs/hypothetical.md' });
  const rules = new Set(findings.map((f) => f.rule));
  assert.ok(rules.has('aws-access-key'), 'AWS key in spec must be flagged');
  assert.ok(rules.has('unallowlisted-email'), 'Unallowlisted email in spec must be flagged');
});

test('committed .gitleaks.toml does not allowlist public source paths', () => {
  const toml = readFileSync(resolve(REPO_ROOT, '.gitleaks.toml'), 'utf8');
  const forbiddenPatterns = [
    /docs\/specs/,
    /docs\/guardrails\.md/,
    /CHANGELOG\.md/,
    /templates/,
  ];
  for (const re of forbiddenPatterns) {
    assert.equal(
      re.test(toml),
      false,
      `.gitleaks.toml must not allowlist public paths matching ${re}`,
    );
  }
});
