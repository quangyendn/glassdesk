# External delegation

One governed path from Claude Code to a non-Claude AI provider.

`gd-external-delegate` is the only subagent that talks to an external provider.
Providers are entries in a registry, not subagents. Specialisations are
markdown profiles, not subagents. There is no `codex-reviewer` agent and no
`kimi-architect` agent — those are `codex + code-reviewer` and
`kimi + architecture-critic`.

```
main agent → gd-external-delegate → bin/external-ai.mjs → provider
             judgment                policy + transport
```

The dispatcher owns availability, authentication, privacy classification,
secret preflight, timeout and exit codes. The agent owns classification,
provider choice, context minimisation, and validation of what comes back.
The split is deliberate: judging a finding's severity needs a model, not a
shell script, so the dispatcher returns raw output inside a metadata envelope
and never interprets it.

## Using it

The main agent dispatches the subagent by name. There is no slash command.

> Use gd-external-delegate to get an independent review of this migration.
> Pick the provider automatically.

> Use gd-external-delegate with Codex to investigate this failing integration
> test. Keep Codex read-only.

> Use gd-external-delegate with the architecture-critic profile. Send only the
> design documents I listed.

## Permission modes

| Mode | The provider may | Use for |
|---|---|---|
| `advisory` | read only what was sent to it | review, architecture, second opinion, adversarial check |
| `repository-read` | inspect the repository, no writes | codebase investigation, debugging |
| `patch-proposal` | return a unified diff, never apply it | implementation proposals, targeted fixes, tests |

Default is `advisory`. No mode permits commit, push, merge, deploy, credential
access, changes to provider configuration, or calling another provider.
`isolated-write` is not implemented.

## Providers

| Provider | Type | Modes | Requires |
|---|---|---|---|
| `opencode` | CLI | advisory, repository-read | nothing — free models work with no credentials |
| `codex` | CLI | advisory, repository-read, patch-proposal | ChatGPT sign-in |
| `agy` | CLI | advisory, repository-read | Google sign-in |
| `kimi` | HTTP | advisory | `KIMI_API_KEY` |
| `deepseek` | HTTP | advisory | `DEEPSEEK_API_KEY` |
| `local-openai` | HTTP | advisory | `LOCAL_OPENAI_BASE_URL` |

`local-openai` is the only provider permitted to receive data classified
`restricted`, because its execution is local-only.

### Measured provider traps

Each provider's `notes` field carries these, so `external-ai list --json`
surfaces them to the selecting agent. Verified 2026-08-05.

**`opencode` 1.15.6**

- Runs headless with zero credentials on `opencode/deepseek-v4-flash-free`,
  `opencode/nemotron-3-super-free` and `opencode/big-pickle`. Text-only round
  trip 3.7 s.
- A denied write can hang past 2 m 30 s. `--agent plan` refuses cleanly
  instead, and the hard timeout is the backstop.
- Without `--pure` it loads the user's global MCP servers. In testing, with
  `write` denied, the model attempted to create the file through an MCP tool
  instead — it failed only because that app was not running.
- It spawns its own subagents unless `permission.task` is denied.
- A repo-local `opencode.json` can override permissions, so
  `OPENCODE_DISABLE_PROJECT_CONFIG=1` is always set.

**`agy` 1.1.3**

- `--add-dir` is mandatory. `agy` does not inherit the shell's cwd; without it
  the run scans an empty scratch directory and reports the repository as empty.
- `--model` takes an exact display label from `agy models`. An unknown value
  does not error — it silently falls back to the default model and exits 0.
- `--dangerously-skip-permissions` is required. Headless mode cannot show a
  prompt, so every file read is auto-denied without it.

**`codex`**

- Runs under `--sandbox read-only` for all three modes, including
  `patch-proposal`: the diff is returned as text inside the response, never
  written to disk, so the sandbox stays read-only even though the whole point
  of the mode is to produce a change.

## Command reference

```bash
node "${GD_PLUGIN_PATH:?GD_PLUGIN_PATH unset}/bin/external-ai.mjs" list [--json]
node "${GD_PLUGIN_PATH:?GD_PLUGIN_PATH unset}/bin/external-ai.mjs" check --provider <name> [--mode <mode>] [--task-type <type>]
node "${GD_PLUGIN_PATH:?GD_PLUGIN_PATH unset}/bin/external-ai.mjs" run \
  --provider <name|auto> [--specialist <name>] [--mode <mode>] \
  --task-file <path> [--timeout <seconds>] [--output <path>]
```

`--provider auto` picks the lowest-`priority` provider that passes every hard
filter. It is deterministic and makes no quality judgment — that is why the
agent normally calls `list` first and passes an explicit name.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | success |
| 10 | provider unavailable — disabled, binary absent, or a required non-secret env var unset |
| 11 | authentication unavailable |
| 12 | unsupported task type, mode, provider name, or specialist |
| 13 | privacy restriction or secret detected |
| 14 | timeout |
| 20 | dispatcher failure |

## Task envelope

```json
{
  "task_type": "code-review",
  "objective": "Review the payment-rate migration for data-integrity risk.",
  "scope": { "root": ".", "files": ["db/migrate/update_payment_rates.rb"] },
  "context": {
    "summary": "The migration rewrites existing shop payment rates.",
    "inline": [{ "label": "failing test", "content": "..." }]
  },
  "constraints": ["Do not modify files", "Focus on rollback safety"],
  "out_of_scope": ["Frontend", "Deployment execution"],
  "acceptance_criteria": ["Identify irreversible operations"],
  "privacy": { "classification": "internal" },
  "expected_output": "findings"
}
```

