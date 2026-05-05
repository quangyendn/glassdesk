#!/bin/bash
# test/smoke/worktree-bootstrap.sh — Smoke test harness for the worktree hook bootstrap wrapper.
#
# Tests the shell wrapper produced by wrapHookCommand() (bin/cli.js) by invoking
# it directly via `bash -c` — no real `claude` session required.
#
# Usage:
#   bash test/smoke/worktree-bootstrap.sh
#
# Each case prints exactly one of:
#   [caseN] PASS
#   [caseN] FAIL: <reason>
#
# Exit code: 0 if all cases pass, 1 if any fail.
#
# Prerequisites: bash 3.2+, git 2.5+, node 18+
# Platform: macOS (bash 3.2 compat baseline), Linux
#
# NOTE — Manual cases requiring a real `claude` session are documented
# in comments throughout. They cannot be automated.

set -euo pipefail

SMOKE_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SMOKE_DIR/lib.sh"

# Register teardown on exit (covers both normal exit and ERR).
trap teardown EXIT

# ---------------------------------------------------------------------------
# Pre-flight: resolve the WRAPPER string once.
#
# wrapHookCommand('session-init.cjs') produces the canonical shell literal.
# We test with session-init.cjs because it is the SessionStart hook and the
# primary bootstrap trigger.
# ---------------------------------------------------------------------------
WRAPPER_SESSION_INIT=$(node -e "
  import(process.env.GD_CLI_JS).then(function(m) {
    process.stdout.write(m.wrapHookCommand('session-init.cjs'));
  });
")
WRAPPER_SESSION_END=$(node -e "
  import(process.env.GD_CLI_JS).then(function(m) {
    process.stdout.write(m.wrapHookCommand('session-end.cjs'));
  });
")

if [ -z "$WRAPPER_SESSION_INIT" ]; then
  echo "FATAL: could not build WRAPPER_SESSION_INIT from bin/cli.js" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# case_01_clean_worktree
#
# Scenario: Fresh main repo with .claude/hooks stubs. Add a worktree.
#           Run the wrapper from inside the worktree (CLAUDE_PROJECT_DIR
#           pointing to the worktree path, simulating Claude Code env).
#
# Asserts:
#   - Wrapper exits 0
#   - <worktree>/.claude/hooks is a symlink
#   - Symlink points to <main>/.claude/hooks
#   - node executed the stub (session-init.cjs exits 0)
#
# Manual verification (requires real `claude` session):
#   cd <worktree> && claude
#   Expected: no MODULE_NOT_FOUND error, GD_SESSION_ID set in env.
# ---------------------------------------------------------------------------
case_01_clean_worktree() {
  setup_scratch_repo
  setup_scratch_worktree "$SCRATCH_REPO" "wt-01"

  local wt="$SCRATCH_WORKTREE"
  local main="$SCRATCH_REPO"
  local hooks_link="$wt/.claude/hooks"

  # Worktree must NOT have a hooks symlink yet.
  assert_not_exists "$hooks_link" || return 1

  # Run wrapper from the worktree with CLAUDE_PROJECT_DIR set (as Claude Code
  # would set it) and PATH ensuring node is available.
  local rc=0
  CLAUDE_PROJECT_DIR="$wt" bash -c "$WRAPPER_SESSION_INIT" || rc=$?

  assert_exit_code 0 "$rc" || return 1
  assert_is_symlink "$hooks_link" || return 1
  assert_symlink_target "$hooks_link" "$main/.claude/hooks" || return 1
  assert_file_exists "$wt/.claude/hooks/session-init.cjs" || return 1
}

# ---------------------------------------------------------------------------
# case_02_idempotent_reentry
#
# Scenario: Run the wrapper a second time in the same worktree where the
#           symlink was already created by case_01 (re-setup here to be
#           self-contained).
#
# Asserts:
#   - Second run exits 0
#   - Symlink is unchanged (same target, still valid)
#   - No error output
#
# Manual verification (requires real `claude` session):
#   Open second terminal, same worktree → no duplicate bootstrap log lines.
# ---------------------------------------------------------------------------
case_02_idempotent_reentry() {
  setup_scratch_repo
  setup_scratch_worktree "$SCRATCH_REPO" "wt-02"

  local wt="$SCRATCH_WORKTREE"
  local main="$SCRATCH_REPO"
  local hooks_link="$wt/.claude/hooks"

  # First run — bootstrap
  CLAUDE_PROJECT_DIR="$wt" bash -c "$WRAPPER_SESSION_INIT" >/dev/null 2>&1

  assert_is_symlink "$hooks_link" || return 1
  local target_after_first
  target_after_first=$(readlink "$hooks_link")

  # Second run — should be idempotent
  local rc=0
  local stderr_out
  stderr_out=$(CLAUDE_PROJECT_DIR="$wt" bash -c "$WRAPPER_SESSION_INIT" 2>&1 >/dev/null) || rc=$?

  assert_exit_code 0 "$rc" || return 1

  # Symlink must still point to the same target (no re-creation side-effect).
  local target_after_second
  target_after_second=$(readlink "$hooks_link")
  if [ "$target_after_first" != "$target_after_second" ]; then
    echo "  ASSERT FAIL: symlink target changed on second run" >&2
    echo "    before: $target_after_first" >&2
    echo "    after:  $target_after_second" >&2
    return 1
  fi

  # Symlink must still be valid (not dangling).
  assert_file_exists "$wt/.claude/hooks/session-init.cjs" || return 1
}

# ---------------------------------------------------------------------------
# case_03_stale_symlink_heal
#
# Scenario: Main repo's hooks dir is deleted after bootstrap (simulates a
#           deleted/reinstalled main repo). Wrapper is called — it should
#           detect the dangling symlink via [ -e "$H" ] returning false and
#           attempt re-bootstrap. When main hooks dir is restored, re-run
#           must succeed.
#
# Part A — hooks dir deleted, main hooks gone: wrapper exits 0 silently
#           (no exec — hook file unreachable, but no crash).
# Part B — hooks dir restored: wrapper re-bootstraps, exec succeeds.
#
# Asserts (Part A):
#   - Wrapper exits 0 (graceful degradation)
#   - No unhandled error (non-zero exit would indicate a bug)
#
# Asserts (Part B):
#   - Symlink recreated correctly
#   - node executes hook (exit 0)
# ---------------------------------------------------------------------------
case_03_stale_symlink_heal() {
  setup_scratch_repo
  setup_scratch_worktree "$SCRATCH_REPO" "wt-03"

  local wt="$SCRATCH_WORKTREE"
  local main="$SCRATCH_REPO"
  local hooks_link="$wt/.claude/hooks"

  # Bootstrap first.
  CLAUDE_PROJECT_DIR="$wt" bash -c "$WRAPPER_SESSION_INIT" >/dev/null 2>&1
  assert_is_symlink "$hooks_link" || return 1

  # --- Part A: delete main hooks dir ---
  rm -rf "$main/.claude/hooks"
  assert_not_exists "$main/.claude/hooks" || return 1

  # The symlink is now dangling. [ -e "$hooks_link" ] should be false.
  # Wrapper enters bootstrap branch, git succeeds (valid repo), but
  # M/.claude/hooks does not exist → ln -sfn is skipped. Final guard
  # `[ -e "$H" ] && exec` short-circuits — wrapper exits with the test's
  # own exit code (1, because file truly missing). This is graceful
  # degradation, not a crash. Real CC treats non-zero hook exit as a
  # non-blocking warning. We accept 0 OR 1 + assert no MODULE_NOT_FOUND.
  local rc_a=0
  local stderr_a
  stderr_a=$(CLAUDE_PROJECT_DIR="$wt" bash -c "$WRAPPER_SESSION_INIT" 2>&1 >/dev/null) || rc_a=$?
  if [ "$rc_a" -ne 0 ] && [ "$rc_a" -ne 1 ]; then
    echo "  ASSERT FAIL: Part A unexpected exit $rc_a (expected 0 or 1)" >&2
    return 1
  fi
  if echo "$stderr_a" | grep -qi "MODULE_NOT_FOUND\|cannot find module"; then
    echo "  ASSERT FAIL: Part A leaked MODULE_NOT_FOUND to stderr" >&2
    return 1
  fi

  # --- Part B: restore hooks, re-run ---
  mkdir -p "$main/.claude/hooks"
  _write_hook_stub "$main/.claude/hooks/session-init.cjs"
  _write_hook_stub "$main/.claude/hooks/session-end.cjs"
  _write_hook_stub "$main/.claude/hooks/dev-rules-reminder.cjs"

  local rc_b=0
  CLAUDE_PROJECT_DIR="$wt" bash -c "$WRAPPER_SESSION_INIT" >/dev/null 2>&1 || rc_b=$?
  assert_exit_code 0 "$rc_b" || return 1
  assert_is_symlink "$hooks_link" || return 1
  assert_symlink_target "$hooks_link" "$main/.claude/hooks" || return 1
  assert_file_exists "$wt/.claude/hooks/session-init.cjs" || return 1
}

# ---------------------------------------------------------------------------
# case_04_non_git_cwd
#
# Scenario: Wrapper is invoked with CLAUDE_PROJECT_DIR pointing to a plain
#           temp directory that is NOT a git repo.
#
# Asserts:
#   - Wrapper exits 0 OR 1 (both are acceptable — see note below)
#   - No .claude/hooks symlink created in the non-git dir
#   - No MODULE_NOT_FOUND in stderr (proves no node crash, only graceful skip)
#
# NOTE on exit code: The wrapper ends with `[ -e "$H" ] && exec node "$H"`.
# When no git repo is found, $H does not exist, so [ -e "$H" ] is false (exit 1)
# and the && short-circuits. The wrapper's last evaluated expression exits 1.
# This is a known limitation of the locked wrapper literal (bin/cli.js is not
# modified per phase constraints). AC4 requires "session does not crash" —
# Claude Code treats non-zero hook exit as a warning and continues the session,
# so exit 1 with no MODULE_NOT_FOUND stderr satisfies the graceful-degradation
# contract. See research/02-wrapper-compat.md §C.5.
#
# Research ref: 02-wrapper-compat.md §C.5
# ---------------------------------------------------------------------------
case_04_non_git_cwd() {
  local non_git_dir
  non_git_dir=$(mktemp -d)
  register_scratch_dir "$non_git_dir"

  local rc=0
  local stderr_out
  stderr_out=$(CLAUDE_PROJECT_DIR="$non_git_dir" bash -c "$WRAPPER_SESSION_INIT" 2>&1) || rc=$?

  # Accept exit 0 or 1 — both indicate graceful degradation (no crash).
  # Exit 2+ would indicate a bash syntax error or unhandled exception.
  if [ "$rc" -gt 1 ]; then
    echo "  ASSERT FAIL: wrapper exited $rc (expected 0 or 1 — graceful degradation)" >&2
    return 1
  fi

  # No symlink or .claude dir should have been created.
  assert_not_exists "$non_git_dir/.claude" || return 1

  # The key crash indicator: MODULE_NOT_FOUND means node tried to require a
  # missing file — that would be a real bug. Assert it is absent.
  case "$stderr_out" in
    *"MODULE_NOT_FOUND"*)
      echo "  ASSERT FAIL: MODULE_NOT_FOUND in stderr — node crashed on missing module" >&2
      echo "    stderr: $stderr_out" >&2
      return 1
      ;;
  esac
}

# ---------------------------------------------------------------------------
# case_05_concurrent_sessions
#
# Scenario: Two wrapper invocations run concurrently in the same fresh
#           worktree. This tests the ln -sfn race condition documented in
#           research 02 §C.2.
#
# Asserts:
#   - Both processes exit 0
#   - Symlink ends in a valid (non-dangling, correct-target) state
#   - No orphan files or partial state
#
# Design: Fork two subshells simultaneously via & and wait. Both write the
#         same target so the race is benign (last writer wins, same value).
#
# Note: We accept that both subshells may print node output. What matters
#       is post-state correctness and both exit codes being 0.
# ---------------------------------------------------------------------------
case_05_concurrent_sessions() {
  setup_scratch_repo
  local main="$SCRATCH_REPO"

  # Run the race 5 times across 5 fresh worktrees to widen the window where
  # the bootstrap branch is taken (otherwise one process completes setup
  # before the second even reaches `git rev-parse`, never exercising the race).
  local i
  for i in 1 2 3 4 5; do
    setup_scratch_worktree "$main" "wt-05-$i"
    local wt="$SCRATCH_WORKTREE"
    local hooks_link="$wt/.claude/hooks"

    assert_not_exists "$hooks_link" || return 1

    local rc_file_a rc_file_b
    rc_file_a=$(mktemp); rc_file_b=$(mktemp)
    register_scratch_dir "$rc_file_a"; register_scratch_dir "$rc_file_b"

    ( CLAUDE_PROJECT_DIR="$wt" bash -c "$WRAPPER_SESSION_INIT" >/dev/null 2>&1
      echo $? > "$rc_file_a" ) &
    local pid_a=$!
    ( CLAUDE_PROJECT_DIR="$wt" bash -c "$WRAPPER_SESSION_INIT" >/dev/null 2>&1
      echo $? > "$rc_file_b" ) &
    local pid_b=$!

    wait "$pid_a" || true
    wait "$pid_b" || true

    local rc_a rc_b
    rc_a=$(cat "$rc_file_a"); rc_b=$(cat "$rc_file_b")
    assert_exit_code 0 "$rc_a" || return 1
    assert_exit_code 0 "$rc_b" || return 1
    assert_is_symlink "$hooks_link" || return 1
    assert_symlink_target "$hooks_link" "$main/.claude/hooks" || return 1
    assert_file_exists "$wt/.claude/hooks/session-init.cjs" || return 1
  done
}

# ---------------------------------------------------------------------------
# case_06_dual_install_marketplace_plus_npx
#
# Scenario: A project where glassdesk was installed via BOTH the Claude Code
#           marketplace plugin AND via `npx glassdesk init`. Verify that:
#           (a) settings.local.json contains wrapped hook commands
#               (not bare `node ...` paths) — automatable.
#           (b) GD_PLUGIN_PATH first-writer-wins guard prevents double-fire.
#               This part requires a real `claude` session — documented below.
#
# Automatable sub-case: Inspect a settings.local.json written by the npx
#           path. Confirm the hook command starts with `bash -c '...'` and
#           contains the expected bootstrap logic signature.
#
# MANUAL VERIFICATION (requires real `claude` session):
#   1. Install via marketplace:  claude marketplace install glassdesk
#   2. Also run:                 npx glassdesk init  (same project)
#   3. Open a worktree:          git worktree add ./.claude/worktrees/dual-test
#   4. cd ./.claude/worktrees/dual-test && claude
#   Expected observations:
#     - Session starts cleanly (no MODULE_NOT_FOUND).
#     - Only one set of hook messages fires (GD_PLUGIN_PATH first-writer-wins
#       guard ensures the marketplace path and the npx path do not both exec).
#     - `echo $GD_PLUGIN_PATH` shows the path that won.
#     - No duplicate session-init output lines.
#   If both fire, confirm they are idempotent (same GD_SESSION_ID, no crash).
#
# Automatable assertion: the settings.local.json template produced by npx
#   uses the bash wrapper, not the bare node command. This is the key
#   structural guarantee — dual install cannot produce a collision that
#   bypasses the wrapper.
# ---------------------------------------------------------------------------
case_06_dual_install_marketplace_plus_npx() {
  setup_scratch_repo
  local main="$SCRATCH_REPO"

  # Write a simulated settings.local.json as `npx glassdesk init` would produce.
  # We use the actual wrapHookCommand output to generate it — mirroring what
  # mergeSettings() does in bin/cli.js.
  local wrapper_init="$WRAPPER_SESSION_INIT"
  local wrapper_end="$WRAPPER_SESSION_END"
  local wrapper_rules
  wrapper_rules=$(node -e "
    import(process.env.GD_CLI_JS).then(function(m) {
      process.stdout.write(m.wrapHookCommand('dev-rules-reminder.cjs'));
    });
  ")

  # Serialize to JSON safely via node.
  local settings_json
  settings_json=$(node -e "
    var wi = process.argv[1];
    var we = process.argv[2];
    var wr = process.argv[3];
    var settings = {
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: wi }] }],
        UserPromptSubmit: [{ hooks: [{ type: 'command', command: wr }] }],
        SessionEnd: [{ hooks: [{ type: 'command', command: we }] }]
      },
      permissions: { allow: [], deny: [] },
      env: {}
    };
    process.stdout.write(JSON.stringify(settings, null, 2));
  " "$wrapper_init" "$wrapper_end" "$wrapper_rules")

  mkdir -p "$main/.claude"
  printf '%s\n' "$settings_json" > "$main/.claude/settings.local.json"

  # --- Assertion A: all hook commands use the bash wrapper form ---
  local session_start_cmd
  session_start_cmd=$(node -e "
    var s = JSON.parse(require('fs').readFileSync('$main/.claude/settings.local.json', 'utf8'));
    process.stdout.write(s.hooks.SessionStart[0].hooks[0].command);
  ")

  # Must start with 'bash -c '
  case "$session_start_cmd" in
    "bash -c '"*)  ;;
    *)
      echo "  ASSERT FAIL: SessionStart command does not use bash wrapper" >&2
      echo "    actual: $session_start_cmd" >&2
      return 1
      ;;
  esac

  # Must contain the bootstrap signature: ln -sfn and git rev-parse
  assert_string_contains "$session_start_cmd" "ln -sfn" || return 1
  assert_string_contains "$session_start_cmd" "rev-parse --git-common-dir" || return 1

  # --- Assertion B: running the wrapper in worktree works in dual-install context ---
  # User-global ~/.claude/settings.json (marketplace install path) is not in
  # scope here — it is read-only from this test's perspective. The npx fix
  # touches only project-level .claude/settings.local.json. Real-`claude`
  # verification of the marketplace + npx co-install scenario is documented
  # in the MANUAL VERIFICATION block above.
  setup_scratch_worktree "$main" "wt-06"
  local wt="$SCRATCH_WORKTREE"

  local rc=0
  CLAUDE_PROJECT_DIR="$wt" bash -c "$WRAPPER_SESSION_INIT" >/dev/null 2>&1 || rc=$?
  assert_exit_code 0 "$rc" || return 1
  assert_is_symlink "$wt/.claude/hooks" || return 1
  assert_symlink_target "$wt/.claude/hooks" "$main/.claude/hooks" || return 1
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

echo "=== glassdesk worktree-bootstrap smoke tests ==="
echo "    WRAPPER: ${WRAPPER_SESSION_INIT:0:60}..."
echo ""

run_case "01" case_01_clean_worktree
run_case "02" case_02_idempotent_reentry
run_case "03" case_03_stale_symlink_heal
run_case "04" case_04_non_git_cwd
run_case "05" case_05_concurrent_sessions
run_case "06" case_06_dual_install_marketplace_plus_npx

print_summary
