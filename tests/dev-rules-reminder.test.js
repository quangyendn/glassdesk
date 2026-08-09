import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_HOOKS = path.join(REPO_ROOT, 'plugins', 'glassdesk', 'hooks');

const REGISTRATION = {
  hooks: {
    UserPromptSubmit: [
      { hooks: [{ type: 'command', command: 'node .claude/hooks/dev-rules-reminder.cjs' }] },
    ],
  },
};

// A payload carrying transcript_path marks a Claude Code invocation. The
// transcript itself must not exist, or the unrelated re-injection throttle
// would suppress the output we are measuring.
function claudePayload() {
  return JSON.stringify({
    session_id: 'test-session',
    prompt: 'hello',
    transcript_path: path.join(os.tmpdir(), 'glassdesk-no-such-transcript.jsonl'),
  });
}

function installHookCopy(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.cpSync(path.join(SOURCE_HOOKS, 'lib'), path.join(dir, 'lib'), { recursive: true });
  fs.copyFileSync(
    path.join(SOURCE_HOOKS, 'dev-rules-reminder.cjs'),
    path.join(dir, 'dev-rules-reminder.cjs')
  );
  return path.join(dir, 'dev-rules-reminder.cjs');
}

// Returns true when this copy emitted context, false when it stood down.
function emits(hookPath, { cwd, projectDir, payload = claudePayload() }) {
  const env = { ...process.env };
  if (projectDir) env.CLAUDE_PROJECT_DIR = projectDir;
  else delete env.CLAUDE_PROJECT_DIR;

  const result = spawnSync('node', [hookPath], { cwd, input: payload, encoding: 'utf8', env });
  assert.equal(result.status, 0, `hook exited ${result.status}: ${result.stderr}`);
  return result.stdout.trim().length > 0;
}

// project/     an `npx glassdesk init` install: .claude/hooks + registration
// plugin/      the marketplace plugin copy, living outside the project
function mkFixture({ register = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'glassdesk-hook-'));
  const project = path.join(root, 'project');
  const projectHook = installHookCopy(path.join(project, '.claude', 'hooks'));
  const pluginHook = installHookCopy(path.join(root, 'plugin', 'hooks'));
  if (register) {
    fs.writeFileSync(
      path.join(project, '.claude', 'settings.local.json'),
      JSON.stringify(REGISTRATION)
    );
  }
  return { root, project, projectHook, pluginHook };
}

test('dual install: plugin copy stands down, project copy emits', () => {
  const { project, projectHook, pluginHook } = mkFixture();
  assert.equal(emits(pluginHook, { cwd: project, projectDir: project }), false);
  assert.equal(emits(projectHook, { cwd: project, projectDir: project }), true);
});

test('marketplace-only install: plugin copy emits', () => {
  const { project, pluginHook } = mkFixture();
  fs.rmSync(path.join(project, '.claude', 'hooks'), { recursive: true, force: true });
  assert.equal(emits(pluginHook, { cwd: project, projectDir: project }), true);
});

test('project copy present but not registered: plugin copy emits', () => {
  const { project, pluginHook } = mkFixture({ register: false });
  assert.equal(emits(pluginHook, { cwd: project, projectDir: project }), true);
});

test('malformed settings fail open: plugin copy emits', () => {
  const { project, pluginHook } = mkFixture();
  fs.writeFileSync(path.join(project, '.claude', 'settings.local.json'), '{ not json');
  assert.equal(emits(pluginHook, { cwd: project, projectDir: project }), true);
});

test('worktree symlink: project copy recognises itself through the symlink', () => {
  const { root, project, pluginHook } = mkFixture();
  // Managed worktrees symlink .claude/hooks back into the main checkout.
  const worktree = path.join(root, 'worktree');
  fs.mkdirSync(path.join(worktree, '.claude'), { recursive: true });
  fs.symlinkSync(path.join(project, '.claude', 'hooks'), path.join(worktree, '.claude', 'hooks'));
  fs.writeFileSync(
    path.join(worktree, '.claude', 'settings.local.json'),
    JSON.stringify(REGISTRATION)
  );

  const linkedHook = path.join(worktree, '.claude', 'hooks', 'dev-rules-reminder.cjs');
  assert.equal(emits(linkedHook, { cwd: worktree, projectDir: worktree }), true);
  assert.equal(emits(pluginHook, { cwd: worktree, projectDir: worktree }), false);
});

test('subdirectory cwd: copies still find each other via CLAUDE_PROJECT_DIR', () => {
  const { project, projectHook, pluginHook } = mkFixture();
  const deep = path.join(project, 'src', 'nested');
  fs.mkdirSync(deep, { recursive: true });
  assert.equal(emits(pluginHook, { cwd: deep, projectDir: project }), false);
  assert.equal(emits(projectHook, { cwd: deep, projectDir: project }), true);
});

test('subdirectory cwd without CLAUDE_PROJECT_DIR: walks up to the project root', () => {
  const { project, projectHook, pluginHook } = mkFixture();
  const deep = path.join(project, 'src', 'nested');
  fs.mkdirSync(deep, { recursive: true });
  assert.equal(emits(pluginHook, { cwd: deep }), false);
  assert.equal(emits(projectHook, { cwd: deep }), true);
});

test('no transcript_path (Codex): plugin copy emits despite a project registration', () => {
  const { project, pluginHook } = mkFixture();
  const codexPayload = JSON.stringify({ session_id: 'test-session', prompt: 'hello' });
  // Codex ignores .claude/settings*.json, so that registration is inert and
  // standing down would silence the only copy — on every prompt, repeats included.
  for (let i = 0; i < 3; i++) {
    assert.equal(emits(pluginHook, { cwd: project, projectDir: project, payload: codexPayload }), true);
  }
});