`scope.root` defaults to the current working directory. Every entry in
`scope.files` must resolve inside it.

## Run envelope

```json
{
  "version": "external-ai-run-v1",
  "provider": "opencode",
  "specialist": "adversarial-reviewer",
  "mode": "advisory",
  "status": "completed",
  "exit_code": 0,
  "duration_ms": 4210,
  "command": "opencode run --pure --agent plan ...",
  "context_sent": { "files": ["db/migrate/update_payment_rates.rb"], "bytes": 8123 },
  "raw_output": "...",
  "stderr_tail": "..."
}
```

`raw_output` is unvalidated provider text. The agent normalises it into
findings and verifies each claim before reporting anything as fact.

## Privacy enforcement

Enforced in the dispatcher, before any byte leaves the machine.

1. **Classification gate.** `restricted` requires
   `privacy.restricted_data_allowed: true` on the provider.
2. **Path deny list.** `.env*`, `**/secrets/**`, `**/credentials*`, `*.pem`,
   `id_rsa*`, `*.key`, `*.p12`, `*.pfx`. A match **aborts the run** — the file
   is never silently dropped, because a silent drop would make the agent
   believe context was sent that was not.
3. **Content sweep.** PEM private-key headers, AWS access keys, GitHub tokens,
   `sk-` keys, Slack tokens, and credential assignments with high-entropy
   literals.
4. **Byte cap.** Total context — file contents, inline blocks, the summary,
   and the objective/constraints/out\_of\_scope/acceptance\_criteria text —
   is capped at `defaults.max_context_bytes` (400000 by default, overridable
   per-registry). Over the cap aborts the run rather than truncating, so the
   agent is never left guessing which part of a truncated context the
   provider actually saw.
5. **Path-containment check.** Every `scope.files` entry must resolve inside
   `scope.root`, checked twice: syntactically (after `path.resolve()`
   collapses any `..` segments), and again with both sides passed through
   `fs.realpathSync`. The second check exists because the first one never
   follows symlinks — a symlink that lives inside the scope root but points
   outside it would pass syntactic containment and then be read anyway, so
   the real-path re-check stops it before the read.
6. **No key echo.** HTTP provider API keys are read from env, sent in the
   `Authorization` header, and passed to `buildEnvelope` as a `secrets` value
   that gets redacted out of the `command`, `raw_output`, and `stderr_tail`
   fields of the run envelope before it is ever written or printed.

Every one of these, including the byte cap, aborts the run with exit code 13
(`EXIT.PRIVACY`) — the byte cap is not a privacy violation in the same sense
as the others, but it shares the same code because `gateContext` throws the
same `GateError` class for all of them.

**None of this catches customer data, personal data, or unrelated proprietary
code.** Those are not detectable by pattern and are not gated by the
dispatcher at all — keeping them out of a task envelope is the delegating
agent's judgment alone. Exit 13 means the envelope was built wrong in a way
a regex can catch; the absence of exit 13 does not mean the envelope is safe.

## Adding a provider

Add an entry to `config/external-providers.json`. No code changes are needed
for a provider of an existing type.

- **`cli-agent`** — set `bin`, `default_model`, `modes`, `capabilities`,
  `privacy`, and an `invoke.<mode>` template per supported mode. Placeholders
  `{model}`, `{prompt}`, `{dir}` and `{policy}` are substituted per argv
  element, so nothing is ever passed through a shell. Set
  `auth_error_pattern` so a login failure maps to exit 11.
- **`openai-compatible`** — set `env.base_url`, `env.api_key`, `env.model` and
  `endpoint_defaults`. The dispatcher POSTs to `{base_url}/chat/completions`.
  Defaults never imply availability; the user must export `base_url`.

Put every non-obvious flag requirement in `notes`. It is a data field, not a
comment, so `list --json` shows it to the agent choosing the provider.

A genuinely new provider *type* needs a new branch in `run-provider.mjs` plus
tests.

## Adding a specialist profile

A new markdown file in `config/specialists/` with `name` and `use_for`
frontmatter. Profiles are provider-neutral — never one per provider.

The agent may propose a profile only after a workflow has repeated and the
existing six are demonstrably insufficient. It never writes into
`config/specialists/` on its own.

## Portability

Everything works in both install layouts because `bin/` and `config/` are
siblings in both:

| Layout | Root |
|---|---|
| Marketplace plugin | `plugins/glassdesk/` |
| `npx glassdesk init` | `<project>/.claude/` |

Two rules keep it that way. Markdown references the dispatcher as
`${GD_PLUGIN_PATH:?...}/bin/external-ai.mjs`, never `${CLAUDE_PLUGIN_ROOT}` —
only the former is rewritten on copy. And the dispatcher must keep its `.mjs`
extension: after the copy, the nearest `package.json` is the user's project,
which may be CommonJS or absent, so an extensionless ESM file would fail to
load.

## Known limitations

- No `isolated-write`. `patch-proposal` covers the implementation case; the
  main agent applies the diff.
- `patch-proposal` output is not validated with `git apply --check`. The agent
  inspects it manually.
- CLI authentication cannot be probed for free, so `list` reports a CLI as
  available whenever its binary is present. A login failure surfaces at run
  time as exit 11 via `auth_error_pattern`.
- `bin/lib/secret-patterns.mjs` intentionally duplicates
  `scripts/guardrails/lib/patterns.js`, because the guardrails tree does not
  exist in the copied layout. A drift test
  (`tests/external-delegate/secret-patterns-drift.test.js`) fails if the
  source grows a pattern the copy lacks.
