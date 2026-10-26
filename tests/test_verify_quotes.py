import json
from pathlib import Path

import pytest

from pipeline import verify_quotes as vq
from edr.pages import file_sha256

PAGES = [
    "SYNTHETIC. LAST WILL\nI appoint Person Gamma as Independent Executor of this will.",
    "I give the residue to the trustee of the Alpha Fixture Trust.\nSigned this 14th day of March, 2019.",
    "Successor trustee: Person Beta. The trustee shall serve without bond.",
]


def fact(field, value, quote, page):
    return {"field": field, "value": value, "detail": "", "quote": quote, "page": page}


def check(f, pages=PAGES, scanned=False):
    return vq.verify_fact(f, pages, allow_fuzzy=scanned)


def test_exact_quote_and_value_verify():
    v = check(fact("executor", "Person Gamma", "I appoint Person Gamma as Independent Executor", 1))
    assert v["status"] == "verified" and v["method"] == "exact" and v["value_supported"] is True


def test_typographic_differences_still_exact():
    pages = ["The trustee’s powers — as listed below."]
    v = check(fact("other_field", "", "The trustee's powers - as listed below.", 1), pages)
    assert v["status"] == "verified" and v["method"] == "exact"


def test_pdf_spacing_artifacts_match_compact():
    pages = ["I appoint PersonGamma as Inde-\npendent Executor."]
    v = check(fact("executor", "Person Gamma", "I appoint Person Gamma as Independent Executor.", 1), pages)
    assert v["method"] == "exact_compact"
    # The value check runs on the quote's own words, which contain the value.
    assert v["status"] == "verified"


def test_wrong_page_is_unverified_and_reports_where_it_was_found():
    v = check(fact("executor", "Person Gamma", "I appoint Person Gamma as Independent Executor", 2))
    assert v["status"] == "unverified" and v["reason"] == "wrong_page" and v["found_on_pages"] == [1]


def test_invented_quote_is_unverified():
    v = check(fact("executor", "Person Omega", "I appoint Person Omega as Independent Executor", 1))
    assert (v["status"], v["reason"]) == ("unverified", "quote_not_found")


def test_page_out_of_range():
    v = check(fact("executor", "Person Gamma", "I appoint Person Gamma", 9))
    assert v["reason"] == "page_out_of_range" and v["found_on_pages"] == [1]


def test_elided_quote_is_rejected():
    v = check(fact("executor", "Person Gamma", "I appoint Person Gamma ... of this will", 1))
    assert v["reason"] == "elided_quote"


def test_quote_spanning_pages_is_unverified():
    v = check(fact("pour_over", "Alpha Fixture Trust", "Executor of this will. I give the residue", 1))
    assert v["reason"] == "spans_pages"


def test_value_must_appear_in_the_quote():
    v = check(fact("successor_trustee", "Person Gamma", "Successor trustee: Person Beta.", 3))
    assert (v["status"], v["reason"]) == ("unverified", "value_not_in_quote")


def test_value_word_order_may_differ():
    pages = ["Successor trustee: BETA, PERSON."]
    v = check(fact("successor_trustee", "Person Beta", "Successor trustee: BETA, PERSON.", 1), pages)
    assert v["status"] == "verified"


def test_date_value_is_checked_against_the_quote():
    ok = check(fact("document_date", "2019-03-14", "Signed this 14th day of March, 2019.", 2))
    bad = check(fact("document_date", "2019-04-14", "Signed this 14th day of March, 2019.", 2))
    not_iso = check(fact("document_date", "March 14, 2019", "Signed this 14th day of March, 2019.", 2))
    assert ok["status"] == "verified"
    assert bad["reason"] == "date_not_in_quote"
    assert not_iso["reason"] == "value_not_iso_date"


def test_blank_value_needs_only_the_quote():
    pages = ["Dated: _______________"]
    v = check(fact("document_date", "", "Dated: _______________", 1), pages)
    assert v["status"] == "verified" and v["value_supported"] is None


OCR_PAGE = ["I appoint Persen Gamrna as lndependent Executer of this wil1.\nSigned this l4th day of March, 2O19."]


def test_fuzzy_match_only_for_scanned_documents():
    f = fact("executor", "Person Gamma", "I appoint Person Gamma as Independent Executor of this will.", 1)
    assert check(f, OCR_PAGE, scanned=False)["reason"] == "quote_not_found"
    v = check(f, OCR_PAGE, scanned=True)
    assert v["status"] == "verified" and v["method"] == "fuzzy" and v["score"] >= vq.FUZZY_THRESHOLD


