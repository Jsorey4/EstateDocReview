"""Load and validate a household directory (the reconciliation test set; see households/README.md).

households/<id>/
  household.yaml      ground truth for mutate_household.py and run_eval.py; never a product input
  questionnaire.yaml  product input: the client's answers
  assets.yaml         product input: the asset inventory (hypothetical values)
  docs/*.txt|*.md     product input: the documents, pages separated by "--- page break ---"

load_household() collects every problem before raising, so one run shows the author everything
to fix. Warnings flag things that would make the clean household produce a finding.
"""
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path, PurePosixPath

import yaml

from edr.dates import find_dates, parse_iso
from edr.pages import TEXT_SUFFIXES, page_of_offset, page_spans, read_text
from edr.schema import BENEFICIARY_FIELDS, DATE_FIELDS, DOCUMENT_TYPES, FIDUCIARY_FIELDS, FIELDS, PERSON_FIELDS
from edr.textnorm import normalize, same_person, tokens

SOURCES = {"digital", "scanned"}
STATUSES = {"living", "deceased"}
MARRIAGE_ENDINGS = {"divorce", "death"}
CHARACTERS = {"community", "separate", "unknown"}
INSTITUTION_WORDS = {"bank", "trust", "company", "inc", "llc", "corporation", "association", "estate"}


class HouseholdError(Exception):
    def __init__(self, problems):
        super().__init__("household is not valid:\n- " + "\n- ".join(problems))
        self.problems = problems


@dataclass
class Document:
    id: str
    type: str
    file: str
    source: str
    text: str


@dataclass
class Household:
    root: Path
    manifest: dict
    questionnaire: dict
    assets: dict
    docs: dict
    facts: list
    warnings: list = field(default_factory=list)

    @property
    def client_name(self):
        return self.questionnaire["client"]["name"]

    def current_marriage(self):
        """(index, marriage) for the marriage with no end date, or (None, None)."""
        for i, m in enumerate(self.questionnaire.get("marriages") or []):
            if not m.get("ended"):
                return i, m
        return None, None

    def former_spouses(self):
        """(index, marriage) pairs ended by divorce, oldest divorce first."""
        found = [(i, m) for i, m in enumerate(self.questionnaire.get("marriages") or [])
                 if m.get("how_ended") == "divorce"]
        return sorted(found, key=lambda pair: as_date(pair[1].get("ended")) or date.min)

    def person_index(self, name, people=None):
        people = self.questionnaire.get("people") or [] if people is None else people
        return next((i for i, p in enumerate(people) if same_person(p.get("name", ""), name)), None)

    def assets_governed_by(self, doc_id):
        return [a for a in self.assets["assets"] if a.get("governing_document") == doc_id]

    def docs_of_type(self, *types):
        return [d.id for d in self.docs.values() if d.type in types]


def as_date(value):
    if isinstance(value, date):
        return value
    return parse_iso(str(value)) if value else None


def is_institution(name):
    return bool(INSTITUTION_WORDS & set(tokens(name)))


def locate(text, fact):
    """(target_start, page) of a fact's target inside its anchor in text. Raises ValueError
    unless the anchor occurs exactly once."""
    count = text.count(fact["anchor"])
    if count != 1:
        raise ValueError(f"anchor occurs {count} times (must be exactly once): {fact['anchor']!r}")
    start = text.find(fact["anchor"]) + fact["anchor"].find(fact["target"])
    return start, page_of_offset(page_spans(text), start)


def _load_yaml(path, problems):
    if not path.exists():
        problems.append(f"missing {path.name}")
        return {}
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as exc:
        problems.append(f"{path.name}: not valid YAML ({exc})")
        return {}
    if not isinstance(data, dict):
        problems.append(f"{path.name}: top level must be a mapping")
        return {}
    if data.get("synthetic") is not True:
        problems.append(f"{path.name}: must contain 'synthetic: true' (CLAUDE.md rule 1)")
    return data


