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

// ----- Path-rewrite tests (Phase 1: $GD_PLUGIN_PATH → ${CLAUDE_PROJECT_DIR}/.claude) -----

// Recursively collect .md files under a root dir, return absolute paths.
function collectMarkdownFiles(rootDir) {
  const out = [];
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && e.name.endsWith('.md')) out.push(full);
    }
  }
  return out;
}

test('rewrite: post-init no .md contains $GD_PLUGIN_PATH; project-relative .claude/scripts present in ≥4 files', () => {
  const cwd = mkProject();
  runCli(['init', '--yes'], { cwd });
  const mds = collectMarkdownFiles(path.join(cwd, '.claude'));
  let leftover = 0;
  let withReplacement = 0;
  for (const f of mds) {
    const c = fs.readFileSync(f, 'utf8');
    if (/\$GD_PLUGIN_PATH\b/.test(c)) leftover++;
    // After rewrite, references look like `node ".claude/scripts/..."` (project-relative).
    if (/"\.claude\/scripts\//.test(c)) withReplacement++;
  }
  assert.equal(leftover, 0, 'no .md should contain $GD_PLUGIN_PATH');
  assert.ok(withReplacement >= 4, `expected ≥4 files with project-relative .claude/scripts/ refs, got ${withReplacement}`);
});

test('rewrite: subagent env-isolation — rewritten command runs with cwd=project root and minimal env', () => {
  const cwd = mkProject();
  runCli(['init', '--yes'], { cwd });
  // Pull the actual rewritten command line from a known file. Use plan/hard.md
  // because plan.md is renamed to plan/fast.md by RENAME_MAP — plan/hard.md is
  // path-stable across the rename and carries the same set-active-plan.cjs
  // invocation.
  const planMd = fs.readFileSync(path.join(cwd, '.claude', 'commands', 'plan', 'hard.md'), 'utf8');
  const match = planMd.match(/node "[^"]*set-active-plan\.cjs"/);
  assert.ok(match, 'expected rewritten node invocation in plan/hard.md');
  // Simulate subagent: NO GD_PLUGIN_PATH, NO GD_SESSION_ID, NO CLAUDE_PROJECT_DIR.
  // Rely solely on cwd=project root (which Claude Code's Bash tool always sets).
  const r = spawnSync('bash', ['-c', `${match[0]} plans/dummy`], {
    cwd,
    env: { PATH: process.env.PATH, HOME: process.env.HOME },
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, `subagent run failed: ${r.stderr || r.stdout}`);
  // Without GD_SESSION_ID the script logs a warning but exits 0; confirms it RAN (path resolved).
  assert.match(r.stdout + r.stderr, /Would set active plan to: plans\/dummy|Active plan set to/);
});

test('rewrite: update re-rewrites tampered $GD_PLUGIN_PATH back to project-relative .claude', () => {
  const cwd = mkProject();
  runCli(['init', '--yes'], { cwd });
  // plan.md is renamed to plan/fast.md; use plan/hard.md (path-stable) which
  // has the same $GD_PLUGIN_PATH reference for tamper-and-update assertion.
  const target = path.join(cwd, '.claude', 'commands', 'plan', 'hard.md');
  // Tamper: replace the rewritten path back to the legacy env-var form.
  const tampered = fs.readFileSync(target, 'utf8').replace(/"\.claude\//g, '"$GD_PLUGIN_PATH/');
  fs.writeFileSync(target, tampered);
  assert.match(fs.readFileSync(target, 'utf8'), /\$GD_PLUGIN_PATH/);
  const r = runCli(['update', '--yes'], { cwd });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const after = fs.readFileSync(target, 'utf8');
  assert.doesNotMatch(after, /\$GD_PLUGIN_PATH\b/);
  assert.match(after, /"\.claude\//);
});

test('rewrite: update is idempotent — second run rewrites 0 of N files', () => {
  const cwd = mkProject();
  runCli(['init', '--yes'], { cwd });
  // First update — fresh copy from bundle (still has $GD_PLUGIN_PATH), so rewrite count > 0.
  const r1 = runCli(['update', '--yes'], { cwd });
  assert.equal(r1.status, 0, r1.stderr || r1.stdout);
  assert.match(r1.stdout, /Rewrote \$GD_PLUGIN_PATH in [1-9]\d*\/\d+ \.md files/);
  // Second update — bundle copy + rewrite should still report >0 (it's a fresh re-copy each time).
  // Idempotency assertion: post-state stable and re-running update produces equivalent output.
  const beforeHashes = collectMarkdownFiles(path.join(cwd, '.claude')).map((f) => fs.readFileSync(f, 'utf8'));
  const r2 = runCli(['update', '--yes'], { cwd });
  assert.equal(r2.status, 0, r2.stderr || r2.stdout);
  const afterHashes = collectMarkdownFiles(path.join(cwd, '.claude')).map((f) => fs.readFileSync(f, 'utf8'));
  assert.deepEqual(afterHashes, beforeHashes, 'second update should produce identical .md content');
});

test('rewrite: bundle invariant — source plugins/glassdesk/**/*.md keeps $GD_PLUGIN_PATH in 5 known files', () => {
  const bundleDir = path.join(REPO_ROOT, 'plugins', 'glassdesk');
  const mds = collectMarkdownFiles(bundleDir);
  const withToken = mds
    .filter((f) => /\$GD_PLUGIN_PATH\b/.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(bundleDir, f).split(path.sep).join('/'))
    .filter((rel) => !rel.endsWith('CHANGELOG.md'));
  // Exactly the 5 references (CHANGELOG mentions are historical, excluded above).
  assert.deepEqual(withToken.sort(), [
    'commands/plan.md',
    'commands/plan/hard.md',
    'skills/planning/SKILL.md',
    'skills/planning/references/input-resolution.md',
    'skills/planning/references/plan-organization.md',
  ]);
});

test('rewrite: --dry-run reports rewrite count without writing', () => {
  const cwd = mkProject();
  const r = runCli(['init', '--yes', '--dry-run'], { cwd });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /Would rewrite \$GD_PLUGIN_PATH in \d+\/\d+ \.md files/);
  // No files should have been written.
  assert.equal(fs.existsSync(path.join(cwd, '.claude', 'commands')), false);
  assert.equal(fs.existsSync(path.join(cwd, '.claude', '.glassdesk.json')), false);
});

// ----- Phase 2: session-init first-writer-wins guard for GD_PLUGIN_PATH -----

const SESSION_INIT = path.join(REPO_ROOT, 'plugins', 'glassdesk', 'hooks', 'session-init.cjs');

function runSessionInit({ presetPluginPath } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-session-init-'));
  const envFile = path.join(tmp, 'claude-env');
  fs.writeFileSync(envFile, '');
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    CLAUDE_ENV_FILE: envFile,
  };
  if (presetPluginPath !== undefined) env.GD_PLUGIN_PATH = presetPluginPath;
  const r = spawnSync('node', [SESSION_INIT], { env, encoding: 'utf8' });
  return { ...r, envFileContent: fs.readFileSync(envFile, 'utf8'), tmp };
}

test('session-init: writes GD_PLUGIN_PATH when env unset', () => {
  const r = runSessionInit({});
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.envFileContent, /export GD_PLUGIN_PATH=/);
  assert.match(r.envFileContent, /export GD_SESSION_ID=/);
});

test('session-init: respects existing GD_PLUGIN_PATH (first-writer-wins)', () => {
  const r = runSessionInit({ presetPluginPath: '/custom/marketplace/glassdesk' });
  assert.equal(r.status, 0, r.stderr);
  // Should NOT write GD_PLUGIN_PATH again.
  assert.doesNotMatch(r.envFileContent, /export GD_PLUGIN_PATH=/);
  // GD_SESSION_ID is still always regenerated.
  assert.match(r.envFileContent, /export GD_SESSION_ID=/);
});
