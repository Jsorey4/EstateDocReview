#!/usr/bin/env python3
"""Score the pipeline against the mutation script's answer keys (CLAUDE.md, Architecture step 4).

Layout it reads:
  <variants>/<variant>/answer_key.json      from mutate_household.py (never shown to the product)
  <variants>/<variant>/input/               questionnaire.yaml, assets.yaml
  <run>/<variant>/facts/*.json              extract.py + verify_quotes.py output for that variant

Reconciliation is re-run here in process, so the scored findings always match the current rules,
and its wall-clock time is measured.

Metrics (each reported overall; extraction and citations also split digital vs scanned):
  field accuracy    expected gold facts matched by a verified extracted fact (same document,
                    field and value; dates compared as ISO). Page is reported separately.
  issues caught     expected issues matched by a finding of the same type that shares a document
                    or a person with it; status (flagged/unresolved) must also match to count as
                    "status correct". Matching is one-to-one.
  false alarms      findings that match no expected issue. The clean control (B_clean) should
                    score zero.
  citation pass     verified facts / all extracted facts (the quote verifier's verdict)
  time              reconcile seconds per variant; extraction seconds only if
                    <run>/<variant>/timing.json holds {"extraction_seconds": n}

Usage:
  python -m evaluation.run_eval --variants households/variants --run runs/<run> [--out runs/<run>/eval.json]
"""
import argparse
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

from pipeline import reconcile
from edr.textnorm import normalize, same_person

EVAL_VERSION = "1"


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def value_matches(field, expected, got):
    if field == "document_date":
        return expected.strip() == got.strip()
    return normalize(expected) == normalize(got) or same_person(expected, got)


def score_fields(expected_facts, records):
    """Per-source field accuracy. Returns (counts_by_source, misses)."""
    verified = defaultdict(list)
    source = {}
    for record in records:
        doc = record["document"]["id"]
        source[doc] = record["document"].get("source") or "digital"
        verified[doc] = [f for f in record.get("facts", []) if f.get("verification", {}).get("status") == "verified"]
    counts = defaultdict(lambda: {"expected": 0, "found": 0, "page_correct": 0})
    misses = []
    for exp in expected_facts:
        src = source.get(exp["doc"], "digital")
        counts[src]["expected"] += 1
        hit = next((f for f in verified.get(exp["doc"], [])
                    if f["field"] == exp["field"] and value_matches(exp["field"], exp["value"], f["value"])), None)
        if hit:
            counts[src]["found"] += 1
            counts[src]["page_correct"] += hit["page"] == exp["page"]
        else:
            misses.append({"id": exp["id"], "doc": exp["doc"], "field": exp["field"], "value": exp["value"]})
    return counts, misses


def issue_matches(expected, found):
    if expected["issue_type"] != found["issue_type"]:
        return False
    if set(expected.get("documents") or []) & set(found.get("documents") or []):
        return True
    return any(same_person(a, b) for a in expected.get("people") or [] for b in found.get("people") or [])


def score_issues(expected_issues, findings):
    """One-to-one greedy matching. Returns (caught, status_correct, unmatched_expected, false_alarms)."""
    remaining = list(findings)
    caught = status_ok = 0
    missed = []
    for exp in expected_issues:
        match = next((f for f in remaining if issue_matches(exp, f)), None)
        if match is None:
            missed.append({"issue_type": exp["issue_type"], "documents": exp.get("documents"), "people": exp.get("people")})
            continue
        remaining.remove(match)
        caught += 1
        status_ok += match["status"] == exp["expected_status"]
    alarms = [{"id": f["id"], "issue_type": f["issue_type"], "documents": f["documents"], "people": f["people"]}
              for f in remaining]
    return caught, status_ok, missed, alarms


def citation_counts(records):
    counts = defaultdict(lambda: {"facts": 0, "verified": 0})
    for record in records:
        src = record["document"].get("source") or "digital"
        for fact in record.get("facts", []):
            counts[src]["facts"] += 1
            counts[src]["verified"] += fact.get("verification", {}).get("status") == "verified"
    return counts


def rate(num, den):
    return round(num / den, 4) if den else None


def evaluate_variant(variant_dir, run_dir):
    key = load_json(variant_dir / "answer_key.json")
    facts_dir = run_dir / variant_dir.name / "facts"
    records = reconcile.load_records(facts_dir) if facts_dir.exists() else []
    questionnaire, assets = reconcile.load_inputs(variant_dir / "input")
    started = time.perf_counter()
    result = reconcile.reconcile(records, questionnaire, assets)
    reconcile_seconds = time.perf_counter() - started
    field_counts, misses = score_fields(key["expected_facts"], records)
    caught, status_ok, missed, alarms = score_issues(key["expected_issues"], result["findings"])
    timing_file = run_dir / variant_dir.name / "timing.json"
    extraction_seconds = load_json(timing_file).get("extraction_seconds") if timing_file.exists() else None
    return {
        "variant": variant_dir.name,
        "have_extraction": bool(records),
        "expected_issues": len(key["expected_issues"]),
        "issues_caught": caught,
        "status_correct": status_ok,
        "missed": missed,
        "false_alarms": alarms,
        "fields": {src: dict(c) for src, c in field_counts.items()},
        "field_misses": misses,
        "citations": {src: dict(c) for src, c in citation_counts(records).items()},
        "reconcile_seconds": round(reconcile_seconds, 4),
        "extraction_seconds": extraction_seconds,
        "amount_at_stake_expected_usd": key.get("amount_at_stake_total_usd"),
        "amount_at_stake_found_usd": result["summary"]["amount_at_stake_flagged_usd"],
    }


