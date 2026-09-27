"""Backtest simulations on daily bars. Pure functions over arrays, so they can be
tested without a database.

Rules: signals are read on a bar's close and filled at the next bar's open, so
no decision uses a price it couldn't have known. Long only.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from itertools import pairwise
from typing import Any

import numpy as np

from .charges import delivery_charges
from .indicators import ema, rolling_max, rolling_min, rsi, sma
from .metrics import xirr


@dataclass
class Series:
    dates: list[date]
    open: np.ndarray
    high: np.ndarray
    low: np.ndarray
    close: np.ndarray


@dataclass
class Trade:
    instrument_id: int
    quantity: float
    entry_at: date
    entry_price: float
    #: "B" buys (every SIP instalment, every long trade), "S" for a rebalancing sale.
    side: str = "B"
    exit_at: date | None = None
    exit_price: float | None = None
    charges: float = 0.0
    pnl: float | None = None
    exit_reason: str | None = None


@dataclass
class SimResult:
    dates: list[date]
    values: np.ndarray
    #: Money added from outside on each day (SIP instalments); zero otherwise.
    flows: np.ndarray
    trades: list[Trade] = field(default_factory=list)
    extra: dict[str, Any] = field(default_factory=dict)


def accrual(dates: list[date], annual_pct: float) -> np.ndarray:
    """Interest growth for each date: the calendar days since the previous one, so a 7% deposit
    earns 7% a year however many trading days the calendar has. The first entry is 1."""
    days = np.array([0, *[(b - a).days for a, b in pairwise(dates)]], dtype=float)
    return (1 + annual_pct / 100) ** (days / 365)


def time_weighted(values: np.ndarray, flows: np.ndarray) -> np.ndarray:
    """Daily returns with outside money taken out, so a SIP's instalments don't count as gains."""
    prev = values[:-1]
    with np.errstate(divide="ignore", invalid="ignore"):
        r = np.where(prev > 0, (values[1:] - flows[1:]) / prev - 1, 0.0)
    return np.nan_to_num(r)


# ------------------------------------------------------------------------ SIP


def simulate_sip(s: Series, start: int, monthly: float, dip: dict | None = None) -> SimResult:
    """Invest `monthly` on the first trading day of each month; with `dip`, save it
    instead and invest everything once the close is `fallPct` below its 52-week high."""
    n = len(s.dates)
    grow = accrual(s.dates, dip["cashRatePct"] if dip else 0.0)
    fall = dip["fallPct"] / 100 if dip else 0.0
    high = np.array([s.close[max(0, i - 249) : i + 1].max() for i in range(n)])
    units = cash = 0.0
    month = None
    values = np.zeros(n - start)
    flows = np.zeros(n - start)
    trades: list[Trade] = []
    contributions: list[tuple[date, float]] = []
    months = idle = 0
    for k, i in enumerate(range(start, n)):
        d = s.dates[i]
        if k:
            cash *= grow[i]
        if (d.year, d.month) != month:
            month = (d.year, d.month)
            months += 1
            if cash > 1:
                idle += 1
            cash += monthly
            flows[k] = monthly
            contributions.append((d, -monthly))
        if cash > 0 and (not dip or s.close[i] <= high[i] * (1 - fall)):
            qty = cash / s.close[i]
            units += qty
            trades.append(Trade(0, qty, d, float(s.close[i])))
            cash = 0.0
        values[k] = units * s.close[i] + cash
    invested = sum(-a for _, a in contributions)
    final = float(values[-1])
    return SimResult(
        s.dates[start:],
        values,
        flows,
        trades,
        {
            "invested": invested,
            "xirr": xirr([*contributions, (s.dates[-1], final)]),
            "months": months,
            "months_in_cash": idle,
            "buys": len(trades),
        },
    )


def simulate_deposit(dates: list[date], start: int, monthly: float, rate_pct: float) -> SimResult:
    """The same monthly instalments put in a deposit that earns `rate_pct` a year."""
    n = len(dates)
    grow = accrual(dates, rate_pct)
    cash = 0.0
    month = None
    values = np.zeros(n - start)
    flows = np.zeros(n - start)
    contributions: list[tuple[date, float]] = []
    for k, i in enumerate(range(start, n)):
        d = dates[i]
        if k:
            cash *= grow[i]
        if (d.year, d.month) != month:
            month = (d.year, d.month)
            cash += monthly
            flows[k] = monthly
            contributions.append((d, -monthly))
        values[k] = cash
    final = float(values[-1])
    return SimResult(
        dates[start:],
        values,
        flows,
        [],
        {
            "invested": sum(-a for _, a in contributions),
            "xirr": xirr([*contributions, (dates[-1], final)]),
        },
    )


# ------------------------------------------------------------------ rebalance


def simulate_rebalance(
    s: Series, start: int, capital: float, equity_pct: float, bond_rate_pct: float
) -> SimResult:
    """Hold equity_pct in the instrument and the rest in bonds, reset every April."""
    n = len(s.dates)
    w = equity_pct / 100
    grow = accrual(s.dates, bond_rate_pct)
    units = capital * w / s.close[start]
    bonds = capital * (1 - w)
    fy = _financial_year(s.dates[start])
    values = np.zeros(n - start)
    # No equity, no opening trade (a trade of zero shares isn't one).
    trades = [Trade(0, units, s.dates[start], float(s.close[start]))] if units > 0 else []
    rebalances = 0
    for k, i in enumerate(range(start, n)):
        if k:
            bonds *= grow[i]
        if _financial_year(s.dates[i]) != fy:
            fy = _financial_year(s.dates[i])
            total = units * s.close[i] + bonds
            target = total * w / s.close[i]
            if abs(target - units) > 1e-9:
                trades.append(
                    Trade(
                        0,
                        abs(target - units),
                        s.dates[i],
                        float(s.close[i]),
                        side="S" if target < units else "B",
                    )
                )
            units, bonds = target, total * (1 - w)
            rebalances += 1
        values[k] = units * s.close[i] + bonds
    return SimResult(s.dates[start:], values, np.zeros(n - start), trades, {"rebalances": rebalances})


def _financial_year(d: date) -> int:
    return d.year if d.month >= 4 else d.year - 1


def simulate_hold(universe: dict[int, Series], start: int, capital: float, costs: bool) -> SimResult:
    """Split the capital equally across the universe on the first day and hold it: the
    yardstick for a set of trading rules. Pays the buy-side charges, like the rules do."""
    ids = list(universe)
    n = len(universe[ids[0]].dates)
    budget = capital / len(ids)
    units = {}
    trades = []
    for i in ids:
        price = float(universe[i].close[start])
        fee = delivery_charges(budget, "B") if costs else 0.0
        units[i] = (budget - fee) / price
        trades.append(Trade(i, units[i], universe[i].dates[start], price, charges=fee))
    values = np.zeros(n - start)
    for k, t in enumerate(range(start, n)):
        values[k] = sum(units[i] * universe[i].close[t] for i in ids)
    return SimResult(universe[ids[0]].dates[start:], values, np.zeros(n - start), trades, {})


# ---------------------------------------------------------------------- rules


def operand(s: Series, op: dict) -> np.ndarray:
    kind = op["kind"]
    if kind == "price":
        return s.close
    if kind == "value":
        return np.full(len(s.close), float(op["value"]))
    p = int(op["period"])
    return {
        "sma": lambda: sma(s.close, p),
        "ema": lambda: ema(s.close, p),
        "rsi": lambda: rsi(s.close, p),
        "high": lambda: rolling_max(s.high, p),
        "low": lambda: rolling_min(s.low, p),
    }[kind]()


def condition_series(s: Series, c: dict) -> np.ndarray:
    """Boolean array: where the condition holds on each bar's close (False while an input is NaN)."""
    left, right = operand(s, c["left"]), operand(s, c["right"])
    valid = ~(np.isnan(left) | np.isnan(right))
    op = c["op"]
    if op == ">":
        out = left > right
    elif op == "<":
        out = left < right
    else:
        prev_l, prev_r = np.roll(left, 1), np.roll(right, 1)
        prev_valid = np.roll(valid, 1)
        prev_valid[0] = False
        out = (
            (left > right) & (prev_l <= prev_r)
            if op == "crosses_above"
            else (left < right) & (prev_l >= prev_r)
        )
        out &= prev_valid
    return out & valid


