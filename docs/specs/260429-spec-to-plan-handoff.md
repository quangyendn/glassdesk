---
date: 2026-04-29
status: draft
tags: [planning, spec, command-design, workflow]
---

# Spec: Spec → Plan Handoff

## Problem

`/plan` và `/plan:hard` không đọc output của `/spec` (`docs/specs/*.md`). Workflow doc tuyên bố chuỗi `/spec → /plan` nhưng implementation chỉ nhận `$ARGUMENTS` thô — user phải tự paste path/content. Workflow advertised không khớp reality.

## Proposed Solution

Hybrid: helper script (`scripts/resolve-spec-input.cjs`) lo phần deterministic (filesystem scan, parse, validate) + skill-level Step 0 "Input Resolution" trong `skills/planning/SKILL.md` lo orchestration & confirm UX. `commands/plan.md` và `commands/plan/hard.md` chỉ thêm `argument-hint` và 1 ref tới Step 0. Cách này DRY across 2 command, deterministic, testable, và backward-compatible với `$ARGUMENTS = "task description"`.

## Scope

**In scope:**
- Bare `/plan` → tự dò spec mới nhất trong `docs/specs/` → confirm → load
- `/plan <path>` (path tới file tồn tại) → load file đó làm spec input
- `/plan <task description>` → behavior cũ (regression-safe)
- Áp dụng cho cả `/plan` và `/plan:hard`
- Helper script với unit test
- Update Step 0 trong `planning` skill
- Update `workflows/primary-workflow.md` mô tả flow đúng

**Out of scope:**
- `/code` đọc plan latest tương tự (YAGNI — làm sau nếu cần)
- Multi-spec selector / chooser UI
- Spec template editor / linter
- Migration cho specs cũ (chưa có format chuẩn)

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| "Latest spec" definition | Filename `YYMMDD` prefix, lexicographic tiebreak | Deterministic, không phụ thuộc mtime nhiễu |
| Status filter | Accept `draft` + `approved`; skip `done`/`archived` | Cover cả pre-review và post-review |
| Multiple specs cùng ngày | Pick 1 (lexicographic đầu tiên) | KISS — không chooser |
| Path detection | `arg` chứa `/` HOẶC end `.md` HOẶC `test -f` thành công | File-exists là gold standard |
| Path-like nhưng không tồn tại | Fail rõ ràng, KHÔNG fallback sang task | Tránh silent misroute |
| "other path" trong confirm | Validate ngay trong cùng câu | Fail-fast, no round-trip |
| Pass tới `gd-planner` | Spec **path** (planner tự đọc); task → `$ARGUMENTS` cũ | Tránh inline blow context |
| Architecture | Script + skill Step 0 + thin command updates | DRY, deterministic, testable |
| Test runner | `node:test` (Node stdlib, zero-dep) | YAGNI; default nếu repo chưa có |
| Order với Pre-Creation Check | Pre-Spec Check chạy TRƯỚC Pre-Creation Check | Spec là input, plan dir là output |

## Open Questions

- Test runner hiện hành của repo — có sẵn vitest/jest không? Nếu có, dùng cùng. Nếu không → `node:test`. Cần check khi vào phase implement.

## Acceptance Criteria

- [ ] `scripts/resolve-spec-input.cjs` tồn tại, trả JSON đúng contract cho 3 mode (`spec`, `spec-confirm`, `task`) + error mode
- [ ] Unit test cover: empty arg + có spec, empty arg + `docs/specs/` rỗng, arg là path tồn tại, arg là path không tồn tại, arg là task description, status filter (skip `done`/`archived`), multiple specs cùng ngày
- [ ] `skills/planning/SKILL.md` có Step 0 "Input Resolution" với decision tree + confirm UX
- [ ] `commands/plan.md` và `commands/plan/hard.md` cập nhật `argument-hint: [task | spec path | (empty for latest spec)]`
- [ ] Smoke test thủ công: bare `/plan` sau `/spec` → confirm dialog → plan tạo từ spec
- [ ] Smoke test: `/plan docs/specs/260429-foo.md` → load đúng file
- [ ] Regression: `/plan add login feature` → behavior cũ giữ nguyên
- [ ] Edge: `/plan` khi `docs/specs/` rỗng → fallback graceful, hỏi task description
- [ ] Edge: `/plan some/nonexistent.md` → error rõ ràng, không silently treat as task
- [ ] `workflows/primary-workflow.md` cập nhật mô tả flow chính xác
- [ ] Brainstorm report (`plans/reports/brainstorm-260429-2321-spec-to-plan-handoff.md`) reference từ spec này
