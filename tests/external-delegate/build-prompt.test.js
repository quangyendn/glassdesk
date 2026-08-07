import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from '../../plugins/glassdesk/bin/lib/build-prompt.mjs';

const TASK = {
  task_type: 'code-review',
  objective: 'Review the migration for data-integrity risk.',
  scope: { files: ['db/migrate.rb'] },
  context: {
    summary: 'The migration rewrites existing rates.',
    inline: [{ label: 'failing test', content: 'expected 3, got 1' }],
  },
  constraints: ['Do not modify files'],
  out_of_scope: ['Frontend'],
  acceptance_criteria: ['Identify irreversible operations'],
};

const FILES = [{ path: 'db/migrate.rb', content: 'class M < Migration; end', bytes: 24 }];

const SPECIALIST = {
  name: 'code-reviewer',
  useFor: ['code-review'],
  instructions: 'Report only actionable findings.',
};

test('specialist instructions lead the prompt', () => {
  const p = buildPrompt({ task: TASK, specialist: SPECIALIST, files: FILES, mode: 'advisory' });
  assert.ok(p.startsWith('Report only actionable findings.'), p.slice(0, 80));
});

test('advisory inlines file contents', () => {
  const p = buildPrompt({ task: TASK, specialist: null, files: FILES, mode: 'advisory' });
  assert.match(p, /## File: db\/migrate\.rb/);
  assert.match(p, /class M < Migration/);
});

test('repository-read lists paths and does not inline contents', () => {
  const p = buildPrompt({ task: TASK, specialist: null, files: FILES, mode: 'repository-read' });
  assert.match(p, /db\/migrate\.rb/);
  assert.equal(p.includes('class M < Migration'), false);
});

test('patch-proposal asks for a unified diff and forbids applying it', () => {
  const p = buildPrompt({ task: TASK, specialist: null, files: FILES, mode: 'patch-proposal' });
  assert.match(p, /unified diff/i);
  assert.match(p, /[Dd]o not apply/);
});

test('advisory states that the provider has no repository access', () => {
  const p = buildPrompt({ task: TASK, specialist: null, files: FILES, mode: 'advisory' });
  assert.match(p, /no access to the repository/i);
});

test('every declared section appears', () => {
  const p = buildPrompt({ task: TASK, specialist: null, files: FILES, mode: 'advisory' });
  for (const s of ['## Objective', '## Context', '## Constraints', '## Out of scope', '## Acceptance criteria', '## failing test']) {
    assert.ok(p.includes(s), `missing section ${s}`);
  }
});

test('optional sections are omitted, not left empty', () => {
  const p = buildPrompt({ task: { objective: 'Just this.' }, specialist: null, files: [], mode: 'advisory' });
  assert.equal(p.includes('## Constraints'), false);
  assert.equal(p.includes('## Out of scope'), false);
  assert.match(p, /Just this\./);
});
