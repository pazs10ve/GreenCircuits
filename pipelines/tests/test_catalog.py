"""The stock catalog's pure parts: names, ticks and the risk figures that drive the demo market."""

from datetime import date, timedelta

import numpy as np

from greencircuits.jobs.catalog import plain_name, risk, to_tick


def test_names_lose_the_legal_suffix_and_a_leading_article() -> None:
    assert plain_name("Reliance Industries Ltd.") == "Reliance Industries"
    assert plain_name("The Indian Hotels Company Ltd.") == "Indian Hotels Company"
    assert plain_name("Info Edge (India) Ltd.") == "Info Edge"
    assert plain_name("ABB India Limited") == "ABB India"


def test_prices_round_to_nse_ticks() -> None:
    assert to_tick(123.456) == 123.46
    assert to_tick(812.33) == 812.35
    assert to_tick(1412.63) == 1412.6
    assert to_tick(7702.3) == 7702.5


def test_risk_needs_a_few_months_and_measures_against_the_market() -> None:
    days = [date(2025, 1, 1) + timedelta(days=i) for i in range(200)]
    rng = np.random.default_rng(7)
    market_returns = rng.normal(0, 0.01, len(days))
    market = dict(zip(days, 100 * np.cumprod(1 + market_returns), strict=True))
    # Twice the market's moves: a beta of 2 and twice its volatility.
    stock = dict(zip(days, 50 * np.cumprod(1 + 2 * market_returns), strict=True))
    vol, beta = risk(stock, market)  # type: ignore[misc]
    assert beta == 2.0
    assert abs(vol - 2 * float(np.std(market_returns[1:], ddof=1)) * np.sqrt(252)) < 0.02
    assert risk(dict(list(stock.items())[:40]), market) is None
