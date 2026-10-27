# Status

Update this file at the end of every work session.

## Current phase
As of 2026-10-26, the static advisor workspace and offline Python pipeline are implemented and pass the checks below. Extraction, quote verification, six deterministic reconciliation rules (seven issue types), evaluation, OCR orchestration, version-2 review-packet export/import, sample packaging/replay, estate flow, and the printable review packet exist. Questionnaire usability improvements are implemented. The project is at the **validated-software / unvalidated-demo stage**: live extraction, real-scan OCR, user-sourced evaluation, and published replay data have not been demonstrated in this checkout.

### Current project memory (refreshed 2026-10-26)
- Repository: `https://github.com/Jsorey4/EstateDocReview`; working branch `main`. Fetch and `git pull --ff-only origin main` completed successfully and reported **Already up to date**. GitHub `origin/main` is `982c83e`; local HEAD is `7cc07ca07f2b3153647873c9cb4eb4a9859a2206`, **one commit ahead**. That local commit changes 37 files (+4,922 / -279). No push was performed. Repository visibility/deployment were not rechecked remotely.
- Existing untracked inputs were preserved: `AI_in_Finance_Case_Competition.docx` and seven PDFs in `Estate_Test_Cases/` (five case numbers; cases 2 and 3 each have two documents). Their contents/provenance were not audited in this sync review. Do not confuse their presence with a completed evaluation dataset.
- No `households/B`, `households/variants`, `runs/`, `public/samples/`, or `rules/` exists in this checkout. `households/` currently contains only its authoring README. The replay page therefore has an empty state; browser tests supply temporary placeholder bundles, not publishable demo evidence.
- Product: Texas-only, advisor-facing Estate Document Review for the Raymond James competition entry. Static React/TypeScript/Vite frontend, Python CLI backend, browser-local workspace persistence; no live upload/API endpoint. Keep hypothetical amounts, uncertainty, quote/page evidence, and attorney-referral wording. Do not generate the user's evaluation documents or answer keys. Raw AI logs remain append-only; user decisions remain PENDING.
- Backend: `extract.py` records model/effort/fallback provenance and caches extraction; `verify_quotes.py` is authoritative. `reconcile.py` compares verified facts with questionnaire/assets. `run_eval.py` scores gold-field recall, issue recall/status, false alarms, citation verification and timing, with digital/scanned splits. `ocr_scans.py` wraps OCRmyPDF with quality scoring and a heavier retry. Neither `ocrmypdf` nor `tesseract` is installed here.
- **Data-label behavior changed in `7cc07ca`:** unlabeled extraction inputs are now sent as `user_supplied`; `--synthetic-confirmed` was removed. Review export, legacy packet verification and frontend import accept that label. `build_samples.py` still rejects it and publishes only synthetic/public documents with synthetic questionnaire inputs. Earlier session notes describing an extraction-time refusal are historical, not current enforcement; synthetic/public-only demo policy still applies.
- Backend findings enter the workspace through Sample replay's **Open in workspace** action (or a backup with the optional `backend` object). Importing an ordinary review packet clears backend findings and dispositions; it does not run the Python rules. `reviewItems()` combines stored backend findings with browser name comparisons for Overview, Review, Estate flow and Report. Version-1 backups remain supported. Version-2 verification metadata are trusted pipeline output, not cryptographic attestation.
- Replay: five stages plus an optional sixth evaluation stage; variant selection, six-second autoplay, keyboard navigation, page/quote inspection, and workspace loading. The sample builder re-verifies sources, reruns reconciliation, copies evaluation counts, and excludes answer-key details. Scores still depend on the supplied `eval.json` matching the run.
- Questionnaire: explicit relationship choices with opt-in synonym suggestions; percentages, share-total warnings and legacy-share preservation; notes on people/assets/beneficiaries; completion checklists and field highlighting. Notes persist in workspace/report and are omitted from backend YAML inputs.
- `RJ_Fact_Sheet.md` remains a draft. Its V/U labels reflect earlier research; this repository review did not independently re-verify external facts. Texas citation pack, tax-option calculator, business-case/time study, public deployment, video and one-page AI log remain outstanding or unconfirmed.

