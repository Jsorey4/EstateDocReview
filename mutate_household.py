#!/usr/bin/env python3
"""Mutation script: build Household A variants from the clean, user-authored Household B.

Each mutation plants exactly one issue, and the script writes each variant's answer key from
the mutations it applied, so no model ever writes an answer key (CLAUDE.md, Test data).
The expected facts in each key come from the gold facts you wrote in household.yaml, updated
for the mutation.

Output layout (the product reads only input/; answer_key.json is for run_eval.py):
  <out>/index.json
  <out>/B_clean/input/{docs/, questionnaire.yaml, assets.yaml}    zero expected issues
  <out>/B_clean/answer_key.json
  <out>/A01_<mutation>__<target>/input/...                        one planted issue each
  <out>/A01_<mutation>__<target>/answer_key.json

Usage:
  python mutate_household.py households/B --check                      # validate, list targets
  python mutate_household.py households/B --out households/variants    # one variant per target
  python mutate_household.py households/B --out households/variants --plan households/plan.yaml --force
"""
import argparse
import copy
import hashlib
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

import yaml

from edr.dates import one_year_before, parse_iso, replace_single_date, single_date_span
from edr.household import HouseholdError, as_date, is_institution, load_household, locate
from edr.issues import ISSUE_TYPES
from edr.schema import BENEFICIARY_FIELDS, FIDUCIARY_FIELDS
from edr.textnorm import match_case, normalize, same_person

SCRIPT_VERSION = "1"
GENERATED_BY = "mutate_household.py"
BLANK_DATE = "_" * 15


class MutationError(Exception):
    pass


class State:
    """One variant under construction: mutated copies of the product inputs and gold facts."""

    def __init__(self, hh):
        self.hh = hh
        self.docs = {doc_id: doc.text for doc_id, doc in hh.docs.items()}
        self.questionnaire = copy.deepcopy(hh.questionnaire)
        self.facts = {f["id"]: dict(f) for f in hh.facts}

    def page_of(self, fact_id):
        fact = self.facts[fact_id]
        return locate(self.docs[fact["doc"]], fact)[1]

    def replace_target(self, fact_id, new_target):
        """Replace a gold fact's target text inside its anchor; return the change record."""
        fact = self.facts[fact_id]
        text = self.docs[fact["doc"]]
        start, page = locate(text, fact)
        end = start + len(fact["target"])
        offset = fact["anchor"].find(fact["target"])
        new_anchor = fact["anchor"][:offset] + new_target + fact["anchor"][offset + len(fact["target"]):]
        new_text = text[:start] + new_target + text[end:]
        if new_text.count(new_anchor) != 1:
            raise MutationError(f"after mutation the anchor of {fact_id} is not unique in {fact['doc']}; "
                                f"make the anchor longer in household.yaml")
        change = {"file": self.hh.docs[fact["doc"]].file, "doc": fact["doc"], "page": page,
                  "fact_id": fact_id, "before": fact["anchor"], "after": new_anchor}
        self.docs[fact["doc"]] = new_text
        fact["anchor"], fact["target"] = new_anchor, new_target
        return change

    def doc_evidence(self, fact_id):
        fact = self.facts[fact_id]
        return {"source": "document", "doc": fact["doc"], "page": self.page_of(fact_id),
                "fact_id": fact_id, "field": fact["field"], "text": fact["anchor"]}


def q_evidence(path, value):
    return {"source": "questionnaire", "path": path, "value": copy.deepcopy(value)}


def make_issue(hh, issue_type, documents, evidence, people=(), asset_ids=()):
    assets = [a for a in hh.assets["assets"] if a["id"] in set(asset_ids)]
    return {
        "issue_type": issue_type,
        "expected_status": ISSUE_TYPES[issue_type]["status"],
        "summary": ISSUE_TYPES[issue_type]["summary"],
        "documents": list(documents),
        "people": list(people),
        "assets": [a["id"] for a in assets],
        "amount_at_stake_usd": sum(a["value_usd"] for a in assets) if assets else None,
        "evidence": evidence,
    }


