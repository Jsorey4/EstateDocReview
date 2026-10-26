from datetime import date

import pytest

from edr.dates import find_dates, one_year_before, render_like, replace_single_date, single_date_span
from edr.pages import load_pages, page_of_offset, page_spans, split_pages
from edr.textnorm import compact, match_case, normalize, same_person


def test_normalize_folds_typography_case_and_space():
    assert normalize("“Quoted” text — with  ﬁne\nspacing") == '"quoted" text - with fine spacing'


def test_compact_absorbs_line_break_hyphenation():
    assert compact("benefi-\nciary designation") == compact("beneficiary designation")


def test_same_person_tolerates_middle_initial_but_not_first_name_only():
    assert same_person("Maria Rivera", "Maria L. Rivera")
    assert not same_person("Maria Rivera", "Maria Lopez")
    assert not same_person("Maria", "Maria Rivera")


def test_match_case():
    assert match_case("PERSON BETA", "Person Delta") == "PERSON DELTA"
    assert match_case("Person Beta", "Person Delta") == "Person Delta"


def test_pages_split_on_marker_and_form_feed():
    raw = "one\n--- page break ---\ntwo\fthree\f"
    assert [p.strip() for p in split_pages(raw)] == ["one", "two", "three"]
    spans = page_spans(raw)
    assert page_of_offset(spans, raw.index("two")) == 2
    assert page_of_offset(spans, raw.index("three")) == 3


def test_load_pages_txt(tmp_path):
    doc = tmp_path / "d.txt"
    doc.write_text("a\n--- Page Break ---\nb\n", encoding="utf-8")
    assert [p.strip() for p in load_pages(doc)] == ["a", "b"]


@pytest.mark.parametrize("text, expected, kind", [
    ("Signed March 14, 2019 in Dallas", date(2019, 3, 14), "mdy"),
    ("this 14th day of March, 2019", date(2019, 3, 14), "day_of"),
    ("this fourteenth day of March, 2019", date(2019, 3, 14), "day_of_word"),
    ("this twenty-first day of June 2020", date(2020, 6, 21), "day_of_word"),
    ("14 March 2019", date(2019, 3, 14), "dmy"),
    ("Dated: 03/14/2019", date(2019, 3, 14), "numeric"),
    ("2019-03-14", date(2019, 3, 14), "iso"),
    ("Sept. 3, 2018", date(2018, 9, 3), "mdy"),
])
def test_find_dates_styles(text, expected, kind):
    [match] = find_dates(text)
    assert (match.value, match.kind) == (expected, kind)


@pytest.mark.parametrize("text, new, rendered", [
    ("this 14th day of March, 2019", date(2014, 6, 22), "this 22nd day of June, 2014"),
    ("THIS 1ST DAY OF MAY, 2021", date(2020, 3, 3), "THIS 3RD DAY OF MARCH, 2020"),
    ("this fourteenth day of March, 2019", date(2014, 6, 21), "this twenty-first day of June, 2014"),
    ("Dated: 03/14/2019", date(2014, 6, 2), "Dated: 06/02/2014"),
    ("Dated: 3/4/2019", date(2014, 6, 2), "Dated: 6/2/2014"),
    ("Sept. 3, 2018", date(2017, 1, 9), "Jan. 9, 2017"),
    ("2019-03-14", date(2014, 6, 2), "2014-06-02"),
])
def test_replace_single_date_keeps_style(text, new, rendered):
    assert replace_single_date(text, new) == rendered


def test_replace_single_date_requires_exactly_one_date():
    with pytest.raises(ValueError):
        replace_single_date("from March 1, 2019 to April 1, 2019", date(2020, 1, 1))
    with pytest.raises(ValueError):
        single_date_span("no date here")


def test_invalid_calendar_dates_are_ignored():
    assert find_dates("February 30, 2019") == []


def test_one_year_before_leap_day():
    assert one_year_before(date(2016, 2, 29)) == date(2015, 2, 28)
