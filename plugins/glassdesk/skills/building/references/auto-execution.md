# Auto-Execution Mode

## $ALL_PHASES Behavior

After each phase completes (all gates passed):

- `$ALL_PHASES = Yes` (default): Proceed to next phase automatically without asking.
- `$ALL_PHASES = No`: Use `AskUserQuestion` tool: "**Phase workflow finished. Ready for next plan phase.**"

## Finalize Step (Step 5 for code:auto)

Run in parallel:
1. `gd-project-manager` subagent: "Update plan status in [plan-path]. Mark [phase-name] as DONE with timestamp."
2. `gd-docs-manager` subagent: "Update docs for [phase-name]. Changed files: [list]."
3. `gd-git-manager` subagent: auto-stage + commit with message "[phase] - [plan]"

Commit only if: all steps 1-4 successful + tests passed.

## Onboarding Check

After last phase: detect API keys, env vars, config requirements. Use `AskUserQuestion` to ask if user wants to set up onboarding requirements.

## Summary Report (last phase only)

Generate concise report. Use `AskUserQuestion` to ask:
- Preview report with `/preview`?
- Archive plan with `/plan:archive`?

## Subagent Pattern

```
Task(subagent_type="[type]", prompt="[task description]", description="[brief]")
```
