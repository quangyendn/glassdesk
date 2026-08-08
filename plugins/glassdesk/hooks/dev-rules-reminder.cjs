#!/usr/bin/env node
/**
 * Development Rules Reminder - UserPromptSubmit Hook (Optimized)
 *
 * Injects context: session info, rules, modularization reminders, and Plan Context.
 * Static env info (Node, Python, OS) now comes from SessionStart env vars.
 *
 * Exit Codes:
 *   0 - Success (non-blocking, allows continuation)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const {
  loadConfig,
  resolvePlanPath,
  getReportsPath,
  resolveNamingPattern,
  normalizePath
} = require('./lib/gd-config-utils.cjs');

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function execSafe(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return null;
  }
}

function resolveWorkflowPath(filename) {
  const localPath = path.join(process.cwd(), '.claude', 'workflows', filename);
  const globalPath = path.join(os.homedir(), '.claude', 'workflows', filename);
  if (fs.existsSync(localPath)) return `.claude/workflows/${filename}`;
  if (fs.existsSync(globalPath)) return `~/.claude/workflows/${filename}`;
  return null;
}

function resolveSkillsVenv() {
  const isWindows = process.platform === 'win32';
  const venvBin = isWindows ? 'Scripts' : 'bin';
  const pythonExe = isWindows ? 'python.exe' : 'python3';

  const localVenv = path.join(process.cwd(), '.claude', 'skills', '.venv', venvBin, pythonExe);
  const globalVenv = path.join(os.homedir(), '.claude', 'skills', '.venv', venvBin, pythonExe);

  if (fs.existsSync(localVenv)) {
    return isWindows
      ? '.claude\\skills\\.venv\\Scripts\\python.exe'
      : '.claude/skills/.venv/bin/python3';
  }
  if (fs.existsSync(globalVenv)) {
    return isWindows
      ? '~\\.claude\\skills\\.venv\\Scripts\\python.exe'
      : '~/.claude/skills/.venv/bin/python3';
  }
  return null;
}

function buildPlanContext(sessionId, config) {
  const { plan, paths } = config;
  const gitBranch = execSafe('git branch --show-current');
  const resolved = resolvePlanPath(sessionId, config);
  const reportsPath = getReportsPath(resolved.path, resolved.resolvedBy, plan, paths);

  // Compute naming pattern directly for reliable injection
  const namePattern = resolveNamingPattern(plan, gitBranch);

  const planLine = resolved.resolvedBy === 'session'
    ? `- Plan: ${resolved.path}`
    : resolved.resolvedBy === 'branch'
      ? `- Plan: none | Suggested: ${resolved.path}`
      : `- Plan: none`;

  // Validation config (injected so LLM can reference it)
  const validation = plan.validation || {};
  const validationMode = validation.mode || 'prompt';
  const validationMin = validation.minQuestions || 3;
  const validationMax = validation.maxQuestions || 8;

  return { reportsPath, gitBranch, planLine, namePattern, validationMode, validationMin, validationMax };
}

// A project can have glassdesk installed twice at once: the marketplace plugin
// registers this hook via hooks/hooks.json, and `npx glassdesk init` registers it
// via .claude/settings.local.json. Claude Code treats those as separate handlers
// and concatenates both additionalContext values, so the reminder would appear
// twice for the same prompt. The transcript check below cannot catch that — at
// this point neither copy has been written to the transcript yet.
//
// Guard with an exclusive lock file: whichever copy wins an atomic `wx` create
// emits the context, the other exits silently.
//
// The lock name carries a monotonic time bucket, so a name is never reused once
// its bucket passes. That removes any notion of an expired lock to reclaim —
// reclaiming in place is what makes this kind of guard racy, because two
// contenders can each believe they took over the same name from different
// generations. Nothing here unlinks a lock another process might still claim.
//
// Caveat: the guard only holds when both installed copies carry it. During an
// upgrade skew — a stale `npx` copy beside an updated marketplace plugin — the
// old copy never claims the lock and still injects.
const LOCK_BUCKET_MS = 10_000;
const LOCK_STRADDLE_MS = 1_000;
const LOCK_SWEEP_MS = 5 * 60_000;
const LOCK_PREFIX = 'gd-ups-';

// `wx` create is atomic: exactly one caller can win it.
function createLockExclusive(lockPath) {
  try {
    fs.closeSync(fs.openSync(lockPath, 'wx'));
    return true;
  } catch (e) {
    // EEXIST means someone else holds it. Any other error (read-only tmpdir,
    // permissions) means we cannot arbitrate at all — emit rather than suppress.
    return e.code !== 'EEXIST';
  }
}

function existsYoungerThan(lockPath, maxAgeMs) {
  try {
    return Date.now() - fs.statSync(lockPath).mtimeMs < maxAgeMs;
  } catch (e) {
    return false;
  }
}

// Buckets advance every LOCK_BUCKET_MS and never repeat, so any lock old enough
// to sweep can no longer be the target of a live claim.
function sweepAbandonedLocks(dir) {
  try {
    const cutoff = Date.now() - LOCK_SWEEP_MS;
    for (const name of fs.readdirSync(dir)) {
      if (!name.startsWith(LOCK_PREFIX) || !name.endsWith('.lock')) continue;
      const p = path.join(dir, name);
      try {
        if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p);
      } catch (e) { /* already gone */ }
    }
  } catch (e) { /* unreadable tmpdir — sweeping is best-effort */ }
}

