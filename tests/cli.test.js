import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseArgs, detectInstall, mergeSettings, copyPluginFiles, writeManifest, purgeStaleGlassdeskHooks } from '../bin/cli.js';

test('parseArgs: bare init', () => {
  assert.deepEqual(parseArgs(['init']), {
    command: 'init',
    flags: { yes: false, force: false, dryRun: false, help: false, version: false },
    unknown: [],
  });
});

test('parseArgs: bare update', () => {
  assert.deepEqual(parseArgs(['update']).command, 'update');
});

test('parseArgs: long flags', () => {
  const r = parseArgs(['init', '--yes', '--force', '--dry-run']);
  assert.equal(r.flags.yes, true);
  assert.equal(r.flags.force, true);
  assert.equal(r.flags.dryRun, true);
});

test('parseArgs: short flags', () => {
  const r = parseArgs(['update', '-y']);
  assert.equal(r.flags.yes, true);
});

test('parseArgs: --help and -h with no command', () => {
  assert.equal(parseArgs(['--help']).flags.help, true);
  assert.equal(parseArgs(['-h']).flags.help, true);
  assert.equal(parseArgs(['--help']).command, 'help');
});

test('parseArgs: --version and -v', () => {
  assert.equal(parseArgs(['--version']).flags.version, true);
  assert.equal(parseArgs(['-v']).flags.version, true);
  assert.equal(parseArgs(['--version']).command, 'version');
});

test('parseArgs: no args defaults to help', () => {
  assert.equal(parseArgs([]).command, 'help');
});

test('parseArgs: unknown command', () => {
  const r = parseArgs(['nope']);
  assert.equal(r.command, 'unknown');
  assert.deepEqual(r.unknown, ['nope']);
});

test('parseArgs: unknown flag', () => {
  const r = parseArgs(['init', '--bogus']);
  assert.equal(r.command, 'init');
  assert.deepEqual(r.unknown, ['--bogus']);
});

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'glassdesk-test-'));
}

test('detectInstall: missing manifest returns null', () => {
  const cwd = mkTmp();
  assert.equal(detectInstall(cwd), null);
});

test('detectInstall: valid manifest returns parsed object', () => {
  const cwd = mkTmp();
  fs.mkdirSync(path.join(cwd, '.claude'));
  const manifest = { version: '1.2.3', installedAt: '2026-01-01T00:00:00Z', installer: 'test', files: [] };
  fs.writeFileSync(path.join(cwd, '.claude', '.glassdesk.json'), JSON.stringify(manifest));
  assert.deepEqual(detectInstall(cwd), manifest);
});

test('detectInstall: malformed manifest returns null and warns', () => {
  const cwd = mkTmp();
  fs.mkdirSync(path.join(cwd, '.claude'));
  fs.writeFileSync(path.join(cwd, '.claude', '.glassdesk.json'), '{ not json');
  assert.equal(detectInstall(cwd), null);
});

test('mergeSettings: empty existing + template hooks', () => {
  const template = {
    hooks: {
      SessionStart: [
        { hooks: [{ type: 'command', command: 'node .claude/hooks/a.cjs' }] },
      ],
    },
    permissions: { allow: [], deny: [] },
    env: {},
  };
  const { merged, conflicts } = mergeSettings({}, template);
  assert.deepEqual(merged.hooks.SessionStart, [
    { hooks: [{ type: 'command', command: 'node .claude/hooks/a.cjs' }] },
  ]);
  assert.deepEqual(conflicts, []);
});

test('mergeSettings: dedup inner hooks by (type, command)', () => {
  const entry = { hooks: [{ type: 'command', command: 'node .claude/hooks/a.cjs' }] };
  const { merged } = mergeSettings(
    { hooks: { SessionStart: [entry] } },
    { hooks: { SessionStart: [entry] } }
  );
  assert.equal(merged.hooks.SessionStart.length, 1);
  assert.equal(merged.hooks.SessionStart[0].hooks.length, 1);
});

test('mergeSettings: legacy {matcher, command} entries are normalised', () => {
  const existing = {
    hooks: { SessionStart: [{ command: 'node .claude/hooks/a.cjs' }] },
  };
  const template = {
    hooks: {
      SessionStart: [
        { hooks: [{ type: 'command', command: 'node .claude/hooks/a.cjs' }] },
      ],
    },
  };
  const { merged } = mergeSettings(existing, template);
  assert.equal(merged.hooks.SessionStart.length, 1);
  assert.equal(merged.hooks.SessionStart[0].hooks.length, 1);
  assert.equal(merged.hooks.SessionStart[0].hooks[0].command, 'node .claude/hooks/a.cjs');
});

