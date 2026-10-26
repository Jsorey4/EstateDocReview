#!/usr/bin/env python3
"""Package precomputed pipeline runs as replayable samples for the static site.

For each variant that has extraction records under <run>/<variant>/facts, one bundle holds:
  questionnaire   the variant's questionnaire.yaml and assets.yaml in the frontend's shape
  packet          the version-2 review packet (export_review.build_packet), which re-verifies
                  every quote against the unchanged source file
  reconciliation  reconcile.reconcile, re-run here on the re-verified records so it matches the
                  current rules
  evaluation      that variant's counts from <run>/eval.json, when run_eval.py has been run

Never reads answer_key.json or household.yaml. From eval.json only counts are copied: missed
issues and field misses come from the answer key and stay out of the site. Only documents
labeled synthetic or public are packaged, because the output is published.

Usage:
  python build_samples.py --variants households/variants --run runs/<run> --out public/samples
"""
import argparse
import copy
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import export_household_inputs
import export_review
import reconcile
import verify_quotes as vq
from edr.schema import DOCUMENT_TYPES

BUNDLE_VERSION = 1
MAX_BYTES = 8_000_000  # same limit as the browser importer
PUBLISHABLE = ("synthetic", "public")
FRONTEND_TYPES = {v: k for k, v in export_household_inputs.TYPES.items()}
RETIREMENT = ("retirement_401k", "ira")
CHARACTERS = ("community", "separate", "unknown")


def text(value):
    return "" if value is None else str(value)


def frontend_questionnaire(questionnaire, assets, variant):
    """Inverse of export_household_inputs.build_inputs. Fields the YAML inputs do not carry
    (respondent, client-reported routes, intended owner and beneficiary per asset, intended
    executor) stay blank or "Unknown" rather than being guessed."""
    if questionnaire.get("synthetic") is not True or (assets and assets.get("synthetic") is not True):
        raise ValueError(f"{variant}: questionnaire.yaml and assets.yaml must be labeled synthetic: true")
    q = reconcile.jsonable(questionnaire)
    a = reconcile.jsonable(assets or {})
    client = q.get("client") or {}
    if client.get("state", "TX") != "TX":
        raise ValueError(f"{variant}: only Texas households are supported")
    marriages = [{"spouse": text(m.get("spouse")), "married": text(m.get("married")),
                  "ended": text(m.get("ended")), "how_ended": text(m.get("how_ended"))}
                 for m in q.get("marriages") or []]
    current = next((m for m in marriages if not m["ended"]), None)
    last = marriages[-1] if marriages else None
    if current:
        marital = "Married"
    else:
        marital = {"divorce": "Divorced", "death": "Widowed"}.get(last["how_ended"], "") if last else ""
    rows = []
    for asset in a.get("assets") or []:
        kind = asset.get("type")
        rows.append({
            "id": text(asset["id"]),
            "name": text(asset.get("description")),
            "type": "Retirement account" if kind in RETIREMENT else FRONTEND_TYPES.get(kind, "Other"),
            "retirementKind": kind if kind in RETIREMENT else "retirement_401k",
            "character": asset.get("character") if asset.get("character") in CHARACTERS else "unknown",
            "governing_document": text(asset.get("governing_document")),
            "value": float(asset.get("value_usd") or 0),
            "owner": "", "beneficiary": "", "route": "Unknown",
        })
    return {
        "clientName": text(client.get("name")),
        "asOf": text(q.get("as_of")),
        "marriages": marriages,
        "intended_beneficiaries": [{"name": text(b.get("name")), "share": text(b.get("share"))}
                                   for b in q.get("intended_beneficiaries") or []],
        "documents_available": [d for d in q.get("documents_available") or [] if d in DOCUMENT_TYPES],
        "household": text(client.get("name")) or variant,
        "respondent": "",
        "maritalStatus": marital,
        "spouse": current["spouse"] if current else "",
        "state": "Texas",
        "events": [],
        "people": [{"id": f"person-{i + 1}", "name": text(p.get("name")), "relationship": text(p.get("relationship")),
                    "status": p.get("status") if p.get("status") in ("living", "deceased") else "unknown"}
                   for i, p in enumerate(q.get("people") or [])],
        "assets": rows,
        "executor": "", "trustee": "", "agent": "",
        "intentions": "", "concerns": "", "reviewed": False,
    }


def eval_counts(result):
    """Counts only. 'missed' and 'field_misses' repeat answer-key content and are dropped."""
    if not result:
        return None
    return {
        "expected_issues": result["expected_issues"],
        "issues_caught": result["issues_caught"],
        "status_correct": result["status_correct"],
        "false_alarms": len(result["false_alarms"]),
        "false_alarm_ids": [a["id"] for a in result["false_alarms"]],
        "fields": result["fields"],
        "citations": result["citations"],
        "extraction_seconds": result.get("extraction_seconds"),
    }