class Mutation:
    type = ""
    issue_type = ""
    description = ""

    def candidates(self, hh, explicit=False):
        raise NotImplementedError

    def apply(self, state, target):
        """Return (changes, issues)."""
        raise NotImplementedError


class FormerSpouseDesignation(Mutation):
    type = "former_spouse_designation"
    issue_type = "former_spouse_beneficiary"
    description = "Replace the current spouse with the most recently divorced former spouse as primary beneficiary on a beneficiary designation."

    def candidates(self, hh, explicit=False):
        _, marriage = hh.current_marriage()
        if not marriage or not hh.former_spouses():
            return []
        return [f["id"] for f in hh.facts
                if f["field"] == "primary_beneficiary" and hh.docs[f["doc"]].type == "beneficiary_designation"
                and same_person(f["target"], marriage["spouse"])]

    def apply(self, state, target):
        hh = state.hh
        index, former = hh.former_spouses()[-1]
        fact = state.facts[target]
        new_name = match_case(fact["target"], former["spouse"])
        changes = [state.replace_target(target, new_name)]
        fact["value"] = new_name
        assets = [a["id"] for a in hh.assets_governed_by(fact["doc"])]
        evidence = [state.doc_evidence(target), q_evidence(f"marriages[{index}]", former)]
        return changes, [make_issue(hh, self.issue_type, [fact["doc"]], evidence, [former["spouse"]], assets)]


class DeceasedFiduciary(Mutation):
    type = "deceased_fiduciary"
    issue_type = "deceased_fiduciary"
    description = "Report in the questionnaire that a person named as executor, trustee or guardian has died."

    def candidates(self, hh, explicit=False):
        _, marriage = hh.current_marriage()
        excluded = [hh.client_name] + ([marriage["spouse"]] if marriage else [])
        names = []
        for f in hh.facts:
            name = f["value"]
            if f["field"] not in FIDUCIARY_FIELDS or not name or is_institution(name):
                continue
            if any(same_person(name, x) for x in excluded + names):
                continue
            index = hh.person_index(name)
            if index is not None:
                person = hh.questionnaire["people"][index]
                if person.get("status") == "deceased":
                    continue
                name = person["name"]
            if not any(same_person(name, x) for x in names):
                names.append(name)
        return names

    def apply(self, state, target):
        hh = state.hh
        people = state.questionnaire.setdefault("people", [])
        index = hh.person_index(target, people)
        if index is None:
            before = None
            people.append({"name": target, "relationship": "not stated", "status": "deceased", "date_of_death": None})
            index = len(people) - 1
        else:
            before = copy.deepcopy(people[index])
            people[index]["status"] = "deceased"
            people[index].setdefault("date_of_death", None)
        changes = [{"file": "questionnaire.yaml", "path": f"people[{index}]", "before": before,
                    "after": copy.deepcopy(people[index])}]
        issues = []
        for fact_id, fact in state.facts.items():
            if not same_person(fact["value"], target):
                continue
            if fact["field"] in FIDUCIARY_FIELDS:
                issue_type, assets = "deceased_fiduciary", []
            elif fact["field"] in BENEFICIARY_FIELDS:
                issue_type = "deceased_beneficiary"
                assets = [a["id"] for a in hh.assets_governed_by(fact["doc"])]
            else:
                continue
            evidence = [state.doc_evidence(fact_id), q_evidence(f"people[{index}]", people[index])]
            issues.append(make_issue(hh, issue_type, [fact["doc"]], evidence, [target], assets))
        return changes, issues


