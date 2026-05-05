---
title: "Plugin System Architecture"
updated: 2026-05-03
tags: [category/architecture, plugin, commands, agents, skills]
---

Glassdesk is a Claude Code plugin that provides a complete SDLC framework through a flat-structured plugin package installed via `npx glassdesk init` or the Claude Code marketplace.

## Plugin Structure

The plugin lives under `plugins/glassdesk/` and installs into a project's `.claude/` directory. The package uses a **flat directory structure** — commands, skills, and agents sit directly under the plugin root with no `.claude/` wrapper.

```
plugins/glassdesk/
├── .claude-plugin/plugin.json   # plugin manifest + cross-marketplace deps
├── commands/                    # slash commands (one file = one command)
│   └── wiki/                    # variant commands: /wiki:init, /wiki:update, /wiki:lint
├── agents/                      # specialized subagents (gd- prefix)
├── skills/                      # reusable skill packages loaded by commands
│   └── wiki/references/         # skill reference docs (maintaining, linting, querying, etc.)
├── config/
│   └── models.yml               # tier → model mapping (single source of truth)
├── bin/                         # zero-LLM CLI scripts (plan-list, plan-status, sync-models)
├── hooks/
│   ├── session-init.cjs         # SessionStart hook — sets GD_PLUGIN_PATH, GD_SESSION_ID, GD_SERENA_AVAILABLE
│   └── lib/gd-config-utils.cjs  # shared config helpers for hooks
└── scripts/
    ├── install-dev-hooks.sh     # optional pre-commit drift guard
    ├── pre-commit-hook.sh       # blocks commits when agent model:tier drift
    └── resolve-spec-input.cjs   # spec→plan input resolver (Step 0 of /plan and /plan:hard)
```

## Command Registration Pattern

| Pattern | Route | Example |
|---|---|---|
| `commands/{name}.md` | `/name` | `commands/ask.md` → `/ask` |
| `commands/{name}/{variant}.md` | `/name:{variant}` | `commands/wiki/init.md` → `/wiki:init` |

Both base and variant can coexist. Variants extend base functionality; they do not replace it.

## Command → Skill → Agent Chain

Commands are thin shims (≤30 lines). They delegate heavy work by activating a skill, which then dispatches to a subagent via the Task tool. This three-layer design keeps command files readable and routes work to the correct model tier.

```
/plan:hard  →  activate 'planning' skill  →  dispatch gd-researcher (standard)
                                           →  dispatch gd-planner (premium)
                                           →  dispatch gd-project-manager (standard)
```

## SDLC Phase Taxonomy

27 commands organized across 9 phases:

| Phase | Commands |
|---|---|
| DISCOVER | `/ask`, `/ask:wiki`, `/brainstorm`, `/scout`, `/scout:ext` |
| PLAN | `/plan`, `/plan:hard`, `/plan:validate`, `/plan:status`, `/plan:list`, `/plan:archive` |
| BUILD | `/code`, `/code:auto` |
| VERIFY | `/fix`, `/fix:hard`, `/debug`, `/test:ui` |
| REVIEW | `/review:pr` |
| SHIP | `/git:cm`, `/git:cp`, `/git:pr` |
| WIKI | `/wiki:init`, `/wiki:update`, `/wiki:lint` |
| COMPOUND | `/spec`, `/learn`, `/improve` |

## Agent Topology

Specialized agents, all prefixed `gd-`. Agents declare a `tier:` in frontmatter; `bin/sync-models` resolves the tier to a concrete Claude model and writes `model:` to each agent file. See [[model-tier-policy]] for the tier mapping.

Key agents and their dispatch sources:

| Agent | Tier | Dispatched by |
|---|---|---|
| `gd-planner` | premium | `/plan:hard` (planning skill) |
| `gd-architect` | premium | `/plan`, `/plan:hard` |
| `gd-debugger` | premium | `/debug`, `/fix:hard` |
| `gd-researcher` | standard | `/plan:hard` |
| `gd-implementer` | standard | building skill Step 2 |
| `gd-project-manager` | standard | building skill |
| `gd-tester` | standard | building/fixing skills |
| `gd-wiki-curator` | standard | `/wiki:update` |
| `gd-git-manager` | fast | `/git:cm`, `/git:cp`, `/git:pr` |
| `gd-plan-archiver` | fast | `/plan:archive` |

## Path Resolution at Runtime

The `session-init.cjs` hook fires on SessionStart and exports three environment variables:

- `GD_PLUGIN_PATH` — absolute path to installed plugin; rewritten at `npx install/update` time in `.md` files so subagents can resolve skill/agent references (Claude Code bug #46696 workaround)
- `GD_SESSION_ID` — unique per-session identifier for log correlation
- `GD_SERENA_AVAILABLE` — set to `1` when Serena MCP is detected active; skills and agents use this flag to branch between Serena tools and built-in tool fallback at runtime

## Registered Marketplace Plugins

The `glassdesk-marketplace` (`/.claude-plugin/marketplace.json`) registers three plugins:

| Name | Source | Description |
|------|--------|-------------|
| `glassdesk` | `./plugins/glassdesk` | Full SDLC framework (40+ commands, 10 agents, 7 skills) |
| `gd` | `./plugins/glassdesk` | Short alias for `glassdesk` |
| `ccaudit` | `./plugins/ccaudit` | 2-tier 20-pattern Claude Code audit tool |

## Related Pages

- [[model-tier-policy]] — tier → model assignment system
- [[wiki-maintainer]] — the `/wiki:*` command suite
- [[agent-naming-standardization]] — `gd-` prefix decision
- [[plugin-flat-structure]] — why no `.claude/` wrapper in plugin source
- [[ccaudit]] — standalone audit plugin registered in this marketplace
- [[worktree-hook-bootstrap]] — how hook commands self-bootstrap `.claude/hooks/` in fresh worktrees via install-time shell wrapper
