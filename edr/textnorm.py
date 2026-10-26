"""Text normalization shared by the quote verifier and the mutation script.

Normalization removes only differences that carry no meaning for evidence:
typographic quotes and dashes, ligatures, invisible characters, case and whitespace.
"""
import re
import unicodedata

_TRANSLATE = str.maketrans({
    "‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'",
    "“": '"', "”": '"', "„": '"', "‟": '"', "″": '"',
    "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-",
    "―": "-", "−": "-",
    "­": None,  # soft hyphen
    "​": None, "‌": None, "‍": None, "﻿": None,
})
_WS = re.compile(r"\s+")
_NON_WORD = re.compile(r"[\W_]+")
_TOKEN = re.compile(r"\w+")


def normalize(text):
    """NFKC (folds ligatures, fullwidth forms, the ellipsis character), ASCII quotes and dashes,
    collapsed whitespace, casefolded."""
    text = unicodedata.normalize("NFKC", text or "").translate(_TRANSLATE)
    return _WS.sub(" ", text).strip().casefold()


def compact(text):
    """normalize() with every non-word character removed. Absorbs spacing and punctuation
    differences from PDF text extraction, including words hyphenated across a line break."""
    return _NON_WORD.sub("", normalize(text))


def tokens(text):
    return _TOKEN.findall(normalize(text))


def same_person(a, b):
    """True when two name strings plausibly name the same person: the shorter name's tokens are
    all in the longer one and at least two tokens overlap ("Maria Rivera" ~ "Maria L. Rivera")."""
    ta, tb = set(tokens(a)), set(tokens(b))
    if not ta or not tb:
        return False
    small, large = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
    return small <= large and len(small) >= min(2, len(large))


def match_case(template, text):
    """Render text in the letter case of template (all caps, all lower, or as given)."""
    letters = [c for c in template if c.isalpha()]
    if letters and all(c.isupper() for c in letters):
        return text.upper()
    if letters and all(c.islower() for c in letters):
        return text.lower()
    return text
