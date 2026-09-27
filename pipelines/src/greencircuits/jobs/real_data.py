"""Replace the demo dataset with real market data, for running GreenCircuits locally.

    uv run python -m greencircuits.jobs.real_data            # everything
    uv run python -m greencircuits.jobs.real_data --only prices,snapshot
    uv run python -m greencircuits.jobs.real_data --refresh  # ignore today's cache

It writes into the same tables the demo seed fills, so the API, the lab, the feed and the
company pages switch to real data without changing. `pnpm db:seed` switches back.

Sources (free, unofficial, personal use only; see docs/adr/0007):
- Yahoo Finance: ten years of daily prices, financial statements, results dates;
- NSE's website: shareholding, board meetings, FII/DII flows, IPOs;
- niftyindices.com: index membership.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from bisect import bisect_right
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any

import numpy as np
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from ..lab.indicators import ema, rsi, sma
from .http import CACHE_DIR, Fetcher
from .sources import (
    COMMODITY_TO_INR,
    NIFTY_LISTS,
    Bar,
    Financials,
    index_members,
    nse_board_meetings,
    nse_fii_dii,
    nse_ipos,
    nse_shareholding,
    yahoo_financials,
    yahoo_history,
    yahoo_symbol,
)

DSN = os.environ.get("DATABASE_URL", "postgres://greencircuits:greencircuits@localhost:55432/greencircuits")
ISSUER_OFFSET = 1000  # equity issuer and security ids are 1000 + the instrument id
NIFTY, USDINR = 1, 400
CRORE = 1e7
STEPS = ["membership", "prices", "financials", "shareholding", "events", "flows", "ipos", "snapshot"]


@dataclass
class Instrument:
    id: int
    symbol: str
    kind: str
    name: str
    attrs: dict[str, Any]

    @property
    def equity(self) -> bool:
        return self.kind == "LISTING"

    @property
    def issuer_id(self) -> int:
        return ISSUER_OFFSET + self.id


@dataclass
class Context:
    conn: psycopg.Connection
    fetch: Fetcher
    today: str
    instruments: list[Instrument]
    bars: dict[int, list[Bar]] = field(default_factory=dict)
    dividends: dict[int, dict[date, float]] = field(default_factory=dict)
    financials: dict[int, Financials] = field(default_factory=dict)
    problems: list[str] = field(default_factory=list)

    def warn(self, message: str) -> None:
        self.problems.append(message)
        print(f"    ! {message}")

    @property
    def equities(self) -> list[Instrument]:
        return [i for i in self.instruments if i.equity]


def ist_today() -> str:
    return (datetime.now(UTC) + timedelta(hours=5, minutes=30)).date().isoformat()


# -------------------------------------------------------------------- membership


def load_membership(ctx: Context) -> int:
    by_symbol = {i.symbol: i.id for i in ctx.equities}
    written = 0
    for index_id in NIFTY_LISTS:
        try:
            symbols = index_members(ctx.fetch, index_id, ctx.today)
        except Exception as err:  # noqa: BLE001 — one list failing shouldn't stop the others
            ctx.warn(f"index {index_id}: {err}")
            continue
        members = [by_symbol[s] for s in symbols if s in by_symbol]
        ctx.conn.execute("DELETE FROM ref.index_constituent WHERE index_id = %s", (index_id,))
        with ctx.conn.cursor() as cur:
            cur.executemany(
                "INSERT INTO ref.index_constituent (index_id, member_id, valid_during) VALUES (%s, %s, daterange(%s::date, NULL))",
                [(index_id, m, ctx.today) for m in members],
            )
        written += len(members)
    # The Sensex has no free official list. Its sample membership would pass for the real one, so it goes.
    ctx.conn.execute("DELETE FROM ref.index_constituent WHERE NOT (index_id = ANY(%s))", (list(NIFTY_LISTS),))
    return written


# ------------------------------------------------------------------------ prices


def _returns(closes: np.ndarray) -> np.ndarray:
    return closes[1:] / closes[:-1] - 1


def _convert(bars: list[Bar], factor: float, fx: list[Bar]) -> list[Bar]:
    """Dollar prices into rupees at each day's USD/INR (the last rate on or before that day)."""
    days = [b.day for b in fx]
    out = []
    for b in bars:
        k = bisect_right(days, b.day) - 1
        if k < 0:
            continue
        rate = fx[k].close * factor
        out.append(Bar(b.day, b.open * rate, b.high * rate, b.low * rate, b.close * rate, b.volume))
    return out


