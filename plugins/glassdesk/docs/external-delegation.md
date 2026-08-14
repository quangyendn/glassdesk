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
| `advisory` | is sent nothing but the vetted prompt² | review, architecture, second opinion, adversarial check |
| `repository-read` | inspect the repository, no writes¹ | codebase investigation, debugging |
| `patch-proposal` | return a unified diff, never apply it | implementation proposals, targeted fixes, tests |

Default is `advisory`. No mode permits commit, push, merge, deploy, credential
access, changes to provider configuration, or calling another provider.
`isolated-write` is not implemented.

¹ Write prevention in `repository-read` is enforced per-provider, not by the
dispatcher, and the strength of that enforcement differs: `opencode` denies
`write`/`edit`/`bash` in its permission policy and `codex` runs under
`--sandbox read-only` — both real, restrictions confirmed by directly
running the CLI. `agy` also runs with `--mode plan` (disables its file-edit
tool) and `--sandbox` (OS-level restriction on its terminal tool), but
unlike opencode/codex these have only been confirmed as accepted flags
whose own `--help`/embedded documentation describes the right behaviour —
not measured end-to-end against a signed-in session, because none was
available. `agy` also runs with `--dangerously-skip-permissions`, which
disables its own permission-prompt guardrails outright (required for
headless reads at all). Net effect: "no writes" for `agy` is best-effort
hardening the model is expected to honour, not a verified CLI enforcement
the way opencode's and codex's are. See `agy`'s entry below.

² `advisory` bounds what the **dispatcher** sends, not what the provider is
physically able to read. The child is spawned in an empty temp directory and
with an allowlisted environment, so the repository is neither its working
directory nor named in any variable it inherits — but a CLI agent that accepts
an absolute path can still open one. `codex --sandbox read-only` restricts
*writes*; it does not confine reads. Treat `advisory` as "no repository context
was sent", not "the provider could not have read the repository". Enforcing the
latter needs an OS-level sandbox the dispatcher does not build.

## Providers

| Provider | Type | Modes | Requires |
|---|---|---|---|
| `opencode` | CLI | advisory, repository-read | nothing — free models work with no credentials |
| `codex` | CLI | advisory, repository-read, patch-proposal | ChatGPT sign-in |
| `agy` | CLI | advisory, repository-read | Google sign-in |
| `kimi` | HTTP | advisory | `KIMI_API_KEY` (the base URL falls back to the shipped default) |
| `deepseek` | HTTP | advisory | `DEEPSEEK_API_KEY` (the base URL falls back to the shipped default) |
| `local-openai` | HTTP | advisory | `LOCAL_OPENAI_BASE_URL`, exported explicitly — it has no key to gate on, so the default never implies availability |

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
  prompt, so every file read is auto-denied without it. That same flag
  disables `agy`'s own write/edit guardrails, so unlike `opencode` and
  `codex`, `agy` has no independently verified read-only enforcement.
- `--mode plan` is set on every invocation. `agy --help` documents it as a
  distinct read-only mode, and the binary's own embedded help text (visible
  via `strings`) describes it as "research and plan without making
  changes" — stronger evidence than the flag's existence alone that it
  genuinely disables agy's file-edit tool, not just a prompt hint.
- `--sandbox` is also set on every invocation. `agy --help` describes it as
  "terminal restrictions", and the binary's strings show it is backed by an
  OS-level sandbox profile (macOS Seatbelt fragments are visible in the
  binary). This covers a *different* route than `--mode plan`: it constrains
  what a shell/bash tool call can do, in case the model tries to route
  around plan mode through a terminal command instead of its dedicated edit
  tool. The two are additive, not alternatives, and both flags coexist
  without conflict alongside `--dangerously-skip-permissions` (confirmed:
  all four flags together still reach agy's normal auth flow rather than a
  flag-parsing error). Neither has been measured end-to-end against a
  signed-in session — treat both as best-effort hardening, not a guarantee,
  and note that `--sandbox`'s OS-level backing may not extend to non-macOS
  platforms.
- An unauthenticated run prints an OAuth URL and blocks **interactively** for
  up to 60s waiting for an authorization code before giving up with
  `Authentication required...` / `Error: authentication timed out` /
  `Error: authentication failed or timed out`, exit 1. `auth_error_pattern`
  matches on those exact phrases so this maps to exit 11, not the generic
  failure code — but in a headless run it is still a minute of dead
  wall-clock before that classification happens, on top of whatever
  `--timeout` the run was given.
