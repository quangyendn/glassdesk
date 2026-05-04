# Changelog

## [0.4.0] — 2026-04-30

### Added

- **Serena MCP integration** — SessionStart hook (`hooks/session-init.cjs`) detects whether Serena plugin is enabled. Sets `GD_SERENA_AVAILABLE=1|0` env var via `CLAUDE_ENV_FILE`. Detection chain: `~/.claude/settings.json` `enabledPlugins` (loose match `/^serena@/`) → `claude plugin list --json` (3s timeout) → assume false. Defensive throughout — never throws, never blocks session start. Happy-path latency <70ms.
- **Install hint** — when Serena is absent, hook prints a 5-line install hint to stdout (auto-injected as session context). Mentions one-time per-project onboarding caveat.
- **Tool-preference reference** — `docs/serena-preference.md` is the single source of truth for built-in vs Serena tool routing. Documents the nested namespace `mcp__plugin_serena_serena__*` as primary form (marketplace install) and the flat `mcp__serena__*` as fallback (manual install). Includes 9-row tool mapping table, source-code extension whitelist (16 entries), and language-coverage gaps (`.svelte`, `.astro`, `.erb`, `.slim`, `.haml` → built-in territory).
- **Skill instructions** — `scouting`, `building`, `fixing`, `debugging`, `planning` SKILL.md now carry an identical "## Tool Preference" block routing code work to Serena when available, falling back to built-in otherwise.
- **Command notes** — `/scout`, `/code`, `/fix`, `/debug`, `/plan` and code-related variants (`/scout:ext`, `/code:auto`, `/fix:hard`, `/plan:hard`) carry an identical 1-line tool-preference note. Plan-metadata commands (`/plan:list`, `/plan:status`, `/plan:archive`, `/plan:validate`) are not modified.

### Notes

- Serena is **not** a hard dependency. Plugin works clean without it; no commands break.
- First use per project: Serena requires a one-time `onboarding` task — user-triggered, never auto. ~30k–80k tokens for ~1000-file repos.
- Non-code skills (`wiki`, `brainstorming`, `compounding`, `media-processing`, `ai-multimodal`, `pair-programming`, `code-review`) are intentionally untouched — they operate on `.md`/`.json`/media where Serena is irrelevant.
- The optional `hooks/serena-enforce.cjs.example` artifact considered during planning was DROPPED — users with the global `~/.claude/hooks/enforce-serena.sh` would double-block.
- Validation A/B (≥40% token reduction on `/scout`) deferred to follow-up — instrumentation is in place; runtime measurement requires toggling Serena on/off and recording in `validation-results.md`.

## [Unreleased]

### Fixed

- **Hook command relative-path failure (`loader:1404` MODULE_NOT_FOUND)** — `templates/settings.local.json` previously hardcoded `node .claude/hooks/{session-init,dev-rules-reminder}.cjs` (relative). When Claude Code spawned the hook from a CWD ≠ project root (subdirectory launch, nested `.claude/` collisions, e.g. `<root>/app/.claude/`), Node failed with `MODULE_NOT_FOUND` at `cjs/loader:1404`. Template now uses `node "${CLAUDE_PROJECT_DIR:-$PWD}/.claude/hooks/..."` — env var (always set for hook processes) with `$PWD` fallback. `bin/cli.js` now exports `purgeStaleGlassdeskHooks()` and runs it during merge so `npx glassdesk update` strips legacy entries instead of stacking duplicates.
- **`$GD_PLUGIN_PATH` resolution in subagents** — `npx glassdesk init/update` now rewrites the literal `$GD_PLUGIN_PATH` token in copied `.md` files to project-relative `.claude/...` paths. Resolves Claude Code bug #46696 where subagents do not inherit `CLAUDE_ENV_FILE` env vars, causing `node "$GD_PLUGIN_PATH/scripts/..."` calls to fail silently inside `/plan`, `/plan:hard`, planning skill subagent dispatches. Project-relative path works because Claude Code spawns Bash with `cwd=project root` in both main session and subagents. (Considered `${CLAUDE_PROJECT_DIR}` but empirically not exported to Bash by Claude Code 2.1.x despite docs.)
- **Dual-install collision** — `session-init.cjs` SessionStart hook now uses first-writer-wins for `GD_PLUGIN_PATH`. When both marketplace plugin + npx install register a SessionStart hook, the env var is no longer silently overwritten last-writer-wins. `GD_SESSION_ID` continues to regenerate every session.
- Marketplace bundle (`plugins/glassdesk/**/*.md`) is intentionally NOT modified — runtime `$GD_PLUGIN_PATH` still works in marketplace install path. Rewrite only applies to npx-installed copies.