def load_prices(ctx: Context) -> int:
    fx = yahoo_history(ctx.fetch, "USDINR=X", ctx.today).bars
    written = 0
    for inst in ctx.instruments:
        symbol = yahoo_symbol(inst.id, inst.symbol)
        try:
            history = yahoo_history(ctx.fetch, symbol, ctx.today)
        except Exception as err:  # noqa: BLE001
            ctx.warn(f"{inst.symbol} ({symbol}): no prices, {err}")
            continue
        bars = (
            _convert(history.bars, COMMODITY_TO_INR[inst.id], fx)
            if inst.id in COMMODITY_TO_INR
            else history.bars
        )
        if not bars:
            ctx.warn(f"{inst.symbol}: no bars")
            continue
        if len(bars) < 30:
            # Yahoo has no history for a few indices, only the latest close. Real days already
            # stored are kept, so the history builds up one run at a time.
            ctx.warn(f"{inst.symbol}: Yahoo has only {len(bars)} recent bars; keeping earlier real days")
        ctx.dividends[inst.id] = history.dividends
        # Replace the demo rows, and the real rows the new data covers.
        ctx.conn.execute(
            "DELETE FROM md.candle_1d WHERE instrument_id = %s AND (source <> 'YAHOO' OR trade_date >= %s)",
            (inst.id, bars[0].day),
        )
        before = ctx.conn.execute(
            "SELECT close FROM md.candle_1d WHERE instrument_id = %s AND trade_date < %s ORDER BY trade_date DESC LIMIT 1",
            (inst.id, bars[0].day),
        ).fetchone()
        with (
            ctx.conn.cursor() as cur,
            cur.copy(
                "COPY md.candle_1d (instrument_id, trade_date, open, high, low, close, last_price, prev_close, volume, turnover, source) FROM STDIN"
            ) as copy,
        ):
            prev = before["close"] if before else None
            for b in bars:
                turnover = b.volume * (b.high + b.low + b.close) / 3 if inst.equity else None
                copy.write_row(
                    (
                        inst.id,
                        b.day,
                        b.open,
                        b.high,
                        b.low,
                        b.close,
                        b.close,
                        prev,
                        b.volume,
                        turnover,
                        "YAHOO",
                    )
                )
                prev = b.close
        written += len(bars)
        if len(bars) < 30:
            stored = ctx.conn.execute(
                "SELECT trade_date, open, high, low, close, volume FROM md.candle_1d WHERE instrument_id = %s ORDER BY trade_date",
                (inst.id,),
            ).fetchall()
            bars = [
                Bar(r["trade_date"], r["open"], r["high"], r["low"], r["close"], int(r["volume"] or 0))
                for r in stored
            ]
        ctx.bars[inst.id] = bars

        closes = np.array([b.close for b in bars])
        rets = _returns(closes[-251:])
        attrs = {
            "yahoo": symbol,
            "prevClose": round(float(closes[-1]), 4),
            "vol": round(float(np.std(rets, ddof=1) * math.sqrt(252)), 4)
            if len(rets) > 20
            else inst.attrs.get("vol"),
            "avgVolume": int(np.mean([b.volume for b in bars[-20:]])),
            "dataSource": "REAL",
        }
        if inst.id in COMMODITY_TO_INR:
            attrs["usdPerUnit"] = COMMODITY_TO_INR[inst.id]
        ctx.conn.execute(
            "UPDATE ref.instrument SET attrs = attrs || %s WHERE id = %s", (Jsonb(attrs), inst.id)
        )

    # Beta against the Nifty 50 over the last year, on dates both traded.
    nifty = {b.day: b.close for b in ctx.bars.get(NIFTY, [])}
    for inst in ctx.equities:
        bars = [b for b in ctx.bars.get(inst.id, [])[-252:] if b.day in nifty]
        if len(bars) < 60:
            continue
        stock = _returns(np.array([b.close for b in bars]))
        market = _returns(np.array([nifty[b.day] for b in bars]))
        beta = float(np.cov(stock, market)[0, 1] / np.var(market, ddof=1))
        ctx.conn.execute(
            "UPDATE ref.instrument SET attrs = attrs || %s WHERE id = %s",
            (Jsonb({"beta": round(beta, 3)}), inst.id),
        )
    return written


# -------------------------------------------------------------------- financials


def _fiscal(end: date) -> tuple[int, int]:
    """(fiscal year, quarter) for a period end: India's year ends in March, so June is Q1."""
    fy = end.year + 1 if end.month > 3 else end.year
    return fy, (end.month - 4) % 12 // 3 + 1


def _first(rows: dict[str, dict[date, float]], names: tuple[str, ...], day: date) -> float | None:
    for name in names:
        value = rows.get(name, {}).get(day)
        if value is not None:
            return value
    return None


