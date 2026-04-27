# Changelog

## [Unreleased]

### Added

- Model tier policy system — `plugins/glassdesk/config/models.yml` + `bin/sync-models`
- 4 tiers: `premium` (opus), `standard` (sonnet), `fast` (haiku), `external` (sonnet fallback + gemini-2.5-flash CLI)
- All agents declare `tier:` in frontmatter; `model:` is auto-synced from tier mapping
- New `git-manager` agent (fast tier — haiku) handling `/git:cm`, `/git:cp`, `/git:pr` workflows. Resolves dangling reference where `/git:cm` and `/git:cp` referenced a non-existent agent
- Optional pre-commit drift guard via `scripts/install-dev-hooks.sh` (zero deps, opt-in)
- README "Model Tier Policy" section documenting tier system and override path

### Changed

- `code-simplifier` agent: model `opus` → `sonnet` (standard tier — coding work, opus overkill)
- `comment-analyzer`, `pr-test-analyzer`, `silent-failure-hunter`, `type-design-analyzer`, `docs-manager`: explicit `model:` set per tier (previously `model: inherit` or `haiku` defaulting to session model)
- `scout-external` agent: model `haiku` → `sonnet` (external tier fallback for when Gemini CLI absent)
- `silent-failure-hunter`, `type-design-analyzer`: promoted to opus (premium tier — design/correctness judgment)
- `/git:pr` command: thinned to delegate to `git-manager` agent (was running entirely in main thread → now haiku via subagent dispatch)

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
