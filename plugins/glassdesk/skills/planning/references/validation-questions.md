# Validation Question Generation

## Step 1: Read Plan Files

Read the plan directory:
- `plan.md` — Overview and phases list
- `phase-*.md` — All phase files
- Look for decision points, assumptions, risks, tradeoffs

## Step 2: Extract Question Topics

Scan plan content for:

| Category | Keywords to detect |
|----------|-------------------|
| **Architecture** | "approach", "pattern", "design", "structure", "database", "API" |
| **Assumptions** | "assume", "expect", "should", "will", "must", "default" |
| **Tradeoffs** | "tradeoff", "vs", "alternative", "option", "choice", "either/or" |
| **Risks** | "risk", "might", "could fail", "dependency", "blocker", "concern" |
| **Scope** | "phase", "MVP", "future", "out of scope", "nice to have" |

## Step 3: Generate Questions

For each detected topic, formulate a concrete question:

**Format rules:**
- Each question must have 2-4 concrete options
- Mark recommended option with "(Recommended)" suffix
- "Other" option is automatic — don't add it
- Questions should surface implicit decisions

**Examples:**

```
Category: Architecture
Question: "How should validation results be persisted?"
Options:
1. Save to plan.md frontmatter (Recommended)
2. Create validation-answers.md
3. Don't persist — ephemeral only
```

```
Category: Assumptions
Question: "The plan assumes API rate limiting is not needed. Correct?"
Options:
1. Yes, not needed for MVP
2. No, add basic rate limiting now (Recommended)
3. Defer to Phase 2
```
