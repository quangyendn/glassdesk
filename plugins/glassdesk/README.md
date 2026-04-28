# Glassdesk Plugin

23 SDLC-phased commands, specialized agents, and compound-engineering primitives for Claude Code.

## Overview

Complete development framework for Claude Code — intelligent planning, structured execution, systematic debugging, and self-improving knowledge loops.

## Features

- **23 Slash Commands** — 8-phase SDLC taxonomy: DISCOVER → PLAN → BUILD → VERIFY → REVIEW → SHIP → COMPOUND
- **Compound Engineering** — `/spec` (brainstorm→doc), `/learn` (session→knowledge), `/improve` (gated proposals)
- **11 Skill Packages** — building, scouting, fixing, brainstorming, compounding, planning, code-review, and more
- **17 Specialized Agents** — code review, scouting, research, analysis, git automation, debugging, planning, testing, project coordination, plan archival, UI testing
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

## Commands (23)

| Phase | Commands |
|-------|----------|
| **DISCOVER** | `/ask`, `/brainstorm`, `/scout`, `/scout:ext` |
| **PLAN** | `/plan`, `/plan:hard`, `/plan:validate`, `/plan:status`, `/plan:list`, `/plan:archive` |
| **BUILD** | `/code`, `/code:auto` |
| **VERIFY** | `/fix`, `/fix:hard`, `/debug`, `/test:ui` |
| **REVIEW** | `/review:pr` |
| **SHIP** | `/git:cm`, `/git:cp`, `/git:pr` |
| **COMPOUND** | `/spec`, `/learn`, `/improve` |

## Compound Engineering

Three commands that make glassdesk self-improving:

- **`/spec [topic]`** — run after `/brainstorm` to write a formal spec to `docs/specs/`
- **`/learn`** — after a session, extract insights into `.glassdesk-knowledge/` (gitignored, local-only)
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

## Documentation

- [Quick Start](docs/quick-start.md) — 5-minute setup and SDLC walkthrough
- [Migration Guide v0.2](docs/migration-v0.2.md) — upgrading from v0.1.x
- [Changelog](CHANGELOG.md) — full release history

## Version

**Plugin Version:** 0.2.0

## License

ISC