class PredatesMarriage(Mutation):
    type = "predates_marriage"
    issue_type = "document_predates_marriage"
    description = "Move a will's date to one year before the current marriage, keeping the document's date style."
    # A trust's date is often repeated in other documents ("Trust dated ..."), so moving it would
    # plant a second, unlisted inconsistency. Only wills are targeted automatically; a plan file
    # may name a trust date explicitly.
    auto_types = ("will",)
    explicit_types = ("will", "revocable_trust")

    def candidates(self, hh, explicit=False):
        _, marriage = hh.current_marriage()
        married = as_date(marriage.get("married")) if marriage else None
        if not married:
            return []
        types = self.explicit_types if explicit else self.auto_types
        return [f["id"] for f in hh.facts
                if f["field"] == "document_date" and hh.docs[f["doc"]].type in types
                and parse_iso(f["value"]) and parse_iso(f["value"]) >= married]

    def apply(self, state, target):
        hh = state.hh
        index, marriage = hh.current_marriage()
        new_date = one_year_before(as_date(marriage["married"]))
        fact = state.facts[target]
        try:
            new_target = replace_single_date(fact["target"], new_date)
        except ValueError as exc:
            raise MutationError(f"{target}: {exc}") from exc
        changes = [state.replace_target(target, new_target)]
        if hh.docs[fact["doc"]].type != "will":
            changes[0]["warning"] = "check other documents that repeat this date; they were not changed"
        fact["value"] = new_date.isoformat()
        evidence = [state.doc_evidence(target), q_evidence(f"marriages[{index}]", marriage)]
        return changes, [make_issue(hh, self.issue_type, [fact["doc"]], evidence, [marriage["spouse"]])]


class RetitleOutsideTrust(Mutation):
    type = "retitle_outside_trust"
    issue_type = "asset_outside_trust"
    description = "Change a titling record's registration from the trust to the client individually."

    def candidates(self, hh, explicit=False):
        return [f["id"] for f in hh.facts
                if f["field"] == "titled_owner" and hh.docs[f["doc"]].type == "titling_record"
                and "trust" in normalize(f["target"])]

    def apply(self, state, target):
        hh = state.hh
        fact = state.facts[target]
        new_owner = match_case(fact["target"], hh.client_name)
        changes = [state.replace_target(target, new_owner)]
        fact["value"] = new_owner
        assets = [a["id"] for a in hh.assets_governed_by(fact["doc"])]
        documents = [fact["doc"]] + hh.docs_of_type("revocable_trust")
        return changes, [make_issue(hh, self.issue_type, documents, [state.doc_evidence(target)], [], assets)]


class AddIntendedBeneficiary(Mutation):
    type = "add_intended_beneficiary"
    issue_type = "intent_mismatch"
    description = "Add to the questionnaire's intended beneficiaries a living person whom no document names as beneficiary."

    def candidates(self, hh, explicit=False):
        q = hh.questionnaire
        intended = [b.get("name", "") for b in q.get("intended_beneficiaries") or []]
        named = [f["value"] for f in hh.facts if f["field"] in BENEFICIARY_FIELDS]
        return [p["name"] for p in q.get("people") or []
                if p.get("status") == "living" and not same_person(p["name"], hh.client_name)
                and not any(same_person(p["name"], x) for x in intended + named)]

    def apply(self, state, target):
        intended = state.questionnaire.setdefault("intended_beneficiaries", [])
        entry = {"name": target, "share": "not stated"}
        intended.append(entry)
        path = f"intended_beneficiaries[{len(intended) - 1}]"
        changes = [{"file": "questionnaire.yaml", "path": path, "before": None, "after": dict(entry)}]
        return changes, [make_issue(state.hh, self.issue_type, [], [q_evidence(path, entry)], [target])]


class BlankAmendmentDate(Mutation):
    type = "blank_amendment_date"
    issue_type = "undated_amendment"
    description = "Blank out a trust amendment's date line, leaving its order relative to the other documents unknown."

    def candidates(self, hh, explicit=False):
        return [f["id"] for f in hh.facts
                if f["field"] == "document_date" and hh.docs[f["doc"]].type == "trust_amendment" and f["value"]]

    def apply(self, state, target):
        hh = state.hh
        fact = state.facts[target]
        try:
            start, end = single_date_span(fact["target"])
        except ValueError as exc:
            raise MutationError(f"{target}: {exc}") from exc
        changes = [state.replace_target(target, fact["target"][:start] + BLANK_DATE + fact["target"][end:])]
        fact["value"] = ""
        documents = [fact["doc"]] + hh.docs_of_type("revocable_trust")
        return changes, [make_issue(hh, self.issue_type, documents, [state.doc_evidence(target)])]


MUTATIONS = {m.type: m for m in (FormerSpouseDesignation(), DeceasedFiduciary(), PredatesMarriage(),
                                 RetitleOutsideTrust(), AddIntendedBeneficiary(), BlankAmendmentDate())}


