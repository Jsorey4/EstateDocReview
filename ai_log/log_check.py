"""Append a check result to ai_log/checks.jsonl.

Product scripts (verify_quotes.py, run_eval.py) import append_check so every
verification is logged for the one-page AI log without manual bookkeeping.
"""
import json
import os
from datetime import datetime, timezone
from pathlib import Path

LOG_DIR = Path(os.environ.get("AI_LOG_DIR") or Path(__file__).resolve().parent)


def append_check(name, passed, details=None):
    """name: short check id (e.g. "quote_verifier"); passed: bool or None; details: JSON-serializable dict."""
    record = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "check": name,
        "passed": passed,
        "details": details or {},
    }
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with open(LOG_DIR / "checks.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
