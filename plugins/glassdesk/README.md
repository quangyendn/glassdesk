# Glassdesk Plugin

27 SDLC-phased commands, specialized agents, compound-engineering primitives, and a project wiki maintainer for Claude Code.

## Overview

Complete development framework for Claude Code — intelligent planning, structured execution, systematic debugging, and self-improving knowledge loops.

## Features

- **27 Slash Commands** — 9-phase SDLC taxonomy: DISCOVER → PLAN → BUILD → VERIFY → REVIEW → SHIP → WIKI → COMPOUND
- **Project Wiki Maintainer (v0.3.0+)** — `/wiki:init`, `/wiki:update`, `/wiki:lint`, `/ask:wiki`; committed `.gd-wiki/` Obsidian vault, QMD-indexed, ~10× cheaper queries vs codebase grep
- **Compound Engineering** — `/spec` (brainstorm→doc), `/learn` (session→`.gd-wiki/insights/`), `/improve` (gated proposals)
- **12 Skill Packages** — building, scouting, fixing, brainstorming, compounding, planning, code-review, wiki, and more
- **18 Specialized Agents** — code review, scouting, research, analysis, git automation, debugging, planning, testing, project coordination, plan archival, UI testing, wiki curation
- **Claude Flow Integration** — multi-agent orchestration via MCP tools

## Installation

```bash
# Add marketplace (replace <path> with your local clone)
claude plugin marketplace add <path-to-glassdesk-repo>

# Install this plugin
claude plugin install glassdesk

# Verify installation
claude plugin list
```

## Commands (27)

| Phase | Commands |
|-------|----------|
| **DISCOVER** | `/ask`, `/ask:wiki`, `/brainstorm`, `/scout`, `/scout:ext` |
| **PLAN** | `/plan`, `/plan:hard`, `/plan:validate`, `/plan:status`, `/plan:list`, `/plan:archive` |
| **BUILD** | `/code`, `/code:auto` |
| **VERIFY** | `/fix`, `/fix:hard`, `/debug`, `/test:ui` |
| **REVIEW** | `/review:pr` |
| **SHIP** | `/git:cm`, `/git:cp`, `/git:pr` |
| **WIKI** | `/wiki:init`, `/wiki:update`, `/wiki:lint` |
| **COMPOUND** | `/spec`, `/learn`, `/improve` |

## Wiki Maintainer (v0.3.0+)

Maintain a project knowledge base in `.gd-wiki/` — Obsidian-flavored, QMD-indexed, query-able by both human and LLM.

| Command | What it does |
|---|---|
| `/wiki:init [path]` | Bootstrap `.gd-wiki/` vault + register QMD collection (~2GB model download on first machine-wide embed) |
| `/wiki:update` | Distill commits since last sync into wiki edits (main branch only); curator subagent does LLM work, CLI does the rest |
| `/wiki:lint [--deep]` | Detect broken links, orphans, stale frontmatter, empty pages; `--deep` adds LLM contradiction sweep |
| `/ask:wiki <q>` | QMD search + Sonnet synthesis with `path:line` citations; ~10× cheaper than `/ask` general when wiki has the answer |

Powered by skill `wiki` (5 reference docs: maintaining, querying, linting, obsidian-conventions, cost-budget) and agent `gd-wiki-curator` (Sonnet, scope-bound to `.gd-wiki/`). Depends on `obsidian@obsidian-skills` (auto-resolved via plugin dependency) and `qmd` CLI ≥ 2.1.0 (manual install — see quick-start).

`/learn` writes to `.gd-wiki/insights/` (auto-mkdir; no `/wiki:init` prerequisite). The curator never touches `insights/` — that subfolder is `/learn` territory.

## Compound Engineering

Three commands that make glassdesk self-improving:

- **`/spec [topic]`** — run after `/brainstorm` to write a formal spec to `docs/specs/`
- **`/learn`** — after a session, extract insights into `.gd-wiki/insights/` (auto-mkdir; no `/wiki:init` required; committed alongside the wiki since v0.3.0)
- **`/improve [--plugin|--project]`** — reads knowledge entries, proposes diffs to `plans/improvements/` — **never auto-applied**

## Agents (17)

| Agent | Purpose |
|-------|---------|
| `scout` | Fast local codebase exploration and file discovery |
| `scout-external` | External-tool reconnaissance (Gemini, OpenCode) |
| `researcher` | Web/topic research with structured reporting |
| `code-reviewer` | Adherence checks against project guidelines and CLAUDE.md |
| `code-simplifier` | Simplify and refine code for clarity and maintainability |
| `comment-analyzer` | Audit comments for accuracy and long-term maintainability |
| `docs-manager` | Documentation management, updates, synchronization |
| `pr-test-analyzer` | PR test coverage analysis |
| `silent-failure-hunter` | Find silent failures and inadequate error handling |
| `type-design-analyzer` | Type design quality, encapsulation, invariants |
| `git-manager` | Git automation — stage, commit, push, create PR (used by `/git:*`) |
| `debugger` | Root cause analysis for bugs and test failures |
| `planner` | Synthesize research into structured implementation plans |
| `project-manager` | Phase decomposition + TodoWrite coordination + finalize |
| `tester` | Run test suites, interpret pass/fail, detect flakes |
| `plan-archiver` | Archive completed plans, write journal entries (used by `/plan:archive`) |
| `ui-tester` | Browser-automation UI testing via chrome-devtools (used by `/test:ui`) |

