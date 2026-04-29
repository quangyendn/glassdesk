---
description: ⚡⚡⚡ Research, analyze, and create an implementation plan
argument-hint: [task | spec path | (empty for latest spec)]
---

Think harder.
Activate `planning` skill.
Refer to 'output-standards' reference in 'planning' skill for plan file spec and output requirements.

## Your mission
<task>$ARGUMENTS</task>

## Pre-Spec Check (Input Resolution)

Run **Step 0** of `planning` skill (`references/input-resolution.md`) BEFORE the Pre-Creation Check below. Step 0 calls `scripts/resolve-spec-input.cjs`, branches on the JSON `mode` field (`spec` / `spec-confirm` / `task` / `error`), and produces either a spec path or task text. Keep this section identical between `plan.md` and `plan/hard.md`.

## Pre-Creation Check (Active vs Suggested Plan)

Check the `## Plan Context` section in the injected context:
- If "Plan:" shows a path → Active plan exists. Ask user: "Continue with this? [Y/n]"
- If "Suggested:" shows a path → Branch-matched hint only. Ask if they want to activate or create new.
- If "Plan: none" → Create new plan using naming from `## Naming` section.

## Workflow
1. If creating new: Create directory using `Plan dir:` from `## Naming` section, then run `node "$GD_PLUGIN_PATH/scripts/set-active-plan.cjs" {plan-dir}`. If reusing: Use the active plan path from Plan Context. Pass directory path to every subagent.
2. Follow "Plan Creation & Organization" rules of `planning` skill.
3. Use up to 2 `gd-researcher` agents in parallel (max 5 tool calls each, different aspects).
4. Analyze codebase: read `codebase-summary.md`, `code-standards.md`, `system-architecture.md`, `project-overview-pdr.md`. If `codebase-summary.md` unavailable or >3 days old, run `/scout` first.
5. Pass all research and scout report paths to `gd-planner` subagent to create the implementation plan.
6. Receive plan from `gd-planner`, ask user to review.

## Post-Plan Validation (Optional)

Check `## Plan Context` → `Validation: mode=X, questions=MIN-MAX`:
- `prompt`: Ask user "Validate this plan with a brief interview?" → Yes / No
- `auto`: Execute `/plan:validate {plan-path}`
- `off`: Skip

If validation chosen or mode is `auto`: Execute `/plan:validate {plan-path}`.

## Important Notes
- Ensure token efficiency while maintaining high quality.
- Sacrifice grammar for concision in reports.
- List unresolved questions at end of any report.
- **Do not** start implementing.
