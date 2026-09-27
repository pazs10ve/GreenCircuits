"""Runs one backtest from its lab.backtest_run row and writes the results.

The run row is the durable record: the queue only carries its id. The engine
claims the row (QUEUED → RUNNING), reads the strategy version and daily bars,
simulates, and writes metrics, the equity curve, monthly returns and trades in
one transaction, or marks the run FAILED with the error.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta, timezone
from typing import Any

import numpy as np
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .metrics import downsample, drawdown_series, monthly_returns, summarise
from .simulate import (
    Series,
    SimResult,
    simulate_deposit,
    simulate_hold,
    simulate_rebalance,
    simulate_rules,
    simulate_sip,
    time_weighted,
)

BENCHMARK_ID = 1  # NIFTY 50
WARMUP_DAYS = 420  # enough history for a 200-day average or a 52-week high on the first test day
OUT_OF_SAMPLE_SHARE = 0.3
DEPOSIT_RATE_PCT = 7.0  # what a SIP in the index is compared with: a bank fixed deposit


def instruments_of(d: dict[str, Any]) -> list[int]:
    return list(d["universe"]) if d["type"] == "rules" else [int(d["instrumentId"])]


def alternative(
    d: dict[str, Any], data: dict[int, Series], ids: list[int], start: int, capital: float
) -> tuple[str, SimResult]:
    """What a strategy is judged against, since "did it make money?" is the wrong question.

    - a SIP that waits for dips, against investing every month anyway;
    - a SIP in a stock, against the same SIP in the index;
    - a SIP in the index, against the same money in a fixed deposit;
    - an equity and bond mix, against holding only the equity;
    - trading rules, against buying the same stocks on day one and holding them.
    """
    if d["type"] == "sip":
        monthly = float(d["monthly"])
        if d.get("dip"):
            return "plain_sip", simulate_sip(data[ids[0]], start, monthly)
        if ids[0] != BENCHMARK_ID:
            return "sip_in_benchmark", simulate_sip(data[BENCHMARK_ID], start, monthly)
        return "deposit", simulate_deposit(data[ids[0]].dates, start, monthly, DEPOSIT_RATE_PCT)
    if d["type"] == "rebalance":
        return "all_equity", simulate_rebalance(data[ids[0]], start, capital, 100, 0)
    costs = d.get("costs", "DELIVERY") == "DELIVERY"
    return "buy_and_hold", simulate_hold({i: data[i] for i in ids}, start, capital, costs)


def load_series(conn: psycopg.Connection, ids: list[int], start: date, end: date) -> dict[int, Series]:
    """Daily bars for each instrument on one shared calendar, forward-filling any gaps."""
    rows = conn.execute(
        "SELECT instrument_id, trade_date, open, high, low, close FROM md.candle_1d "
        "WHERE instrument_id = ANY(%s) AND trade_date BETWEEN %s AND %s ORDER BY trade_date",
        (ids, start, end),
    ).fetchall()
    dates = sorted({r["trade_date"] for r in rows})
    index = {d: k for k, d in enumerate(dates)}
    out: dict[int, Series] = {}
    for i in ids:
        arr = np.full((4, len(dates)), np.nan)
        for r in rows:
            if r["instrument_id"] == i:
                arr[:, index[r["trade_date"]]] = (r["open"], r["high"], r["low"], r["close"])
        for k in range(1, len(dates)):
            if np.isnan(arr[3, k]):
                arr[:, k] = arr[3, k - 1]
        out[i] = Series(dates, arr[0], arr[1], arr[2], arr[3])
    return out


def _epoch(d: date) -> int:
    return int(datetime.combine(d, time(0), tzinfo=UTC).timestamp())


def execute(dsn: str, run_id: str, worker_id: str) -> str:
    """Run the backtest; returns the final status."""
    with psycopg.connect(dsn, row_factory=dict_row) as conn:
        run = conn.execute(
            "UPDATE lab.backtest_run SET status = 'RUNNING', started_at = now(), worker_id = %s, "
            "attempts = attempts + 1, progress_pct = 0, error = NULL "
            "WHERE id = %s AND status IN ('QUEUED', 'RUNNING') "
            "RETURNING id, strategy_id, strategy_version, date_from, date_to, initial_capital, slippage_bps, params",
            (worker_id, run_id),
        ).fetchone()
        conn.commit()
        if run is None:
            return "SKIPPED"  # cancelled, or already finished by another worker
        try:
            definition = conn.execute(
                "SELECT definition FROM lab.strategy_version WHERE strategy_id = %s AND version = %s",
                (run["strategy_id"], run["strategy_version"]),
            ).fetchone()["definition"]
            _write(conn, run, definition)
            conn.commit()
            return "SUCCEEDED"
        except Exception as err:
            conn.rollback()
            conn.execute(
                "UPDATE lab.backtest_run SET status = 'FAILED', finished_at = now(), error = %s WHERE id = %s",
                (f"{type(err).__name__}: {err}"[:500], run_id),
            )
            conn.commit()
            raise


def _progress(conn: psycopg.Connection, run_id: str, pct: float) -> None:
    conn.execute("UPDATE lab.backtest_run SET progress_pct = %s WHERE id = %s", (pct, run_id))
    conn.commit()


def _write(conn: psycopg.Connection, run: dict[str, Any], d: dict[str, Any]) -> None:
    run_id = run["id"]
    capital = float(run["initial_capital"])
    ids = instruments_of(d)
    data = load_series(
        conn, sorted({*ids, BENCHMARK_ID}), run["date_from"] - timedelta(days=WARMUP_DAYS), run["date_to"]
    )
    dates = data[ids[0]].dates
    # Start on the requested date, or later if an instrument (or the benchmark) has no prices yet.
    first_valid = max(
        int(np.flatnonzero(~np.isnan(data[i].close))[0]) for i in data if np.any(~np.isnan(data[i].close))
    )
    start = next((k for k, x in enumerate(dates) if x >= run["date_from"] and k >= first_valid), None)
    if start is None or len(dates) - start < 20:
        raise ValueError("Not enough price history in the chosen date range")
    _progress(conn, run_id, 20)

    sim: SimResult
    if d["type"] == "sip":
        sim = simulate_sip(data[ids[0]], start, float(d["monthly"]), d.get("dip"))
    elif d["type"] == "rebalance":
        sim = simulate_rebalance(data[ids[0]], start, capital, float(d["equityPct"]), float(d["bondRatePct"]))
    else:
        sim = simulate_rules({i: data[i] for i in ids}, start, d, capital, float(run["slippage_bps"]))
    for tr in sim.trades:
        if tr.instrument_id == 0:
            tr.instrument_id = ids[0]
    _progress(conn, run_id, 70)

    rets = time_weighted(sim.values, sim.flows)
    ret_dates = sim.dates[1:]
    metrics: dict[str, Any] = summarise(rets, ret_dates) | sim.extra
    metrics["final_value"] = float(sim.values[-1])
    metrics["effective_from"] = sim.dates[0].isoformat()
    base = sim.extra.get("invested", capital)
    metrics["total_return"] = float(sim.values[-1] / base - 1) if base else 0.0

    split = int(len(ret_dates) * (1 - OUT_OF_SAMPLE_SHARE))
    oos_from = ret_dates[split]
    metrics["in_sample"] = summarise(rets[:split], ret_dates[:split])
    metrics["out_of_sample"] = summarise(rets[split:], ret_dates[split:])

    kind, alt = alternative(d, data, ids, start, capital)
    alt_rets = time_weighted(alt.values, alt.flows)
    alt_base = alt.extra.get("invested", capital)
    metrics["alternative"] = summarise(alt_rets, ret_dates) | {
        "kind": kind,
        "final_value": float(alt.values[-1]),
        "total_return": float(alt.values[-1] / alt_base - 1) if alt_base else 0.0,
        "in_sample": summarise(alt_rets[:split], ret_dates[:split]),
        "out_of_sample": summarise(alt_rets[split:], ret_dates[split:]),
    }
    if "xirr" in alt.extra:
        metrics["alternative"]["xirr"] = alt.extra["xirr"]

    bench = data[BENCHMARK_ID].close[start:]
    bench_values = capital * bench / bench[0]
    bench_rets = bench[1:] / bench[:-1] - 1
    benchmark = summarise(bench_rets, ret_dates) | {"instrument_id": BENCHMARK_ID}

    # The report's chart: the account's value (v) against the alternative's (a); for a SIP,
    # the money put in so far (inv), otherwise the benchmark on the same capital (b). The
    # drawdown (dd) is on time-weighted returns, so instalments can't hide a fall.
    growth = np.concatenate([[1.0], np.cumprod(1 + rets)])
    dd = drawdown_series(growth)
    is_sip = d["type"] == "sip"
    invested = np.cumsum(sim.flows)
    sample = []
    for k in downsample(len(sim.dates)):
        point = {
            "t": _epoch(sim.dates[k]),
            "v": round(float(sim.values[k]), 2),
            "a": round(float(alt.values[k]), 2),
            "dd": round(float(dd[k]), 6),
        }
        if is_sip:
            point["inv"] = round(float(invested[k]), 2)
        else:
            point["b"] = round(float(bench_values[k]), 2)
        sample.append(point)

    conn.execute("DELETE FROM lab.backtest_trade WHERE run_id = %s", (run_id,))
    conn.execute("DELETE FROM lab.backtest_result WHERE run_id = %s", (run_id,))
    conn.execute(
        "INSERT INTO lab.backtest_result (run_id, metrics, oos_from, equity_sample, monthly_returns, benchmark) VALUES (%s, %s, %s, %s, %s, %s)",
        (
            run_id,
            Jsonb(_finite(metrics)),
            oos_from,
            Jsonb(sample),
            Jsonb(monthly_returns(rets, ret_dates)),
            Jsonb(_finite(benchmark)),
        ),
    )
    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO lab.backtest_trade (run_id, trade_no, instrument_id, side, quantity, entry_at, entry_price, exit_at, exit_price, charges, pnl, exit_reason) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            [
                (
                    run_id,
                    no,
                    tr.instrument_id,
                    tr.side,
                    round(tr.quantity, 4),
                    datetime.combine(
                        tr.entry_at, time(9, 15), tzinfo=timezone(timedelta(hours=5, minutes=30))
                    ),
                    tr.entry_price,
                    datetime.combine(tr.exit_at, time(9, 15), tzinfo=timezone(timedelta(hours=5, minutes=30)))
                    if tr.exit_at
                    else None,
                    tr.exit_price,
                    round(tr.charges, 2),
                    round(tr.pnl, 2) if tr.pnl is not None else None,
                    tr.exit_reason,
                )
                for no, tr in enumerate(sim.trades, start=1)
            ],
        )
    conn.execute(
        "UPDATE lab.backtest_run SET status = 'SUCCEEDED', progress_pct = 100, finished_at = now() WHERE id = %s",
        (run_id,),
    )


def _finite(obj: Any) -> Any:
    """JSON has no NaN or infinity; store them as null."""
    if isinstance(obj, dict):
        return {k: _finite(v) for k, v in obj.items()}
    if isinstance(obj, float) and not np.isfinite(obj):
        return None
    if isinstance(obj, (np.floating,)):
        return _finite(float(obj))
    if isinstance(obj, (np.integer,)):
        return int(obj)
    return obj
