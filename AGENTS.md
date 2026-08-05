# AGENTS.md

Guidance for non-Claude coding agents (Codex, opencode, Antigravity, and
similar) working in this repository.

Claude Code reads `CLAUDE.md` instead. That file catalogues the slash commands
and skills this repo *ships* — features of the published plugin, not commands
available to you. This file describes the repository as a codebase.

## What this repository is

`glassdesk` is a **Claude Code plugin marketplace**, published to npm. It ships
markdown-defined commands, agents, and skills — there is no application runtime.
Almost every "feature" is a markdown file plus, occasionally, a zero-dependency
Node script.

Two consumers, one source tree:

| Consumer | Install | Root at runtime |
|---|---|---|
| Marketplace plugin | `claude plugin install glassdesk` | `plugins/glassdesk/` |
| npx installer | `npx glassdesk init` | `<project>/.claude/` |

`bin/cli.js` copies `plugins/glassdesk/**` into `<project>/.claude/` and rewrites
`$GD_PLUGIN_PATH` → `.claude` in every copied `.md`. **Anything you add under
`plugins/glassdesk/` must work in both layouts.** Never reference
`${CLAUDE_PLUGIN_ROOT}` in markdown — use `${GD_PLUGIN_PATH}`. Scripts should
resolve siblings from their own location (`path.resolve(__dirname, '../config')`),
which is layout-independent because `bin/` and `config/` are siblings in both.

## Layout

```
plugins/glassdesk/        the plugin (this is where feature work lands)
  agents/                 gd-*.agent.md — subagent definitions
  commands/               slash commands; commands/x.md → /x, commands/x/y.md → /x:y
  skills/<name>/SKILL.md  skills, with optional references/*.md
  hooks/                  SessionStart / UserPromptSubmit hooks (.cjs) + hooks.json
  config/models.yml       tier → model + effort policy
  bin/                    plugin-scoped scripts (sync-models, plan-list, plan-status)
  docs/, CHANGELOG.md
plugins/ccaudit/          second, much smaller plugin
bin/cli.js                the `glassdesk` npm binary (init / update)
scripts/guardrails/       secret + PII scanners run by git hooks
tests/                    node --test suites
website/                  Astro docs site (independent; has its own deps)
.gd-wiki/                 project knowledge vault (decisions, features, insights)
```

Gitignored working directories — do not commit into them, and do not assume
another agent can see them: `plans/`, `docs/specs/`.

## Commands

```bash
npm test                    # node --test tests/**/*.test.js
npm run validate            # claude plugin validate .
npm run guardrails:scan     # personal-info / secret scan
npm run pack:check          # npm pack --dry-run
node plugins/glassdesk/bin/sync-models --check   # agent frontmatter drift guard
```

There is no build step, no linter, and no type checker. `npm test` and
`sync-models --check` are the whole gate.

## Conventions that are enforced

**Commit messages must be English and Conventional Commits.** `commitlint` plus
`scripts/guardrails/lint-commit-msg.js` enforce both; Vietnamese text is blocked
outright (`.guardrails.json` → `commitMessage.blockVietnamese`). Do not add
`Co-Authored-By` trailers.

**Pre-commit** runs `gitleaks protect --staged` and
`scripts/guardrails/scan-personal-info.js --staged`. **Pre-push** runs
`gitleaks detect` over the commit range. Both fail closed. Never write an
absolute `/Users/<name>/...` path into a tracked file — the scanner rejects it.
Shared secret/PII patterns live in `scripts/guardrails/lib/patterns.js`; reuse
them rather than writing new regexes.

**Agent frontmatter is generated, not hand-written.** An agent file declares
`tier:`; `plugins/glassdesk/bin/sync-models` derives `model:` and `effort:` from
`plugins/glassdesk/config/models.yml`. Edit the tier or the policy file, then run
`sync-models`. Hand-editing `model:`/`effort:` will be reverted and the
pre-commit drift guard will fail.

**Agent files are `gd-<name>.agent.md`.** The `gd-` prefix namespaces them
against user-defined agents. See `.gd-wiki/decisions/agent-naming-standardization.md`.

**Plugins use a flat structure.** `plugins/<name>/commands/`, not
`plugins/<name>/.claude/commands/`. The extra `.claude` wrapper double-nests at
install time and breaks command discovery.

**Changelog.** User-visible plugin changes go in `plugins/glassdesk/CHANGELOG.md`
under `## [Unreleased]`. `npm run guardrails:changelog` blocks publishing a
version the changelog does not mention.

## Codex-specific notes

`.codex/hooks.json` registers two hooks from `plugins/glassdesk/hooks/`. Verified
against `codex-cli` 0.144.1:

- **`SessionStart` → `session-init.cjs` runs and writes session state** to
  `$TMPDIR/gd-session-<id>.json`.
- **It cannot export environment variables.** The script sets `GD_SESSION_ID` and
  `GD_PLUGIN_PATH` by writing to `$CLAUDE_ENV_FILE`, which Codex does not
  provide. Downstream scripts that read those variables fall back to defaults.
- **`UserPromptSubmit` → `dev-rules-reminder.cjs` runs, but its output does not
  reach the model.** It writes plain text to stdout, which Claude Code injects as
  context; Codex expects a JSON `hookSpecificOutput.additionalContext` envelope
  instead. Emitting that envelope — which Claude Code also accepts — is a known
  follow-up.

Treat the project rules in this file as authoritative; do not rely on the hook to
deliver them.

## Working style

- YAGNI, KISS, DRY. Check for an existing module before adding one.
- File names are kebab-case and descriptive. Long is fine — names are how agents
  find things with grep and glob.
- Use the `gh` CLI for GitHub operations.
- Reports go in `plans/reports/`, plans in `plans/`, docs in `docs/`. Do not
  scatter markdown elsewhere unless asked.
