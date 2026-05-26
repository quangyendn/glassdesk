#!/usr/bin/env node
// Scan staged files (default) or supplied file list for personal info, secrets,
// internal refs, and unallowlisted emails. Exits non-zero on any finding.
//
// Usage:
//   node scripts/guardrails/scan-personal-info.js [--staged | --files a.js b.js]

import { execSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { loadConfig } from './lib/config.js';
import { scanText, isPathAllowed, formatFindings } from './lib/scanner.js';

function parseArgs(argv) {
  const args = { staged: false, files: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--staged') args.staged = true;
    else if (a === '--files') {
      args.files = argv.slice(i + 1);
      break;
    } else args.files.push(a);
  }
  if (!args.staged && args.files.length === 0) args.staged = true;
  return args;
}

function stagedFiles() {
  const out = execSync('git diff --cached --name-only --diff-filter=ACMR', { encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

function isBinary(filePath) {
  try {
    const buf = readFileSync(filePath);
    for (let i = 0; i < Math.min(buf.length, 8000); i++) {
      if (buf[i] === 0) return true;
    }
    return false;
  } catch {
    return true;
  }
}

function isScannable(filePath) {
  if (!existsSync(filePath)) return false;
  let s;
  try { s = statSync(filePath); } catch { return false; }
  if (!s.isFile()) return false;
  if (s.size > 1024 * 1024) return false;
  if (isBinary(filePath)) return false;
  return true;
}

function main() {
  const args = parseArgs(process.argv);
  const config = loadConfig();
  const files = args.staged ? stagedFiles() : args.files;

  const allFindings = [];
  for (const file of files) {
    if (isPathAllowed(file, config.pathAllowlist)) continue;
    if (!isScannable(file)) continue;
    const text = readFileSync(file, 'utf8');
    const findings = scanText(text, config, { path: file });
    allFindings.push(...findings);
  }

  if (allFindings.length > 0) {
    console.error(formatFindings(allFindings));
    console.error(`\n[guardrails] ${allFindings.length} finding(s). Commit blocked.`);
    process.exit(1);
  }
}

main();