def slug(text):
    return re.sub(r"[^a-z0-9]+", "_", normalize(text)).strip("_")[:40]


def auto_plan(hh):
    plan = [{"id": "B_clean", "description": "Clean household: no mutations; zero expected issues.", "mutations": []}]
    number = 1
    for mutation in MUTATIONS.values():
        for target in mutation.candidates(hh):
            plan.append({"id": f"A{number:02d}_{mutation.type}__{slug(target)}",
                         "description": f"{mutation.description} Target: {target}.",
                         "mutations": [{"type": mutation.type, "target": target}]})
            number += 1
    return plan


def load_plan(path):
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
    variants = data.get("variants")
    if not isinstance(variants, list) or not variants:
        raise MutationError(f"{path}: expected a non-empty 'variants' list")
    for v in variants:
        if not v.get("id") or not re.fullmatch(r"[A-Za-z0-9_\-]+", str(v["id"])):
            raise MutationError(f"{path}: every variant needs an id of letters, digits, _ or -")
        if not isinstance(v.get("mutations"), list):
            raise MutationError(f"{path}: variant {v['id']} needs a 'mutations' list")
    return variants


def build_variant(hh, spec, base_hash):
    state = State(hh)
    applied, issues, touched = [], [], set()
    for index, m in enumerate(spec["mutations"]):
        mutation = MUTATIONS.get(m.get("type"))
        if mutation is None:
            raise MutationError(f"{spec['id']}: unknown mutation type {m.get('type')!r}; known: {sorted(MUTATIONS)}")
        target = m.get("target")
        valid = mutation.candidates(hh, explicit=True)
        if target not in valid:
            raise MutationError(f"{spec['id']}: {target!r} is not a valid target for {mutation.type}; valid: {valid}")
        if any(target == t or same_person(target, t) for t in touched):
            raise MutationError(f"{spec['id']}: two mutations touch {target!r}")
        touched.add(target)
        changes, new_issues = mutation.apply(state, target)
        applied.append({"index": index, "type": mutation.type, "target": target,
                        "issue_type": mutation.issue_type, "changes": changes})
        for issue in new_issues:
            issue["mutation_index"] = index
        issues += new_issues
    for number, issue in enumerate(issues, 1):
        issue["id"] = f"I{number}"
    asset_values = {a["id"]: a["value_usd"] for a in hh.assets["assets"]}
    at_stake = sorted({a for issue in issues for a in issue["assets"]})
    expected_facts = [{"id": f["id"], "doc": f["doc"], "field": f["field"], "value": f["value"],
                       "page": state.page_of(f["id"])} for f in state.facts.values()]
    key = {
        "synthetic": True,
        "values_are_hypothetical": True,
        "generated_by": GENERATED_BY,
        "script_version": SCRIPT_VERSION,
        "household": hh.manifest["household_id"],
        "base_hash": base_hash,
        "variant": spec["id"],
        "description": spec.get("description", ""),
        "mutations": applied,
        "expected_issue_count": len(issues),
        "expected_issues": issues,
        "amount_at_stake_total_usd": sum(asset_values[a] for a in at_stake) if at_stake else None,
        "expected_facts": expected_facts,
        "notes": ("Expected issues come from the mutations this script applied. Expected facts come "
                  "from the user-authored gold facts in household.yaml, updated for the mutations. "
                  "A material finding not listed here counts as a false alarm. Dollar amounts are "
                  "hypothetical."),
    }
    return state, key


def household_hash(hh):
    digest = hashlib.sha256()
    files = ["household.yaml", "questionnaire.yaml", "assets.yaml"] + sorted(d.file for d in hh.docs.values())
    for rel in files:
        digest.update(rel.encode() + b"\0" + (hh.root / rel).read_bytes() + b"\0")
    return digest.hexdigest()