def _pl(rows: dict[str, dict[date, float]], day: date) -> dict[str, float] | None:
    """Our profit-and-loss lines from Yahoo's, as the company page reads them (Indian presentation)."""
    revenue = _first(rows, ("Total Revenue", "Operating Revenue"), day)
    pat = _first(
        rows,
        ("Net Income Common Stockholders", "Net Income", "Net Income Including Noncontrolling Interests"),
        day,
    )
    if revenue is None or pat is None:
        return None
    pbt = _first(rows, ("Pretax Income",), day) or 0.0
    tax = _first(rows, ("Tax Provision",), day) or 0.0
    depreciation = (
        _first(
            rows,
            (
                "Reconciled Depreciation",
                "Depreciation And Amortization In Income Statement",
                "Depreciation Amortization Depletion",
            ),
            day,
        )
        or 0.0
    )
    interest = _first(rows, ("Interest Expense", "Interest Expense Non Operating"), day) or 0.0
    other = max(
        0.0,
        (_first(rows, ("Other Non Operating Income Expenses",), day) or 0.0)
        + (_first(rows, ("Interest Income Non Operating",), day) or 0.0),
    )
    ebitda = _first(rows, ("EBITDA", "Normalized EBITDA"), day)
    operating = (ebitda - other) if ebitda is not None else (pbt + depreciation + interest - other)
    eps = _first(rows, ("Diluted EPS", "Basic EPS"), day)
    return {
        "revenue": revenue,
        "expenses": revenue - operating,
        "operating_profit": operating,
        "other_income": other,
        "depreciation": depreciation,
        "interest": interest,
        "pbt": pbt,
        "tax": tax,
        "pat": pat,
        "eps": eps if eps is not None else 0.0,
    }


def _bs(rows: dict[str, dict[date, float]], day: date) -> dict[str, float] | None:
    total = _first(rows, ("Total Assets",), day)
    equity = _first(
        rows, ("Stockholders Equity", "Common Stock Equity", "Total Equity Gross Minority Interest"), day
    )
    if total is None or equity is None:
        return None
    capital = _first(rows, ("Capital Stock", "Common Stock"), day) or 0.0
    borrowings = _first(rows, ("Total Debt",), day) or 0.0
    fixed = _first(rows, ("Net PPE",), day) or 0.0
    cwip = _first(rows, ("Construction In Progress",), day) or 0.0
    investments = (
        _first(
            rows,
            ("Investmentin Financial Assets", "Investments And Advances", "Long Term Equity Investment"),
            day,
        )
        or 0.0
    )
    return {
        "equity_capital": capital,
        "reserves": equity - capital,
        "borrowings": borrowings,
        "other_liabilities": total - equity - borrowings,
        "total_liabilities": total,
        "fixed_assets": fixed,
        "cwip": cwip,
        "investments": investments,
        "other_assets": total - fixed - cwip - investments,
        "total_assets": total,
    }


def _cf(rows: dict[str, dict[date, float]], day: date) -> dict[str, float] | None:
    cfo = _first(rows, ("Operating Cash Flow",), day)
    if cfo is None:
        return None
    cfi = _first(rows, ("Investing Cash Flow",), day) or 0.0
    cff = _first(rows, ("Financing Cash Flow",), day) or 0.0
    return {
        "cfo": cfo,
        "cfi": cfi,
        "cff": cff,
        "net_cash_flow": _first(rows, ("Changes In Cash",), day) or cfo + cfi + cff,
    }


def _periods(rows: dict[str, dict[date, float]]) -> list[date]:
    return sorted({d for values in rows.values() for d in values})


def _table_from_json(d: dict[str, dict[str, float]]) -> dict[str, dict[date, float]]:
    return {k: {date.fromisoformat(x): v for x, v in vals.items()} for k, vals in d.items()}


def _table_to_json(d: dict[str, dict[date, float]]) -> dict[str, dict[str, float]]:
    return {k: {x.isoformat(): v for x, v in vals.items()} for k, vals in d.items()}


def _financials_cached(ctx: Context, inst: Instrument, symbol: str) -> Financials:
    """yfinance does its own fetching, so its results are cached here, one file per company per day."""
    path = CACHE_DIR / ctx.today / f"yfinance-{inst.symbol}.json"
    if path.exists() and not ctx.fetch.refresh:
        raw = json.loads(path.read_text(encoding="utf-8"))
        table = _table_from_json
        return Financials(
            raw["info"],
            table(raw["annual"]),
            table(raw["quarterly"]),
            table(raw["balance"]),
            table(raw["cashflow"]),
            raw["calendar"],
        )
    f = yahoo_financials(symbol)
    flat = _table_to_json
    calendar = {
        k: [x.isoformat() for x in (v if isinstance(v, list) else [v]) if hasattr(x, "isoformat")]
        for k, v in f.calendar.items()
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "info": f.info,
                "annual": flat(f.annual),
                "quarterly": flat(f.quarterly),
                "balance": flat(f.balance),
                "cashflow": flat(f.cashflow),
                "calendar": calendar,
            }
        ),
        encoding="utf-8",
    )
    time.sleep(0.8)  # yfinance makes several requests per company; keep the pace gentle
    return Financials(f.info, f.annual, f.quarterly, f.balance, f.cashflow, calendar)