function claimPromptLock(payload) {
  // Only Claude Code can register this hook twice (plugin manifest + project
  // settings), and only it supplies transcript_path. Harnesses without it —
  // Codex, which loads the plugin manifest alone — have no duplicate to guard
  // against and must not risk losing their only copy.
  if (!payload.transcript_path) return true;

  try {
    const dir = os.tmpdir();
    sweepAbandonedLocks(dir);

    // JSON-encode the parts rather than joining on a separator: no delimiter can
    // collide with prompt text, and the source stays plain ASCII.
    const key = crypto
      .createHash('sha256')
      .update(JSON.stringify([payload.session_id || '', process.cwd(), payload.prompt || '']))
      .digest('hex')
      .slice(0, 16);

    const bucket = Math.floor(Date.now() / LOCK_BUCKET_MS);
    const lockPath = (n) => path.join(dir, `${LOCK_PREFIX}${key}-${n}.lock`);

    if (!createLockExclusive(lockPath(bucket))) return false;

    // Won this bucket — but duplicate handlers launched microseconds apart can
    // straddle a bucket boundary and each win a different name. If the previous
    // bucket was claimed a moment ago, that copy is already emitting.
    if (existsYoungerThan(lockPath(bucket - 1), LOCK_STRADDLE_MS)) return false;

    return true;
  } catch (e) {
    return true; // never let the guard itself suppress the reminder
  }
}