def write_variant(hh, state, key, out):
    inp = out / key["variant"] / "input"
    for doc_id, doc in hh.docs.items():
        dest = inp / doc.file
        dest.parent.mkdir(parents=True, exist_ok=True)
        if state.docs[doc_id] == doc.text:
            shutil.copyfile(hh.root / doc.file, dest)
        else:
            with open(dest, "w", encoding="utf-8", newline="") as f:
                f.write(state.docs[doc_id])
    if state.questionnaire == hh.questionnaire:
        shutil.copyfile(hh.root / "questionnaire.yaml", inp / "questionnaire.yaml")
    else:
        header = (f"# SYNTHETIC. Written by {GENERATED_BY} for variant {key['variant']} from "
                  f"{hh.manifest['household_id']}/questionnaire.yaml.\n")
        body = yaml.safe_dump(state.questionnaire, sort_keys=False, allow_unicode=True)
        (inp / "questionnaire.yaml").write_text(header + body, encoding="utf-8")
    shutil.copyfile(hh.root / "assets.yaml", inp / "assets.yaml")
    (out / key["variant"] / "answer_key.json").write_text(
        json.dumps(key, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8")


def prepare_out(out, hh_root, force):
    out, hh_root = out.resolve(), hh_root.resolve()
    if out == hh_root or out in hh_root.parents:
        raise MutationError("--out must not be the household directory or one of its parents")
    if out.exists() and any(out.iterdir()):
        index = out / "index.json"
        generated = index.exists() and json.loads(index.read_text(encoding="utf-8")).get("generated_by") == GENERATED_BY
        if not force:
            raise MutationError(f"{out} is not empty; pass --force to replace a previous run")
        if not generated:
            raise MutationError(f"refusing to delete {out}: it has no index.json written by {GENERATED_BY}")
        shutil.rmtree(out)
    out.mkdir(parents=True, exist_ok=True)


def print_check(hh):
    print(f"Household {hh.manifest['household_id']}: {len(hh.docs)} documents, {len(hh.facts)} gold facts, "
          f"{len(hh.assets['assets'])} assets.")
    for warning in hh.warnings:
        print(f"  WARNING (clean household would produce a finding): {warning}")
    for mutation in MUTATIONS.values():
        targets = mutation.candidates(hh)
        print(f"  {mutation.type}: {len(targets)} target(s) {targets if targets else ''}")


def main(argv=None):
    ap = argparse.ArgumentParser(description="Plant one issue per mutation in copies of a clean household and write answer keys.")
    ap.add_argument("household", help="clean household directory, e.g. households/B")
    ap.add_argument("--out", help="output directory for the variants")
    ap.add_argument("--plan", help="YAML file of extra variants (several mutations each)")
    ap.add_argument("--no-auto", action="store_true", help="skip the automatic one-mutation variants")
    ap.add_argument("--force", action="store_true", help="replace a previous run in --out")
    ap.add_argument("--check", action="store_true", help="validate the household and list mutation targets; write nothing")
    args = ap.parse_args(argv)
    try:
        hh = load_household(args.household)
    except HouseholdError as exc:
        print(exc, file=sys.stderr)
        return 2
    print_check(hh)
    if args.check:
        return 0
    if not args.out:
        ap.error("--out is required unless --check is given")
    try:
        plan = [] if args.no_auto else auto_plan(hh)
        if args.plan:
            plan += load_plan(args.plan)
        ids = [v["id"] for v in plan]
        if len(set(ids)) != len(ids):
            raise MutationError(f"duplicate variant ids: {sorted({i for i in ids if ids.count(i) > 1})}")
        base_hash = household_hash(hh)
        built = [build_variant(hh, spec, base_hash) for spec in plan]
        out = Path(args.out)
        prepare_out(out, hh.root, args.force)
    except MutationError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    for state, key in built:
        write_variant(hh, state, key, out)
    index = {
        "synthetic": True, "generated_by": GENERATED_BY, "script_version": SCRIPT_VERSION,
        "household": hh.manifest["household_id"], "base_hash": base_hash,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "warnings": hh.warnings,
        "variants": [{"id": key["variant"], "mutations": [m["type"] for m in key["mutations"]],
                      "expected_issue_count": key["expected_issue_count"],
                      "amount_at_stake_total_usd": key["amount_at_stake_total_usd"]} for _, key in built],
    }
    (out / "index.json").write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(built)} variants to {out} "
          f"({sum(k['expected_issue_count'] for _, k in built)} expected issues in total).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
