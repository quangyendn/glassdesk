# Primary Workflow (AIDLC)

**IMPORTANT:** Activate relevant skills as needed. Ensure token efficiency.

## AIDLC Phases

### 1. DISCOVER
Understand requirements, explore codebase, diagnose issues.
- `/ask`, `/brainstorm`, `/scout`, `/scout:ext`, `/debug`
- Skills: `brainstorming` (ideation), `scouting` (exploration), `debugging` (root cause)

### 2. SPEC
Formalize brainstorm/discovery output into a spec document.
- `/spec` — writes spec doc to `docs/specs/`
- Skills: `brainstorming`

### 3. PLAN
Create implementation plan from spec or task.
- `/plan` (fast), `/plan:hard` (deep + research)
- Lifecycle: `/plan:validate`, `/plan:list`, `/plan:status`, `/plan:archive`
- Plans saved to `./plans/{YYMMDD-HHmm-slug}/`
- Skills: `planning`

### 4. BUILD
Execute the plan.
- `/code` (step-by-step), `/code:auto` (unattended)
- Update existing files; never create new enhanced files
- Run compile check after every code modification
- Skills: `building`

### 5. VERIFY
Catch and fix issues.
- `/fix`, `/fix:hard`, `/test:ui`
- Never fake, mock, or bypass failing tests
- Skills: `fixing`

### 6. REVIEW
Comprehensive PR review via specialized agents.
- `/review:pr`
- Skills: `code-review`

### 7. SHIP
Commit, push, open PR.
- `/git:cm` → `/git:cp` → `/git:pr`
- Commit messages always in English

### 8. COMPOUND
Session compounding — use after meaningful work sessions.
- `/learn` — extract insights → `.gd-wiki/insights/{YYMMDD}-{slug}.md` (auto-mkdir; committed since v0.3.0)
- `/improve` — generate gated proposal (`plans/improvements/`); never auto-applied; needs ≥1 `/learn` first
- Skills: `compounding`

## Key Rules

- Write clean, readable, maintainable code
- Follow established architectural patterns; handle edge cases
- Never ignore failing tests
- Update existing files directly — no new enhanced files
- After significant doc changes, update `./docs/` accordingly
