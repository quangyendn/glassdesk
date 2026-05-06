#!/usr/bin/env node

import fs from 'node:fs';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const BUNDLED_PLUGIN_DIR = path.join(PACKAGE_ROOT, 'plugins', 'glassdesk');
const BUNDLED_TEMPLATE = path.join(PACKAGE_ROOT, 'templates', 'settings.local.json');
const PACKAGE_JSON_PATH = path.join(PACKAGE_ROOT, 'package.json');

const KNOWN_COMMANDS = new Set(['init', 'update']);
const COPY_SKIPLIST = new Set([
  'settings.local.json',
  '.DS_Store',
  'CHANGELOG.md',
]);
// Plugin-source paths whose copied filename MUST differ from source to avoid
// collision with a Claude Code built-in slash command. When installed as a
// plugin (marketplace), commands are namespaced (`/glassdesk:debug`) so source
// names are fine. The npx-into-`.claude/` install has no namespace — the
// project-scope `/debug`, `/plan` are shadowed by the built-in counterparts
// (debug logging, plan-mode entry), so the project-copies are renamed and all
// references in copied `.md` are rewritten to match (see COMMAND_REWRITES).
//
// Keys are POSIX rel paths under plugins/glassdesk/. Values are dest rel paths
// under <project>/.claude/. Renaming into a subdirectory (e.g. plan.md →
// plan/fast.md) is supported — copyPluginFiles creates the parent dir on copy.
export const RENAME_MAP = new Map([
  ['commands/debug.md', 'commands/gd-debug.md'],
  // `/plan` → `/plan:fast`: built-in `/plan [description]` enters plan mode
  // and shadows project-scope `/plan`. Move the bare command into the existing
  // `commands/plan/` namespace as a `:fast` variant alongside `:hard`,
  // `:list`, etc. — variants are unaffected by the built-in.
  ['commands/plan.md', 'commands/plan/fast.md'],
]);
// Slash-command name rewrites applied to copied .md files in <project>/.claude/.
// Each entry rewrites `/{from}` → `/{to}` when the match is NOT followed by
// `[\w.:/-]` — preserves:
//   - Filename refs:        `commands/plan.md`, `/debug.md`
//   - Colon variants:       `/plan:hard`, `/plan:list`, `/debug:hard` (future)
//   - Path segments:        `commands/plan/hard.md`
//   - Identifier extensions:`/debugger`, `/planning`
// Excluding `:` and `/` also makes the rewrite idempotent: a re-run finds the
// already-rewritten `/plan:fast` blocked by the `:` lookahead and skips it.
// Keep keys in sync with RENAME_MAP basenames.
export const COMMAND_REWRITES = new Map([
  ['debug', 'gd-debug'],
  ['plan', 'plan:fast'],
]);
const FLAG_ALIASES = {
  '--yes': 'yes',
  '-y': 'yes',
  '--force': 'force',
  '--dry-run': 'dryRun',
  '--help': 'help',
  '-h': 'help',
  '--version': 'version',
  '-v': 'version',
};