def aggregate(results):
    scored = [r for r in results if r["have_extraction"]]
    fields, cites = defaultdict(lambda: defaultdict(int)), defaultdict(lambda: defaultdict(int))
    for r in scored:
        for src, c in r["fields"].items():
            for k, v in c.items():
                fields[src][k] += v
        for src, c in r["citations"].items():
            for k, v in c.items():
                cites[src][k] += v
    total_f = {k: sum(fields[s][k] for s in fields) for k in ("expected", "found", "page_correct")}
    total_c = {k: sum(cites[s][k] for s in cites) for k in ("facts", "verified")}
    expected = sum(r["expected_issues"] for r in scored)
    caught = sum(r["issues_caught"] for r in scored)
    clean = [r for r in scored if r["expected_issues"] == 0]
    return {
        "eval_version": EVAL_VERSION,
        "variants_scored": len(scored),
        "variants_without_extraction": [r["variant"] for r in results if not r["have_extraction"]],
        "field_accuracy": {
            "overall": rate(total_f["found"], total_f["expected"]),
            "page_accuracy": rate(total_f["page_correct"], total_f["found"]),
            **{src: rate(c["found"], c["expected"]) for src, c in sorted(fields.items())},
        },
        "issues": {
            "expected": expected, "caught": caught, "recall": rate(caught, expected),
            "status_correct": sum(r["status_correct"] for r in scored),
            "missed": [{"variant": r["variant"], **m} for r in scored for m in r["missed"]],
        },
        "false_alarms": {
            "total": sum(len(r["false_alarms"]) for r in scored),
            "clean_variants": len(clean),
            "clean_variants_with_findings": sum(bool(r["false_alarms"]) for r in clean),
            "detail": [{"variant": r["variant"], **a} for r in scored for a in r["false_alarms"]],
        },
        "citation_pass_rate": {
            "overall": rate(total_c["verified"], total_c["facts"]),
            **{src: rate(c["verified"], c["facts"]) for src, c in sorted(cites.items())},
        },
        "time": {
            "reconcile_seconds_total": round(sum(r["reconcile_seconds"] for r in scored), 4),
            "extraction_seconds_total": (round(sum(r["extraction_seconds"] or 0 for r in scored), 2)
                                         if any(r["extraction_seconds"] for r in scored) else None),
        },
    }


def pct(x):
    return "n/a" if x is None else f"{x * 100:.1f}%"


def print_report(summary, results):
    print(f"Scored {summary['variants_scored']} variants.")
    if summary["variants_without_extraction"]:
        print(f"  No extraction records (skipped): {', '.join(summary['variants_without_extraction'])}")
    fa = summary["field_accuracy"]
    print(f"Field accuracy: {pct(fa['overall'])}  (page correct on matches: {pct(fa['page_accuracy'])})")
    for src in ("digital", "scanned"):
        if src in fa:
            print(f"  {src}: {pct(fa[src])}")
    i = summary["issues"]
    print(f"Issues caught: {i['caught']}/{i['expected']} (recall {pct(i['recall'])}); status correct on {i['status_correct']}")
    for m in i["missed"]:
        print(f"  MISSED {m['variant']}: {m['issue_type']}")
    fl = summary["false_alarms"]
    print(f"False alarms: {fl['total']} (clean variants with any finding: {fl['clean_variants_with_findings']}/{fl['clean_variants']})")
    for a in fl["detail"]:
        print(f"  FALSE ALARM {a['variant']}: {a['issue_type']} {a['documents']} {a['people']}")
    cp = summary["citation_pass_rate"]
    print(f"Citation pass rate: {pct(cp['overall'])}")
    for src in ("digital", "scanned"):
        if src in cp:
            print(f"  {src}: {pct(cp[src])}")
    t = summary["time"]
    print(f"Time: reconcile {t['reconcile_seconds_total']}s total; extraction "
          f"{'n/a' if t['extraction_seconds_total'] is None else str(t['extraction_seconds_total']) + 's'}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--variants", required=True, help="directory written by mutate_household.py")
    ap.add_argument("--run", required=True, help="directory holding <variant>/facts/*.json")
    ap.add_argument("--out", help="write the full JSON report here (default <run>/eval.json)")
    args = ap.parse_args(argv)
    variants = sorted(p for p in Path(args.variants).iterdir() if (p / "answer_key.json").exists())
    if not variants:
        print(f"no answer keys under {args.variants}", file=sys.stderr)
        return 2
    run_dir = Path(args.run)
    results = [evaluate_variant(v, run_dir) for v in variants]
    summary = aggregate(results)
    out = Path(args.out) if args.out else run_dir / "eval.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"summary": summary, "variants": results}, indent=2, ensure_ascii=False) + "\n",
                   encoding="utf-8")
    print_report(summary, results)
    return 0


if __name__ == "__main__":
    sys.exit(main())
