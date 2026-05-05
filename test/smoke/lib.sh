#!/bin/bash
# test/smoke/lib.sh — shared helpers for glassdesk worktree-bootstrap smoke tests.
# Compatible with bash 3.2 (macOS /bin/bash baseline).
#
# Source from each test script:  source "$(dirname "$0")/lib.sh"

# ---------------------------------------------------------------------------
# Global state
# ---------------------------------------------------------------------------
SMOKE_SCRATCH_DIRS=()   # accumulate dirs created by setup_scratch_repo
SMOKE_PASS_COUNT=0
SMOKE_FAIL_COUNT=0

# Path to the glassdesk cli — used to build wrappers.
# Resolves relative to this lib.sh location so the harness is portable.
GD_CLI_JS="${GD_CLI_JS:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/bin/cli.js}"
export GD_CLI_JS

# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------

# canonicalize_path <path>
# Returns the canonical (resolved) absolute path of a directory.
# On macOS, mktemp -d may return /var/folders/... which is a symlink to
# /private/var/folders/... — this ensures both sides of a comparison use the
# same resolved form.
# Requires: path must exist as a directory.
canonicalize_path() {
  if command -v realpath >/dev/null 2>&1; then
    realpath "$1"
  else
    # macOS bash 3.2 fallback — cd into the dir and print the physical path.
    (cd "$1" 2>/dev/null && pwd -P) || echo "$1"
  fi
}

# ---------------------------------------------------------------------------
# Assertion helpers
# ---------------------------------------------------------------------------

# assert_symlink_target <link_path> <expected_target>
# Passes when the symlink at link_path resolves (readlink) to expected_target.
# Both sides are canonicalized before comparison to handle macOS /var ->
# /private/var symlink discrepancies introduced by mktemp -d.
assert_symlink_target() {
  local link="$1"
  local expected="$2"
  if [ ! -L "$link" ]; then
    echo "  ASSERT FAIL: not a symlink: $link" >&2
    return 1
  fi
  local actual
  actual=$(readlink "$link")
  # Canonicalize both sides — resolve any intermediate symlinks (e.g. macOS
  # /var -> /private/var) so string comparison is reliable across platforms.
  local actual_canon expected_canon
  actual_canon=$(canonicalize_path "$actual" 2>/dev/null || echo "$actual")
  expected_canon=$(canonicalize_path "$expected" 2>/dev/null || echo "$expected")
  if [ "$actual_canon" != "$expected_canon" ]; then
    echo "  ASSERT FAIL: symlink target mismatch" >&2
    echo "    expected: $expected (canonical: $expected_canon)" >&2
    echo "    actual:   $actual (canonical: $actual_canon)" >&2
    return 1
  fi
  return 0
}

# assert_file_exists <path>
# Passes when path exists (follows symlinks — same semantics as [ -e ]).
assert_file_exists() {
  local path="$1"
  if [ ! -e "$path" ]; then
    echo "  ASSERT FAIL: path does not exist: $path" >&2
    return 1
  fi
  return 0
}

# assert_not_exists <path>
# Passes when path does NOT exist (no entry, or dangling symlink).
assert_not_exists() {
  local path="$1"
  if [ -e "$path" ] || [ -L "$path" ]; then
    echo "  ASSERT FAIL: expected path to not exist but it does: $path" >&2
    return 1
  fi
  return 0
}

# assert_exit_code <expected> <actual>
assert_exit_code() {
  local expected="$1"
  local actual="$2"
  if [ "$actual" -ne "$expected" ]; then
    echo "  ASSERT FAIL: exit code mismatch (expected $expected, got $actual)" >&2
    return 1
  fi
  return 0
}

# assert_is_symlink <path>
assert_is_symlink() {
  local path="$1"
  if [ ! -L "$path" ]; then
    echo "  ASSERT FAIL: $path is not a symlink" >&2
    return 1
  fi
  return 0
}

# assert_not_symlink <path>
assert_not_symlink() {
  local path="$1"
  if [ -L "$path" ]; then
    echo "  ASSERT FAIL: $path is a symlink but should not be" >&2
    return 1
  fi
  return 0
}

# assert_string_contains <haystack> <needle>
assert_string_contains() {
  local haystack="$1"
  local needle="$2"
  case "$haystack" in
    *"$needle"*) return 0 ;;
    *)
      echo "  ASSERT FAIL: string does not contain expected substring" >&2
      echo "    haystack: $haystack" >&2
      echo "    needle:   $needle" >&2
      return 1
      ;;
  esac
}

# ---------------------------------------------------------------------------
# Wrapper builder
# ---------------------------------------------------------------------------

# build_wrapper <hook_file>
# Prints the raw shell command string produced by wrapHookCommand(<hook_file>).
# Requires node + the glassdesk cli at GD_CLI_JS.
build_wrapper() {
  local hook_file="$1"
  node -e "
    import('/Users/yen.nq/Projects/indie/asdlc/glassdesk/bin/cli.js').then(function(m) {
      process.stdout.write(m.wrapHookCommand('$hook_file'));
    });
  "
}

