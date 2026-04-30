---
date: 2026-04-30
status: draft
tags: [plugin, integration, mcp, serena, token-efficiency, scouting, building]
---

# Spec: Serena MCP as Preferred LSP Tool

## Problem

Plugin `glassdesk` đề xuất `Read`/`Grep`/`Glob`/`Explore` cho mọi code workflow (scouting, planning, building, fixing, debugging). Built-in tools không hiểu cấu trúc symbol → trả full file body hoặc raw lines → tiêu hao token cao trên codebase lớn (1-3K tokens/file kể cả khi chỉ cần 1 symbol). Serena MCP (LSP-backed) cung cấp symbol-aware tools (`find_symbol`, `get_symbols_overview`, `find_referencing_symbols`) trả về đúng symbol body + line ranges, giảm 50-90% token. Plugin hiện không hint user cài Serena, không có preference instruction, không có fallback path → user mặc định dùng built-in.

## Proposed Solution

**Hybrid approach** (Option E từ brainstorm `plans/reports/brainstorm-260430-0001-serena-mcp-preference-integration.md`):

1. **Soft preference**: Skill code-related (5 skills) trỏ tới reference chung `skills/_shared/serena-preference.md` chứa tool mapping built-in ↔ Serena.
2. **Active hint**: SessionStart hook (`hooks/session-init.cjs`) detect Serena 1 lần/session, set env `GD_SERENA_AVAILABLE=1|0`, in install hint nếu vắng (1 lần/session, non-blocking).
3. **Optional dependency**: KHÔNG add hard dependency vào `plugin.json` (giữ portable). Document recommendation trong README.
4. **Scope-aware**: Serena chỉ áp dụng source code (.ts, .py, .rb, .go, .rs, .js, .tsx, .jsx, .vue, .svelte, .java, .php, ...). Skills `wiki`/`compounding`/`brainstorming`/`media-processing`/`ai-multimodal` KHÔNG inject Serena reference.

## Scope

**In scope:**
- Tạo `plugins/glassdesk/skills/_shared/serena-preference.md` — reference file với tool mapping + extension whitelist + namespace patterns (defensive wildcard).
- Mở rộng `plugins/glassdesk/hooks/session-init.cjs`: detect Serena qua `claude plugin list` (timeout 3s), set `GD_SERENA_AVAILABLE`, in install hint nếu vắng.
- Update 5 skills code-related: `scouting`, `building`, `fixing`, `debugging`, `planning` — thêm 1 block ngắn (4-5 dòng) trỏ tới `_shared/serena-preference.md`.
- Update commands `/scout`, `/code`, `/fix`, `/debug`, `/plan` body: thêm 1-line check Serena availability before code-heavy operations.
- Update `README.md` + `docs/quick-start.md`: section "Recommended optional dependencies" với install commands.
- Test fixture: verify plugin chạy clean cả khi Serena có/vắng.

**Out of scope:**
- Hard dependency declaration trong `plugin.json` (giữ optional).
- Plugin-level PreToolUse hook enforcement (user opt-in qua global CLAUDE.md nếu muốn — không ship default).
- Auto-onboarding Serena cho project mới (Serena tự prompt khi gọi tool đầu tiên).
- Sửa user's `~/.claude/CLAUDE.md` hoặc `settings.json` (zero-touch user config).
- Inject Serena reference vào skills non-code (`wiki`, `compounding`, `brainstorming`, `media-processing`, `ai-multimodal`).
- Telemetry adoption tracking (manual feedback loop).
- Migration guide cho user đã có global Serena rules (plugin instruction redundant nhưng không xung đột).

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Dependency model | Optional (hint via hook), KHÔNG add vào `plugin.json` `dependencies` | Giữ portable; user không muốn Serena vẫn dùng được glassdesk |
| Detection mechanism | SessionStart hook + `claude plugin list` (timeout 3s) | Tận dụng infrastructure hooks có sẵn; non-blocking; chính xác hơn đoán tool name |
| Hint frequency | 1 lần/session khi vắng | Không spam; user thấy hint mỗi session mới đến khi cài |
| Tool mapping location | `skills/_shared/serena-preference.md` (single reference file) | DRY — 5 skills cùng trỏ tới 1 nguồn truth |
| Tool namespace pattern | Wildcard `mcp__*serena*__<tool>` | Defensive cho cả `mcp__serena__*` (flat) và `mcp__plugin_serena_serena__*` (nested) — chưa rõ Anthropic guarantee namespace nào ổn định |
| File scope | Source code only (`.ts`, `.py`, `.rb`, `.go`, `.rs`, `.js`, `.tsx`, `.jsx`, `.vue`, `.svelte`, `.java`, `.php`, ...) | Serena chỉ support source code (LSP-backed); markdown/JSON/YAML dùng built-in |
| Skills updated | 5 code skills only: scouting, building, fixing, debugging, planning | Wiki/brainstorming/compounding/media không liên quan code |
| Commands updated | `/scout`, `/code`, `/fix`, `/debug`, `/plan` | Đồng bộ với skills updated |
| Install command in hint | `claude plugin marketplace add anthropics/claude-plugins-official` + `claude plugin install serena@claude-plugins-official` | Verified từ marketplace.json — marketplace name `claude-plugins-official`, plugin name `serena` |
| PreToolUse enforcement | KHÔNG ship; có thể ship `hooks/serena-enforce.cjs.example` cho user opt-in | Hard enforcement break plugin khi Serena vắng — vi phạm "không break" requirement |
| Onboarding flow | Leave to Serena's own prompt | Serena tự prompt onboarding khi gọi tool đầu tiên — không cần plugin can thiệp |

