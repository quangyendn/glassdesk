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

A project can end up with both at once. `bin/cli.js` copies `plugins/glassdesk/**`
into `<project>/.claude/` and rewrites `$GD_PLUGIN_PATH` → `.claude` in every
copied `.md`. **Anything you add under
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
  hooks/                  session-init / dev-rules-reminder / session-end (.cjs);
                          hooks.json is the manifest for marketplace + Codex
                          installs — npx installs use templates/settings.local.json
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
npm test                    # node --test "tests/**/*.test.js" — 108 tests
npm run validate            # claude plugin validate .
npm run guardrails:scan     # personal-info / secret scan
npm run guardrails:changelog  # blocks publishing a version the changelog omits
npm run pack:check          # npm pack --dry-run
node plugins/glassdesk/bin/sync-models --check   # agent frontmatter drift guard
```

There is no build step, no linter, and no type checker for the repo itself —
`npm test` and `sync-models --check` are the whole gate. `website/` is the one
exception: it is an Astro project with its own dependencies and its own build.

The `test` script quotes its glob (`node --test "tests/**/*.test.js"`) so Node
expands it. Unquoted, `sh` collapses `**` to `*`, which silently matches only
`tests/guardrails/` and skips the three top-level suites — 32 tests instead of
108. Keep the quotes.

## Conventions that are enforced

**Commit messages must be English and Conventional Commits.** `commitlint` plus
`scripts/guardrails/lint-commit-msg.js` enforce the Conventional Commits subject.
English is policy; what is actually automated is a Vietnamese-diacritic check
(`.guardrails.json` → `commitMessage.blockVietnamese`), so unaccented Vietnamese
slips through the guard and still violates the rule. Do not add `Co-Authored-By`
trailers.

**Pre-commit** runs `gitleaks protect --staged` and
`scripts/guardrails/scan-personal-info.js --staged`. **Pre-push** runs
`gitleaks detect` over the commit range. Both fail closed. Never write an
absolute `/Users/<name>/...` path into a tracked file — the scanner rejects it.
Shared secret/PII patterns live in `scripts/guardrails/lib/patterns.js`; reuse
them rather than writing new regexes.

**Agent frontmatter is generated, not hand-written.** An agent file declares
`tier:`; `plugins/glassdesk/bin/sync-models` derives `model:` and `effort:` from
`plugins/glassdesk/config/models.yml`. Edit the tier or the policy file, then run
`sync-models`; hand-edited `model:`/`effort:` values are overwritten on the next
sync. This one is **not** enforced on commit — `.husky/pre-commit` runs only
gitleaks and the PII scanner, and `plugins/glassdesk/scripts/pre-commit-hook.sh`
installs into `.git/hooks`, which `core.hooksPath=.husky/_` bypasses. Run
`node plugins/glassdesk/bin/sync-models --check` yourself before committing agent
changes.

**Agent files are `gd-<name>.agent.md`.** The `gd-` prefix namespaces them
against user-defined agents. See `.gd-wiki/decisions/agent-naming-standardization.md`.

**Plugins use a flat structure.** `plugins/<name>/commands/`, not
`plugins/<name>/.claude/commands/`. The extra `.claude` wrapper double-nests at
install time and breaks command discovery.

**Changelog.** User-visible plugin changes go in `plugins/glassdesk/CHANGELOG.md`
under `## [Unreleased]`. `npm run guardrails:changelog` blocks publishing a
version the changelog does not mention.

## Codex-specific notes

Measured against `codex-cli` 0.144.1.

**Codex loads hooks from the plugin, not from the project.** A `.codex/hooks.json`
at the repository root is not a discovery path — a probe registering `SessionStart`
and `UserPromptSubmit` handlers there produced no side effects at all. What Codex
actually reads is `plugins/glassdesk/hooks/hooks.json`, via the plugin installed
from the `glassdesk-marketplace` entry in `~/.codex/config.toml`. Codex expands
`${CLAUDE_PLUGIN_ROOT}`, so that one manifest serves Claude Code and Codex alike.
Register new hooks there; do not reintroduce `.codex/hooks.json`.

**Each hook event is trust-gated.** `~/.codex/config.toml` carries one
`[hooks.state."<plugin>@<marketplace>:hooks/hooks.json:<event>:0:0"]` block per
event with a `trusted_hash`. Adding an event, or editing the command of an existing
one, invalidates the hash — Codex then skips that hook silently until it is
approved once in an interactive session. `codex exec` cannot grant that approval,
so a newly added hook will appear to do nothing under `codex exec` alone.

**`SessionStart` → `session-init.cjs` runs** and writes session state to
`$TMPDIR/gd-session-<id>.json`.

**It cannot export environment variables.** The script sets `GD_SESSION_ID` and
`GD_PLUGIN_PATH` by writing to `$CLAUDE_ENV_FILE`, which Codex does not provide.
Downstream scripts that read those variables fall back to defaults — in particular
`dev-rules-reminder.cjs` resolves the active plan by git branch rather than by
session.

**Hooks can fire twice under a dual install.** The marketplace plugin registers
them from `hooks/hooks.json` and `npx glassdesk init` registers the same scripts
from `.claude/settings.local.json`; Claude Code keeps plugin and project handlers
separate and runs both. `session-init.cjs` handles this with first-writer-wins on
`GD_PLUGIN_PATH`, and `dev-rules-reminder.cjs` with a per-prompt lock file in
`$TMPDIR` so only one copy emits context — which works only while both copies
carry the guard, so an upgrade-skewed install still double-injects. Preserve
those guards when editing either script.

**`UserPromptSubmit` → `dev-rules-reminder.cjs`** emits a JSON
`hookSpecificOutput.additionalContext` envelope. Claude Code accepts both that and
bare stdout; Codex injects only the envelope. Pending its first trust approval,
treat the project rules in this file as authoritative rather than relying on the
hook to deliver them.

**`SessionEnd` is deliberately not registered for Codex.** `session-end.cjs` runs
`git worktree remove` on glassdesk-managed worktrees; that side effect has only
been validated under Claude Code.

## Working style

- YAGNI, KISS, DRY. Check for an existing module before adding one.
- File names are kebab-case and descriptive. Long is fine — names are how agents
  find things with grep and glob.
- Use the `gh` CLI for GitHub operations.
- Reports go in `plans/reports/`, plans in `plans/`, docs in `docs/`. Do not
  scatter markdown elsewhere unless asked.
