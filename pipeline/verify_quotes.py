#!/usr/bin/env python3
"""Deterministic quote verifier (CLAUDE.md hard rule 2).

Every extracted fact carries a verbatim quote and a page number. A fact is verified only when
its quote appears on that page of the document AND its value appears in the matched text.
Facts that fail stay in the record, flagged "unverified" with a reason, and must never be shown
as findings (use verified_facts()).

Quote matching, strictest first:
  exact          the normalized quote is a substring of the normalized page
  exact_compact  the same ignoring spaces and punctuation (PDF text-extraction artifacts)
  fuzzy          scanned documents only: rapidfuzz partial_ratio >= FUZZY_THRESHOLD, and only
                 for quotes of at least FUZZY_MIN_CHARS characters (OCR noise)
Value check: every word of the value appears in the matched text (dates: the quote contains a
date expression equal to the ISO value). Scanned documents allow near-matches per word.

Usage:
  python -m pipeline.verify_quotes runs/<run>/facts/           # re-verify records in place, log the check
  python -m pipeline.verify_quotes runs/<run>/facts/will.json --no-log
"""
import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

from rapidfuzz import fuzz

from edr.dates import find_dates, parse_iso
from edr.pages import file_sha256, load_pages
from edr.schema import DATE_FIELDS
from edr.textnorm import compact, normalize, tokens

VERIFIER_VERSION = "1"
FUZZY_THRESHOLD = 90.0
FUZZY_MIN_CHARS = 20
TOKEN_FUZZY_THRESHOLD = 80.0
TOKEN_FUZZY_MIN_LEN = 4
REPO_ROOT = Path(__file__).resolve().parents[1]

_OCR_ZERO = re.compile(r"(?<=\d)o|o(?=\d)")
_OCR_ONE = re.compile(r"(?<=\d)[li|]|[li|](?=\d)")
_OCR_LETTERS = str.maketrans({"1": "l", "|": "l", "i": "l", "0": "o"})


def _ocr_fold(word):
    """Collapse common OCR letter confusions (rn/m, vv/w, cl/d, 1/i/l, 0/o). Applied to both
    sides of a comparison, so it only removes differences OCR is known to introduce."""
    return word.replace("rn", "m").replace("vv", "w").replace("cl", "d").translate(_OCR_LETTERS)


def match_quote(quote, page_text, allow_fuzzy):
    """Find quote on one page. Returns {"matched": True, "method", "score", "support"} where
    support is the normalized page text the quote matched, or {"matched": False, "reason"}."""
    nq, npage = normalize(quote), normalize(page_text)
    if not nq:
        return {"matched": False, "reason": "empty_quote"}
    if nq in npage:
        return {"matched": True, "method": "exact", "score": 100.0, "support": nq}
    cq = compact(quote)
    if cq and cq in compact(page_text):
        return {"matched": True, "method": "exact_compact", "score": 100.0, "support": nq}
    if "..." in nq:
        return {"matched": False, "reason": "elided_quote"}
    if not allow_fuzzy:
        return {"matched": False, "reason": "quote_not_found"}
    if len(nq) < FUZZY_MIN_CHARS:
        return {"matched": False, "reason": "too_short_for_fuzzy"}
    if len(nq) > len(npage):
        return {"matched": False, "reason": "quote_not_found", "best_score": 0.0}
    aligned = fuzz.partial_ratio_alignment(nq, npage)
    if aligned.score < FUZZY_THRESHOLD:
        return {"matched": False, "reason": "quote_not_found", "best_score": round(aligned.score, 1)}
    start, end = aligned.dest_start, aligned.dest_end
    while start > 0 and npage[start - 1].isalnum():  # widen to whole words
        start -= 1
    while end < len(npage) and npage[end].isalnum():
        end += 1
    return {"matched": True, "method": "fuzzy", "score": round(aligned.score, 1), "support": npage[start:end]}


