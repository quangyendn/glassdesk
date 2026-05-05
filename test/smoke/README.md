# Smoke Tests — Worktree Hook Bootstrap

End-to-end smoke tests for the glassdesk worktree hook bootstrap wrapper
(`wrapHookCommand` in `bin/cli.js`).

## Prerequisites

| Requirement | Minimum version | Check |
|-------------|----------------|-------|
| bash | 3.2+ (macOS `/bin/bash`) | `bash --version` |
| git | 2.5+ (worktree + `--git-common-dir` support) | `git --version` |
| node | 18+ | `node --version` |

No `npm install`, no `npx glassdesk init`, no `claude` binary required for
the automated cases. The harness manually creates `.claude/hooks/*.cjs` stubs
to simulate an installed project.

## Run

```bash
# From the repo root:
bash test/smoke/worktree-bootstrap.sh

# Or from the smoke dir directly:
cd test/smoke && bash worktree-bootstrap.sh
```

## Output

Each case prints one line:

```
[case01] PASS
[case02] PASS
[case03] PASS
[case04] PASS
[case05] PASS
[case06] PASS

=== Smoke Results: 6 passed, 0 failed ===
```

On failure, diagnostic lines are indented under the FAIL line:

```
[case01] FAIL: case_01_clean_worktree returned exit 1
  ASSERT FAIL: not a symlink: /tmp/tmp.XYZ/.claude/worktrees/wt-01/.claude/hooks
```

Exit code is `0` when all pass, `1` when any fail.

## Cases

| Case | Description | Automated? |
|------|-------------|------------|
| 01 | Clean worktree — wrapper bootstraps hooks symlink on first run | Yes |
| 02 | Idempotent reentry — second run skips bootstrap, symlink unchanged | Yes |
| 03 | Stale symlink heal — deleted hooks dir causes graceful degradation; restored dir causes re-bootstrap | Yes |
| 04 | Non-git cwd — wrapper exits 0 or 1 with no symlink created (graceful degradation, no MODULE_NOT_FOUND) | Yes |
| 05 | Concurrent sessions — two simultaneous wrapper invocations both succeed | Yes |
| 06 | Dual-install (marketplace + npx) — settings.local.json structure validated; worktree run confirmed | Partial (see below) |

## Manual Verification — Real `claude` Session

Cases 01 and 06 have automated equivalents above, but full verification
requires a real Claude Code session.

### case_01 manual

```bash
cd /path/to/your/project
npx glassdesk init
git worktree add ./.claude/worktrees/manual-test
cd ./.claude/worktrees/manual-test
claude
```

Expected:
- No `MODULE_NOT_FOUND` error in session startup output.
- `GD_SESSION_ID` is set in the session environment
  (visible via `/ask "echo $GD_SESSION_ID"` or `/scout`).
- Slash commands resolve from `.claude/commands/` (proves phase-03 symlinks work).

### case_06 manual (dual install)

```bash
# Step 1: install via marketplace
claude marketplace install glassdesk

# Step 2: also init via npx (simulates dual install)
cd /path/to/your/project
npx glassdesk init

# Step 3: open a worktree
git worktree add ./.claude/worktrees/dual-test
cd ./.claude/worktrees/dual-test
claude
```

Expected:
- Session starts cleanly (no `MODULE_NOT_FOUND`).
- Only one set of hook messages fires — `GD_PLUGIN_PATH` first-writer-wins
  guard (`plugin-path-resolution-fix` decision) prevents double-fire.
- `echo $GD_PLUGIN_PATH` shows the path that won (marketplace or npx).
- No duplicate session-init log lines.

## Internals

### `lib.sh`

Shared helpers:

- `setup_scratch_repo` — `git init` + stub hooks in a `mktemp -d`.
- `setup_scratch_worktree <main> <name>` — `git worktree add`.
- `register_scratch_dir <dir>` — add extra temp dir for cleanup.
- `teardown` — `rm -rf` all registered scratch dirs (called via `trap EXIT`).
- `assert_symlink_target`, `assert_file_exists`, `assert_not_exists`, etc.
- `run_case <num> <fn>` — runs fn, prints `[caseN] PASS/FAIL`.
- `print_summary` — prints totals; exits 1 if any failed.

### Wrapper invocation

The tests call `build_wrapper` once per hook file at the top of
`worktree-bootstrap.sh`. The result is a single-line shell command that is
passed to `bash -c` with `CLAUDE_PROJECT_DIR` set to the worktree path
(mimicking what Claude Code sets before dispatching hooks).

### Why bash stubs, not real glassdesk hooks?

The wrapper is purely a shell bootstrap — it only checks for a symlink and
optionally `exec`s a node file. The node file's behaviour is irrelevant for
testing the wrapper. Stubs (`process.exit(0)`) provide the minimal surface
area needed without requiring a full install.

## Platform Notes

- **macOS `/bin/bash` 3.2**: all scripts use only POSIX sh + bash 3.2 syntax.
  No `declare -A`, no `[[ ]]`, no `$''` quoting. Arrays are used only for
  accumulating scratch dirs (bash 3.2 supports indexed arrays).
- **`ln -sfn` race (case_05)**: `ln -sfn` is not atomic. Two concurrent
  sessions write the same target — the race is benign (last writer wins, same
  value). See `research/02-wrapper-compat.md §C.2`.
- **`readlink` portability**: `readlink` without `-f`/`-e` returns the raw
  symlink target (one level). This is sufficient because we assert the exact
  value written by `ln -sfn`.

## Troubleshooting

| Symptom | Likely cause |
|---------|-------------|
| `FATAL: could not build WRAPPER_SESSION_INIT` | `bin/cli.js` is missing `wrapHookCommand` export — run phases 01–02 first |
| `git worktree add` fails | git < 2.5 or scratch repo has no commits |
| case_05 flakes | Slow filesystem; try running twice — the race is benign but timing-sensitive |
| node `ERR_MODULE_NOT_FOUND` on hook stub | `process.exit(0)` stub is valid CJS; check node version |
| case_04 exits 1 (not 0) | Expected. The wrapper ends with `[ -e "$H" ] && exec node "$H"` — when no git repo is found, `$H` does not exist and `[ -e "$H" ]` exits 1, short-circuiting the `&&`. Claude Code treats non-zero hook exit as a warning; the session continues. Exit codes 0 and 1 are both accepted. Exit 2+ indicates a bash syntax error. |
