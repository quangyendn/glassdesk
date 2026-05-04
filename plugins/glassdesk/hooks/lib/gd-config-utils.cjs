/**
 * Shared utilities for GlassDesk hooks
 *
 * Contains config loading, path sanitization, and common constants
 * used by session-init.cjs and dev-rules-reminder.cjs
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const LOCAL_CONFIG_PATH = '.claude/.ck.json';
const GLOBAL_CONFIG_PATH = path.join(os.homedir(), '.claude', '.ck.json');

// Legacy export for backward compatibility
const CONFIG_PATH = LOCAL_CONFIG_PATH;

const DEFAULT_CONFIG = {
  plan: {
    namingFormat: '{date}-{issue}-{slug}',
    dateFormat: 'YYMMDD-HHmm',
    issuePrefix: null,
    reportsDir: 'reports',
    resolution: {
      // CHANGED: Removed 'mostRecent' - only explicit session state activates plans
      // Branch matching now returns 'suggested' not 'active'
      order: ['session', 'branch'],
      branchPattern: '(?:feat|fix|chore|refactor|docs)/(?:[^/]+/)?(.+)'
    },
    validation: {
      mode: 'prompt',  // 'auto' | 'prompt' | 'off'
      minQuestions: 3,
      maxQuestions: 8,
      focusAreas: ['assumptions', 'risks', 'tradeoffs', 'architecture']
    }
  },
  paths: {
    docs: 'docs',
    plans: 'plans'
  },
  locale: {
    thinkingLanguage: null,  // Language for reasoning (e.g., "en" for precision)
    responseLanguage: null   // Language for user-facing output (e.g., "vi")
  },
  trust: {
    passphrase: null,
    enabled: false
  },
  project: {
    type: 'auto',
    packageManager: 'auto',
    framework: 'auto'
  },
  assertions: []
};

/**
 * Deep merge objects (source values override target, nested objects merged recursively)
 * Arrays are replaced entirely (not concatenated) to avoid duplicate entries
 * @param {Object} target - Base object
 * @param {Object} source - Object to merge (takes precedence)
 * @returns {Object} Merged object
 */
function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  if (!target || typeof target !== 'object') return source;

  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];

    // Arrays: replace entirely (don't concatenate)
    if (Array.isArray(sourceVal)) {
      result[key] = [...sourceVal];
    }
    // Objects: recurse (but not null)
    else if (sourceVal !== null && typeof sourceVal === 'object' && !Array.isArray(sourceVal)) {
      result[key] = deepMerge(targetVal || {}, sourceVal);
    }
    // Primitives: source wins
    else {
      result[key] = sourceVal;
    }
  }
  return result;
}

/**
 * Load config from a specific file path
 * @param {string} configPath - Path to config file
 * @returns {Object|null} Parsed config or null if not found/invalid
 */
function loadConfigFromPath(configPath) {
  try {
    if (!fs.existsSync(configPath)) return null;
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    return null;
  }
}

/**
 * Get session temp file path
 * @param {string} sessionId - Session identifier
 * @returns {string} Path to session temp file
 */
function getSessionTempPath(sessionId) {
  return path.join(os.tmpdir(), `gd-session-${sessionId}.json`);
}

/**
 * Read session state from temp file
 * @param {string} sessionId - Session identifier
 * @returns {Object|null} Session state or null
 */
function readSessionState(sessionId) {
  if (!sessionId) return null;
  const tempPath = getSessionTempPath(sessionId);
  try {
    if (!fs.existsSync(tempPath)) return null;
    return JSON.parse(fs.readFileSync(tempPath, 'utf8'));
  } catch (e) {
    return null;
  }
}

/**
 * Write session state atomically to temp file
 * @param {string} sessionId - Session identifier
 * @param {Object} state - State object to persist
 * @returns {boolean} Success status
 */
function writeSessionState(sessionId, state) {
  if (!sessionId) return false;
  const tempPath = getSessionTempPath(sessionId);
  const tmpFile = tempPath + '.' + Math.random().toString(36).slice(2);
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2));
    fs.renameSync(tmpFile, tempPath);
    return true;
  } catch (e) {
    try { fs.unlinkSync(tmpFile); } catch (_) { /* ignore */ }
    return false;
  }
}

/**
 * Characters invalid in filenames across Windows, macOS, Linux
 * Windows: < > : " / \ | ? *
 * macOS/Linux: / and null byte
 * Also includes control characters and other problematic chars
 */
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f\x7f]/g;

/**
 * Sanitize slug for safe filesystem usage
 * - Removes invalid filename characters
 * - Replaces non-alphanumeric (except hyphen) with hyphen
 * - Collapses multiple hyphens
 * - Removes leading/trailing hyphens
 * - Limits length to prevent filesystem issues
 *
 * @param {string} slug - Slug to sanitize
 * @returns {string} Sanitized slug (empty string if nothing valid remains)
 */
function sanitizeSlug(slug) {
  if (!slug || typeof slug !== 'string') return '';

  let sanitized = slug
    // Remove invalid filename chars first
    .replace(INVALID_FILENAME_CHARS, '')
    // Replace any non-alphanumeric (except hyphen) with hyphen
    .replace(/[^a-z0-9-]/gi, '-')
    // Collapse multiple consecutive hyphens
    .replace(/-+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, '')
    // Limit length (most filesystems support 255, but keep reasonable)
    .slice(0, 100);

  return sanitized;
}