## Skills (11)

| Skill | Purpose |
|-------|---------|
| `planning` | Research-driven plan creation (YAGNI/KISS/DRY) |
| `building` | Phase-by-phase plan execution with verification gates |
| `scouting` | Internal + external codebase exploration |
| `fixing` | Fast fix and test-failure recovery workflows |
| `brainstorming` | Option evaluation, design decisions, spec formalization |
| `compounding` | Session insight extraction, knowledge base, improvement proposals |
| `debugging` | Systematic four-phase debugging with root cause tracing |
| `code-review` | Receive/request reviews, verification gates |
| `pair-programming` | Driver/navigator modes, TDD, mentoring |
| `ai-multimodal` | Image/video/audio processing via Gemini API |
| `media-processing` | FFmpeg, ImageMagick, background removal |

## Model Tier Policy

Each agent declares a **tier** in its frontmatter. A central config maps tier → Claude model (or external CLI), so changing model policy across all agents is a one-file edit + one command.

### Tiers

| Tier | Model | Use cases |
|------|-------|-----------|
| `premium` | opus | Brainstorm, plan, spec, deep review, design judgment |
| `standard` | sonnet | Coding, refactoring, doc writing, structured analysis |
| `fast` | haiku | Trivial edits, simple scout, comment checks |
| `external` | sonnet (fallback) + Gemini CLI | High-volume scout via `gemini-2.5-flash` |

### How to change model policy

Edit `plugins/glassdesk/config/models.yml`:

```yaml
tiers:
  premium:
    model: opus      # change this; affects all premium agents
```

Then sync:

```bash
node plugins/glassdesk/bin/sync-models
```

This rewrites the `model:` field in every tagged agent. To preview changes without writing, use `--check`.

### How to add a new agent

1. Create `plugins/glassdesk/agents/<name>.md` with frontmatter
2. Include `tier: <premium|standard|fast|external>`
3. Run `node plugins/glassdesk/bin/sync-models` — `model:` will be auto-set

### Manual override

To pin a specific agent to a model regardless of policy, **omit `tier:`** from its frontmatter and set `model:` directly. The sync script will WARN and skip that agent.

### Drift guard (developers)

Optional pre-commit hook blocks commits when `model:` is out of sync with `tier:`:

```bash
bash plugins/glassdesk/scripts/install-dev-hooks.sh
```

Run once per clone. Skip if you don't want the guard.

## Optional Dependencies

```bash
# Claude Flow (multi-agent orchestration)
npm install -g claude-flow@alpha

# AI Multimodal (image/video/audio)
pip install google-genai
export GEMINI_API_KEY=...

# Media Processing
brew install ffmpeg imagemagick
npm install -g rmbg-cli

# External Scouts
npm install -g @anthropic/gemini-cli
```

### Serena MCP (recommended for code-heavy work)

Symbol-aware code tools backed by LSP — typically 50–90% token reduction on symbol lookups, refactors, and reference searches across large codebases. Auto-detected by glassdesk's SessionStart hook (`GD_SERENA_AVAILABLE=1|0`).

```bash
# Marketplace (preferred)
/plugin install serena@claude-plugins-official
# If the marketplace is not yet registered:
/plugin marketplace add anthropics/claude-plugins-official
```

Prerequisites: Python + [`uv`](https://docs.astral.sh/uv/) (Serena's MCP server is launched via `uvx`).

When Serena is absent, glassdesk shows a one-time install hint per session and falls back to built-in `Read`/`Grep`/`Edit`. **No commands break.** First-time use per project triggers a one-time `onboarding` task (user-confirmed, ~30k–80k tokens for ~1000-file repos). Tool routing is documented in `docs/serena-preference.md`.

## Worktree integration

Opening a Claude session in a git worktree automatically symlinks `plans/` (and any other configured folders) from the main repo into the worktree, so `/plan` output is written to `<main>/plans/` and persists intact after `git worktree remove`. A lock file at `<worktree>/.gd-worktree-symlinks.lock` records what was linked for drift-resistant cleanup.

Configuration: add `.claude/worktree-symlinks.json` in the project root to override the default symlink list (`["plans"]`) — the override fully replaces `symlinks[]`, it does not merge.

Cleanup: run `/worktree:remove <path>` from the main repo (or another worktree), not raw `git worktree remove` — the command unlinks managed symlinks and verifies main-repo targets before removing the worktree.

> **Note:** Windows symlink support (junction/copy fallback) is not yet implemented. The hook silently no-ops on `win32`.

## Documentation

- [Quick Start](docs/quick-start.md) — 5-minute setup and SDLC walkthrough
- [Migration Guide v0.2](docs/migration-v0.2.md) — upgrading from v0.1.x
- [Changelog](CHANGELOG.md) — full release history

## Version

**Plugin Version:** 0.4.0

## License

ISC
