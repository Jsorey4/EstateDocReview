#!/usr/bin/env python3
"""Append one JSON line per Claude Code hook event to ai_log/<kind>.jsonl.

Usage (from .claude/settings.json hooks): log_event.py <prompts|actions|turns>
Reads the hook payload as JSON on stdin. Never blocks Claude Code: always exits 0.
Set AI_LOG_DIR to redirect output (used for dry runs).
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOG_DIR = Path(os.environ.get("AI_LOG_DIR") or ROOT / "ai_log")

CAPS = {"prompt": 20000, "command": 500, "message": 2000, "path": 500}


def clip(value, cap):
    text = "" if value is None else str(value)
    return text if len(text) <= cap else text[:cap] + f"...[truncated {len(text) - cap} chars]"


def build_record(kind, payload):
    record = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "session_id": payload.get("session_id"),
    }
    if kind == "prompts":
        record["prompt"] = clip(payload.get("prompt"), CAPS["prompt"])
    elif kind == "actions":
        tool_input = payload.get("tool_input") or {}
        record["tool"] = payload.get("tool_name")
        if "command" in tool_input:
            record["command"] = clip(tool_input.get("command"), CAPS["command"])
        else:
            record["target"] = clip(
                tool_input.get("file_path") or tool_input.get("path"), CAPS["path"]
            )
    elif kind == "turns":
        record["last_assistant_message"] = clip(
            payload.get("last_assistant_message"), CAPS["message"]
        )
    else:
        raise ValueError(f"unknown kind: {kind}")
    return record


def main():
    kind = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
        record = build_record(kind, payload)
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        with open(LOG_DIR / f"{kind}.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception as exc:  # logging must never break the session
        try:
            LOG_DIR.mkdir(parents=True, exist_ok=True)
            with open(LOG_DIR / "hook_errors.log", "a", encoding="utf-8") as f:
                f.write(f"{datetime.now(timezone.utc).isoformat()} {kind}: {exc!r}\n")
        except Exception:
            pass
    sys.exit(0)


if __name__ == "__main__":
    main()
