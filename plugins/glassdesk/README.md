# Glassdesk Plugin

23 SDLC-phased commands, specialized agents, and compound-engineering primitives for Claude Code.

## Overview

Complete development framework for Claude Code — intelligent planning, structured execution, systematic debugging, and self-improving knowledge loops.

## Features

- **23 Slash Commands** — 8-phase SDLC taxonomy: DISCOVER → PLAN → BUILD → VERIFY → REVIEW → SHIP → COMPOUND
- **Compound Engineering** — `/spec` (brainstorm→doc), `/learn` (session→knowledge), `/improve` (gated proposals)
- **11 Skill Packages** — building, scouting, fixing, brainstorming, compounding, planning, code-review, and more
- **10 Specialized Agents** — code review, scouting, research, analysis
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

## Agents (10)

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
