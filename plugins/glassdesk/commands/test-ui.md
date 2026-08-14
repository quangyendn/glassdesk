---
description: Run UI tests on a website & generate a detailed report
argument-hint: [url] [options]
---

Use `gd-ui-tester` agent to run UI tests and generate a report.

Pass:
- `URL`: $1 — target URL
- `OPTIONS`: $2 — optional flags (e.g., `--headless`, `--mobile`, `--auth`)

For auth-protected routes the agent will instruct the caller to log in manually first and provide cookies or a session token before re-invoking.