### Validation at local HEAD `7cc07ca`
- `.venv/bin/python -m pytest -q`: **117 passed**.
- `.venv/bin/python scripts/sync_backend_contract.py --check`: **passed**.
- `npm test`: **30 passed** across two files.
- `npm run build`: **passed** (non-blocking third-party Zod annotation warnings).
- `CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:e2e`: **17 passed**, including accessibility and Python-to-browser integration checks. Required sandbox permission to bind the local test-server port.
- These use fake model/OCR runners and placeholder fixtures. They do not establish live model accuracy, legal correctness, real-scan performance, or measured advisor time savings.

### Review follow-ups (identified, not fixed)
1. **Asset exposure is double-counted across findings** (`reconcile.py`, summary aggregation). Reusing the existing placeholder fixture, a deceased former spouse on the same $100 account produces two flagged findings and a $200 summary. Aggregate unique affected assets before presenting total exposure.
2. **Missing verified beneficiary evidence can become a finding** (`reconcile.py`, `rule_intent_mismatch`). With other verified beneficiaries present, an intended person's fact rejected as `wrong_page` still produces `intent_mismatch` supported only by the questionnaire. Both frontend evidence gates permit questionnaire-only findings. Distinguish incomplete/failed extraction from a supported discrepancy before claiming missing facts never create findings.
3. **Printed report omits stale/withheld warnings** (`src/Report.tsx` versus `src/Review.tsx`). Editing a loaded sample's questionnaire leaves the original backend findings in place; Review warns, but Report presents the edited answers alongside the old findings without that warning. Report can also say no material findings when backend findings were withheld. Carry those caveats into the printable packet.

## Session 2026-10-26: GitHub sync and project-state review
- Reviewed the tracked project documentation and the changes in the latest local commit, including backend rules/scoring/OCR, replay/packet wiring, questionnaire, styling, and related tests.
- Pulled GitHub without rewriting the local commit or touching untracked source documents; no incoming commits were available.
- Re-ran the existing validation suite and reproduced the first two review follow-ups using the existing in-memory test fixture. No evaluation documents, answer keys, API calls, or public samples were produced by this review.
- Refreshed the current-phase summary and next steps, and corrected stale README statements about reconciliation/evaluation. Earlier session entries below are preserved as history; the current snapshot above takes precedence.

