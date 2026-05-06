import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseArgs, detectInstall, mergeSettings, copyPluginFiles, writeManifest, purgeStaleGlassdeskHooks, rewriteCommandRefs, RENAME_MAP, COMMAND_REWRITES } from '../bin/cli.js';

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
  // Use a non-renamed command so this test exercises plain pass-through.
  // RENAME_MAP coverage is tested separately.
  fs.writeFileSync(path.join(src, 'commands', 'scout.md'), 'scout content');
  fs.mkdirSync(path.join(src, 'skills', 'planning'), { recursive: true });
  fs.writeFileSync(path.join(src, 'skills', 'planning', 'SKILL.md'), 'skill content');

  const files = copyPluginFiles(src, dest, false);

  assert.equal(fs.readFileSync(path.join(dest, 'commands', 'scout.md'), 'utf8'), 'scout content');
  assert.equal(fs.readFileSync(path.join(dest, 'skills', 'planning', 'SKILL.md'), 'utf8'), 'skill content');
  assert.deepEqual(files.sort(), ['commands/scout.md', 'skills/planning/SKILL.md']);
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

// ----- RENAME_MAP: avoid built-in /debug collision in npx-into-.claude install -----

test('RENAME_MAP: includes commands/debug.md → commands/gd-debug.md', () => {
  assert.equal(RENAME_MAP.get('commands/debug.md'), 'commands/gd-debug.md');
});

test('copyPluginFiles: renames files listed in RENAME_MAP and tracks dest in manifest', () => {
  const src = mkTmp();
  const dest = mkTmp();
  fs.mkdirSync(path.join(src, 'commands'));
  fs.writeFileSync(path.join(src, 'commands', 'debug.md'), 'debug content');
  // Untouched control: scout.md is not in RENAME_MAP — must pass through unchanged.
  fs.writeFileSync(path.join(src, 'commands', 'scout.md'), 'scout content');

  const files = copyPluginFiles(src, dest, false);

  // Renamed file lands at gd-debug.md; original name is NOT created.
  assert.ok(fs.existsSync(path.join(dest, 'commands', 'gd-debug.md')));
  assert.equal(fs.existsSync(path.join(dest, 'commands', 'debug.md')), false);
  assert.equal(fs.readFileSync(path.join(dest, 'commands', 'gd-debug.md'), 'utf8'), 'debug content');
  // Untouched file stays put.
  assert.ok(fs.existsSync(path.join(dest, 'commands', 'scout.md')));
  // Manifest reflects renamed dest path, not source.
  assert.deepEqual(files.sort(), ['commands/gd-debug.md', 'commands/scout.md']);
});

test('copyPluginFiles: dryRun returns renamed dest paths without writing', () => {
  const src = mkTmp();
  const dest = mkTmp();
  fs.mkdirSync(path.join(src, 'commands'));
  fs.writeFileSync(path.join(src, 'commands', 'debug.md'), 'x');
  const files = copyPluginFiles(src, dest, true);
  assert.equal(fs.existsSync(path.join(dest, 'commands', 'gd-debug.md')), false);
  assert.deepEqual(files, ['commands/gd-debug.md']);
});

// ----- rewriteCommandRefs: /debug → /gd-debug in copied .md -----

test('COMMAND_REWRITES: maps debug → gd-debug', () => {
  assert.equal(COMMAND_REWRITES.get('debug'), 'gd-debug');
});

test('rewriteCommandRefs: rewrites /debug to /gd-debug in .md files', () => {
  const root = mkTmp();
  const file = path.join(root, 'docs.md');
  fs.writeFileSync(file, '- `/debug` is the command\n- Use `/debug` here.\n');
  const result = rewriteCommandRefs(root, { dryRun: false });
  assert.equal(result.scanned, 1);
  assert.equal(result.rewritten, 1);
  const out = fs.readFileSync(file, 'utf8');
  assert.match(out, /\/gd-debug/);
  assert.doesNotMatch(out, /\/debug\b(?!.md)/);
});

test('rewriteCommandRefs: preserves /debug.md filename mentions and /debugger identifiers', () => {
  const root = mkTmp();
  const file = path.join(root, 'manifest.md');
  fs.writeFileSync(
    file,
    'Files: commands/debug.md and /debug.md\nClass: /debugger should not change\nCommand: /debug works\n'
  );
  rewriteCommandRefs(root, { dryRun: false });
  const out = fs.readFileSync(file, 'utf8');
  assert.match(out, /commands\/debug\.md/);
  assert.match(out, /\/debug\.md/);
  assert.match(out, /\/debugger/);
  assert.match(out, /\/gd-debug works/);
});