def _check_questionnaire(q, problems):
    client = q.get("client") or {}
    if not client.get("name"):
        problems.append("questionnaire.yaml: client.name is required")
    if client.get("state") != "TX":
        problems.append("questionnaire.yaml: client.state must be TX (Texas only)")
    for key in ("marriages", "people", "intended_beneficiaries"):
        if not isinstance(q.get(key) or [], list):
            problems.append(f"questionnaire.yaml: {key} must be a list")
    for i, m in enumerate(q.get("marriages") or []):
        where = f"questionnaire.yaml: marriages[{i}]"
        if not m.get("spouse"):
            problems.append(f"{where}.spouse is required")
        if not as_date(m.get("married")):
            problems.append(f"{where}.married must be a YYYY-MM-DD date")
        if m.get("ended") and not as_date(m.get("ended")):
            problems.append(f"{where}.ended must be a YYYY-MM-DD date or null")
        if bool(m.get("ended")) != bool(m.get("how_ended")):
            problems.append(f"{where}: set both ended and how_ended, or neither")
        if m.get("how_ended") and m["how_ended"] not in MARRIAGE_ENDINGS:
            problems.append(f"{where}.how_ended must be one of {sorted(MARRIAGE_ENDINGS)}")
    if sum(1 for m in q.get("marriages") or [] if not m.get("ended")) > 1:
        problems.append("questionnaire.yaml: at most one marriage can be current (no end date)")
    for i, p in enumerate(q.get("people") or []):
        if not p.get("name"):
            problems.append(f"questionnaire.yaml: people[{i}].name is required")
        if p.get("status") not in STATUSES:
            problems.append(f"questionnaire.yaml: people[{i}].status must be living or deceased")
    for i, b in enumerate(q.get("intended_beneficiaries") or []):
        if not b.get("name"):
            problems.append(f"questionnaire.yaml: intended_beneficiaries[{i}].name is required")


def _check_assets(assets, doc_ids, problems):
    if assets.get("values_are_hypothetical") is not True:
        problems.append("assets.yaml: must contain 'values_are_hypothetical: true'")
    seen = set()
    for i, a in enumerate(assets.get("assets") or []):
        where = f"assets.yaml: assets[{i}]"
        if not a.get("id") or a["id"] in seen:
            problems.append(f"{where}.id is required and must be unique")
        seen.add(a.get("id"))
        if not isinstance(a.get("value_usd"), (int, float)) or isinstance(a.get("value_usd"), bool) or a["value_usd"] < 0:
            problems.append(f"{where}.value_usd must be a non-negative number")
        if a.get("character") not in CHARACTERS:
            problems.append(f"{where}.character must be one of {sorted(CHARACTERS)}")
        if a.get("governing_document") and a["governing_document"] not in doc_ids:
            problems.append(f"{where}.governing_document {a['governing_document']!r} is not a document id")
    if not assets.get("assets"):
        problems.append("assets.yaml: assets list is empty")


def _load_documents(root, manifest, problems):
    docs = {}
    for i, d in enumerate(manifest.get("documents") or []):
        where = f"household.yaml: documents[{i}]"
        file = str(d.get("file") or "")
        rel = PurePosixPath(file)
        if not file or rel.is_absolute() or ".." in rel.parts:
            problems.append(f"{where}.file must be a relative path inside the household")
            continue
        path = root / rel
        doc_id = d.get("id") or path.stem
        if doc_id != path.stem:
            problems.append(f"{where}: id {doc_id!r} must equal the file name without extension ({path.stem!r})")
        if doc_id in docs:
            problems.append(f"{where}: duplicate document id {doc_id!r}")
        if d.get("type") not in DOCUMENT_TYPES:
            problems.append(f"{where}.type must be one of {DOCUMENT_TYPES}")
        if d.get("source", "digital") not in SOURCES:
            problems.append(f"{where}.source must be digital or scanned")
        if path.suffix.lower() not in TEXT_SUFFIXES:
            problems.append(f"{where}: {file} must be .txt or .md (the mutation script edits text)")
            continue
        if not path.exists():
            problems.append(f"{where}: {file} not found")
            continue
        text = read_text(path)
        if "synthetic" not in normalize(text):
            problems.append(f"{file}: the document text must carry the label SYNTHETIC (CLAUDE.md rule 1)")
        docs[doc_id] = Document(doc_id, d.get("type"), file, d.get("source", "digital"), text)
    if not docs and not problems:
        problems.append("household.yaml: documents list is empty")
    return docs


