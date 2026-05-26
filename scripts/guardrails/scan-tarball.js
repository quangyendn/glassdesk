#!/usr/bin/env node
// Pre-publish guard: inspect what `npm pack` would emit.
// - WARN on suspicious paths (test/, plans/, docs/superpowers/, .gd-wiki/)
// - FAIL on denied extensions (.env, .pem, .key, .p12, .pfx) and dotfiles
// - FAIL on any pattern finding inside packed files

import { execSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, basename } from 'node:path';
import { loadConfig } from './lib/config.js';
import { scanText, isPathAllowed, formatFindings } from './lib/scanner.js';

function packDryRun() {
  try {
    const out = execSync('npm pack --dry-run --json', { encoding: 'utf8' });
    const parsed = JSON.parse(out);
    const meta = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!meta || !Array.isArray(meta.files)) {
      console.error('[guardrails] Unexpected `npm pack --dry-run --json` output.');
      process.exit(1);
    }
    return meta.files.map((f) => f.path);
  } catch (err) {
    console.error('[guardrails] `npm pack --dry-run --json` failed:', err.message);
    process.exit(1);
  }
}

function isBinary(filePath) {
  try {
    const buf = readFileSync(filePath);
    for (let i = 0; i < Math.min(buf.length, 8000); i++) if (buf[i] === 0) return true;
    return false;
  } catch {
    return true;
  }
}

function main() {
  const config = loadConfig();
  const files = packDryRun();

  const blockers = [];
  const warnings = [];

  for (const f of files) {
    const ext = extname(f).toLowerCase();
    const base = basename(f);

    if (config.tarball.denyExtensions.includes(ext)) {
      blockers.push(`Denied extension in tarball: ${f}`);
    }
    if (base.startsWith('.env') || base === 'id_rsa' || base === 'id_rsa.pub') {
      blockers.push(`Sensitive filename in tarball: ${f}`);
    }
    for (const pattern of config.tarball.warnPathPatterns) {
      if (f.includes(pattern)) {
        warnings.push(`Suspicious path included in tarball: ${f} (matches "${pattern}")`);
      }
    }
  }

  const allFindings = [];
  for (const f of files) {
    if (isPathAllowed(f, config.pathAllowlist)) continue;
    if (!existsSync(f)) continue;
    let s;
    try { s = statSync(f); } catch { continue; }
    if (!s.isFile() || s.size > 1024 * 1024 || isBinary(f)) continue;
    const text = readFileSync(f, 'utf8');
    const findings = scanText(text, config, { path: f });
    allFindings.push(...findings);
  }

  if (warnings.length > 0) {
    console.warn('[guardrails] Tarball warnings:');
    for (const w of warnings) console.warn(`  ! ${w}`);
  }

  if (blockers.length > 0 || allFindings.length > 0) {
    if (blockers.length > 0) {
      console.error('[guardrails] Tarball blockers:');
      for (const b of blockers) console.error(`  ✗ ${b}`);
    }
    if (allFindings.length > 0) console.error(formatFindings(allFindings));
    console.error('\n[guardrails] Publish blocked.');
    process.exit(1);
  }

  console.log(`[guardrails] Tarball scan ok (${files.length} files).`);
}

main();
