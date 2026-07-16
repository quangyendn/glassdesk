# External Scouting Tools

External scouting uses **Antigravity CLI** (`agy`) — Google's replacement for the
retired Gemini CLI. See "Migration note" at the bottom for why.

## When to Use

Use external tools when:
- Codebase is large (>500 files) and token efficiency matters
- Need parallel multi-agent search across many dirs
- Want a large context window for holistic analysis

## Tool Command

```bash
agy -p "[prompt]" --model "Gemini 3.5 Flash (Medium)" --add-dir "$(pwd)" --dangerously-skip-permissions
```

Every flag is load-bearing. Dropping any one of them breaks the call in a way
that is easy to miss:

| Flag | Why it is required |
|------|--------------------|
| `-p` | Non-interactive print mode. Aliases: `--print`, `--prompt`. |
| `--model` | Must be an **exact display label** from `agy models` — see below. |
| `--add-dir` | `agy` does **not** inherit the shell's cwd. Without this it runs against an empty scratch dir and reports the repo as empty. |
| `--dangerously-skip-permissions` | Headless mode cannot show a permission prompt, so every file-read is auto-denied without this. Direct equivalent of the old `gemini -y`. |

## Prompt Convention

End every scout prompt with:

> `Return repo-relative file paths only, one per line, as plain text. No markdown links, no prose.`

Without the "plain text / no markdown links" clause, `agy` inconsistently returns
`[name.ts](file:///absolute/path)` markdown links instead of paths — and it varies
between parallel calls given identical phrasing, so some agents in one dispatch
return links while others return paths. The clause makes the output uniform and
directly parseable.

## Model Names

`agy` takes the **display label**, not a slug. Run `agy models` for the live list:

```
Gemini 3.5 Flash (Medium)     <- default for scouting
Gemini 3.5 Flash (High) / (Low)
Gemini 3.1 Pro (Low) / (High)
Claude Sonnet 4.6 (Thinking)
Claude Opus 4.6 (Thinking)
GPT-OSS 120B (Medium)
```

**Trap:** an unknown name (e.g. the old `gemini-2.5-flash` slug) does **not**
error — `agy` silently falls back to its default model and exits 0. A scout that
looks like it worked may have run on a model you did not choose. Quote the label
exactly; the parentheses and spaces are part of it.

## Availability Check

If `agy` is not found, ask the user:
- Yes → install: `curl -fsSL https://antigravity.google/cli/install.sh | bash`
- No → fall back to `Explore` subagents (internal-scout.md pattern)

`agy` authenticates via the system keyring / Google Sign-In, sharing its session
with the Antigravity IDE. It does **not** accept an API key. If the user has
never signed in, the call fails — fall back to `Explore` subagents rather than
attempting a login.

## Parallel Dispatch Pattern

Write N Task calls in a single message (runs in parallel). Each Task immediately
calls Bash to invoke the external tool:

```
Task(prompt="Call Bash: agy -p 'Search src/ for payment-related files. Return repo-relative file paths only, one per line, as plain text. No markdown links, no prose.' --model \"Gemini 3.5 Flash (Medium)\" --add-dir \"$(pwd)\" --dangerously-skip-permissions")
Task(prompt="Call Bash: agy -p 'Search lib/ for database schema files. Return repo-relative file paths only, one per line, as plain text. No markdown links, no prose.' --model \"Gemini 3.5 Flash (Medium)\" --add-dir \"$(pwd)\" --dangerously-skip-permissions")
```

**Critical:** These agents run OTHER tools. Do NOT call search tools yourself.

## Timeout

Each Bash call: 3-minute timeout. Skip agents that don't return; do not restart
them. `agy`'s own print-mode timeout defaults to 5m — override with
`--print-timeout` if a shorter bound is wanted.

## Scaling

| SCALE | Tool | Agent count |
|-------|------|-------------|
| ≤3 | agy | SCALE agents |
| ≥4 | Explore subagents | SCALE agents |

## Variables (from command)

- `USER_PROMPT` — the search objective
- `SCALE` — number of agents (default: 3)
- `RELEVANT_FILE_OUTPUT_DIR` — report output path from `## Naming` section

## Migration note

Gemini CLI's free OAuth tier was cut on 2026-06-18; `gemini -y -p` now fails with
`IneligibleTierError: UNSUPPORTED_CLIENT`. The binary still works on a paid API
key, but `agy` is Google's designated successor and needs no key.

OpenCode was dropped at the same time: its `opencode/grok-code` model no longer
exists and the provider/model format no longer resolves.