def test_fuzzy_value_check_uses_the_page_text_not_the_quote():
    # The quote fuzzy-matches the page, but the page names Person Gamma, not Person Omega.
    f = fact("executor", "Person Omega", "I appoint Person Omega as lndependent Executer of this wil1.", 1)
    v = check(f, OCR_PAGE, scanned=True)
    assert v["method"] == "fuzzy" and (v["status"], v["reason"]) == ("unverified", "value_not_in_quote")


def test_fuzzy_dates_repair_common_ocr_digit_errors():
    f = fact("document_date", "2019-03-14", "Signed this 14th day of March, 2019.", 1)
    assert check(f, OCR_PAGE, scanned=True)["status"] == "verified"


def test_short_quotes_never_match_fuzzily():
    v = check(fact("executor", "Gamma", "Persen Gamma", 1), OCR_PAGE, scanned=True)
    assert v["reason"] in ("too_short_for_fuzzy",)


def test_unrelated_text_does_not_fuzzy_match():
    f = fact("executor", "Person Gamma", "The trustee shall have full power to sell real property.", 1)
    assert check(f, OCR_PAGE, scanned=True)["status"] == "unverified"


def _record(tmp_path, text, facts, source="digital"):
    doc = tmp_path / "doc.txt"
    doc.write_text(text, encoding="utf-8")
    return {"document": {"id": "doc", "path": str(doc), "sha256": file_sha256(doc), "source": source},
            "extraction": {"model_served": "claude-opus-5-5"}, "facts": facts}, doc


def test_verify_record_and_verified_facts(tmp_path):
    record, _ = _record(tmp_path, PAGES[0], [
        fact("executor", "Person Gamma", "I appoint Person Gamma", 1),
        fact("executor", "Person Omega", "I appoint Person Omega", 1),
    ])
    vq.verify_record(record)
    assert [f["value"] for f in vq.verified_facts(record)] == ["Person Gamma"]
    assert record["verifier"]["fuzzy_allowed"] is False


def test_saved_repo_relative_record_survives_package_move(tmp_path, monkeypatch):
    # Existing records store paths relative to the repo, not the verifier's new package.
    # Use existing repository text; no estate document or evaluation data is generated.
    source = Path(__file__).resolve().parents[1] / "README.md"
    quote = source.read_text(encoding="utf-8").splitlines()[0]
    record = {
        "document": {"id": "readme", "path": "README.md", "sha256": file_sha256(source), "source": "digital"},
        "facts": [fact("document_title", quote, quote, 1)],
    }
    monkeypatch.chdir(tmp_path)
    vq.verify_record(record)
    assert len(vq.verified_facts(record)) == 1
    assert vq.display_path(source) == "README.md"


def test_changed_document_fails_every_fact(tmp_path):
    record, doc = _record(tmp_path, PAGES[0], [fact("executor", "Person Gamma", "I appoint Person Gamma", 1)])
    doc.write_text(PAGES[0] + " edited", encoding="utf-8")
    vq.verify_record(record)
    assert record["facts"][0]["verification"]["reason"] == "document_changed"


def test_summary_reports_digital_and_scanned_separately():
    def rec(source, statuses):
        return {"document": {"id": source, "source": source}, "extraction": {"model_served": "m"},
                "facts": [{"verification": {"status": s, "method": "exact" if s == "verified" else None,
                                            "reason": None if s == "verified" else "quote_not_found"}}
                          for s in statuses]}
    summary = vq.summarize([rec("digital", ["verified", "verified"]), rec("scanned", ["verified", "unverified"])])
    assert summary["by_source"]["digital"]["pass_rate"] == 1.0
    assert summary["by_source"]["scanned"]["pass_rate"] == 0.5
    assert summary["pass_rate"] == 0.75 and summary["unverified_reasons"] == {"quote_not_found": 1}


def test_cli_rewrites_records_and_logs_the_check(tmp_path, isolated_ai_log):
    record, _ = _record(tmp_path, PAGES[0], [fact("executor", "Person Gamma", "I appoint Person Gamma", 1)])
    out = tmp_path / "facts"
    out.mkdir()
    vq.write_json(out / "doc.json", record)
    assert vq.main([str(out)]) == 0
    saved = json.loads((out / "doc.json").read_text())
    assert saved["facts"][0]["verification"]["status"] == "verified"
    [logged] = [json.loads(line) for line in (isolated_ai_log / "checks.jsonl").read_text().splitlines()]
    assert logged["check"] == "quote_verifier" and logged["passed"] is True