/**
 * Extract feature slug from git branch name
 * Pattern: (?:feat|fix|chore|refactor|docs)/(?:[^/]+/)?(.+)
 * @param {string} branch - Git branch name
 * @param {string} pattern - Regex pattern (optional)
 * @returns {string|null} Extracted slug or null
 */
function extractSlugFromBranch(branch, pattern) {
  if (!branch) return null;
  const defaultPattern = /(?:feat|fix|chore|refactor|docs)\/(?:[^\/]+\/)?(.+)/;
  const regex = pattern ? new RegExp(pattern) : defaultPattern;
  const match = branch.match(regex);
  return match ? sanitizeSlug(match[1]) : null;
}

/**
 * Find most recent plan folder by timestamp prefix
 * @param {string} plansDir - Plans directory path
 * @returns {string|null} Most recent plan path or null
 */
function findMostRecentPlan(plansDir) {
  try {
    if (!fs.existsSync(plansDir)) return null;
    const entries = fs.readdirSync(plansDir, { withFileTypes: true });
    const planDirs = entries
      .filter(e => e.isDirectory() && /^\d{6}/.test(e.name))
      .map(e => e.name)
      .sort()
      .reverse();
    return planDirs.length > 0 ? path.join(plansDir, planDirs[0]) : null;
  } catch (e) {
    return null;
  }
}

/**
 * Safely execute shell command (internal helper)
 * SECURITY: Only accepts whitelisted git read commands
 * @param {string} cmd - Command to execute
 * @returns {string|null} Command output or null
 */
function execSafe(cmd) {
  // Whitelist of safe read-only commands
  const allowedCommands = ['git branch --show-current', 'git rev-parse --abbrev-ref HEAD'];
  if (!allowedCommands.includes(cmd)) {
    return null;
  }

  try {
    return require('child_process')
      .execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
      .trim();
  } catch (e) {
    return null;
  }
}

/**
 * Resolve active plan path using cascading resolution with tracking
 *
 * Resolution semantics:
 * - 'session': Explicitly set via set-active-plan.cjs → ACTIVE (directive)
 * - 'branch': Matched from git branch name → SUGGESTED (hint only)
 * - 'mostRecent': REMOVED - was causing stale plan pollution
 *
 * @param {string} sessionId - Session identifier (optional)
 * @param {Object} config - GlassDesk config
 * @returns {{ path: string|null, resolvedBy: 'session'|'branch'|null }} Resolution result with tracking
 */
function resolvePlanPath(sessionId, config) {
  const plansDir = config?.paths?.plans || 'plans';
  const resolution = config?.plan?.resolution || {};
  const order = resolution.order || ['session', 'branch'];
  const branchPattern = resolution.branchPattern;

  for (const method of order) {
    switch (method) {
      case 'session': {
        const state = readSessionState(sessionId);
        if (state?.activePlan) {
          // Only use session state if CWD matches session origin (monorepo support)
          if (state.sessionOrigin && state.sessionOrigin !== process.cwd()) {
            break;  // Fall through to branch
          }
          return { path: state.activePlan, resolvedBy: 'session' };
        }
        break;
      }
      case 'branch': {
        try {
          const branch = execSafe('git branch --show-current');
          const slug = extractSlugFromBranch(branch, branchPattern);
          if (slug && fs.existsSync(plansDir)) {
            const entries = fs.readdirSync(plansDir, { withFileTypes: true })
              .filter(e => e.isDirectory() && e.name.includes(slug));
            if (entries.length > 0) {
              return {
                path: path.join(plansDir, entries[entries.length - 1].name),
                resolvedBy: 'branch'
              };
            }
          }
        } catch (e) {
          // Ignore errors reading plans dir
        }
        break;
      }
      // NOTE: 'mostRecent' case intentionally removed - was causing stale plan pollution
    }
  }
  return { path: null, resolvedBy: null };
}

/**
 * Normalize path value (trim, remove trailing slashes, handle empty)
 * @param {string} pathValue - Path to normalize
 * @returns {string|null} Normalized path or null if invalid
 */
function normalizePath(pathValue) {
  if (!pathValue || typeof pathValue !== 'string') return null;

  // Trim whitespace
  let normalized = pathValue.trim();

  // Empty after trim = invalid
  if (!normalized) return null;

  // Remove trailing slashes (but keep root "/" or "C:\")
  normalized = normalized.replace(/[/\\]+$/, '');

  // If it became empty (was just slashes), return null
  if (!normalized) return null;

  return normalized;
}

/**
 * Check if path is absolute
 * @param {string} pathValue - Path to check
 * @returns {boolean} True if absolute path
 */
function isAbsolutePath(pathValue) {
  if (!pathValue) return false;
  // Unix absolute: starts with /
  // Windows absolute: starts with drive letter (C:\) or UNC (\\)
  return path.isAbsolute(pathValue);
}

/**
 * Sanitize path values
 * - Normalizes path (trim, remove trailing slashes)
 * - Allows absolute paths (for consolidated plans use case)
 * - Prevents obvious security issues (null bytes, etc.)
 *
 * @param {string} pathValue - Path to sanitize
 * @param {string} projectRoot - Project root for relative path resolution
 * @returns {string|null} Sanitized path or null if invalid
 */
