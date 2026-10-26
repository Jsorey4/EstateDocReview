#!/usr/bin/env python3
"""Compile ai_log/*.jsonl into a draft LOG_DRAFT.md.

Every entry carries decision fields left as PENDING. The user fills in accepted,
changed or rejected and why. The one-page AI log PDF is then hand-edited from this draft.
Usage: python3 -I ai_log/compile_log.py
"""
import json
import os
from pathlib import Path

LOG_DIR = Path(os.environ.get("AI_LOG_DIR") or Path(__file__).resolve().parent)
KINDS = ["prompts", "actions", "turns", "checks"]


def load(kind):
    path = LOG_DIR / f"{kind}.jsonl"
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def main():
    data = {kind: load(kind) for kind in KINDS}
    out = ["# AI log draft", "", "Generated from ai_log/*.jsonl. Fill every PENDING field yourself.", ""]
    out.append("## Prompts")
    for r in data["prompts"]:
        out += [
            f"### {r['ts']}",
            f"- **Prompt:** {r.get('prompt', '')[:500]}",
            "- **Tool and model:** PENDING",
            "- **Why this tool:** PENDING",
            "- **Decision (accepted / changed / rejected):** PENDING",
            "- **Reason:** PENDING",
            "",
        ]
    out.append("## Checks")
    for r in data["checks"]:
        out += [f"- {r['ts']} `{r['check']}` passed={r['passed']} {json.dumps(r['details'])}"]
    out += ["", "## Actions (files and commands touched)"]
    for r in data["actions"]:
        out.append(f"- {r['ts']} {r.get('tool')}: {r.get('command') or r.get('target')}")
    out += ["", "## Turn summaries"]
    for r in data["turns"]:
        out.append(f"- {r['ts']}: {r.get('last_assistant_message', '')[:300]}")
    (LOG_DIR / "LOG_DRAFT.md").write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"Wrote {LOG_DIR / 'LOG_DRAFT.md'}")


if __name__ == "__main__":
    main()
