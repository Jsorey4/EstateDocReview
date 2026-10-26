"""Load a document as a list of page texts.

Pages are 1-indexed everywhere a page number is shown or stored; the lists here are 0-indexed.
Text files (.txt, .md) separate pages with a form feed (the pdftotext and Tesseract convention)
or with a line reading "--- page break ---". PDFs yield one entry per physical page from the
text layer (digital PDFs, or scans run through OCRmyPDF).

Extraction, verification and the mutation script all use this module, so a page number means
the same thing in every step.
"""
import hashlib
import re
from pathlib import Path

TEXT_SUFFIXES = {".txt", ".md"}
DOC_SUFFIXES = TEXT_SUFFIXES | {".pdf"}
PAGE_BREAK_LINE = re.compile(r"^[ \t]*-{3,}[ \t]*page[ \t]+break[ \t]*-{3,}[ \t]*$", re.I | re.M)
_FORM_FEED = re.compile("\f")


def read_text(path):
    """Read UTF-8 text without newline translation, so offsets and rewritten files stay exact."""
    with open(path, encoding="utf-8", newline="") as f:
        return f.read()


def page_spans(raw):
    """Character spans [start, end) of each page in raw text. A trailing empty page (pdftotext
    ends its output with a form feed) is dropped."""
    seps = sorted(
        [(m.start(), m.end()) for m in PAGE_BREAK_LINE.finditer(raw)]
        + [(m.start(), m.end()) for m in _FORM_FEED.finditer(raw)]
    )
    spans, pos = [], 0
    for start, end in seps:
        if start < pos:  # a form feed inside a page-break line
            continue
        spans.append((pos, start))
        pos = end
    spans.append((pos, len(raw)))
    if len(spans) > 1 and not raw[spans[-1][0]:spans[-1][1]].strip():
        spans.pop()
    return spans


def page_of_offset(spans, offset):
    """1-indexed page containing character offset, or None if it falls on a page separator."""
    for number, (start, end) in enumerate(spans, 1):
        if start <= offset < end or (offset == end == start):
            return number
    return None


def split_pages(raw):
    return [raw[start:end] for start, end in page_spans(raw)]


def load_pages(path):
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix in TEXT_SUFFIXES:
        return split_pages(read_text(path))
    if suffix == ".pdf":
        from pypdf import PdfReader
        return [page.extract_text() or "" for page in PdfReader(path).pages]
    raise ValueError(f"unsupported document type: {path} (use .txt, .md or .pdf)")


def pdf_producer(path):
    """The PDF's Producer and Creator metadata, lowercased ("" when absent)."""
    from pypdf import PdfReader
    meta = PdfReader(path).metadata or {}
    return " ".join(str(meta.get(key) or "") for key in ("/Producer", "/Creator")).lower()


def detect_source(path):
    """'scanned' for PDFs whose metadata shows an OCR tool, else 'digital'. Misreading a scan as
    digital only makes verification stricter, so 'digital' is the default."""
    path = Path(path)
    if path.suffix.lower() == ".pdf":
        producer = pdf_producer(path)
        if "ocrmypdf" in producer or "tesseract" in producer:
            return "scanned"
    return "digital"


def file_sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            digest.update(chunk)
    return digest.hexdigest()


def list_documents(paths):
    """Expand files and directories into a sorted list of supported document files."""
    found = []
    for item in map(Path, paths):
        if item.is_dir():
            found += sorted(p for p in item.iterdir() if p.suffix.lower() in DOC_SUFFIXES)
        elif item.suffix.lower() in DOC_SUFFIXES:
            found.append(item)
        else:
            raise ValueError(f"not a supported document or directory: {item}")
    return found
