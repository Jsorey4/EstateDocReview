#!/usr/bin/env python3
"""Reconciliation: deterministic rules over verified facts (CLAUDE.md, Architecture step 2).

Inputs: extraction records that went through verify_quotes.py, plus the client's questionnaire
and asset inventory. Only verified facts can support a finding (hard rule 2); unverified facts
are counted and listed, never shown as findings.

Decision logic, in order:
  1. Index verified facts by document and field. Cost is linear in facts; no model call.
  2. Each rule compares one family of facts with one questionnaire answer and either emits a
     finding or stays silent. A missing fact is never a finding (it is a coverage gap), and
     document age alone is never a finding (hard rule 3).
  3. Status: "flagged" when the sources contradict each other on a point of record;
     "unresolved" when the documents leave the answer open. Unresolved items show both passages
     and ask; nothing is resolved in the tool's favor.
  4. Amount at stake: the sum of hypothetical asset values the affected document governs.
  5. Findings sort by status (flagged first), then amount at stake, then issue type, so the
     advisor reads the largest exposure first. The order is deterministic.

Every finding carries observation, evidence (quote + page, or the questionnaire path),
uncertainty and next question (CLAUDE.md, Output rules). Wording is observational and never
says a provision is void, invalid or unenforceable. No statute or case is cited: the Texas rule
pack (rules/) does not exist yet, so rule_refs is empty and rule_pack_status says so.

Usage:
  python reconcile.py --facts runs/<run>/facts --inputs households/variants/<v>/input --out runs/<run>/findings.json
"""
import argparse
import json
import sys
from datetime import date
from pathlib import Path

import yaml

from edr.dates import parse_iso
from edr.issues import ISSUE_TYPES
from edr.schema import BENEFICIARY_FIELDS, FIDUCIARY_FIELDS
from edr.textnorm import normalize, same_person, tokens

RECONCILE_VERSION = "1"
DISCLAIMER = "Not a substitute for the advice of an attorney."
RULE_PACK_STATUS = "no Texas rule pack loaded; no statute or case cited (unverified)"
ATTORNEY = "Refer to an estate attorney about the effect on the plan."


# ---------------------------------------------------------------- loading

def load_records(path):
    """Extraction records from a directory of *.json or one file. Records with an error are kept
    so the report can list them as coverage gaps."""
    path = Path(path)
    files = sorted(path.glob("*.json")) if path.is_dir() else [path]
    records = []
    for f in files:
        data = json.loads(f.read_text(encoding="utf-8"))
        if isinstance(data, dict) and "document" in data:
            records.append(data)
    return records


def load_inputs(path):
    path = Path(path)
    questionnaire = yaml.safe_load((path / "questionnaire.yaml").read_text(encoding="utf-8")) or {}
    assets_file = path / "assets.yaml"
    assets = (yaml.safe_load(assets_file.read_text(encoding="utf-8")) or {}) if assets_file.exists() else {}
    return questionnaire, assets


class Facts:
    """Verified facts indexed for the rules; unverified facts are tallied, never indexed."""

    def __init__(self, records):
        self.by_doc = {}
        self.doc_type = {}
        self.source = {}
        self.unverified = []
        self.gaps = []
        for record in records:
            doc = record["document"]["id"]
            self.source[doc] = record["document"].get("source")
            self.doc_type[doc] = record.get("document_type")
            if record.get("error"):
                self.gaps.append({"document": doc, "reason": record["error"].get("message", "extraction error")})
            for warning in record.get("warnings", []):
                self.gaps.append({"document": doc, "reason": warning})
            for page in record.get("unreadable_pages", []):
                self.gaps.append({"document": doc, "reason": f"page {page} reported unreadable"})
            for fact in record.get("facts", []):
                verification = fact.get("verification", {})
                if verification.get("status") == "verified":
                    self.by_doc.setdefault(doc, []).append(fact)
                else:
                    self.unverified.append({"document": doc, "field": fact.get("field"), "value": fact.get("value"),
                                            "reason": verification.get("reason", "not verified")})

    def of(self, fields, doc_types=None):
        """(doc_id, fact) pairs for the given fields, in a stable order."""
        out = []
        for doc in sorted(self.by_doc):
            if doc_types and self.doc_type.get(doc) not in doc_types:
                continue
            out.extend((doc, f) for f in self.by_doc[doc] if f["field"] in fields)
        return out

    def all(self):
        return [(doc, f) for doc in sorted(self.by_doc) for f in self.by_doc[doc]]


