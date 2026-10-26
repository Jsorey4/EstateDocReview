"""End to end on the placeholder fixture: mutate -> perfect extraction -> reconcile -> score.

A perfect extractor is simulated from each answer key's gold facts, so a failure here means the
mutation script, the reconciliation rules and the scorer disagree with each other.
"""
import json

import yaml

import mutate_household as mh
import run_eval


def perfect_run(household_dir, variants, run_dir, drop=None, scanned=False):
    doc_types = {d["id"]: d["type"] for d in yaml.safe_load((household_dir / "household.yaml").read_text())["documents"]}
    for variant in sorted(p for p in variants.iterdir() if (p / "answer_key.json").exists()):
        key = json.loads((variant / "answer_key.json").read_text())
        facts_dir = run_dir / variant.name / "facts"
        facts_dir.mkdir(parents=True)
        for doc, doc_type in doc_types.items():
            facts = [{"field": f["field"], "value": f["value"], "detail": "", "quote": f["value"] or "blank", "page": f["page"],
                      "verification": {"status": "verified", "method": "exact", "score": 100.0}}
                     for f in key["expected_facts"] if f["doc"] == doc and (drop is None or f["id"] != drop)]
            record = {"document": {"id": doc, "source": "scanned" if scanned else "digital"},
                      "document_type": doc_type, "facts": facts, "unreadable_pages": []}
            (facts_dir / f"{doc}.json").write_text(json.dumps(record))


def evaluate(household_dir, tmp_path, **kwargs):
    variants, run_dir = tmp_path / "variants", tmp_path / "run"
    assert mh.main([str(household_dir), "--out", str(variants)]) == 0
    perfect_run(household_dir, variants, run_dir, **kwargs)
    results = [run_eval.evaluate_variant(v, run_dir) for v in sorted(variants.iterdir()) if (v / "answer_key.json").exists()]
    return run_eval.aggregate(results), results, variants, run_dir


def test_perfect_extraction_catches_every_planted_issue_with_no_false_alarms(household_dir, tmp_path):
    summary, results, _, _ = evaluate(household_dir, tmp_path)
    assert summary["issues"]["expected"] > 0
    assert summary["issues"]["caught"] == summary["issues"]["expected"], summary["issues"]["missed"]
    assert summary["issues"]["status_correct"] == summary["issues"]["expected"]
    assert summary["false_alarms"]["total"] == 0, summary["false_alarms"]["detail"]
    assert summary["false_alarms"]["clean_variants"] == 1 and summary["false_alarms"]["clean_variants_with_findings"] == 0
    assert summary["field_accuracy"]["overall"] == 1.0 and summary["citation_pass_rate"]["overall"] == 1.0


def test_dropping_a_fact_lowers_field_accuracy_and_misses_the_issue(household_dir, tmp_path):
    summary, _, _, _ = evaluate(household_dir, tmp_path, drop="bd_primary")
    assert summary["field_accuracy"]["overall"] < 1.0
    assert any(m["issue_type"] == "former_spouse_beneficiary" for m in summary["issues"]["missed"])


def test_scanned_and_digital_are_reported_separately(household_dir, tmp_path):
    summary, _, _, _ = evaluate(household_dir, tmp_path, scanned=True)
    assert "scanned" in summary["field_accuracy"] and "digital" not in summary["field_accuracy"]
    assert summary["citation_pass_rate"]["scanned"] == 1.0


def test_variant_without_extraction_is_skipped_not_scored_as_zero(household_dir, tmp_path):
    variants, run_dir = tmp_path / "variants", tmp_path / "run"
    mh.main([str(household_dir), "--out", str(variants)])
    run_dir.mkdir()
    results = [run_eval.evaluate_variant(v, run_dir) for v in variants.iterdir() if (v / "answer_key.json").exists()]
    summary = run_eval.aggregate(results)
    assert summary["variants_scored"] == 0 and summary["issues"]["recall"] is None


def test_cli_writes_report(household_dir, tmp_path, capsys):
    _, _, variants, run_dir = evaluate(household_dir, tmp_path)
    assert run_eval.main(["--variants", str(variants), "--run", str(run_dir)]) == 0
    assert (run_dir / "eval.json").exists()
    assert "Issues caught" in capsys.readouterr().out
