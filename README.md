# Estate Review — advisor frontend

A responsive React + TypeScript workspace for the Texas estate document review prototype. The interface starts empty; the user supplies household information and source documents. No estate test documents, legal rules, or evaluation answer keys are generated.

## Run locally

Requires Node.js 22.12+ (validated with 24.19.0), npm, and Python 3 for offline quote verification.

```sh
npm ci
npm run dev
```

`npm run build` type-checks and builds the static site into `dist/`. `npm run preview` serves that build. Relative asset paths and hash navigation support hosting the `dist/` directory at a GitHub Pages repository path. Deployment and repository visibility changes are separate steps; neither is configured or performed here.

Fonts are bundled locally. The browser makes no API calls and sends no questionnaire or document data to a service.

## Included workflow

- Overview with questionnaire progress, evidence counts, and next steps.
- Five-step questionnaire: household context, people and life events, assets, intentions and fiduciary roles, review confirmation.
- Source library with prepared review JSON import, source-page text, quote checks, search, and unverified fact labels.
- Interactive asset → reported instrument → beneficiary flow, grouped into client-reported probate, non-probate, and unknown routes. Select an asset to inspect evidence. The map does not establish legal transfer paths.
- Deterministic comparison of reported and documented beneficiary/owner names per asset, plus household executor, trustee, and financial agent names. Conflicting source names stay unresolved. Every observation includes evidence, uncertainty, and a next question.
- Follow-up statuses and advisor notes, browser persistence, workspace backup/restore, and a printable review packet with sources and disclaimers.

All monetary amounts are hypothetical. Use synthetic or public data only. This is not a production client portal; it has no authentication, tenant isolation, server persistence, document upload endpoint, OCR, AI extraction, tax calculations, or legal rules engine. Browser storage is device-specific and not encrypted by this application.

## Connect user-sourced evidence

Capture assets in the questionnaire first. Each asset displays a stable evidence reference. The document import guide can download the mapping between these IDs and asset names. Household role facts use subject ID `household`.

Prepare an input JSON object with the following fields. This is a format definition, not a sample estate document.

| Field | Type / accepted value |
| --- | --- |
| `schemaVersion` | `1` |
| `documents` | Array of document objects described below |
| `facts` | Array of extracted fact objects described below |

Document fields:

| Field | Type / accepted value |
| --- | --- |
| `id` | Unique, nonempty string |
| `title` | Nonempty source document title |
| `kind` | `Will`, `Revocable trust`, `Amendment`, `Beneficiary designation`, `Titling record`, `Power of attorney`, or `Other` |
| `date` | Date string supplied from the source, or empty string if unknown; never used to infer precedence |
| `source` | `synthetic` or `public`; synthetic sources must be labeled SYNTHETIC by their author |
| `sourceUrl` | HTTP(S) source citation, required for public documents |
| `pages` | Nonempty array of `{ "page": positiveInteger, "text": sourcePageText }`; page numbers must be unique within a document |

Fact fields:

| Field | Type / accepted value |
| --- | --- |
| `id` | Unique, nonempty string |
| `documentId` | An existing document ID |
| `subjectId` | Questionnaire asset reference, or `household` for household roles |
| `field` | `beneficiary`, `owner`, `executor`, `trustee`, or `agent` |
| `value` | Extracted name, checked by the preparer for faithful interpretation |
| `quote` | Nonempty verbatim passage supporting the fact |
| `page` | Positive integer source-page number |
| `verification` | Written by the verifier: `verified` or `unverified` |

Verify the supplied quotes using separate input and output paths:

```sh
python3 verify_quotes.py /path/to/input.json /path/to/review.json
```

The verifier adds `verifiedBy: "verify_quotes.py"` and a verification label for each fact. It checks case-sensitive text presence on the specified page, normalizing whitespace and Unicode compatibility forms. It preserves source input and refuses to overwrite existing output. The browser validates the format and checks quotes again; a mismatched quote cannot become an observation just because its imported label says `verified`.

Import the output in **Documents → Import review data**. Maximum size: 8 MB, 100 documents, 1,000 pages per document, 10,000 facts. Uncertain OCR remains unverified; fuzzy OCR matching is not implemented. Text-presence checks do not authenticate the document, validate the extracted value, determine precedence, or establish legal effect. Fact values require human review during preparation. Unmatched subject IDs do not produce comparisons.

Imports replace the evidence collection only after confirmation when an existing collection is present, and clear old review notes to prevent carrying decisions across changed evidence. Use a workspace backup to preserve those notes first. Questionnaire edits reopen its final review confirmation. Changed evidence or comparison values receive distinct follow-up IDs.

## Checks

```sh
npm test
npm run test:e2e
python3 -m unittest discover -s tests -p 'test_*.py'
```

Unit tests exercise quote gating, exact-name reconciliation, conflicting records, import validation, and incomplete draft persistence. Browser tests cover the questionnaire, saved state, flow inspection, import errors, source viewing, follow-up notes, export, mobile navigation, and automated WCAG A/AA checks of all six initial page states. Technical token fixtures test the transport and comparison mechanics; they are not an estate test corpus or an evaluation answer key. No product extraction accuracy is claimed.

The Playwright configuration uses the cloud environment's `/usr/bin/chromium`. Override `CHROMIUM_PATH` on a machine with a different executable. Run browser tests against an isolated test workspace; the tests run with fresh browser storage.

```sh
CHROMIUM_PATH=/path/to/chromium npm run test:e2e
python3 -m unittest discover -s tests -p 'test_*.py'
```

`ai_log/` remains the existing append-only AI logging workflow. The repository's Claude Code hooks do not automatically capture Codex sessions. User accept/change/reject decisions remain PENDING.

## Next integration work

A separate backend can produce this same review-data contract after secure document intake, page extraction/OCR, structured fact extraction, and quote verification. Provide user-sourced evaluation documents before measuring reconciliation accuracy or false alarms. Add curated, sourced legal rule packs separately; this UI does not invent tax thresholds or legal citations.
