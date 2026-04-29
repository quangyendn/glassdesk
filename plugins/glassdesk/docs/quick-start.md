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
