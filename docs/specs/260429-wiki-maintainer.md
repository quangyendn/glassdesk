---
date: 2026-04-29
status: draft
tags: [feature, wiki, knowledge-base, plugin]
---

# Spec: Project Wiki Maintainer

## Problem

Project knowledge (architecture, feature specs, decisions, lessons) sống rải rác trong code, commit history, ad-hoc docs, và `.glassdesk-knowledge/`. Không có nguồn tổng hợp, evergreen, query-able cho cả human và LLM. Mỗi lần `/ask` hay debug, agent phải re-grep code → tốn token, kết quả không nhất quán.

## Proposed Solution

Glassdesk plugin nhận thêm feature **wiki maintainer**: incrementally build và maintain `.gd-wiki/` (committed Obsidian-flavored vault) như single source of truth của production state trên main branch. Wiki update qua manual `/wiki:update` distill diff giữa `last_synced_commit` và HEAD. Query qua `/ask:wiki` dùng QMD (BM25+vector+rerank local) cho ~10x token saving so với grep+LLM. Reuse `obsidian-markdown` + `obsidian-bases` skills của kepano để author pages và auto-generate index.

Inspiration: Karpathy gist về LLM-friendly project wikis.

## Scope

**In scope (v1):**
- Storage `.gd-wiki/` hidden folder, committed to git
- 4 commands: `/wiki:init`, `/wiki:update`, `/wiki:lint`, `/ask:wiki`
- Single skill `wiki` với 5 reference docs (maintaining/querying/linting/obsidian-conventions/cost-budget)
- Single agent `gd-wiki-curator` (Sonnet)
- Config file `.gd-wiki/.config.json` với `last_synced_commit`, model tiers, qmd settings
- Strict main-branch-only updates
- Plugin dependencies: `obsidian@kepano`, `qmd@qmd`
- `/learn` luôn ghi `.gd-wiki/insights/` (auto-create folder nếu chưa có); không quan tâm `.glassdesk-knowledge/` cũ
- Auto-generated index pages qua `.base` files
- CLI-first cost optimization: bash/grep/yq/git cho parsing; LLM chỉ cho distill + synthesis + opt-in deep lint
- Token budget enforcement (default 1M, configurable)

**Out of scope (defer to v2+):**
- Auto hooks (post-commit / post-merge / SessionEnd) — manual trigger only v1
- QMD MCP integration as default (skill body support nhưng default = CLI form)
- JSON Canvas visualization
- QMD migration command (move `.glassdesk-knowledge/` → `.gd-wiki/insights/` auto)
- QMD-based contradiction lint as default (require `--deep` flag)
- Multi-branch wiki preview mode
- QMD vector search trong `/wiki:update` curator (chỉ enable khi cần dedupe)
- Initial bootstrap from existing artifacts (S0 empty start only)
- QMD support cho non-markdown files (.base files exclude khỏi search)

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Storage location | `.gd-wiki/` (dot-prefix, committed) | Plugin-internal namespace; không pollute `docs/`; clear ownership |
| Vs `docs/specs/` | Tách biệt | `docs/specs/` = change intent (input cho `/plan`); wiki = consolidated state |
| Vs `.glassdesk-knowledge/` | Bỏ hoàn toàn — `/learn` luôn ghi `.gd-wiki/insights/` (auto-mkdir) | Đơn giản, 1 nguồn duy nhất; user tự xử lý folder cũ nếu muốn |
| Internal structure | Defer cho obsidian skills (TBD) | Tránh prematurely fix shape; obsidian-markdown convention sẽ guide |
| Update trigger v1 | Manual `/wiki:update` only | Hook deferred; reduce scope; user control timing |
| Sync pointer | `.gd-wiki/.config.json::last_synced_commit` | Plugin-managed, không pollute git refs/notes |
| Branch model | Strict — main only | Wiki = SoT của production; refuse run trên feature branch |
| Initial seed | S0 — empty skeleton | Bootstrap S1/S2 over-engineering; user dogfood incrementally |
| Architecture pattern | Phased (Option C) — minimal v1, ranh giới sạch cho v2 | KISS now, easy upgrade path; tránh over-engineer Option B |
| Page format | Obsidian Flavored Markdown | Reuse `obsidian-markdown` skill (kepano); industry standard |
| Index pages | `.base` files (Obsidian Bases) | Reuse `obsidian-bases` skill; auto-render filtered views; YAML readable cả khi không có Obsidian |
| Retrieval backend | QMD (BM25 + vector + LLM rerank, local) | ~10x token saving vs grep+LLM; local = no API cost; Claude Code plugin distribution sẵn |
| QMD integration form | CLI default, MCP opt-in | CLI universal headless; MCP optional cho power user |
| Default model | Sonnet (curator + ask + deep lint) | Standard tier; cost-conscious; Opus reserved cho explicit flag |
| LLM vs CLI | CLI-first (git/grep/yq/wc) cho parsing | Token saving; LLM chỉ ở distill + synthesis steps |
| Token budget | Default 1M, configurable | User-set; pre-flight estimate enforce |
| Lint default | Deterministic only | LLM contradiction sweep behind `--deep` flag — cost control |
| `/learn` write target | Luôn `.gd-wiki/insights/` (auto-mkdir nếu chưa có) | 1 nguồn duy nhất, không fallback logic |
| `/improve` read target | Chỉ `.gd-wiki/insights/` | Tránh nhánh logic kép |
| `/wiki:init` no-op condition | `.gd-wiki/` AND `.gd-wiki/.config.json` cùng tồn tại | Recovery: thiếu 1 trong 2 → init bù phần thiếu |
| Manual edit protection | `<!-- manual -->` marker section | Curator skip; respect human authority (syntax TBD) |
| `/wiki:lint` action | Propose-only, no auto-fix | Human review for trust |
| Plugin dependencies | `obsidian@kepano` + `qmd@qmd` | Reuse instead of vendor; stays in sync |
| Embeddings location | QMD default `~/.local/share/qmd` | Host-local; không commit; per-machine |
| Init pre-flight | Check qmd CLI installed; if not, instruct + exit | Fail fast; clear setup story |

