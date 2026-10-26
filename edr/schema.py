"""Extraction vocabulary and the strict tool definition used by extract.py.

The same field names are used by the gold facts in households/*/household.yaml, so run_eval.py
can score extraction field by field. Bump SCHEMA_VERSION whenever FIELDS or the tool changes;
it is part of the extraction cache key.
"""

SCHEMA_VERSION = "1"
TOOL_NAME = "record_estate_facts"

DOCUMENT_TYPES = [
    "will", "revocable_trust", "trust_amendment", "beneficiary_designation", "titling_record", "other",
]

FIELDS = {
    "document_title": "The document's title as written.",
    "document_date": "Date the document was signed or executed. Value as YYYY-MM-DD; \"\" if the date line is blank.",
    "principal": "Whose document it is: testator, grantor or settlor, account owner, or plan participant.",
    "executor": "Person or institution appointed independent executor.",
    "alternate_executor": "Successor or alternate executor.",
    "trustee": "Initial trustee or co-trustee.",
    "successor_trustee": "Successor trustee.",
    "guardian": "Guardian named for a minor child.",
    "beneficiary": "Beneficiary of a will or trust gift (detail: the share or gift).",
    "primary_beneficiary": "Primary beneficiary on a beneficiary designation (detail: the percentage).",
    "contingent_beneficiary": "Contingent or alternate beneficiary (detail: the percentage or condition).",
    "spouse_named": "A person the document identifies as the principal's spouse.",
    "child_named": "A person the document identifies as the principal's child.",
    "trust_name": "Name of a trust as written.",
    "pour_over": "A will gift of the residue to a trust (value: the trust's name as written).",
    "trust_asset": "An asset the trust lists as trust property, for example on a schedule.",
    "account": "Account, plan or policy identifier (name, number or last digits as written).",
    "titled_owner": "Owner or registration exactly as the titling record shows it.",
    "amends": "The document an amendment amends (value: its title as written).",
    "amended_provision": "A provision the amendment changes (value: the article or section as written; detail: a short summary of the change).",
    "revocation": "A statement revoking earlier wills, trusts, amendments or designations.",
}

DATE_FIELDS = {"document_date"}
FIDUCIARY_FIELDS = {"executor", "alternate_executor", "trustee", "successor_trustee", "guardian"}
BENEFICIARY_FIELDS = {"beneficiary", "primary_beneficiary", "contingent_beneficiary"}
PERSON_FIELDS = FIDUCIARY_FIELDS | BENEFICIARY_FIELDS | {"principal", "spouse_named", "child_named"}

_FACT_KEYS = ["field", "value", "detail", "quote", "page"]
_TOP_KEYS = ["document_type", "facts", "unreadable_pages"]


def tool_definition():
    """Strict tool: the API guarantees tool_use.input matches this schema. Structured-output
    schemas cannot express minimum or maxLength, so validate_tool_input checks those locally."""
    field_help = "\n".join(f"- {name}: {text}" for name, text in FIELDS.items())
    return {
        "name": TOOL_NAME,
        "description": (
            "Record every fact found in one estate-planning document. Each fact carries a "
            "verbatim quote from a single page and that page's number; a deterministic verifier "
            "checks every quote against the page text and discards facts that fail."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "document_type": {"type": "string", "enum": DOCUMENT_TYPES},
                "facts": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "field": {
                                "type": "string",
                                "enum": list(FIELDS),
                                "description": "What the fact is:\n" + field_help,
                            },
                            "value": {
                                "type": "string",
                                "description": "Copied exactly from the quote. Exception: document_date as YYYY-MM-DD. \"\" when the field is present but blank.",
                            },
                            "detail": {
                                "type": "string",
                                "description": "Short note (share, percentage, account, provision summary), or \"\".",
                            },
                            "quote": {
                                "type": "string",
                                "description": "Verbatim passage from one page that contains the value. No ellipses, no paraphrase, no text from two pages.",
                            },
                            "page": {
                                "type": "integer",
                                "description": "1-indexed page the quote is on.",
                            },
                        },
                        "required": _FACT_KEYS,
                        "additionalProperties": False,
                    },
                },
                "unreadable_pages": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "Pages too degraded to read reliably; [] if none.",
                },
            },
            "required": _TOP_KEYS,
            "additionalProperties": False,
        },
    }


def validate_tool_input(data):
    """Return a list of problems with a tool_use input ([] when valid). Strict mode already
    guarantees the shape; this re-checks it and adds the constraints strict schemas cannot carry."""
    problems = []
    if not isinstance(data, dict) or set(data) != set(_TOP_KEYS):
        return [f"top-level keys must be exactly {_TOP_KEYS}"]
    if data["document_type"] not in DOCUMENT_TYPES:
        problems.append(f"unknown document_type {data['document_type']!r}")
    if not isinstance(data["unreadable_pages"], list) or not all(
            isinstance(p, int) and p >= 1 for p in data["unreadable_pages"]):
        problems.append("unreadable_pages must be a list of positive integers")
    if not isinstance(data["facts"], list):
        return problems + ["facts must be a list"]
    for i, fact in enumerate(data["facts"]):
        if not isinstance(fact, dict) or set(fact) != set(_FACT_KEYS):
            problems.append(f"facts[{i}]: keys must be exactly {_FACT_KEYS}")
            continue
        if fact["field"] not in FIELDS:
            problems.append(f"facts[{i}]: unknown field {fact['field']!r}")
        for key in ("value", "detail", "quote"):
            if not isinstance(fact[key], str):
                problems.append(f"facts[{i}].{key} must be a string")
        if not isinstance(fact["page"], int) or isinstance(fact["page"], bool) or fact["page"] < 1:
            problems.append(f"facts[{i}].page must be a positive integer")
    return problems