# ---------------------------------------------------------------------------
# Repo setup helpers
# ---------------------------------------------------------------------------

# setup_scratch_repo
# Creates a temporary git repo with a minimal .claude/hooks structure that
# mimics a glassdesk-installed main worktree (using stubs — no real install).
# Sets globals: SCRATCH_REPO, SCRATCH_HOOKS
# Registers the dir for cleanup in teardown().
setup_scratch_repo() {
  local tmp
  tmp=$(mktemp -d)
  SMOKE_SCRATCH_DIRS+=("$tmp")

  git init -q "$tmp"
  git -C "$tmp" config user.email "smoke@test.local"
  git -C "$tmp" config user.name  "Smoke Test"

  # Minimal commit so the repo is valid and worktree add works
  touch "$tmp/README"
  git -C "$tmp" add README
  git -C "$tmp" commit -q -m "init"

  # Simulate glassdesk install: create .claude/hooks with stub .cjs files.
  # We do NOT run `npx glassdesk init` — stubs are sufficient to test the wrapper.
  mkdir -p "$tmp/.claude/hooks"
  _write_hook_stub "$tmp/.claude/hooks/session-init.cjs"
  _write_hook_stub "$tmp/.claude/hooks/session-end.cjs"
  _write_hook_stub "$tmp/.claude/hooks/dev-rules-reminder.cjs"

  SCRATCH_REPO="$tmp"
  SCRATCH_HOOKS="$tmp/.claude/hooks"
}

# _write_hook_stub <path>
# Writes a minimal CJS stub that exits 0 immediately.
_write_hook_stub() {
  local hook_path="$1"
  printf '%s\n' '// glassdesk smoke-test stub — exits 0.' \
                'process.exit(0);' > "$hook_path"
}

# setup_scratch_worktree <main_repo_path> <worktree_name>
# Creates a git worktree under <main_repo_path>/.claude/worktrees/<name>.
# Sets global: SCRATCH_WORKTREE
setup_scratch_worktree() {
  local main="$1"
  local name="${2:-wt-smoke}"
  local wt_path="$main/.claude/worktrees/$name"
  mkdir -p "$main/.claude/worktrees"
  git -C "$main" worktree add -q "$wt_path" -b "smoke/$name" 2>/dev/null || \
    git -C "$main" worktree add -q "$wt_path"
  SCRATCH_WORKTREE="$wt_path"
}

# register_scratch_dir <dir>
# Manually register an extra temp dir for cleanup by teardown().
register_scratch_dir() {
  SMOKE_SCRATCH_DIRS+=("$1")
}

# ---------------------------------------------------------------------------
# Teardown
# ---------------------------------------------------------------------------

# teardown
# Removes all scratch directories registered via setup_scratch_repo /
# register_scratch_dir. Call from a trap or at end of script.
teardown() {
  local d
  for d in "${SMOKE_SCRATCH_DIRS[@]}"; do
    [ -n "$d" ] && rm -rf "$d"
  done
  SMOKE_SCRATCH_DIRS=()
}

# ---------------------------------------------------------------------------
# Case runner
# ---------------------------------------------------------------------------

# run_case <case_num> <function_name>
# Runs function_name directly (no subshell) so that scratch dirs accumulate
# in SMOKE_SCRATCH_DIRS for teardown(). Captures stdout+stderr via a temp
# file to suppress noise on PASS; prints them only on FAIL.
# Each case function must use `return 0/1` (not `exit`) for pass/fail.
run_case() {
  local num="$1"
  local fn="$2"
  local label="case${num}"
  local out_file
  out_file=$(mktemp)
  local exit_code=0

  "$fn" >"$out_file" 2>&1 || exit_code=$?

  if [ "$exit_code" -eq 0 ]; then
    echo "[${label}] PASS"
    SMOKE_PASS_COUNT=$((SMOKE_PASS_COUNT + 1))
  else
    echo "[${label}] FAIL: ${fn} returned exit ${exit_code}"
    # Print captured output for diagnosis, indented.
    if [ -s "$out_file" ]; then
      sed 's/^/  /' "$out_file"
    fi
    SMOKE_FAIL_COUNT=$((SMOKE_FAIL_COUNT + 1))
  fi

  rm -f "$out_file"
  # Teardown scratch dirs created by this case to prevent cross-contamination.
  teardown
}

# print_summary — call at the end of the test script.
print_summary() {
  echo ""
  echo "=== Smoke Results: ${SMOKE_PASS_COUNT} passed, ${SMOKE_FAIL_COUNT} failed ==="
  if [ "$SMOKE_FAIL_COUNT" -gt 0 ]; then
    return 1
  fi
  return 0
}