export function parseArgs(argv) {
  const flags = { yes: false, force: false, dryRun: false, help: false, version: false };
  const unknown = [];
  let command = null;

  for (const arg of argv) {
    if (arg in FLAG_ALIASES) {
      flags[FLAG_ALIASES[arg]] = true;
    } else if (arg.startsWith('-')) {
      unknown.push(arg);
    } else if (!command && KNOWN_COMMANDS.has(arg)) {
      command = arg;
    } else {
      unknown.push(arg);
    }
  }

  if (flags.help) command = 'help';
  else if (flags.version) command = 'version';
  else if (!command && unknown.length === 0) command = 'help';
  else if (!command && unknown.length > 0) command = 'unknown';

  return { command, flags, unknown };
}

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function colorize(color, text) {
  if (!process.stdout.isTTY) return text;
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

export const log = {
  info: (msg) => console.log(colorize('cyan', 'INFO '), msg),
  warn: (msg) => console.error(colorize('yellow', 'WARN '), msg),
  error: (msg) => console.error(colorize('red', 'ERROR'), msg),
  ok: (msg) => console.log(colorize('green', 'OK   '), msg),
  plain: (msg) => console.log(msg),
};

export function detectInstall(cwd) {
  const manifestPath = path.join(cwd, '.claude', '.glassdesk.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

function dedupArrayBy(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const k = keyFn(item);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}

// Coerce legacy `{matcher, command}` shape to canonical `{matcher?, hooks: [{type, command}]}`.
// Existing user settings authored against the old template should keep working without surprises.
function normalizeHookEntry(entry) {
  if (entry && Array.isArray(entry.hooks)) return entry;
  if (entry && typeof entry.command === 'string') {
    const out = { hooks: [{ type: 'command', command: entry.command }] };
    if (entry.matcher !== undefined) out.matcher = entry.matcher;
    return out;
  }
  return entry;
}

// Treat `*` and missing matcher as the same "match all" group so legacy entries
// don't duplicate against the new template (which omits matcher entirely).
function matcherGroupKey(matcher) {
  if (matcher === undefined || matcher === '' || matcher === '*') return '';
  return matcher;
}

export function mergeHookEntries(userEntries, tplEntries) {
  const groups = new Map();
  const order = [];

  function add(rawEntry) {
    const entry = normalizeHookEntry(rawEntry);
    if (!entry || !Array.isArray(entry.hooks)) return;
    const key = matcherGroupKey(entry.matcher);
    if (!groups.has(key)) {
      const group = key === '' ? { hooks: [] } : { matcher: entry.matcher, hooks: [] };
      groups.set(key, group);
      order.push(key);
    }
    groups.get(key).hooks.push(...entry.hooks);
  }

  for (const e of userEntries) add(e);
  for (const e of tplEntries) add(e);

  return order.map((key) => {
    const group = groups.get(key);
    return {
      ...group,
      hooks: dedupArrayBy(group.hooks, (h) => `${h.type ?? 'command'}|${h.command}`),
    };
  });
}

// Migration: legacy template (≤ v0.1.1) wrote hook commands as
// `node .claude/hooks/{session-init,dev-rules-reminder}.cjs` — a relative
// path that breaks when Claude Code spawns the hook from a CWD ≠ project
// root (subdirectory launch, nested .claude/, etc.) → MODULE_NOT_FOUND
// (loader:1404). Newer template uses ${CLAUDE_PROJECT_DIR:-$PWD}. Strip
// the stale entries on update so the new entry replaces them instead of
// piling up as a duplicate.
//
// IMPORTANT: This regex matches ONLY the truly-relative form (no env var, no
// absolute path) — the pre-bug-fix install artifact that must be DELETED.
// Do NOT widen this to match the absolute-env form below — that form must be
// MIGRATED (rewritten to wrapped bash -c), not purged, so that the migration
// log fires correctly (AC9 idempotency intent).
//   (a) relative: `node .claude/hooks/<hook>.cjs`  <- STALE: delete
const STALE_GLASSDESK_HOOK_RE =
  /^node \.claude\/hooks\/(session-init|dev-rules-reminder|session-end)\.cjs$/;

// Matches the absolute-env legacy form written by glassdesk v0.1.x installs
// (pre-wrapping):
//   (b) absolute-env: `node "${CLAUDE_PROJECT_DIR[:-$PWD]}/.claude/hooks/<hook>.cjs"`
// These entries should be MIGRATED to the wrapped bash -c form by
// migrateHookCommandsToWrapped, NOT purged.  Keeping them out of
// STALE_GLASSDESK_HOOK_RE ensures purgeStaleGlassdeskHooks does not
// destroy them before migration can see and rewrite them.
export const LEGACY_GLASSDESK_HOOK_RE =
  /^node "\$\{CLAUDE_PROJECT_DIR(?::-\$PWD)?\}\/.claude\/hooks\/([\w.-]+\.cjs)"$/;

// Detection regex for wrapped glassdesk hook commands (v0.2+). Matches the
// unique preamble of the self-bootstrapping bash wrapper so mergeSettings can
// identify already-wrapped entries and avoid double-wrapping on re-update.
// Loose enough to survive minor whitespace/quoting edits; specific enough not
// to match unrelated bash -c commands.
export const WRAPPED_GLASSDESK_HOOK_RE = /^bash -c 'C=\"\$\{CLAUDE_PROJECT_DIR:-\$PWD\}\"; H=\"\$C\/\.claude\/hooks\/[\w.-]+\.cjs\"/;

// Returns true iff cmdString is already in the wrapped bash -c form written
// by wrapHookCommand. Used by mergeSettings to skip migration for entries
// that are already up-to-date (idempotency guard).
export function isWrappedHook(cmdString) {
  return typeof cmdString === 'string' && WRAPPED_GLASSDESK_HOOK_RE.test(cmdString);
}

// Extract the hook basename (e.g. "session-init.cjs") from either a legacy
// `node "${CLAUDE_PROJECT_DIR...}/.claude/hooks/<file>"` command or the
// wrapped bash -c form.  Returns null when extraction fails (e.g. user has
// hand-edited the command beyond recognition) — callers should log warn + skip.
export function extractHookBasename(cmdString) {
  if (typeof cmdString !== 'string') return null;
  const m = cmdString.match(/\.claude\/hooks\/([\w.-]+\.cjs)/);
  return m ? m[1] : null;
}

// Build the self-bootstrapping shell wrapper command for a glassdesk hook.
//
// The wrapper:
//   1. Resolves the project root via CLAUDE_PROJECT_DIR (set by Claude Code)
//      or falls back to $PWD.
//   2. Checks if the hook file is already reachable (symlink or real file).
//   3. If not, discovers the main worktree via `git rev-parse --git-common-dir`
//      and symlinks <main>/.claude/hooks into the worktree .claude/ directory.
//   4. exec's node on the hook — replacing the wrapper process (no zombie).
//
// The returned string is the raw shell command, NOT JSON-stringified.
// Caller is responsible for serialising it into settings.local.json.
//
// @param {string} hookFile  Basename of the hook (e.g. "session-init.cjs").
//                           Must match /^[a-zA-Z0-9._-]+$/. No path separators.
// @returns {string}         Shell command string ready for the "command" field.
// @throws {TypeError}       If hookFile is not a plain basename string.
export function wrapHookCommand(hookFile) {
  if (typeof hookFile !== 'string' || hookFile.length === 0) {
    throw new TypeError(`wrapHookCommand: hookFile must be a non-empty string, got ${JSON.stringify(hookFile)}`);
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(hookFile)) {
    throw new TypeError(
      `wrapHookCommand: hookFile must be a plain basename (no slashes, no ".." sequences), got ${JSON.stringify(hookFile)}`
    );
  }
  return (
    `bash -c 'C="\${CLAUDE_PROJECT_DIR:-$PWD}"; ` +
    `H="$C/.claude/hooks/${hookFile}"; ` +
    `if [ ! -e "$H" ]; then ` +
    `G=$(git -C "$C" rev-parse --git-common-dir 2>/dev/null); ` +
    `if [ -n "$G" ]; then ` +
    `M=$(dirname "$G"); ` +
    `if [ -d "$M/.claude/hooks" ] && [ "$M" != "$C" ]; then ` +
    `mkdir -p "$C/.claude"; ` +
    `ln -sfn "$M/.claude/hooks" "$C/.claude/hooks"; ` +
    `fi; fi; fi; ` +
    `[ -e "$H" ] && exec node "$H"'`
  );
}

export function purgeStaleGlassdeskHooks(hooksObj, eventNames) {
  if (!hooksObj || typeof hooksObj !== 'object') return [];
  const removed = [];
  for (const event of eventNames) {
    if (!Array.isArray(hooksObj[event])) continue;
    hooksObj[event] = hooksObj[event]
      .map((rawEntry) => {
        const entry = normalizeHookEntry(rawEntry);
        if (!entry || !Array.isArray(entry.hooks)) return entry;
        const kept = entry.hooks.filter((h) => {
          if (typeof h?.command === 'string' && STALE_GLASSDESK_HOOK_RE.test(h.command)) {
            removed.push(`${event}: ${h.command}`);
            return false;
          }
          return true;
        });
        return { ...entry, hooks: kept };
      })
      .filter((entry) => entry && Array.isArray(entry.hooks) && entry.hooks.length > 0);
  }
  return removed;
}

// Migrate legacy glassdesk hook commands (node "${CLAUDE_PROJECT_DIR...}" form)
// to the wrapped bash -c form in-place on a hooksObj.  Already-wrapped entries
// are left untouched (idempotency).  Foreign hooks are left untouched.
// Returns an array of migration log strings (one per rewritten command).
//
// Uses LEGACY_GLASSDESK_HOOK_RE (not STALE_GLASSDESK_HOOK_RE) as the trigger
// — STALE covers only truly-relative form which is deleted by purge; LEGACY
// covers the absolute-env form which survives purge and arrives here for
// migration.  This split is critical: purge runs BEFORE migration, so any
// entry matched by STALE is already gone by the time migration iterates.
function migrateHookCommandsToWrapped(hooksObj, eventNames) {
  if (!hooksObj || typeof hooksObj !== 'object') return [];
  const migrated = [];
  for (const event of eventNames) {
    if (!Array.isArray(hooksObj[event])) continue;
    for (const rawEntry of hooksObj[event]) {
      const entry = normalizeHookEntry(rawEntry);
      if (!entry || !Array.isArray(entry.hooks)) continue;
      for (const h of entry.hooks) {
        if (typeof h?.command !== 'string') continue;
        // Skip already-wrapped entries — idempotency guard.
        if (isWrappedHook(h.command)) continue;
        // Only migrate commands that match the absolute-env legacy form.
        // Foreign hooks (no LEGACY_GLASSDESK_HOOK_RE match) are left untouched.
        const legacyMatch = LEGACY_GLASSDESK_HOOK_RE.exec(h.command);
        if (!legacyMatch) continue;
        const basename = legacyMatch[1];
        // If basename extraction succeeds, rewrite to wrapped form.
        try {
          const wrapped = wrapHookCommand(basename);
          migrated.push(`${event}: migrated hook command to wrapped form — ${basename}`);
          h.command = wrapped;
        } catch (err) {
          log.warn(`hooks: could not wrap ${event} hook "${h.command}" — ${err.message}; skipping`);
        }
      }
    }
  }
  return migrated;
}

export function mergeSettings(existing, template) {
  const merged = JSON.parse(JSON.stringify(existing ?? {}));
  const conflicts = [];

  // hooks: per-event entries grouped by matcher, inner hooks deduped by (type, command).
  // Claude Code format: { matcher?: string, hooks: [{ type, command }] }.
  if (template.hooks) {
    merged.hooks ??= {};
    const purged = purgeStaleGlassdeskHooks(merged.hooks, Object.keys(template.hooks));
    for (const cmd of purged) conflicts.push(`hooks: removed stale glassdesk entry — ${cmd}`);
    // Migrate any surviving legacy `node "${CLAUDE_PROJECT_DIR...}"` entries
    // to the wrapped bash -c form.  Already-wrapped entries are left untouched.
    // Use all keys from merged.hooks (not just template keys) so that legacy
    // entries in events not covered by the template are also migrated.
    const migratedCmds = migrateHookCommandsToWrapped(merged.hooks, Object.keys(merged.hooks));
    if (migratedCmds.length > 0) {
      log.info(`[glassdesk] migrated ${migratedCmds.length} hook command${migratedCmds.length === 1 ? '' : 's'} to wrapped form`);
    }
    for (const [event, tplEntries] of Object.entries(template.hooks)) {
      const userEntries = merged.hooks[event] ?? [];
      merged.hooks[event] = mergeHookEntries(userEntries, tplEntries);
    }
  }

  // permissions: collect template allow/deny, then resolve cross-conflicts (glassdesk wins)
  if (template.permissions) {
    merged.permissions ??= {};
    const tplAllow = template.permissions.allow ?? [];
    const tplDeny = template.permissions.deny ?? [];
    const userAllow = merged.permissions.allow ?? [];
    const userDeny = merged.permissions.deny ?? [];

    // Cross-conflicts: any string that is in userDeny but tplAllow (or userAllow but tplDeny).
    const tplAllowSet = new Set(tplAllow);
    const tplDenySet = new Set(tplDeny);
    let resolvedDeny = userDeny.filter((s) => {
      if (tplAllowSet.has(s)) {
        conflicts.push(`permissions: '${s}' was in user 'deny' but glassdesk requires it in 'allow' — glassdesk wins`);
        return false;
      }
      return true;
    });
    let resolvedAllow = userAllow.filter((s) => {
      if (tplDenySet.has(s)) {
        conflicts.push(`permissions: '${s}' was in user 'allow' but glassdesk requires it in 'deny' — glassdesk wins`);
        return false;
      }
      return true;
    });

    merged.permissions.allow = dedupArrayBy([...resolvedAllow, ...tplAllow], (s) => s);
    merged.permissions.deny = dedupArrayBy([...resolvedDeny, ...tplDeny], (s) => s);
  }

  // env: object merge, glassdesk wins on key collision
  if (template.env) {
    merged.env ??= {};
    for (const [key, value] of Object.entries(template.env)) {
      if (key in merged.env && merged.env[key] !== value) {
        conflicts.push(`env.${key} — overriding (was '${merged.env[key]}', now '${value}')`);
      }
      merged.env[key] = value;
    }
  }

  return { merged, conflicts };
}

export function copyPluginFiles(srcDir, destDir, dryRun) {
  const collected = [];
  function walk(relSubdir) {
    const absSrc = path.join(srcDir, relSubdir);
    const entries = fs.readdirSync(absSrc, { withFileTypes: true });
    for (const entry of entries) {
      if (COPY_SKIPLIST.has(entry.name)) continue;
      const rel = relSubdir ? `${relSubdir}/${entry.name}` : entry.name;
      const absChildSrc = path.join(srcDir, rel);
      // Apply RENAME_MAP for files only (directories never collide with
      // built-ins). dest rel may differ from src rel; manifest tracks dest.
      const destRel = entry.isFile() ? (RENAME_MAP.get(rel) ?? rel) : rel;
      const absChildDest = path.join(destDir, destRel);
      if (entry.isDirectory()) {
        if (!dryRun) fs.mkdirSync(absChildDest, { recursive: true });
        walk(rel);
      } else if (entry.isFile()) {
        if (!dryRun) {
          fs.mkdirSync(path.dirname(absChildDest), { recursive: true });
          fs.copyFileSync(absChildSrc, absChildDest);
        }
        collected.push(destRel);
      }
    }
  }
  walk('');
  return collected;
}

// Rewrite $GD_PLUGIN_PATH → .claude (project-relative) in markdown copied to
// <project>/.claude/. The env-var pattern fails inside subagents (Claude Code
// bug #46696: subagents don't inherit CLAUDE_ENV_FILE vars). Project-relative
// paths work because Claude Code spawns Bash with cwd=project root in both
// main session and subagent contexts. Marketplace bundle source stays
// unchanged — runtime $GD_PLUGIN_PATH still works in the parent session.
//
// Note: ${CLAUDE_PROJECT_DIR} would be the cleaner choice (absolute, no cwd
// dependency) but is not actually exported to Bash by Claude Code 2.1.x —
// empirically verified empty in tool-spawned shells despite docs claiming it.
const REWRITE_TOKEN = '$GD_PLUGIN_PATH';
// Word boundary avoids accidental rewrite of future identifiers like $GD_PLUGIN_PATHS.
const REWRITE_TOKEN_RE = /\$GD_PLUGIN_PATH\b/g;
const REWRITE_REPLACEMENT = '.claude';

// Rewrite slash-command references in copied .md files to match RENAME_MAP.
// Walks `rootDir` and, for each .md, applies COMMAND_REWRITES with a negative
// lookahead `(?![\w.-])` so filename mentions (`commands/debug.md`) and
// identifier extensions (`/debugger`) are preserved. Variant refs like
// `/debug:hard` would also be rewritten — acceptable as no such variant exists
// today and any future variant should follow the renamed base.
export function rewriteCommandRefs(rootDir, { dryRun = false } = {}) {
  if (COMMAND_REWRITES.size === 0) return { scanned: 0, rewritten: 0 };
  const patterns = [...COMMAND_REWRITES.entries()].map(([from, to]) => ({
    re: new RegExp(`\\/${from}(?![\\w.:/-])`, 'g'),
    replacement: `/${to}`,
  }));
  let scanned = 0;
  let rewritten = 0;
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      scanned++;
      const src = fs.readFileSync(full, 'utf8');
      let next = src;
      for (const { re, replacement } of patterns) {
        next = next.replace(re, replacement);
      }
      if (next === src) continue;
      if (!dryRun) fs.writeFileSync(full, next);
      rewritten++;
    }
  }
  return { scanned, rewritten };
}

export function rewritePluginPathRefs(rootDir, { dryRun = false } = {}) {
  let scanned = 0;
  let rewritten = 0;
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      scanned++;
      const src = fs.readFileSync(full, 'utf8');
      // Cheap probe via includes() avoids stateful /g regex pitfalls; .replace() with /g handles all matches.
      if (!src.includes(REWRITE_TOKEN)) continue;
      if (!dryRun) {
        fs.writeFileSync(full, src.replace(REWRITE_TOKEN_RE, REWRITE_REPLACEMENT));
      }
      rewritten++;
    }
  }
  return { scanned, rewritten };
}

