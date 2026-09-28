"""Replace the demo dataset with real market data, for running GreenCircuits locally.

    uv run python -m greencircuits.jobs.real_data            # everything
    uv run python -m greencircuits.jobs.real_data --only prices,snapshot
    uv run python -m greencircuits.jobs.real_data --refresh  # ignore today's cache

It writes into the same tables the demo seed fills, so the API, the lab, the feed and the
company pages switch to real data without changing. `pnpm db:seed` switches back.

Sources (free, unofficial, personal use only; see docs/adr/0007):
- Yahoo Finance: ten years of daily prices, financial statements, results dates;
- NSE's website: shareholding, board meetings, FII/DII flows, IPOs, ETF NAVs;
- niftyindices.com: index membership;
- AMFI and mfapi.in: mutual fund schemes and their NAV history.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
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
from .bonds import ListedBond, bond_name, fit_curve, parse_company, parse_gold_bond, parse_government, ytm_of
from .catalog import fund_name, plain_name
from .cleaning import repair_fund_bars
from .http import CACHE_DIR, Fetcher
from .sources import (
    COMMODITY_TO_INR,
    NIFTY_LISTS,
    NSE,
    NSE_HEADERS,
    Bar,
    Financials,
    amfi_schemes,
    fund_category,
    index_members,
    ist_today,
    mfapi_history,
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
#: What a character AMFI's file can't encode arrives as.
REPLACEMENT = "\ufffd"
STEPS = [
    "membership", "prices", "financials", "shareholding", "events", "flows", "ipos", "funds", "bonds", "snapshot",
]  # fmt: skip


@dataclass
class Instrument:
    id: int
    symbol: str
    kind: str
    name: str
    attrs: dict[str, Any]
    #: A listing's security: EQUITY for a company's shares, ETF, REIT or INVIT for a listed fund.
    security_type: str | None = None

    @property
    def equity(self) -> bool:
        """A company's shares: only these have results, shareholding and board meetings."""
        return self.kind == "LISTING" and self.security_type in (None, "EQUITY")

    @property
    def listed(self) -> bool:
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

    def checkpoint(self, step: str, done: int, total: int, every: int = 50) -> None:
        """Every `every` stocks: say how far a long step has got, and commit, so a failure later keeps the work."""
        if done and done % every == 0 and done < total:
            self.conn.commit()
            print(f"    {step}: {done} of {total}", flush=True)


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
    for n, inst in enumerate(ctx.instruments):
        ctx.checkpoint("prices", n, len(ctx.instruments))
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
        if inst.security_type == "ETF":
            # Yahoo leaves many ETF unit splits unadjusted, and has the odd faulty day. Indices and
            # commodities have lower ids, so what the fund follows is already loaded.
            follows = {b.day: b.close for b in ctx.bars.get(inst.attrs.get("tracks") or NIFTY, [])}
            bars, fixes = repair_fund_bars(bars, follows)
            for fix in fixes:
                ctx.warn(f"{inst.symbol}: {fix}")
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
                turnover = b.volume * (b.high + b.low + b.close) / 3 if inst.listed else None
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
    for inst in (i for i in ctx.instruments if i.listed):
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


#: The exchange-rate series for statements Yahoo reports in another currency.
FX_INSTRUMENTS = {"USD": 400, "EUR": 401, "GBP": 402}
#: Yahoo's statement lines that count shares or give a rate rather than an amount of money.
NOT_MONEY = re.compile(r"Shares|Share Issued|Tax Rate")


def _in_rupees(ctx: Context, f: Financials, currency: str) -> Financials | None:
    """Statements in another currency, converted at the exchange rate on each period's last day."""
    bars = ctx.bars.get(FX_INSTRUMENTS.get(currency, -1))
    if not bars:
        return None
    days = [b.day for b in bars]

    def rate(day: date) -> float:
        return bars[max(bisect_right(days, day) - 1, 0)].close

    def convert(table: dict[str, dict[date, float]]) -> dict[str, dict[date, float]]:
        return {
            line: values if NOT_MONEY.search(line) else {d: v * rate(d) for d, v in values.items()}
            for line, values in table.items()
        }

    return Financials(
        f.info, convert(f.annual), convert(f.quarterly), convert(f.balance), convert(f.cashflow), f.calendar
    )