- `probeProvider` reports `agy` as available whenever the binary is on
  PATH — CLI session state cannot be probed for free. Combined with the
  above, `available: true` for `agy` means installed, not authenticated or
  usable.

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
| 1 | the provider ran and failed with its own exit status — the most common failure path. The true status is preserved in `envelope.exit_code`; `1` itself carries no further meaning beyond "nonzero and not one of the reserved codes below" |
| 10 | provider unavailable — disabled, binary absent, or a required non-secret env var unset |
| 11 | authentication unavailable |
| 12 | unsupported task type, mode, provider name, or specialist — also covers any value-bearing flag given nothing, an empty string, or another flag as its value — and a `--output` path that already exists, including a dangling symlink |
| 13 | privacy restriction or secret detected |
| 14 | timeout |
| 20 | dispatcher failure |

A provider's own exit code is never passed through raw as this command's
exit code, because it is an arbitrary namespace the provider does not
coordinate with this table — a provider that happens to exit `13` must not
be reported identically to this dispatcher's own privacy refusal. Any
nonzero status the provider returns on its own therefore collapses to `1`;
only the codes the dispatcher assigns itself (`10`/`11`/`12`/`13`/`14`/`20`)
are ever returned as such.

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

`scope.root` defaults to the current working directory. `scope.files` must be
an array, and every entry in it must resolve inside `scope.root`.

`expected_output` is rendered into the prompt as its own section, so a task
asking for `"findings"` or `"plan"` actually tells the provider so. Like every
other free-text field it passes through the secret sweep and counts toward the
byte cap.

In `repository-read` and `patch-proposal` the contents of `scope.files` are
not inlined — only the paths are, and the provider reads the tree itself. The
contents are still read and swept for secrets, but only the path lengths count
toward the byte cap, so declaring a large file does not fail a run over bytes
that never leave the machine. A file larger than the cap is the one exception:
in those modes it is not read at all, since loading it purely to sweep content
that is never sent would be a denial of service against the dispatcher, and the
sweep would add nothing the deny-list boundary check does not already cover.
Its entry carries `scanned: false` rather than being reported as clean.