## Open Questions

- Page naming convention (kebab-case + tag-driven) — confirm khi load obsidian skills — owner: user
- `/ask:wiki` miss fallback: silent miss vs escalate `/ask` general — owner: user (cost vs UX trade-off)
- `.base` index auto-create rules: theo category nào, curator tự thêm khi tag mới? — owner: design phase
- `<!-- manual -->` marker syntax + tooling — owner: design phase
- QMD GGUF download UX: prompt warning trước first `qmd embed` (~few hundred MB)? — owner: UX
- QMD re-index benchmark: thời gian `qmd update` cho wiki ~100 pages? — owner: benchmark trước ship
- Plugin manifest schema có support multi-dep declarative không, hay document install steps? — owner: implementation phase
- QMD collection lifecycle khi user delete `.gd-wiki/`: auto-cleanup `qmd collection remove wiki` không? — owner: design phase

## Acceptance Criteria

- [ ] `/wiki:init` creates `.gd-wiki/` với `.config.json`, `README.md`, registers QMD collection, runs `qmd embed`
- [ ] `/wiki:init` no-op CHỈ khi cả `.gd-wiki/` AND `.gd-wiki/.config.json` cùng tồn tại
- [ ] `/wiki:init` recovery: nếu folder có nhưng thiếu config → tạo config; nếu config có nhưng thiếu folder → tạo folder
- [ ] `/wiki:init` pre-flight detect missing qmd CLI và in install instruction trước khi exit
- [ ] `/wiki:init` accept optional `[path]` argument để override default location
- [ ] `/wiki:update` refuse chạy nếu branch ≠ `main_branch` config
- [ ] `/wiki:update` distill commits từ `last_synced_commit` đến HEAD, edit pages, advance pointer, re-index qmd
- [ ] `/wiki:update` parse diff bằng `git` CLI (không LLM)
- [ ] `/wiki:update` enforce token budget pre-flight; abort + report nếu vượt
- [ ] `/wiki:update` curator chạy Sonnet (configurable)
- [ ] `/wiki:update` skip files trong `stop_paths`
- [ ] `/wiki:update` không touch section có `<!-- manual -->` marker
- [ ] `/wiki:lint` deterministic: detect broken `[[wikilinks]]`, orphans, stale frontmatter, empty files — qua bash/grep/yq, không LLM
- [ ] `/wiki:lint --deep` chạy LLM contradiction sweep với QMD vsearch clustering
- [ ] `/wiki:lint` output ở `plans/reports/wiki-lint-{timestamp}.md`, propose-only
- [ ] `/wiki:lint` cảnh báo nếu HEAD cách `last_synced_commit` > N commits (configurable)
- [ ] `/ask:wiki <q>` chạy qua `qmd query --json -n {max_context_pages} --min-score {qmd_min_score}` → Sonnet synthesize
- [ ] `/ask:wiki` fallback `/ask` cũ khi `.gd-wiki/` không tồn tại
- [ ] `/learn` luôn ghi `.gd-wiki/insights/` — tự `mkdir -p` nếu folder chưa tồn tại (không cần `/wiki:init` chạy trước)
- [ ] `/improve` chỉ đọc từ `.gd-wiki/insights/` — không reference `.glassdesk-knowledge/`
- [ ] Wiki page format compliant với obsidian-markdown skill conventions (frontmatter `title`/`updated`/`tags` required)
- [ ] Wiki có ít nhất 1 `.base` index file demo cho category trên acceptance test project
- [ ] Plugin manifest declare dependencies `obsidian` + `qmd`
- [ ] Skill `wiki` có 5 reference files (maintaining, querying, linting, obsidian-conventions, cost-budget)
- [ ] Agent `gd-wiki-curator` chỉ touch files trong `.gd-wiki/`; reject edit ngoài
- [ ] Agent default model = Sonnet, configurable qua `.config.json::models`
- [ ] Acceptance smoke test: dogfood trên repo glassdesk: `/wiki:init` → commit → `/wiki:update` → `/ask:wiki` returns relevant chunk → `/wiki:lint` clean

## References

- Brainstorm report: `plans/reports/brainstorm-260429-1654-wiki-maintainer.md`
- Inspiration: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- Obsidian skills (kepano): https://github.com/kepano/obsidian-skills
- QMD (tobi): https://github.com/tobi/qmd
