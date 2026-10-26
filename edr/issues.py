"""Issue types the mutation script plants and the reconciliation step must report.

Answer keys (mutate_household.py) and findings (reconciliation) share these names so run_eval.py
can match them. "status" is the expected finding status: flagged, or unresolved when the
documents leave the answer open (CLAUDE.md rule 3).
"""

ISSUE_TYPES = {
    "former_spouse_beneficiary": {
        "status": "flagged",
        "summary": "A beneficiary designation names a person the questionnaire reports as a former spouse.",
    },
    "deceased_fiduciary": {
        "status": "flagged",
        "summary": "A document appoints as executor, trustee or guardian a person the questionnaire reports as deceased.",
    },
    "deceased_beneficiary": {
        "status": "flagged",
        "summary": "A document names as beneficiary a person the questionnaire reports as deceased.",
    },
    "document_predates_marriage": {
        "status": "flagged",
        "summary": "A will or trust is dated before the current marriage reported in the questionnaire.",
    },
    "asset_outside_trust": {
        "status": "flagged",
        "summary": "A titling record shows an asset registered outside the revocable trust.",
    },
    "intent_mismatch": {
        "status": "flagged",
        "summary": "The questionnaire names an intended beneficiary whom no document names.",
    },
    "undated_amendment": {
        "status": "unresolved",
        "summary": "A trust amendment's date is blank, so its order relative to the other documents is unknown.",
    },
}
