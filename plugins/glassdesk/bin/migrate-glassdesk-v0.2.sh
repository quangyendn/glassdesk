#!/usr/bin/env bash
# Migration helper for glassdesk v0.1.x → v0.2.0
# Usage: bash bin/migrate-glassdesk-v0.2.sh [--apply]
set -euo pipefail

GUIDE_PATH="${HOME}/.claude/glassdesk-v0.2-migration.md"

print_guide() {
cat <<'GUIDE'
Glassdesk v0.2.0 Migration Helper
==================================

REMOVED commands and replacements:

  /plan:fast       → /plan          (renamed; behavior preserved)
  /plan:two        → (deleted; aspirational, unused in practice)
  /plan:parallel   → /plan:hard     (parallelism handled internally)
  /plan:ci         → /fix or /debug (depending on intent)
  /code:no-test    → /code          (test step is optional via prompt)
  /code:parallel   → /code:auto     (parallel execution in auto mode)
  /fix:fast        → /fix           (renamed)
  /fix:test        → /fix           (merged; pass test failure as input)
  /fix:logs        → /debug         (debug handles log analysis)
  /fix:types       → /fix           (type errors are general fixes)
  /fix:ui          → /fix           (UI fixes are general fixes)
  /fix:ci          → /fix or /debug
  /fix:parallel    → /fix:hard
  /git:merge       → use raw git merge
  /docs:init       → (deleted; out of scope — software dev only)
  /docs:update     → (deleted; out of scope — software dev only)
  /review:codebase → /scout
  /write           → (deleted; out of scope — software dev only)
  /write:micro     → (deleted)
  /write:pyramid   → (deleted)
  /write:synthesis → (deleted)

NEW commands in v0.2.0:

  /spec    ⭐ Formalize a brainstorm into a spec document (docs/specs/)
  /learn   ⭐ Extract session insights into knowledge base (.glassdesk-knowledge/)
  /improve ⭐ Propose plugin or project improvements — gated, never auto-applied

CURRENT command taxonomy (23 total):

  DISCOVER  /ask  /brainstorm  /scout  /scout:ext
  PLAN      /plan  /plan:hard  /plan:validate  /plan:status  /plan:list  /plan:archive
  BUILD     /code  /code:auto
  VERIFY    /fix  /fix:hard  /debug  /test:ui
  REVIEW    /review:pr
  SHIP      /git:cm  /git:cp  /git:pr
  COMPOUND  /spec  /learn  /improve

See full mapping: plugins/glassdesk/docs/migration-v0.2.md
GUIDE
}

if [[ "${1:-}" == "--apply" ]]; then
  mkdir -p "$(dirname "$GUIDE_PATH")"
  print_guide > "$GUIDE_PATH"
  echo "Migration guide written to: $GUIDE_PATH"
else
  print_guide
fi