def simulate_rules(
    universe: dict[int, Series], start: int, d: dict, capital: float, slippage_bps: float
) -> SimResult:
    ids = list(universe)
    dates = universe[ids[0]].dates
    n = len(dates)
    combine = np.logical_and.reduce if d.get("entryLogic", "ALL") == "ALL" else np.logical_or.reduce
    entries = {i: combine([condition_series(universe[i], c) for c in d["entry"]]) for i in ids}
    exits_when = {
        i: (
            np.logical_or.reduce([condition_series(universe[i], c) for c in d["exit"]["when"]])
            if d["exit"].get("when")
            else None
        )
        for i in ids
    }
    ex = d["exit"]
    max_pos = int(d.get("maxPositions", 5))
    costs = d.get("costs", "DELIVERY") == "DELIVERY"
    grow = accrual(dates, float(d.get("cashRatePct", 0)))
    slip = slippage_bps / 10_000

    cash = capital
    open_pos: dict[int, dict] = {}
    pending_entry: list[int] = []
    pending_exit: dict[int, str] = {}
    closed: list[Trade] = []
    values = np.zeros(n - start)
    days_invested = 0

    for k, t in enumerate(range(start, n)):
        if k:
            cash *= grow[t]
        # 1. Fill yesterday's decisions at today's open.
        for i, reason in list(pending_exit.items()):
            p = open_pos.pop(i)
            price = universe[i].open[t] * (1 - slip)
            turnover = price * p["qty"]
            fee = delivery_charges(turnover, "S") if costs else 0.0
            cash += turnover - fee
            p["trade"].exit_at, p["trade"].exit_price = dates[t], float(price)
            p["trade"].charges += fee
            p["trade"].pnl = float((price - p["trade"].entry_price) * p["qty"] - p["trade"].charges)
            p["trade"].exit_reason = reason
            closed.append(p["trade"])
        pending_exit.clear()
        for i in pending_entry:
            slots = max_pos - len(open_pos)
            if slots <= 0 or i in open_pos:
                continue
            price = universe[i].open[t] * (1 + slip)
            budget = cash / slots
            qty = np.floor(budget / (price * 1.0012)) if price > 0 else 0  # leave room for charges
            if qty < 1:
                continue
            turnover = price * qty
            fee = delivery_charges(turnover, "B") if costs else 0.0
            cash -= turnover + fee
            open_pos[i] = {
                "qty": qty,
                "entry_idx": t,
                "peak": price,
                "trade": Trade(i, float(qty), dates[t], float(price), charges=fee),
            }
        pending_entry = []

        # 2. Mark to market on the close and read today's signals for tomorrow.
        held = 0.0
        for i, p in open_pos.items():
            c = universe[i].close[t]
            held += p["qty"] * c
            p["peak"] = max(p["peak"], c)
            entry = p["trade"].entry_price
            reason = None
            if ex.get("stopPct") and c <= entry * (1 - ex["stopPct"] / 100):
                reason = "STOP"
            elif ex.get("targetPct") and c >= entry * (1 + ex["targetPct"] / 100):
                reason = "TARGET"
            elif ex.get("trailPct") and c <= p["peak"] * (1 - ex["trailPct"] / 100):
                reason = "TRAIL"
            elif ex.get("maxBars") and t - p["entry_idx"] >= ex["maxBars"]:
                reason = "TIME"
            elif exits_when[i] is not None and exits_when[i][t]:
                reason = "SIGNAL"
            if reason and t < n - 1:
                pending_exit[i] = reason
        if open_pos:
            days_invested += 1
        values[k] = cash + held
        if t < n - 1:
            pending_entry = [i for i in ids if i not in open_pos and entries[i][t]]

    # Close what's still open at the last close, so every trade has a result.
    for i, p in open_pos.items():
        price = universe[i].close[n - 1]
        fee = delivery_charges(price * p["qty"], "S") if costs else 0.0
        p["trade"].exit_at, p["trade"].exit_price = dates[n - 1], float(price)
        p["trade"].charges += fee
        p["trade"].pnl = float((price - p["trade"].entry_price) * p["qty"] - p["trade"].charges)
        p["trade"].exit_reason = "END_OF_TEST"
        closed.append(p["trade"])

    wins = [tr.pnl for tr in closed if tr.pnl and tr.pnl > 0]
    losses = [-tr.pnl for tr in closed if tr.pnl is not None and tr.pnl <= 0]
    holds = [(tr.exit_at - tr.entry_at).days for tr in closed if tr.exit_at]
    return SimResult(
        dates[start:],
        values,
        np.zeros(n - start),
        sorted(closed, key=lambda tr: tr.entry_at),
        {
            "trades": len(closed),
            "win_rate": len(wins) / len(closed) if closed else 0.0,
            # None when there were no losing trades: the ratio is undefined, not infinite.
            "profit_factor": (sum(wins) / sum(losses)) if losses and sum(losses) > 0 else None,
            "avg_hold_days": float(np.mean(holds)) if holds else 0.0,
            "exposure": days_invested / max(1, n - start),
            "charges": float(sum(tr.charges for tr in closed)),
        },
    )
