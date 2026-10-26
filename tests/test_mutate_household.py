import json

import pytest
import yaml

from evaluation import mutate_household as mh
from edr.household import HouseholdError, load_household
from edr.pages import load_pages


def generate(household_dir, tmp_path, *extra):
    out = tmp_path / "variants"
    assert mh.main([str(household_dir), "--out", str(out), *extra]) == 0
    return out


def key(out, prefix):
    [variant] = [p for p in out.iterdir() if p.name.startswith(prefix)]
    return variant, json.loads((variant / "answer_key.json").read_text())


def test_fixture_household_is_valid_and_clean(household_dir):
    hh = load_household(household_dir)
    assert hh.warnings == []
    assert {name: m.candidates(hh) for name, m in mh.MUTATIONS.items()} == {
        "former_spouse_designation": ["bd_primary"],
        "deceased_fiduciary": ["Person Gamma"],
        "predates_marriage": ["will_date"],
        "retitle_outside_trust": ["titling_owner"],
        "add_intended_beneficiary": ["Person Gamma", "Person Zeta"],
        "blank_amendment_date": ["amendment_date"],
    }


def test_auto_plan_writes_one_variant_per_target(household_dir, tmp_path):
    out = generate(household_dir, tmp_path)
    index = json.loads((out / "index.json").read_text())
    assert len(index["variants"]) == 8
    assert all(len(v["mutations"]) <= 1 for v in index["variants"])
    assert not (out / "B_clean" / "input" / "household.yaml").exists()  # ground truth stays out of inputs


def test_clean_variant_is_an_exact_copy_with_zero_issues(household_dir, tmp_path):
    out = generate(household_dir, tmp_path)
    variant, answer = key(out, "B_clean")
    assert answer["expected_issues"] == [] and answer["synthetic"] is True
    for rel in list(mh.load_household(household_dir).docs[d].file for d in ("will", "trust")) + ["questionnaire.yaml"]:
        assert (variant / "input" / rel).read_bytes() == (household_dir / rel).read_bytes()


def test_former_spouse_designation(household_dir, tmp_path):
    out = generate(household_dir, tmp_path)
    variant, answer = key(out, "A01_former_spouse_designation")
    assert "Primary Beneficiary: Person Delta, 100%" in (variant / "input/docs/bd_401k.txt").read_text()
    [issue] = answer["expected_issues"]
    assert issue["issue_type"] == "former_spouse_beneficiary"
    assert (issue["assets"], issue["amount_at_stake_usd"], issue["people"]) == (["a401k"], 100, ["Person Delta"])
    assert issue["evidence"][0] == {"source": "document", "doc": "bd_401k", "page": 1, "fact_id": "bd_primary",
                                    "field": "primary_beneficiary", "text": "Primary Beneficiary: Person Delta, 100%"}
    assert issue["evidence"][1]["path"] == "marriages[0]"
    gold = {f["id"]: f for f in answer["expected_facts"]}
    assert gold["bd_primary"]["value"] == "Person Delta" and gold["trust_beneficiary"]["value"] == "Person Beta"
    # Only the targeted document changed.
    assert (variant / "input/docs/will.txt").read_bytes() == (household_dir / "docs/will.txt").read_bytes()


def test_deceased_fiduciary_lists_every_role_the_person_holds(household_dir, tmp_path):
    out = generate(household_dir, tmp_path)
    variant, answer = key(out, "A02_deceased_fiduciary")
    questionnaire = yaml.safe_load((variant / "input/questionnaire.yaml").read_text())
    assert questionnaire["synthetic"] is True
    assert questionnaire["people"][1] == {"name": "Person Gamma", "relationship": "sibling",
                                          "status": "deceased", "date_of_death": None}
    found = sorted((i["issue_type"], i["documents"][0], i["evidence"][0]["page"]) for i in answer["expected_issues"])
    assert found == [("deceased_fiduciary", "trust", 1), ("deceased_fiduciary", "will", 1)]


def test_predates_marriage_keeps_the_date_style(household_dir, tmp_path):
    out = generate(household_dir, tmp_path)
    variant, answer = key(out, "A03_predates_marriage")
    will = variant / "input/docs/will.txt"
    assert "Signed this 20th day of June, 2014." in will.read_text()
    assert len(load_pages(will)) == 2
    [issue] = answer["expected_issues"]
    assert issue["evidence"][0]["page"] == 2 and issue["people"] == ["Person Beta"]
    assert {f["id"]: f["value"] for f in answer["expected_facts"]}["will_date"] == "2014-06-20"


def test_retitle_outside_trust(household_dir, tmp_path):
    out = generate(household_dir, tmp_path)
    variant, answer = key(out, "A04_retitle_outside_trust")
    assert (variant / "input/docs/titling.txt").read_text().splitlines()[1] == "Account registration: Person Alpha"
    [issue] = answer["expected_issues"]
    assert issue["documents"] == ["titling", "trust"] and issue["amount_at_stake_usd"] == 50