function sanitizePath(pathValue, projectRoot) {
  // Normalize first
  const normalized = normalizePath(pathValue);
  if (!normalized) return null;

  // Block null bytes and other dangerous chars
  if (/[\x00]/.test(normalized)) return null;

  // Allow absolute paths (user explicitly wants consolidated plans elsewhere)
  if (isAbsolutePath(normalized)) {
    return normalized;
  }

  // For relative paths, resolve and validate
  const resolved = path.resolve(projectRoot, normalized);

  // Prevent path traversal outside project (../ attacks)
  // But allow if user explicitly set absolute path
  if (!resolved.startsWith(projectRoot + path.sep) && resolved !== projectRoot) {
    // This is a relative path trying to escape - block it
    return null;
  }

  return normalized;
}

/**
 * Validate and sanitize config paths
 */
function sanitizeConfig(config, projectRoot) {
  const result = { ...config };

  if (result.plan) {
    result.plan = { ...result.plan };
    if (!sanitizePath(result.plan.reportsDir, projectRoot)) {
      result.plan.reportsDir = DEFAULT_CONFIG.plan.reportsDir;
    }
    // Merge resolution defaults
    result.plan.resolution = {
      ...DEFAULT_CONFIG.plan.resolution,
      ...result.plan.resolution
    };
    // Merge validation defaults
    result.plan.validation = {
      ...DEFAULT_CONFIG.plan.validation,
      ...result.plan.validation
    };
  }

  if (result.paths) {
    result.paths = { ...result.paths };
    if (!sanitizePath(result.paths.docs, projectRoot)) {
      result.paths.docs = DEFAULT_CONFIG.paths.docs;
    }
    if (!sanitizePath(result.paths.plans, projectRoot)) {
      result.paths.plans = DEFAULT_CONFIG.paths.plans;
    }
  }

  if (result.locale) {
    result.locale = { ...result.locale };
  }

  return result;
}

/**
 * Load config with cascading resolution: DEFAULT → global → local
 *
 * Resolution order (each layer overrides the previous):
 *   1. DEFAULT_CONFIG (hardcoded defaults)
 *   2. Global config (~/.claude/.ck.json) - user preferences
 *   3. Local config (./.claude/.ck.json) - project-specific overrides
 *
 * @param {Object} options - Options for config loading
 * @param {boolean} options.includeProject - Include project section (default: true)
 * @param {boolean} options.includeAssertions - Include assertions (default: true)
 * @param {boolean} options.includeLocale - Include locale section (default: true)
 */
function loadConfig(options = {}) {
  const { includeProject = true, includeAssertions = true, includeLocale = true } = options;
  const projectRoot = process.cwd();

  // Load configs from both locations
  const globalConfig = loadConfigFromPath(GLOBAL_CONFIG_PATH);
  const localConfig = loadConfigFromPath(LOCAL_CONFIG_PATH);

  // No config files found - use defaults
  if (!globalConfig && !localConfig) {
    return getDefaultConfig(includeProject, includeAssertions, includeLocale);
  }

  try {
    // Deep merge: DEFAULT → global → local (local wins)
    let merged = deepMerge({}, DEFAULT_CONFIG);
    if (globalConfig) merged = deepMerge(merged, globalConfig);
    if (localConfig) merged = deepMerge(merged, localConfig);

    // Build result with optional sections
    const result = {
      plan: merged.plan || DEFAULT_CONFIG.plan,
      paths: merged.paths || DEFAULT_CONFIG.paths
    };

    if (includeLocale) {
      result.locale = merged.locale || DEFAULT_CONFIG.locale;
    }
    // Always include trust config for verification
    result.trust = merged.trust || DEFAULT_CONFIG.trust;
    if (includeProject) {
      result.project = merged.project || DEFAULT_CONFIG.project;
    }
    if (includeAssertions) {
      result.assertions = merged.assertions || [];
    }
    // Coding level for output style selection (-1 to 5, default: -1 = disabled)
    // -1 = disabled (no injection, saves tokens)
    // 0-5 = inject corresponding level guidelines
    result.codingLevel = merged.codingLevel ?? -1;

    return sanitizeConfig(result, projectRoot);
  } catch (e) {
    return getDefaultConfig(includeProject, includeAssertions, includeLocale);
  }
}

/**
 * Get default config with optional sections
 */
function getDefaultConfig(includeProject = true, includeAssertions = true, includeLocale = true) {
  const result = {
    plan: { ...DEFAULT_CONFIG.plan },
    paths: { ...DEFAULT_CONFIG.paths },
    codingLevel: -1  // Default: disabled (no injection, saves tokens)
  };
  if (includeLocale) {
    result.locale = { ...DEFAULT_CONFIG.locale };
  }
  if (includeProject) {
    result.project = { ...DEFAULT_CONFIG.project };
  }
  if (includeAssertions) {
    result.assertions = [];
  }
  return result;
}

/**
 * Escape shell special characters for env file values
 */
function escapeShellValue(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$');
}

/**
 * Write environment variable to CLAUDE_ENV_FILE (with escaping)
 */
function writeEnv(envFile, key, value) {
  if (envFile && value !== null && value !== undefined) {
    const escaped = escapeShellValue(String(value));
    fs.appendFileSync(envFile, `export ${key}="${escaped}"\n`);
  }
}

/**
 * Detect whether Serena MCP plugin is enabled.
 *
 * Detection chain (fastest first):
 *   1. ~/.claude/settings.json `enabledPlugins` — loose match /^serena@/
 *   2. `claude plugin list --json` subprocess — 3s timeout
 *   3. Fall back to false (treat as unavailable)
 *
 * MUST NOT throw. Detection failure = not available.
 *
 * @returns {boolean} True if Serena plugin is enabled, false otherwise.
 */