### Added

- **Worktree symlinks — SessionStart auto-links `plans/`** — `session-init.cjs` now calls `ensureWorktreeSymlinks` (new helper in `hooks/lib/gd-config-utils.cjs`) on every session start inside a git worktree. Creates `<worktree>/plans → <main-repo>/plans` symlink idempotently; skips if path is already tracked by git. Config override via `.claude/worktree-symlinks.json` (default: `{"symlinks":["plans"],"createTargetIfMissing":true,"lockFile":true}`). Lock file at `<worktree>/.gd-worktree-symlinks.lock` records active symlinks.

- **`gd-implementer` agent** — new standard-tier (Sonnet) subagent that owns Step 2 (Implementation) in the `building` skill dispatch chain. Reads a phase file, performs all source-code edits, runs the declared type-check, and returns a structured `Implementation Summary` the orchestrator gates on. Tests are never run by this agent — `gd-tester` owns Step 3. Supports multi-stack type-checking (`ts`, `rust`, `ruby`, `python`, `go`) with optional parallel execution via `typecheck_parallel_safe: true` in phase frontmatter.
- **`building` skill — mandatory dispatch contract** — `SKILL.md` now enforces that the main thread MUST dispatch `gd-implementer` for Step 2 and MUST NOT edit source files directly. If `gd-implementer` is unavailable (ghost-agent), execution stops rather than silently falling back to main-thread edits. Mirrors the orchestrate-only pattern from the `planning` skill to avoid premium-tier (Opus) token spend on first-draft edits.
- **Reference doc `references/execution-gates.md`** — canonical Mandatory Subagents table, Step Output Format spec, and Step 2 Failure Escalation rules (1-retry cap → `gd-debugger` escalation).
- **Reference doc `references/test-driven-loop.md`** — formalizes the Step 2 / Step 3 boundary: `gd-implementer` first-draft + type-check only; `gd-tester` owns runtime tests; `gd-debugger` owns root-cause on test failure.

