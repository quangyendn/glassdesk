# Glassdesk Quick Start

5-minute setup guide for the glassdesk plugin — 27 SDLC-phased commands.

## Installation

```bash
claude plugin install glassdesk
```

Verify: start `claude` and type `/` — you should see all 27 commands.

## SDLC Pipeline

```
DISCOVER → PLAN → BUILD → VERIFY → REVIEW → SHIP → COMPOUND
```

## Example: end-to-end feature flow

```
/scout <area>           # explore codebase structure
/brainstorm <feature>   # ideate, evaluate options
/spec                   # formalize brainstorm → docs/specs/
/plan                   # quick plan (or /plan:hard for deep research)
/code                   # execute plan step-by-step
/fix <issue>            # if test failures or bugs
/review:pr              # run PR review agents after push
/git:cp                 # commit + push
/learn                  # capture session insights
/improve --project      # propose improvements (never auto-applied)
```

## Commands by Phase

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

## Compound Engineering

Three commands that make glassdesk self-improving:

- **`/spec [topic]`** — run after `/brainstorm` to write a formal spec to `docs/specs/`
- **`/learn`** — after a session, extract insights into `.gd-wiki/insights/` (auto-mkdir; no `/wiki:init` required; committed alongside the wiki since v0.3.0). See "Wiki Maintainer Setup" above for the broader vault.
- **`/improve [--plugin|--project]`** — reads knowledge entries, proposes diffs to `plans/improvements/` — **never auto-applied**

## Migrating from v0.1.x

```bash
bash plugins/glassdesk/bin/migrate-glassdesk-v0.2.sh
```

Full mapping: [docs/migration-v0.2.md](migration-v0.2.md)

## Wiki Maintainer Setup (v0.3.0+)

The `/wiki:*` commands depend on:

1. **Obsidian skills plugin** (auto-resolved via `dependencies`):
   ```bash
   /plugin marketplace add kepano/obsidian-skills
   /plugin install obsidian@obsidian-skills    # if not auto-installed
   ```

2. **QMD CLI** (host-level prerequisite, ~2GB models on first embed):
   ```bash
   npm i -g @tobilu/qmd      # requires Node >=22 or Bun >=1.0
   qmd --version             # verify >= 2.1.0
   ```

3. **macOS only** — SQLite extension support:
   ```bash
   brew install sqlite
   ```

Run `/wiki:init` to bootstrap `.gd-wiki/` in your project.

### Wiki Maintainer Walkthrough

```bash
# 1. Bootstrap the vault (one-time per project)
$ /wiki:init
[pre-flight] qmd 2.1.x detected
[pre-flight] sqlite present (macOS)
[init] created .gd-wiki/{architecture,features,decisions,risks,manual,insights,index}
[init] wrote .gd-wiki/.config.json (collection: wiki-<project-slug>)
[init] registered QMD collection: wiki-<project-slug>
First qmd embed will download ~2GB of models (one-time, machine-wide). Proceed? [Y/n] Y
[embed] complete

# 2. Seed a page (manual edit), commit, then sync
$ vim .gd-wiki/architecture/plugin-overview.md   # write a page with frontmatter
$ git add .gd-wiki/ && git commit -m "wiki: seed architecture/plugin-overview"

# 3. After future merges on main, distill new commits into wiki
$ /wiki:update
[pre-flight] on main, last_synced ${SHA1:0:8} reachable, diff non-empty
[budget] estimated 4_200 tokens (max 1_000_000)
[curator] dispatched gd-wiki-curator (sonnet)
✓ Edited:  .gd-wiki/features/auth-flow.md   — added OAuth provider section
✓ Created: .gd-wiki/decisions/redis-cache.md — captured Redis vs in-memory choice
[reindex] qmd update -c wiki-<slug> + qmd embed
[pointer] sync.last_synced_commit → ${SHA2:0:8}

# 4. Query the wiki
$ /ask:wiki "what is the gd-wiki-curator agent for?"
The gd-wiki-curator agent distills git diffs into wiki page edits, scoped strictly
to `.gd-wiki/` [.gd-wiki/architecture/plugin-overview.md:42]. It runs as a Sonnet
subagent invoked by `/wiki:update` and respects `<!-- manual -->` blocks.

Related pages:
- .gd-wiki/architecture/plugin-overview.md
- .gd-wiki/features/wiki-maintainer.md

# 5. Audit periodically
$ /wiki:lint
Wrote plans/reports/wiki-lint-260501-1430.md — 0 issues found.
```

See `plugins/glassdesk/skills/wiki/SKILL.md` for the storage contract, decision tree, and curator boundaries.

## Dependencies

**Required:** Node.js 18+, Git

**Optional:**

| Feature | Install |
|---------|---------|
| AI Multimodal | `pip install google-genai` + `GEMINI_API_KEY` |
| Media Processing | `brew install ffmpeg imagemagick && npm i -g rmbg-cli` |
| External Scouts | `npm i -g @anthropic/gemini-cli` |
| Parallel Agents | `npm i -g claude-flow@alpha` |
| Wiki Maintainer | `npm i -g @tobilu/qmd` (>=2.1.0) + `brew install sqlite` (macOS) |
| Symbol-aware code tools (50–90% token reduction) | `/plugin install serena@claude-plugins-official` (needs Python + `uv`) |
