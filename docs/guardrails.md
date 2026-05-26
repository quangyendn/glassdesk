# Public Repo Guardrails

`glassdesk` is published to npm and hosted on GitHub. To prevent secrets and other sensitive material from leaking into the public history, four enforcement layers run on every contributor's machine **plus** a required CI job on GitHub that cannot be bypassed.

| Layer | Where | What it does |
|---|---|---|
| Pre-commit | `.husky/pre-commit` | `gitleaks protect --staged` + personal-info scan on staged blob (`git show :path`) |
| Commit-msg | `.husky/commit-msg` | `commitlint` (Conventional Commits) + English-only + sensitive-info scan on the message |
| Pre-push | `.husky/pre-push` | `gitleaks detect` over `origin/main..HEAD` |
| Pre-publish | `prepublishOnly` script | Tarball content scan + CHANGELOG check + release-notes sanitiser |
| **CI (required)** | `.github/workflows/guardrails.yml` | `gitleaks` on PR diff + Node scanner on changed files + `npm test`. Re-runs on every PR and on `push` to `main`. |

## What gets blocked

- **Classic secrets** — AWS keys, GitHub tokens, generic `api_key = "…"` assignments, private-key PEM blocks (full gitleaks ruleset).
- **Personal paths** — `/Users/<name>/`, `/home/<name>/`, `C:\Users\<name>\`.
- **Unallowlisted emails** — anything not ending in `@example.com`, `@example.org`, `@anthropic.com`, `@users.noreply.github.com`, or `noreply@github.com`.
- **Internal references** — any string listed in `.guardrails.json → internalRefs` (empty by default; add customer/codenames as needed).
- **Vietnamese commit messages** — per `~/.claude/CLAUDE.md`, commit messages must be in English.
- **Non-Conventional commit subjects** — `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `perf:`, `test:`, `build:`, `ci:`, `style:`, `revert:`.
- **Tarball contents** — `.env*`, `.pem`, `.key`, `.p12`, `.pfx`, `id_rsa*`; warns on `test/`, `tests/`, `plans/`, `.gd-wiki/`, `docs/superpowers/`, `docs/specs/`.

The pre-publish tarball scan deliberately ignores `pathAllowlist`: that allowlist exists for scanner-self-reference files only. Applying it to packaged files would create a release-time blind spot for anything under `templates/`, `plugins/glassdesk/`, or `bin/`.

The pre-commit Node scanner reads the **staged blob** (`git show :<path>`) rather than the working-tree file. Otherwise a contributor could stage sensitive content, revert the working tree to clean content, and slip the leaky blob through the hook.

## Configuration

`.guardrails.json` (committed) controls all custom rules:

```json
{
  "internalRefs": ["acme-corp", "project-redacted"],
  "emailAllowlist": ["@example.com", "@anthropic.com"],
  "pathAllowlist": ["docs/specs/", "templates/"],
  "commitMessage": { "blockVietnamese": true, "requireConventional": true },
  "tarball": {
    "denyExtensions": [".env", ".pem", ".key", ".p12", ".pfx"],
    "warnPathPatterns": ["test/", "plans/", ".gd-wiki/"]
  }
}
```

`.gitleaks.toml` (committed) extends the default gitleaks ruleset and supplies project-wide allowlists for fixture paths and example values.

## Installing `gitleaks`

The hooks shell out to `gitleaks`. If it is not on `PATH`, the hook prints the OS-specific instructions:

```bash
# macOS
brew install gitleaks

# Linux (binary release)
curl -sSfL https://github.com/gitleaks/gitleaks/releases/latest/download/gitleaks_$(uname -s | tr A-Z a-z)_$(uname -m).tar.gz | tar -xz -C /tmp
sudo mv /tmp/gitleaks /usr/local/bin/

# Windows
scoop install gitleaks
```

## Bypassing local hooks

`git commit --no-verify` and `git push --no-verify` skip the local hooks. They exist for emergencies only. **The CI job in `.github/workflows/guardrails.yml` is the real enforcement boundary** — it cannot be bypassed from a contributor machine. Make this check a required status in branch protection settings so PRs cannot merge while it is red.

## Allowlist policy

Path-level skips (`pathAllowlist` in `.guardrails.json` and `paths = [...]` in `.gitleaks.toml`) are reserved for two narrow cases:

1. Files that contain the scanner's own regex text (`.gitleaks.toml`, `.guardrails.json`, `scripts/guardrails/lib/patterns.js`) — these would otherwise self-trigger.
2. Large machine-generated artifacts where line-by-line scanning is noise (`package-lock.json`).

**Do not** add public docs, specs, CHANGELOGs, templates, or any shipped source file to the path allowlist — they remain visible in git history even if they are not in the npm tarball. If a specific value (e.g. a documented example token) is a false positive, add a narrow `regexes` entry to `.gitleaks.toml [allowlist]` for that exact value instead.

A regression test (`tests/guardrails/allowlist-policy.test.js`) fails CI if either condition is violated.

## Layout

```
.husky/
  pre-commit
  commit-msg
  pre-push
scripts/guardrails/
  check-gitleaks.js         # binary presence check
  scan-personal-info.js     # file scanner (staged or --files)
  lint-commit-msg.js        # commit-msg validator
  scan-tarball.js           # pre-publish tarball check
  verify-changelog.js       # pre-publish changelog check
  sanitize-release-notes.js # generates + scans release notes
  lib/
    config.js               # loads .guardrails.json with defaults
    patterns.js             # regex library
    scanner.js              # shared scanning routine
tests/guardrails/           # node --test unit tests
.gitleaks.toml
.guardrails.json
commitlint.config.js
```

## Adding a new rule

1. Add the regex to `scripts/guardrails/lib/patterns.js` with `id`, `description`, `remediation`.
2. Plug it into the loops in `scripts/guardrails/lib/scanner.js`.
3. Add a fixture-driven test in `tests/guardrails/scanner.test.js`.
4. (Optional) Mirror the rule into `.gitleaks.toml` so it also fires on the gitleaks pass.

## Adding an allowlist entry

Prefer narrowing scope in `.guardrails.json` (or `.gitleaks.toml` for gitleaks-specific noise) over disabling rules. Always pair an allowlist change with a short justification in the commit message.
