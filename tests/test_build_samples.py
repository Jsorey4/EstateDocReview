"""build_samples.py on the placeholder fixture: mutate -> simulated extraction -> bundles.

The simulated extractor quotes, for each gold fact, the first line on the stated page that the
real verifier accepts. The answer key is read here only to drive that simulation; the test
checks that nothing from it reaches the published bundles.
"""
import json

import pytest
import yaml

import build_samples
import mutate_household as mh
import verify_quotes as vq
from edr.pages import file_sha256, load_pages


def simulate_run(household_dir, variants, run_dir, label="synthetic"):
    doc_types = {d["id"]: d["type"] for d in yaml.safe_load((household_dir / "household.yaml").read_text())["documents"]}
    for variant in sorted(p for p in variants.iterdir() if (p / "answer_key.json").exists()):
        key = json.loads((variant / "answer_key.json").read_text())
        facts_dir = run_dir / variant.name / "facts"
        facts_dir.mkdir(parents=True)
        for doc, doc_type in doc_types.items():
            path = next((variant / "input" / "docs").glob(f"{doc}.*"))
            pages = load_pages(path)
            facts = []
            for exp in (f for f in key["expected_facts"] if f["doc"] == doc):
                lines = [l for l in pages[exp["page"] - 1].splitlines() if l.strip()]
                fact = {"field": exp["field"], "value": exp["value"], "detail": "", "page": exp["page"]}
                fact["quote"] = next((l for l in lines if vq.verify_fact({**fact, "quote": l}, pages, False)["status"] == "verified"),
                                     lines[0])
                facts.append(fact)
            record = {"document": {"id": doc, "path": str(path), "sha256": file_sha256(path),
                                   "page_count": len(pages), "source": "digital"},
                      "data_label": {"kind": label}, "document_type": doc_type, "unreadable_pages": [],
                      "extraction": {"model_requested": "fake", "model_served": "fake", "cached": False},
                      "facts": facts}
            (facts_dir / f"{doc}.json").write_text(json.dumps(vq.verify_record(record)))


@pytest.fixture
def built(household_dir, tmp_path):
    variants, run_dir, out = tmp_path / "variants", tmp_path / "run", tmp_path / "samples"
    assert mh.main([str(household_dir), "--out", str(variants)]) == 0
    simulate_run(household_dir, variants, run_dir)
    assert build_samples.main(["--variants", str(variants), "--run", str(run_dir), "--out", str(out)]) == 0
    return variants, run_dir, out


def load(out, name):
    return json.loads((out / name).read_text())


def test_manifest_lists_every_variant_with_its_counts(built):
    variants, _, out = built
    manifest = load(out, "index.json")
    ids = sorted(p.name for p in variants.iterdir() if (p / "input").is_dir())
    assert [s["id"] for s in manifest["samples"]] == ids
    assert manifest["synthetic"] is True and manifest["skipped"] == []
    for sample in manifest["samples"]:
        bundle = load(out, sample["file"])
        assert bundle["reconciliation"]["summary"]["findings"] == sample["findings"]
        assert len(bundle["packet"]["documents"]) == sample["documents"]


def test_clean_control_has_no_findings_and_a_mutation_is_flagged(built):
    _, _, out = built
    clean = load(out, "B_clean.json")
    assert clean["reconciliation"]["findings"] == []
    spouse = load(out, next(out.glob("A*_former_spouse_designation__*.json")).name)
    types = {f["issue_type"]: f["status"] for f in spouse["reconciliation"]["findings"]}
    assert types.get("former_spouse_beneficiary") == "flagged"


def test_bundle_carries_the_frontend_questionnaire_and_a_v2_packet(built):
    _, _, out = built
    bundle = load(out, "B_clean.json")
    q = bundle["questionnaire"]
    assert q["clientName"] == "Person Alpha" and q["maritalStatus"] == "Married" and q["spouse"] == "Person Beta"
    assert {a["id"]: a["governing_document"] for a in q["assets"]} == {"a401k": "bd_401k", "brokerage": "titling"}
    assert all(a["route"] == "Unknown" and a["beneficiary"] == "" for a in q["assets"])
    assert q["marriages"][1]["ended"] == "" and q["marriages"][0]["married"] == "2005-04-02"
    packet = bundle["packet"]
    assert packet["schemaVersion"] == 2 and packet["verifiedBy"] == "verify_quotes.py"
    assert any(f["subjectId"] == "a401k" for f in packet["facts"])


def test_no_answer_key_content_is_published(built):
    variants, _, out = built
    for file in out.glob("*.json"):
        body = file.read_text()
        assert "expected_facts" not in body and "expected_issues\": [" not in body
        assert "answer_key" not in body and "field_misses" not in body


def test_eval_counts_are_copied_without_missed_detail(household_dir, tmp_path, built):
    import run_eval
    variants, run_dir, _ = built
    assert run_eval.main(["--variants", str(variants), "--run", str(run_dir)]) == 0
    out = tmp_path / "with_eval"
    assert build_samples.main(["--variants", str(variants), "--run", str(run_dir), "--out", str(out)]) == 0
    manifest = load(out, "index.json")
    assert manifest["evaluation"]["false_alarms"]["clean_variants"] == 1
    assert "missed" not in manifest["evaluation"]["issues"]
    clean = load(out, "B_clean.json")["evaluation"]
    assert clean["expected_issues"] == 0 and clean["false_alarms"] == 0
    assert set(clean) >= {"issues_caught", "citations", "fields"} and "missed" not in clean


def test_refuses_unlabeled_documents(household_dir, tmp_path):
    variants, run_dir = tmp_path / "variants", tmp_path / "run"
    mh.main([str(household_dir), "--out", str(variants)])
    simulate_run(household_dir, variants, run_dir, label="user_supplied")
    out = tmp_path / "samples"
    assert build_samples.main(["--variants", str(variants), "--run", str(run_dir), "--out", str(out)]) == 1
    assert not out.exists()


def test_refuses_to_overwrite_without_force(built):
    variants, run_dir, out = built
    args = ["--variants", str(variants), "--run", str(run_dir), "--out", str(out)]
    assert build_samples.main(args) == 1
    assert build_samples.main(args + ["--force"]) == 0


def test_variant_without_extraction_is_skipped(household_dir, tmp_path):
    variants, run_dir = tmp_path / "variants", tmp_path / "run"
    mh.main([str(household_dir), "--out", str(variants)])
    simulate_run(household_dir, variants, run_dir)
    for f in (run_dir / "B_clean" / "facts").iterdir():
        f.unlink()
    out = tmp_path / "samples"
    assert build_samples.main(["--variants", str(variants), "--run", str(run_dir), "--out", str(out)]) == 0
    manifest = load(out, "index.json")
    assert manifest["skipped"] == ["B_clean"] and "B_clean" not in {s["id"] for s in manifest["samples"]}
