# Households: authoring format

Layer 2 of the test set (CLAUDE.md, Test data). You write the clean **Household B** by hand.
`evaluation/mutate_household.py` copies it into **Household A** variants, each with one planted issue, and
writes each variant's answer key. No model writes documents or answer keys.

Everything here is SYNTHETIC. Dollar values are hypothetical. Texas only.

## Layout

```
households/B/
  household.yaml       ground truth: documents, gold facts, anchors. Never shown to the product.
  questionnaire.yaml   product input: the client's answers
  assets.yaml          product input: the asset inventory
  docs/
    will.txt           product input: one UTF-8 text file per document
    trust.txt
    ...
```

## Documents (`docs/*.txt` or `*.md`)

- Plain UTF-8 text. The mutation script edits text, so author in text, not Word or PDF.
- Each document must contain the word **SYNTHETIC** (a header line is enough). The extractor
  labels unlabeled documents `user_supplied`; the public replay builder rejects that label.
- Separate pages with a line that reads `--- page break ---`. Page numbers in answer keys and
  extraction records count these pages from 1.
- The file name without the extension is the document id (`docs/bd_401k.txt` is `bd_401k`).

## `household.yaml`

```yaml
household_id: B
synthetic: true
state: TX
documents:
  - {id: will, type: will, file: docs/will.txt}
  - {id: bd_401k, type: beneficiary_designation, file: docs/bd_401k.txt}
  # types: will, revocable_trust, trust_amendment, beneficiary_designation, titling_record, other
  # optional: source: scanned   (default digital)
facts:
  - id: will_date
    doc: will
    field: document_date
    value: <YYYY-MM-DD>
    anchor: "<exact text from the document that contains the date>"
  - id: bd401k_primary
    doc: bd_401k
    field: primary_beneficiary
    value: <name exactly as written>
    anchor: "<exact text from the document that contains the name>"
```

Gold facts do two jobs. They are the answer key for extraction accuracy, and they tell the
mutation script where to edit.

- `field`: one of the extraction fields in `edr/schema.py` (`FIELDS`).
- `anchor`: text copied exactly from the document (same case and punctuation). It must occur
  **exactly once** in that document, stay on one page, and not overlap another fact's anchor.
  Take a whole line or clause, e.g. `"Primary Beneficiary: <name>, 100%"`.
- `target` (optional): the part of the anchor a mutation replaces. Defaults to `value` when the
  value appears once in the anchor. For `document_date` the anchor must hold exactly one date,
  and it must equal `value`.
- List **every** role assignment (executor, trustees, guardian, every beneficiary on every
  document). A role you leave out can't be scored, and a finding about it counts as a false alarm.

## `questionnaire.yaml`

```yaml
synthetic: true
as_of: <YYYY-MM-DD>
client: {name: <name>, state: TX}
marriages:                 # every marriage, oldest first
  - {spouse: <name>, married: <YYYY-MM-DD>, ended: <YYYY-MM-DD>, how_ended: divorce}
  - {spouse: <name>, married: <YYYY-MM-DD>, ended: null, how_ended: null}
people:                    # everyone named in the documents, plus family
  - {name: <name>, relationship: <child|sibling|parent|friend|...>, status: living}
intended_beneficiaries:
  - {name: <name>, share: <"50%" or description>}
documents_available: [will, revocable_trust, trust_amendment, beneficiary_designation, titling_record]
```

## `assets.yaml`

```yaml
synthetic: true
values_are_hypothetical: true
assets:
  - id: <short id>
    description: <e.g. Employer 401(k) (ERISA plan)>
    type: <retirement_401k|ira|life_insurance|brokerage|bank|real_estate|business|other>
    value_usd: <number>
    character: <community|separate|unknown>
    governing_document: <document id that controls who receives it, or null>
```

`governing_document` links an account to its beneficiary designation or titling record. It is
how a planted issue gets its "amount at stake".

## What "clean" means

Household B must produce **zero material findings** (CLAUDE.md rule 3). `--check` prints a
warning for anything that would break that: a designation naming a former spouse, a fiduciary or
beneficiary the questionnaire lists as deceased, a will or trust dated before the current
marriage, a blank amendment date, an intended beneficiary no document names, or a person named in
a document who is missing from the questionnaire.

## Mutations

| Mutation | Edits | Planted issue | Expected status | Needs in B |
|---|---|---|---|---|
| `former_spouse_designation` | designation's primary beneficiary → most recently divorced spouse | `former_spouse_beneficiary` | flagged | a divorce in `marriages`; a designation naming the current spouse |
| `deceased_fiduciary` | questionnaire marks a fiduciary deceased | `deceased_fiduciary` (plus `deceased_beneficiary` for each beneficiary role the person holds) | flagged | a living executor, trustee or guardian who is not the client or current spouse |
| `predates_marriage` | will date → one year before the current marriage, same date style | `document_predates_marriage` | flagged | a will dated on or after the current marriage |
| `retitle_outside_trust` | titling record owner → client individually | `asset_outside_trust` | flagged | a titling record registered to the trust |
| `add_intended_beneficiary` | questionnaire adds a living person no document names | `intent_mismatch` | flagged | a living person in `people` who is not a beneficiary |
| `blank_amendment_date` | amendment date → blank line | `undated_amendment` | unresolved | a dated trust amendment |

Automatic runs move only will dates: trust dates usually reappear in other documents ("Trust
dated ..."), and changing one copy would plant a second, unlisted inconsistency. A plan file can
target a trust date explicitly; the answer key then carries a warning.

## Commands

Run from the repository root using the evaluation package:

```
.venv/bin/python -m evaluation.mutate_household households/B --check                    # validate, list targets
.venv/bin/python -m evaluation.mutate_household households/B --out households/variants  # one variant per target, plus B_clean
.venv/bin/python -m evaluation.mutate_household households/B --out households/variants --plan households/plan.yaml --force
```

A plan file adds multi-mutation variants, such as the headline scenario with the former spouse on
several accounts:

```yaml
variants:
  - id: A_headline
    description: Former spouse remains on three designations (hypothetical $22M at stake).
    mutations:
      - {type: former_spouse_designation, target: <fact id>}
      - {type: former_spouse_designation, target: <fact id>}
```

Each variant gets `input/` (what the product reads) and `answer_key.json` (what `evaluation/run_eval.py`
scores against). `B_clean` is the control with zero expected issues.
