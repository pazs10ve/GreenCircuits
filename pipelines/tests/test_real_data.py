from datetime import date
from typing import Any, cast

from greencircuits.jobs.real_data import Context, _in_rupees
from greencircuits.jobs.sources import Bar, Financials


def _context(bars: dict[int, list[Bar]]) -> Context:
    return Context(conn=cast(Any, None), fetch=cast(Any, None), today="2026-09-28", instruments=[], bars=bars)


def test_statements_in_dollars_are_converted_at_each_period_ends_rate() -> None:
    usd = [Bar(date(2025, 3, 28), 85, 86, 85, 85.5, 0), Bar(date(2026, 3, 31), 90, 91, 90, 90.0, 0)]
    f = Financials(
        info={"financialCurrency": "USD"},
        annual={
            "Total Revenue": {date(2025, 3, 31): 19_000.0, date(2026, 3, 31): 20_000.0},
            "Diluted EPS": {date(2026, 3, 31): 0.8},
            "Diluted Average Shares": {date(2026, 3, 31): 4_150.0},
            "Tax Rate For Calcs": {date(2026, 3, 31): 0.29},
        },
        quarterly={},
        balance={"Share Issued": {date(2026, 3, 31): 4_150.0}, "Total Debt": {date(2026, 3, 31): 100.0}},
        cashflow={},
        calendar={},
    )
    rupees = _in_rupees(_context({400: usd}), f, "USD")
    assert rupees is not None
    # A period ending on a holiday takes the last rate before it.
    assert rupees.annual["Total Revenue"] == {
        date(2025, 3, 31): 19_000 * 85.5,
        date(2026, 3, 31): 20_000 * 90.0,
    }
    assert rupees.annual["Diluted EPS"][date(2026, 3, 31)] == 0.8 * 90.0
    # Share counts and rates stay as they are.
    assert rupees.annual["Diluted Average Shares"][date(2026, 3, 31)] == 4_150.0
    assert rupees.annual["Tax Rate For Calcs"][date(2026, 3, 31)] == 0.29
    assert rupees.balance["Share Issued"][date(2026, 3, 31)] == 4_150.0
    assert rupees.balance["Total Debt"][date(2026, 3, 31)] == 100.0 * 90.0


def test_statements_without_a_rate_are_refused() -> None:
    f = Financials(info={}, annual={}, quarterly={}, balance={}, cashflow={}, calendar={})
    assert _in_rupees(_context({}), f, "USD") is None
    assert _in_rupees(_context({400: [Bar(date(2026, 1, 1), 1, 1, 1, 1, 0)]}), f, "JPY") is None