test('mergeSettings: legacy matcher "*" merges with no-matcher template entry', () => {
  const existing = {
    hooks: {
      SessionStart: [{ matcher: '*', command: 'node .claude/hooks/a.cjs' }],
    },
  };
  const template = {
    hooks: {
      SessionStart: [
        { hooks: [{ type: 'command', command: 'node .claude/hooks/a.cjs' }] },
      ],
    },
  };
  const { merged } = mergeSettings(existing, template);
  assert.equal(merged.hooks.SessionStart.length, 1);
  assert.equal(merged.hooks.SessionStart[0].hooks.length, 1);
});

test('mergeSettings: user hooks preserved alongside glassdesk hooks', () => {
  const existing = {
    hooks: {
      PostToolUse: [
        { matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'echo user' }] },
      ],
    },
  };
  const template = {
    hooks: {
      SessionStart: [
        { hooks: [{ type: 'command', command: 'node .claude/hooks/a.cjs' }] },
      ],
    },
  };
  const { merged } = mergeSettings(existing, template);
  assert.equal(merged.hooks.PostToolUse[0].hooks[0].command, 'echo user');
  assert.equal(merged.hooks.SessionStart[0].hooks[0].command, 'node .claude/hooks/a.cjs');
});

test('mergeSettings: same matcher merges inner hooks with dedup', () => {
  const existing = {
    hooks: {
      PostToolUse: [
        { matcher: 'Edit', hooks: [{ type: 'command', command: 'echo user' }] },
      ],
    },
  };
  const template = {
    hooks: {
      PostToolUse: [
        {
          matcher: 'Edit',
          hooks: [
            { type: 'command', command: 'echo user' },
            { type: 'command', command: 'echo glassdesk' },
          ],
        },
      ],
    },
  };
  const { merged } = mergeSettings(existing, template);
  assert.equal(merged.hooks.PostToolUse.length, 1);
  assert.equal(merged.hooks.PostToolUse[0].matcher, 'Edit');
  assert.deepEqual(
    merged.hooks.PostToolUse[0].hooks.map((h) => h.command),
    ['echo user', 'echo glassdesk']
  );
});

test('mergeSettings: permissions.allow union+dedup', () => {
  const existing = { permissions: { allow: ['Bash(ls:*)', 'Read(*)'] } };
  const template = { permissions: { allow: ['Read(*)', 'Bash(rm:*)'] } };
  const { merged } = mergeSettings(existing, template);
  assert.deepEqual(merged.permissions.allow.sort(), ['Bash(ls:*)', 'Bash(rm:*)', 'Read(*)']);
});

test('mergeSettings: env conflict — glassdesk wins, conflict reported', () => {
  const existing = { env: { FOO: 'old' } };
  const template = { env: { FOO: 'new' } };
  const { merged, conflicts } = mergeSettings(existing, template);
  assert.equal(merged.env.FOO, 'new');
  assert.equal(conflicts.length, 1);
  assert.match(conflicts[0], /env\.FOO/);
  assert.match(conflicts[0], /old/);
  assert.match(conflicts[0], /new/);
});

test('mergeSettings: untouched custom keys preserved', () => {
  const existing = { statusline: { type: 'static', value: 'hello' } };
  const template = { hooks: { SessionStart: [] } };
  const { merged } = mergeSettings(existing, template);
  assert.deepEqual(merged.statusline, { type: 'static', value: 'hello' });
});

test('mergeSettings: deny/allow cross-conflict glassdesk wins with warning', () => {
  const existing = { permissions: { deny: ['Bash(rm:*)'] } };
  const template = { permissions: { allow: ['Bash(rm:*)'] } };
  const { merged, conflicts } = mergeSettings(existing, template);
  assert.ok(merged.permissions.allow.includes('Bash(rm:*)'));
  assert.ok(!merged.permissions.deny.includes('Bash(rm:*)'));
  assert.equal(conflicts.length, 1);
  assert.match(conflicts[0], /Bash\(rm:\*\)/);
});

test('copyPluginFiles: copies tree recursively', () => {
  const src = mkTmp();
  const dest = mkTmp();
  fs.mkdirSync(path.join(src, 'commands'));
  fs.writeFileSync(path.join(src, 'commands', 'plan.md'), 'plan content');
  fs.mkdirSync(path.join(src, 'skills', 'planning'), { recursive: true });
  fs.writeFileSync(path.join(src, 'skills', 'planning', 'SKILL.md'), 'skill content');

  const files = copyPluginFiles(src, dest, false);

  assert.equal(fs.readFileSync(path.join(dest, 'commands', 'plan.md'), 'utf8'), 'plan content');
  assert.equal(fs.readFileSync(path.join(dest, 'skills', 'planning', 'SKILL.md'), 'utf8'), 'skill content');
  assert.deepEqual(files.sort(), ['commands/plan.md', 'skills/planning/SKILL.md']);
});

