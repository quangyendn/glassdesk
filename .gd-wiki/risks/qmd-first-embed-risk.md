---
title: "QMD First-Embed 2GB Download"
updated: 2026-04-29
tags: [category/risk, qmd, wiki, storage]
summary: "The first qmd embed on a machine downloads ~2GB of models; /wiki:init must prompt Y/n before invoking it or the download begins silently."
---

The first `qmd embed` invocation on a machine downloads approximately 2GB of local embedding models. This is a one-time, machine-wide download — subsequent projects on the same machine reuse the models.

## Risk

If `/wiki:init` invokes `qmd embed` without warning, the user experiences a silent 2GB download on a potentially metered or slow connection. The download cannot be easily cancelled mid-way without leaving a partial model state.

## Mitigation in /wiki:init

`/wiki:init` must:

1. Detect if first embed: `[ ! -d ~/.qmd/models ]`
2. Print the size warning explicitly
3. Ask Y/n via `AskUserQuestion` before proceeding
4. Abort cleanly on N — leave `.gd-wiki/` and `.config.json` in place so the user can re-run later

If the user declines, they can trigger the embed manually later:

```bash
qmd embed
```

## Storage Location

Models are stored at `~/.local/share/qmd` (QMD default). This location is host-local and not committed to the repository.

## See Also

- [[wiki-maintainer]] — full /wiki:init flow
- [[gd-wiki-vault-adoption]] — decision to adopt QMD as the retrieval backend