def doc_evidence(doc, fact):
    return {"source": "document", "doc": doc, "page": fact["page"], "field": fact["field"],
            "quote": fact["quote"], "verification": fact["verification"]["method"]}


def jsonable(value):
    """YAML parses dates into date objects; findings are written as JSON."""
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [jsonable(v) for v in value]
    return value


def q_evidence(path, value):
    return {"source": "questionnaire", "path": path, "value": jsonable(value)}


def as_date(value):
    if isinstance(value, date):
        return value
    return parse_iso(value) if value else None


# ---------------------------------------------------------------- context

class Context:
    def __init__(self, facts, questionnaire, assets):
        self.facts = facts
        self.q = questionnaire
        self.assets = (assets or {}).get("assets") or []
        self.people = questionnaire.get("people") or []
        self.marriages = questionnaire.get("marriages") or []
        self.client = (questionnaire.get("client") or {}).get("name", "")

    def governed(self, doc):
        return [a for a in self.assets if a.get("governing_document") == doc]

    def amount(self, assets):
        total = sum(a.get("value_usd") or 0 for a in assets)
        return total or None

    def deceased(self):
        return [(i, p) for i, p in enumerate(self.people) if p.get("status") == "deceased"]

    def former_spouses(self):
        return [(i, m) for i, m in enumerate(self.marriages) if m.get("how_ended") == "divorce"]

    def current_marriage(self):
        for i, m in enumerate(self.marriages):
            if not m.get("ended"):
                return i, m
        return None, None


def finding(issue_type, doc_ids, people, assets, observation, evidence, uncertainty, next_question):
    return {
        "issue_type": issue_type,
        "status": ISSUE_TYPES[issue_type]["status"],
        "documents": sorted(set(doc_ids)),
        "people": list(people),
        "assets": [a["id"] for a in assets],
        "amount_at_stake_usd": sum(a.get("value_usd") or 0 for a in assets) or None,
        "amount_is_hypothetical": True,
        "observation": observation,
        "evidence": evidence,
        "uncertainty": uncertainty,
        "next_question": next_question,
        "rule_refs": [],
        "disclaimer": DISCLAIMER,
    }


# ---------------------------------------------------------------- rules

def rule_former_spouse(ctx):
    out = []
    for doc, fact in ctx.facts.of(BENEFICIARY_FIELDS, {"beneficiary_designation"}):
        for i, m in ctx.former_spouses():
            if not same_person(fact["value"], m.get("spouse", "")):
                continue
            assets = ctx.governed(doc)
            amount = ctx.amount(assets)
            what = f"${amount:,.0f} (hypothetical)" if amount else "an amount not stated in the asset inventory"
            out.append(finding(
                "former_spouse_beneficiary", [doc], [fact["value"]], assets,
                f"{doc} names {fact['value']} (p.{fact['page']}). The questionnaire reports a divorce "
                f"from {m['spouse']} ({jsonable(m.get('ended'))}). {what} passes to a former spouse under this "
                f"designation unless it is intended.",
                [doc_evidence(doc, fact), q_evidence(f"marriages[{i}]", m)],
                "The designation on file may differ from the copy provided, and the client may intend it. "
                "Whether the designation still controls is a legal question this tool does not answer.",
                "Confirm the designation on file with the plan administrator, ask the client whether "
                "it is intended, and refer to an estate attorney about its effect on the trust and will."))
    return out


