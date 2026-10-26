"""Browser test helper: sample bundles built from the placeholder unit-test fixture only.

Prints {"files": {"index.json": ..., "<variant>.json": ...}} for Playwright to serve under
samples/. Nothing is written into public/.
"""
import json
import sys
import tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from conftest import FIXTURE_DOCS, FIXTURE_MANIFEST, FIXTURE_QUESTIONNAIRE, FIXTURE_ASSETS, write
from test_build_samples import simulate_run
import build_samples
import mutate_household as mh
import run_eval

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    household = root / "FIXTURE"
    for rel, text in FIXTURE_DOCS.items():
        write(household / rel, text)
    write(household / "household.yaml", FIXTURE_MANIFEST)
    write(household / "questionnaire.yaml", FIXTURE_QUESTIONNAIRE)
    write(household / "assets.yaml", FIXTURE_ASSETS)
    variants, run, out = root / "variants", root / "run", root / "samples"
    quiet = open("/dev/null", "w")
    stdout, sys.stdout = sys.stdout, quiet
    try:
        mh.main([str(household), "--out", str(variants)])
        simulate_run(household, variants, run)
        run_eval.main(["--variants", str(variants), "--run", str(run)])
        build_samples.main(["--variants", str(variants), "--run", str(run), "--out", str(out)])
    finally:
        sys.stdout = stdout
    print(json.dumps({"files": {p.name: p.read_text() for p in sorted(out.glob("*.json"))}}))
