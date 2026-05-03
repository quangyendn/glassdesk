# PUBLISHING.md — ccaudit npm release runbook

Manual flow. No CI automation (yet). Run from the repo with a clean git tree on `main`.

## 0. Pre-flight

- [ ] On `main`, clean tree: `git status` shows nothing.
- [ ] `package.json` `version` === `.claude-plugin/plugin.json` `version`.
- [ ] CHANGELOG entry added for this version (if maintained).
- [ ] Logged in to npm: `npm whoami` returns the publishing account.
- [ ] Baseline sanity: `bash plugins/ccaudit/skills/audit/scripts/audit.sh` exits 0.
- [ ] Node wrapper sanity: `node plugins/ccaudit/bin/ccaudit.js` exits 0 and matches baseline output.

## 1. Pick the package name

Check availability:

```bash
npm view ccaudit
```

- **404 → unscoped name is free.** Keep `package.json` `"name": "ccaudit"`. Continue to step 2.
- **Returns metadata → name taken.** Edit `package.json`:
  ```json
  "name": "@quangyendn/ccaudit"
  ```
  Update the README's `Quick start` section to use the scoped name as primary. Continue to step 2.

(Scoped packages always require `--access public` to be public — already in the publish command below.)

## 2. Bump version (if not already done)

Both files must match:

- `plugins/ccaudit/package.json` → `"version"`
- `plugins/ccaudit/.claude-plugin/plugin.json` → `"version"`

Follow semver. New entry point + script refactor = minor bump. Patch for fixes only.

## 3. Dry-run

```bash
cd plugins/ccaudit
npm pack --dry-run
```

Confirm the file list contains:

- `bin/ccaudit.js`
- `package.json`, `README.md`
- `.claude-plugin/plugin.json`
- `skills/audit/SKILL.md`, `skills/audit/scripts/audit.sh`, `skills/audit/scripts/analyze-session.py`
- All 20 `skills/audit/references/patterns/*.md` + `patterns.md` + `fixes.md`

Confirm it does NOT contain: `node_modules`, `.git`, repo-root files (`CLAUDE.md`, root `package.json`, etc.).

Tarball size should be ~20–60 KB.

## 4. Publish

```bash
cd plugins/ccaudit
npm publish --access public
```

`--access public` is harmless for unscoped packages and required for scoped packages.

## 5. Post-publish smoke

From a fresh tmpdir, ignoring local install:

```bash
cd "$(mktemp -d)"
npx -y ccaudit@latest         # or @quangyendn/ccaudit@latest
echo "exit=$?"
```

Expected: report renders, exit 0. If broken, jump to step 7 (yank).

## 6. Tag the release

```bash
git tag ccaudit-v$(node -p "require('./plugins/ccaudit/package.json').version")
git push --tags
```

## 7. Yank procedure (if broken release shipped)

Within 72 hours of publish:

```bash
npm unpublish ccaudit@<version>
```

After 72 hours, unpublish is forbidden — use deprecate instead:

```bash
npm deprecate ccaudit@<version> "broken — use @latest"
```

Then patch and re-publish with bumped version.

## Notes

- `os: ["darwin", "linux"]` in `package.json` blocks Windows native installs at `npm install` time. WSL works (it reports as Linux).
- `bin/ccaudit.js` does not need a build step — it ships verbatim.
- The Node wrapper requires only the standard library (`child_process`, `path`). Do not add npm dependencies without revisiting the value-vs-supply-chain trade-off.