## Session 2026-10-25 (evening): tasks 3 and 4
- `extract.py`: one strict tool call per document (`record_estate_facts`, `strict: true`, `tool_choice: auto` plus an explicit instruction, one retry if no tool call). Streams with `max_tokens` 64000 and no `eager_input_streaming`, which would switch off server-side strict validation. Server-side refusal fallback is on (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`); `model_served` and `fallback_used` are recorded. Refuses any document without a SYNTHETIC label unless `--public-dataset NAME` is given. Caches by document hash plus model, effort, prompt and schema version, so unchanged documents across variants are not re-sent.
- Product model: `claude-opus-5-5`, effort `high` (this model defaults to `medium`), adaptive thinking. Rationale in `extract.MODEL_RATIONALE` and in every record. No temperature: sampling parameters return a 400 since 2026-10-21.
- `verify_quotes.py`: a fact is verified only if its quote is on the stated page (exact, then exact ignoring spaces and punctuation, then fuzzy for `source: scanned` only: rapidfuzz partial_ratio ≥ 90 on quotes of at least 20 characters) AND its value is in the matched text. Unverified reasons: wrong_page (with the page where it was found), spans_pages, elided_quote, value_not_in_quote, date_not_in_quote, page_out_of_range, document_changed (sha256 mismatch). Reports digital and scanned pass rates separately and appends a `quote_verifier` check to `ai_log/checks.jsonl`.
- `mutate_household.py`: six mutations (former spouse on a designation, deceased fiduciary, will predates marriage, account retitled outside the trust, intended beneficiary missing from the documents, blank amendment date). It writes `input/` and `answer_key.json` per variant plus a `B_clean` control with zero expected issues. Expected facts come from the user's gold facts in `household.yaml`. `--check` validates B and warns about anything that would produce a finding in the clean household.
- Tests use a placeholder fixture household built in a temp directory (`tests/conftest.py`). It is not part of the test set.
- Not done: live API run (no key), PDF mode untested against the real API, `run_eval.py`, reconciliation.

## Session 2026-10-26: reconcile, eval, OCR
- `reconcile.py`: six deterministic rules (former spouse, deceased fiduciary or beneficiary, will or trust predating the current marriage, asset registered outside the trust, intended beneficiary no document names, blank amendment date). Only verified facts count. A missing fact is a coverage gap, never a finding. Findings sort flagged first, then by hypothetical amount at stake. No model call, so decisions are reproducible and take milliseconds. No statute or case is cited because `rules/` (the Texas rule pack) does not exist yet; `rule_refs` is empty and the output says so.
- `run_eval.py`: field accuracy, issues caught (one-to-one match on type plus shared document or person; status checked), false alarms (clean control reported separately), citation pass rate, reconcile time; digital and scanned split. Variants with no extraction are skipped, not scored zero.
- `ocr_scans.py`: OCRmyPDF wrapper with a per-page word-likeness gate, a heavier retry (force-OCR, 450 dpi, clean) for weak pages, and a report of pages still weak. **Not run against a real scan**: `ocrmypdf` and `tesseract` are not installed here, so only the logic is tested (fake runner).
- Tests: 98 pass. Includes an end-to-end test (mutate, simulate a perfect extractor from the answer key, reconcile, score) on the placeholder fixture: every planted issue caught, zero false alarms. That shows the components agree with each other, not that the real extractor is accurate.
- Still not done: live API run, Household B, Texas rule pack with verified cites, tax-option calculator, dashboard and flowchart, review packet.

## Session 2026-10-26: sample loader and replay stepper
- `build_samples.py`: packages each variant that has extraction records into `public/samples/<variant>.json` plus `index.json`. A bundle holds the frontend-shaped questionnaire (from `questionnaire.yaml`/`assets.yaml`), a v2 review packet built by `export_review.build_packet` (re-verifies quotes against the unchanged sources), the reconciliation output re-run on the re-verified records, and evaluation counts from `runs/<run>/eval.json` if present. Never reads answer keys; drops `missed` and `field_misses` from eval output. Refuses user_supplied documents, bundles over 8 MB, and overwriting without `--force`.
- Frontend: new **Sample replay** page (`src/Replay.tsx`, loader and schemas in `src/samples.ts`). Six-step stepper (intake, extract, verify, reconcile, review, measure) with previous/next, play (6 s per step), arrow/Home/End keys, a variant switcher that keeps the current step, a source-page viewer that highlights the cited quote, and **Open in workspace**. Findings are withheld unless every cited quote is a verified packet fact. No samples → an empty state with the build command.
- **No demo data yet.** `public/samples/` does not exist; it needs the live extraction run first (API key), then `run_eval.py`, then `build_samples.py`.
- Tests: 8 Python (`tests/test_build_samples.py`), 7 frontend unit (`tests/samples.test.ts`), 3 browser (`tests/browser/replay.spec.ts`, including two axe scans). The browser tests serve bundles built on the placeholder fixture through a route handler; nothing is written to `public/`. Totals: 116 Python, 23 unit, 14 browser, build and contract check all pass. Browser tests were run locally with `CHROMIUM_PATH` set to Google Chrome.
- Opening a sample now puts its `reconcile.py` findings in the workspace (new optional `backend` field, backward-compatible with old backups). `reviewItems()` in `src/domain.ts` feeds the Review queue, review packet, Overview and Estate flow: backend findings first (four parts, amount at stake, questionnaire answer, verified quotes), then the name comparisons. Findings whose cited quotes are not verified in the current packet are withheld; a questionnaire edit shows a staleness notice (no in-browser re-run); importing new review data clears them. Tests: 3 more unit tests and an extended browser test (Review queue, follow-up status carried into the packet, clean variant shows "No material findings", axe scan). Totals: 116 Python, 26 unit, 14 browser.

## Session 2026-10-26: questionnaire usability
- Empty-state plus icons on People and Assets now add a person or asset (same as the button).
- Relationship is a single choice: Parent, Child, Spouse, Attorney, or Other with a text box. Typing a common synonym under Other (wife, husband, son, mother, lawyer...) offers the matching category; it is never applied automatically. Old free-text values still load (matching words map to the category, anything else shows as Other). Backend export writes the lowercase category or the Other text.
- Intended-beneficiary shares are percentages only (0–100, "%" suffix), with a running total and a warning when shares do not add to 100%. Older non-percentage answers (e.g. "all", or "not stated" from the mutation script) stay visible with a "Move to notes" action. Notes/comments fields on each person, asset and intended beneficiary; they appear in the review packet and are not exported to the backend YAML.
- Unfinished work is clearer: each step in the sidebar shows Complete / Not finished / "N still needed" / "N to confirm"; each step opens with a "To finish this step" list and a non-blocking "Worth confirming" list (client name and as-of date for export, current marriage, unknown living status, missing relationship, share problems). After leaving an unfinished step, its missing fields are outlined with a message. The completion badge is amber until all five steps are done, and the footer counts what is still needed. `completion()` is now derived from `missingItems()`, with unchanged criteria.
- Tests: 30 unit, 17 browser (new `tests/browser/questionnaire.spec.ts`), 117 Python, build pass.

## Repo setup (2026-10-25)
- GitHub: https://github.com/Jsorey4/EstateDocReview, **private** until the user decides to take it public. GitHub Pages on a free account needs a public repo, so flip visibility before publishing the site.
- First commit `073193b` on `main`; `origin` tracks `origin/main`. `gh` is authenticated as Jsorey4.
- Tracked: `CLAUDE.md`, `Project_Details.md`, `STATUS.md`, `.gitignore`, `.claude/` (settings, logging hook, red-team agent), `ai_log/LOG.md`, `ai_log/compile_log.py`, `ai_log/log_check.py`.
- Gitignored (local only): `ai_log/*.jsonl`, `ai_log/hook_errors.log`, `ai_log/LOG_DRAFT.md`, `.env*`, `.claude/settings.local.json`. The raw hook logs are the source for the one-page AI log PDF, so back them up outside git.
- Not committed: `AI_in_Finance_Case_Competition.docx` (competition brief, kept local).

## Next steps

Repository organization is complete: `pipeline/`, `bridge/`, `evaluation/`, and `legacy/` are Python packages; `edr/` remains the shared library. Run commands from the repository root with `.venv/bin/python -m <package.module>`. Current commands and file locations are in `README.md` and `CLAUDE.md`; earlier snapshots and session entries below retain the names used at the time.

1. Resolve the review follow-ups above before relying on displayed exposure totals or exporting a final advisor packet.
2. Establish the provenance and intended use of the seven local case PDFs. Complete the user-authored clean Household B and gold facts in `households/README.md` format; run `.venv/bin/python -m evaluation.mutate_household households/B --check`, then generate variants with the existing tooling. Do not substitute placeholder fixtures for user-sourced evaluation data.
3. Validate a live extraction with securely configured API credentials, inspect source/quote verification, and exercise real scanned input if it will be claimed. The configured model/API options have only fake-client coverage here. Install OCR tools if scans are needed.
4. Run `.venv/bin/python -m evaluation.run_eval` on actual extraction records, inspect misses/false alarms (especially the clean control), then `.venv/bin/python -m bridge.build_replay_samples` to create `public/samples`. Keep evaluation counts aligned with the packaged run. Inspect the resulting replay and printable packet.
5. Finish or explicitly narrow the Texas rule-pack/tax-option scope; verify any legal/tax claims from primary sources. Finish unverified items in `docs/raymond_james_fact_sheet.md` before using them in the deliverable.
6. Complete the business-case/time study (label illustrative), static-site deployment, video of at most five minutes, and one-page AI log. Validate submission links and the final checklist. Recorded competition deadline: **October 26, 2026, 11:59 PM**; no submission was made by this sync/review.

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


## Integration session (2026-10-26)
- Merged backend commit `fcea6b0` with the React frontend, preserving both histories and resolving `.gitignore`/`STATUS.md` conflicts.
- Root `verify_quotes.py` is the backend authority. The old frontend-format helper is isolated at `scripts/verify_review_packet.py` for version-1 compatibility.
- `export_review.py` re-verifies extraction records from unchanged source files, links assets through `governing_document`, embeds source pages, and preserves native field names and verification/provenance metadata in a version-2 packet.
- `export_household_inputs.py` exports user-entered questionnaire and asset answers using the backend YAML vocabulary; no documents, gold facts, or answer keys are produced.
- Added client/as-of fields, dated marriage history, intended shares, available documents, property character, governing document IDs, and 401(k)/IRA differentiation. Initial trustees, successor trustees, primary beneficiaries, and contingent beneficiaries are kept distinct. Removed unsupported financial-agent comparison.
- Shared frontend vocabulary is generated from `edr/schema.py` and `edr/issues.py`, with a drift check. Native backend results remain inspectable even when no frontend comparison rule exists.
- Version-2 imports use trusted backend verification metadata; the browser does not rerun RapidFuzz or authenticate those metadata. Legacy version-1 packets retain their browser checks.
- Validation: 85 Python tests, 16 frontend unit tests, 11 browser tests (including Python export → actual UI import and six accessibility scans), vocabulary drift check, and production build. API calls are faked; live model extraction and real household evaluation are unrun.

## Session 2026-10-26: stage packages and naming cleanup
- Completed the full organization change: OCR/extraction/verification/reconciliation in `pipeline/`; directional conversion, replay packaging and contract generation in `bridge/`; mutation/scoring in `evaluation/`; version-1 packet verification in `legacy/`. `edr/` remains the shared library. Entry points are `.venv/bin/python -m <package.module>` from the repository root.
- Renamed bridge modules to `facts_to_review_packet`, `workspace_to_inputs`, and `build_replay_samples`. Renamed the legacy verifier and its test to `verify_review_packet_v1.py` / `test_verify_review_packet_v1.py`. Moved executable browser helpers into `tests/helpers/`, fixed their root paths and test imports, and updated both Playwright callers.
- Renamed generated vocabulary to `src/backendContract.generated.ts`, updated the generator and imports, and regenerated it. Existing packet schemas and the `verifiedBy: "verify_quotes.py"` identifier remain unchanged.
- Moved project context into `docs/project_brief.md` and `docs/raymond_james_fact_sheet.md`. Moved the local competition instructions to `docs/competition_instructions.docx` and gitignored that exact path; verified its bytes were unchanged. `Estate_Test_Cases/` remains untracked and unmoved pending provenance review. AI-log files, tools and hooks were not changed.
- Updated README, CLAUDE, household authoring commands, UI command examples, and the red-team document reference. Added the fixtures/cases/variants/replay-bundles vocabulary. Earlier STATUS snapshots/session entries were left intact; only the current Next steps checklist was updated, plus this new session entry.
- Validation: **118 Python tests, 30 frontend unit tests, 17 Playwright tests, production build and contract drift check passed**. Ten package CLI entry points passed `--help` smoke checks. Added one regression check that stored repository-relative source paths still verify after the package move, even from a different working directory. Existing non-blocking third-party build warnings remain. No live API calls, evaluation dataset generation, deployment or GitHub push was performed.


## Session 2026-10-26: intentional bundle edits and readable formatting
- The user confirmed that the banner text and decorative quotation mark omitted from the built JavaScript were intentional, along with additional omissions. Treat the current bundle's content edits as intentional; do not restore omitted content merely to match the source or a fresh build. The additional omissions were not individually specified.
- Formatted `dist/assets/index-B3j-c9qp.css` and `dist/assets/index-BMak2Y1A.js` in place with two-space indentation, line breaks, and an 80-column formatting target. Preserved current content, identifiers, comments, filenames, and asset references. No production rebuild or changes to application behavior were made.
- Validation: JavaScript syntax trees matched before and after formatting (ignoring positions and formatting metadata), and comments were preserved. CSS normalized output matched before and after formatting. Both files pass Prettier's formatting check, and JavaScript passes Node's syntax check.
- These assets are ignored by Git under `dist/`. Their intentional content edits have not been synchronized to `src/`; a future build can overwrite them. Reconcile the user's omissions before regenerating the distribution. The earlier review's proposed functional fixes remain unimplemented.


## Session 2026-10-26: judge-facing household workflow
- Estate flow asset actions open the Assets questionnaire step. Review packet section numerals are larger than their headings, including in print.
- Added a three-case household chooser to the household switcher, settings, and Documents. Settings offers example selection and Start new household; removed backup restoration, the separate destructive section, and device-transfer copy. Starting a blank household and replacing an existing household use confirmation dialogs.
- Removed document file inputs, drag/drop imports, technical import guidance, and visible JSON terminology from the document flow. Kept “Every observation starts with a source”. Replaced visible synthetic labels with Example; internal data provenance is unchanged.
- The user confirmed Case 2 templates are being added and Case 3 is forthcoming; household names/details will be filled in later. Case slots remain unavailable until valid prepared workspace payloads exist under public/examples/case1.json through case3.json. No case facts, document text, or verification results were invented.
- Synchronized the user's prior banner, report disclaimer, settings, and decorative quotation-mark omissions into source. Updated the two originally named dist assets from the new build and formatted them for readability. Their filenames and existing index.html references are preserved.
- Validation: TypeScript, 30 unit tests, production build, and three targeted browser tests pass. Browser tests cover direct Assets navigation, example chooser/settings/blank-household flow, absence of file inputs, report number sizing, and example dropdown entries. Fixed sidebar scrolling after the first browser run exposed inaccessible settings on shorter screens. Existing upload/restore browser tests describe the retired interface and require migration before running the entire old suite.


## Session 2026-10-26: dark theme and completed PDF scenarios
- Removed the Verified quotes metric from Review packet; the remaining three metrics share the row.
- Added a persistent light/dark toolbar toggle, OS-based initial choice, early theme initialization, full component color overrides, and light print output. Visually inspected the dark document library and report.
- Packaged all 16 user-uploaded PDFs and three document-derived questionnaire prefills. Excluded all DOCX files and Template_Case folders. Original PDFs were preserved. Added source PDF links to document details.
- User explicitly authorized the proposed demo discrepancies: Case 1 questionnaire executor mismatch and a separate Case 2 certificate PDF naming a different first successor trustee. Preserved a consistent Case 1 payload. The generated Case 2 PDF was rendered and visually checked.
- Four curated name facts are mechanically checked with the legacy exact-quote verifier. This is not a full LLM extraction run. Case 3 remains an inspection example with no automatic comparison facts. Unknown balances/statuses/dates are not invented. See docs/demo-scenarios.md.
- Validation: TypeScript, 33 unit tests, five targeted browser checks, and production build passed. Tests prove the Case 2 conflict survives removal of the questionnaire trustee answer, and the clean Case 1 baseline has no findings. Browser checks cover case loading, navigation, dark-mode persistence, PDF library counts, report metrics, and light printing. Updated the two readable dist assets in place, copied the example payloads/PDFs, and updated dist/index.html with early theme initialization. No deployment was performed.
