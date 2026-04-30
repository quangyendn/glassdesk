<!-- Referenced from skills/{scouting,building,fixing,debugging,planning}/SKILL.md via ${CLAUDE_PLUGIN_ROOT}/docs/serena-preference.md -->

# When to Prefer Serena MCP Over Built-in Tools

Serena MCP exposes LSP-backed, symbol-aware code tools. On code-centric flows it returns 50–90% fewer tokens than `Read`/`Grep` on equivalent lookups. This file is the single source of truth for "Serena vs built-in" routing across `scouting`, `building`, `fixing`, `debugging`, and `planning` skills.

## Decision Rule

If `$GD_SERENA_AVAILABLE=1` AND target file extension ∈ source-code list → prefer Serena.
Else use built-in (`Read`, `Edit`, `Grep`, `Glob`).
On Serena tool error: try the flat-namespace form once (see Namespace Patterns), then fall back to built-in. Do not loop further.

## Tool Mapping

| Task | Built-in (fallback) | Serena MCP (preferred) | Notes |
|------|---------------------|------------------------|-------|
| Read full file body | `Read` | `mcp__plugin_serena_serena__find_symbol` (`include_body=True`) or `mcp__plugin_serena_serena__read_file` | Prefer `find_symbol` when symbol name is known |
| Find symbol/definition | `Grep` + `Read` | `mcp__plugin_serena_serena__find_symbol` | LSP-resolved; returns just the symbol body |
| Find references / callers | `Grep -r` | `mcp__plugin_serena_serena__find_referencing_symbols` | LSP-backed; structural, not textual |
| List symbols in a file | `Read` + parse | `mcp__plugin_serena_serena__get_symbols_overview` | Cheapest first-look at unfamiliar code |
| Edit a symbol body | `Edit` | `mcp__plugin_serena_serena__replace_symbol_body` | Structure-aware; preserves indentation |
| Insert before/after a symbol | `Edit` | `mcp__plugin_serena_serena__insert_before_symbol` / `mcp__plugin_serena_serena__insert_after_symbol` | Anchors by symbol, not line number |
| Find a file by name | `Glob` | `mcp__plugin_serena_serena__find_file` | Respects `.gitignore` |
| Search for a pattern | `Grep` | `mcp__plugin_serena_serena__search_for_pattern` | Adds glob filtering + structural awareness |
| Rename a symbol everywhere | `Edit` (manual) | `mcp__plugin_serena_serena__rename_symbol` | Cross-file, LSP-driven |

## Namespace Patterns

- **Primary (marketplace install)**: `mcp__plugin_serena_serena__<tool>` — nested form. This is the default for users who install Serena via `/plugin install serena@claude-plugins-official`. Confirmed via deferred-tools list in active Claude Code sessions (2026-04-30).
- **Fallback (manual install)**: `mcp__serena__<tool>` — flat form. Applies when a user adds Serena directly to `~/.claude/mcp.json` outside the marketplace flow.
- **Conditional / wildcard**: in skill-level conditionals, match `mcp__*serena*__<tool>` to cover both forms. Example phrasing: "prefer `mcp__plugin_serena_serena__find_symbol` (or `mcp__serena__find_symbol` if installed manually) over `Grep`+`Read`".
- If Claude reports the tool unavailable under the nested name, retry once with the flat name before falling back to built-in.

## Source-Code Extension Whitelist (Serena territory)

`.ts` `.tsx` `.js` `.jsx` `.mjs` `.cjs` `.py` `.rb` `.go` `.rs` `.java` `.php` `.c` `.cpp` `.h` `.vue`

## Fallback to Built-in (gaps + non-code)

`.svelte` `.astro` `.erb` `.slim` `.haml` `.md` `.json` `.yaml` `.yml` `.toml` `.sql` `.html` `.css` `.scss`

Note: `.svelte` `.astro` `.erb` `.slim` `.haml` are NOT confirmed in Serena's LSP language pack as of 2026-04-30. Treat as built-in territory until verified per-project.

## Onboarding (one-time per project)

Serena requires `mcp__plugin_serena_serena__onboarding` once per project to index symbols. This is **user-triggered**, not automatic. Hooks must NOT call onboarding. The first call indexes the repo (~30k–80k tokens for ~1000-file repos); subsequent sessions reuse the index.

## Conflict Note

If the user has Serena rules in their global `~/.claude/CLAUDE.md`, this plugin's instruction is redundant but harmless. No deduplication required — the global rule and the plugin pointer agree.
