---
title: "gd-implementer Agent (Standard Tier) for /code & /code:auto Step 2"
date: 2026-04-30
status: completed
completed_at: 2026-05-01
slug: gd-implementer-agent
related:
  - plans/reports/brainstorm-260430-2345-gd-implementer-agent.md
  - .gd-wiki/decisions/model-tier-policy.md
  - .gd-wiki/decisions/ghost-agent-resolution.md
  - .gd-wiki/features/building.md
---

# gd-implementer Agent (Standard Tier) for `/code` & `/code:auto` Step 2

## Problem

Step 2 (Implementation) ngốn token nhiều nhất nhưng đang chạy trên main thread (Opus). `building/SKILL.md` ghi `main + subagents` nhưng "+ subagents" hiếm khi xảy ra → main tự edit toàn bộ source bằng Opus. Pipeline không tận dụng standard tier (sonnet) dù `models.yml` đã sẵn sàng.

Tất cả quyết định kiến trúc đã chốt ở brainstorm — xem `plans/reports/brainstorm-260430-2345-gd-implementer-agent.md`.

## Solution Summary

- Tạo agent `gd-implementer` (tier=standard → sonnet) tại `plugins/glassdesk/agents/gd-implementer.agent.md`
- Dispatch granularity: **phase-scoped** (Option A) — main `Agent(gd-implementer)` ĐÚNG 1 lần / phase, input = phase + plan path
- Scope: **first-draft only** — implementer edit code + type-check, không chạy test (test gate vẫn ở Step 3 với `gd-tester`)
- Hard ban: main MUST NOT Edit/Write source trong Step 2 sau khi agent tồn tại
- Type-check resolution table sống TRONG agent body (không auto-detect ở skill)
- Multilingual: parallel khi phase declare parallel-safe, default sequential
- Failure escalation: success → Step 3 / partial / type-check-fail → re-dispatch (cap 1 retry) / cạn retry → `gd-debugger`

## Context & Wiki Citations

- **Tier policy** [`.gd-wiki/decisions/model-tier-policy.md`]: 4-tier system; standard tier = "Coding, refactoring, doc writing, structured analysis". Implementer rơi đúng định nghĩa — không cần tier mới.
- **Ghost-agent trap** [`.gd-wiki/decisions/ghost-agent-resolution.md`]: Claude Code silent fallback main session model khi skill dispatch agent name không tồn tại. → **Hard ordering constraint**: agent file + `bin/sync-models` + commit FIRST, skill edit ở commit thứ 2.
- **Planner double-spend mitigation** (cùng decision page): "main acts as orchestrator only, does not write content" — copy nguyên si wording cho implementer.
- **Building feature page** [`.gd-wiki/features/building.md`]: Agent Dispatch Chain hiện thiếu implementer; Step 2 vẫn ghi "main + subagents". Phase 3 update.

## Phases

| # | Phase | Status | Effort | Link |
|---|-------|--------|-------:|------|
| 01 | Agent file + tier sync | Done | S (1-1.5h) | [phase-01](./phase-01-agent-file-tier-sync.md) |
| 02 | Skill rewrite (Step 2 dispatch) | Done | M (1.5-2h) | [phase-02](./phase-02-skill-rewrite-step2-dispatch.md) |
| 03 | Wiki update + smoke test | Done | S (0.5-1h) | [phase-03](./phase-03-wiki-update-smoke-test.md) |

**Total effort:** ~3-4.5h. Decomposition mirrors hard ordering từ ghost-agent-resolution: agent file → skill edit → wiki+verify. Mỗi phase = 1 atomic commit.

## Acceptance Criteria

1. `plugins/glassdesk/agents/gd-implementer.agent.md` tồn tại với `tier: standard`, `model: sonnet` (resolved bởi `bin/sync-models`)
2. Pre-commit drift hook (`scripts/install-dev-hooks.sh`) PASS sau khi thêm agent
3. `building/SKILL.md` Step 2 row đổi từ "main + subagents" → "gd-implementer (mandatory)"; Common Mistakes có entry "Main thread Edit/Write in Step 2 = forbidden"
4. `references/execution-gates.md` có Step 2 trong Mandatory Subagents table cho cả `code.md` lẫn `code:auto`; có gate "implementer return success + type-check pass"
5. `references/test-driven-loop.md` clarify implementer = first-draft, hand-off `gd-tester` ở Step 3
6. Failure escalation table (success / partial / type-check-fail / retry exhausted) có trong skill
7. `.gd-wiki/features/building.md` Agent Dispatch Chain có dòng `gd-implementer (standard) — phase implementation, type-check, file edits`
8. Smoke test: `/code:auto` chạy 1 phase nhỏ → Anthropic Console hiện Sonnet usage cho Step 2