def rule_deceased(ctx):
    out = []
    people = {i: p for i, p in ctx.deceased()}
    if not people:
        return out
    for doc, fact in ctx.facts.of(FIDUCIARY_FIELDS | BENEFICIARY_FIELDS):
        for i, p in people.items():
            if not same_person(fact["value"], p.get("name", "")):
                continue
            is_fiduciary = fact["field"] in FIDUCIARY_FIELDS
            issue = "deceased_fiduciary" if is_fiduciary else "deceased_beneficiary"
            role = fact["field"].replace("_", " ")
            assets = [] if is_fiduciary else ctx.governed(doc)
            out.append(finding(
                issue, [doc], [p["name"]], assets,
                f"{doc} names {p['name']} as {role} (p.{fact['page']}). The questionnaire lists "
                f"{p['name']} as deceased.",
                [doc_evidence(doc, fact), q_evidence(f"people[{i}]", p)],
                "The documents may name a successor or alternate this tool did not extract, and the "
                "questionnaire may be out of date.",
                f"Ask the client who should serve or receive in place of {p['name']}, and refer to an "
                f"estate attorney about how the document handles a deceased {'appointee' if is_fiduciary else 'beneficiary'}."))
    return out


def rule_predates_marriage(ctx):
    _, marriage = ctx.current_marriage()
    married = as_date(marriage.get("married")) if marriage else None
    if not married:
        return []
    out = []
    for doc, fact in ctx.facts.of({"document_date"}, {"will", "revocable_trust"}):
        signed = as_date(fact["value"])
        if not signed or signed >= married:
            continue
        out.append(finding(
            "document_predates_marriage", [doc], [marriage.get("spouse", "")], [],
            f"{doc} is dated {fact['value']} (p.{fact['page']}), before the current marriage to "
            f"{marriage.get('spouse')} on {jsonable(marriage.get('married'))}.",
            [doc_evidence(doc, fact), q_evidence("marriages (current)", marriage)],
            "A document dated before the marriage may still reflect the client's wishes. Its age alone "
            "is not a finding; the date relative to the marriage is the observation.",
            "Ask the client whether the plan was reviewed after the marriage, and refer to an estate "
            "attorney about how the marriage interacts with this document."))
    return out


def trust_names(ctx):
    names = {f["value"] for _, f in ctx.facts.of({"trust_name", "pour_over"})}
    return {n for n in names if n}


def references_trust(owner, names):
    owner_norm = normalize(owner)
    return any(normalize(n) in owner_norm or set(tokens(n)) <= set(tokens(owner)) for n in names)


def rule_asset_outside_trust(ctx):
    names = trust_names(ctx)
    if not names:
        return []
    out = []
    for doc, fact in ctx.facts.of({"titled_owner"}, {"titling_record"}):
        if references_trust(fact["value"], names):
            continue
        assets = ctx.governed(doc)
        if not assets:
            continue
        out.append(finding(
            "asset_outside_trust", [doc], [fact["value"]], assets,
            f"{doc} registers the account to {fact['value']} (p.{fact['page']}), which does not "
            f"reference the trust named elsewhere in the documents ({', '.join(sorted(names))}).",
            [doc_evidence(doc, fact)],
            "The asset may be intentionally held outside the trust, or the registration on file may "
            "differ from this record.",
            "Confirm the registration with the custodian, ask the client whether the asset is meant to "
            "be in the trust, and refer to an estate attorney about how it will pass."))
    return out


def rule_intent_mismatch(ctx):
    named = [f["value"] for _, f in ctx.facts.of(BENEFICIARY_FIELDS | {"spouse_named", "child_named"})]
    if not named:
        return []
    out = []
    for i, want in enumerate(ctx.q.get("intended_beneficiaries") or []):
        if any(same_person(want.get("name", ""), n) for n in named):
            continue
        out.append(finding(
            "intent_mismatch", [], [want["name"]], [],
            f"The questionnaire names {want['name']} (share: {want.get('share')}) as an intended "
            f"beneficiary. No verified document names this person.",
            [q_evidence(f"intended_beneficiaries[{i}]", want)],
            "A document may benefit this person as part of a class (for example \"my children\") that "
            "names no one, and a fact that failed verification is not counted here.",
            f"Ask the client how {want['name']} is meant to receive assets, and refer to an estate "
            f"attorney if no document provides for them."))
    return out