def check_value(field, value, support, fuzzy):
    """(True|False|None, reason). None means there is nothing to check (a blank field)."""
    value = (value or "").strip()
    if not value:
        return None, None
    if field in DATE_FIELDS:
        wanted = parse_iso(value)
        if wanted is None:
            return False, "value_not_iso_date"
        texts = [support]
        if fuzzy:
            texts.append(_OCR_ONE.sub("1", _OCR_ZERO.sub("0", support)))
        if any(m.value == wanted for text in texts for m in find_dates(text)):
            return True, None
        return False, "date_not_in_quote"
    value_tokens = tokens(value)
    if not value_tokens:
        return None, None
    support_tokens = set(tokens(support))
    missing = [t for t in value_tokens if t not in support_tokens]
    if missing and fuzzy:
        folded = {_ocr_fold(s) for s in support_tokens}
        missing = [t for t in missing if not (
            _ocr_fold(t) in folded
            or (len(t) >= TOKEN_FUZZY_MIN_LEN
                and any(fuzz.ratio(_ocr_fold(t), s) >= TOKEN_FUZZY_THRESHOLD for s in folded)))]
    if missing:
        return False, "value_not_in_quote"
    return True, None


def _pages_with(quote, pages, allow_fuzzy, skip=None):
    return [n for n, text in enumerate(pages, 1)
            if n != skip and match_quote(quote, text, allow_fuzzy)["matched"]]


def verify_fact(fact, pages, allow_fuzzy):
    page, quote = fact.get("page"), fact.get("quote") or ""
    result = {"status": "unverified", "method": None, "score": None, "page_checked": page,
              "found_on_pages": [], "value_supported": None, "reason": None}
    if not isinstance(page, int) or isinstance(page, bool) or not 1 <= page <= len(pages):
        result["reason"] = "page_out_of_range"
        result["found_on_pages"] = _pages_with(quote, pages, allow_fuzzy)
        return result
    m = match_quote(quote, pages[page - 1], allow_fuzzy)
    if not m["matched"]:
        result["reason"] = m["reason"]
        result["score"] = m.get("best_score")
        if m["reason"] in ("quote_not_found", "too_short_for_fuzzy"):
            result["found_on_pages"] = _pages_with(quote, pages, allow_fuzzy, skip=page)
            neighbours = [(page - 1, page), (page, page + 1)]
            if result["found_on_pages"]:
                result["reason"] = "wrong_page"
            elif any(1 <= a and b <= len(pages) and match_quote(
                    quote, pages[a - 1] + "\n" + pages[b - 1], allow_fuzzy)["matched"] for a, b in neighbours):
                result["reason"] = "spans_pages"
        return result
    result.update(method=m["method"], score=m["score"])
    supported, why = check_value(fact.get("field"), fact.get("value"), m["support"], m["method"] == "fuzzy")
    result["value_supported"] = supported
    if supported is False:
        result["reason"] = why
        return result
    result["status"] = "verified"
    return result


def resolve_path(stored):
    path = Path(stored)
    return path if path.is_absolute() else REPO_ROOT / path


def display_path(path):
    """Repo-relative path when possible, so published results don't carry local home paths."""
    path = Path(path).resolve()
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def _fail_all(record, reason):
    for fact in record.get("facts", []):
        fact["verification"] = {"status": "unverified", "method": None, "score": None,
                                "page_checked": fact.get("page"), "found_on_pages": [],
                                "value_supported": None, "reason": reason}


def verify_record(record):
    """Annotate every fact in an extraction record with a "verification" block, in place."""
    doc = record["document"]
    path = resolve_path(doc["path"])
    if not path.exists():
        _fail_all(record, "document_missing")
    elif file_sha256(path) != doc["sha256"]:
        _fail_all(record, "document_changed")
    else:
        pages = load_pages(path)
        allow_fuzzy = doc.get("source") == "scanned"
        for fact in record.get("facts", []):
            fact["verification"] = verify_fact(fact, pages, allow_fuzzy)
    record["verifier"] = {"version": VERIFIER_VERSION, "fuzzy_threshold": FUZZY_THRESHOLD,
                          "fuzzy_min_chars": FUZZY_MIN_CHARS,
                          "fuzzy_allowed": doc.get("source") == "scanned"}
    return record


