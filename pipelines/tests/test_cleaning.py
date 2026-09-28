from datetime import date, timedelta

import pytest

from greencircuits.jobs.cleaning import repair_fund_bars
from greencircuits.jobs.sources import Bar

START = date(2026, 1, 1)


def bars(*closes: float) -> list[Bar]:
    return [Bar(START + timedelta(days=i), c, c, c, c, 1000) for i, c in enumerate(closes)]


def closes(bs: list[Bar]) -> list[float]:
    return [round(b.close, 4) for b in bs]


def test_ordinary_moves_are_left_alone() -> None:
    history = bars(100, 103, 98, 101, 110)
    fixed, notes = repair_fund_bars(history, {})
    assert fixed == history
    assert notes == []


def test_a_one_for_ten_split_rescales_the_history_before_it() -> None:
    fixed, notes = repair_fund_bars(bars(250, 252, 25.1, 25.3), {})
    assert closes(fixed) == [25.0, 25.2, 25.1, 25.3]
    assert fixed[0].volume == 10_000
    assert notes == [f"rescaled the history before {START + timedelta(days=2)} for a 1:10 split"]


def test_a_split_on_a_big_market_day_is_found_net_of_the_market() -> None:
    # A 1:10 split on a day silver fell 30%: 0.07 of the price before, which is 0.1 of it after the market's move.
    reference = {START: 100.0, START + timedelta(days=1): 100.0, START + timedelta(days=2): 70.0}
    fixed, notes = repair_fund_bars(bars(320, 322, 22.5), reference)
    assert closes(fixed) == [32.0, 32.2, 22.5]
    assert "1:10 split" in notes[0]


def test_a_one_for_ten_split_a_day_off_the_references_crash_is_still_found() -> None:
    # Silver crashed on the Friday abroad, and on the Monday here, the day the fund also split 1:10.
    reference = {START: 100.0, START + timedelta(days=1): 70.0, START + timedelta(days=2): 69.0}
    fixed, notes = repair_fund_bars(bars(367.5, 322.5, 22.25), reference)
    assert closes(fixed) == [36.75, 32.25, 22.25]
    assert "1:10 split" in notes[0]


def test_a_consolidation_multiplies_the_history_before_it() -> None:
    fixed, _ = repair_fund_bars(bars(4.3, 4.33, 42.8), {})
    assert closes(fixed) == [43.0, 43.3, 42.8]


def test_a_fault_that_comes_back_is_dropped() -> None:
    fixed, notes = repair_fund_bars(bars(42.6, 42.5, 0.42, 0.43, 42.1, 42.3), {})
    assert closes(fixed) == [42.6, 42.5, 42.1, 42.3]
    assert notes == [f"dropped 2 faulty days from {START + timedelta(days=2)}"]


def test_a_wild_last_day_is_dropped() -> None:
    fixed, notes = repair_fund_bars(bars(13.2, 13.38, 11197.65), {})
    assert closes(fixed) == [13.2, 13.38]
    assert notes == [f"dropped a faulty last day, {START + timedelta(days=2)}"]


def test_an_unexplained_jump_is_left_and_noted() -> None:
    fixed, notes = repair_fund_bars(bars(10, 10, 27.9, 28.1), {})
    assert closes(fixed) == [10, 10, 27.9, 28.1]
    assert notes[0].startswith(f"left an unexplained jump on {START + timedelta(days=2)}")


@pytest.mark.parametrize("factor", [2, 5, 20, 50, 100])
def test_each_split_factor_is_recognised(factor: int) -> None:
    fixed, notes = repair_fund_bars(bars(1000, 1000 / factor), {})
    assert closes(fixed) == [round(1000 / factor, 4)] * 2
    assert f"1:{factor} split" in notes[0]
