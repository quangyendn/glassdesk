# Security Policy

## Reporting a Vulnerability

**Please do not file public issues for security vulnerabilities.**

Use one of the following private channels:

1. **GitHub Private Vulnerability Reporting (preferred):**
   <https://github.com/quangyendn/glassdesk/security/advisories/new>

2. **Email:** quangyendn@gmail.com — please include `[glassdesk-security]` in the subject.

When reporting, include where possible:
- Affected file / commit / version
- Reproduction steps or proof-of-concept
- Impact assessment (what an attacker can achieve)
- Suggested remediation, if any

## Response Targets

| Severity | Acknowledgement | Initial assessment |
|----------|-----------------|--------------------|
| Critical | within 48 hours | within 7 days      |
| High     | within 72 hours | within 14 days     |
| Medium / Low | best effort | best effort        |

A coordinated-disclosure timeline will be agreed with the reporter before any public advisory.

## Scope

In-scope:
- Anything in this repository's source tree (`scripts/`, `plugins/`, `.husky/`, `.github/workflows/`, packaging configuration).
- The published npm package built from this repository.

Out of scope:
- Vulnerabilities in third-party dependencies (please report to the respective upstream; Dependabot covers known CVEs).
- Social-engineering, physical access, or DoS testing against author infrastructure.
- Issues that require an already-compromised maintainer machine.

## Supported Versions

Only the latest released version receives security fixes.