def load_financials(ctx: Context) -> int:
    written = 0
    equities = ctx.equities
    for n, inst in enumerate(equities):
        ctx.checkpoint("financials", n, len(equities), every=25)
        symbol = yahoo_symbol(inst.id, inst.symbol)
        if inst.id not in ctx.dividends:
            # Without the prices step in this run, the dividend yield and its history would read as none:
            # take the dividends from the price history, which today's cache usually holds.
            try:
                ctx.dividends[inst.id] = yahoo_history(ctx.fetch, symbol, ctx.today).dividends
            except Exception as err:  # noqa: BLE001
                ctx.warn(f"{inst.symbol}: no dividends, {err}")
        try:
            f = _financials_cached(ctx, inst, symbol)
        except Exception as err:  # noqa: BLE001
            ctx.warn(f"{inst.symbol}: no financials, {err}")
            continue
        if (currency := f.info.get("financialCurrency") or "INR") != "INR":
            converted = _in_rupees(ctx, f, currency)
            if converted is None:
                ctx.warn(f"{inst.symbol}: statements are in {currency}, and there's no rate to convert them")
                continue
            f = converted
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
    equities = ctx.equities
    for n, inst in enumerate(equities):
        ctx.checkpoint("shareholding", n, len(equities))
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


# ------------------------------------------------------------------------- funds

#: A scheme with fewer NAVs on record than this gets its whole history fetched.
HISTORY_KNOWN = 30