def _cagr(later: float | None, earlier: float | None, years: int) -> float | None:
    if later is None or earlier is None or later <= 0 or earlier <= 0:
        return None
    return ((later / earlier) ** (1 / years) - 1) * 100


def load_financials(ctx: Context) -> int:
    written = 0
    for inst in ctx.equities:
        symbol = yahoo_symbol(inst.id, inst.symbol)
        try:
            f = _financials_cached(ctx, inst, symbol)
        except Exception as err:  # noqa: BLE001
            ctx.warn(f"{inst.symbol}: no financials, {err}")
            continue
        ctx.financials[inst.id] = f
        statements: list[tuple[str, str, date, dict[str, float]]] = []
        for day in _periods(f.annual):
            if (pl := _pl(f.annual, day)) is not None:
                statements.append(("PL", "FY", day, pl))
        for day in _periods(f.quarterly):
            if (pl := _pl(f.quarterly, day)) is not None:
                statements.append(("PL", "Q", day, pl))
        for day in _periods(f.balance):
            if (bs := _bs(f.balance, day)) is not None:
                statements.append(("BS", "FY", day, bs))
        for day in _periods(f.cashflow):
            if (cf := _cf(f.cashflow, day)) is not None:
                statements.append(("CF", "FY", day, cf))
        if not statements:
            ctx.warn(f"{inst.symbol}: financials came back empty")
            continue

        conn = ctx.conn
        conn.execute("DELETE FROM corp.financial_statement WHERE issuer_id = %s", (inst.issuer_id,))
        conn.execute("DELETE FROM corp.metric_value WHERE issuer_id = %s", (inst.issuer_id,))
        for statement, period_type, day, values in statements:
            fy, q = _fiscal(day)
            sid = conn.execute(
                "INSERT INTO corp.financial_statement (issuer_id, statement, consolidated, period_type, period_end, fiscal_year, fiscal_period, audited, source, source_ref) "
                "VALUES (%s, %s, true, %s, %s, %s, %s, %s, 'YAHOO', %s) RETURNING id",
                (
                    inst.issuer_id,
                    statement,
                    period_type,
                    day,
                    fy,
                    q if period_type == "Q" else None,
                    period_type == "FY",
                    f"{symbol}:{statement}:{period_type}:{day}",
                ),
            ).fetchone()["id"]
            with conn.cursor() as cur:
                cur.executemany(
                    "INSERT INTO corp.financial_value (statement_id, item_code, value) VALUES (%s, %s, %s)",
                    [(sid, code, round(v, 2)) for code, v in values.items() if math.isfinite(v)],
                )
            written += len(values)

        # Ratios from the latest year, the way the company page shows them.
        annual = sorted((d, v) for s, p, d, v in statements if s == "PL" and p == "FY")
        sheets = sorted((d, v) for s, p, d, v in statements if s == "BS")
        if annual:
            last_day, last = annual[-1]
            equity = sheets[-1][1]["equity_capital"] + sheets[-1][1]["reserves"] if sheets else None
            prev_equity = (
                sheets[-2][1]["equity_capital"] + sheets[-2][1]["reserves"] if len(sheets) > 1 else equity
            )
            avg_equity = (equity + prev_equity) / 2 if equity and prev_equity else equity
            debt = sheets[-1][1]["borrowings"] if sheets else None
            three_back = next((v for d, v in annual if d.year == last_day.year - 3), None)
            shares = f.info.get("sharesOutstanding") or 0
            price = ctx.bars[inst.id][-1].close if ctx.bars.get(inst.id) else None
            trailing_divs = sum(
                v
                for d, v in ctx.dividends.get(inst.id, {}).items()
                if d > date.fromisoformat(ctx.today) - timedelta(days=365)
            )
            metrics = {
                "roe_pct": last["pat"] / avg_equity * 100 if avg_equity else None,
                "roce_pct": (last["pbt"] + last["interest"]) / (equity + (debt or 0)) * 100
                if equity
                else None,
                "opm_pct": last["operating_profit"] / last["revenue"] * 100 if last["revenue"] else None,
                "npm_pct": last["pat"] / last["revenue"] * 100 if last["revenue"] else None,
                "debt_to_equity": debt / equity if equity and debt is not None else None,
                "sales_cagr_3y_pct": _cagr(last["revenue"], three_back["revenue"] if three_back else None, 3),
                "profit_cagr_3y_pct": _cagr(last["pat"], three_back["pat"] if three_back else None, 3),
                "book_value_per_share": f.info.get("bookValue")
                or (equity / shares if equity and shares else None),
                "eps_ttm": f.info.get("trailingEps") or last["eps"],
                "div_yield_pct": trailing_divs / price * 100 if price else None,
            }
            with conn.cursor() as cur:
                cur.executemany(
                    "INSERT INTO corp.metric_value (issuer_id, metric_code, consolidated, period_type, period_end, value) VALUES (%s, %s, true, 'FY', %s, %s)",
                    [
                        (
                            inst.issuer_id,
                            code,
                            last_day,
                            round(v, 4) if v is not None and math.isfinite(v) else None,
                        )
                        for code, v in metrics.items()
                    ],
                )
        if f.info.get("longBusinessSummary"):
            conn.execute(
                "UPDATE ref.issuer SET description = %s, website = COALESCE(%s, website) WHERE id = %s",
                (f.info["longBusinessSummary"], f.info.get("website"), inst.issuer_id),
            )
        if f.info.get("sharesOutstanding"):
            conn.execute(
                "UPDATE ref.instrument SET attrs = attrs || %s WHERE id = %s",
                (Jsonb({"sharesCr": round(f.info["sharesOutstanding"] / CRORE, 4)}), inst.id),
            )
        written += _valuations(ctx, inst, f, annual)
    return written


