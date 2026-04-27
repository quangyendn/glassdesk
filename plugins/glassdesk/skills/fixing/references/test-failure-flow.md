# Test Failure Flow

## Trigger

Input mentions "test failures", "failing tests", "run test suite", or "fix tests".

## Workflow

1. Call `tester` subagent: "Compile and fix all syntax errors first, then run tests."
2. If all tests pass: summarize results and stop.
3. Call `debugger` subagent: "Find root cause of failed tests: [failure output]". Wait for report.
4. Call `planner` subagent: "Create implementation plan based on: [debugger report]". Wait for plan.
5. Implement plan step by step.
6. Call `tester` subagent: "Verify all tests pass after fix."
7. Call `code-reviewer` subagent: "Review code changes for correctness and quality."
8. If tests still fail: repeat from step 3.
9. Respond with summary once all tests pass.
