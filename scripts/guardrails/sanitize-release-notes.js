#!/usr/bin/env node
// Generate release notes from Conventional Commits since the last tag, then
// scan the output for sensitive info. Writes RELEASE_NOTES.md (gitignored).
// Exits non-zero if any sensitive pattern is detected.

import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { loadConfig } from './lib/config.js';
import { scanText, formatFindings } from './lib/scanner.js';

function lastTag() {
  try {
    return execSync('git describe --tags --abbrev=0', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function commitsSince(ref) {
  const range = ref ? `${ref}..HEAD` : 'HEAD';
  const fmt = '%h%x09%s';
  const out = execSync(`git log ${range} --pretty=format:${fmt}`, { encoding: 'utf8' });
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, ...rest] = line.split('\t');
      return { sha, subject: rest.join('\t') };
    });
}

const GROUPS = [
  { label: '### Features', type: 'feat' },
  { label: '### Fixes', type: 'fix' },
  { label: '### Performance', type: 'perf' },
  { label: '### Refactor', type: 'refactor' },
  { label: '### Documentation', type: 'docs' },
  { label: '### Build / CI', type: 'build|ci' },
  { label: '### Chore', type: 'chore' },
];

function classify(subject) {
  const m = subject.match(/^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\([^)]+\))?!?:\s*(.+)$/);
  if (!m) return { type: 'other', rest: subject };
  return { type: m[1], rest: m[2] };
}

function render(commits, fromTag, toVersion) {
  const buckets = new Map(GROUPS.map((g) => [g.label, []]));
  const other = [];
  for (const c of commits) {
    const { type, rest } = classify(c.subject);
    const group = GROUPS.find((g) => new RegExp(`^(${g.type})$`).test(type));
    const line = `- ${rest} (${c.sha})`;
    if (group) buckets.get(group.label).push(line);
    else other.push(line);
  }

  const lines = [`## ${toVersion}`, ''];
  if (fromTag) lines.push(`_Changes since ${fromTag}._`, '');
  for (const g of GROUPS) {
    const entries = buckets.get(g.label);
    if (entries.length === 0) continue;
    lines.push(g.label, ...entries, '');
  }
  if (other.length > 0) {
    lines.push('### Other', ...other, '');
  }
  return lines.join('\n');
}

function main() {
  const config = loadConfig();
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const tag = lastTag();
  const commits = commitsSince(tag);

  if (commits.length === 0) {
    console.error('[guardrails] No commits since last tag; nothing to release.');
    process.exit(1);
  }

  const body = render(commits, tag, `v${pkg.version}`);
  const findings = scanText(body, config, { path: '<release-notes>' });

  if (findings.length > 0) {
    console.error('[guardrails] Release notes contain sensitive info; refusing to publish.');
    console.error(formatFindings(findings));
    process.exit(1);
  }

  writeFileSync('RELEASE_NOTES.md', body);
  console.log(`[guardrails] Release notes ok (${commits.length} commits). Wrote RELEASE_NOTES.md.`);
}

main();
