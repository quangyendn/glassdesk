#!/usr/bin/env bash
# audit.sh — ccaudit: catalog-driven 2-tier Claude Code audit.
# Loops over pattern files in references/patterns/*.md
# Reads YAML frontmatter via yq (primary) or awk (fallback).
# Run from any project root. Reads ~/.claude and ./.claude.
#
# Severity ordinal map (for Top-3 ranking):
#   high=3, fail=3, medium=2, warn=2, low=1, info=0
#
# Usage:
#   CLAUDE_PLUGIN_ROOT=/path/to/ccaudit bash audit.sh
#   bash audit.sh   (auto-detects from script location)

set -u

# ---------- resolve plugin root ----------
if [ -z "${CLAUDE_PLUGIN_ROOT:-}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  # scripts/ is 2 levels below plugin root: skills/audit/scripts/
  CLAUDE_PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
fi
PATTERN_DIR="${CLAUDE_PLUGIN_ROOT}/skills/audit/references/patterns"

# ---------- yq probe ----------
YQ_FALLBACK=0
command -v yq >/dev/null 2>&1 || YQ_FALLBACK=1

# ---------- helpers ----------
_bold()   { printf "\033[1m%s\033[0m" "$1"; }
_col_status() {
  case "$1" in
    PASS) printf "\033[32mPASS\033[0m" ;;
    WARN) printf "\033[33mWARN\033[0m" ;;
    FAIL) printf "\033[31mFAIL\033[0m" ;;
    INFO) printf "\033[36mINFO\033[0m" ;;
    *)    printf "%s" "$1" ;;
  esac
}

# ---------- awk frontmatter parser ----------
# Usage: _awk_field <file> <key>
# Returns the scalar value of <key> from the first YAML frontmatter block.
# Multi-line values (detection block) are handled by _awk_detection.
_awk_field() {
  local file="$1" key="$2"
  awk -v key="$key" '
    /^---/ { fm++; next }
    fm == 1 && /^[a-zA-Z_]/ {
      split($0, a, /:[[:space:]]*/);
      if (a[1] == key) { print substr($0, index($0, a[2])); found=1 }
    }
    fm == 2 { exit }
  ' "$file"
}

# Extract the multi-line detection block (everything indented under "detection: |")
_awk_detection() {
  local file="$1"
  awk '
    /^---/ { fm++; next }
    fm == 1 && /^detection:[[:space:]]*\|/ { in_det=1; next }
    fm == 1 && in_det && /^  / { sub(/^  /, ""); print; next }
    fm == 1 && in_det && !/^  / { in_det=0 }
    fm == 2 { exit }
  ' "$file"
}

# ---------- frontmatter extraction ----------
_get_field() {
  local file="$1" key="$2"
  if [ "$YQ_FALLBACK" -eq 0 ]; then
    yq eval ".$key" "$file" 2>/dev/null | grep -v '^null$' || true
  else
    _awk_field "$file" "$key"
  fi
}

_get_detection() {
  local file="$1"
  if [ "$YQ_FALLBACK" -eq 0 ]; then
    yq eval '.detection' "$file" 2>/dev/null | grep -v '^null$' || true
  else
    _awk_detection "$file"
  fi
}

_get_threshold_key() {
  local file="$1" key="$2"
  if [ "$YQ_FALLBACK" -eq 0 ]; then
    yq eval ".threshold.$key" "$file" 2>/dev/null | grep -v '^null$' || true
  else
    awk -v key="$key" '
      /^---/ { fm++; next }
      fm == 1 && /^threshold:/ { in_thr=1; next }
      fm == 1 && in_thr && /^  / {
        split($0, a, /:[[:space:]]*/);
        gsub(/^[[:space:]]+/, "", a[1]);
        if (a[1] == key) { gsub(/[[:space:]]/, "", a[2]); print a[2]; found=1 }
        next
      }
      fm == 1 && in_thr && !/^  / { in_thr=0 }
      fm == 2 { exit }
    ' "$file"
  fi
}

# ---------- severity ordinal ----------
_sev_ord() {
  case "$1" in
    high|fail) echo 3 ;;
    medium|warn) echo 2 ;;
    low) echo 1 ;;
    info) echo 0 ;;
    *) echo 0 ;;
  esac
}

