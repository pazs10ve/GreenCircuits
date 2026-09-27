from datetime import date, timedelta

import numpy as np
import pytest

from greencircuits.lab.charges import delivery_charges
from greencircuits.lab.indicators import rsi, sma
from greencircuits.lab.metrics import max_drawdown, summarise, xirr
from greencircuits.lab.simulate import Series, condition_series, simulate_rules, simulate_sip


def weekdays(n: int, start: date = date(2024, 1, 1)) -> list[date]:
    out, d = [], start
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d)
        d += timedelta(days=1)
    return out


def series(close: list[float] | np.ndarray) -> Series:
    c = np.asarray(close, dtype=float)
    return Series(weekdays(len(c)), c.copy(), c * 1.01, c * 0.99, c)


def test_delivery_charges_on_a_one_lakh_buy_and_sell():
    # STT 100 + exchange 2.97 + SEBI 0.1 + stamp 15 + GST 18% of (2.97 + 0.1) = 118.62
    assert delivery_charges(100_000, "B") == pytest.approx(118.62, abs=0.01)
    # STT 100 + exchange 2.97 + SEBI 0.1 + GST 0.55 + DP 15.93 = 119.55
    assert delivery_charges(100_000, "S") == pytest.approx(119.55, abs=0.01)
    assert delivery_charges(0, "B") == 0


def test_sma_and_rsi_never_look_ahead():
    x = np.arange(1, 31, dtype=float)
    s = sma(x, 5)
    assert np.isnan(s[3]) and s[4] == pytest.approx(3.0)
    r = rsi(x, 14)
    assert np.isnan(r[13]) and r[14] == pytest.approx(100.0)  # only gains so far


def test_max_drawdown_and_xirr():
    assert max_drawdown(np.array([100, 120, 90, 130])) == pytest.approx(-0.25)
    # ₹100 in, ₹110 out a year later: 10% a year.
    assert xirr([(date(2024, 1, 1), -100.0), (date(2025, 1, 1), 110.0)]) == pytest.approx(0.0997, abs=1e-3)


def test_summarise_a_steady_rise():
    daily = np.full(252, (1.12) ** (1 / 252) - 1)
    m = summarise(daily, weekdays(253)[1:])
    assert m["cagr"] == pytest.approx(0.12, abs=0.01)
    assert m["max_drawdown"] == 0


def test_crosses_below_fires_once_on_the_crossing_bar():
    s = series([50, 40, 30, 20, 25, 35])
    c = condition_series(
        s, {"left": {"kind": "price"}, "op": "crosses_below", "right": {"kind": "value", "value": 35}}
    )
    assert c.tolist() == [False, False, True, False, False, False]


def test_rules_fill_at_the_next_open_and_hit_the_target():
    # Price dips below 95 on bar 2, then rises; target 10% from the entry.
    close = [100, 98, 94, 96, 100, 104, 106, 108, 110, 112]
    s = series(close)
    d = {
        "type": "rules",
        "universe": [7],
        "entry": [{"left": {"kind": "price"}, "op": "<", "right": {"kind": "value", "value": 95}}],
        "exit": {"targetPct": 10},
        "maxPositions": 1,
        "costs": "NONE",
    }
    r = simulate_rules({7: s}, 0, d, 10_000, 0)
    assert len(r.trades) == 1
    t = r.trades[0]
    assert t.entry_at == s.dates[3] and t.entry_price == pytest.approx(
        96
    )  # signal on bar 2's close, filled at bar 3's open
    # 106 closes above the 105.6 target on bar 6; the exit fills at bar 7's open.
    assert t.exit_reason == "TARGET" and t.exit_at == s.dates[7] and t.exit_price == pytest.approx(108)
    assert r.extra["win_rate"] == 1.0


def test_sip_invests_once_a_month_and_waiting_holds_cash():
    s = series(np.linspace(100, 150, 260))  # a steady rise: never 10% below the high
    plain = simulate_sip(s, 0, 10_000)
    waiting = simulate_sip(s, 0, 10_000, {"fallPct": 10, "cashRatePct": 0})
    assert plain.extra["buys"] == plain.extra["months"]
    # The price never falls 10% below its high, so the waiting money never gets invested.
    assert waiting.extra["buys"] == 0
    assert waiting.extra["months_in_cash"] == waiting.extra["months"] - 1
    assert plain.values[-1] > waiting.values[-1]


def test_indicators_ignore_a_leading_gap():
    # An instrument that lists after the calendar starts: NaN first, then prices.
    x = np.concatenate([np.full(10, np.nan), np.arange(1, 31, dtype=float)])
    s = sma(x, 5)
    assert np.isnan(s[13]) and s[14] == pytest.approx(3.0) and not np.isnan(s[-1])
    assert not np.isnan(rsi(x, 14)[-1])
