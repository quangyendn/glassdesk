# Glassdesk Quick Start

5-minute setup guide for the glassdesk plugin — 23 SDLC-phased commands.

## Installation

```bash
claude plugin install glassdesk
```

Verify: start `claude` and type `/` — you should see all 23 commands.

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

## Migrating from v0.1.x

```bash
bash plugins/glassdesk/bin/migrate-glassdesk-v0.2.sh
```

Full mapping: [docs/migration-v0.2.md](migration-v0.2.md)

## Dependencies

**Required:** Node.js 18+, Git

**Optional:**

| Feature | Install |
|---------|---------|
| AI Multimodal | `pip install google-genai` + `GEMINI_API_KEY` |
| Media Processing | `brew install ffmpeg imagemagick && npm i -g rmbg-cli` |
| External Scouts | `npm i -g @anthropic/gemini-cli` |
| Parallel Agents | `npm i -g claude-flow@alpha` |
