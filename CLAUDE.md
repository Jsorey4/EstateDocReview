# Estate Document Review (Raymond James case entry)

## What this is
An advisor-facing prototype for the UT Dallas "AI in Finance" case competition. Firm: **Raymond James**. It turns a client's estate documents into an evidence-backed advisor review: it extracts facts, reconciles the documents against the client's answers and asset records, and tells the advisor what to confirm with the client or refer to an estate attorney.

Product promise: "Turn a client's estate documents into an evidence-backed advisor review."

**Deadline: Mon Oct 26, 2026, 11:59 PM. Late entries are not judged.** Required: a video of 5 minutes or less (own voice or face, no AI voice), a deliverable, and a one-page AI log PDF. All go on OneDrive, shared (view) with jsomfinlab@utdallas.edu. File names: `Last_First_RaymondJames_Video`, `_Deliverable`, `_AILog`.

## Hard rules
1. **No finding without verified evidence.** Every extracted fact carries a verbatim `quote` and a `page`. `pipeline/verify_quotes.py` must confirm the quote appears on that page (fuzzy match for OCR'd scans). A fact that fails verification is flagged unverified and never shown as a finding.
2. **Preserve uncertainty.** Ambiguous precedence between documents stays unresolved: show both passages and ask. Document age alone is never a finding. The clean household must produce zero material findings; never manufacture problems.
3. **No legal advice (UPL boundary).** The tool talks to the advisor, never the client. It offers observations, quantified tax or financial consequences, and attorney-referral questions. See Output rules.
4. **Never invent** statutes, cases, citations, numbers, or sources. A rule-pack entry needs a source and a "last verified" date. When unsure, write "unverified".
5. **No accusations about real companies.** Never state or imply that Raymond James or any real firm fails, neglects, or is liable. Frame exposure as industry-wide.
6. **Texas only.**
7. **Do not generate test documents or answer keys.** The user sources the test set (see Test data). Build tooling around it.
8. **AI log.** Hooks write `ai_log/*.jsonl`. Never edit or delete those files and never disable the hooks. Never fill in the user's accept, change or reject decisions; leave them `PENDING`.

## Output rules (findings)
Every finding has four parts: **observation, supporting evidence (quote + page), uncertainty, next question.**

Allowed output shapes:
- "Current structure leaves $X above the exclusion." (rule cited)
- A quantified tax consequence with the rule cited and assumptions shown.
- "Options exist that an estate attorney should evaluate."
- A question for the attorney, e.g. "Does the current structure preserve the first spouse's exclusion?"
- Former-spouse finding: "401(k) names former spouse (p.X). Questionnaire reports divorce and remarriage. $X passes contrary to stated intent. Confirm the designation on file with the plan administrator, ask the client whether it's intended, and refer to an estate attorney about its effect on the trust and will."
- Tax option: "A credit-shelter trust could reduce estimated federal estate tax by about $___ under [assumptions], but trade-offs include ___. Bring to the client's attention and refer to an estate attorney."

Rules for tax options:
1. Conditional language only ("could", "may", "under these assumptions"). Never "should", "must", "replace", "recommend adopting".
2. Savings come from a deterministic calculation with assumptions displayed. The model never invents a savings figure.
3. Trade-offs come from the curated library in `rules/` with citations, not free text.
4. If savings are small or zero (for example, portability already preserves the exclusion), say so.
5. Every tax option ends with an attorney referral and the disclaimer: "Not a substitute for the advice of an attorney."

Never write that a provision is void, invalid or unenforceable. Never draft clause language. Never say which legal instrument a client should adopt.

## Architecture
1. **Extract:** a strict tool schema (`quote` and `page` per fact), then the deterministic quote verifier. Per the Claude API docs, native PDF citations cannot be combined with structured outputs, and forced `tool_choice` returns a 400 on `claude-sonnet-5-5` and `claude-opus-5-5`. Use `strict: true` tools with `tool_choice: auto` and an explicit instruction. Choose the product model deliberately and log the choice.
2. **Reconcile:** Python rules over the extracted JSON, with the LLM only for semantic comparison of provisions.
3. **Present:** advisor dashboard, Mermaid flowchart (assets to instruments to beneficiaries, probate and non-probate lanes, status colors confirmed, flagged, unresolved), review packet, "Advisor discussion prompts" panel, disclaimer. Static site for GitHub Pages: precomputed results only, no live uploads, no API key in the page.
4. **Evaluate:** `evaluation/run_eval.py` scores output against the answer key for field accuracy, issues caught, false alarms, citation pass rate, and time. Report digital and scanned pass rates separately.

On demand: the `red-team` subagent, only when the user asks.

## Scope
In: Texas; will, revocable trust, amendment, beneficiary designations, titling records, questionnaire, asset inventory; Texas rule pack (10–15 hand-verified provisions with cites and "last verified"); advisor discussion prompts.

Out (roadmap slide only): comprehensive estate-tax calculations, insurance recommendations, trust selection, retirement-distribution and Social Security planning, Monte Carlo, live law scraping and an update agent, 1040s, other states.

## Test data
User-sourced, never AI-generated. Layer 1 (OCR and extraction): public datasets and the user's own scans. Layer 2 (reconciliation): a clean Household B authored by the user, plus Household A variants produced by a mutation script, with the answer key coming from the script. Everything labeled SYNTHETIC. Cite every dataset used.

Use these terms consistently in code, documentation, and UI:
- **Fixtures:** placeholder data used by automated tests; never product-evaluation evidence.
- **Cases:** evaluation inputs whose provenance and intended use have been established. Do not assume the local `Estate_Test_Cases/` PDFs qualify until their source is confirmed.
- **Variants:** deterministic mutations of a user-authored household, produced by the mutation tooling.
- **Replay bundles:** precomputed pipeline results packaged for the Sample replay page by `bridge/build_replay_samples.py`.
- Executable test support belongs in `tests/helpers/`; it is not fixture data.

## Positioning
Position as an Estate Document Review layer for advisors. Document analysis is not novel: Wealth.com (Ester), Vanilla, Luminary and Trust & Will analyze estate documents, and RightCapital draws estate flow charts. The claim is the quality of the focused workflow (cross-source reconciliation, uncertainty-first output, measured false alarms). Demonstrate it with the eval; do not assert it.

## Rubric (20 points each)
AI Deployment; Analysis & Evidence; Business Value & Feasibility; Innovation & Creativity; Presentation & Deliverable. "One well-supported idea will score higher than several thin ones."

## Files
- `docs/project_brief.md`: project background and decisions
- `docs/raymond_james_fact_sheet.md`: firm research with verified/unverified source labels
- `STATUS.md`: session log and final checklist; update at the end of every work session
- `docs/competition_instructions.docx`: competition-owned instructions (local only, gitignored)
- `ai_log/`: hook-written logs (do not edit)
- `households/README.md`: authoring format for Household B and the mutation catalog
- `edr/`: shared code (page loading, normalization, dates, extraction schema, issue types, household loader)
- `pipeline/`: OCR, extraction, quote verification, and reconciliation; Extract → Reconcile
- `bridge/`: frontend/backend input conversion, review-packet export, replay packaging, and frontend contract generation; Present
- `evaluation/`: household mutations and pipeline scoring; Evaluate
- `legacy/verify_review_packet_v1.py`: version-1 packet compatibility helper, distinct from the authoritative `pipeline/verify_quotes.py`
- `src/backendContract.generated.ts`: generated vocabulary; edit its Python authorities and regenerate, never hand-edit
- `tests/helpers/`: executable browser-test helpers; `tests/browser/`: Playwright checks

## Commands
Run all commands from the repository root. Python tools are packages invoked with `-m`; direct execution of their file paths is not the supported entry point.

Setup: `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`
- Tests: `.venv/bin/python -m pytest -q` (no network; the API is faked)
- Extract + verify: `.venv/bin/python -m pipeline.extract <docs or dir> --out runs/<run>/facts` (needs `ANTHROPIC_API_KEY`; `--source scanned` for OCR'd scans; cached by document hash in `.cache/`)
- Re-verify: `.venv/bin/python -m pipeline.verify_quotes runs/<run>/facts` (appends to `ai_log/checks.jsonl`; `--no-log` to skip)
- Mutations: `.venv/bin/python -m evaluation.mutate_household households/B --check`, then `--out households/variants`
- OCR scans: `.venv/bin/python -m pipeline.ocr_scans scans/ --out scans_ocr/` (needs `brew install ocrmypdf tesseract`; writes `ocr_report.json` with weak pages; then use `pipeline.extract` with `--source scanned`)
- Reconcile: `.venv/bin/python -m pipeline.reconcile --facts runs/<run>/facts --inputs households/variants/<v>/input --out runs/<run>/findings.json`
- Eval: `.venv/bin/python -m evaluation.run_eval --variants households/variants --run runs/<run>` (expects `runs/<run>/<variant>/facts/*.json`; writes `eval.json`)
- Demo samples: `.venv/bin/python -m bridge.build_replay_samples --variants households/variants --run runs/<run> --out public/samples` (after `evaluation/run_eval.py`; feeds the Sample replay page; never reads answer keys)
- Workspace → backend inputs: `.venv/bin/python -m bridge.workspace_to_inputs --workspace workspace.json --out inputs/`
- Facts → review packet: `.venv/bin/python -m bridge.facts_to_review_packet --workspace workspace.json --facts runs/<run>/facts --out review.json`
- Regenerate frontend vocabulary: `.venv/bin/python -m bridge.sync_backend_contract`; append `--check` to check for drift without writing
- Legacy v1 packet verification: `.venv/bin/python -m legacy.verify_review_packet_v1 input.json review.json`