def load_funds(ctx: Context) -> int:
    """Mutual funds and ETF NAVs.

    Every open-ended scheme's direct growth plan from AMFI's daily file, with that day's NAV; the
    first time a scheme is seen, its whole NAV history from mfapi.in; then each scheme's returns.
    And each listed ETF's NAV from NSE, to show how far its price strays from what it holds.
    """
    conn = ctx.conn
    rows = []
    seen: set[int] = set()
    for s in amfi_schemes(ctx.fetch, ctx.today):
        if s.structure != "Open Ended" or s.plan != "Direct" or s.option != "Growth" or not s.nav:
            continue
        category = fund_category(s.category, s.name)
        if category is None or s.code in seen:
            continue
        seen.add(s.code)
        rows.append((s, *category))
    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO mf.scheme (code, isin, name, amc, amfi_category, asset_class, category, nav, nav_date) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (code) DO UPDATE SET "
            "name = EXCLUDED.name, amc = EXCLUDED.amc, amfi_category = EXCLUDED.amfi_category, "
            "asset_class = EXCLUDED.asset_class, category = EXCLUDED.category, nav = EXCLUDED.nav, "
            "nav_date = EXCLUDED.nav_date, updated_at = now()",
            [
                (
                    s.code,
                    s.isin,
                    fund_name(s.name.replace(REPLACEMENT, "'")),
                    s.amc,
                    s.category,
                    asset,
                    cat,
                    s.nav,
                    s.nav_date,
                )
                for s, asset, cat in rows
            ],
        )
        cur.executemany(
            "INSERT INTO mf.nav (scheme_code, nav_date, nav) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
            [(s.code, s.nav_date, s.nav) for s, _, _ in rows if s.nav_date],
        )
    conn.commit()

    counts = {
        r["scheme_code"]: r["n"]
        for r in conn.execute("SELECT scheme_code, count(*) AS n FROM mf.nav GROUP BY scheme_code")
    }
    need = [s for s, _, _ in rows if counts.get(s.code, 0) < HISTORY_KNOWN]
    written = len(rows)
    for n, s in enumerate(need):
        ctx.checkpoint("fund histories", n, len(need), every=100)
        try:
            history = mfapi_history(ctx.fetch, s.code, ctx.today)
        except Exception as err:  # noqa: BLE001 — one scheme's history failing shouldn't stop the rest
            ctx.warn(f"scheme {s.code}: no NAV history, {err}")
            continue
        with conn.cursor() as cur:
            cur.execute(
                "CREATE TEMP TABLE IF NOT EXISTS nav_in (nav_date date, nav numeric) ON COMMIT DELETE ROWS"
            )
            with cur.copy("COPY nav_in (nav_date, nav) FROM STDIN") as copy:
                for day, nav in history:
                    copy.write_row((day, nav))
            cur.execute(
                "INSERT INTO mf.nav (scheme_code, nav_date, nav) SELECT %s, nav_date, nav FROM nav_in "
                "ON CONFLICT DO NOTHING",
                (s.code,),
            )
            cur.execute("TRUNCATE nav_in")
        written += len(history)

    # Returns to each scheme's latest NAV, from the NAV on or before the same date 1, 3, 5 and 10 years back.
    conn.execute(
        """
        WITH r AS (
          SELECT s.code,
            (SELECT min(nav_date) FROM mf.nav n WHERE n.scheme_code = s.code) AS launched,
            (SELECT nav FROM mf.nav n WHERE n.scheme_code = s.code AND n.nav_date <= s.nav_date - interval '1 year'
               ORDER BY nav_date DESC LIMIT 1) AS y1,
            (SELECT nav FROM mf.nav n WHERE n.scheme_code = s.code AND n.nav_date <= s.nav_date - interval '3 years'
               ORDER BY nav_date DESC LIMIT 1) AS y3,
            (SELECT nav FROM mf.nav n WHERE n.scheme_code = s.code AND n.nav_date <= s.nav_date - interval '5 years'
               ORDER BY nav_date DESC LIMIT 1) AS y5,
            (SELECT nav FROM mf.nav n WHERE n.scheme_code = s.code AND n.nav_date <= s.nav_date - interval '10 years'
               ORDER BY nav_date DESC LIMIT 1) AS y10
          FROM mf.scheme s
        )
        UPDATE mf.scheme s SET
          launched_on = r.launched,
          return_1y_pct = CASE WHEN r.y1 > 0 THEN (s.nav / r.y1 - 1) * 100 END,
          cagr_3y_pct = CASE WHEN r.y3 > 0 THEN (power(s.nav / r.y3, 1.0 / 3) - 1) * 100 END,
          cagr_5y_pct = CASE WHEN r.y5 > 0 THEN (power(s.nav / r.y5, 1.0 / 5) - 1) * 100 END,
          cagr_10y_pct = CASE WHEN r.y10 > 0 THEN (power(s.nav / r.y10, 1.0 / 10) - 1) * 100 END
        FROM r WHERE r.code = s.code
        """
    )

    # ETFs: NSE publishes each one's NAV beside its price.
    try:
        body = ctx.fetch.json(f"{NSE}/etf", ctx.today, NSE_HEADERS)
        nav_date = body.get("navDate")
        navs = {
            r["symbol"]: float(r["nav"]) for r in body.get("data", []) if r.get("nav") not in (None, "", "-")
        }
        with conn.cursor() as cur:
            cur.executemany(
                "UPDATE ref.instrument i SET attrs = i.attrs || %s FROM ref.security s "
                "WHERE s.id = i.security_id AND s.security_type = 'ETF' AND i.trading_symbol = %s",
                [(Jsonb({"nav": nav, "navDate": nav_date}), symbol) for symbol, nav in navs.items()],
            )
    except Exception as err:  # noqa: BLE001
        ctx.warn(f"ETF NAVs: {err}")
    return written


# ------------------------------------------------------------------------- bonds

#: The demo's sample bonds: issuers 2000–2099 and securities 2100–2199 (packages/db/src/seed/fixed-income.ts).
SAMPLE_BOND_ISSUERS, SAMPLE_BONDS = range(2000, 2100), range(2100, 2200)
BOND_ISSUER_TYPE = {
    "GSEC": "CENTRAL_GOVT",
    "TBILL": "CENTRAL_GOVT",
    "SGB": "CENTRAL_GOVT",
    "SDL": "STATE_GOVT",
}
BOND_TERMS = {  # coupon type, day count
    "TBILL": ("ZERO", "ACT/364"),
    "GSEC": ("FIXED", "30/360"),
    "SDL": ("FIXED", "30/360"),
    "SGB": ("FIXED", "ACT/365"),
    "CORPORATE_BOND": ("FIXED", "ACT/365"),
}


