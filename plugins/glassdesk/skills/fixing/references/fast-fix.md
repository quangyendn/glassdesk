# Fast Fix Flow

## Trigger

Input is a general issue (not test failure). Single file or small-scope fix.

## Workflow

1. If user provides screenshots/videos: use `ai-multimodal` skill to describe the issue in detail (root-cause predictable description for developers).
2. Call `gd-debugger` subagent: "Find root cause of: [issue description]". Wait for report.
3. Activate `debugging` skill and `problem-solving` skill.
4. Implement fix based on debugger report.
5. Call `gd-tester` subagent: "Verify fix works: [what was changed]". Wait for result.
6. If tests fail or issue persists: repeat from step 2.
7. Respond with: summary of changes, brief explanation, how to get started, suggested next steps.