def test_add_intended_beneficiary(household_dir, tmp_path):
    out = generate(household_dir, tmp_path)
    variant, answer = key(out, "A06_add_intended_beneficiary__person_zeta")
    questionnaire = yaml.safe_load((variant / "input/questionnaire.yaml").read_text())
    assert questionnaire["intended_beneficiaries"][-1] == {"name": "Person Zeta", "share": "not stated"}
    [issue] = answer["expected_issues"]
    assert (issue["issue_type"], issue["people"], issue["documents"]) == ("intent_mismatch", ["Person Zeta"], [])


def test_blank_amendment_date_is_unresolved(household_dir, tmp_path):
    out = generate(household_dir, tmp_path)
    variant, answer = key(out, "A07_blank_amendment_date")
    assert "Dated: _______________" in (variant / "input/docs/amendment.txt").read_text()
    [issue] = answer["expected_issues"]
    assert issue["expected_status"] == "unresolved" and issue["documents"] == ["amendment", "trust"]
    assert {f["id"]: f["value"] for f in answer["expected_facts"]}["amendment_date"] == ""


def test_plan_combines_mutations(household_dir, tmp_path):
    plan = tmp_path / "plan.yaml"
    plan.write_text(yaml.safe_dump({"variants": [{"id": "A_headline", "mutations": [
        {"type": "former_spouse_designation", "target": "bd_primary"},
        {"type": "retitle_outside_trust", "target": "titling_owner"},
        {"type": "predates_marriage", "target": "trust_date"},
    ]}]}))
    out = generate(household_dir, tmp_path, "--plan", str(plan), "--no-auto")
    _, answer = key(out, "A_headline")
    assert [i["id"] for i in answer["expected_issues"]] == ["I1", "I2", "I3"]
    assert answer["amount_at_stake_total_usd"] == 150
    assert "warning" in answer["mutations"][2]["changes"][0]  # trust dates are repeated elsewhere


def test_plan_rejects_conflicting_and_invalid_targets(household_dir, tmp_path, capsys):
    plan = tmp_path / "plan.yaml"
    plan.write_text(yaml.safe_dump({"variants": [{"id": "bad", "mutations": [
        {"type": "deceased_fiduciary", "target": "Person Gamma"},
        {"type": "add_intended_beneficiary", "target": "Person Gamma"},
    ]}]}))
    assert mh.main([str(household_dir), "--out", str(tmp_path / "v"), "--plan", str(plan), "--no-auto"]) == 2
    assert "two mutations touch" in capsys.readouterr().err
    plan.write_text(yaml.safe_dump({"variants": [{"id": "bad", "mutations": [
        {"type": "former_spouse_designation", "target": "will_date"}]}]}))
    assert mh.main([str(household_dir), "--out", str(tmp_path / "v"), "--plan", str(plan), "--no-auto"]) == 2
    assert "not a valid target" in capsys.readouterr().err


def test_out_dir_safety(household_dir, tmp_path, capsys):
    stranger = tmp_path / "stranger"
    stranger.mkdir()
    (stranger / "keep.txt").write_text("mine")
    assert mh.main([str(household_dir), "--out", str(stranger), "--force"]) == 2
    assert (stranger / "keep.txt").exists()
    out = generate(household_dir, tmp_path)
    assert mh.main([str(household_dir), "--out", str(out)]) == 2          # needs --force
    assert mh.main([str(household_dir), "--out", str(out), "--force"]) == 0
    assert mh.main([str(household_dir), "--out", str(household_dir.parent)]) == 2


@pytest.mark.parametrize("edit, message", [
    (lambda root: (root / "docs/trust.txt").write_text("ALPHA FIXTURE TRUST\nmade on June 1, 2019\nSuccessor Trustee: Person Gamma.\nTrust beneficiary: Person Beta.\n"),
     "SYNTHETIC"),
    (lambda root: (root / "docs/bd_401k.txt").write_text("SYNTHETIC\nPrimary Beneficiary: Person Beta, 100%\nPrimary Beneficiary: Person Beta, 100%\n"),
     "anchor occurs 2 times"),
    (lambda root: _edit(root / "household.yaml", "value: 2019-03-14", "value: 2019-03-15"),
     "must hold exactly one date equal to 2019-03-15"),
    (lambda root: _edit(root / "household.yaml", 'anchor: "trustee of the Alpha Fixture Trust"', 'anchor: "Alpha Fixture Trust.\\nSigned this 14th"'),
     "overlap"),
    (lambda root: _edit(root / "questionnaire.yaml", "state: TX", "state: OK"),
     "Texas only"),
])
def test_validation_errors(household_dir, edit, message):
    edit(household_dir)
    with pytest.raises(HouseholdError) as excinfo:
        load_household(household_dir)
    assert message in str(excinfo.value)


def _edit(path, old, new):
    text = path.read_text()
    assert old in text
    path.write_text(text.replace(old, new))


def test_warnings_flag_a_household_that_is_not_clean(household_dir):
    _edit(household_dir / "questionnaire.yaml", "{name: Person Gamma, relationship: sibling, status: living}",
          "{name: Person Gamma, relationship: sibling, status: deceased}")
    warnings = load_household(household_dir).warnings
    assert any("deceased" in w for w in warnings)