- **Wiki Recall in DISCOVERY skills** — `brainstorming`, `planning`, and `scouting` SKILL.md files now open with a Step 0 Wiki Recall: query `.gd-wiki/` for prior decisions, patterns, and insights before beginning new work. Reference doc at `skills/wiki/references/recall.md`. `compounding.md` wiki page updated with a Read/Write Loop section explaining the recall ↔ learn cycle.
- Model tier policy system — `plugins/glassdesk/config/models.yml` + `bin/sync-models`
- 4 tiers: `premium` (opus), `standard` (sonnet), `fast` (haiku), `external` (sonnet fallback + gemini-2.5-flash CLI)
- All agents declare `tier:` in frontmatter; `model:` is auto-synced from tier mapping
- New `git-manager` agent (fast tier — haiku) handling `/git:cm`, `/git:cp`, `/git:pr` workflows. Resolves dangling reference where `/git:cm` and `/git:cp` referenced a non-existent agent
- Optional pre-commit drift guard via `scripts/install-dev-hooks.sh` (zero deps, opt-in)
- README "Model Tier Policy" section documenting tier system and override path
- 4 GHOST agents resolved — created `debugger` (premium), `planner` (premium), `project-manager` (standard), `tester` (standard). These were referenced by `building`, `fixing`, and `planning` skills but missing from `agents/`, causing silent fallback to general-purpose. Now route through tier policy correctly. Agent count: 11 → 15.
- `planning` skill: main thread now orchestrate-only when `planner` agent is dispatched, avoiding 2x premium-tier token spend (orchestrator + planner)
- 2 new agents for trivial-command thinning: `plan-archiver` (fast — haiku) and `ui-tester` (standard — sonnet). Agent count: 15 → 17.
- 2 zero-LLM Bash scripts: `bin/plan-list` and `bin/plan-status` (Node.js ESM, no deps). Replace LLM-driven `/plan:list` and `/plan:status` with mechanical formatters.
- 4 commands thinned to delegation: `/plan:list` and `/plan:status` (Bash-only via the new scripts), `/plan:archive` (fast tier via `plan-archiver`), `/test:ui` (standard tier via `ui-tester`). Each command body now ≤15 lines vs previous 30-90.
- `/plan:archive` default behavior changed: when no path arg given, archive ONLY plans with `status=done|completed` in frontmatter. In-progress plans get a WARN and are skipped. Pass an explicit path to archive in-progress plans.
- **SessionEnd auto-cleanup** — replaces the former `/worktree:remove` slash command. A new `SessionEnd` hook (`hooks/session-end.cjs`) calls `cleanupWorktreeOnExit` (new helper in `hooks/lib/gd-config-utils.cjs`) on every Claude session exit. Guards applied in order: (1) no-op if CWD is not a git worktree; (2) no-op if `.gd-worktree-symlinks.lock` is absent; (3) skip with a warning if uncommitted changes exist — user keeps work, cleanup retries on next exit; (4) unlink each symlink via `fs.unlinkSync` (never `rm -rf`) and verify main-repo target is intact; (5) remove worktree via `git worktree remove` (no `--force`). Registered in `.claude/settings.local.json` under `"SessionEnd"`. Note: event key `SessionEnd` used per plugin convention; if it does not fire, adjust to `Stop` in settings.

### Changed

- `code-simplifier` agent: model `opus` → `sonnet` (standard tier — coding work, opus overkill)
- `comment-analyzer`, `pr-test-analyzer`, `silent-failure-hunter`, `type-design-analyzer`, `docs-manager`: explicit `model:` set per tier (previously `model: inherit` or `haiku` defaulting to session model)
- `scout-external` agent: model `haiku` → `sonnet` (external tier fallback for when Gemini CLI absent)
- `silent-failure-hunter`, `type-design-analyzer`: promoted to opus (premium tier — design/correctness judgment)
- `/git:pr` command: thinned to delegate to `git-manager` agent (was running entirely in main thread → now haiku via subagent dispatch)

## [0.3.0] — 2026-04-29

### Added

- **Project Wiki Maintainer feature** — 4 new commands: `/wiki:init`, `/wiki:update`, `/wiki:lint`, `/ask:wiki`
- `wiki` skill with 5 reference docs (maintaining/querying/linting/obsidian-conventions/cost-budget)
- `gd-wiki-curator` agent (Sonnet, scoped to `.gd-wiki/` only) for incremental wiki upkeep on `main` only
- Plugin dependency on `obsidian@obsidian-skills` for page authoring + base index files
- Cross-marketplace dependency allowlist (`obsidian-skills`) in marketplace manifest

### Changed (BREAKING)

- `/learn` now writes ONLY to `.gd-wiki/insights/` (auto-mkdir if missing). `.glassdesk-knowledge/` is no longer read or written
- `/improve` now scans ONLY `.gd-wiki/insights/`. Old `.glassdesk-knowledge/` entries are ignored
- Users on v0.2.x who want to retain prior insights must move them manually:
  ```bash
  mkdir -p .gd-wiki/insights && git mv .glassdesk-knowledge/*.md .gd-wiki/insights/
  ```

### Required CLI

- `qmd` CLI (>=2.1.0) — install via `npm i -g @tobilu/qmd`. First `qmd embed` downloads ~2GB of models machine-wide (one-time)
- `brew install sqlite` recommended on macOS (QMD SQLite extension support)
- `yq` recommended (used by `/wiki:lint` stale-frontmatter check) — `brew install yq`

### Notes

