#!/usr/bin/env python3
"""
analyze-session.py — Deep per-session analysis when proxy logs are available.

Usage:
    python3 analyze-session.py [log_dir]

Default log_dir: ~/.claude/logs

Reads JSON-line proxy logs and classifies tokens into:
  - productive
  - cache_hit_free
  - cache_miss_paid
  - history_re_read
  - hook_injection
  - skill_loading
  - tool_overhead
  - extended_thinking
  - claude_md
"""

import json
import os
import sys
from collections import defaultdict
from pathlib import Path

CATEGORIES = [
    "productive",
    "cache_hit_free",
    "cache_miss_paid",
    "history_re_read",
    "hook_injection",
    "skill_loading",
    "tool_overhead",
    "extended_thinking",
    "claude_md",
]


def classify(entry: dict) -> dict:
    """Return per-category token counts for one logged request."""
    out = defaultdict(int)
    usage = entry.get("usage", {})
    out["cache_hit_free"]  = usage.get("cache_read_input_tokens", 0)
    out["cache_miss_paid"] = usage.get("cache_creation_input_tokens", 0)
    out["extended_thinking"] = usage.get("thinking_tokens", 0)

    sys_prompt = entry.get("system_prompt_tokens", 0)
    tools      = entry.get("tool_schema_tokens", 0)
    history    = entry.get("history_tokens", 0)
    hooks      = entry.get("hook_injection_tokens", 0)
    skills     = entry.get("skill_md_tokens", 0)
    claude_md  = entry.get("claude_md_tokens", 0)
    user       = entry.get("user_message_tokens", 0)

    out["claude_md"]      = claude_md
    out["hook_injection"] = hooks
    out["skill_loading"]  = skills
    out["tool_overhead"]  = tools
    out["history_re_read"] = history
    out["productive"]     = user
    return out


def main():
    log_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / ".claude" / "logs"
    if not log_dir.is_dir():
        print(f"No log dir: {log_dir}")
        sys.exit(1)

    totals = defaultdict(int)
    n = 0
    for f in log_dir.glob("*.log"):
        with f.open() as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                cls = classify(entry)
                for k, v in cls.items():
                    totals[k] += v
                n += 1

    grand = sum(totals.values()) or 1
    print(f"Analyzed {n} requests across {log_dir}\n")
    print(f"{'category':<20} {'tokens':>12} {'share':>8}")
    print("-" * 44)
    for cat in CATEGORIES:
        v = totals.get(cat, 0)
        share = 100.0 * v / grand
        print(f"{cat:<20} {v:>12,} {share:>7.1f}%")
    print("-" * 44)
    print(f"{'TOTAL':<20} {grand:>12,}")
    productive_pct = 100.0 * totals.get("productive", 0) / grand
    print(f"\nProductive token share: {productive_pct:.1f}%")
    if productive_pct < 40:
        print("Status: HEAVY OVERHEAD — apply Pattern 1, 3, 5, 6 fixes first.")
    elif productive_pct < 60:
        print("Status: MODERATE — apply Pattern 2, 4 fixes.")
    else:
        print("Status: HEALTHY.")


if __name__ == "__main__":
    main()