def _load_facts(manifest, docs, problems):
    facts, seen, spans = [], set(), {}
    for i, raw in enumerate(manifest.get("facts") or []):
        where = f"household.yaml: facts[{i}] ({raw.get('id', '?')})"
        fact = {key: raw.get(key) for key in ("id", "doc", "field", "value", "anchor", "target")}
        if isinstance(fact["value"], date):
            fact["value"] = fact["value"].isoformat()
        fact["value"] = "" if fact["value"] is None else str(fact["value"])
        if not fact["id"] or fact["id"] in seen:
            problems.append(f"{where}: id is required and must be unique")
        seen.add(fact["id"])
        if fact["field"] not in FIELDS:
            problems.append(f"{where}: unknown field {fact['field']!r}")
        if fact["doc"] not in docs:
            problems.append(f"{where}: unknown doc {fact['doc']!r}")
            continue
        if not fact["anchor"]:
            problems.append(f"{where}: anchor is required (exact text from the document)")
            continue
        if not fact["target"]:
            value = fact["value"]
            fact["target"] = value if value and fact["anchor"].count(value) == 1 and fact["field"] not in DATE_FIELDS else fact["anchor"]
        if fact["anchor"].count(fact["target"]) != 1:
            problems.append(f"{where}: target must occur exactly once inside the anchor")
            continue
        text = docs[fact["doc"]].text
        try:
            start, page = locate(text, fact)
        except ValueError as exc:
            problems.append(f"{where}: {exc}")
            continue
        anchor_start = text.find(fact["anchor"])
        anchor_end = anchor_start + len(fact["anchor"])
        page_spans_ = page_spans(text)
        if page_of_offset(page_spans_, anchor_start) != page_of_offset(page_spans_, anchor_end - 1):
            problems.append(f"{where}: anchor crosses a page break")
        spans.setdefault(fact["doc"], []).append((anchor_start, anchor_end, fact["id"]))
        if fact["field"] in DATE_FIELDS and fact["value"]:
            dates = find_dates(fact["target"])
            if parse_iso(fact["value"]) is None:
                problems.append(f"{where}: value must be YYYY-MM-DD")
            elif len(dates) != 1 or dates[0].value != parse_iso(fact["value"]):
                problems.append(f"{where}: target {fact['target']!r} must hold exactly one date equal to {fact['value']}")
        facts.append(fact)
    for doc_id, items in spans.items():
        items.sort()
        for (s1, e1, id1), (s2, e2, id2) in zip(items, items[1:]):
            if s2 < e1:
                problems.append(f"household.yaml: anchors of {id1} and {id2} overlap in {doc_id}; choose non-overlapping anchors")
    return facts


def _clean_warnings(hh):
    """Things that would make the clean household produce a material finding."""
    warnings = []
    q = hh.questionnaire
    known = [hh.client_name] + [m.get("spouse", "") for m in q.get("marriages") or []] + \
            [p.get("name", "") for p in q.get("people") or []]
    _, marriage = hh.current_marriage()
    married = as_date(marriage.get("married")) if marriage else None
    deceased = [p["name"] for p in q.get("people") or [] if p.get("status") == "deceased"]
    formers = [m["spouse"] for _, m in hh.former_spouses()]
    for f in hh.facts:
        doc_type = hh.docs[f["doc"]].type
        value = f["value"]
        if f["field"] in PERSON_FIELDS and value and not is_institution(value) \
                and not any(same_person(value, k) for k in known):
            warnings.append(f"{f['id']}: {value!r} is not in the questionnaire (list everyone named in the documents)")
        if f["field"] in FIDUCIARY_FIELDS | BENEFICIARY_FIELDS and any(same_person(value, d) for d in deceased):
            warnings.append(f"{f['id']}: names {value!r}, whom the questionnaire lists as deceased")
        if f["field"] in BENEFICIARY_FIELDS and doc_type == "beneficiary_designation" \
                and any(same_person(value, s) for s in formers):
            warnings.append(f"{f['id']}: designation names former spouse {value!r}")
        if f["field"] == "document_date" and doc_type in ("will", "revocable_trust") and married \
                and parse_iso(value) and parse_iso(value) < married:
            warnings.append(f"{f['id']}: {doc_type} dated {value}, before the current marriage ({married})")
        if f["field"] == "document_date" and doc_type == "trust_amendment" and not value:
            warnings.append(f"{f['id']}: the amendment's date is blank")
    named = [f["value"] for f in hh.facts if f["field"] in BENEFICIARY_FIELDS]
    for b in q.get("intended_beneficiaries") or []:
        if not any(same_person(b.get("name", ""), n) for n in named):
            warnings.append(f"intended beneficiary {b.get('name')!r} is not named as a beneficiary in any gold fact")
    return warnings


def load_household(root):
    root = Path(root)
    problems = []
    manifest = _load_yaml(root / "household.yaml", problems)
    questionnaire = _load_yaml(root / "questionnaire.yaml", problems)
    assets = _load_yaml(root / "assets.yaml", problems)
    if manifest and manifest.get("state") != "TX":
        problems.append("household.yaml: state must be TX (Texas only)")
    if manifest and not manifest.get("household_id"):
        problems.append("household.yaml: household_id is required")
    docs = _load_documents(root, manifest, problems)
    facts = _load_facts(manifest, docs, problems)
    if questionnaire:
        _check_questionnaire(questionnaire, problems)
    if assets:
        _check_assets(assets, set(docs), problems)
    if problems:
        raise HouseholdError(problems)
    hh = Household(root, manifest, questionnaire, assets, docs, facts)
    hh.warnings = _clean_warnings(hh)
    return hh
