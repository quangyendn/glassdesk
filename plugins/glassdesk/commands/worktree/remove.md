---
description: Unlink managed symlinks and remove a git worktree safely
argument-hint: <worktree-path>
---

Follow these steps exactly. This is a destructive operation — every gate must be honoured.

**Step 0 — Validate argument.**
If `$1` is empty, print:
```
Usage: /worktree:remove <worktree-path>
```
Stop. Do not proceed.

**Step 1 — Cwd guard.**
Resolve the absolute path of the target worktree using the first available method:
```bash
TARGET=$(realpath "$1" 2>/dev/null || readlink -f "$1" 2>/dev/null || python3 -c "import os,sys; print(os.path.abspath(sys.argv[1]))" "$1")
CWD_TOPLEVEL=$(git rev-parse --show-toplevel 2>/dev/null)
MAIN_ROOT=$(dirname "$(git rev-parse --git-common-dir)")
```
If `CWD_TOPLEVEL` equals `TARGET`, print exactly:
```
Error: cwd is inside the target worktree (<CWD_TOPLEVEL>). Cannot remove. cd to the main repo at <MAIN_ROOT> (or another worktree) and re-run /worktree:remove <worktree-path>.
```
Stop. Do not proceed.

**Step 2 — Discover symlinks.**
Read `<TARGET>/.gd-worktree-symlinks.lock` if it exists:
- Lock present → parse it as JSON; the `created[]` array is the authoritative list of symlink names to check.
- Lock absent (or JSON parse error) → fall back to reading `.claude/worktree-symlinks.json` in the main repo, then the plugin default at `$GD_PLUGIN_PATH/config/worktree-symlinks.json`. Emit this warning:
  > `Warning: no .gd-worktree-symlinks.lock found in <TARGET>. Falling back to current config; if config changed since the worktree was created, some links may be missed.`

For each name in the discovered list, `lstat <TARGET>/<name>`:
- Is a symbolic link → call `readlinkSync`, verify it resolves to `<MAIN_ROOT>/<name>`. Add to the candidate-unlink list.
- Not a symbolic link or missing → skip silently (already unlinked or never created).

**Step 3 — Confirm.**
Print the candidate list in this format:
```
The following symlinks will be removed from <TARGET>:
  - <TARGET>/plans → <MAIN_ROOT>/plans
Then `git worktree remove <TARGET>` will run.
Proceed? [y/N]
```
Wait for user reply. Affirmative tokens (case-insensitive): `y`, `yes`, `proceed`. Anything else (including empty input) → print:
```
Aborted — no changes made.
```
Stop. Do not proceed.

**Step 4 — Unlink.**
For each candidate in the confirmed list, in order:
1. Call `fs.unlinkSync(<TARGET>/<name>)`. Do NOT use `fs.rmSync`. Do NOT use `rm -rf` or any shell remove command.
2. Immediately verify `fs.existsSync(<MAIN_ROOT>/<name>)` is still `true`. If it returns `false`: print a hard error (this should never happen — `unlinkSync` on a symlink never touches the target directory) and stop without running `git worktree remove`.
3. On any unlink failure: print the error message, then print:
   ```
   Aborted — git worktree remove NOT run. <N> link(s) successfully unlinked before failure: <list>.
   ```
   Stop. Do not proceed. The user can inspect and re-run; links already removed will be skipped at step 2 on the next run.

**Step 5 — Remove worktree.**
Run `git worktree remove "$TARGET"` (without `--force`). Forward git's stdout and stderr verbatim. If git refuses (e.g. uncommitted changes exist), surface the error as-is. The symlinks are already removed, so the user can either resolve the blocking issue and re-run `/worktree:remove`, or run `git worktree remove --force "$TARGET"` manually — either way step 2 will no-op on the already-absent links.

**Step 6 — Report.**
On success print:
```
Removed worktree <TARGET>
Unlinked: <list of full symlink paths that were removed>
Main-repo targets preserved: <list of main-repo directory paths verified>
```