def _bond_security(conn: psycopg.Connection, b: ListedBond, issuer_id: int) -> int:
    """The security row for a bond, found by ISIN (a gold bond, which NSE lists without one, by name)."""
    name = bond_name(b)
    found = (
        conn.execute("SELECT id FROM ref.security WHERE isin = %s", (b.isin,)).fetchone()
        if b.isin
        else conn.execute(
            "SELECT id FROM ref.security WHERE security_type = 'SGB' AND name = %s", (name,)
        ).fetchone()
    )
    if found:
        conn.execute(
            "UPDATE ref.security SET name = %s, issuer_id = %s, face_value = %s, updated_at = now() WHERE id = %s",
            (name, issuer_id, b.face_value, found["id"]),
        )
        return found["id"]
    return conn.execute(
        "INSERT INTO ref.security (issuer_id, security_type, isin, name, face_value) VALUES (%s, %s, %s, %s, %s) RETURNING id",
        (issuer_id, b.kind, b.isin or None, name, b.face_value),
    ).fetchone()["id"]


def load_bonds(ctx: Context) -> int:
    """Bonds listed on NSE: government and state bonds, T-bills, company bonds and gold bonds, with the
    day's price and yield, company bonds' ratings, and the government's yield curve fitted to its bonds."""
    conn = ctx.conn
    today = date.fromisoformat(ctx.today)
    gov = ctx.fetch.json(f"{NSE}/liveBonds-traded-on-cm?type=gsec", ctx.today, NSE_HEADERS).get("data") or []
    corp = (
        ctx.fetch.json(f"{NSE}/liveBonds-traded-on-cm?type=bonds", ctx.today, NSE_HEADERS).get("data") or []
    )
    gold = ctx.fetch.json(f"{NSE}/sovereign-gold-bonds", ctx.today, NSE_HEADERS).get("data") or []
    # A company's bonds share the first seven characters of its shares' ISIN, which names the company.
    issuers_by_code = {
        r["isin"][:7]: r["name"]
        for r in conn.execute(
            "SELECT s.isin, iss.name FROM ref.security s JOIN ref.issuer iss ON iss.id = s.issuer_id "
            "WHERE s.security_type = 'EQUITY' AND s.isin IS NOT NULL"
        )
    }
    parsed = [
        *(parse_government(r) for r in gov),
        *(parse_company(r, issuers_by_code) for r in corp),
        *(parse_gold_bond(r) for r in gold),
    ]
    bonds = [b for b in parsed if b is not None and b.maturity > today and b.price]

    # The demo's sample bonds would pass for real ones beside them.
    sample = list(SAMPLE_BONDS)
    for table in ("fi.price_daily", "corp.credit_rating", "fi.cashflow", "fi.bond"):
        conn.execute(f"DELETE FROM {table} WHERE security_id = ANY(%s)", (sample,))
    conn.execute("DELETE FROM ref.security WHERE id = ANY(%s)", (sample,))
    conn.execute(
        "DELETE FROM ref.issuer i WHERE i.id = ANY(%s) AND NOT EXISTS (SELECT 1 FROM ref.security s WHERE s.issuer_id = i.id)",
        (list(SAMPLE_BOND_ISSUERS),),
    )

    issuer_ids = {r["name"]: r["id"] for r in conn.execute("SELECT id, name FROM ref.issuer")}
    written = 0
    curve_points: list[tuple[float, float]] = []
    for b in bonds:
        issuer_name = "Government of India" if b.kind == "SGB" else b.issuer
        if issuer_name not in issuer_ids:
            issuer_ids[issuer_name] = conn.execute(
                "INSERT INTO ref.issuer (name, issuer_type) VALUES (%s, %s) RETURNING id",
                (issuer_name, BOND_ISSUER_TYPE.get(b.kind, "COMPANY")),
            ).fetchone()["id"]
        issuer_id = issuer_ids[issuer_name]
        sid = _bond_security(conn, b, issuer_id)
        coupon_type, day_count = BOND_TERMS[b.kind]
        conn.execute(
            "INSERT INTO fi.bond (security_id, maturity_date, face_value, coupon_type, coupon_rate_pct, coupon_frequency, day_count) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT (security_id) DO UPDATE SET maturity_date = EXCLUDED.maturity_date, "
            "face_value = EXCLUDED.face_value, coupon_type = EXCLUDED.coupon_type, coupon_rate_pct = EXCLUDED.coupon_rate_pct, "
            "coupon_frequency = EXCLUDED.coupon_frequency, day_count = EXCLUDED.day_count",
            (sid, b.maturity, b.face_value, coupon_type, b.coupon, b.frequency, day_count),
        )
        ytm = ytm_of(b, today)
        conn.execute(
            "INSERT INTO fi.price_daily (security_id, trade_date, venue, clean_price, ytm_pct, trades) "
            "VALUES (%s, %s, 'NSE', %s, %s, %s) ON CONFLICT (security_id, trade_date, venue) DO UPDATE SET "
            "clean_price = EXCLUDED.clean_price, ytm_pct = EXCLUDED.ytm_pct, trades = EXCLUDED.trades",
            (sid, today, b.price, ytm, b.volume),
        )
        if b.rating and b.agency:
            conn.execute("DELETE FROM corp.credit_rating WHERE security_id = %s", (sid,))
            conn.execute(
                "INSERT INTO corp.credit_rating (issuer_id, security_id, agency, scale, rating, rated_on) "
                "VALUES (%s, %s, %s, 'LONG_TERM', %s, %s)",
                (issuer_id, sid, b.agency, b.rating, today),
            )
        # The curve is drawn through the government bonds that traded today with three years or more to run. Bills
        # trade too thinly on NSE's retail market for their yields to mean much, and a bond's maturity is known only
        # to the year, which matters less the longer it has to run.
        if b.kind == "GSEC" and ytm is not None and (b.maturity - today).days > 3 * 365 and 3 < ytm < 12:
            curve_points.append(((b.maturity - today).days / 365.25, ytm))
        written += 1

    curve = fit_curve(curve_points)
    if curve:
        conn.execute("DELETE FROM fi.yield_curve_point WHERE curve = 'GSEC_PAR' AND as_of = %s", (today,))
        with conn.cursor() as cur:
            cur.executemany(
                "INSERT INTO fi.yield_curve_point (curve, as_of, tenor_years, yield_pct) VALUES ('GSEC_PAR', %s, %s, %s)",
                [(today, tenor, round(y, 4)) for tenor, y in curve],
            )
    # The sample curve's month-ago and year-ago points would sit beside the real one as if they were history.
    conn.execute(
        "DELETE FROM fi.yield_curve_point WHERE curve = 'GSEC_PAR' AND as_of <> %s AND as_of NOT IN "
        "(SELECT trade_date FROM fi.price_daily WHERE venue = 'NSE')",
        (today,),
    )
    return written


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
            (issuer, plain_name(ipo["name"])),
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
    "funds": load_funds,
    "bonds": load_bonds,
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
        patterns = (
            "gc:company:*",
            "gc:today:*",
            "gc:universe:*",
            "gc:screener:*",
            "gc:overview:*",
            "gc:funds:*",
        )
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
            Instrument(
                r["id"],
                r["trading_symbol"],
                r["kind"],
                r["display_name"],
                r["attrs"] or {},
                r["security_type"],
            )
            for r in conn.execute(
                "SELECT i.id, i.trading_symbol, i.kind, i.display_name, i.attrs, s.security_type::text AS security_type "
                "FROM ref.instrument i LEFT JOIN ref.security s ON s.id = i.security_id "
                "WHERE i.status = 'ACTIVE' AND i.kind <> 'OPTION' ORDER BY i.id"
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
