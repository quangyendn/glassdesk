#!/usr/bin/env bash
# claude-audit.sh — Audit Claude Code setup for the 9 token-waste patterns.
# Run from any project root. Reads ~/.claude and ./.claude.

set -u

# ---------- helpers ----------
have() { command -v "$1" >/dev/null 2>&1; }
section() { printf "\n=== %s ===\n" "$1"; }
warn()    { printf "  [WARN] %s\n" "$1"; }
ok()      { printf "  [OK]   %s\n" "$1"; }
fail()    { printf "  [FAIL] %s\n" "$1"; }
info()    { printf "  %s\n" "$1"; }

USER_DIR="${HOME}/.claude"
PROJ_DIR=".claude"

# Approx tokens-per-word for English/code prose.
TOK_PER_WORD=1.3

# ---------- 1. CLAUDE.md bloat ----------
section "1. CLAUDE.md size (Pattern #1: bloat)"
total_words=0
for f in "${USER_DIR}/CLAUDE.md" "${PROJ_DIR}/CLAUDE.md"; do
  if [ -f "$f" ]; then
    w=$(wc -w < "$f" | tr -d ' ')
    info "$f: ${w} words (~$(awk -v w="$w" -v t="$TOK_PER_WORD" 'BEGIN{printf "%d", w*t}') tokens)"
    total_words=$((total_words + w))
  else
    info "$f: (not found)"
  fi
done
total_tokens=$(awk -v w="$total_words" -v t="$TOK_PER_WORD" 'BEGIN{printf "%d", w*t}')
info "Combined: ${total_words} words / ~${total_tokens} tokens"
if [ "$total_words" -gt 1500 ]; then
  fail "Over budget. Target combined < 1,200 words (~1,500 tokens). Refactor required."
elif [ "$total_words" -gt 1200 ]; then
  warn "Approaching limit. Consider trimming."
else
  ok "Within target."
fi

# ---------- 3. Hook injection waste ----------
section "3. Active hooks (Pattern #3: hook injection)"
for f in "${USER_DIR}/settings.json" "${PROJ_DIR}/settings.json"; do
  if [ -f "$f" ]; then
    info "File: $f"
    if have jq; then
      keys=$(jq -r '.hooks // {} | keys | .[]' "$f" 2>/dev/null)
      if [ -z "$keys" ]; then
        ok "No hooks registered."
      else
        info "Registered hook events:"
        printf "%s\n" "$keys" | sed 's/^/    - /'
        ups_count=$(jq -r '.hooks.UserPromptSubmit // [] | length' "$f" 2>/dev/null)
        ss_count=$(jq -r '.hooks.SessionStart // [] | length'    "$f" 2>/dev/null)
        info "UserPromptSubmit hooks: ${ups_count:-0}"
        info "SessionStart hooks:    ${ss_count:-0}"
        if [ "${ups_count:-0}" -gt 1 ]; then
          warn "More than 1 UserPromptSubmit hook fires on every prompt. Audit each."
        fi
        if [ "${ss_count:-0}" -gt 2 ]; then
          warn "More than 2 SessionStart hooks. Kill any 'loaded successfully' notifications (Pattern #9)."
        fi
      fi
    else
      info "(install jq for detailed parsing)"
      grep -A2 '"hooks"' "$f" || true
    fi
  else
    info "$f: (not found)"
  fi
done

# ---------- 5. Skills installed (Pattern #5: skill loading) ----------
section "5. Installed skills (Pattern #5: irrelevant skill load)"
if [ -d "${USER_DIR}/skills" ]; then
  count=$(find "${USER_DIR}/skills" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
  info "Skills in ${USER_DIR}/skills: ${count}"
  find "${USER_DIR}/skills" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sed 's/^/    - /'
  if [ "$count" -gt 5 ]; then
    warn "Target: 3-5 active skills. Disable any not used in last 7 days."
  else
    ok "Within target."
  fi
else
  info "${USER_DIR}/skills: (not found)"
fi

# ---------- Plugins installed (Pattern #9: plugin auto-update) ----------
section "Installed plugins (Pattern #9: plugin auto-update redundancy)"
if [ -d "${USER_DIR}/plugins" ]; then
  pcount=$(find "${USER_DIR}/plugins" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
  info "Plugins: ${pcount}"
  find "${USER_DIR}/plugins" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sed 's/^/    - /'
  if [ "$pcount" -gt 5 ]; then
    warn "Target: 3-5 plugins. Each plugin contributes hooks + SessionStart messages."
  else
    ok "Within target."
  fi
else
  info "${USER_DIR}/plugins: (not found)"
fi

# ---------- 6. MCP servers (Pattern #6: tool def overhead) ----------
section "6. Connected MCP servers (Pattern #6: tool definitions)"
for f in "${USER_DIR}/settings.json" "${PROJ_DIR}/settings.json"; do
  if [ -f "$f" ] && have jq; then
    mcp_count=$(jq -r '.mcpServers // {} | keys | length' "$f" 2>/dev/null)
    info "$f → ${mcp_count} MCP server(s)"
    jq -r '.mcpServers // {} | keys | .[]' "$f" 2>/dev/null | sed 's/^/    - /'
    if [ "${mcp_count:-0}" -gt 4 ]; then
      warn "Target: 3 always-on MCPs. Move the rest to per-session enable."
    fi
  fi
done

# ---------- 2 + 4: Session-level signals from logs ----------
section "Session token usage (Patterns #2, #4: re-reads + cache misses)"
log_dir="${USER_DIR}/logs"
if [ -d "$log_dir" ]; then
  recent=$(find "$log_dir" -name "*.log" -mtime -7 2>/dev/null)
  if [ -n "$recent" ]; then
    echo "$recent" | head -5 | sed 's/^/  log: /'
    if have grep && have awk; then
      avg=$(grep -h -oP 'input_tokens["\:\s]+\K[0-9]+' $recent 2>/dev/null \
            | awk '{ s += $1; n++ } END { if (n>0) printf "%.0f", s/n; else print "0" }')
      total_prompts=$(grep -h -oP 'input_tokens["\:\s]+\K[0-9]+' $recent 2>/dev/null | wc -l | tr -d ' ')
      info "Avg input tokens / prompt (last 7d): ${avg}"
      info "Total prompts (last 7d):             ${total_prompts}"
      if [ "${avg:-0}" -gt 8000 ]; then
        fail "Avg input >8K tokens — heavy overhead. Trim CLAUDE.md, hooks, skills, MCPs."
      elif [ "${avg:-0}" -gt 5000 ]; then
        warn "Avg input >5K tokens — moderate overhead."
      else
        ok "Avg input within healthy range (<5K tokens)."
      fi
    fi
  else
    info "No logs in last 7 days."
  fi
else
  info "${log_dir}: (not found — proxy logging not configured)"
fi

# ---------- 7 + 8: Static config flags we cannot infer ----------
section "Manual checks (Patterns #7, #8: extended thinking + wrong-direction)"
info "  - Extended Thinking default: check Claude Code settings, target OFF by default."
info "  - Cmd+. / Ctrl+. habit: stop runaway generations within 5s. Track yourself for 1 week."

# ---------- Summary ----------
section "Summary"
info "Re-run weekly: bash scripts/audit.sh"
info "Apply fixes from: references/fixes.md"
info "Pattern reference: references/patterns.md"