function wasRecentlyInjected(transcriptPath) {
  try {
    if (!transcriptPath || !fs.existsSync(transcriptPath)) return false;
    const transcript = fs.readFileSync(transcriptPath, 'utf-8');
    // Check last 150 lines (hook output is ~30 lines, so this covers ~5 user prompts)
    return transcript.split('\n').slice(-150).some(line => line.includes('[IMPORTANT] Consider Modularization'));
  } catch (e) {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REMINDER TEMPLATE (all output in one place for visibility)
// ═══════════════════════════════════════════════════════════════════════════

function buildReminder({ thinkingLanguage, responseLanguage, devRulesPath, skillsVenv, reportsPath, plansPath, docsPath, planLine, gitBranch, namePattern, validationMode, validationMin, validationMax }) {
  // Build language instructions based on config
  // Auto-default thinkingLanguage to 'en' when only responseLanguage is set
  const effectiveThinking = thinkingLanguage || (responseLanguage ? 'en' : null);
  const hasThinking = effectiveThinking && effectiveThinking !== responseLanguage;
  const hasResponse = responseLanguage;
  const languageLines = [];

  if (hasThinking || hasResponse) {
    languageLines.push(`## Language`);
    if (hasThinking) {
      languageLines.push(`- Thinking: Use ${effectiveThinking} for reasoning (logic, precision).`);
    }
    if (hasResponse) {
      languageLines.push(`- Response: Respond in ${responseLanguage} (natural, fluent).`);
    }
    languageLines.push(``);
  }

  return [
    // ─────────────────────────────────────────────────────────────────────────
    // LANGUAGE (thinking + response, if configured)
    // ─────────────────────────────────────────────────────────────────────────
    ...languageLines,

    // ─────────────────────────────────────────────────────────────────────────
    // SESSION CONTEXT
    // ─────────────────────────────────────────────────────────────────────────
    `## Session`,
    `- DateTime: ${new Date().toLocaleString()}`,
    `- CWD: ${process.cwd()}`,
    ``,

    // ─────────────────────────────────────────────────────────────────────────
    // RULES
    // ─────────────────────────────────────────────────────────────────────────
    `## Rules`,
    ...(devRulesPath ? [`- Read and follow development rules: "${devRulesPath}"`] : []),
    `- Markdown files are organized in: Plans → "plans/" directory, Docs → "docs/" directory`,
    `- **IMPORTANT:** DO NOT create markdown files out of "plans/" or "docs/" directories UNLESS the user explicitly requests it.`,
    ...(skillsVenv ? [`- Python scripts in .claude/skills/: Use \`${skillsVenv}\``] : []),
    `- When skills' scripts are failed to execute, always fix them and run again, repeat until success.`,
    `- Follow **YAGNI (You Aren't Gonna Need It) - KISS (Keep It Simple, Stupid) - DRY (Don't Repeat Yourself)** principles`,
    `- Sacrifice grammar for the sake of concision when writing reports.`,
    `- In reports, list any unresolved questions at the end, if any.`,
    `- IMPORTANT: Ensure token consumption efficiency while maintaining high quality.`,
    ``,

    // ─────────────────────────────────────────────────────────────────────────
    // MODULARIZATION
    // ─────────────────────────────────────────────────────────────────────────
    `## **[IMPORTANT] Consider Modularization:**`,
    `- Check existing modules before creating new`,
    `- Analyze logical separation boundaries (functions, classes, concerns)`,
    `- Use kebab-case naming with descriptive names, it's fine if the file name is long because this ensures file names are self-documenting for LLM tools (Grep, Glob, Search)`,
    `- Write descriptive code comments`,
    `- After modularization, continue with main task`,
    `- When not to modularize: Markdown files, plain text files, bash scripts, configuration files, environment variables files, etc.`,
    ``,

    // ─────────────────────────────────────────────────────────────────────────
    // PATHS
    // ─────────────────────────────────────────────────────────────────────────
    `## Paths`,
    `Reports: ${reportsPath} | Plans: ${plansPath}/ | Docs: ${docsPath}/`,
    ``,

    // ─────────────────────────────────────────────────────────────────────────
    // PLAN CONTEXT
    // ─────────────────────────────────────────────────────────────────────────
    `## Plan Context`,
    planLine,
    `- Reports: ${reportsPath}`,
    ...(gitBranch ? [`- Branch: ${gitBranch}`] : []),
    `- Validation: mode=${validationMode}, questions=${validationMin}-${validationMax}`,
    ``,

    // ─────────────────────────────────────────────────────────────────────────
    // NAMING (computed pattern for consistent file naming)
    // ─────────────────────────────────────────────────────────────────────────
    `## Naming`,
    `- Report: \`${reportsPath}{type}-${namePattern}.md\``,
    `- Plan dir: \`${plansPath}/${namePattern}/\``,
    `- Replace \`{type}\` with: agent name, report type, or context`,
    `- Replace \`{slug}\` in pattern with: descriptive-kebab-slug`
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  try {
    const stdin = fs.readFileSync(0, 'utf-8').trim();
    if (!stdin) process.exit(0);

    const payload = JSON.parse(stdin);
    if (wasRecentlyInjected(payload.transcript_path)) process.exit(0);
    if (!claimPromptLock(payload)) process.exit(0);

    const sessionId = process.env.GD_SESSION_ID || null;
    const config = loadConfig({ includeProject: false, includeAssertions: false });
    const devRulesPath = resolveWorkflowPath('development-rules.md');
    const skillsVenv = resolveSkillsVenv();
    const { reportsPath, gitBranch, planLine, namePattern, validationMode, validationMin, validationMax } = buildPlanContext(sessionId, config);

    const output = buildReminder({
      thinkingLanguage: config.locale?.thinkingLanguage,
      responseLanguage: config.locale?.responseLanguage,
      devRulesPath,
      skillsVenv,
      reportsPath,
      plansPath: normalizePath(config.paths?.plans) || 'plans',
      docsPath: normalizePath(config.paths?.docs) || 'docs',
      planLine,
      gitBranch,
      namePattern,
      validationMode,
      validationMin,
      validationMax
    });

    // Emit the JSON envelope rather than bare stdout. Claude Code accepts both,
    // but Codex only injects context from `hookSpecificOutput.additionalContext` —
    // plain stdout there is logged and discarded.
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: output.join('\n')
      }
    }));
    process.exit(0);
  } catch (error) {
    console.error(`Dev rules hook error: ${error.message}`);
    process.exit(0);
  }
}

main();
