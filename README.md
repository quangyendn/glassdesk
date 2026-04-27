# Glassdesk

A Claude Code plugin with 23 SDLC-phased commands, specialized agents, and compound-engineering primitives.

See [`website/index.html`](./website/index.html) for the introductory landing page.

## Features

- **23 Slash Commands** — 8-phase SDLC taxonomy: DISCOVER → PLAN → BUILD → VERIFY → REVIEW → SHIP → COMPOUND
- **Compound Engineering** — `/spec` (brainstorm→doc), `/learn` (session→knowledge), `/improve` (gated proposals)
- **Multi-Agent Framework** — Claude-Flow integration for parallel task orchestration
- **AI Multimodal** — Gemini API support for audio/image/video processing
- **11 Skill Packages** — building, scouting, fixing, brainstorming, compounding, planning, code-review, and more

## Quick Start

### Prerequisites

- [Claude Code CLI](https://claude.com/code) version 2.0.0 or higher
- Node.js 18+ and Git

### Installation

#### Quick install via `npx` (project-level)

```bash
# In your project root:
npx glassdesk init        # first install
npx glassdesk update      # refresh later

# Flags:
#   --yes      skip confirm (CI/automation)
#   --force    reinstall even if already initialised
#   --dry-run  preview without writing files
```

This installs glassdesk into `<your-project>/.claude/` and registers hooks in `.claude/settings.local.json`. Pin a version with `npx glassdesk@0.2.0 init`.

> **Upgrading from v0.1.x?** Run `bash plugins/glassdesk/bin/migrate-glassdesk-v0.2.sh` for the full command mapping. See [migration guide](./plugins/glassdesk/docs/migration-v0.2.md).

#### Or via Claude Code marketplace (user-level)

```bash
# 1. Clone your fork (replace <your-fork-url>)
git clone <your-fork-url> glassdesk
cd glassdesk

# 2. Add this directory as a Claude Code marketplace
claude plugin marketplace add "$(pwd)"

# 3. Install the plugin
claude plugin install glassdesk    # or: gd (short alias)

# 4. Verify installation
claude plugin list
```

### Upgrade

```bash
cd glassdesk
git pull
# Restart Claude Code to reload
```

### Uninstall

```bash
claude plugin uninstall glassdesk
claude plugin marketplace remove glassdesk-marketplace
```

### Basic Usage

```bash
# Create an implementation plan
/plan:hard "Build user authentication system"

# Execute the plan
/code:auto

# Use multi-agent orchestration
/claude-flow swarm "Parallel code generation"
```

## Core Capabilities

| Phase | Commands | Description |
|-------|----------|-------------|
| **DISCOVER** | `/ask`, `/brainstorm`, `/scout`, `/scout:ext` | Explore, ideate, question |
| **PLAN** | `/plan`, `/plan:hard`, `/plan:validate`, `/plan:status`, `/plan:list`, `/plan:archive` | Research-driven planning |
| **BUILD** | `/code`, `/code:auto` | Structured execution with verification gates |
| **VERIFY** | `/fix`, `/fix:hard`, `/debug`, `/test:ui` | Debugging, test recovery |
| **REVIEW** | `/review:pr` | Multi-agent PR review |
| **SHIP** | `/git:cm`, `/git:cp`, `/git:pr` | Commit, push, PR workflows |
| **COMPOUND** | `/spec`, `/learn`, `/improve` | Self-improving knowledge loop |

## Directory Structure

```
glassdesk/
├── .claude-plugin/
│   └── marketplace.json              # Marketplace definition
├── plugins/
│   └── glassdesk/                    # Main plugin
│       ├── .claude-plugin/
│       │   └── plugin.json           # Plugin manifest
│       ├── commands/                 # 23 slash commands (8 SDLC phases)
│       ├── agents/                   # Specialized agents
│       ├── skills/                   # Skill packages
│       ├── workflows/                # Development workflows
│       ├── hooks/                    # Pre/post tool hooks
│       └── README.md                 # Plugin documentation
├── website/                          # Static landing page
├── plans/                            # Implementation plans
├── docs/                             # Project documentation
├── package.json
├── CLAUDE.md
└── README.md
```

## Documentation

- [Quick Start](./plugins/glassdesk/docs/quick-start.md) — 5-minute setup and example workflows
- [Migration Guide v0.2](./plugins/glassdesk/docs/migration-v0.2.md) — upgrading from v0.1.x
- [Changelog](./plugins/glassdesk/CHANGELOG.md) — full release history
- [`docs/`](./docs/) — project guides and specs

## Publishing (maintainers)

Releases publish automatically when a `v*` tag is pushed:

```bash
# Bump version in package.json, commit on main, then:
git tag v2.1.0
git push origin v2.1.0
```

GitHub Actions runs `npm test` and `npm publish --access public --provenance` (requires `NPM_TOKEN` repo secret).

## Contributing

See [CLAUDE.md](./CLAUDE.md) for project conventions.

## License

ISC