function detectSerena() {
  // Tier 1: settings.json (fast, authoritative for "enabled")
  try {
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const cfg = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const enabled = cfg.enabledPlugins || {};
      for (const key of Object.keys(enabled)) {
        if (/^serena@/.test(key) && enabled[key] === true) return true;
      }
    }
  } catch (_) { /* fall through */ }

  // Tier 2: CLI fallback (slower; tolerates schema drift)
  try {
    const out = require('child_process')
      .execSync('claude plugin list --json', {
        timeout: 3000,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      .toString();
    const list = JSON.parse(out);
    const arr = Array.isArray(list) ? list : (list && list.plugins) || [];
    return arr.some(p => p && /serena/i.test(p.name || '') && p.enabled !== false);
  } catch (_) { /* fall through */ }

  // Tier 3: assume not available
  return false;
}

/**
 * Build the one-shot install hint printed to SessionStart stdout.
 * Plain text, ≤500 chars, ≤10 lines. Auto-injected as Claude session context.
 *
 * @returns {string} Hint message.
 */
function buildSerenaHint() {
  return [
    '[glassdesk] Tip: Serena MCP not detected. Symbol-aware tools cut code-work tokens 50–90%.',
    '  Install:  /plugin install serena@claude-plugins-official',
    '  (If marketplace missing:  /plugin marketplace add anthropics/claude-plugins-official  then retry)',
    '  Onboarding (one-time per project): user-triggered on first symbol-tool call.',
    '  Reference: ${CLAUDE_PLUGIN_ROOT}/docs/serena-preference.md',
  ].join('\n');
}

/**
 * Detect whether the given path is a git worktree (i.e., not the main worktree).
 * In a worktree, `git rev-parse --absolute-git-dir` and `git rev-parse --git-common-dir`
 * resolve to DIFFERENT absolute paths. In the main worktree they match.
 *
 * MUST NOT throw. Returns false on any git failure (no git repo, etc.).
 *
 * @param {string} cwd - Working directory to inspect.
 * @returns {boolean} True iff cwd is inside a non-main worktree.
 */
function isGitWorktree(cwd) {
  try {
    const { execSync } = require('child_process');
    const opts = { cwd, stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 };
    const gitDir = execSync('git rev-parse --absolute-git-dir', opts).toString().trim();
    const commonDir = execSync('git rev-parse --git-common-dir', opts).toString().trim();
    const absCommon = path.isAbsolute(commonDir) ? commonDir : path.resolve(cwd, commonDir);
    return path.resolve(gitDir) !== path.resolve(absCommon);
  } catch (_) {
    return false;
  }
}

/**
 * Build the worktree-safety hint shown when Serena is active AND the CWD is a
 * git worktree. Reminds Claude/agents to call `activate_project` with the
 * absolute CWD path (never by project name) — name-lookup picks the FIRST
 * registered path in `~/.serena/serena_config.yml`, which is usually the main
 * repo, causing edits to land in the wrong tree.
 *
 * Plain text, ≤500 chars, ≤10 lines. Auto-injected as Claude session context.
 *
 * @param {string} cwd - Absolute path of the worktree.
 * @returns {string} Hint message.
 */
function buildWorktreeActivationHint(cwd) {
  return [
    '[glassdesk] Worktree detected. Serena activation safety:',
    `  → Always call activate_project("${cwd}") with this ABSOLUTE path.`,
    '  → NEVER call activate_project by project name (e.g. "glassdesk") — it routes',
    '    to the FIRST registered path in ~/.serena/serena_config.yml (usually main repo)',
    '    and edits land in the wrong worktree.',
    '  Reference: ${CLAUDE_PLUGIN_ROOT}/docs/serena-preference.md#activation-rule-worktree-safety',
  ].join('\n');
}


/**
 * Parse the `languages:` list out of a Serena project.yml content string.
 * Handles both YAML forms:
 *   block: `languages:\n  - python\n  - typescript`
 *   inline: `languages: [python, typescript]`
 * Strips quotes and empties; returns null when the field is missing or empty
 * so the caller can fall back to a default.
 *
 * Why a regex parser instead of a YAML library: keeps the hooks dep-free
 * (zero npm install needed for SessionStart). The two formats above cover
 * 100% of project.yml templates Serena ships.
 *
 * @param {string} content - Raw text of project.yml (may be empty).
 * @returns {string[]|null}
 */
function sniffYamlLanguages(content) {
  if (!content) return null;
  // Block form: `languages:\n  - foo\n  - bar`
  const blockMatch = content.match(/^languages:[ \t]*\n((?:[ \t]*-[ \t]+\S.*\n?)+)/m);
  if (blockMatch) {
    const items = blockMatch[1]
      .split('\n')
      .filter((l) => l.trim().startsWith('-'))
      .map((l) => l.replace(/^\s*-\s*/, '').trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
    if (items.length) return items;
  }
  // Inline form: `languages: [foo, bar]`
  const inlineMatch = content.match(/^languages:[ \t]*\[([^\]]*)\]/m);
  if (inlineMatch) {
    const items = inlineMatch[1]
      .split(',')
      .map((s) => s.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
    if (items.length) return items;
  }
  return null;
}

/**
 * Auto-bootstrap a per-worktree `.serena/project.yml` so each worktree has a
 * UNIQUE `project_name`. Without this, name-lookup activation routes file
 * operations to whichever path was registered first in
 * `~/.serena/serena_config.yml` — usually the main repo — causing
 * `replace_symbol_body` calls to land in the wrong tree.
 *
 * Idempotent — only writes when:
 *   1. The worktree's `.serena/project.yml` does not exist, OR
 *   2. Its `project_name` matches the MAIN repo's `project_name` (i.e. it was
 *      copied verbatim, the unsafe default). Anything else is preserved.
 *
 * MUST NOT throw. Returns a small summary object for logging/tests.
 *
 * @param {string} cwd - Absolute path of a git worktree (caller pre-checks via isGitWorktree).
 * @returns {{written?: string, skipped?: string, name?: string}}
 */
function ensureWorktreeSerenaProject(cwd) {
  try {
    const fs = require('fs');
    const { execSync } = require('child_process');

    // Resolve main repo root from worktree's `git common-dir`.
    let mainRoot;
    const opts = { cwd, stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 };
    const commonDir = execSync('git rev-parse --git-common-dir', opts).toString().trim();
    const absCommon = path.isAbsolute(commonDir) ? commonDir : path.resolve(cwd, commonDir);
    mainRoot = path.dirname(absCommon); // <main>/.git → <main>

    // Read main repo's .serena/project.yml ONCE; sniff name + languages from it.
    const NAME_RE = /^project_name:\s*["']?([^"'\n]+?)["']?\s*$/m;
    const mainYml = path.join(mainRoot, '.serena', 'project.yml');
    let mainContent = '';
    if (fs.existsSync(mainYml)) {
      try { mainContent = fs.readFileSync(mainYml, 'utf8'); } catch (_) { /* no-op */ }
    }
    const nameMatch = mainContent.match(NAME_RE);
    const mainName = (nameMatch && nameMatch[1].trim()) || path.basename(mainRoot);
    const languages = sniffYamlLanguages(mainContent) || ['python'];

    // Derive branch slug for the unique name (sanitize for YAML / filesystem safety).
    let branchSlug;
    try {
      branchSlug = execSync('git rev-parse --abbrev-ref HEAD', opts)
        .toString().trim().replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 60);
    } catch (_) {
      branchSlug = path.basename(cwd);
    }
    if (!branchSlug || branchSlug === 'HEAD') branchSlug = path.basename(cwd);

    const targetName = `${mainName}-${branchSlug}`;

    // Idempotency: if existing name is non-empty and DIFFERENT from main, leave alone.
    const wtYml = path.join(cwd, '.serena', 'project.yml');
    if (fs.existsSync(wtYml)) {
      const existing = fs.readFileSync(wtYml, 'utf8');
      const m = existing.match(NAME_RE);
      const existingName = m && m[1].trim();
      if (existingName && existingName !== mainName) {
        return { skipped: 'unique name already set', name: existingName };
      }
    }

    // Write minimal-but-correct project.yml. User can extend later.
    fs.mkdirSync(path.dirname(wtYml), { recursive: true });
    const yml = [
      '# Auto-generated by glassdesk session-init for git worktree isolation.',
      '# Idempotent: re-run will not overwrite once project_name is customized.',
      '',
      `project_name: "${targetName}"`,
      'languages:',
      ...languages.map((lang) => `  - ${lang}`),
      'encoding: "utf-8"',
      'ignore_all_files_in_gitignore: true',
      '',
      '# Worktree isolation: prevent Serena/LSP from escaping the worktree root',
      '# back into the parent dir or sibling worktrees.',
      'ignored_paths:',
      '  - "../**"',
      '',
      'read_only: false',
      '',
    ].join('\n');
    fs.writeFileSync(wtYml, yml);
    return { written: targetName };
  } catch (e) {
    return { skipped: `error: ${e.message}` };
  }
}

/**
 * Get reports path based on plan resolution
 * Only uses plan-specific path for 'session' resolved plans (explicitly active)
 * Branch-matched (suggested) plans use default path to avoid pollution
 *
 * @param {string|null} planPath - The plan path
 * @param {string|null} resolvedBy - How plan was resolved ('session'|'branch'|null)
 * @param {Object} planConfig - Plan configuration
 * @param {Object} pathsConfig - Paths configuration
 * @returns {string} Reports path
 */
function getReportsPath(planPath, resolvedBy, planConfig, pathsConfig) {
  const reportsDir = normalizePath(planConfig?.reportsDir) || 'reports';
  const plansDir = normalizePath(pathsConfig?.plans) || 'plans';

  // Only use plan-specific reports path if explicitly active (session state)
  if (planPath && resolvedBy === 'session') {
    const normalizedPlanPath = normalizePath(planPath) || planPath;
    return `${normalizedPlanPath}/${reportsDir}/`;
  }
  // Default path for no plan or suggested (branch-matched) plans
  return `${plansDir}/${reportsDir}/`;
}

/**
 * Format issue ID with prefix
 */
function formatIssueId(issueId, planConfig) {
  if (!issueId) return null;
  return planConfig.issuePrefix ? `${planConfig.issuePrefix}${issueId}` : `#${issueId}`;
}

/**
 * Extract issue ID from branch name
 */
function extractIssueFromBranch(branch) {
  if (!branch) return null;
  const patterns = [
    /(?:issue|gh|fix|feat|bug)[/-]?(\d+)/i,
    /[/-](\d+)[/-]/,
    /#(\d+)/
  ];
  for (const pattern of patterns) {
    const match = branch.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Format date according to dateFormat config
 * Supports: YYMMDD, YYMMDD-HHmm, YYYYMMDD, etc.
 * @param {string} format - Date format string
 * @returns {string} Formatted date
 */
function formatDate(format) {
  const now = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, '0');

  const tokens = {
    'YYYY': now.getFullYear(),
    'YY': String(now.getFullYear()).slice(-2),
    'MM': pad(now.getMonth() + 1),
    'DD': pad(now.getDate()),
    'HH': pad(now.getHours()),
    'mm': pad(now.getMinutes()),
    'ss': pad(now.getSeconds())
  };

  let result = format;
  for (const [token, value] of Object.entries(tokens)) {
    result = result.replace(token, value);
  }
  return result;
}

/**
 * Validate naming pattern result
 * Ensures pattern resolves to a usable directory name
 *
 * @param {string} pattern - Resolved naming pattern
 * @returns {{ valid: boolean, error?: string }} Validation result
 */
function validateNamingPattern(pattern) {
  if (!pattern || typeof pattern !== 'string') {
    return { valid: false, error: 'Pattern is empty or not a string' };
  }

  // After removing {slug} placeholder, should still have content
  const withoutSlug = pattern.replace(/\{slug\}/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!withoutSlug) {
    return { valid: false, error: 'Pattern resolves to empty after removing {slug}' };
  }

  // Check for remaining unresolved placeholders (besides {slug})
  const unresolvedMatch = withoutSlug.match(/\{[^}]+\}/);
  if (unresolvedMatch) {
    return { valid: false, error: `Unresolved placeholder: ${unresolvedMatch[0]}` };
  }

  // Pattern must contain {slug} for agents to substitute
  if (!pattern.includes('{slug}')) {
    return { valid: false, error: 'Pattern must contain {slug} placeholder' };
  }

  return { valid: true };
}

/**
 * Resolve naming pattern with date and optional issue prefix
 * Keeps {slug} as placeholder for agents to substitute
 *
 * Example: namingFormat="{date}-{issue}-{slug}", dateFormat="YYMMDD-HHmm", issue="GH-88"
 * Returns: "251212-1830-GH-88-{slug}" (if issue exists)
 * Returns: "251212-1830-{slug}" (if no issue)
 *
 * @param {Object} planConfig - Plan configuration
 * @param {string|null} gitBranch - Current git branch (for issue extraction)
 * @returns {string} Resolved naming pattern with {slug} placeholder
 */
function resolveNamingPattern(planConfig, gitBranch) {
  const { namingFormat, dateFormat, issuePrefix } = planConfig;
  const formattedDate = formatDate(dateFormat);

  // Try to extract issue ID from branch name
  const issueId = extractIssueFromBranch(gitBranch);
  const fullIssue = issueId && issuePrefix ? `${issuePrefix}${issueId}` : null;

  // Build pattern by substituting {date} and {issue}, keep {slug}
  let pattern = namingFormat;
  pattern = pattern.replace('{date}', formattedDate);

  if (fullIssue) {
    pattern = pattern.replace('{issue}', fullIssue);
  } else {
    // Remove {issue} and any trailing/leading dash
    pattern = pattern.replace(/-?\{issue\}-?/, '-').replace(/--+/g, '-');
  }

  // Clean up the result:
  // - Remove leading/trailing hyphens
  // - Collapse multiple hyphens (except around {slug})
  pattern = pattern
    .replace(/^-+/, '')           // Remove leading hyphens
    .replace(/-+$/, '')           // Remove trailing hyphens
    .replace(/-+(\{slug\})/g, '-$1')  // Single hyphen before {slug}
    .replace(/(\{slug\})-+/g, '$1-')  // Single hyphen after {slug}
    .replace(/--+/g, '-');        // Collapse other multiple hyphens

  // Validate the resulting pattern
  const validation = validateNamingPattern(pattern);
  if (!validation.valid) {
    // Log warning but return pattern anyway (fail-safe)
    if (process.env.GD_DEBUG) {
      console.error(`[gd-config] Warning: ${validation.error}`);
    }
  }

  return pattern;
}

/**
 * Get current git branch (safe execution)
 * @returns {string|null} Current branch name or null
 */
function getGitBranch() {
  return execSafe('git branch --show-current');
}

/**
 * Load the worktree-symlinks config (plugin default + optional project override).
 *
 * Resolution order:
 *   1. Hardcoded DEFAULT (symlinks: ['plans'], createTargetIfMissing: true, lockFile: true)
 *   2. Plugin default: $GD_PLUGIN_PATH/config/worktree-symlinks.json  (shallow merge)
 *   3. Project override: <cwd>/.claude/worktree-symlinks.json          (symlinks[] fully replaced; other keys merged)
 *
 * MUST NOT throw.
 *
 * @returns {{ symlinks: string[], createTargetIfMissing: boolean, lockFile: boolean }}
 */
function loadWorktreeSymlinksConfig() {
  const DEFAULT = { symlinks: ['plans'], createTargetIfMissing: true, lockFile: true };
  let result = { ...DEFAULT };

  // Plugin default — read from GD_PLUGIN_PATH
  try {
    const pluginPath = process.env.GD_PLUGIN_PATH;
    if (pluginPath) {
      const p = path.join(pluginPath, 'config', 'worktree-symlinks.json');
      if (fs.existsSync(p)) result = { ...result, ...JSON.parse(fs.readFileSync(p, 'utf8')) };
    }
  } catch (_) { /* ignore — fall back to default */ }

  // Project override — full replacement of symlinks[], merge other keys
  try {
    const overridePath = path.join(process.cwd(), '.claude', 'worktree-symlinks.json');
    if (fs.existsSync(overridePath)) {
      const override = JSON.parse(fs.readFileSync(overridePath, 'utf8'));
      result = { ...result, ...override }; // symlinks[] from override fully replaces
    }
  } catch (_) { /* ignore */ }

  return result;
}

/**
 * Idempotently creates folder symlinks from the main repo root into the current worktree.
 * No-op if cwd is not a git worktree.
 *
 * Defensive contract (mirrors ensureWorktreeSerenaProject):
 *   - Never throws; all I/O wrapped in try/catch.
 *   - Logs via process.stdout.write for session-context injection.
 *   - Never symlinks a path that is tracked by git in the main repo.
 *   - Never replaces a pre-existing real directory or a mismatched symlink.
 *   - Idempotent: re-running skips already-correct symlinks; updates lock updatedAt.
 *
 * @param {string} cwd - Working directory (worktree path).
 * @param {object} _hookConfig - Full hook config (reserved for future verbosity control).
 * @returns {Promise<{created: string[], skipped: string[], warned: string[]}>}
 */
async function ensureWorktreeSymlinks(cwd, _hookConfig) {
  const EMPTY = { created: [], skipped: [], warned: [] };
  try {
    // Guard: only act in a worktree (not the main repo)
    if (!isGitWorktree(cwd)) return EMPTY;

    const { execSync } = require('child_process');
    const opts = { cwd, stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 };

    // Resolve main repo root from the worktree's git common-dir
    const commonDir = execSync('git rev-parse --git-common-dir', opts).toString().trim();
    const absCommon = path.isAbsolute(commonDir) ? commonDir : path.resolve(cwd, commonDir);
    const mainRoot = path.dirname(absCommon); // <main>/.git → <main>

    const cfg = loadWorktreeSymlinksConfig();
    const created = [], skipped = [], warned = [];

    for (const name of (cfg.symlinks || [])) {
      // Path-traversal / injection guard: reject anything that is not a simple flat name
      if (typeof name !== 'string' || !name || name.includes('/') || name.includes('\\') ||
          name === '..' || name === '.' || name.startsWith('.') || name.includes('\0')) {
        process.stdout.write(`[gd-symlink] WARN: invalid symlink name ${JSON.stringify(name)}; skipping
`);
        warned.push(name); continue;
      }
      const linkPath = path.join(cwd, name);
      const targetPath = path.join(mainRoot, name);

      // Defensive guard: never symlink a tracked path in main repo
      try {
        const { execFileSync } = require('child_process');
        execFileSync('git', ['-C', mainRoot, 'ls-files', '--error-unmatch', '--', name],
          { stdio: 'pipe', timeout: 2000 });
        // Exit 0 = tracked → refuse
        process.stdout.write(`[gd-symlink] WARN: ${name} is tracked in main repo; skipping
`);
        warned.push(name);
        continue;
      } catch (_) { /* non-zero exit = untracked → safe to proceed */ }

      // Idempotency: inspect existing path
      let st;
      try { st = fs.lstatSync(linkPath); } catch (_) { st = null; }

      if (st && st.isSymbolicLink()) {
        let actualTarget;
        try { actualTarget = fs.readlinkSync(linkPath); } catch (_) { actualTarget = null; }
        if (actualTarget !== null) {
          const resolved = path.resolve(path.dirname(linkPath), actualTarget);
          if (resolved === targetPath) { skipped.push(name); continue; }
          process.stdout.write(`[gd-symlink] WARN: ${linkPath} points to ${resolved} (expected ${targetPath}); skipping
`);
          warned.push(name);
          continue;
        }
      }
      if (st) {
        process.stdout.write(`[gd-symlink] WARN: ${linkPath} exists as a real ${st.isDirectory() ? 'directory' : 'file'}; skipping
`);
        warned.push(name);
        continue;
      }

      // Create target in main repo if missing
      if (cfg.createTargetIfMissing && !fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
      }

      fs.symlinkSync(targetPath, linkPath, 'dir');
      created.push(name);
      process.stdout.write(`[gd-symlink] created: ${linkPath} → ${targetPath}
`);
    }

    // Write / refresh lock file
    if (cfg.lockFile && (created.length || skipped.length)) {
      const lockPath = path.join(cwd, '.gd-worktree-symlinks.lock');
      let existing = { created: [] };
      try { existing = JSON.parse(fs.readFileSync(lockPath, 'utf8')); } catch (_) {}
      const allActive = Array.from(new Set([...(existing.created || []), ...created, ...skipped]));
      const tmp = `${lockPath}.tmp.${process.pid}`;
      fs.writeFileSync(tmp, JSON.stringify({
        created: allActive,
        createdAt: existing.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, null, 2));
      fs.renameSync(tmp, lockPath);
    }

    return { created, skipped, warned };
  } catch (e) {
    process.stdout.write(`[gd-symlink] ERROR: ${e.message}; symlink setup skipped
`);
    return EMPTY;
  }
}

/**
 * Auto-cleanup managed worktree symlinks and remove the worktree on session exit.
 *
 * Safety contract (applied in order):
 *   1. No-op if cwd is not a git worktree.
 *   2. No-op if <cwd>/.gd-worktree-symlinks.lock is absent (we didn't manage it).
 *   3. Abort if uncommitted changes — user keeps work; next exit retries.
 *   4. Unlink each symlink atomically via fs.unlinkSync (never rm -rf); verify main target intact.
 *   5. Remove worktree via `git worktree remove` (no --force).
 *   6. Defensive throughout — entire body in try/catch; never throws; exits 0.
 *
 * @param {string} cwd - Working directory (current worktree path).
 * @returns {Promise<{skipped?: string, removed?: boolean, aborted?: boolean|string, unlinked?: string[], error?: string}>}
 */
async function cleanupWorktreeOnExit(cwd) {
  try {
    // Guard 1: must be a worktree
    if (!isGitWorktree(cwd)) return { skipped: 'not a worktree' };

    // Guard 2: must have our lock file
    const lockPath = path.join(cwd, '.gd-worktree-symlinks.lock');
    if (!fs.existsSync(lockPath)) return { skipped: 'no lock file' };

    let lock;
    try { lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')); }
    catch (_) { return { skipped: 'corrupt lock file' }; }
    if (!Array.isArray(lock.created) || lock.created.length === 0) {
      return { skipped: 'empty lock' };
    }

    // Guard 3: no uncommitted changes
    const { execFileSync } = require('child_process');
    let dirty = '';
    try {
      dirty = execFileSync('git', ['-C', cwd, 'status', '--porcelain'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 });
    } catch (e) {
      process.stdout.write(`[gd-cleanup] git status failed in ${cwd}; aborting cleanup\n`);
      return { skipped: 'git status failed' };
    }
    if (dirty.trim().length > 0) {
      process.stdout.write(`[gd-cleanup] WARN: uncommitted changes in ${cwd}; skipping cleanup\n`);
      return { skipped: 'uncommitted changes' };
    }

    // Resolve main repo root from worktree's git common-dir
    const commonDirRaw = execFileSync('git', ['-C', cwd, 'rev-parse', '--git-common-dir'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 2000 }).trim();
    const absCommon = path.isAbsolute(commonDirRaw) ? commonDirRaw : path.resolve(cwd, commonDirRaw);
    const mainRoot = path.dirname(absCommon); // <main>/.git → <main>

    // Guard 4: unlink each symlink atomically + verify main target intact
    const unlinked = [];
    for (const name of lock.created) {
      // Defensive name shape guard (mirrors ensureWorktreeSymlinks)
      if (typeof name !== 'string' || !name || name.includes('/') || name.includes('\\') ||
          name === '..' || name === '.' || name.startsWith('.') || name.includes('\0')) {
        process.stdout.write(`[gd-cleanup] WARN: invalid name in lock ${JSON.stringify(name)}; skipping\n`);
        continue;
      }
      const linkPath = path.join(cwd, name);
      const targetPath = path.join(mainRoot, name);

      let st;
      try { st = fs.lstatSync(linkPath); } catch (_) { st = null; }
      if (!st || !st.isSymbolicLink()) continue; // already gone or not a symlink we own

      try {
        fs.unlinkSync(linkPath);
      } catch (e) {
        process.stdout.write(`[gd-cleanup] ERROR: unlink failed for ${linkPath}: ${e.message}; aborting\n`);
        return { aborted: true, unlinked, reason: e.message };
      }

      // Verify main target is still intact after unlink
      if (!fs.existsSync(targetPath)) {
        process.stdout.write(`[gd-cleanup] CRITICAL: main target ${targetPath} missing after unlink; aborting\n`);
        return { aborted: true, unlinked, reason: 'main target gone' };
      }
      unlinked.push(name);
    }

    // Guard 5: remove worktree via git (no --force)
    try {
      execFileSync('git', ['-C', mainRoot, 'worktree', 'remove', cwd],
        { stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 });
      process.stdout.write(`[gd-cleanup] removed worktree ${cwd} (unlinked: ${unlinked.join(',')})\n`);
      return { removed: true, unlinked };
    } catch (e) {
      const stderr = (e.stderr && e.stderr.toString()) || e.message;
      process.stdout.write(`[gd-cleanup] WARN: git worktree remove failed: ${stderr.trim()}\n`);
      return { aborted: 'git refused', unlinked, stderr };
    }
  } catch (e) {
    process.stdout.write(`[gd-cleanup] unexpected error: ${e.message}\n`);
    return { error: e.message };
  }
}

module.exports = {
  CONFIG_PATH,
  LOCAL_CONFIG_PATH,
  GLOBAL_CONFIG_PATH,
  DEFAULT_CONFIG,
  INVALID_FILENAME_CHARS,
  deepMerge,
  loadConfigFromPath,
  loadConfig,
  normalizePath,
  isAbsolutePath,
  sanitizePath,
  sanitizeSlug,
  sanitizeConfig,
  escapeShellValue,
  writeEnv,
  detectSerena,
  buildSerenaHint,
  isGitWorktree,
  buildWorktreeActivationHint,
  ensureWorktreeSerenaProject,
  ensureWorktreeSymlinks,
  cleanupWorktreeOnExit,
  loadWorktreeSymlinksConfig,
  sniffYamlLanguages,
  getSessionTempPath,
  readSessionState,
  writeSessionState,
  resolvePlanPath,
  extractSlugFromBranch,
  findMostRecentPlan,
  getReportsPath,
  formatIssueId,
  extractIssueFromBranch,
  formatDate,
  validateNamingPattern,
  resolveNamingPattern,
  getGitBranch
};
