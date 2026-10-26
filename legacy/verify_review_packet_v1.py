#!/usr/bin/env python3
"""Verify supplied page quotes for the static advisor UI. Never extracts or invents facts.

Legacy format only. Usage: python3 -m legacy.verify_review_packet_v1 input.json review.json
Only supplied public or synthetic source text is accepted. OCR that does not
match conservatively remains unverified. This verifies text presence, not the
accuracy of an extracted value, legal effect, or document precedence.
"""
import argparse
import json
import unicodedata
from pathlib import Path


def normalize(text):
    return " ".join(unicodedata.normalize("NFKC", text).split())


def verify(data):
    if data.get("schemaVersion") != 1:
        raise ValueError("schemaVersion must be 1")
    documents = data.get("documents")
    facts = data.get("facts")
    if not isinstance(documents, list) or not isinstance(facts, list):
        raise ValueError("documents and facts must be arrays")
    pages = {}
    document_ids = set()
    for document in documents:
        if document.get("source") not in ("synthetic", "public", "user_supplied"):
            raise ValueError("Only synthetic, public, or user_supplied document sources are accepted")
        doc_id = document["id"]
        if not doc_id or doc_id in document_ids:
            raise ValueError("Document IDs must be unique and nonempty")
        document_ids.add(doc_id)
        if document["source"] == "public" and not str(document.get("sourceUrl", "")).startswith(("https://", "http://")):
            raise ValueError("Public sources require a sourceUrl")
        for page in document["pages"]:
            key = (doc_id, page["page"])
            if key in pages or type(page["page"]) is not int or page["page"] < 1:
                raise ValueError("Source page numbers must be positive and unique within each document")
            if not isinstance(page["text"], str) or not page["text"].strip():
                raise ValueError("Every source page requires text")
            pages[key] = normalize(page["text"])
    fact_ids = set()
    output_facts = []
    for fact in facts:
        if not fact.get("id") or fact["id"] in fact_ids:
            raise ValueError("Fact IDs must be unique and nonempty")
        fact_ids.add(fact["id"])
        if fact["documentId"] not in document_ids:
            raise ValueError("A fact references a missing document")
        quote = normalize(fact["quote"])
        text = pages.get((fact["documentId"], fact["page"]), "")
        output_facts.append({**fact, "verification": "verified" if quote and quote in text else "unverified"})
    return {**data, "verifiedBy": "verify_quotes.py", "facts": output_facts}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.input.resolve() == args.output.resolve():
        parser.error("Use a separate output path to preserve source input")
    if args.output.exists():
        parser.error("Output already exists; choose a new path to preserve previous review data")
    try:
        if args.input.stat().st_size > 8_000_000:
            raise ValueError("Input exceeds the 8 MB browser import limit")
        result = verify(json.loads(args.input.read_text(encoding="utf-8")))
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except (OSError, ValueError, KeyError, TypeError) as exc:
        parser.exit(1, f"Verification failed: {exc}\n")
    passed = sum(f["verification"] == "verified" for f in result["facts"])
    print(f"{passed} quotes verified; {len(result['facts']) - passed} unverified. Wrote {args.output}")


if __name__ == "__main__":
    main()