def verified_facts(record):
    """The only facts downstream steps may use as evidence."""
    return [f for f in record.get("facts", []) if f.get("verification", {}).get("status") == "verified"]


def summarize(records):
    by_source, methods, reasons, models = {}, Counter(), Counter(), set()
    errors = 0
    for record in records:
        if record.get("error"):
            errors += 1
            continue
        source = record["document"].get("source", "digital")
        counts = by_source.setdefault(source, Counter())
        model = record.get("extraction", {}).get("model_served")
        if model:
            models.add(model)
        for fact in record.get("facts", []):
            v = fact.get("verification", {})
            counts["facts"] += 1
            if v.get("status") == "verified":
                counts["verified"] += 1
                methods[v["method"]] += 1
            else:
                reasons[v.get("reason") or "unknown"] += 1
    def rate(c):
        return round(c["verified"] / c["facts"], 4) if c["facts"] else None
    total = sum((c for c in by_source.values()), Counter())
    return {
        "documents": len(records), "extraction_errors": errors,
        "facts": total["facts"], "verified": total["verified"],
        "unverified": total["facts"] - total["verified"], "pass_rate": rate(total),
        "by_source": {s: {"facts": c["facts"], "verified": c["verified"], "pass_rate": rate(c)}
                      for s, c in sorted(by_source.items())},
        "by_method": dict(sorted(methods.items())),
        "unverified_reasons": dict(sorted(reasons.items())),
        "models": sorted(models),
    }


def log_check(summary, files):
    from ai_log.log_check import append_check
    passed = None if not summary["facts"] else summary["unverified"] == 0
    append_check("quote_verifier", passed, {**summary, "files": [display_path(f) for f in files]})


def print_summary(summary, records):
    for record in records:
        name = record["document"]["id"]
        if record.get("error"):
            print(f"  {name}: extraction error: {record['error'].get('message')}")
            continue
        facts = record.get("facts", [])
        ok = len(verified_facts(record))
        print(f"  {name} [{record['document'].get('source')}]: {ok}/{len(facts)} verified")
        for fact in facts:
            v = fact["verification"]
            if v["status"] != "verified":
                where = f" (found on p.{v['found_on_pages']})" if v["found_on_pages"] else ""
                print(f"    UNVERIFIED {fact['field']}={fact['value']!r} p.{fact['page']}: {v['reason']}{where}")
    print(f"Verified {summary['verified']}/{summary['facts']} facts (pass rate {summary['pass_rate']}).")
    for source, s in summary["by_source"].items():
        print(f"  {source}: {s['verified']}/{s['facts']} (pass rate {s['pass_rate']})")


def expand(paths):
    files = []
    for item in map(Path, paths):
        if item.is_dir():
            files += sorted(p for p in item.glob("*.json") if not p.name.startswith("_"))
        else:
            files.append(item)
    return files


def write_json(path, data):
    Path(path).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main(argv=None):
    ap = argparse.ArgumentParser(description="Verify every extracted quote against its page.")
    ap.add_argument("paths", nargs="+", help="extraction record JSON files, or directories of them")
    ap.add_argument("--no-log", action="store_true", help="don't append the result to ai_log/checks.jsonl")
    args = ap.parse_args(argv)
    files = expand(args.paths)
    if not files:
        print("No extraction records found.", file=sys.stderr)
        return 2
    records = []
    for path in files:
        record = json.loads(Path(path).read_text(encoding="utf-8"))
        if not record.get("error"):
            verify_record(record)
            write_json(path, record)
        records.append(record)
    summary = summarize(records)
    print_summary(summary, records)
    if not args.no_log:
        log_check(summary, files)
    return 0


if __name__ == "__main__":
    sys.exit(main())