export function writeManifest(cwd, version, files) {
  const manifestPath = path.join(cwd, '.claude', '.glassdesk.json');
  const manifest = {
    version,
    installedAt: new Date().toISOString(),
    installer: 'npx glassdesk',
    files: [...files].sort(),
  };
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}

export function looksLikeProjectRoot(cwd) {
  return fs.existsSync(path.join(cwd, '.git')) || fs.existsSync(path.join(cwd, 'package.json'));
}

export async function confirm(question, { yes } = {}) {
  if (yes) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await new Promise((resolve) => rl.question(`${question} `, resolve));
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function readPackageVersion() {
  return JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8')).version;
}

function readTemplate() {
  return JSON.parse(fs.readFileSync(BUNDLED_TEMPLATE, 'utf8'));
}

async function ensureProjectRootConfirm(cwd) {
  if (looksLikeProjectRoot(cwd)) return true;
  log.warn(`Current directory does not look like a project root (no .git or package.json): ${cwd}`);
  // Per spec: separate confirm even when --yes is set, to avoid accidental ~/ installs.
  const ok = await confirm(`Continue installing into ${path.join(cwd, '.claude')}? [y/N]`, { yes: false });
  if (!ok) log.info('Aborted.');
  return ok;
}

async function runInstall(cwd, mode, flags) {
  const pkgVersion = readPackageVersion();
  const installed = detectInstall(cwd);

  if (mode === 'init' && installed && !flags.force) {
    log.warn(`glassdesk v${installed.version} already installed at .claude/.`);
    log.plain('Use `npx glassdesk update` instead, or pass --force to reinstall.');
    return 1;
  }
  if (mode === 'update' && !installed) {
    log.warn('glassdesk is not initialised in this project.');
    log.plain('Run `npx glassdesk init` first.');
    return 1;
  }

  if (!await ensureProjectRootConfirm(cwd)) return 0;

  // Plan summary
  log.plain('');
  if (mode === 'update') {
    log.info(`Updating glassdesk v${installed.version} → v${pkgVersion}.`);
    log.warn('All managed files will be overwritten — local edits will be lost.');
  } else {
    log.info(`Installing glassdesk v${pkgVersion} into ${path.join(cwd, '.claude')}.`);
  }
  const subdirs = fs.readdirSync(BUNDLED_PLUGIN_DIR).filter((n) =>
    fs.statSync(path.join(BUNDLED_PLUGIN_DIR, n)).isDirectory()
  );
  log.plain(`  Subdirectories: ${subdirs.join(', ')}`);
  log.plain(`  Settings:       merge into ${path.join(cwd, '.claude', 'settings.local.json')}`);

  // Predict settings conflicts so user sees them at confirm time
  const settingsPath = path.join(cwd, '.claude', 'settings.local.json');
  let existingSettings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      existingSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch {
      log.error('settings.local.json is not valid JSON. Fix or remove it, then re-run.');
      return 1;
    }
  }
  const template = readTemplate();
  const { merged, conflicts } = mergeSettings(existingSettings, template);
  for (const c of conflicts) log.warn(c);
  log.plain('');

  if (flags.dryRun) {
    log.info('Dry-run: no files written.');
    const filesPreview = copyPluginFiles(BUNDLED_PLUGIN_DIR, path.join(cwd, '.claude'), true);
    log.plain(`  Would copy ${filesPreview.length} files.`);
    // Estimate rewrite count from bundle source. Valid as long as COPY_SKIPLIST
    // does not exclude any .md file containing $GD_PLUGIN_PATH (currently it skips
    // only settings.local.json, .DS_Store, CHANGELOG.md). If the skiplist gains a
    // .md entry, audit this preview path.
    const rwPreview = rewritePluginPathRefs(BUNDLED_PLUGIN_DIR, { dryRun: true });
    log.plain(`  Would rewrite $GD_PLUGIN_PATH in ${rwPreview.rewritten}/${rwPreview.scanned} .md files.`);
    const cmdPreview = rewriteCommandRefs(BUNDLED_PLUGIN_DIR, { dryRun: true });
    log.plain(`  Would rewrite slash-command refs in ${cmdPreview.rewritten}/${cmdPreview.scanned} .md files.`);
    return 0;
  }

  if (!await confirm('Continue? [y/N]', flags)) {
    log.info('Aborted.');
    return 0;
  }

  // Real install
  const claudeDir = path.join(cwd, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  let files;
  try {
    files = copyPluginFiles(BUNDLED_PLUGIN_DIR, claudeDir, false);
  } catch (err) {
    log.error(`File copy failed: ${err.message}`);
    log.warn('Settings and manifest were NOT written. Re-run to retry — overwrite is idempotent.');
    return 1;
  }

  // Rewrite env-var references in copied markdown so commands/skills work in
  // subagent contexts (see rewritePluginPathRefs for rationale).
  const rw = rewritePluginPathRefs(claudeDir, { dryRun: false });
  log.plain(`  Rewrote $GD_PLUGIN_PATH in ${rw.rewritten}/${rw.scanned} .md files.`);

  // Rewrite slash-command references that conflict with Claude Code built-ins
  // (e.g. /debug → /gd-debug). Source plugin dir is unchanged so plugin-mode
  // marketplace install still resolves `/glassdesk:debug`.
  const cmdRw = rewriteCommandRefs(claudeDir, { dryRun: false });
  log.plain(`  Rewrote slash-command refs in ${cmdRw.rewritten}/${cmdRw.scanned} .md files.`);

  // Write merged settings only after copy succeeded — otherwise hooks would
  // reference files that aren't on disk.
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + '\n');
  } catch (err) {
    log.error(`Cannot write settings.local.json: ${err.message}`);
    return 1;
  }

  writeManifest(cwd, pkgVersion, files);
  log.ok(`Installed glassdesk v${pkgVersion}. Restart Claude Code to load hooks.`);
  return 0;
}

