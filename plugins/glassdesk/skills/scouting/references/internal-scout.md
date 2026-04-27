# Internal Scout Patterns

## Tool Selection

| Goal | Tool |
|------|------|
| Find files by name/pattern | `Glob` or `find` via Bash |
| Search for symbol/text | `Grep` or `grep -rn` via Bash |
| Explore unknown directory | `ls` / `find` via Bash |
| Understand file contents | `Read` |
| Broad parallel exploration | `Explore` subagents |

## Parallel Exploration Pattern

Divide the codebase into logical areas; spawn one `Explore` subagent per area:

```
Task(subagent_type="Explore", prompt="Search src/api/ for auth-related files. List file paths and one-line description of each.", description="Scout auth area")
Task(subagent_type="Explore", prompt="Search src/models/ for user-related models.", description="Scout models area")
```

Run all in parallel (single message, multiple Task calls).

## Output Format

Report should list:
- File path (relative to project root)
- One-line description of relevance
- Key symbols/exports if known

## Heuristics

- Start broad (find dirs), then narrow (grep for symbols)
- Prefer `grep -rn --include="*.ts"` over reading every file
- Check `package.json` / `Gemfile` / `go.mod` first for dependency context
- Scan `README.md` and `CLAUDE.md` for architecture hints before deep diving
