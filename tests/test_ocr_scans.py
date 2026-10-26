"""OCR wrapper logic with a fake OCRmyPDF runner (the real tool is not needed)."""
import json
from types import SimpleNamespace

from pipeline import ocr_scans

GOOD = "I appoint Person Gamma as Independent Executor of this will, signed on March 14, 2019 in Fixture County."
GARBAGE = "lI|1i ƒ§Æ ,,. ;;; xkqz 11|l |||| ttt zzzp qwrt ~~~~ ---- rnrnrn crcr vvvv"


def fake_runner(texts_by_strategy, fail=()):
    """Writes the sidecar and PDF the way OCRmyPDF would, choosing text by the strategy flags."""
    calls = []

    def run(cmd):
        strategy = "heavy" if "--force-ocr" in cmd else "standard"
        calls.append((strategy, cmd))
        if strategy in fail:
            return SimpleNamespace(returncode=2, stderr="boom")
        sidecar = cmd[cmd.index("--sidecar") + 1]
        out_pdf = cmd[-1]
        open(sidecar, "w").write("\f".join(texts_by_strategy[strategy]) + "\f")
        open(out_pdf, "wb").write(f"%PDF {strategy}".encode())
        return SimpleNamespace(returncode=0, stderr="")
    run.calls = calls
    return run


def test_page_score_separates_text_from_garbage_and_short_pages():
    assert ocr_scans.page_score(GOOD)[0] >= 0.9
    assert ocr_scans.page_score(GARBAGE)[0] < ocr_scans.PAGE_MIN_SCORE
    assert ocr_scans.page_score("Page 2")[0] == 0.0  # too little text to judge
    assert ocr_scans.page_score("Account balance $1,250,000 held since 2019 by Person Gamma as trustee.")[0] == 1.0
    assert ocr_scans.token_is_wordlike("2019") and ocr_scans.token_is_wordlike("Gamma")
    assert not ocr_scans.token_is_wordlike("xkqz")


def test_clean_scan_passes_on_the_first_strategy(tmp_path):
    (tmp_path / "scan.pdf").write_bytes(b"%PDF")
    run = fake_runner({"standard": [GOOD, GOOD], "heavy": [GOOD, GOOD]})
    report = ocr_scans.ocr_document(tmp_path / "scan.pdf", tmp_path / "out", runner=run, have_unpaper=False)
    assert report["status"] == "ok" and report["chosen_strategy"] == "standard" and len(run.calls) == 1
    assert (tmp_path / "out" / "scan.pdf").exists() and (tmp_path / "out" / "scan.txt").exists()
    assert not list((tmp_path / "out").glob("scan.standard.*"))


def test_weak_page_triggers_heavy_retry_and_the_better_pass_wins(tmp_path):
    (tmp_path / "scan.pdf").write_bytes(b"%PDF")
    run = fake_runner({"standard": [GOOD, GARBAGE], "heavy": [GOOD, GOOD]})
    report = ocr_scans.ocr_document(tmp_path / "scan.pdf", tmp_path / "out", runner=run, have_unpaper=True)
    assert [c[0] for c in run.calls] == ["standard", "heavy"] and "--clean" in run.calls[1][1]
    assert report["chosen_strategy"] == "heavy" and report["status"] == "ok" and report["weak_pages"] == []
    assert (tmp_path / "out" / "scan.pdf").read_bytes() == b"%PDF heavy"


def test_page_still_weak_after_both_passes_is_reported_not_hidden(tmp_path):
    (tmp_path / "scan.pdf").write_bytes(b"%PDF")
    run = fake_runner({"standard": [GOOD, GARBAGE], "heavy": [GOOD, GARBAGE]})
    report = ocr_scans.ocr_document(tmp_path / "scan.pdf", tmp_path / "out", runner=run, have_unpaper=False)
    assert report["status"] == "weak" and report["weak_pages"] == [2]


def test_failed_pass_falls_back_and_total_failure_is_reported(tmp_path):
    (tmp_path / "scan.pdf").write_bytes(b"%PDF")
    run = fake_runner({"standard": [GOOD], "heavy": [GOOD]}, fail=("standard",))
    assert ocr_scans.ocr_document(tmp_path / "scan.pdf", tmp_path / "out", runner=run, have_unpaper=False)["chosen_strategy"] == "heavy"
    run = fake_runner({}, fail=("standard", "heavy"))
    report = ocr_scans.ocr_document(tmp_path / "scan.pdf", tmp_path / "out2", runner=run, have_unpaper=False)
    assert report["status"] == "failed" and report["attempts"][0]["error"] == "boom"


def test_cli_writes_report_and_exit_code(tmp_path, capsys):
    scans = tmp_path / "scans"
    scans.mkdir()
    (scans / "a.pdf").write_bytes(b"%PDF")
    run = fake_runner({"standard": [GOOD], "heavy": [GOOD]})
    assert ocr_scans.main([str(scans), "--out", str(tmp_path / "o")], runner=run) == 0
    assert json.loads((tmp_path / "o" / "ocr_report.json").read_text())["documents"][0]["status"] == "ok"
    assert "a.pdf: ok" in capsys.readouterr().out
