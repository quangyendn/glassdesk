# Phase 1 — Path rewrite at npx install/update

## Context links

- Plan: `plans/260428-1326-fix-plugin-path-resolution-npx-install/plan.md`
- Research: `plans/260428-1326-fix-plugin-path-resolution-npx-install/research/01-plugin-path-conventions.md`
- Bugs: claude-code #9354 (markdown placeholder broken), #46696 (subagent env inheritance)

## Overview

After `copyPluginFiles()` writes plugin markdown into `<project>/.claude/`, walk all `.md` files and rewrite literal `$GD_PLUGIN_PATH` → `${CLAUDE_PROJECT_DIR}/.claude`. Removes runtime env-var dependency in npx-installed copies. Subagent-safe.

## Key Insights

- `CLAUDE_PROJECT_DIR` is built-in, inherited by subagents. `GD_PLUGIN_PATH` is not (#46696).
- npx install lays plugin contents directly under `<project>/.claude/`, so `${CLAUDE_PROJECT_DIR}/.claude` is the correct absolute prefix.
- Marketplace bundle source must stay unchanged — runtime resolution still works in parent session and that's the path marketplace users take.
- Manifest `files[]` already enumerates copied files; rewrite operates on that same set.

## Requirements

- Rewrite only `.md` files under `<project>/.claude/` (recursive).
- Idempotent: running on already-rewritten files is a no-op.
- Token boundary: regex `\$GD_PLUGIN_PATH\b` to avoid future-proof collisions.
- Run on both `init` and `update` flows.
- Dry-run flag (`--dry-run`) must report rewrite count without writing.

## Architecture

New helper `rewritePluginPathRefs(claudeDir, { dryRun })` in `bin/cli.js`. Called from `runInstall()` after `copyPluginFiles()` succeeds, before `writeManifest()` (so manifest reflects post-rewrite state).

## Related code files

- `/Users/yen.nq/Projects/indie/asdlc/glassdesk/bin/cli.js` — modify (add helper + call site).
- `/Users/yen.nq/Projects/indie/asdlc/glassdesk/tests/integration.test.js` — modify (add assertion).
- `/Users/yen.nq/Projects/indie/asdlc/glassdesk/plugins/glassdesk/commands/plan.md` — reference only (no edit; bundle stays as-is).
- `/Users/yen.nq/Projects/indie/asdlc/glassdesk/plugins/glassdesk/commands/plan/hard.md` — reference only.
- `/Users/yen.nq/Projects/indie/asdlc/glassdesk/plugins/glassdesk/skills/planning/SKILL.md` — reference only.
- `/Users/yen.nq/Projects/indie/asdlc/glassdesk/plugins/glassdesk/skills/planning/references/plan-organization.md` — reference only.

## Implementation Steps

1. Add helper near top of `bin/cli.js` (after existing fs/path requires):

```js
const TOKEN_RE = /\$GD_PLUGIN_PATH\b/g;
const REPLACEMENT = '${CLAUDE_PROJECT_DIR}/.claude';

function rewritePluginPathRefs(claudeDir, { dryRun }) {
  const stack = [claudeDir];
  let rewritten = 0, scanned = 0;
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { stack.push(full); continue; }
      if (!entry.name.endsWith('.md')) continue;
      scanned++;
      const src = fs.readFileSync(full, 'utf8');
      if (!TOKEN_RE.test(src)) continue;
      TOKEN_RE.lastIndex = 0;
      const out = src.replace(TOKEN_RE, REPLACEMENT);
      if (!dryRun) fs.writeFileSync(full, out);
      rewritten++;
    }
  }
  return { scanned, rewritten };
}
```

2. In `runInstall()`, after `copyPluginFiles(...)` returns and before `writeManifest(...)`:

```js
const rw = rewritePluginPathRefs(claudeDir, { dryRun });
console.log(`  rewrote $GD_PLUGIN_PATH in ${rw.rewritten}/${rw.scanned} .md files`);
```

3. Verify both `init` and `update` paths call the same `runInstall()` (current code does — single path).

4. Add to `tests/integration.test.js`:

```js
test('init: no .md file under .claude/ contains $GD_PLUGIN_PATH', async () => {
  // ... run init ...
  const { stdout } = await execFile('grep', ['-rL', '$GD_PLUGIN_PATH', path.join(tmp, '.claude')]);
  // assert no match: walk .md files, none contain the token
});
```

Use Node walk instead of `grep` for portability (Windows CI). Recursively read all `.md`, assert none contain `/\$GD_PLUGIN_PATH\b/`.

5. Manual smoke test (DOC, not automated): in a real Claude Code session post-init, run `/plan test`, verify subagent `set-active-plan.cjs` invocation succeeds. If `${CLAUDE_PROJECT_DIR}` does not interpolate inside markdown bash blocks, fall back to bare `.claude/scripts/...` (relies on cwd contract).

## Todo list

### Implementation
- [x] Add `rewritePluginPathRefs` helper to `bin/cli.js`
- [x] Wire call site in `runInstall()` post-copy
- [x] Confirm `update` flow exercises same path

### Tests (per validation summary 2026-04-28)
- [x] **Test 1 — init basic:** After `init`, no `.md` under `.claude/` contains `$GD_PLUGIN_PATH` AND `${CLAUDE_PROJECT_DIR}/.claude` count ≥ 4. Node-walk based (no shell `grep`).
- [x] **Test 2 — subagent env-isolation:** Spawn child process with `env={CLAUDE_PROJECT_DIR: tmpProject}` only (no `GD_PLUGIN_PATH`). Execute the rewritten `node "${CLAUDE_PROJECT_DIR}/.claude/scripts/set-active-plan.cjs" <plan>` line via `bash -c` (so shell expands `${CLAUDE_PROJECT_DIR}`). Assert exit 0 and active plan was written. Verifies fix solves bug #46696.
- [x] **Test 3 — update tampered re-rewrite:** After `init`, overwrite a target `.md` to contain `$GD_PLUGIN_PATH` again. Run `update --yes`. Assert content rewritten back to `${CLAUDE_PROJECT_DIR}/.claude`.
- [x] **Test 4 — update idempotent:** Run `init` then `update --yes` twice. Assert second `update` reports `rewrote 0/N` (or stdout marker indicating no rewrite occurred).
- [x] **Test 5 — bundle invariant:** Scan `<repo>/plugins/glassdesk/**/*.md` from repo root. Assert `$GD_PLUGIN_PATH` present in EXACTLY the 4 known files (`commands/plan.md`, `commands/plan/hard.md`, `skills/planning/SKILL.md`, `skills/planning/references/plan-organization.md`). Guards source bundle against accidental contamination.
- [x] **Test 6 — dry-run no-write:** Snapshot `.claude/` content hashes. Run `init --yes --dry-run` against a fresh dir, then run again with `update --yes --dry-run` against an existing install. Assert no file written; stdout includes rewrite count.

### Manual smoke test
- [ ] Manual: `/plan` from subagent post-init (real Claude Code session)
- [ ] If `${CLAUDE_PROJECT_DIR}` interpolation fails inside markdown bash: fall back to project-relative `.claude/scripts/...` and re-run all 6 tests

## Success Criteria

- After `node bin/cli.js init` in a clean tmp project, no `.md` under `.claude/` contains `$GD_PLUGIN_PATH`.
- `node bin/cli.js update` is idempotent (rewrite count = 0 on second run).
- Existing integration tests pass.
- New test passes.

## Risk Assessment

- `${CLAUDE_PROJECT_DIR}` interpolation inside markdown unverified. Mitigation: smoke test before declaring done; fallback ready.
- File walk on large `.claude/` slow. Mitigation: trivial — directory has ~50 files.
- Concurrent `init` invocations could double-write. Existing code does not lock; out of scope.

## Security Considerations

- Regex operates on plugin-author-controlled markdown only. No user input. No injection vector.
- No new file-system permissions required.

## Next steps

Proceed to Phase 2 (first-writer-wins guard) once smoke test confirms `${CLAUDE_PROJECT_DIR}` works.

## Rollback

Revert single commit. `update` on existing installs re-copies original markdown from bundle (which still contains `$GD_PLUGIN_PATH`) → reverts state.
