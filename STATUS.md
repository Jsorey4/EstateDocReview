# Status

Update this file at the end of every work session.

## Current phase
Extraction, quote verifier and mutation script built and unit-tested (75 tests, API faked). Not yet run against real inputs: no API key is configured, and Household B doesn't exist yet. Next: user authors Household B (`households/README.md`), then reconciliation and `run_eval.py`.

## Session 2026-10-25 (evening): tasks 3 and 4
- `extract.py`: one strict tool call per document (`record_estate_facts`, `strict: true`, `tool_choice: auto` plus an explicit instruction, one retry if no tool call). Streams with `max_tokens` 64000 and no `eager_input_streaming`, which would switch off server-side strict validation. Server-side refusal fallback is on (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`); `model_served` and `fallback_used` are recorded. Refuses any document without a SYNTHETIC label unless `--public-dataset NAME` is given. Caches by document hash plus model, effort, prompt and schema version, so unchanged documents across variants are not re-sent.
- Product model: `claude-opus-5-5`, effort `high` (this model defaults to `medium`), adaptive thinking. Rationale in `extract.MODEL_RATIONALE` and in every record. No temperature: sampling parameters return a 400 since 2026-10-21.
- `verify_quotes.py`: a fact is verified only if its quote is on the stated page (exact, then exact ignoring spaces and punctuation, then fuzzy for `source: scanned` only: rapidfuzz partial_ratio ≥ 90 on quotes of at least 20 characters) AND its value is in the matched text. Unverified reasons: wrong_page (with the page where it was found), spans_pages, elided_quote, value_not_in_quote, date_not_in_quote, page_out_of_range, document_changed (sha256 mismatch). Reports digital and scanned pass rates separately and appends a `quote_verifier` check to `ai_log/checks.jsonl`.
- `mutate_household.py`: six mutations (former spouse on a designation, deceased fiduciary, will predates marriage, account retitled outside the trust, intended beneficiary missing from the documents, blank amendment date). It writes `input/` and `answer_key.json` per variant plus a `B_clean` control with zero expected issues. Expected facts come from the user's gold facts in `household.yaml`. `--check` validates B and warns about anything that would produce a finding in the clean household.
- Tests use a placeholder fixture household built in a temp directory (`tests/conftest.py`). It is not part of the test set.
- Not done: live API run (no key), PDF mode untested against the real API, `run_eval.py`, reconciliation.

## Repo setup (2026-10-25)
- GitHub: https://github.com/Jsorey4/EstateDocReview, **private** until the user decides to take it public. GitHub Pages on a free account needs a public repo, so flip visibility before publishing the site.
- First commit `073193b` on `main`; `origin` tracks `origin/main`. `gh` is authenticated as Jsorey4.
- Tracked: `CLAUDE.md`, `Project_Details.md`, `STATUS.md`, `.gitignore`, `.claude/` (settings, logging hook, red-team agent), `ai_log/LOG.md`, `ai_log/compile_log.py`, `ai_log/log_check.py`.
- Gitignored (local only): `ai_log/*.jsonl`, `ai_log/hook_errors.log`, `ai_log/LOG_DRAFT.md`, `.env*`, `.claude/settings.local.json`. The raw hook logs are the source for the one-page AI log PDF, so back them up outside git.
- Not committed: `AI_in_Finance_Case_Competition.docx` (competition brief, kept local).

## Next steps
1. Raymond James fact sheet (draft started in `RJ_Fact_Sheet.md`; 10-K scale facts verified, Form ADV fees, RJ Trust page and AI press releases still unverified after fetch timeouts): scale (10-K), services and fees (Form ADV Part 2A via SEC IAPD), advisor and client counts, estate-planning offering, AI announcements. Cite every item.
2. User gathers Layer 1 documents (FUNSD, VRDU, CUAD, own phone scans of hand-filled public Texas forms) and builds Household B (clean) by hand in the format in `households/README.md`; run `mutate_household.py households/B --check` until it reports no warnings.
3. ~~Build `verify_quotes.py` and the extraction step~~ Done. Set `ANTHROPIC_API_KEY`, then run `extract.py` on `households/variants/B_clean/input/docs` as the first live test. Scans: OCRmyPDF first, then `--source scanned`.
4. ~~Build the mutation script~~ Done. Write `households/plan.yaml` for the headline multi-account variant.
5. Reconciliation rules (must emit the issue types in `edr/issues.py`), then `run_eval.py`.
6. Dashboard, Mermaid flowchart, review packet, GitHub Pages (precomputed results only).
7. Business-case page, time study (label illustrative), demo recording, one-page AI log.

## Decisions log
- Firm: Raymond James.
- Cut: math engine (Capital Needs, Social Security, Monte Carlo); live law scraping.
- Agent 4 replaced by Claude Code hooks writing `ai_log/*.jsonl`. Agent 5 is the on-demand `red-team` subagent (role archetypes, not named judges).
- Naming: "Estate Document Review" (no "Fiduciary").
- Headline number: "$22M passing to a former spouse contrary to stated intent" (hypothetical, derived from the synthetic inventory; ERISA 401(k) scenario spread across accounts).
- Tax options may name a structure (e.g. credit-shelter trust) with quantified savings and trade-offs, then attorney referral. Conditional language only. Savings are deterministic; trade-offs come from a curated library.
- Test set is user-sourced, not AI-generated.
- Demo video is a screen recording from the GitHub Pages site; the video file is also uploaded to OneDrive per the brief.
- Product model `claude-opus-5-5` at effort `high`, with server-side refusal fallback on (2026-10-25). Revisit after the first eval run.
- Fuzzy quote matching only for documents marked `scanned`; digital documents must match exactly (ignoring spacing and punctuation).
- Household documents are authored as text with `--- page break ---` markers so the mutation script can edit them.

## Final checklist
- [ ] Verify Texas Government Code §81.101(c) current text (software safe harbor and disclaimer wording).
- [ ] Verify every Texas rule-pack citation against the statutes.
- [ ] Verify *Egelhoff v. Egelhoff* and the Texas Family Code treatment of former-spouse designations.
- [ ] Verify the estate-tax example math and the $15M exclusion against IRS sources.
- [ ] Confirm the disclaimer appears on the dashboard, packet, and in the video.
- [ ] Confirm "hypothetical" labels on the $22M scenario everywhere it appears.
- [ ] Check FUNSD and RVL-CDIP license terms; cite every dataset used.
- [ ] Confirm `git` history shows work started after Oct 25, 10 AM (first commit `073193b` made Oct 25, 2026).
- [ ] Back up `ai_log/*.jsonl` (gitignored) before compiling the AI log PDF.
- [ ] Make the repo public before enabling GitHub Pages; confirm no API key or raw logs in the public tree.
- [ ] Video 5 minutes or less, in your own voice, uploaded to OneDrive.
- [ ] One-page AI log PDF: decision fields completed by you, at least two checks shown.
- [ ] Files named `Last_First_RaymondJames_Video/Deliverable/AILog`, shared with `jsomfinlab@utdallas.edu`, links tested, Microsoft Form submitted before 11:59 PM.

## Frontend implementation (2026-10-25)
- Added Vite + React + TypeScript frontend with local fonts, responsive navigation, and green/ivory advisor workspace styling.
- Five-step questionnaire captures household context, people, life events, hypothetical assets, intentions, and fiduciary roles; browser persistence and backup/restore included.
- Source library accepts precomputed review JSON and exposes source text, quote/page references, and unverified facts. Added conservative offline `verify_quotes.py`; no live PDF upload, OCR, or AI extraction.
- Estate map groups client-reported probate/non-probate/unknown routes and shows document beneficiary evidence without asserting legal effect.
- Review queue compares exact names for matched subjects; unverified facts are excluded and conflicting source names remain unresolved. Follow-up statuses and notes appear in the printable report.
- No estate test documents, answer keys, tax thresholds, legal citations, or user accept/reject decisions were generated.
- Commands and review-data contract are documented in README.md. Publication and backend integration remain separate work.
- Validation: clean `npm ci` and production build passed; 13 frontend unit tests, 10 browser tests (including six automated accessibility scans), and five Python verifier checks passed. Desktop and mobile views were inspected. These are interface/protocol checks, not a product evaluation.
