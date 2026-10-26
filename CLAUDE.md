# Estate Document Review (Raymond James case entry)

## What this is
An advisor-facing prototype for the UT Dallas "AI in Finance" case competition. Firm: **Raymond James**. It turns a client's estate documents into an evidence-backed advisor review: it extracts facts, reconciles the documents against the client's answers and asset records, and tells the advisor what to confirm with the client or refer to an estate attorney.

Product promise: "Turn a client's estate documents into an evidence-backed advisor review."

**Deadline: Mon Oct 26, 2026, 11:59 PM. Late entries are not judged.** Required: a video of 5 minutes or less (own voice or face, no AI voice), a deliverable, and a one-page AI log PDF. All go on OneDrive, shared (view) with jsomfinlab@utdallas.edu. File names: `Last_First_RaymondJames_Video`, `_Deliverable`, `_AILog`.

## Hard rules
1. **Synthetic or public data only.** Label synthetic documents SYNTHETIC. Never put real client, personal, or licensed data into any AI tool. Label hypothetical figures "hypothetical" everywhere they appear.
2. **No finding without verified evidence.** Every extracted fact carries a verbatim `quote` and a `page`. `verify_quotes.py` must confirm the quote appears on that page (fuzzy match for OCR'd scans). A fact that fails verification is flagged unverified and never shown as a finding.
3. **Preserve uncertainty.** Ambiguous precedence between documents stays unresolved: show both passages and ask. Document age alone is never a finding. The clean household must produce zero material findings; never manufacture problems.
4. **No legal advice (UPL boundary).** The tool talks to the advisor, never the client. It offers observations, quantified tax or financial consequences, and attorney-referral questions. See Output rules.
5. **Never invent** statutes, cases, citations, numbers, or sources. A rule-pack entry needs a source and a "last verified" date. When unsure, write "unverified".
6. **No accusations about real companies.** Never state or imply that Raymond James or any real firm fails, neglects, or is liable. Frame exposure as industry-wide.
7. **Texas only.**
8. **Do not generate test documents or answer keys.** The user sources the test set (see Test data). Build tooling around it.
9. **AI log.** Hooks write `ai_log/*.jsonl`. Never edit or delete those files and never disable the hooks. Never fill in the user's accept, change or reject decisions; leave them `PENDING`.

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
4. **Evaluate:** `run_eval.py` scores output against the answer key for field accuracy, issues caught, false alarms, citation pass rate, and time. Report digital and scanned pass rates separately.

On demand: the `red-team` subagent, only when the user asks.

## Scope
In: Texas; will, revocable trust, amendment, beneficiary designations, titling records, questionnaire, asset inventory; Texas rule pack (10–15 hand-verified provisions with cites and "last verified"); advisor discussion prompts.

Out (roadmap slide only): comprehensive estate-tax calculations, insurance recommendations, trust selection, retirement-distribution and Social Security planning, Monte Carlo, live law scraping and an update agent, 1040s, other states.

## Test data
User-sourced, never AI-generated. Layer 1 (OCR and extraction): public datasets and the user's own scans. Layer 2 (reconciliation): a clean Household B authored by the user, plus Household A variants produced by a mutation script, with the answer key coming from the script. Everything labeled SYNTHETIC. Cite every dataset used.

## Positioning
Position as an Estate Document Review layer for advisors. Document analysis is not novel: Wealth.com (Ester), Vanilla, Luminary and Trust & Will analyze estate documents, and RightCapital draws estate flow charts. The claim is the quality of the focused workflow (cross-source reconciliation, uncertainty-first output, measured false alarms). Demonstrate it with the eval; do not assert it.

## Rubric (20 points each)
AI Deployment; Analysis & Evidence; Business Value & Feasibility; Innovation & Creativity; Presentation & Deliverable. "One well-supported idea will score higher than several thin ones."

## Files
- `Project_Details.md`: project background and decisions
- `STATUS.md`: session log and final checklist; update at the end of every work session
- `AI_in_Finance_Case_Competition.docx`: competition instructions
- `ai_log/`: hook-written logs (do not edit)
- `households/README.md`: authoring format for Household B and the mutation catalog
- `edr/`: shared code (page loading, normalization, dates, extraction schema, issue types, household loader)

## Commands
Setup: `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`
- Tests: `.venv/bin/python -m pytest -q` (no network; the API is faked)
- Extract + verify: `.venv/bin/python extract.py <docs or dir> --out runs/<run>/facts` (needs `ANTHROPIC_API_KEY`; `--source scanned` for OCR'd scans; cached by document hash in `.cache/`)
- Re-verify: `.venv/bin/python verify_quotes.py runs/<run>/facts` (appends to `ai_log/checks.jsonl`; `--no-log` to skip)
- Mutations: `.venv/bin/python mutate_household.py households/B --check`, then `--out households/variants`
- `run_eval.py`: not built yet
