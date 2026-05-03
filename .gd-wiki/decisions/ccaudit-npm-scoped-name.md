---
title: "ccaudit npm Package Scoped to @yennqdn/ccaudit"
updated: 2026-05-03
tags: [category/decision, ccaudit, npm, publishing]
summary: "The ccaudit npm package is published as @yennqdn/ccaudit (scoped) because the unscoped name ccaudit is blocked by npm's name-similarity policy due to the existing cc-audit package."
---

The ccaudit npm package is published under the scoped name `@yennqdn/ccaudit`, not the unscoped `ccaudit`.

## Problem

Attempting to publish under the unscoped name `ccaudit` returns HTTP 403 from the npm registry. The registry's name-similarity policy treats `ccaudit` as too close to the existing package `cc-audit` and blocks the PUT.

## Decision

Publish under the scoped name `@yennqdn/ccaudit`. Scoped packages require `--access public` to be publicly installable — already codified in the publish command in `PUBLISHING.md`.

Do not attempt to revert to the unscoped name — it will fail. Future maintainers should use `@yennqdn/ccaudit` in all documentation, install instructions, and npx invocations.

## Consequences

- `npx -y @yennqdn/ccaudit` is the canonical one-shot invocation
- The scoped name is slightly more verbose in documentation but causes no functional difference
- Both `package.json` and `.claude-plugin/plugin.json` must keep their `version` fields in sync on every release (see `PUBLISHING.md`)

## Related Pages

- [[ccaudit]] — feature page with install instructions and pattern catalog
