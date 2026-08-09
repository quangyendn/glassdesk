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
// registers this hook from hooks/hooks.json, and `npx glassdesk init` registers
// a copy of it from .claude/settings.local.json. Claude Code keeps plugin and
// project handlers separate and runs both, concatenating both context blocks.
//
// The two processes share no event identifier — no turn id, no sequence number —
// so they cannot arbitrate at runtime. Any lock keyed on the prompt text is
// stuck choosing between letting a boundary case through and suppressing a
// legitimate repeat of the same prompt, and suppressing the only copy is far
// worse than injecting twice.
//
// Decide statically instead: the copies differ by where they live. The project
// copy is authoritative when it exists and is registered, so the plugin copy
// stands down. No timing, no shared state, no race.
// Symlink-safe: `.claude/hooks` is a symlink into the main checkout under the
// managed-worktree setup, so comparing lexical paths would make the project copy
// fail to recognise itself.
function realPath(p) {
  try {
    return fs.realpathSync(p);
  } catch (e) {
    return path.resolve(p);
  }
}

// Claude Code exports CLAUDE_PROJECT_DIR; cwd may be a subdirectory of it, in
// which case `<cwd>/.claude` does not exist and neither copy would find the
// other. Walk up as a fallback for harnesses that do not set the variable.
function resolveProjectDir() {
  if (process.env.CLAUDE_PROJECT_DIR) return realPath(process.env.CLAUDE_PROJECT_DIR);
  let dir = realPath(process.cwd());
  for (;;) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return realPath(process.cwd());
    dir = parent;
  }
}

function projectCopyWillRun(payload) {
  // Standing down is only safe if the harness actually runs project-settings
  // hooks. Claude Code does, and supplies transcript_path; Codex runs the plugin
  // manifest alone and ignores .claude/settings*.json, so a registration there
  // is inert and yielding to it would silence the only copy.
  if (!payload.transcript_path) return false;

  const projectDir = resolveProjectDir();
  const projectHooks = path.join(projectDir, '.claude', 'hooks');
  const projectHook = path.join(projectHooks, 'dev-rules-reminder.cjs');

  // We are the project copy — we are the one that runs.
  if (realPath(__dirname) === realPath(projectHooks)) return false;
  if (!fs.existsSync(projectHook)) return false;

  // Present on disk is not enough: `npx glassdesk init` also has to have wired
  // it into settings, and a user may have removed that registration.
  for (const file of ['settings.local.json', 'settings.json']) {
    try {
      const settings = JSON.parse(
        fs.readFileSync(path.join(projectDir, '.claude', file), 'utf-8')
      );
      const groups = settings && settings.hooks && settings.hooks.UserPromptSubmit;
      if (!Array.isArray(groups)) continue;
      for (const group of groups) {
        for (const hook of (group && group.hooks) || []) {
          if (typeof hook.command === 'string' && hook.command.includes('dev-rules-reminder.cjs')) {
            return true;
          }
        }
      }
    } catch (e) { /* missing or malformed — treat as not registered */ }
  }
  return false;
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
    if (projectCopyWillRun(payload)) process.exit(0);

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
