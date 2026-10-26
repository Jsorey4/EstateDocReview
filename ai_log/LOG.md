# AI log (template)

The competition requires a one-page PDF covering each core AI task. Hooks write the raw material to `ai_log/*.jsonl`; `compile_log.py` turns it into `LOG_DRAFT.md`. Do not edit the `.jsonl` files.

## Fields per entry
- **Task:** what the AI did.
- **Tool and model, and why:** PENDING (you fill in).
- **Key prompt, input, output:** from `prompts.jsonl` and the product's own run records.
- **Checks (at least two):** logged to `checks.jsonl` by `verify_quotes.py` and `run_eval.py`.
- **Decision (accepted / changed / rejected):** PENDING. Only you fill this in.
- **Reason:** PENDING.

## Two logs
1. **Building the entry:** Claude Code sessions (prompts, files and commands touched, turn summaries).
2. **The product's own runs:** extraction, reconciliation, the quote verifier, the gold-set eval.

Brainstorming and red-team runs count only partially under the brief. Mark them as such.
