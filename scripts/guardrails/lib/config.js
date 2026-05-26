import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULTS = {
  internalRefs: [],
  emailAllowlist: [
    '@example.com',
    '@example.org',
    '@anthropic.com',
    '@users.noreply.github.com',
    'noreply@github.com',
  ],
  pathAllowlist: [],
  commitMessage: { blockVietnamese: true, requireConventional: true },
  tarball: {
    denyExtensions: ['.env', '.pem', '.key', '.p12', '.pfx'],
    warnPathPatterns: [],
  },
};

export function loadConfig(repoRoot = process.cwd()) {
  const path = resolve(repoRoot, '.guardrails.json');
  if (!existsSync(path)) return DEFAULTS;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    return {
      ...DEFAULTS,
      ...raw,
      commitMessage: { ...DEFAULTS.commitMessage, ...(raw.commitMessage || {}) },
      tarball: { ...DEFAULTS.tarball, ...(raw.tarball || {}) },
    };
  } catch (err) {
    console.error(`[guardrails] Failed to parse .guardrails.json: ${err.message}`);
    process.exit(1);
  }
}
