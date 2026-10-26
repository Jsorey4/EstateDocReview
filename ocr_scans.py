#!/usr/bin/env python3
"""OCR scanned PDFs into searchable PDFs, with a per-page quality gate (CLAUDE.md, Layer 1).

extract.py reads the text layer, and verify_quotes.py checks quotes against it, so OCR quality
decides how much evidence can be verified. This wrapper runs OCRmyPDF, scores every page, and
retries the weak ones with a heavier pass instead of silently passing bad text along.

Strategies, tried in order until every page clears the gate (the best pass per document wins):
  standard   deskew, auto-rotate, 300 dpi oversample
  heavy      adds --force-ocr (ignore any junk text layer), --clean when unpaper exists, and
             a 450 dpi oversample, which helps phone scans and small print
Page score is the share of tokens that look like words (letters, a vowel, plausible length), with a
floor on characters per page. Pages under PAGE_MIN_SCORE are reported as "weak"; the report lists
them so you can rescan or exclude them. A weak page's facts can still be verified only if the
quote matches (fuzzy for scans), so nothing weak turns into a finding without evidence.

Setup (not in requirements.txt; these are system tools):  brew install ocrmypdf tesseract
Usage:
  python ocr_scans.py scans/ --out scans_ocr/        # every *.pdf in the directory
  python ocr_scans.py scan.pdf --out scans_ocr/ --lang eng
Outputs per input: <out>/<name>.pdf (searchable), <out>/<name>.txt (sidecar), and one
<out>/ocr_report.json. Feed the PDFs to extract.py with --source scanned.
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

OCR_VERSION = "1"
PAGE_MIN_SCORE = 0.60
PAGE_MIN_CHARS = 40
STRATEGIES = ["standard", "heavy"]

_TOKEN = re.compile(r"[A-Za-z0-9][A-Za-z0-9'’\-]*")
_VOWEL = re.compile(r"[aeiouyAEIOUY]")
_NUMERIC = re.compile(r"^[0-9][0-9,.\-/:$%]*$")


def token_is_wordlike(token):
    """Letters with a vowel and a plausible length, or a clean number. OCR garbage ("lI|1i",
    "ƒ§Æ") fails; names, dates and amounts pass."""
    if _NUMERIC.match(token):
        return True
    if not 2 <= len(token) <= 25 or not _VOWEL.search(token):
        return len(token) == 1 and token in "aAIl"
    letters = sum(c.isalpha() for c in token)
    return letters / len(token) >= 0.7


def page_score(text):
    """(score in [0, 1], char_count). Score 0 for pages with too little text to judge."""
    chars = len(text.strip())
    tokens = _TOKEN.findall(text)
    if chars < PAGE_MIN_CHARS or not tokens:
        return 0.0, chars
    good = sum(token_is_wordlike(t) for t in tokens)
    return round(good / len(tokens), 4), chars


def score_pages(sidecar_text):
    """Sidecar pages are separated by form feeds."""
    pages = sidecar_text.split("\f")
    if pages and not pages[-1].strip():
        pages = pages[:-1]
    return [dict(zip(("score", "chars"), page_score(p)), page=i) for i, p in enumerate(pages, 1)]


def build_command(src, dst, sidecar, strategy, lang, have_unpaper):
    cmd = ["ocrmypdf", "-l", lang, "--deskew", "--rotate-pages", "--output-type", "pdf",
           "--sidecar", str(sidecar)]
    if strategy == "standard":
        cmd += ["--oversample", "300", "--skip-text"]
    else:
        cmd += ["--oversample", "450", "--force-ocr"]
        if have_unpaper:
            cmd += ["--clean"]
    return cmd + [str(src), str(dst)]


def run_command(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=900)


def mean_score(pages):
    return sum(p["score"] for p in pages) / len(pages) if pages else 0.0


def weak_pages(pages):
    return [p["page"] for p in pages if p["score"] < PAGE_MIN_SCORE]


def ocr_document(src, out_dir, lang="eng", runner=run_command, have_unpaper=None):
    """OCR one PDF. Returns a report dict; the best pass's PDF and sidecar are left in out_dir."""
    src, out_dir = Path(src), Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    have_unpaper = shutil.which("unpaper") is not None if have_unpaper is None else have_unpaper
    best = None
    attempts = []
    for strategy in STRATEGIES:
        dst, sidecar = out_dir / f"{src.stem}.{strategy}.pdf", out_dir / f"{src.stem}.{strategy}.txt"
        started = time.perf_counter()
        proc = runner(build_command(src, dst, sidecar, strategy, lang, have_unpaper))
        elapsed = round(time.perf_counter() - started, 2)
        if proc.returncode != 0 or not sidecar.exists():
            attempts.append({"strategy": strategy, "ok": False, "seconds": elapsed,
                             "error": (proc.stderr or "").strip()[-400:] or f"exit {proc.returncode}"})
            continue
        pages = score_pages(sidecar.read_text(encoding="utf-8", errors="replace"))
        attempts.append({"strategy": strategy, "ok": True, "seconds": elapsed,
                         "mean_score": round(mean_score(pages), 4), "weak_pages": weak_pages(pages)})
        if best is None or mean_score(pages) > best["mean"]:
            best = {"strategy": strategy, "pdf": dst, "sidecar": sidecar, "pages": pages, "mean": mean_score(pages)}
        if not weak_pages(pages):
            break
    report = {"document": src.name, "attempts": attempts}
    if best is None:
        report.update(status="failed", weak_pages=[], pages=[])
        return report
    final_pdf, final_txt = out_dir / f"{src.stem}.pdf", out_dir / f"{src.stem}.txt"
    shutil.copyfile(best["pdf"], final_pdf)
    shutil.copyfile(best["sidecar"], final_txt)
    for s in STRATEGIES:
        for ext in ("pdf", "txt"):
            (out_dir / f"{src.stem}.{s}.{ext}").unlink(missing_ok=True)
    weak = weak_pages(best["pages"])
    report.update(status="weak" if weak else "ok", chosen_strategy=best["strategy"],
                  output=final_pdf.name, mean_score=round(best["mean"], 4), weak_pages=weak,
                  pages=best["pages"])
    return report


def main(argv=None, runner=run_command):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("input", help="a PDF or a directory of PDFs")
    ap.add_argument("--out", required=True)
    ap.add_argument("--lang", default="eng")
    args = ap.parse_args(argv)
    src = Path(args.input)
    files = sorted(src.glob("*.pdf")) if src.is_dir() else [src]
    if not files:
        print(f"no PDFs found at {src}", file=sys.stderr)
        return 2
    if runner is run_command and shutil.which("ocrmypdf") is None:
        print("ocrmypdf not found. Install it: brew install ocrmypdf tesseract", file=sys.stderr)
        return 3
    reports = [ocr_document(f, args.out, args.lang, runner) for f in files]
    out = Path(args.out) / "ocr_report.json"
    out.write_text(json.dumps({"ocr_version": OCR_VERSION, "documents": reports}, indent=2) + "\n", encoding="utf-8")
    for r in reports:
        extra = f" weak pages {r['weak_pages']}" if r["weak_pages"] else ""
        print(f"{r['document']}: {r['status']}" + (f" ({r['chosen_strategy']}, mean {r['mean_score']})" if r["status"] != "failed" else "") + extra)
    return 1 if any(r["status"] == "failed" for r in reports) else 0


if __name__ == "__main__":
    sys.exit(main())
