# Test-Driven Loop

## Pattern

```
Implement → Run tester → If fail: debugger → Fix → Re-run tester → Repeat until 100%
```

## Step 3 Execution

1. Call `gd-tester` subagent: "Run test suite for plan phase [phase-name]"
2. If ANY tests fail:
   - STOP implementation
   - Call `gd-debugger` subagent: "Analyze failures: [details]"
   - Fix all issues
   - Re-run `gd-tester`
   - Repeat until 100% pass

## Step 2 Preparation

Write tests covering:
- Happy path (expected inputs)
- Edge cases (boundaries, empty, null)
- Error cases (failures, exceptions)

## Loop Termination

Only exit loop when `gd-tester` reports 0 failures. No exceptions. If stuck after 3 cycles, escalate to user.

## Image/Media Assets

- Generate with `ai-multimodal` skill on the fly
- Verify generated assets with `ai-multimodal` skill
- Crop/resize with `ImageMagick` or similar tools