test('copyPluginFiles: dryRun does not write but returns file list', () => {
  const src = mkTmp();
  const dest = mkTmp();
  fs.writeFileSync(path.join(src, 'a.md'), 'hi');
  const files = copyPluginFiles(src, dest, true);
  assert.equal(fs.existsSync(path.join(dest, 'a.md')), false);
  assert.deepEqual(files, ['a.md']);
});

test('copyPluginFiles: overwrites existing files', () => {
  const src = mkTmp();
  const dest = mkTmp();
  fs.writeFileSync(path.join(src, 'a.md'), 'new');
  fs.writeFileSync(path.join(dest, 'a.md'), 'old');
  copyPluginFiles(src, dest, false);
  assert.equal(fs.readFileSync(path.join(dest, 'a.md'), 'utf8'), 'new');
});

test('writeManifest: writes JSON with version and POSIX paths', () => {
  const cwd = mkTmp();
  fs.mkdirSync(path.join(cwd, '.claude'));
  writeManifest(cwd, '2.0.0', ['commands/plan.md', 'skills/planning/SKILL.md']);
  const manifest = JSON.parse(fs.readFileSync(path.join(cwd, '.claude', '.glassdesk.json'), 'utf8'));
  assert.equal(manifest.version, '2.0.0');
  assert.match(manifest.installedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(manifest.files, ['commands/plan.md', 'skills/planning/SKILL.md']);
});

// ----- purgeStaleGlassdeskHooks: legacy template migration -----

test('purgeStaleGlassdeskHooks: removes legacy session-init and dev-rules-reminder entries', () => {
  const hooksObj = {
    SessionStart: [
      { hooks: [{ type: 'command', command: 'node .claude/hooks/session-init.cjs' }] },
    ],
    UserPromptSubmit: [
      { hooks: [{ type: 'command', command: 'node .claude/hooks/dev-rules-reminder.cjs' }] },
    ],
  };
  const removed = purgeStaleGlassdeskHooks(hooksObj, ['SessionStart', 'UserPromptSubmit']);
  assert.equal(removed.length, 2);
  assert.deepEqual(hooksObj.SessionStart, []);
  assert.deepEqual(hooksObj.UserPromptSubmit, []);
});

test('purgeStaleGlassdeskHooks: leaves user hooks and unknown commands alone', () => {
  const hooksObj = {
    SessionStart: [
      { hooks: [{ type: 'command', command: 'node .claude/hooks/session-init.cjs' }] },
      { hooks: [{ type: 'command', command: 'echo user-hook' }] },
    ],
  };
  const removed = purgeStaleGlassdeskHooks(hooksObj, ['SessionStart']);
  assert.equal(removed.length, 1);
  assert.equal(hooksObj.SessionStart.length, 1);
  assert.equal(hooksObj.SessionStart[0].hooks[0].command, 'echo user-hook');
});

test('purgeStaleGlassdeskHooks: ignores events not present in eventNames', () => {
  const hooksObj = {
    SessionStart: [
      { hooks: [{ type: 'command', command: 'node .claude/hooks/session-init.cjs' }] },
    ],
  };
  const removed = purgeStaleGlassdeskHooks(hooksObj, ['UserPromptSubmit']);
  assert.equal(removed.length, 0);
  assert.equal(hooksObj.SessionStart.length, 1);
});

test('mergeSettings: upgrade replaces stale glassdesk hook with new template entry, reports conflict', () => {
  const existing = {
    hooks: {
      SessionStart: [
        { hooks: [{ type: 'command', command: 'node .claude/hooks/session-init.cjs' }] },
      ],
    },
  };
  const template = {
    hooks: {
      SessionStart: [
        { hooks: [{ type: 'command', command: 'node "${CLAUDE_PROJECT_DIR:-$PWD}/.claude/hooks/session-init.cjs"' }] },
      ],
    },
  };
  const { merged, conflicts } = mergeSettings(existing, template);
  // Stale entry removed; new entry from template only.
  assert.equal(merged.hooks.SessionStart.length, 1);
  assert.equal(merged.hooks.SessionStart[0].hooks.length, 1);
  assert.match(merged.hooks.SessionStart[0].hooks[0].command, /\$\{CLAUDE_PROJECT_DIR:-\$PWD\}/);
  assert.ok(conflicts.some((c) => /removed stale glassdesk entry/.test(c)));
});

import { looksLikeProjectRoot } from '../bin/cli.js';

test('looksLikeProjectRoot: true if .git directory present', () => {
  const cwd = mkTmp();
  fs.mkdirSync(path.join(cwd, '.git'));
  assert.equal(looksLikeProjectRoot(cwd), true);
});

test('looksLikeProjectRoot: true if package.json present', () => {
  const cwd = mkTmp();
  fs.writeFileSync(path.join(cwd, 'package.json'), '{}');
  assert.equal(looksLikeProjectRoot(cwd), true);
});

test('looksLikeProjectRoot: false if neither present', () => {
  const cwd = mkTmp();
  assert.equal(looksLikeProjectRoot(cwd), false);
});
