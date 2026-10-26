"""Reconciliation rules on the placeholder fixture household (not part of the test set)."""
import json
import textwrap

import yaml

from pipeline import reconcile
from tests.conftest import FIXTURE_ASSETS, FIXTURE_QUESTIONNAIRE


def fact(field, value, quote=None, page=1, detail=""):
    return {"field": field, "value": value, "detail": detail, "quote": quote or value, "page": page,
            "verification": {"status": "verified", "method": "exact", "score": 100.0}}


def record(doc, doc_type, facts, source="digital", **extra):
    return {"document": {"id": doc, "source": source}, "document_type": doc_type, "facts": facts,
            "unreadable_pages": [], **extra}


def clean_records():
    return [
        record("will", "will", [fact("document_date", "2019-03-14", "Signed this 14th day of March, 2019."),
                                fact("executor", "Person Gamma"), fact("pour_over", "Alpha Fixture Trust")]),
        record("trust", "revocable_trust", [fact("document_date", "2019-06-01"), fact("trust_name", "Alpha Fixture Trust"),
                                            fact("beneficiary", "Person Beta"),
                                            fact("successor_trustee", "Person Gamma")]),
        record("amendment", "trust_amendment", [fact("document_date", "2021-05-01")]),
        record("bd_401k", "beneficiary_designation", [fact("primary_beneficiary", "Person Beta")]),
        record("titling", "titling_record", [fact("titled_owner", "Person Alpha, Trustee of the Alpha Fixture Trust")]),
    ]


def inputs():
    return (yaml.safe_load(textwrap.dedent(FIXTURE_QUESTIONNAIRE)),
            yaml.safe_load(textwrap.dedent(FIXTURE_ASSETS)))


def run(records, mutate_q=None):
    q, a = inputs()
    if mutate_q:
        mutate_q(q)
    return reconcile.reconcile(records, q, a)


def kinds(result):
    return [f["issue_type"] for f in result["findings"]]


def test_clean_household_has_zero_findings():
    result = run(clean_records())
    assert result["findings"] == []
    assert result["summary"]["unverified_facts_excluded"] == 0


def test_former_spouse_beneficiary_flagged_with_amount_and_evidence():
    records = clean_records()
    records[3]["facts"] = [fact("primary_beneficiary", "Person Delta", "Primary Beneficiary: Person Delta, 100%", page=2)]
    result = run(records)
    f = next(x for x in result["findings"] if x["issue_type"] == "former_spouse_beneficiary")
    assert f["status"] == "flagged" and f["amount_at_stake_usd"] == 100 and f["amount_is_hypothetical"]
    assert f["evidence"][0]["quote"] == "Primary Beneficiary: Person Delta, 100%" and f["evidence"][0]["page"] == 2
    assert "refer to an estate attorney" in f["next_question"]
    assert result["summary"]["amount_at_stake_flagged_usd"] == 100


def test_unverified_fact_never_becomes_a_finding():
    records = clean_records()
    bad = fact("primary_beneficiary", "Person Delta")
    bad["verification"] = {"status": "unverified", "reason": "wrong_page"}
    records[3]["facts"] = [bad]
    result = run(records)
    assert "former_spouse_beneficiary" not in kinds(result)
    assert result["summary"]["unverified_facts_excluded"] == 1
    assert result["coverage"]["unverified_facts"][0]["reason"] == "wrong_page"


def test_deceased_fiduciary_and_beneficiary():
    def gamma_dies(q):
        q["people"][1]["status"] = "deceased"  # executor and successor trustee
    assert kinds(run(clean_records(), gamma_dies)).count("deceased_fiduciary") == 2

    def beta_dies(q):
        q["people"][0]["status"] = "deceased"
    assert "deceased_beneficiary" in kinds(run(clean_records(), beta_dies))


def test_predates_marriage_uses_the_date_not_the_age():
    records = clean_records()
    records[0]["facts"][0] = fact("document_date", "2014-03-14")
    result = run(records)
    assert kinds(result) == ["document_predates_marriage"]
    assert "age alone" in result["findings"][0]["uncertainty"]


def test_asset_outside_trust_needs_a_governed_asset():
    records = clean_records()
    records[4]["facts"] = [fact("titled_owner", "Person Alpha, individually")]
    result = run(records)
    assert kinds(result) == ["asset_outside_trust"]
    assert result["findings"][0]["amount_at_stake_usd"] == 50
    q, a = inputs()
    a["assets"][1]["governing_document"] = None
    assert reconcile.reconcile(records, q, a)["findings"] == []


def test_intent_mismatch_when_nobody_names_the_intended_beneficiary():
    def add(q):
        q["intended_beneficiaries"].append({"name": "Person Zeta", "share": "10%"})
    result = run(clean_records(), add)
    assert kinds(result) == ["intent_mismatch"]
    assert result["findings"][0]["evidence"][0]["source"] == "questionnaire"


def test_blank_amendment_date_is_unresolved_and_missing_date_is_not_a_finding():
    records = clean_records()
    records[2]["facts"] = [fact("document_date", "", "Dated: ____")]
    result = run(records)
    assert kinds(result) == ["undated_amendment"] and result["findings"][0]["status"] == "unresolved"
    records[2]["facts"] = []
    assert run(records)["findings"] == []


def test_ordering_flagged_before_unresolved_and_ids_follow_order():
    records = clean_records()
    records[2]["facts"] = [fact("document_date", "", "Dated: ____")]
    records[3]["facts"] = [fact("primary_beneficiary", "Person Delta")]
    result = run(records)
    assert [f["status"] for f in result["findings"]] == ["flagged", "unresolved"]
    assert [f["id"] for f in result["findings"]] == ["F01", "F02"]


def test_no_prohibited_wording_in_any_finding():
    records = clean_records()
    records[3]["facts"] = [fact("primary_beneficiary", "Person Delta")]
    records[4]["facts"] = [fact("titled_owner", "Person Alpha, individually")]
    text = json.dumps(run(records)).lower()
    for word in ("void", "invalid", "unenforceable", " should ", " must "):
        assert word not in text


def test_extraction_errors_and_unreadable_pages_become_coverage_gaps():
    records = clean_records()
    records[0]["unreadable_pages"] = [2]
    records.append({"document": {"id": "scan", "source": "scanned"}, "error": {"message": "no text layer"}})
    gaps = run(records)["coverage"]["gaps"]
    assert {"document": "will", "reason": "page 2 reported unreadable"} in gaps
    assert {"document": "scan", "reason": "no text layer"} in gaps


def test_cli_writes_findings(tmp_path, household_dir):
    facts = tmp_path / "facts"
    facts.mkdir()
    for r in clean_records():
        (facts / f"{r['document']['id']}.json").write_text(json.dumps(r))
    out = tmp_path / "findings.json"
    assert reconcile.main(["--facts", str(facts), "--inputs", str(household_dir), "--out", str(out)]) == 0
    assert json.loads(out.read_text())["findings"] == []