def _valuations(
    ctx: Context, inst: Instrument, f: Financials, annual: list[tuple[date, dict[str, float]]]
) -> int:
    """Daily P/E, P/B, market cap and dividend yield, using only the earnings public on each day:
    a year's EPS from two months after it ends, the trailing four quarters' once the latest quarter is out."""
    bars = ctx.bars.get(inst.id)
    if not bars:
        return 0
    known = [(d + timedelta(days=60), v["eps"]) for d, v in annual if v.get("eps")]
    quarters = sorted(_periods(f.quarterly))
    if quarters and f.info.get("trailingEps"):
        known.append((quarters[-1] + timedelta(days=45), f.info["trailingEps"]))
    known.sort()
    shares = f.info.get("sharesOutstanding") or 0
    book = f.info.get("bookValue") or 0
    dividends = sorted(ctx.dividends.get(inst.id, {}).items())
    ctx.conn.execute("DELETE FROM corp.valuation_daily WHERE security_id = %s", (inst.issuer_id,))
    days = [k[0] for k in known]
    rows = []
    for b in bars:
        k = bisect_right(days, b.day) - 1
        eps = known[k][1] if k >= 0 else None
        paid = sum(v for d, v in dividends if b.day - timedelta(days=365) < d <= b.day)
        rows.append(
            (
                inst.issuer_id,
                b.day,
                b.close * shares / CRORE if shares else None,
                b.close / eps if eps and eps > 0 else None,
                b.close / book if book > 0 else None,
                paid / b.close * 100 if paid else 0.0,
            )
        )
    with (
        ctx.conn.cursor() as cur,
        cur.copy(
            "COPY corp.valuation_daily (security_id, trade_date, mcap_cr, pe_ttm, pb, div_yield_pct) FROM STDIN"
        ) as copy,
    ):
        for r in rows:
            copy.write_row(r)
    return len(rows)


# ------------------------------------------------------------------ shareholding


def load_shareholding(ctx: Context) -> int:
    written = 0
    for inst in ctx.equities:
        try:
            rows = nse_shareholding(ctx.fetch, inst.symbol, ctx.today)
        except Exception as err:  # noqa: BLE001
            ctx.warn(f"{inst.symbol}: no shareholding, {err}")
            continue
        if not rows:
            continue
        ctx.conn.execute("DELETE FROM corp.shareholding WHERE security_id = %s", (inst.issuer_id,))
        with ctx.conn.cursor() as cur:
            # NSE's summary splits holdings into promoters and the public; the finer split is in each filing's XBRL.
            cur.executemany(
                "INSERT INTO corp.shareholding (security_id, period_end, category, holding_pct) VALUES (%s, %s, %s, %s)",
                [
                    (inst.issuer_id, d, cat, pct)
                    for d, promoter, public in rows
                    for cat, pct in (("PROMOTER", promoter), ("OTHER_PUBLIC", public))
                ],
            )
        written += 2 * len(rows)
    return written


# ------------------------------------------------------------------------ events


