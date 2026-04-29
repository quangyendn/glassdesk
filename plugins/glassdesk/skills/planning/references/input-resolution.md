# Step 0: Input Resolution

Resolve the caller's `$ARGUMENTS` into either a spec path or task text **before** any other planning step (including Pre-Creation Check). Spec is *input*; plan dir is *output container* — input must be resolved first.

## Procedure

1. **Run resolver** (always, even if `$ARGUMENTS` is empty):

   ```bash
   node "$GD_PLUGIN_PATH/scripts/resolve-spec-input.cjs" "$ARGUMENTS"
   ```

2. **Parse stdout** as a single-line JSON object. Branch on `mode`:

### `mode == "spec"` — explicit existing path

User passed a path that already resolves to a file. Use `path` as spec input. **Skip** the confirmation prompt. Proceed to Pre-Creation Check.

### `mode == "spec-confirm"` — auto-detected latest spec

Display this confirmation to the user (verbatim shape; keep one-liners):

```
Found latest spec: {path}
  Date: {date}   Status: {status}
  Problem: {summary}
Use this spec? [Y / n / other path]
```

Branches:
- **`Y` (or empty)** → use `{path}` as spec input. Proceed to Pre-Creation Check.
- **`n`** → ask user for a task description in free text. Treat as `task` mode below.
- **`<typed path>`** → validate `test -f <typed path>` **inline** (one round-trip max):
  - File exists → use it as spec.
  - File missing → re-prompt once: "Path not found: {typed}. Enter another path or `n` to switch to task mode." After one retry, abort with `error` semantics below.

### `mode == "task"` — free text or empty + no spec

- If `text` is empty → ask user: "No spec available. Describe the task to plan:" then use the response as the task text.
- Else → use `text` as `$ARGUMENTS` (current `/plan` behavior, no change).

### `mode == "error"` — path-like arg but file missing

Display:
```
Path looks like a spec file but does not exist: {arg}
```
**Abort** the planning flow. Do **NOT** silently fall back to task mode — the user typed something that looks like a path; treating it as task text would silently misroute their intent.

## Output of Step 0

After Step 0 completes, the main thread holds exactly one of:

- `input_kind = "spec"`, `spec_path = <resolved path>` — pass `spec_path` to `gd-planner`. **Pass the path, not inline content** — planner reads the file via Read tool itself, avoiding context bloat for large specs.
- `input_kind = "task"`, `task_text = <text>` — pass as `$ARGUMENTS` to `gd-planner` (existing behavior).

## Graceful fallback (resolver failure)

If `node ... resolve-spec-input.cjs` exits non-zero or stdout is unparseable JSON:

```
[warn] Spec resolver failed; falling back to task mode.
```

Treat raw `$ARGUMENTS` as task text. Do not block planning entirely on resolver bugs.

## Ordering

Step 0 (Input Resolution) runs **BEFORE** the existing Pre-Creation Check (Active vs Suggested Plan). Sequence:

1. Step 0: Input Resolution → produces `input_kind` + payload
2. Pre-Creation Check: Active vs Suggested plan dir → produces plan dir path
3. Existing planning steps (research, codebase analysis, plan synthesis)

Spec is input; plan dir is output. Resolve the input first.