def rule_undated_amendment(ctx):
    out = []
    for doc, fact in ctx.facts.of({"document_date"}, {"trust_amendment"}):
        if fact["value"].strip():
            continue
        out.append(finding(
            "undated_amendment", [doc], [], [],
            f"The date line of {doc} is blank (p.{fact['page']}). Its order relative to the trust and "
            f"other documents cannot be established from the documents.",
            [doc_evidence(doc, fact)],
            "Unresolved: the documents do not say which came first, so the tool does not choose. A dated "
            "copy may exist elsewhere.",
            "Ask the client for a dated or signed copy, and refer to an estate attorney about the order "
            "of the documents."))
    return out


RULES = [rule_former_spouse, rule_deceased, rule_predates_marriage, rule_asset_outside_trust,
         rule_intent_mismatch, rule_undated_amendment]


# ---------------------------------------------------------------- driver

def dedupe(findings):
    seen, out = set(), []
    for f in findings:
        key = (f["issue_type"], tuple(f["documents"]), tuple(normalize(p) for p in f["people"]))
        if key not in seen:
            seen.add(key)
            out.append(f)
    return out


def order(findings):
    rank = {"flagged": 0, "unresolved": 1}
    return sorted(findings, key=lambda f: (rank[f["status"]], -(f["amount_at_stake_usd"] or 0),
                                           f["issue_type"], f["documents"], f["people"]))


def reconcile(records, questionnaire, assets):
    facts = Facts(records)
    ctx = Context(facts, questionnaire, assets)
    found = []
    for rule in RULES:
        found.extend(rule(ctx))
    findings = order(dedupe(found))
    for n, f in enumerate(findings, 1):
        f["id"] = f"F{n:02d}"
    total = sum(f["amount_at_stake_usd"] or 0 for f in findings if f["status"] == "flagged")
    people_in_docs = {f["value"] for _, f in facts.of({"beneficiary", "primary_beneficiary", "contingent_beneficiary",
                                                       "executor", "alternate_executor", "trustee",
                                                       "successor_trustee", "guardian"})}
    known = ctx.people + [{"name": ctx.client}] + [{"name": m.get("spouse", "")} for m in ctx.marriages]
    not_in_questionnaire = sorted(p for p in people_in_docs if not any(same_person(p, k.get("name", "")) for k in known))
    return {
        "reconcile_version": RECONCILE_VERSION,
        "synthetic": True,
        "values_are_hypothetical": True,
        "rule_pack_status": RULE_PACK_STATUS,
        "disclaimer": DISCLAIMER,
        "client": ctx.client,
        "findings": findings,
        "summary": {
            "findings": len(findings),
            "flagged": sum(f["status"] == "flagged" for f in findings),
            "unresolved": sum(f["status"] == "unresolved" for f in findings),
            "amount_at_stake_flagged_usd": total or None,
            "documents": sorted(facts.source),
            "verified_facts": sum(len(v) for v in facts.by_doc.values()),
            "unverified_facts_excluded": len(facts.unverified),
        },
        "coverage": {
            "gaps": facts.gaps,
            "unverified_facts": facts.unverified,
            "people_named_in_documents_but_not_in_questionnaire": not_in_questionnaire,
            "document_types_in_questionnaire_but_not_provided": sorted(
                set(questionnaire.get("documents_available") or []) - set(facts.doc_type.values())),
        },
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--facts", required=True, help="directory (or file) of verified extraction records")
    ap.add_argument("--inputs", required=True, help="directory with questionnaire.yaml and assets.yaml")
    ap.add_argument("--out", required=True, help="findings JSON to write")
    args = ap.parse_args(argv)
    records = load_records(args.facts)
    if not records:
        print(f"no extraction records found in {args.facts}", file=sys.stderr)
        return 2
    questionnaire, assets = load_inputs(args.inputs)
    result = reconcile(records, questionnaire, assets)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    s = result["summary"]
    print(f"{s['findings']} findings ({s['flagged']} flagged, {s['unresolved']} unresolved); "
          f"{s['verified_facts']} verified facts used, {s['unverified_facts_excluded']} unverified excluded.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