## Locked Constraints

- **DO NOT** write to `.claude/agents/` — duplicate dir, ignored. SoT = `plugins/glassdesk/agents/`.
- **DO NOT** consolidate agent dirs trong plan này — out of scope.
- **DO NOT** modify `config/models.yml` — `tier: standard` đã map sang sonnet.
- **DO NOT** modify `bin/sync-models` — đã hỗ trợ.
- **DO NOT** auto-detect type-check command ở skill — agent body owns table; phase declare parallel-safe.
- **DO NOT** pre-write `.gd-wiki/decisions/implementer-agent.md` — `/learn` tự sinh sau merge.
- **DO NOT** surface implementer's internal TodoWrite ngược main thread — blackbox đến khi return summary.
- **DO NOT** cho implementer chạy test hoặc loop test-fix — first-draft only.
- **Wording**: skill phải dùng "MUST dispatch / MUST NOT edit" (mirror planning skill § Orchestrate-only main thread).
- **Hard ordering**: Phase 1 commit BEFORE Phase 2 (ghost-agent fallback prevention).

## Out of Scope

- Per-task dispatch (Option B) — defer cho đến khi A failure-rate cao
- Embedded test loop (Option C) — rejected ở brainstorm
- Agent-dirs consolidation (`.claude/agents/` dọn dẹp)
- Tier system changes
- Auto-detection của type-check command
- Pre-write decision page (sẽ tự `/learn` sau merge)

## Open Questions

Không. Toàn bộ 4 câu unresolved trong brainstorm đã được user trả lời:

1. Duplicate agent dirs → ignore `.claude/agents/`, SoT = plugin dir
2. TodoWrite visibility → blackbox, return summary là duy nhất
3. Architectural judgment → Sonnet OK, decision phải resolve upstream ở `/brainstorm` + `/plan:validate`
4. Multilingual stack → parallel nếu phase declare, default sequential

## Validation Summary

**Validated:** 2026-05-01
**Questions asked:** 4

### Confirmed Decisions

- **Phase 1 → Phase 2 ordering**: Same branch, 2 commits liên tiếp trong 1 PR. Atomic-per-phase giữ nhờ commit boundary; reviewer thấy full picture. Ghost-agent risk vẫn ngăn được vì agent file commit landed BEFORE skill commit (cùng branch, cùng PR).
- **Retry cap**: cả `partial` và `type_check_failed` cùng cap = 1. KISS; sau 1 retry → escalate `gd-debugger`. Failure escalation table giữ nguyên như Phase 2 thiết kế.
- **Phase 3 smoke test**: manual Anthropic Console + grep `gd-implementer` trong session transcript là đủ để acceptance pass. Không build automated dispatch-detection.
- **`.claude/agents/` duplicate dir**: giữ OUT OF SCOPE. Memory note đã cảnh báo; consolidation tách plan riêng.

### Action Items

- [ ] Phase 3 acceptance: cộng thêm 1 dòng "grep `gd-implementer` trong session transcript = ≥1 hit" vào verification commands (sẽ áp dụng khi /code Phase 3, không sửa phase file ngay).

## References

- Brainstorm: `plans/reports/brainstorm-260430-2345-gd-implementer-agent.md`
- Tier policy: `.gd-wiki/decisions/model-tier-policy.md`
- Ghost-agent: `.gd-wiki/decisions/ghost-agent-resolution.md`
- Building feature: `.gd-wiki/features/building.md`
- Sibling agents: `plugins/glassdesk/agents/gd-tester.agent.md`, `gd-code-simplifier.agent.md`, `gd-planner.agent.md`
- Skill targets: `plugins/glassdesk/skills/building/SKILL.md` + `references/execution-gates.md` + `references/test-driven-loop.md`
- Tier infra: `plugins/glassdesk/config/models.yml`, `plugins/glassdesk/bin/sync-models`, `plugins/glassdesk/scripts/install-dev-hooks.sh`