def eval_summary(summary):
    if not summary:
        return None
    return {
        "variants_scored": summary["variants_scored"],
        "field_accuracy": summary["field_accuracy"],
        "issues": {k: summary["issues"][k] for k in ("expected", "caught", "recall", "status_correct")},
        "false_alarms": {k: summary["false_alarms"][k]
                         for k in ("total", "clean_variants", "clean_variants_with_findings")},
        "citation_pass_rate": summary["citation_pass_rate"],
        "time": summary["time"],
    }


def build_sample(variant_dir, run_dir, eval_result=None, public_sources=None):
    variant = variant_dir.name
    records = reconcile.load_records(run_dir / variant / "facts")
    if not records:
        return None
    for record in records:
        kind = record.get("data_label", {}).get("kind")
        if kind not in PUBLISHABLE:
            raise ValueError(f"{variant}: {record['document']['id']} is labeled {kind!r}; "
                             f"only synthetic or public documents can be published")
    questionnaire, assets = reconcile.load_inputs(variant_dir / "input")
    view = frontend_questionnaire(questionnaire, assets, variant)
    packet = export_review.build_packet(records, {"questionnaire": view}, public_sources)
    # Reconcile what the packet shows: records re-verified against the current source files.
    verified = [vq.verify_record(copy.deepcopy(r)) for r in records]
    started = time.perf_counter()
    result = reconcile.reconcile(verified, questionnaire, assets)
    seconds = round(time.perf_counter() - started, 4)
    timing = run_dir / variant / "timing.json"
    return {
        "bundleVersion": BUNDLE_VERSION,
        "id": variant,
        "synthetic": True,
        "valuesAreHypothetical": True,
        "questionnaire": view,
        "extractedFacts": sum(len(r.get("facts", [])) for r in records),
        "packet": packet,
        "reconciliation": result,
        "reconcileSeconds": seconds,
        "extractionSeconds": (json.loads(timing.read_text()).get("extraction_seconds")
                              if timing.exists() else None),
        "evaluation": eval_counts(eval_result),
    }


def entry(bundle, file):
    packet, summary = bundle["packet"], bundle["reconciliation"]["summary"]
    return {
        "id": bundle["id"], "file": file,
        "documents": len(packet["documents"]),
        "facts": bundle["extractedFacts"],
        "findings": summary["findings"], "flagged": summary["flagged"], "unresolved": summary["unresolved"],
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--variants", required=True, type=Path, help="directory written by mutate_household.py")
    ap.add_argument("--run", required=True, type=Path, help="directory holding <variant>/facts/*.json")
    ap.add_argument("--out", required=True, type=Path, help="output directory, e.g. public/samples")
    ap.add_argument("--public-sources", type=Path, help="JSON object mapping public document IDs to source URLs")
    ap.add_argument("--force", action="store_true", help="replace the *.json files in an existing --out")
    args = ap.parse_args(argv)
    try:
        variants = sorted(p for p in args.variants.iterdir() if (p / "input").is_dir())
        eval_file = args.run / "eval.json"
        evaluation = json.loads(eval_file.read_text()) if eval_file.exists() else {}
        by_variant = {v["variant"]: v for v in evaluation.get("variants", []) if v.get("have_extraction")}
        sources = json.loads(args.public_sources.read_text()) if args.public_sources else None
        bundles, skipped = [], []
        for variant_dir in variants:
            bundle = build_sample(variant_dir, args.run, by_variant.get(variant_dir.name), sources)
            (bundles.append(bundle) if bundle else skipped.append(variant_dir.name))
        if not bundles:
            raise ValueError(f"no variant under {args.variants} has extraction records in {args.run}")
        encoded = {b["id"]: json.dumps(b, ensure_ascii=False, indent=1) + "\n" for b in bundles}
        for variant, body in encoded.items():
            if len(body.encode()) > MAX_BYTES:
                raise ValueError(f"{variant}: bundle exceeds the 8 MB browser limit")
        if args.out.exists() and any(args.out.iterdir()):
            if not args.force:
                raise ValueError(f"{args.out} is not empty; pass --force to replace its samples")
            for old in args.out.glob("*.json"):
                old.unlink()
        args.out.mkdir(parents=True, exist_ok=True)
        manifest = {
            "bundleVersion": BUNDLE_VERSION, "synthetic": True,
            "builtAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "run": args.run.name,
            "samples": [], "skipped": skipped,
            "evaluation": eval_summary(evaluation.get("summary")),
        }
        for bundle in bundles:
            file = f"{bundle['id']}.json"
            (args.out / file).write_text(encoded[bundle["id"]], encoding="utf-8")
            manifest["samples"].append(entry(bundle, file))
        (args.out / "index.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                                             encoding="utf-8")
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f"build_samples failed: {exc}", file=sys.stderr)
        return 1
    print(f"Wrote {len(bundles)} samples to {args.out}"
          + (f"; no extraction for {', '.join(skipped)}" if skipped else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
