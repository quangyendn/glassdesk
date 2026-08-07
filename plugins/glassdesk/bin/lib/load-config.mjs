// Config resolution for the external-provider dispatcher.
//
// Portability: bin/ and config/ are siblings in BOTH install layouts —
// plugins/glassdesk/{bin,config} in the marketplace bundle, and
// <project>/.claude/{bin,config} after `npx glassdesk init`. Resolving from
// import.meta.url therefore needs no layout detection.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));   // <root>/bin/lib

export function pluginRoot() {
  return path.resolve(LIB_DIR, '..', '..');
}

export function registryPath() {
  return (
    process.env.GD_EXTERNAL_PROVIDERS ||
    path.join(pluginRoot(), 'config', 'external-providers.json')
  );
}

export function specialistsDir() {
  return path.join(pluginRoot(), 'config', 'specialists');
}

export function loadRegistry(pathOverride) {
  const file = pathOverride || registryPath();
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    throw new Error(`cannot read external-providers registry at ${file}: ${e.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`invalid JSON in external-providers registry ${file}: ${e.message}`);
  }
}

// Parse `use_for: [a, b, c]` — the only list form the profiles use.
function parseUseFor(line) {
  const m = line.match(/^use_for:\s*\[(.*)\]\s*$/);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

export function loadSpecialist(name) {
  // Reject anything that is not a bare profile name — the value reaches this
  // function from a CLI flag, so path traversal must not be possible.
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(name))) return null;
  const file = path.join(specialistsDir(), `${name}.md`);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return null;
  const [, fm, body] = m;
  let parsedName = name;
  let useFor = [];
  for (const line of fm.split('\n')) {
    if (line.startsWith('name:')) parsedName = line.slice(5).trim();
    else if (line.startsWith('use_for:')) useFor = parseUseFor(line);
  }
  return { name: parsedName, useFor, instructions: body.trim() };
}

export function listSpecialists() {
  try {
    return fs
      .readdirSync(specialistsDir())
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.slice(0, -3));
  } catch {
    return [];
  }
}