test('rewriteCommandRefs: dryRun does not modify files but reports counts', () => {
  const root = mkTmp();
  const file = path.join(root, 'a.md');
  fs.writeFileSync(file, 'use `/debug` here');
  const result = rewriteCommandRefs(root, { dryRun: true });
  assert.equal(result.scanned, 1);
  assert.equal(result.rewritten, 1);
  assert.equal(fs.readFileSync(file, 'utf8'), 'use `/debug` here');
});

test('rewriteCommandRefs: skips non-.md files', () => {
  const root = mkTmp();
  fs.writeFileSync(path.join(root, 'config.json'), '{"cmd": "/debug"}');
  const result = rewriteCommandRefs(root, { dryRun: false });
  assert.equal(result.scanned, 0);
  assert.equal(result.rewritten, 0);
  assert.match(fs.readFileSync(path.join(root, 'config.json'), 'utf8'), /\/debug/);
});

// ----- /plan → /plan:fast rename + variant preservation -----

test('RENAME_MAP: includes commands/plan.md → commands/plan/fast.md', () => {
  assert.equal(RENAME_MAP.get('commands/plan.md'), 'commands/plan/fast.md');
});

test('COMMAND_REWRITES: maps plan → plan:fast', () => {
  assert.equal(COMMAND_REWRITES.get('plan'), 'plan:fast');
});

test('copyPluginFiles: renames plan.md into plan/fast.md alongside existing variants', () => {
  const src = mkTmp();
  const dest = mkTmp();
  fs.mkdirSync(path.join(src, 'commands', 'plan'), { recursive: true });
  fs.writeFileSync(path.join(src, 'commands', 'plan.md'), 'fast plan');
  fs.writeFileSync(path.join(src, 'commands', 'plan', 'hard.md'), 'hard plan');
  fs.writeFileSync(path.join(src, 'commands', 'plan', 'list.md'), 'list plans');

  const files = copyPluginFiles(src, dest, false);

  // Renamed base lands inside the existing namespace dir.
  assert.equal(fs.readFileSync(path.join(dest, 'commands', 'plan', 'fast.md'), 'utf8'), 'fast plan');
  // Source plan.md is NOT created at top level on dest.
  assert.equal(fs.existsSync(path.join(dest, 'commands', 'plan.md')), false);
  // Variants pass through untouched.
  assert.equal(fs.readFileSync(path.join(dest, 'commands', 'plan', 'hard.md'), 'utf8'), 'hard plan');
  assert.equal(fs.readFileSync(path.join(dest, 'commands', 'plan', 'list.md'), 'utf8'), 'list plans');
  // Manifest reflects renamed dest paths.
  assert.deepEqual(
    files.sort(),
    ['commands/plan/fast.md', 'commands/plan/hard.md', 'commands/plan/list.md']
  );
});

test('rewriteCommandRefs: rewrites /plan to /plan:fast in .md files', () => {
  const root = mkTmp();
  const file = path.join(root, 'workflow.md');
  fs.writeFileSync(file, 'Step 1: run `/plan` to create a plan.\n');
  rewriteCommandRefs(root, { dryRun: false });
  const out = fs.readFileSync(file, 'utf8');
  assert.match(out, /\/plan:fast/);
});

test('rewriteCommandRefs: preserves /plan:hard, /plan.md, /planning, commands/plan/hard.md', () => {
  const root = mkTmp();
  const file = path.join(root, 'doc.md');
  fs.writeFileSync(
    file,
    [
      'Variant: /plan:hard runs deep research',
      'Filename: commands/plan.md is the entry point',
      'Skill: /planning is the harness',
      'Path: commands/plan/hard.md is the variant',
      'Bare: use /plan now',
    ].join('\n') + '\n'
  );
  rewriteCommandRefs(root, { dryRun: false });
  const out = fs.readFileSync(file, 'utf8');
  // Variants/filenames/identifiers/path-segments untouched.
  assert.match(out, /\/plan:hard runs/);
  assert.match(out, /commands\/plan\.md is/);
  assert.match(out, /\/planning is/);
  assert.match(out, /commands\/plan\/hard\.md is/);
  // Bare /plan rewritten.
  assert.match(out, /use \/plan:fast now/);
});

test('rewriteCommandRefs: is idempotent — second run rewrites nothing new', () => {
  const root = mkTmp();
  const file = path.join(root, 'a.md');
  fs.writeFileSync(file, 'use /plan and /debug now');
  const r1 = rewriteCommandRefs(root, { dryRun: false });
  const after1 = fs.readFileSync(file, 'utf8');
  const r2 = rewriteCommandRefs(root, { dryRun: false });
  const after2 = fs.readFileSync(file, 'utf8');
  assert.equal(r1.rewritten, 1);
  assert.equal(r2.rewritten, 0);
  assert.equal(after1, after2);
  assert.match(after1, /\/plan:fast and \/gd-debug/);
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
