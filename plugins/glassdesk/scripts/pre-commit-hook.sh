#!/usr/bin/env bash
# Glassdesk pre-commit guard — blocks commits when agent tier:/model: drift detected.
# Installed via plugins/glassdesk/scripts/install-dev-hooks.sh.

set -e

# Only run check when agents or models.yml are part of the staged changeset.
if ! git diff --cached --name-only | grep -qE '^plugins/glassdesk/(agents/.*\.md|config/models\.yml)$'; then
  exit 0
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
SYNC="$REPO_ROOT/plugins/glassdesk/bin/sync-models"

if [ ! -x "$SYNC" ]; then
  echo "WARN: pre-commit: $SYNC not executable — skipping drift check"
  exit 0
fi

if ! "$SYNC" --check; then
  echo ""
  echo "ERROR: Agent model drift detected."
  echo "   Run: plugins/glassdesk/bin/sync-models"
  echo "   Then: git add plugins/glassdesk/agents/ && git commit"
  exit 1
fi
