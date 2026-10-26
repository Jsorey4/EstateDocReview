"""Find and re-render the date expressions that appear in estate documents.

Used by the quote verifier (does the quote contain the extracted date?) and by the mutation
script (move a document date while keeping the document's own date style).
Supported styles: "March 14, 2019", "14 March 2019", "14th day of March, 2019",
"fourteenth day of March, 2019", "3/14/2019" (US order), "2019-03-14".
"""
import re
from dataclasses import dataclass, field
from datetime import date

from edr.textnorm import match_case

MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august",
          "september", "october", "november", "december"]
_MONTH_LOOKUP = {name: i for i, name in enumerate(MONTHS, 1)}
_MONTH_LOOKUP.update({name[:3]: i for i, name in enumerate(MONTHS, 1)})
_MONTH_LOOKUP["sept"] = 9
_MONTH_RE = r"(?:" + "|".join(MONTHS + ["sept", "jan", "feb", "mar", "apr", "jun", "jul", "aug",
                                         "sep", "oct", "nov", "dec"]) + r")\.?"

_UNITS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth"]
_ORDINAL_WORDS = {word: i for i, word in enumerate(_UNITS, 1)}
_ORDINAL_WORDS.update({
    "tenth": 10, "eleventh": 11, "twelfth": 12, "thirteenth": 13, "fourteenth": 14,
    "fifteenth": 15, "sixteenth": 16, "seventeenth": 17, "eighteenth": 18, "nineteenth": 19,
    "twentieth": 20, "thirtieth": 30, "thirty-first": 31,
})
_ORDINAL_WORDS.update({f"twenty-{word}": 20 + i for i, word in enumerate(_UNITS, 1)})
_ORDINAL_BY_DAY = {day: word for word, day in _ORDINAL_WORDS.items()}
_ORDINAL_RE = r"(?:" + "|".join(
    sorted((w.replace("-", "[- ]") for w in _ORDINAL_WORDS), key=len, reverse=True)) + r")"

_YEAR_SEP = r"(?P<comma>\s*,\s*|\s+)"
_DAY_OF = r"(?P<dayof>\s+day\s+of\s+)"
_PATTERNS = {
    "day_of": rf"\b(?P<day>\d{{1,2}})(?P<suffix>st|nd|rd|th)?{_DAY_OF}(?P<month>{_MONTH_RE}){_YEAR_SEP}(?P<year>\d{{4}})\b",
    "day_of_word": rf"\b(?P<dayword>{_ORDINAL_RE}){_DAY_OF}(?P<month>{_MONTH_RE}){_YEAR_SEP}(?P<year>\d{{4}})\b",
    "mdy": rf"\b(?P<month>{_MONTH_RE})\s+(?P<day>\d{{1,2}})(?P<suffix>st|nd|rd|th)?{_YEAR_SEP}(?P<year>\d{{4}})\b",
    "dmy": rf"\b(?P<day>\d{{1,2}})\s+(?P<month>{_MONTH_RE}){_YEAR_SEP}(?P<year>\d{{4}})\b",
    "numeric": r"\b(?P<m>\d{1,2})(?P<sep>[/.-])(?P<d>\d{1,2})(?P=sep)(?P<year>\d{4})\b",
    "iso": r"\b(?P<year>\d{4})-(?P<m>\d{2})-(?P<d>\d{2})\b",
}
_COMPILED = {kind: re.compile(p, re.I) for kind, p in _PATTERNS.items()}


@dataclass
class DateMatch:
    value: date
    start: int
    end: int
    kind: str
    parts: dict = field(default_factory=dict)


def _ordinal_suffix(day):
    if 11 <= day % 100 <= 13:
        return "th"
    return {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")


def _month_number(text):
    return _MONTH_LOOKUP.get(text.rstrip(".").lower())


def _to_date(kind, m):
    year = int(m["year"])
    if kind in ("numeric", "iso"):
        month, day = int(m["m"]), int(m["d"])
    else:
        month = _month_number(m["month"])
        day = _ORDINAL_WORDS[re.sub(r"\s+", "-", m["dayword"].lower())] if kind == "day_of_word" else int(m["day"])
    try:
        return date(year, month, day)
    except (TypeError, ValueError):
        return None


def find_dates(text):
    """All date expressions in text, left to right; overlapping matches keep the longest."""
    found = []
    for kind, pattern in _COMPILED.items():
        for m in pattern.finditer(text or ""):
            value = _to_date(kind, m)
            if value:
                found.append(DateMatch(value, m.start(), m.end(), kind, m.groupdict()))
    found.sort(key=lambda d: (d.start, -(d.end - d.start)))
    kept = []
    for d in found:
        if not kept or d.start >= kept[-1].end:
            kept.append(d)
    return kept


def parse_iso(value):
    try:
        return date.fromisoformat(value) if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value or "") else None
    except ValueError:
        return None


def _render_month(original, month):
    name = MONTHS[month - 1]
    bare = original.rstrip(".")
    if bare.lower() != MONTHS[_month_number(bare) - 1]:  # abbreviated in the original
        name = "sept" if bare.lower() == "sept" and month == 9 else name[:3]
        name += "." if original.endswith(".") else ""
    return match_case(bare, name.capitalize())


def render_like(match, new):
    """Render date `new` in the style of an existing DateMatch."""
    p, kind = match.parts, match.kind
    if kind == "iso":
        return new.isoformat()
    if kind == "numeric":
        month = f"{new.month:02d}" if len(p["m"]) == 2 else str(new.month)
        day = f"{new.day:02d}" if len(p["d"]) == 2 else str(new.day)
        return f"{month}{p['sep']}{day}{p['sep']}{new.year}"
    month = _render_month(p["month"], new.month)
    suffix = match_case(p["suffix"], _ordinal_suffix(new.day)) if p.get("suffix") else ""
    if kind == "day_of":
        return f"{new.day}{suffix}{p['dayof']}{month}{p['comma']}{new.year}"
    if kind == "day_of_word":
        word = _ORDINAL_BY_DAY[new.day]
        if " " in p["dayword"]:
            word = word.replace("-", " ")
        return f"{match_case(p['dayword'], word)}{p['dayof']}{month}{p['comma']}{new.year}"
    if kind == "mdy":
        return f"{month} {new.day}{suffix}{p['comma']}{new.year}"
    return f"{new.day} {month}{p['comma']}{new.year}"  # dmy


def _single_date(text):
    matches = find_dates(text)
    if len(matches) != 1:
        raise ValueError(f"expected exactly one date expression in {text!r}, found {len(matches)}")
    return matches[0]


def single_date_span(text):
    """(start, end) of the one date expression in text. Raises ValueError otherwise."""
    m = _single_date(text)
    return m.start, m.end


def replace_single_date(text, new):
    """Replace the one date expression in text with `new`, in the same style.
    Raises ValueError unless text holds exactly one date expression."""
    m = _single_date(text)
    return text[:m.start] + render_like(m, new) + text[m.end:]


def one_year_before(d):
    try:
        return d.replace(year=d.year - 1)
    except ValueError:  # Feb 29
        return d.replace(year=d.year - 1, day=28)
