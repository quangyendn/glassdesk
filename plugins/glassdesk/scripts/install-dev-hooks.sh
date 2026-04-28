#!/usr/bin/env bash
# One-time setup for plugin developers — installs git pre-commit hook.
# Run from anywhere inside the repository.

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"
SOURCE="$REPO_ROOT/plugins/glassdesk/scripts/pre-commit-hook.sh"
TARGET="$HOOKS_DIR/pre-commit"

if [ ! -d "$HOOKS_DIR" ]; then
  echo "ERROR: $HOOKS_DIR not found. Are you inside a git repo?"
  exit 1
fi

if [ -f "$TARGET" ] && ! grep -q "Glassdesk pre-commit" "$TARGET"; then
  echo "WARN: existing pre-commit hook detected. Backing up to pre-commit.bak"
  mv "$TARGET" "$TARGET.bak"
fi

cp "$SOURCE" "$TARGET"
chmod +x "$TARGET"
echo "OK installed pre-commit hook → $TARGET"
echo "   Test: edit an agent's tier and try to commit."