function printHelp() {
  const help = `glassdesk — Claude Code plugin installer

Usage:
  npx glassdesk init [--yes] [--force] [--dry-run]
  npx glassdesk update [--yes] [--dry-run]
  npx glassdesk --help
  npx glassdesk --version

Commands:
  init      Install glassdesk into <cwd>/.claude/. Refuses if already installed.
  update    Refresh glassdesk files in <cwd>/.claude/ and re-merge settings.

Flags:
  -y, --yes        Skip confirm prompt (CI/automation).
      --force      Allow init to proceed even when already installed.
      --dry-run    Print what would happen; make no filesystem changes.
  -h, --help       Show this help.
  -v, --version    Print bundled glassdesk version.
`;
  process.stdout.write(help);
}

async function main(argv) {
  const { command, flags, unknown } = parseArgs(argv);

  if (command === 'help' || flags.help) {
    printHelp();
    return 0;
  }
  if (command === 'version' || flags.version) {
    log.plain(readPackageVersion());
    return 0;
  }
  if (command === 'unknown' || unknown.length > 0) {
    log.error(`Unknown argument(s): ${unknown.join(' ')}`);
    printHelp();
    return 1;
  }

  return runInstall(process.cwd(), command, flags);
}

// Run main when invoked as a script (not when imported by tests).
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => {
    log.error(err.stack ?? err.message);
    process.exit(1);
  });
}