- Cross-marketplace dependency on `obsidian-skills` is whitelisted via `marketplace.json::allowCrossMarketplaceDependenciesOn`. Manual install fallback documented in `docs/quick-start.md` if auto-resolve fails
- Static acceptance: 26/27 spec criteria verified at ship time (smoke walkthrough deferred to user, see `plans/260429-1818-wiki-maintainer/reports/smoke-260429-acceptance.md`)
- Curator boundary post-run check covers BOTH tracked-modified AND untracked files (curator-created paths outside `.gd-wiki/` are `rm`'d, not just `git checkout`'d)

## [0.2.1] - 2026-04-27

### Changed

- Renamed internal env vars from `CK_*` → `GD_*`:
  - `CK_SESSION_ID` → `GD_SESSION_ID`
  - `CK_PLUGIN_PATH` → `GD_PLUGIN_PATH`
  - `CK_DEBUG` → `GD_DEBUG`
- Renamed hook utility: `hooks/lib/ck-config-utils.cjs` → `hooks/lib/gd-config-utils.cjs`
- Renamed temp-file convention: `/tmp/ck-session-{id}.json` → `/tmp/gd-session-{id}.json`
- Updated `ClaudeKit` → `GlassDesk` in code comments

### Migration (required for existing installs)

1. Refresh `.claude/` from updated plugin source:
   ```bash
   npx glassdesk init
   ```
2. **Restart Claude Code session** so new env vars take effect.
3. Optional — clean up legacy temp files:
   ```bash
   rm /tmp/ck-session-*.json 2>/dev/null; true
   ```

### Known issue

`.claude/commands/plan/fast.md` is a locally-customized file with no plugin counterpart. It still references `$CK_PLUGIN_PATH`. If you use this command, manually replace `$CK_PLUGIN_PATH` with `$GD_PLUGIN_PATH` in that file, or delete it and re-run `npx glassdesk init`.

---

## [0.2.0] - 2026-04-27

### Breaking Changes

21 commands removed (see [migration guide](docs/migration-v0.2.md) for full mapping):
- `/plan:fast`, `/plan:two`, `/plan:parallel`, `/plan:ci` — collapsed into `/plan` and `/plan:hard`
- `/code:no-test`, `/code:parallel` — collapsed into `/code` and `/code:auto`
- `/fix:fast`, `/fix:test`, `/fix:logs`, `/fix:types`, `/fix:ui`, `/fix:ci`, `/fix:parallel` — collapsed into `/fix`, `/fix:hard`, `/debug`
- `/git:merge` — use raw `git merge`
- `/docs:init`, `/docs:update` — out of scope (software dev only)
- `/review:codebase` — renamed to `/scout`
- `/write`, `/write:micro`, `/write:pyramid`, `/write:synthesis` — out of scope

### Added

- `/spec` — Formalize a brainstorm into a spec document (`docs/specs/`)
- `/learn` — Extract session insights into knowledge base (`.glassdesk-knowledge/`)
- `/improve` — Propose plugin or project improvements (gated, never auto-applied)
- `compounding` skill with 4 references (session-parsing, insight-extraction, learn-output, improve-proposal)
- `building` skill — phase-by-phase plan execution with verification gates
- `scouting` skill — internal + external codebase exploration
- `fixing` skill — fast fix and test-failure recovery workflows
- `brainstorming` skill — option evaluation, design decisions, spec formalization
- Scripts: `find-current-session.cjs`, `parse-session-insights.cjs`
- Migration script: `bin/migrate-glassdesk-v0.2.sh`

### Changed

- Taxonomy restructured: 40 commands across 9 ad-hoc groups → 23 across 8 SDLC phases (DISCOVER/PLAN/BUILD/VERIFY/REVIEW/SHIP/COMPOUND)
- 5 bloated command files thinned from 799 → ~200 lines total via skill delegation
- All commands ≤30 lines using prose `Activate 'X' skill` delegation
- `writing` skill removed (out of scope)

### Fixed

- `fix.md` test-failure branch lacked early-exit guard when tests pass on first run

## [0.1.0] - 2026-04-27

Initial release — scaffold with 40 commands.