def load_events(ctx: Context) -> int:
    today = date.fromisoformat(ctx.today)
    by_symbol = {i.symbol: i for i in ctx.equities}
    events: dict[tuple[int, str, date], str] = {}
    try:
        for symbol, day, purpose in nse_board_meetings(ctx.fetch, ctx.today):
            inst = by_symbol.get(symbol)
            if inst and day >= today and "result" in purpose.lower():
                events[(inst.issuer_id, "RESULTS", day)] = purpose[:200]
    except Exception as err:  # noqa: BLE001
        ctx.warn(f"NSE board meetings: {err}")
    for inst in ctx.equities:
        calendar = ctx.financials.get(inst.id).calendar if inst.id in ctx.financials else {}
        for text in calendar.get("Earnings Date", []):
            day = date.fromisoformat(str(text)[:10])
            already = any(
                k[0] == inst.issuer_id and k[1] == "RESULTS" and abs((k[2] - day).days) <= 7 for k in events
            )
            if day >= today and not already:
                events[(inst.issuer_id, "RESULTS", day)] = "Results (expected)"
        for text in calendar.get("Ex-Dividend Date", []):
            day = date.fromisoformat(str(text)[:10])
            if day >= today:
                events[(inst.issuer_id, "DIVIDEND_RECORD", day)] = "Ex-dividend and record date"
    ctx.conn.execute(
        "DELETE FROM corp.event WHERE issuer_id = ANY(%s)", ([i.issuer_id for i in ctx.equities],)
    )
    with ctx.conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO corp.event (issuer_id, event_type, event_date, purpose) VALUES (%s, %s, %s, %s)",
            [(issuer, kind, day, purpose) for (issuer, kind, day), purpose in events.items()],
        )
    return len(events)


# ------------------------------------------------------------------------- flows


def load_flows(ctx: Context) -> int:
    rows = nse_fii_dii(ctx.fetch, ctx.today)
    # The demo series is stored as final; NSE's figures are provisional. Real days accumulate run by run.
    ctx.conn.execute("DELETE FROM md.institutional_flow WHERE NOT is_provisional")
    with ctx.conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO md.institutional_flow (trade_date, participant, segment, buy_value, sell_value, is_provisional) VALUES (%s, %s, 'CASH', %s, %s, true) "
            "ON CONFLICT (trade_date, participant, segment) DO UPDATE SET buy_value = EXCLUDED.buy_value, sell_value = EXCLUDED.sell_value",
            [(d, participant, buy, sell) for d, participant, buy, sell in rows],
        )
    return len(rows)


# -------------------------------------------------------------------------- IPOs

IPO_ISSUERS = range(3000, 3100)


def load_ipos(ctx: Context) -> int:
    ipos = nse_ipos(ctx.fetch, ctx.today)
    conn = ctx.conn
    # The calendar is replaced wholesale; alerts on its IPOs would point at issues that no longer exist.
    conn.execute("DELETE FROM app.alert WHERE ipo_issue_id IS NOT NULL")
    conn.execute("DELETE FROM ipo.listing")
    conn.execute("DELETE FROM ipo.issue")
    conn.execute("DELETE FROM ref.issuer WHERE id >= %s AND id < %s", (IPO_ISSUERS.start, IPO_ISSUERS.stop))
    for n, ipo in enumerate(ipos[: len(IPO_ISSUERS)]):
        issuer = IPO_ISSUERS.start + n
        conn.execute(
            "INSERT INTO ref.issuer (id, name, issuer_type, fs_format) OVERRIDING SYSTEM VALUE VALUES (%s, %s, 'COMPANY', 'GENERAL')",
            (issuer, ipo["name"]),
        )
        issue = conn.execute(
            "INSERT INTO ipo.issue (issuer_id, board, pricing, exchanges, status, price_band_low, price_band_high, open_date, close_date) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
            (
                issuer,
                ipo["board"],
                "FIXED_PRICE" if ipo["board"] == "SME" else "BOOK_BUILT",
                ["NSE"],
                ipo["status"],
                ipo["price_low"],
                ipo["price_high"],
                ipo["open"],
                ipo["close"],
            ),
        ).fetchone()["id"]
        if ipo["subscribed"] is not None:
            conn.execute(
                "INSERT INTO ipo.subscription (issue_id, category, captured_at, times) VALUES (%s, 'TOTAL', now(), %s)",
                (issue, ipo["subscribed"]),
            )
    return len(ipos)


# ---------------------------------------------------------------------- snapshot


def _pct(a: float | None, b: float | None) -> float | None:
    return (a / b - 1) * 100 if a and b else None


def _ago(closes: np.ndarray, n: int) -> float | None:
    return float(closes[-1 - n]) if len(closes) > n else None


def _yoy(values: list[Any] | None) -> float | None:
    """Growth of the latest year over the one before, from values newest first."""
    if not values or len(values) < 2 or values[1] is None or values[0] is None:
        return None
    return _pct(float(values[0]), float(values[1]))


