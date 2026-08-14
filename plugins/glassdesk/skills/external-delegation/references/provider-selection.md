# Provider selection

## Hard filters — all must pass

A provider is ineligible if any of these fails. No ranking score overrides
them.

1. `available: true` in `external-ai list --json`.
2. The requested mode appears in the provider's `modes`.
3. The task type appears in the provider's `capabilities`.
4. Privacy: a `restricted` task requires `privacy.restricted_data_allowed:
   true`. Only `local-openai` sets it.
5. The context fits. If it does not, minimise the context before widening the
   provider search.

## Ranking the survivors

| Criterion | Weight |
|---|---:|
| Capability fit for this exact task | 30 |
| Privacy fit | 20 |
| Repository tooling for the chosen mode | 15 |
| Independence from Claude's model family | 10 |
| Context capacity | 10 |
| Reliability | 5 |
| Cost | 5 |
| Latency | 5 |

Correctness and privacy outrank cost. For an adversarial review, independence
is the point — weight it above everything except privacy.

## Shipped providers

| Provider | Best at | Watch for |
|---|---|---|
| `opencode` | default advisory; adversarial second opinion; free, no credentials, independent model family | free models are weak — not a substitute for `codex` on implementation |
| `codex` | implementation proposals, patches, repository investigation | the only provider offering `patch-proposal`; needs a ChatGPT sign-in |
| `agy` | large context, multimodal, document analysis | `--model` takes an exact display label from `agy models`; an unknown one silently falls back |
| `kimi` | long-context synthesis, multilingual review | needs `KIMI_API_KEY` |
| `deepseek` | cheap independent review | needs `DEEPSEEK_API_KEY` |
| `local-openai` | anything classified `restricted` | the only local-only provider; needs `LOCAL_OPENAI_BASE_URL` |

Read the `notes` field from `list --json` before choosing. It carries each
provider's measured failure modes, and it is more current than this table.

## When the user names a provider

Use it. If it is ineligible, report which filter it failed and stop. Silently
substituting another provider is a defect — the user asked for a specific model
family for a reason you may not be able to see.

## Choosing a specialist profile

One profile per call. A second perspective needs a concrete justification.

| Situation | Profile |
|---|---|
| Review a change | `code-reviewer` |
| Design or boundary decision | `architecture-critic` |
| Unexplained failure | `root-cause-debugger` |
| Security-sensitive change | `security-auditor` |
| Provider is asked to implement | `implementation-worker` |
| Challenge a conclusion Claude already reached | `adversarial-reviewer` |

A one-off, narrowly scoped question needs no profile at all. Pass
`--specialist none`.

## Proposing a new profile

Only after a workflow has repeated, the existing profiles are demonstrably
insufficient, the difference is describable, and the output is assessable.

Draft it, test it against one positive, one negative and one ambiguous case,
then present the proposed file for approval. Never write into
`config/specialists/` without it. Profiles are provider-neutral — never create
one per provider, and never create a subagent per provider.
