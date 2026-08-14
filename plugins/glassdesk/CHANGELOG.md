# Changelog

## [Unreleased]

### Fixed

- **The plugin no longer declares plugin dependencies — declaring any made Claude Code Desktop drop glassdesk entirely.** Desktop does not hand the CLI an installed-plugin registry; it passes each enabled plugin as `--plugin-dir <path>` (verified in the session's process arguments). On that path dependency resolution has nothing to resolve against, and the loader discards the whole plugin — silently: no error in `main.log`, no entry in the session's skill list, and every `/glassdesk:*` command answering `Unknown command`. `claude plugin list` still reported `✔ enabled` and `claude plugin details glassdesk` still listed all 41 skills, because both read the install registry rather than what the session loaded.

  Isolated on Claude Code 2.1.229 by A/B/A against one copy of the 0.6.0 bundle, changing only `.claude-plugin/plugin.json` and asking a headless `--print` session to list its skills:

  | `dependencies` | glassdesk skills visible |
  |---|---|
  | `[{ "name": "obsidian", "marketplace": "obsidian-skills" }]` | 0 |
  | key removed | 4/4 probed |
  | `[]` | 4/4 probed |

  An empty array loads fine, so this is resolution failing, not the key being rejected. A control run with the same harness on `codex@openai-codex` (no dependencies) loaded its skills normally, ruling out the probe itself.

  `obsidian@obsidian-skills` is now an ordinary documented prerequisite of the wiki commands — install it yourself, see quick-start. `marketplace.json::allowCrossMarketplaceDependenciesOn` stays as-is so the dependency can be restored in one line once Desktop resolves dependencies on the `--plugin-dir` path.

## [0.6.0] — 2026-08-14

### Changed — BREAKING

- **`commands/` is now flat; every namespaced command renamed `ns:sub` → `ns-sub`** — `/plan:hard` → `/plan-hard`, `/git:cm` → `/git-cm`, `/wiki:init` → `/wiki-init`, and so on for all 17 previously nested commands. Root cause: the Claude Code Desktop plugin scanner builds legacy command names from the file **basename only**, discarding the parent directory (the `skills/` branch uses `componentPath`, the `commands/` branch does not). Consequences on 0.5.1: `commands/plan/hard.md` registered as `/glassdesk:hard`, not `/glassdesk:plan:hard`, so the name shown in autocomplete (built from `location.componentPath`) was not the name the dispatcher held — typing it returned Unknown. Worse, the scanner does not dedupe on that branch: `plan/hard.md` and `fix/hard.md` both registered as `hard`, `review/pr.md` and `git/pr.md` both as `pr`, with no error and no defined winner. Flat kebab names are stable in both Desktop and CLI.
- **`/wiki` renamed to `/wiki-run`** — Desktop drops any command whose name matches a `skills/` entry; `skills/wiki` won, and `main.log` recorded `Skipping legacy command "glassdesk:wiki" — name collides with skills/ entry` on every startup. The command was simply absent. No other command basename collides with a skill directory.
- **npx install: `commands/plan.md` now copies to `commands/plan-fast.md`** (was `commands/plan/fast.md`), and the copied-markdown rewrite maps bare `/plan` → `/plan-fast` (was `/plan:fast`). Rationale for the rename itself is unchanged — the built-in `/plan` shadows a project-scope `/plan`.

### Added

- **Stale-file purge on `npx glassdesk update`** — the installer now deletes files listed in the previous `.claude/.glassdesk.json` manifest that the new bundle no longer ships, and prunes directories emptied by that deletion. Without it, upgrading past this release would leave `.claude/commands/plan/hard.md` on disk as a ghost `/hard` command. Only manifest-tracked paths are touched; files added by the user are never removed.
- **Two bundle invariants enforced in tests** — `commands/` must contain no subdirectories, and no command basename may equal a `skills/` directory name.

### Migration

See `docs/migration-v0.6.md` for the full old → new name table. Marketplace installs: update the plugin, then restart Claude Code. npx installs: run `npx glassdesk update` once.

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
- Non-code skills (`wiki`, `brainstorming`, `compounding`, `media-processing`, `ai-multimodal`, `code-review`) are intentionally untouched — they operate on `.md`/`.json`/media where Serena is irrelevant.
- The optional `hooks/serena-enforce.cjs.example` artifact considered during planning was DROPPED — users with the global `~/.claude/hooks/enforce-serena.sh` would double-block.
- Validation A/B (≥40% token reduction on `/scout`) deferred to follow-up — instrumentation is in place; runtime measurement requires toggling Serena on/off and recording in `validation-results.md`.

## [Unreleased]

### Added

- **`UserPromptSubmit` registered in `hooks/hooks.json`** — marketplace installs (Claude Code and Codex alike) now get `dev-rules-reminder.cjs`, which previously only ran for `npx glassdesk init` installs via `templates/settings.local.json`. Under Codex the hook needs a one-time trust approval in an interactive session before it fires.
- **`AGENTS.md`** — repository guide for non-Claude coding agents, documenting the dual-install layout, the conventions git hooks actually enforce, and measured Codex hook behavior (`codex-cli` 0.144.1).
- **Effort enforcement in tier policy** — `config/models.yml` tiers now declare `effort:` alongside `model:` (balanced policy: `deep` = `xhigh`, `premium` = `high`, `standard` = `medium`, `light`/`external` = `low`; haiku-backed `fast` omits effort since Haiku doesn't support it). `bin/sync-models` syncs both `model:` and `effort:` frontmatter fields, validates effort values, removes stray `effort:` from agents whose tier defines none, and the pre-commit drift guard covers both fields.
- **New tiers `deep` (opus/xhigh), `thorough` (sonnet/high), and `light` (sonnet/low)** — `gd-debugger` moves `premium` → `deep`; `gd-rust-reviewer` moves `standard` → `thorough`; `gd-comment-analyzer` and `gd-project-manager` move `standard` → `light`.
- **External delegate agent** — `gd-external-delegate` is now the single governed path from Claude Code to a non-Claude provider (Codex, OpenCode, Antigravity, Kimi, DeepSeek, local OpenAI-compatible). Providers are entries in `config/external-providers.json`, not subagents; specialisations are markdown profiles in `config/specialists/`, not subagents. Adding a provider of an existing type is a registry edit with no code change.

  Policy is enforced in `bin/external-ai.mjs`, a zero-dependency Node dispatcher, rather than prompted: availability, authentication, privacy classification, a path deny list, a secret content sweep, a byte cap, and a hard timeout. Exit codes are the contract — `0` success, `1` the provider ran and failed with its own status (the true value is preserved in `envelope.exit_code`), `10` unavailable, `11` auth, `12` unsupported, `13` privacy, `14` timeout, `20` dispatcher failure. Every gate fails closed, and a denied path aborts the run instead of being dropped, because a silent drop would make the agent believe context was sent that was not.

  The dispatcher does not interpret provider output. It returns raw text inside an `external-ai-run-v1` metadata envelope, and the agent normalises and verifies it — judging a finding's severity needs a model, not a shell script. Provider output is treated as data and never as instruction: it may not change the provider, mode, privacy classification or file scope, and every file, line, command and API it cites is checked against the local repository before being reported as fact.

  Three permission modes ship: `advisory` (context only), `repository-read`, and `patch-proposal` (unified diff, never applied). `isolated-write` is deliberately out of scope.

  Four further protections came out of external review of the branch. **The child's environment is allowlisted, not inherited** — `...process.env` handed every credential in the Claude Code session to every spawned provider, and a provider with shell tooling can read its own environment even under a read-only sandbox, so those values left the machine unscanned and unredacted on every run; `buildChildEnv` now copies only what a provider needs to run plus whatever the registry names in `env_passthrough`. **The local-only claim is verified, not trusted** — `local-openai` is the only entry allowed to receive `restricted` data, and it earns that from a registry label while its URL comes from `LOCAL_OPENAI_BASE_URL`, so `gateEndpoint` refuses the run unless that URL's host is loopback. **The deny list now holds at the directory boundary** — in the repository-visible modes the provider is handed `scope.root` and reads it itself, so deny-listing only `scope.files` left an undeclared `.env` one `cat` away while `context_sent` never named it; `gateRepositoryExposure` sweeps the tree first and aborts, and `context_sent.repository_root` now records when a directory was exposed at all. **The hard timeout is now hard** — `spawnSync` sent a signal and then kept waiting, so a provider that traps `SIGTERM` (or leaves a descendant holding the pipes) outlived the timeout it was given; `runCli` is async, spawns into its own process group, and escalates `SIGTERM` → `SIGKILL`.

  A second review round closed five more. **Symlinks are resolved during the repository sweep** — `Dirent` reports a link as neither file nor directory, so a link named `notes.txt` pointing at `.env`, into a skipped directory, or outside the root walked past the sweep untouched and would then be followed by the provider; both the link's name and its resolved target are now checked, and an unresolvable link aborts the run. **A timed-out run no longer settles with its process group alive** — the leader can exit on SIGTERM while a descendant that traps it survives, and if that descendant redirected the inherited stdio, `close` fired at once and cancelled the pending SIGKILL; the final kill is now delivered before the run resolves. **`scope.files` must be an array** — a string was iterated character by character, turning one declared path into a dozen unrelated ones. **An explicitly empty flag value is refused** rather than folded into "absent": `--output ""` used to spawn the provider and then print to stdout. **HTTP response bodies are capped at 64 MB**, the same ceiling as CLI stdout, and read incrementally rather than buffered whole.

  A third round found two usability defects and five correctness gaps. **`kimi` and `deepseek` now come up on their API key alone** — probing ignored the shipped `endpoint_defaults.base_url`, so a user who followed the documented setup got exit 10 from providers that would have worked; a local-only entry still needs its base URL exported explicitly, since it has no key to gate on. **A Windows `.cmd` shim is launched through Node's batch-aware path** rather than spawned bare, which cannot work — untested, no Windows machine was available. **The repository sweep fails closed on a non-permission readdir error**: `EACCES`/`EPERM` is still skipped, since the provider runs as the same user, but an `EMFILE` or `EIO` means the sweep failed rather than that the subtree is unreachable. **The byte cap is now applied to the rendered prompt as well as the inputs**, because the specialist profile, mode contract, headings and fences are not in the input sum. **Repository-visible modes no longer bill unsent file contents to the cap** — those modes send paths, not contents. **`expected_output` reaches the provider**; it was a documented envelope field that `buildPrompt` silently dropped, and it now passes the same secret sweep as every other free-text field. **stderr is redacted before its tail is taken**, so a credential straddling the 4000-character boundary cannot leave a fragment the exact-match redactor no longer recognises.

  A verification round found no remaining critical issues and two last gaps, both closed. **A specialist profile is refused outside its declared `use_for` task types** — the list was parsed and carried but never enforced, so `code-reviewer` could be prepended to a debugging task. **Declared paths are swept, not just file contents** — a path travels into the prompt and into `context_sent`, so an artifact named after the key that produced it leaked that key while its contents scanned clean. **The specialist profile is swept for secrets** — it comes from disk rather than the task envelope, so it reached the provider at the top of every prompt without passing the preflight that covers all other sent text. **Declared files are bounded from their metadata before being read** — the cap was checked after `readFileSync`, so a multi-gigabyte log named in `scope.files` was fully resident before anything objected; `advisory` now refuses it from `stat`, and a repository-visible mode skips the read entirely (its contents are never sent) and records `scanned: false` rather than reporting a clean scan that never ran.

  Two claims were corrected rather than fixed, because the code cannot back them. `advisory` bounds what the dispatcher **sends**, not what a provider can read — `codex --sandbox read-only` restricts writes, not reads, and a CLI given an absolute path can still open it. And the repository sweep skips `.git`, `node_modules` and build output, so it is a check, not a proof. Both limits are stated in `docs/external-delegation.md` and in the agent's own instructions.

- **OpenCode re-adopted as a provider** — measured against `opencode` 1.15.6. It runs headless with **zero credentials** on three free models and permits file reads without a dangerous flag. Three failure modes are handled in the registry's invoke template because each is silent: a denied write can hang past 2 m 30 s (mitigated by `--agent plan` plus a hard timeout); without `--pure` it loads the user's global MCP servers and will attempt to route around a write denial through them; and it spawns its own subagents unless `permission.task` is denied. `OPENCODE_DISABLE_PROJECT_CONFIG=1` stops a repo-local `opencode.json` from overriding any of it.

### Changed

- **`dev-rules-reminder.cjs` emits a JSON `hookSpecificOutput.additionalContext` envelope** instead of bare stdout. Claude Code accepts both forms; Codex injects only the envelope and discards plain stdout.
- **Corrected the stale OpenCode claim** — `skills/scouting/references/external-tools.md` and the 0.4.0 changelog entry stated OpenCode was dropped because its model no longer resolves. Only half true: `opencode/grok-code` is gone, but the CLI works and now ships three zero-auth free models. The scouting reference is corrected and now points non-scout external work at `gd-external-delegate`. `/scout:ext` keeps its direct `agy` path — a high-volume parallel dispatch whose latency budget does not suit a per-call policy gate.
- **External scouting migrated from Gemini CLI to Antigravity CLI (`agy`)** — Google retired Gemini CLI's free OAuth tier on 2026-06-18; `gemini -y -p` now fails with `IneligibleTierError: UNSUPPORTED_CLIENT`, so `/scout:ext` and `gd-scout-external` were broken in the field. Verified replacement call, measured against `agy` 1.1.3:

  ```bash
  agy -p "[prompt]" --model "Gemini 3.5 Flash (Medium)" --add-dir "$(pwd)" --dangerously-skip-permissions
  ```

  Two flags are non-obvious and silently corrupt results if dropped. `--add-dir` is mandatory: `agy` does **not** inherit the shell's cwd, and without it scans `~/.gemini/antigravity-cli/scratch` and reports the repo as empty. `--model` takes an **exact display label** from `agy models` (e.g. `Gemini 3.5 Flash (Medium)`), not a slug — an unknown name does not error, it silently falls back to the default model and exits 0. `--dangerously-skip-permissions` is the direct equivalent of the old `gemini -y`: headless mode cannot render a permission prompt, so every file-read is auto-denied without it.

  Scout prompts now end with `Return repo-relative file paths only, one per line, as plain text. No markdown links, no prose.` Without that clause `agy` returns `[name.ts](file:///absolute/path)` markdown links instead of paths, and does so **inconsistently across parallel calls given identical phrasing** — in a 3-agent dispatch, two returned links and one returned plain paths. The clause makes output uniform and parseable.

  Verified end-to-end: a 3-agent parallel `/scout:ext` dispatch over a full copy of this repo (470 files) returned correct, deduplicable paths from each agent, and modified nothing despite `--dangerously-skip-permissions`.

  Touched: `config/models.yml` (tier `external`), `agents/gd-scout-external.agent.md`, `agents/gd-scout.agent.md` (large-file fallback), `skills/scouting/SKILL.md`, `skills/scouting/references/external-tools.md`, `commands/scout/ext.md`.

- **Install hint corrected** — `npm i -g @anthropic/gemini-cli` never existed (the real package was `@google/gemini-cli`). Now points at the Antigravity installer. Touched: `README.md`, `docs/quick-start.md`, and the repo's `CLAUDE.md` / `AGENTS.md`.

### Removed

- **OpenCode dropped from external scouting** — the documented `--model opencode/grok-code` no longer resolves, so the SCALE 4-5 tier was dead code. SCALE ≥4 now routes to `Explore` subagents. `agy` is the only external CLI for scouting. (`opencode/grok-code` specifically is gone; the CLI itself still works and was re-adopted as a `gd-external-delegate` provider — see "Corrected the stale OpenCode claim" under `### Changed`, `[Unreleased]`, above.)

### Fixed

- **Double context injection under a dual install** — when both the marketplace plugin and an `npx glassdesk init` install are active, Claude Code runs `dev-rules-reminder.cjs` twice per prompt and concatenates both `additionalContext` values. The two processes share no event identifier, so they cannot arbitrate at runtime; the copies are now distinguished statically by location instead. The plugin copy stands down when a project copy exists at `.claude/hooks/` **and** is registered in `.claude/settings*.json`. No timing, no shared state, no race. The check is skipped when the payload carries no `transcript_path` — Codex runs the plugin manifest alone and ignores `.claude/settings*.json`, so yielding to an inert registration there would silence the only copy — and it fails open on unreadable or malformed settings.
- **Regression coverage for the dual-install guard** — `tests/dev-rules-reminder.test.js` pins all eight install configurations: dual install, marketplace-only, unregistered project copy, malformed settings, worktree symlink, subdirectory cwd with and without `CLAUDE_PROJECT_DIR`, and the Codex path. Mutation-checked: reverting to a lexical path compare, dropping the `transcript_path` gate, or resolving from cwd each fails the suite.
- **`npm test` ran 32 of 108 tests** — `tests/**/*.test.js` was unquoted, so `sh` collapsed `**` to `*` and matched only `tests/guardrails/`, silently skipping the three top-level suites (`cli`, `integration`, `resolve-spec-input`). The glob is now quoted so Node expands it.
- **`ai-multimodal`: removed a dead Gemini CLI tip** — `SKILL.md` told the agent to prefer `gemini -y -m gemini-2.5-flash` for image analysis, which now always fails before falling back, costing a wasted round-trip per image. The skill's scripts never used the CLI: they call the Gemini **API** via the `google-genai` SDK, which is a separate product and unaffected by the CLI retirement. No script changed.

### Notes

- **Antigravity CLI is not a media tool.** It authenticates via system keyring / Google Sign-In and accepts **no API key** ([#78](https://github.com/google-antigravity/antigravity-cli/issues/78) is open), and its headless media input is unverified — audio is explicitly unsupported ([#244](https://github.com/google-antigravity/antigravity-cli/issues/244)). `ai-multimodal` stays on the `google-genai` SDK. Do not route media through `agy`.
- **`agy` needs a prior interactive sign-in**, sharing its session with the Antigravity IDE. On a machine that has never signed in, external scouting falls back to `Explore` subagents.
- **Upcoming deadline for `ai-multimodal`** — Google rejects unrestricted standard Gemini API keys from 2026-06-19 and **all** standard keys from 2026-09. Documented in `skills/ai-multimodal/.env.example` and `SKILL.md`. Unrelated to the CLI change, but it lands on the same skill.

## [0.5.1] — 2026-05-28

### Fixed

- **Marketplace plugin auto-registers `SessionStart` hook** — added `hooks/hooks.json` declaring `session-init.cjs` via `${CLAUDE_PLUGIN_ROOT}`. Previously the marketplace plugin shipped without hook registration, so `GD_PLUGIN_PATH` was never set in fresh sessions and `/glassdesk:plan:list`, `/glassdesk:plan:status`, `/glassdesk:plan`, `/glassdesk:plan:hard` failed with `Cannot find module '/bin/plan-list'`. Convention matches official plugins (codex, hookify, security-guidance). Per-project wiring in `.claude/settings.json` continues to work; dual-registration with both marketplace + project-local is **not recommended** (parallel hook execution makes the resulting `GD_PLUGIN_PATH` non-deterministic — see `hooks/README.md` for guidance).

### Changed

- **Plan-command env-var references use loud-fail guard** — `commands/plan/list.md`, `commands/plan/status.md`, `commands/plan/hard.md`, `commands/plan.md` now use `${GD_PLUGIN_PATH:?...}` instead of bare `$GD_PLUGIN_PATH`. Marketplace runtime fails with a clear message instead of cryptic `Cannot find module '/bin/...'` if the hook ever fails to fire.
- **SessionStart timeout raised 10s → 20s** — covers cold-start git-call + Serena-fallback stacking.
- **npx installer rewrites both bare and braced forms** — `bin/cli.js` rewriter regex now matches `$GD_PLUGIN_PATH`, `${GD_PLUGIN_PATH}`, and `${GD_PLUGIN_PATH:?...}` → `.claude`. Subagent-relative path semantics preserved for npx installs (Claude Code bug #46696 workaround).
- **`hooks.json` excluded from npx copy** — `bin/cli.js` `COPY_SKIPLIST` skips `hooks.json` so the plugin-scope manifest does not land in `<project>/.claude/hooks/` where `${CLAUDE_PLUGIN_ROOT}` is undefined. npx installs continue to wire hooks via `templates/settings.local.json`.
- **`hooks/README.md`** — documents auto-registration, corrects manual settings example to use the nested `{hooks:[{type,command}]}` shape, and warns that dual-registration is non-deterministic under parallel hook execution.

## [0.5.0] — 2026-05-26

### Changed

- **`/debug` renamed to `/gd-debug` for `npx glassdesk init/update`** — Claude Code 2.x ships a built-in `/debug` slash command (enables session debug logging) that always wins against project-scope `.claude/commands/debug.md`, so the bundled command was unreachable after npx install. The npx installer now copies `commands/debug.md` → `commands/gd-debug.md` and rewrites `/debug` → `/gd-debug` in all copied `.md` references. Plugin source is unchanged: marketplace installs continue to expose `/glassdesk:debug` via plugin namespacing. Re-run `npx glassdesk update` once to apply.
- **`/plan` renamed to `/plan:fast` for `npx glassdesk init/update`** — same rationale: built-in `/plan [description]` (enter plan mode) shadows project-scope `/plan`. The npx installer now copies `commands/plan.md` → `commands/plan/fast.md` (joining the existing `plan/` namespace alongside `:hard`, `:list`, `:status`, `:archive`, `:validate`) and rewrites bare `/plan` → `/plan:fast` in copied `.md` references. Existing variants are unaffected. Marketplace plugin install continues to expose the bare command as `/glassdesk:plan`. Re-run `npx glassdesk update` once to apply.
- **Command-ref rewrite regex tightened** — negative lookahead now excludes `:` and `/` in addition to `\w.-`, preserving colon variants (`/plan:hard`) and path segments (`commands/plan/hard.md`) from accidental rewrite. Side benefit: the rewrite is now idempotent, so re-running `npx glassdesk update` does not double-mangle.

### Fixed

- **Plan helper project-root resolution (`/plan:list`, `/plan:status`)** — `plugins/glassdesk/bin/plan-list` and `plan-status` previously fell back to `process.cwd()` when `CLAUDE_PROJECT_DIR` was not set, silently reading the wrong project's `plans/` directory under marketplace install where the env var is not always exported. New resolver: `CLAUDE_PROJECT_DIR` → walk-up for `.git` → walk-up for `package.json` → fail loudly with exit 1 and a clear error. `.git` is checked first so monorepo subpackages resolve to the repo root. `plan-status` also now resolves relative `<plan-dir>` arguments against the project root rather than CWD.
- **Restore `gd` marketplace alias** — `.claude-plugin/marketplace.json` lost the `gd` short-alias plugin entry in an earlier path-fix PR while `README.md` still advertised `claude plugin install gd`. Restored so existing installation instructions keep working.
- **Worktree hook bootstrap (`MODULE_NOT_FOUND` on SessionStart)** — Hook commands in `.claude/settings.local.json` are now wrapped in a self-bootstrapping shell preamble. On first session start inside a git worktree the wrapper symlinks `<main>/.claude/hooks/` into the worktree, then `exec`s the real hook. Subsequent sessions reuse the symlink (idempotent). Resolves `MODULE_NOT_FOUND` at `cjs/loader:1404` that crashed every fresh worktree session. Re-run `npx glassdesk update` once to migrate existing installs.

- **Hook command relative-path failure (`loader:1404` MODULE_NOT_FOUND)** — `templates/settings.local.json` previously hardcoded `node .claude/hooks/{session-init,dev-rules-reminder}.cjs` (relative). When Claude Code spawned the hook from a CWD ≠ project root (subdirectory launch, nested `.claude/` collisions, e.g. `<root>/app/.claude/`), Node failed with `MODULE_NOT_FOUND` at `cjs/loader:1404`. Template now uses `node "${CLAUDE_PROJECT_DIR:-$PWD}/.claude/hooks/..."` — env var (always set for hook processes) with `$PWD` fallback. `bin/cli.js` now exports `purgeStaleGlassdeskHooks()` and runs it during merge so `npx glassdesk update` strips legacy entries instead of stacking duplicates.
- **`$GD_PLUGIN_PATH` resolution in subagents** — `npx glassdesk init/update` now rewrites the literal `$GD_PLUGIN_PATH` token in copied `.md` files to project-relative `.claude/...` paths. Resolves Claude Code bug #46696 where subagents do not inherit `CLAUDE_ENV_FILE` env vars, causing `node "$GD_PLUGIN_PATH/scripts/..."` calls to fail silently inside `/plan`, `/plan:hard`, planning skill subagent dispatches. Project-relative path works because Claude Code spawns Bash with `cwd=project root` in both main session and subagents. (Considered `${CLAUDE_PROJECT_DIR}` but empirically not exported to Bash by Claude Code 2.1.x despite docs.)
- **Dual-install collision (partial)** — `session-init.cjs` SessionStart hook now skips re-writing `GD_PLUGIN_PATH` when `process.env.GD_PLUGIN_PATH` is already set, which handles sequential re-runs in the same process tree (e.g. a hook fired after a parent shell already exported the var). `GD_SESSION_ID` continues to regenerate every session. Note: this guard does **not** disambiguate truly parallel SessionStart invocations (marketplace + project-local fired simultaneously) — neither process sees the other's `CLAUDE_ENV_FILE` write until both exit, so the result is non-deterministic; see 0.5.1 notes for the recommended single-registration guidance.
- **SessionEnd hook auto-registration via `npx glassdesk`** — `templates/settings.local.json` now ships a `SessionEnd` block pointing at `node "${CLAUDE_PROJECT_DIR:-$PWD}/.claude/hooks/session-end.cjs"`, so `npx glassdesk init/update` auto-wires the worktree auto-cleanup hook into the user's `.claude/settings.local.json`. Hook source `plugins/glassdesk/hooks/session-end.cjs` was already auto-copied to `.claude/hooks/` by `copyPluginFiles` — only the settings registration was missing. `STALE_GLASSDESK_HOOK_RE` in `bin/cli.js` extended to include `session-end` so any future stale relative-path entry would be purged on update.
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