def load_snapshot(ctx: Context) -> int:
    """The screener's row per stock, which peers and sector medians are drawn from."""
    conn = ctx.conn
    members: dict[int, list[int]] = {}
    for r in conn.execute(
        "SELECT index_id, member_id FROM ref.index_constituent WHERE upper_inf(valid_during)"
    ):
        members.setdefault(r["member_id"], []).append(r["index_id"])
    metrics = {
        (r["issuer_id"], r["metric_code"]): r["value"]
        for r in conn.execute(
            "SELECT DISTINCT ON (issuer_id, metric_code) issuer_id, metric_code, value FROM corp.metric_value ORDER BY issuer_id, metric_code, period_end DESC"
        )
    }
    promoter = {
        r["security_id"]: float(r["holding_pct"])
        for r in conn.execute(
            "SELECT DISTINCT ON (security_id) security_id, holding_pct FROM corp.shareholding WHERE category = 'PROMOTER' ORDER BY security_id, period_end DESC"
        )
    }
    growth = {
        r["issuer_id"]: r
        for r in conn.execute(
            "SELECT fs.issuer_id, "
            "  (array_agg(fv.value ORDER BY fs.period_end DESC) FILTER (WHERE fv.item_code = 'revenue'))[1:2] AS revenue, "
            "  (array_agg(fv.value ORDER BY fs.period_end DESC) FILTER (WHERE fv.item_code = 'pat'))[1:2] AS pat "
            "FROM corp.financial_statement fs JOIN corp.financial_value fv ON fv.statement_id = fs.id "
            "WHERE fs.statement = 'PL' AND fs.period_type = 'FY' GROUP BY fs.issuer_id"
        )
    }
    # Earlier steps updated shares and beta in the database; read them afresh.
    attrs = {r["id"]: r["attrs"] or {} for r in conn.execute("SELECT id, attrs FROM ref.instrument")}
    written = 0
    now = datetime.now(UTC)
    for inst in ctx.equities:
        inst.attrs = attrs.get(inst.id, inst.attrs)
        bars = ctx.bars.get(inst.id)
        if not bars or len(bars) < 2:
            continue
        closes = np.array([b.close for b in bars])
        price, prev = float(closes[-1]), float(closes[-2])
        year = bars[-250:]
        high, low = max(b.high for b in year), min(b.low for b in year)
        mine = {code: value for (issuer, code), value in metrics.items() if issuer == inst.issuer_id}
        eps, book = mine.get("eps_ttm"), mine.get("book_value_per_share")
        shares = (inst.attrs.get("sharesCr") or 0) * CRORE
        g = growth.get(inst.issuer_id) or {}
        daily = _returns(closes[-251:])
        row = {
            "price": price,
            "change_pct": _pct(price, prev),
            "return_1w_pct": _pct(price, _ago(closes, 5)),
            "return_1m_pct": _pct(price, _ago(closes, 21)),
            "return_3m_pct": _pct(price, _ago(closes, 63)),
            "return_1y_pct": _pct(price, _ago(closes, 250)),
            "cagr_3y_pct": _cagr(price, _ago(closes, 750), 3),
            "cagr_5y_pct": _cagr(price, _ago(closes, 1250), 5),
            "high_52w": high,
            "low_52w": low,
            "from_52w_high_pct": _pct(price, high),
            "avg_volume_20d": float(np.mean([b.volume for b in bars[-20:]])),
            "avg_turnover_20d_cr": float(np.mean([b.volume * b.close for b in bars[-20:]])) / CRORE,
            "mcap_cr": price * shares / CRORE if shares else None,
            "pe_ttm": price / eps if eps and eps > 0 else None,
            "pb": price / book if book and book > 0 else None,
            "div_yield_pct": mine.get("div_yield_pct"),
            "roe_pct": mine.get("roe_pct"),
            "roce_pct": mine.get("roce_pct"),
            "opm_pct": mine.get("opm_pct"),
            "npm_pct": mine.get("npm_pct"),
            "sales_growth_yoy_pct": _yoy(g.get("revenue")),
            "profit_growth_yoy_pct": _yoy(g.get("pat")),
            "sales_cagr_3y_pct": mine.get("sales_cagr_3y_pct"),
            "profit_cagr_3y_pct": mine.get("profit_cagr_3y_pct"),
            "eps_ttm": eps,
            "debt_to_equity": mine.get("debt_to_equity"),
            "promoter_pct": promoter.get(inst.issuer_id),
            "rsi_14": float(rsi(closes, 14)[-1]),
            "sma_50": float(sma(closes, 50)[-1]),
            "sma_200": float(sma(closes, 200)[-1]),
            "ema_20": float(ema(closes, 20)[-1]),
            "beta_1y": inst.attrs.get("beta"),
            "volatility_1y_pct": float(np.std(daily, ddof=1) * math.sqrt(252) * 100)
            if len(daily) > 20
            else None,
            "index_ids": members.get(inst.id, []),
            "price_updated_at": now,
            "eod_updated_at": now,
        }
        clean = {k: (None if isinstance(v, float) and not math.isfinite(v) else v) for k, v in row.items()}
        sets = ", ".join(f"{k} = %({k})s" for k in clean)
        written += conn.execute(
            f"UPDATE scr.equity_snapshot SET {sets} WHERE instrument_id = %(id)s", {**clean, "id": inst.id}
        ).rowcount
    return written


