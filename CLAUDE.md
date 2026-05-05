# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Slash Commands

Available commands in `.claude/commands/` — 27 total:

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

### DISCOVER
- `/ask` - Smart question command with context
- `/ask:wiki` - Query the project wiki (`.gd-wiki/`) via QMD for grounded answers
- `/brainstorm` - Ideation and creative exploration
- `/scout` - Explore codebase structure
- `/scout:ext` - Use external agentic tools for scouting

### PLAN
- `/plan` - Analyze and create an implementation plan (fast, no research)
- `/plan:hard` - Full analysis with parallel research
- `/plan:validate` - Validate plan with critical questions
- `/plan:status` - Show detailed status of a specific plan
- `/plan:list` - List all plans with status and progress
- `/plan:archive` - Archive completed plans, write journal entries

### BUILD
- `/code` - Execute implementation plan step-by-step
- `/code:auto` - Auto-execute all phases without blocking gates

### VERIFY
- `/fix` - Analyze and fix issues (general or test failures)
- `/fix:hard` - Deep investigation and comprehensive fix
- `/debug` - Systematic debugging and root cause analysis
- `/test:ui` - Run UI component tests

### REVIEW
- `/review:pr` - Comprehensive PR review using specialized agents

### SHIP
- `/git:cm` - Stage all files and create a commit
- `/git:cp` - Stage, commit, and push current branch
- `/git:pr` - Create a pull request

### WIKI
- `/wiki:init` - Bootstrap `.gd-wiki/` Obsidian-flavored vault, register QMD collection, run first embed
- `/wiki:update` - Distill new commits since last sync into wiki pages (main branch only)
- `/wiki:lint` - Deterministic checks (broken links, orphans, stale frontmatter); `--deep` runs LLM contradiction sweep

### COMPOUND
- `/spec` - Formalize a brainstorm into a spec document in `docs/specs/`
- `/learn` - Extract and persist insights from the current session to `.gd-wiki/insights/`
- `/improve` - Generate an improvement proposal from knowledge entries (never auto-applied)

## Skills

Skills available in `plugins/glassdesk/skills/` (10 total):
- `planning` - Plan creation, organization, and validation
- `building` - Phase-by-phase plan execution with verification gates
- `code-review` - Code review reception, requesting reviews, verification gates
- `debugging` - Systematic debugging, root cause tracing, defense-in-depth
- `fixing` - Fast fix and test-failure recovery workflows
- `scouting` - Codebase exploration with internal and external tools
- `brainstorming` - Option evaluation, design decisions, spec formalization
- `compounding` - Session insight extraction, knowledge base, improvement proposals
- `ai-multimodal` - Image generation/analysis, video processing, audio transcription
- `media-processing` - FFmpeg video encoding, ImageMagick editing, background removal

## Workflows

Workflow guides in `./.claude/workflows/`:
- `primary-workflow.md` - Main development workflow
- `development-rules.md` - Code standards and practices
- `documentation-management.md` - Docs maintenance
- `orchestration-protocol.md` - Multi-agent coordination

Workflow steps:
1. **Plan First:** Use `/plan:hard` to create implementation plan
2. **Execute:** Use `/code:auto` to implement the plan

## GitHub Actions Templates

Templates in `templates/github-actions/`:
- `pr-review.yml` - Automated PR review workflow (lint, type check, tests)
- `security-review.yml` - Security-focused review (dependency audit, secret scan)

Copy to `.github/workflows/` to enable.

## Plans

Keep plans in `./plans/` folder (root level, no nested subfolders):
```
plans/
├── {YYMMDD-HHmm-slug}/
│   ├── plan.md              # Overview with YAML frontmatter
│   ├── phase-01-*.md        # Phase implementation details
│   └── research/            # Research reports (optional)
└── reports/                 # Standalone reports
```

**Naming:** `{YYMMDD-HHmm}-{descriptive-slug}/`

## Output Styles

Response verbosity levels in `.claude/output-styles/`:
- Level 0: ELI5 - Non-technical explanations
- Level 1: Junior - Detailed with examples
- Level 2: Mid - Balanced detail
- Level 3: Senior - Concise (default)
- Level 4: Lead - Architectural focus
- Level 5: Expert - Minimal, code-focused

## Documentation

Plugin docs in `plugins/glassdesk/docs/`:
- `quick-start.md` — 5-minute setup and SDLC walkthrough
- `migration-v0.2.md` — upgrading from v0.1.x

Changelog: `plugins/glassdesk/CHANGELOG.md`

User specs (output of `/spec`): `docs/specs/`

## Dependencies

**Required:** Node.js 18+, Git

**Recommended:**
- `gh` - GitHub CLI for git/PR commands (`brew install gh`)

**Optional by feature:**
| Feature | Install |
|---------|---------|
| AI Multimodal | `pip install google-genai` + `GEMINI_API_KEY` |
| Media Processing | `brew install ffmpeg imagemagick && npm i -g rmbg-cli` |
| External Scouts | `npm i -g @anthropic/gemini-cli` |

See `plugins/glassdesk/docs/quick-start.md` for complete setup instructions.

## Plugin Development

**CRITICAL: Plugin Directory Structure**

Plugins in `plugins/` directory use a **flat structure** - NO `.claude` folder wrapper:

**❌ WRONG:**
```
plugins/my-plugin/.claude/commands/scout.md
plugins/my-plugin/.claude/skills/planning/
```

**✅ CORRECT:**
```
plugins/my-plugin/commands/scout.md
plugins/my-plugin/skills/planning/
```

**Why:** Claude Code plugin system automatically handles the `.claude` context when plugins are installed. Adding `.claude` in plugin source creates double-nesting that breaks command discovery.

**Command Registration Pattern:**
- Base command: `commands/{name}.md` → `/name`
- Variant command: `commands/{name}/{variant}.md` → `/name:{variant}`
- Both can coexist - variants extend base functionality

**Example:**
```
plugins/glassdesk/
├── commands/
│   ├── scout.md          → /scout
│   └── scout/
│       └── ext.md        → /scout:ext
├── skills/
└── plugin.json
```

**Testing Plugins:**
1. Install marketplace: `claude marketplace install ./path/to/marketplace`
2. Install plugin: `claude plugin install plugin-name`
3. Verify: Start `claude` interactive session and type `/` to see commands