# ---------- classify result ----------
# Outputs: STATUS measured target
_classify() {
  local file="$1" measured="$2"

  # manual patterns
  if [ "$measured" = "manual" ]; then
    echo "INFO manual manual"
    return
  fi

  # non-numeric guard: if measured is not a non-negative integer, emit WARN
  # (covers "error", empty string, or anything with non-digit characters)
  case "$measured" in
    ''|*[!0-9]*) echo "WARN (parse error) -"; return ;;
  esac

  local severity
  severity=$(_get_field "$file" "severity")

  # try threshold keys in order of specificity
  local fw fn ww wn wm fm fcount wcount
  fw=$(_get_threshold_key "$file" "fail_words")
  ww=$(_get_threshold_key "$file" "warn_words")
  fn=$(_get_threshold_key "$file" "fail_count")
  wn=$(_get_threshold_key "$file" "warn_count")
  fm=$(_get_threshold_key "$file" "fail_matches")
  wm=$(_get_threshold_key "$file" "warn_matches")
  local if_flag
  if_flag=$(_get_threshold_key "$file" "info_flag")

  # words thresholds
  if [ -n "$fw" ] && [ "$fw" != "null" ]; then
    local target="<${ww:-$fw}w"
    if [ "$measured" -ge "$fw" ] 2>/dev/null; then
      echo "FAIL $measured $target"
    elif [ -n "$ww" ] && [ "$measured" -ge "$ww" ] 2>/dev/null; then
      echo "WARN $measured $target"
    else
      echo "PASS $measured $target"
    fi
    return
  fi

  # count thresholds
  if [ -n "$fn" ] && [ "$fn" != "null" ]; then
    local target="<${wn:-$fn}"
    if [ "$measured" -ge "$fn" ] 2>/dev/null; then
      echo "FAIL $measured $target"
    elif [ -n "$wn" ] && [ "$measured" -ge "$wn" ] 2>/dev/null; then
      echo "WARN $measured $target"
    else
      echo "PASS $measured $target"
    fi
    return
  fi

  # match thresholds
  if [ -n "$fm" ] && [ "$fm" != "null" ]; then
    local target="0"
    if [ "$measured" -ge "$fm" ] 2>/dev/null; then
      echo "FAIL $measured $target"
    elif [ -n "$wm" ] && [ "$measured" -ge "$wm" ] 2>/dev/null; then
      echo "WARN $measured $target"
    else
      echo "PASS $measured $target"
    fi
    return
  fi

  if [ -n "$wm" ] && [ "$wm" != "null" ]; then
    if [ "$measured" -ge "$wm" ] 2>/dev/null; then
      echo "WARN $measured 0"
    else
      echo "PASS $measured 0"
    fi
    return
  fi

  # info_flag: emit INFO if measured == flag value
  if [ -n "$if_flag" ] && [ "$if_flag" != "null" ]; then
    if [ "$measured" = "$if_flag" ] 2>/dev/null; then
      echo "INFO $measured -"
    else
      echo "PASS $measured -"
    fi
    return
  fi

  # fallback: info
  echo "INFO $measured -"
}

# ---------- accumulators ----------
t1_rows=""   # "ID|NAME|STATUS|MEASURED|TARGET|COST%"
t2_rows=""   # "ID|NAME|STATUS|MEASURED|TARGET|CITATION"
fix_candidates=""  # "COST_ORD|SEV_ORD|ID|FIX_REF" for top-3

total_cost_fail=0