# -------------------------------------------------------------------------- main

STEP_FUNCTIONS: dict[str, Callable[[Context], int]] = {
    "membership": load_membership,
    "prices": load_prices,
    "financials": load_financials,
    "shareholding": load_shareholding,
    "events": load_events,
    "flows": load_flows,
    "ipos": load_ipos,
    "snapshot": load_snapshot,
}


def _reload_bars(ctx: Context) -> None:
    """When prices aren't being refreshed, later steps read the bars already in the database."""
    for r in ctx.conn.execute(
        "SELECT instrument_id, trade_date, open, high, low, close, volume FROM md.candle_1d WHERE source = 'YAHOO' ORDER BY trade_date"
    ):
        ctx.bars.setdefault(r["instrument_id"], []).append(
            Bar(r["trade_date"], r["open"], r["high"], r["low"], r["close"], int(r["volume"] or 0))
        )


def clear_api_caches() -> int:
    """The API caches company pages and the day's context for a few minutes; drop them so the new data shows."""
    import redis

    client = redis.Redis.from_url(os.environ.get("VALKEY_URL", "redis://localhost:6380"))
    try:
        patterns = ("gc:company:*", "gc:today:*", "gc:universe:*", "gc:screener:*", "gc:overview:*")
        keys = [k for pattern in patterns for k in client.scan_iter(pattern, count=500)]
        return client.delete(*keys) if keys else 0
    except redis.RedisError:
        return 0
    finally:
        client.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Load real market data into the local database.")
    parser.add_argument("--only", help=f"comma-separated steps to run: {', '.join(STEPS)}")
    parser.add_argument("--skip", help="comma-separated steps to leave out")
    parser.add_argument(
        "--refresh", action="store_true", help="fetch again even if today's responses are cached"
    )
    args = parser.parse_args(argv)
    steps = [
        s
        for s in STEPS
        if (not args.only or s in args.only.split(",")) and s not in (args.skip or "").split(",")
    ]

    today = ist_today()
    with psycopg.connect(DSN, row_factory=dict_row) as conn:
        instruments = [
            Instrument(r["id"], r["trading_symbol"], r["kind"], r["display_name"], r["attrs"] or {})
            for r in conn.execute(
                "SELECT id, trading_symbol, kind, display_name, attrs FROM ref.instrument WHERE status = 'ACTIVE' AND kind <> 'OPTION' ORDER BY id"
            )
        ]
        ctx = Context(conn, Fetcher(refresh=args.refresh), today, instruments)
        run = conn.execute(
            "INSERT INTO ops.job_run (job_name, business_date, attempt, status, started_at) VALUES ('real_data', %s, "
            "(SELECT COALESCE(max(attempt), 0) + 1 FROM ops.job_run WHERE job_name = 'real_data' AND business_date = %s), 'RUNNING', now()) RETURNING id",
            (today, today),
        ).fetchone()["id"]
        conn.commit()
        if "prices" not in steps:
            _reload_bars(ctx)
        counts: dict[str, int] = {}
        print(
            f"Loading real data for {len(instruments)} instruments ({today}). Responses are cached in {CACHE_DIR}."
        )
        for step in steps:
            started = time.monotonic()
            print(f"  {step}...", flush=True)
            try:
                counts[step] = STEP_FUNCTIONS[step](ctx)
                conn.commit()
            except Exception as err:  # noqa: BLE001 — record the failure and carry on with the next step
                conn.rollback()
                ctx.warn(f"{step} failed: {type(err).__name__}: {err}")
                counts[step] = 0
            print(f"    {counts[step]} rows in {time.monotonic() - started:.1f}s")
        status = "SUCCEEDED" if any(counts.values()) else "FAILED"
        meta = Jsonb({"steps": counts, "problems": ctx.problems[:100]})
        # One success per day is the rule; a second successful run that day updates the first.
        earlier = conn.execute(
            "SELECT id FROM ops.job_run WHERE job_name = 'real_data' AND business_date = %s AND status = 'SUCCEEDED' AND id <> %s",
            (today, run),
        ).fetchone()
        if status == "SUCCEEDED" and earlier:
            conn.execute("DELETE FROM ops.job_run WHERE id = %s", (run,))
            run = earlier["id"]
        conn.execute(
            "UPDATE ops.job_run SET status = %s, finished_at = now(), rows_written = %s, meta = %s WHERE id = %s",
            (status, sum(counts.values()), meta, run),
        )
        conn.commit()
    print(f"Cleared {clear_api_caches()} cached API responses.")
    if ctx.problems:
        print(f"Done with {len(ctx.problems)} problems (listed above; also in ops.job_run).")
    else:
        print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
