# Hard Fix Flow

## Trigger

Complex issue, multi-file, unclear root cause, or user asks for deep investigation.

## Workflow

1. Use `AskUserQuestion` to clarify the issue, constraints, and objectives if anything is unclear. Ask 1 question at a time.
2. If user provides screenshots/videos: use `ai-multimodal` skill to describe the issue.
3. Call `debugger` subagent: "Find root cause of: [issue description]". Wait for report.
4. If root cause requires external research: call `researcher` subagent to find solutions/patterns online.
5. Call `planner` subagent: "Create implementation plan to fix: [root cause summary]. Research: [researcher report path]".
6. Execute `/code` SlashCommand to implement the plan step by step.
7. Final report: summary of changes, explanation, how to get started, next steps. Ask if user wants to commit/push (if yes, use `git-manager`).

## Notes

- Use `sequential-thinking` skill for highly complex multi-step problems
- Analyze skills catalog; activate additional skills as needed
- Sacrifice grammar for concision in reports; list unresolved questions at end
