#!/usr/bin/env node
// Scan staged files (default) or supplied file list for personal info, secrets,
// internal refs, and unallowlisted emails. Exits non-zero on any finding.
//
// Usage:
//   node scripts/guardrails/scan-personal-info.js [--staged | --files a.js b.js]
//
// Critical: in --staged mode we read the staged blob via `git show :<path>`,
// NOT the working tree. Reading the working tree allows a contributor to stage
// sensitive content, then revert the working copy before committing, and pass
// this scanner while the sensitive blob is still committed.

import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { loadConfig } from './lib/config.js';
import { scanText, isPathAllowed, formatFindings } from './lib/scanner.js';

const MAX_SIZE_BYTES = 1024 * 1024;

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

// Returns Buffer of the staged blob at path, or null if absent / unreadable.
function readStagedBlob(path) {
  const r = spawnSync('git', ['show', `:${path}`], { encoding: 'buffer' });
  if (r.status !== 0) return null;
  return r.stdout;
}

function bufferIsBinary(buf) {
  const limit = Math.min(buf.length, 8000);
  for (let i = 0; i < limit; i++) if (buf[i] === 0) return true;
  return false;
}

function workingTreeContent(path) {
  if (!existsSync(path)) return null;
  let s;
  try { s = statSync(path); } catch { return null; }
  if (!s.isFile()) return null;
  if (s.size > MAX_SIZE_BYTES) return null;
  const buf = readFileSync(path);
  if (bufferIsBinary(buf)) return null;
  return buf.toString('utf8');
}

function stagedContent(path) {
  const buf = readStagedBlob(path);
  if (buf === null) return null;
  if (buf.length > MAX_SIZE_BYTES) return null;
  if (bufferIsBinary(buf)) return null;
  return buf.toString('utf8');
}

function main() {
  const args = parseArgs(process.argv);
  const config = loadConfig();
  const files = args.staged ? stagedFiles() : args.files;
  const readContent = args.staged ? stagedContent : workingTreeContent;

  const allFindings = [];
  for (const file of files) {
    if (isPathAllowed(file, config.pathAllowlist)) continue;
    const text = readContent(file);
    if (text === null) continue;
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
