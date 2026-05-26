# Public Repo Guardrails

`glassdesk` is published to npm and hosted on GitHub. To prevent secrets and other sensitive material from leaking into the public history, three local enforcement layers run on every contributor's machine.

| Layer | Hook | What it does |
|---|---|---|
| Pre-commit | `.husky/pre-commit` | `gitleaks protect --staged` + personal-info scan on staged diff |
| Commit-msg | `.husky/commit-msg` | `commitlint` (Conventional Commits) + English-only + sensitive-info scan on the message |
| Pre-push | `.husky/pre-push` | `gitleaks detect` over `origin/main..HEAD` |
| Pre-publish | `prepublishOnly` script | Tarball content scan + CHANGELOG check + release-notes sanitiser |

## What gets blocked

- **Classic secrets** — AWS keys, GitHub tokens, generic `api_key = "…"` assignments, private-key PEM blocks (full gitleaks ruleset).
- **Personal paths** — `/Users/<name>/`, `/home/<name>/`, `C:\Users\<name>\`.
- **Unallowlisted emails** — anything not ending in `@example.com`, `@example.org`, `@anthropic.com`, `@users.noreply.github.com`, or `noreply@github.com`.
- **Internal references** — any string listed in `.guardrails.json → internalRefs` (empty by default; add customer/codenames as needed).
- **Vietnamese commit messages** — per `~/.claude/CLAUDE.md`, commit messages must be in English.
- **Non-Conventional commit subjects** — `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `perf:`, `test:`, `build:`, `ci:`, `style:`, `revert:`.
- **Tarball contents** — `.env*`, `.pem`, `.key`, `.p12`, `.pfx`, `id_rsa*`; warns on `test/`, `tests/`, `plans/`, `.gd-wiki/`, `docs/superpowers/`, `docs/specs/`.

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

## Bypassing (don't)

`git commit --no-verify` and `git push --no-verify` skip every hook. They exist for emergencies only and should never be used in normal workflow. The long-term backstop is a server-side CI gate (deferred — see `docs/specs/2026-05-26-public-repo-guardrails-design.md` for the rationale).

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