In `advisory` an oversized file is refused from its metadata, before any read —
the byte cap cannot protect the process a multi-gigabyte log is already loaded
into.

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
  "command": "opencode run --pure --agent plan --format json -m opencode/deepseek-v4-flash-free <prompt:2450B>",
  "context_sent": {
    "files": ["db/migrate/update_payment_rates.rb"],
    "bytes": 8123,
    "repository_root": null
  },
  "raw_output": "...",
  "stderr_tail": "..."
}
```

`raw_output` is unvalidated provider text. The agent normalises it into
findings and verifies each claim before reporting anything as fact.

`context_sent.repository_root` is non-null exactly when the provider was handed
a directory to read for itself — the two repository-visible modes. When it is
set, `files` and `bytes` describe only what was **pushed into the prompt**, not
the limit of what the provider could see; when it is `null`, they are the whole
of what was sent.

`command` shows the argv the provider was actually invoked with, but the
`{prompt}` element is replaced with a `<prompt:NNNNB>` byte-length
placeholder rather than the prompt text itself — the prompt is already sent
in full to the provider, and duplicating it into `command` would roughly
double the envelope at the byte cap for no benefit.

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
   literals. Declared paths are swept as well as file contents — a path travels
   into the prompt and into `context_sent`, and an artifact named after the key
   that produced it leaks that key while its contents scan clean. The
   specialist profile is swept too: that text comes from disk
   rather than the task envelope, but `buildPrompt` puts it at the top of the
   outgoing prompt, so it is sent text like any other.
4. **Byte cap, twice.** First on the inputs — inline blocks, the summary, and
   the objective/expected\_output/constraints/out\_of\_scope/acceptance\_criteria
   text, plus file contents in `advisory` and file *paths* in the
   repository-visible modes, where the contents are never inlined. Then again
   on the rendered prompt, because the first sum does not include the
   specialist profile, the mode contract, headings or fences: a task made of
   many empty files could report almost no input bytes and still produce a
   document far past the limit. Both use `defaults.max_context_bytes` (400000
   by default, overridable per-registry). Over the cap aborts the run rather
   than truncating, so the agent is never left guessing which part of a
   truncated context the provider actually saw.
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
7. **Local-only endpoint check.** `local-openai` is the only provider allowed
   to receive `restricted` data, and it earns that from
   `privacy.execution: "local-only"`. But its URL comes from
   `LOCAL_OPENAI_BASE_URL`, so the registry's claim is not self-enforcing:
   `gateEndpoint` re-derives it from the URL that will actually be posted to
   and refuses the run unless the host is loopback (`localhost`,
   `127.0.0.0/8`, `::1`) over `http`/`https`. Judged from the hostname alone,
   never DNS — a name that resolves to loopback at check time can resolve
   elsewhere at request time. `*.localhost` is rejected for the same reason.
   `runHttp` repeats the check immediately before the socket is opened.
8. **Repository-exposure sweep.** In `repository-read` and `patch-proposal`
   the provider is handed `scope.root` and reads it with its own tools, so a
   deny list applied only to `scope.files` would govern the prompt and nothing
   else. `gateRepositoryExposure` walks the tree first and aborts the run if
   any file in it matches the path deny list — an undeclared `.env` in the
   repository stops the run rather than being left one `cat` away from a
   provider whose `context_sent` will never mention it. A symlink is checked
   twice, by its own name and by its resolved target: a link called
   `notes.txt` pointing at `.env`, at a file inside a skipped directory, or
   anywhere outside the root aborts the run, and so does a link this process
   cannot resolve. A directory the sweep cannot even list aborts the run too,
   unless the reason was `EACCES`/`EPERM` — the provider runs as the same user,
   so a directory this process may not open is one it may not open either,
   while an `EMFILE` or `EIO` says the sweep failed rather than that the
   subtree is unreachable. **Stated limits:** the walk skips `.git`, `node_modules`,
   and the usual build/venv output directories, so a credential placed inside
   one of those is not detected unless something in the swept part of the tree
   links to it; and a tree over 50 000 entries aborts the run rather than
   being swept partially and reported as clean.

Every one of 1–8 aborts the run with exit code 13 (`EXIT.PRIVACY`) — the byte
cap is not a privacy violation in the same sense as the others, but it shares
the same code because `gateContext` throws the same `GateError` class for all
of them.

Two further protections are structural rather than gates — there is no
envelope for them to inspect and refuse, so they cannot abort anything; they
remove the thing a bypass would otherwise find:

- **Advisory cwd isolation.** A spawned process inherits its parent's working
  directory unless told otherwise. In `advisory` mode the dispatcher spawns the
  provider inside a fresh, empty `fs.mkdtempSync` directory — not the
  repository — and removes it once the run ends. See footnote ² under
  *Permission modes* for what this does and does not guarantee.
- **Environment allowlist.** The child does **not** inherit this process's
  environment. `buildChildEnv` copies only what a provider needs to run
  (`PATH`, `HOME`, locale, proxy/TLS, XDG dirs, Windows equivalents) plus
  whatever the registry entry names in `env_passthrough`, and the invoke
  template's own values override all of it. A Claude Code session is routinely
  started with credentials in its environment, and a provider with shell
  tooling can read its own environment even under a read-only sandbox — those
  values would otherwise leave the machine on every run, unscanned by the
  content sweep and unredacted in the envelope. It also keeps the repository
  path out of `PWD`, `INIT_CWD`, `CLAUDE_PROJECT_DIR` and similar breadcrumbs
  during an advisory run.

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
  `auth_error_pattern` so a login failure maps to exit 11. If the CLI reads a
  credential store located by an environment variable, name that variable in
  `env_passthrough` — the child's environment is allowlisted, so anything not
  listed there and not in `ENV_ALLOWLIST` simply will not be visible to it.
- **`openai-compatible`** — set `env.base_url`, `env.api_key`, `env.model` and
  `endpoint_defaults`. The dispatcher POSTs to `{base_url}/chat/completions`.
  A remote entry becomes available once its API key is exported, falling back
  to `endpoint_defaults.base_url`; a local-only entry has no key to gate on, so
  it stays unavailable until `base_url` is exported explicitly. Setting
  `privacy.execution: "local-only"` (or `restricted_data_allowed: true`) opts
  the entry into the loopback check — its `endpoint_defaults.base_url` must
  itself be a loopback URL, or the entry ships permanently refused.

Put every non-obvious flag requirement in `notes`. It is a data field, not a
comment, so `list --json` shows it to the agent choosing the provider.

A genuinely new provider *type* needs a new branch in `run-provider.mjs` plus
tests.

## Adding a specialist profile

A new markdown file in `config/specialists/` with `name` and `use_for`
frontmatter. Profiles are provider-neutral — never one per provider.

`use_for` is enforced, not documentation: a run whose `task_type` is not in the
list is refused with exit 12, the same way `gateCapability` refuses a provider
that does not declare the task type. A task stating no `task_type` is
unconstrained. A profile with an empty `use_for` can therefore never be
selected by a task that declares its type.

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
- No read confinement in `advisory`. The dispatcher controls what it sends and
  what the child inherits; it does not build an OS-level sandbox, so a CLI
  provider that accepts an absolute path can still read one. See footnote ²
  under *Permission modes*.
- The repository-exposure sweep does not descend into `.git`, `node_modules`,
  or the usual build/venv output directories, and refuses rather than
  part-sweeps a tree over 50 000 entries.
- CLI stdout and HTTP response bodies are both capped at 64 MB. A provider
  that writes past it has its process group killed; an endpoint that replies
  past it has the body discarded. Either way the run fails with exit 20 rather
  than the dispatcher being exhausted.
- `bin/lib/secret-patterns.mjs` intentionally duplicates
  `scripts/guardrails/lib/patterns.js`, because the guardrails tree does not
  exist in the copied layout. A drift test
  (`tests/external-delegate/secret-patterns-drift.test.js`) fails if the
  source grows a pattern the copy lacks.
