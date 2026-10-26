"""Shared fixtures.

The household built here is a unit-test fixture made of placeholder strings ("Person Alpha",
"Alpha Fixture Trust"). It exists only to exercise the code and is not part of the test set,
which the user sources (CLAUDE.md rule 8).
"""
import textwrap

import pytest

import ai_log.log_check


@pytest.fixture(autouse=True)
def isolated_ai_log(tmp_path, monkeypatch):
    """Tests must never append to the real ai_log/checks.jsonl."""
    log_dir = tmp_path / "ai_log"
    monkeypatch.setattr(ai_log.log_check, "LOG_DIR", log_dir)
    return log_dir


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(textwrap.dedent(text).lstrip("\n"), encoding="utf-8")
    return path


FIXTURE_DOCS = {
    "docs/will.txt": """
        SYNTHETIC UNIT-TEST FIXTURE. Not a legal document.
        LAST WILL OF PERSON ALPHA
        I, Person Alpha, of Fixture County, Texas, make this my will.
        I appoint Person Gamma as Independent Executor.
        --- page break ---
        I give the residue of my estate to the trustee of the Alpha Fixture Trust.
        Signed this 14th day of March, 2019.
        """,
    "docs/trust.txt": """
        SYNTHETIC UNIT-TEST FIXTURE.
        ALPHA FIXTURE TRUST
        This trust agreement is made on June 1, 2019.
        Successor Trustee: Person Gamma.
        Trust beneficiary: Person Beta.
        """,
    "docs/amendment.txt": """
        SYNTHETIC UNIT-TEST FIXTURE.
        FIRST AMENDMENT TO THE ALPHA FIXTURE TRUST
        Dated: 05/01/2021
        Article 2 is amended.
        """,
    "docs/bd_401k.txt": """
        SYNTHETIC UNIT-TEST FIXTURE.
        Beneficiary designation, Fixture 401(k) Plan
        Primary Beneficiary: Person Beta, 100%
        """,
    "docs/titling.txt": """
        SYNTHETIC UNIT-TEST FIXTURE.
        Account registration: Person Alpha, Trustee of the Alpha Fixture Trust
        """,
}

FIXTURE_MANIFEST = """
    household_id: FIXTURE
    synthetic: true
    state: TX
    documents:
      - {id: will, type: will, file: docs/will.txt}
      - {id: trust, type: revocable_trust, file: docs/trust.txt}
      - {id: amendment, type: trust_amendment, file: docs/amendment.txt}
      - {id: bd_401k, type: beneficiary_designation, file: docs/bd_401k.txt}
      - {id: titling, type: titling_record, file: docs/titling.txt}
    facts:
      - {id: will_date, doc: will, field: document_date, value: 2019-03-14, anchor: "Signed this 14th day of March, 2019."}
      - {id: will_executor, doc: will, field: executor, value: Person Gamma, anchor: "I appoint Person Gamma as Independent Executor."}
      - {id: will_pour_over, doc: will, field: pour_over, value: Alpha Fixture Trust, anchor: "trustee of the Alpha Fixture Trust"}
      - {id: trust_date, doc: trust, field: document_date, value: 2019-06-01, anchor: "made on June 1, 2019"}
      - {id: trust_successor, doc: trust, field: successor_trustee, value: Person Gamma, anchor: "Successor Trustee: Person Gamma."}
      - {id: trust_beneficiary, doc: trust, field: beneficiary, value: Person Beta, anchor: "Trust beneficiary: Person Beta."}
      - {id: amendment_date, doc: amendment, field: document_date, value: 2021-05-01, anchor: "Dated: 05/01/2021"}
      - {id: bd_primary, doc: bd_401k, field: primary_beneficiary, value: Person Beta, anchor: "Primary Beneficiary: Person Beta, 100%"}
      - {id: titling_owner, doc: titling, field: titled_owner, value: "Person Alpha, Trustee of the Alpha Fixture Trust", anchor: "Account registration: Person Alpha, Trustee of the Alpha Fixture Trust"}
    """

FIXTURE_QUESTIONNAIRE = """
    synthetic: true
    as_of: 2026-10-01
    client: {name: Person Alpha, state: TX}
    marriages:
      - {spouse: Person Delta, married: 2005-04-02, ended: 2012-09-30, how_ended: divorce}
      - {spouse: Person Beta, married: 2015-06-20, ended: null, how_ended: null}
    people:
      - {name: Person Beta, relationship: spouse, status: living}
      - {name: Person Gamma, relationship: sibling, status: living}
      - {name: Person Zeta, relationship: parent, status: living}
    intended_beneficiaries:
      - {name: Person Beta, share: all}
    documents_available: [will, revocable_trust, trust_amendment, beneficiary_designation, titling_record]
    """

FIXTURE_ASSETS = """
    synthetic: true
    values_are_hypothetical: true
    assets:
      - {id: a401k, description: Fixture 401(k), type: retirement_401k, value_usd: 100, character: community, governing_document: bd_401k}
      - {id: brokerage, description: Fixture brokerage, type: brokerage, value_usd: 50, character: community, governing_document: titling}
    """


@pytest.fixture
def household_dir(tmp_path):
    root = tmp_path / "FIXTURE"
    for rel, text in FIXTURE_DOCS.items():
        write(root / rel, text)
    write(root / "household.yaml", FIXTURE_MANIFEST)
    write(root / "questionnaire.yaml", FIXTURE_QUESTIONNAIRE)
    write(root / "assets.yaml", FIXTURE_ASSETS)
    return root
