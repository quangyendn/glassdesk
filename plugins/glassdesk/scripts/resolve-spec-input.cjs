#!/usr/bin/env node
/**
 * Resolve spec input for /plan and /plan:hard.
 *
 * Usage: node "$GD_PLUGIN_PATH/scripts/resolve-spec-input.cjs" [arg]
 *
 * Emits single-line JSON to stdout describing how to interpret the caller's
 * argument. Caller (skill Step 0) branches on the `mode` field.
 *
 * Modes:
 *   spec-confirm  — empty arg, latest spec found, needs user confirmation
 *   spec          — explicit existing path passed by user
 *   task          — free-text task description (or empty + no spec available)
 *   error         — arg looks like a path but file does not exist
 *
 * Spec dir defaults to `docs/specs` (relative to cwd). Override with the
 * GLASSDESK_SPECS_DIR env var (used by tests to point at fixtures).
 *
 * Frontmatter parser supports the simple `key: value` subset produced by the
 * spec template (plugins/glassdesk/skills/brainstorming/references/spec-template.md).
 * Quoted strings and list-style values are tolerated for the fields we read.
 *
 * Always exits 0 — the caller branches on the JSON `mode` field, not exit code.
 */

const fs = require('node:fs');
const path = require('node:path');

const SPECS_DIR = process.env.GLASSDESK_SPECS_DIR || 'docs/specs';
const SKIP_STATUSES = new Set(['done', 'archived']);
const FILENAME_RE = /^(\d{6})-.*\.md$/;
const HEAD_BYTES = 4096;

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const out = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[kv[1]] = value;
  }
  return out;
}

function readHead(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(HEAD_BYTES);
    const n = fs.readSync(fd, buf, 0, HEAD_BYTES, 0);
    return buf.slice(0, n).toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

function scanSpecs(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  const files = fs.readdirSync(dir).filter((f) => FILENAME_RE.test(f));
  return files.map((filename) => {
    const fullPath = path.join(dir, filename);
    const head = readHead(fullPath);
    const fm = parseFrontmatter(head);
    return {
      path: fullPath,
      filename,
      date: filename.match(FILENAME_RE)[1],
      status: (fm.status || 'draft').toLowerCase(),
    };
  });
}

function pickLatest(specs) {
  // Sort by date DESC, then filename ASC for tiebreak.
  return [...specs].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return a.filename.localeCompare(b.filename);
  })[0];
}

function extractProblemSummary(file) {
  try {
    const text = readHead(file);
    const m = text.match(/##\s+Problem\s*\n+([^\n]+)/);
    if (!m) return '';
    return m[1].trim().slice(0, 120);
  } catch {
    return '';
  }
}

function looksLikePath(arg) {
  return arg.includes('/') || arg.endsWith('.md');
}

function main() {
  const arg = (process.argv[2] || '').trim();

  if (arg === '') {
    const specs = scanSpecs(SPECS_DIR);
    const eligible = specs.filter((s) => !SKIP_STATUSES.has(s.status));
    if (eligible.length === 0) {
      emit({ mode: 'task', text: '' });
      return;
    }
    const latest = pickLatest(eligible);
    emit({
      mode: 'spec-confirm',
      path: latest.path,
      summary: extractProblemSummary(latest.path),
      status: latest.status,
      date: latest.date,
    });
    return;
  }

  const exists = fs.existsSync(arg) && fs.statSync(arg).isFile();
  if (exists) {
    emit({ mode: 'spec', path: arg });
    return;
  }

  if (looksLikePath(arg)) {
    emit({ mode: 'error', reason: 'path-not-found', arg });
    return;
  }

  emit({ mode: 'task', text: arg });
}

main();
