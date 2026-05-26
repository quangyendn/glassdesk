#!/usr/bin/env node
// Lint the commit message file passed as argv[2] (the git commit-msg hook contract).
// Enforces:
//   - English-only (no Vietnamese diacritics) if commitMessage.blockVietnamese
//   - Conventional Commits subject if commitMessage.requireConventional
//   - No personal paths, secrets, internal refs in the message body

import { readFileSync } from 'node:fs';
import { loadConfig } from './lib/config.js';
import { scanText, formatFindings } from './lib/scanner.js';
import {
  VIETNAMESE_DIACRITIC_REGEX,
  CONVENTIONAL_COMMIT_REGEX,
} from './lib/patterns.js';

function main() {
  const msgFile = process.argv[2];
  if (!msgFile) {
    console.error('[guardrails] lint-commit-msg requires a commit message file path.');
    process.exit(2);
  }

  const raw = readFileSync(msgFile, 'utf8');
  // Strip comments + diff scissors block (git editor inserts these).
  const stripped = raw
    .split('\n')
    .filter((l) => !l.startsWith('#'))
    .join('\n')
    .replace(/(^|\n)#?\s*-+\s*>8\s*-+[\s\S]*$/m, '')
    .trim();

  if (stripped.length === 0) {
    console.error('[guardrails] Empty commit message.');
    process.exit(1);
  }

  const config = loadConfig();
  const errors = [];

  const subject = stripped.split('\n')[0];

  if (config.commitMessage.requireConventional && !CONVENTIONAL_COMMIT_REGEX.test(subject)) {
    errors.push(
      `Subject must follow Conventional Commits (e.g. "feat: add scanner").\n  Got: ${subject}`,
    );
  }

  if (config.commitMessage.blockVietnamese && VIETNAMESE_DIACRITIC_REGEX.test(stripped)) {
    errors.push(
      'Commit message contains Vietnamese diacritics. Per CLAUDE.md, commit messages must be in English.',
    );
  }

  const findings = scanText(stripped, config, { path: '<commit-msg>' });
  if (findings.length > 0) {
    errors.push(formatFindings(findings));
  }

  if (errors.length > 0) {
    console.error('[guardrails] Commit message rejected:\n');
    for (const e of errors) console.error('  ' + e.replace(/\n/g, '\n  ') + '\n');
    process.exit(1);
  }
}

main();