# ---------- main loop ----------
for pattern_file in "${PATTERN_DIR}"/*.md; do
  [ -f "$pattern_file" ] || continue

  pid=$(_get_field "$pattern_file" "id")
  pname=$(_get_field "$pattern_file" "name")
  ptier=$(_get_field "$pattern_file" "tier")
  psev=$(_get_field "$pattern_file" "severity")
  pcost=$(_get_field "$pattern_file" "cost_share_pct")
  pfixref=$(_get_field "$pattern_file" "fix_ref")
  pcitation=$(_get_field "$pattern_file" "citation")

  # skip if id missing (malformed file)
  [ -z "$pid" ] || [ "$pid" = "null" ] && continue

  # strip quotes if yq returns quoted strings
  pname="${pname#\"}" ; pname="${pname%\"}"
  pfixref="${pfixref#\"}" ; pfixref="${pfixref%\"}"
  pcitation="${pcitation#\"}" ; pcitation="${pcitation%\"}"

  # get and eval detection block
  det_script=$(_get_detection "$pattern_file")

  if [ -z "$det_script" ]; then
    measured="skip"
  else
    measured=$(eval "$det_script" 2>/dev/null) || measured="error"
  fi
  measured="${measured:-0}"

  # classify
  classify_out=$(_classify "$pattern_file" "$measured")
  status=$(echo "$classify_out" | cut -d' ' -f1)
  mval=$(echo "$classify_out" | cut -d' ' -f2)
  tval=$(echo "$classify_out" | cut -d' ' -f3)

  sev_ord=$(_sev_ord "$psev")

  if [ "$ptier" = "cost" ]; then
    cost_pct="${pcost:-0}"
    cost_ord="${cost_pct:-0}"
    t1_rows="${t1_rows}${pid}|${pname}|${status}|${mval}|${tval}|${cost_pct}%
"
    # collect for top-3 fixes (FAIL or WARN)
    if [ "$status" = "FAIL" ] || [ "$status" = "WARN" ]; then
      total_cost_fail=$((total_cost_fail + cost_pct))
      fix_candidates="${fix_candidates}${cost_ord} ${sev_ord} ${pid} ${pfixref}
"
    fi
  else
    t2_rows="${t2_rows}${pid}|${pname}|${status}|${mval}|${tval}|${pcitation}
"
    if [ "$status" = "FAIL" ] || [ "$status" = "WARN" ]; then
      # compliance patterns get cost_ord=0 (no cost share)
      fix_candidates="${fix_candidates}0 ${sev_ord} ${pid} ${pfixref}
"
    fi
  fi
done

# ---------- report ----------
printf "\n=== ccaudit report ===\n"

printf "\n[Section A] Tier 1 — Cost Overhead\n"
printf "%-7s | %-42s | %-6s | %-10s | %-10s | %s\n" \
  "ID" "Pattern" "Status" "Measured" "Target" "Cost share"
printf "%s\n" "$(printf '%.0s-' {1..90})"
while IFS='|' read -r rid rname rstatus rmeasured rtarget rcost; do
  [ -z "$rid" ] && continue
  printf "%-7s | %-42s | " "$rid" "$rname"
  _col_status "$rstatus"
  printf "    | %-10s | %-10s | %s\n" "$rmeasured" "$rtarget" "$rcost"
done <<EOF
${t1_rows}
EOF

printf "\n[Section B] Tier 2 — Best-Practice Compliance\n"
printf "%-7s | %-42s | %-6s | %-10s | %-10s | %s\n" \
  "ID" "Pattern" "Status" "Measured" "Target" "Citation"
printf "%s\n" "$(printf '%.0s-' {1..110})"
while IFS='|' read -r rid rname rstatus rmeasured rtarget rcitation; do
  [ -z "$rid" ] && continue
  printf "%-7s | %-42s | " "$rid" "$rname"
  _col_status "$rstatus"
  printf "    | %-10s | %-10s | %s\n" "$rmeasured" "$rtarget" "${rcitation:0:60}"
done <<EOF
${t2_rows}
EOF

# ---------- top-3 fixes ----------
printf "\n[Top 3 Fixes] ranked: cost_share_pct desc → severity desc\n"
if [ -n "$fix_candidates" ]; then
  top3=$(printf "%s" "$fix_candidates" | grep -v '^$' | sort -rn -k1,1 -k2,2 | head -3)
  rank=1
  while IFS=' ' read -r cord sord fid fref; do
    [ -z "$fid" ] && continue
    printf "  %d. %s → %s\n" "$rank" "$fid" "$fref"
    rank=$((rank + 1))
  done <<EOF2
${top3}
EOF2
else
  printf "  No WARN/FAIL patterns detected. Great shape!\n"
fi

# ---------- estimated savings ----------
printf "\nEstimated savings: %d%% productive-token uplift available.\n" "$total_cost_fail"
printf "(Sum of Tier 1 cost_share_pct for WARN/FAIL patterns)\n\n"