## Open Questions

- **MCP namespace stability** — Anthropic có document guarantee `mcp__plugin_<plugin>_<server>__*` vs `mcp__<server>__*` không? Nếu thay đổi giữa Claude Code versions → wildcard pattern phải maintain. — owner: spec author cần confirm trước khi implement; tạm thời defensive (wildcard cả 2).
- **`plugin.json` `optional` flag support** — Marketplace spec có hỗ trợ `"optional": true` trong dependencies không? Nếu có → cân nhắc move sang dependency declaration (Phase 4 brainstorm). — owner: implementor verify khi đến Phase 4.
- **Token cost của Serena onboarding lần đầu** — `onboarding` task có thể tốn token đáng kể trên codebase lớn. Net benefit dài hạn vs upfront cost? — owner: validation step, đo trên 1 codebase real (vd. glassdesk repo).
- **`claude plugin list` CLI output stability** — Format có thể đổi giữa versions → regex `\bserena\b` có thể fail. Có command/API ổn định hơn không? — owner: implementor; có thể fallback bằng cách check tool presence ở tool-call time.
- **Conflict với user's `~/.claude/CLAUDE.md` Serena rules** — Plugin instruction redundant nếu user đã có global rule. Acceptable hay cần dedup logic? — owner: user/spec author; recommendation: chấp nhận redundant (zero-harm).

## Acceptance Criteria

- [ ] File `plugins/glassdesk/skills/_shared/serena-preference.md` tồn tại với:
  - [ ] Tool mapping table (≥7 entries: find_symbol, find_referencing_symbols, get_symbols_overview, search_for_pattern, find_file, replace_symbol_body, insert_after_symbol)
  - [ ] Extension whitelist source code (≥10 extensions)
  - [ ] Namespace pattern guidance (cả 2 patterns: flat + nested)
  - [ ] Conditional logic: "if `$GD_SERENA_AVAILABLE=1` → prefer Serena; else fallback Grep/Read"
- [ ] `hooks/session-init.cjs` mở rộng:
  - [ ] Detect Serena qua `claude plugin list` với timeout ≤3s
  - [ ] Set `GD_SERENA_AVAILABLE=1|0` qua `writeEnv()`
  - [ ] In install hint với 2 commands chính xác khi `GD_SERENA_AVAILABLE=0`
  - [ ] Non-blocking: nếu CLI fail/timeout → assume `=0`, vẫn cho session start
- [ ] 5 skills (`scouting`, `building`, `fixing`, `debugging`, `planning`) có block 4-5 dòng trỏ tới `_shared/serena-preference.md`
- [ ] 5 commands (`/scout`, `/code`, `/fix`, `/debug`, `/plan`) có 1-line check Serena availability ở đầu
- [ ] Skills `wiki`, `compounding`, `brainstorming`, `media-processing`, `ai-multimodal` KHÔNG có Serena reference
- [ ] `README.md` có section "Recommended optional dependencies" liệt kê Serena + lý do + install commands
- [ ] `docs/quick-start.md` có note ngắn về Serena recommendation
- [ ] Test: chạy `/scout` trên test repo KHÔNG có Serena → plugin work clean, output có install hint 1 lần
- [ ] Test: chạy `/scout` trên test repo CÓ Serena → Claude actively dùng `mcp__*serena*__find_symbol` thay vì `Grep`/`Read`
- [ ] Manual measurement: trên codebase ≥100 files, `/scout` token usage giảm ≥40% sau khi cài Serena (sample 5 sessions trước/sau)
- [ ] `CHANGELOG.md` của plugin có entry version mới ghi lại change này
