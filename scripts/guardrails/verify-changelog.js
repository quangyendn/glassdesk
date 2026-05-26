#!/usr/bin/env node
// Verify that CHANGELOG.md contains an entry for the version about to be published.
//
// Search order (first existing wins):
//   1. CHANGELOG.md (repo root)
//   2. plugins/glassdesk/CHANGELOG.md
//
// Looks for a heading or list entry containing the version string.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const CANDIDATES = ['CHANGELOG.md', 'plugins/glassdesk/CHANGELOG.md'];

function findChangelog() {
  for (const c of CANDIDATES) {
    const p = resolve(process.cwd(), c);
    if (existsSync(p)) return p;
  }
  return null;
}

function main() {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const version = pkg.version;
  const path = findChangelog();

  if (!path) {
    console.error(`[guardrails] No CHANGELOG.md found. Looked in: ${CANDIDATES.join(', ')}`);
    process.exit(1);
  }

  const content = readFileSync(path, 'utf8');
  if (!content.includes(version)) {
    console.error(`[guardrails] CHANGELOG (${path}) does not mention version ${version}.`);
    console.error('  Add a section like:');
    console.error(`    ## [${version}] - YYYY-MM-DD`);
    process.exit(1);
  }

  console.log(`[guardrails] CHANGELOG ok (${path} mentions ${version}).`);
}

main();
