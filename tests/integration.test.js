import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(REPO_ROOT, 'bin', 'cli.js');

function mkProject() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'glassdesk-it-'));
  // Make heuristic happy.
  fs.writeFileSync(path.join(cwd, 'package.json'), '{}');
  return cwd;
}

function runCli(args, { cwd, input } = {}) {
  return spawnSync('node', [CLI, ...args], {
    cwd,
    input,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
  });
}

test('init: happy path in a fresh project', () => {
  const cwd = mkProject();
  const r = runCli(['init', '--yes'], { cwd });
  assert.equal(r.status, 0, r.stderr || r.stdout);

  // Manifest exists with our version.
  const manifest = JSON.parse(fs.readFileSync(path.join(cwd, '.claude', '.glassdesk.json'), 'utf8'));
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.files.length > 0);

  // settings.local.json was created with hooks in canonical Claude Code shape.
  const settings = JSON.parse(fs.readFileSync(path.join(cwd, '.claude', 'settings.local.json'), 'utf8'));
  const sessionStartCommands = settings.hooks.SessionStart.flatMap((entry) =>
    (entry.hooks ?? []).map((h) => h.command)
  );
  assert.ok(sessionStartCommands.some((c) => c.includes('session-init.cjs')));

  // Plugin files copied.
  assert.ok(fs.existsSync(path.join(cwd, '.claude', 'commands')));
  assert.ok(fs.existsSync(path.join(cwd, '.claude', 'skills')));
});

test('init: refuses when already installed', () => {
  const cwd = mkProject();
  runCli(['init', '--yes'], { cwd });
  const r2 = runCli(['init', '--yes'], { cwd });
  assert.equal(r2.status, 1);
  assert.match(r2.stderr, /already installed/);
});

test('init --force: bypasses already-installed guard', () => {
  const cwd = mkProject();
  runCli(['init', '--yes'], { cwd });
  const r2 = runCli(['init', '--yes', '--force'], { cwd });
  assert.equal(r2.status, 0, r2.stderr || r2.stdout);
});

test('update: refuses when not initialised', () => {
  const cwd = mkProject();
  const r = runCli(['update', '--yes'], { cwd });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not initialised/);
});

test('update: re-overwrites files after init', () => {
  const cwd = mkProject();
  runCli(['init', '--yes'], { cwd });
  // Mutate a file; update should overwrite it back.
  const target = path.join(cwd, '.claude', 'commands');
  const firstFile = fs.readdirSync(target).find((n) => n.endsWith('.md'));
  assert.ok(firstFile, 'expected at least one .md command file');
  const filePath = path.join(target, firstFile);
  fs.writeFileSync(filePath, 'TAMPERED');
  const r = runCli(['update', '--yes'], { cwd });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.notEqual(fs.readFileSync(filePath, 'utf8'), 'TAMPERED');
});

test('init --dry-run: writes nothing', () => {
  const cwd = mkProject();
  const r = runCli(['init', '--yes', '--dry-run'], { cwd });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.equal(fs.existsSync(path.join(cwd, '.claude', '.glassdesk.json')), false);
  assert.equal(fs.existsSync(path.join(cwd, '.claude', 'commands')), false);
});

test('init: cancel at confirm prompt → exit 0, no install', () => {
  const cwd = mkProject();
  // No --yes; feed "n" to stdin.
  const r = runCli(['init'], { cwd, input: 'n\n' });
  assert.equal(r.status, 0);
  assert.equal(fs.existsSync(path.join(cwd, '.claude', '.glassdesk.json')), false);
});

test('cwd not project root: prompts even with --yes', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'glassdesk-noroot-'));
  // No .git, no package.json — heuristic flags it.
  // Even with --yes we expect a prompt; piping "n\n" cancels.
  const r = runCli(['init', '--yes'], { cwd, input: 'n\n' });
  assert.equal(r.status, 0);
  assert.equal(fs.existsSync(path.join(cwd, '.claude', '.glassdesk.json')), false);
  assert.match(r.stderr, /does not look like a project root/);
});

test('init: malformed settings.local.json bails with helpful error', () => {
  const cwd = mkProject();
  fs.mkdirSync(path.join(cwd, '.claude'));
  fs.writeFileSync(path.join(cwd, '.claude', 'settings.local.json'), '{ not json');
  const r = runCli(['init', '--yes'], { cwd });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not valid JSON/);
});

test('--help and --version', () => {
  const help = runCli(['--help'], { cwd: REPO_ROOT });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage:/);
  const ver = runCli(['--version'], { cwd: REPO_ROOT });
  assert.equal(ver.status, 0);
  assert.match(ver.stdout, /^\d+\.\d+\.\d+/);
});

test('unknown flag: exits 1 with usage', () => {
  const r = runCli(['init', '--bogus'], { cwd: REPO_ROOT });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unknown argument/);
});

test('copyPluginFiles: skips settings.local.json and .DS_Store', async () => {
  const { copyPluginFiles } = await import('../bin/cli.js');
  const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-skip-src-'));
  const destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-skip-dst-'));
  fs.writeFileSync(path.join(srcDir, 'commands.md'), 'ok');
  fs.writeFileSync(path.join(srcDir, 'settings.local.json'), '{}');
  fs.writeFileSync(path.join(srcDir, '.DS_Store'), 'mac');
  const copied = copyPluginFiles(srcDir, destDir, false);
  assert.deepEqual(copied, ['commands.md']);
  assert.ok(!fs.existsSync(path.join(destDir, 'settings.local.json')));
  assert.ok(!fs.existsSync(path.join(destDir, '.DS_Store')));
});
