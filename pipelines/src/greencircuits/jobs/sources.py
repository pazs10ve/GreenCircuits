"""The free sources behind the real-data mode, each reduced to plain Python values.

- Yahoo Finance: daily prices (split-adjusted), financial statements and results dates.
- NSE's website JSON: shareholding patterns, board meetings, FII/DII flows, IPOs.
- niftyindices.com: index membership (official CSVs).

All unofficial and for personal use on your own machine; see docs/adr/0007.
"""

from __future__ import annotations

import csv
import io
import math
import re
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any
from urllib.parse import quote

from .http import Fetcher

# ----------------------------------------------------------------------- symbols

#: Yahoo symbols for everything that isn't an NSE stock (those are SYMBOL.NS).
YAHOO_SYMBOLS: dict[int, str] = {
    1: "^NSEI",
    2: "^BSESN",
    3: "^NSEBANK",
    4: "^CNXIT",
    5: "NIFTY_MIDCAP_100.NS",
    6: "NIFTY_FIN_SERVICE.NS",
    7: "^INDIAVIX",
    300: "GC=F",
    301: "SI=F",
    302: "CL=F",
    303: "NG=F",
    304: "HG=F",
    305: "ZNC=F",
    306: "ALI=F",
    400: "USDINR=X",
    401: "EURINR=X",
    402: "GBPINR=X",
}

TROY_OUNCE_G = 31.1034768
POUNDS_PER_KG = 2.20462262

#: International futures quoted in dollars, converted to MCX's rupee units at each day's USD/INR.
#: Not MCX's own prices, which include Indian duties: the site says so.
COMMODITY_TO_INR: dict[int, float] = {
    300: 10 / TROY_OUNCE_G,  # gold: USD/oz → ₹ per 10 g
    301: 1000 / TROY_OUNCE_G,  # silver: USD/oz → ₹ per kg
    302: 1.0,  # crude: USD/bbl → ₹ per barrel
    303: 1.0,  # natural gas: USD/mmBtu → ₹ per mmBtu
    304: POUNDS_PER_KG,  # copper: USD/lb → ₹ per kg
    305: 1 / 1000,  # zinc: USD/tonne → ₹ per kg
    306: 1 / 1000,  # aluminium: USD/tonne → ₹ per kg
}


def yahoo_symbol(instrument_id: int, trading_symbol: str) -> str:
    return YAHOO_SYMBOLS.get(instrument_id, f"{trading_symbol}.NS")


# ------------------------------------------------------------------------ prices


@dataclass
class Bar:
    day: date
    open: float
    high: float
    low: float
    close: float
    volume: int


@dataclass
class History:
    bars: list[Bar]
    #: Dividends per share by ex-date, in the listing's currency.
    dividends: dict[date, float] = field(default_factory=dict)
    currency: str = "INR"


def _local_day(ts: int, gmtoffset: int) -> date:
    return (datetime.fromtimestamp(ts, UTC) + timedelta(seconds=gmtoffset)).date()


def yahoo_history(fetch: Fetcher, symbol: str, today: str, years: int = 10) -> History:
    """Daily bars for the last `years` years. Yahoo's OHLC are adjusted for splits and bonus issues."""
    url = (
        f"https://query2.finance.yahoo.com/v8/finance/chart/{quote(symbol)}"
        f"?range={years}y&interval=1d&events=div%7Csplit&includeAdjustedClose=true"
    )
    result = fetch.json(url, today)["chart"]["result"][0]
    offset = int(result["meta"].get("gmtoffset", 0))
    q = result["indicators"]["quote"][0]
    bars: dict[date, Bar] = {}
    for i, ts in enumerate(result.get("timestamp") or []):
        o, h, lo, c, v = (q[k][i] for k in ("open", "high", "low", "close", "volume"))
        if None in (o, h, lo, c) or not all(math.isfinite(x) and x > 0 for x in (o, h, lo, c)):
            continue
        day = _local_day(ts, offset)
        bars[day] = Bar(day, float(o), float(h), float(lo), float(c), int(v or 0))
    dividends = {
        _local_day(int(d["date"]), offset): float(d["amount"])
        for d in (result.get("events") or {}).get("dividends", {}).values()
    }
    return History(
        sorted(bars.values(), key=lambda b: b.day), dividends, result["meta"].get("currency", "INR")
    )


# ------------------------------------------------------------------- financials


def _rows(frame: Any) -> dict[str, dict[date, float]]:
    """A yfinance statement frame as {row label: {period end: value}}, without NaNs."""
    out: dict[str, dict[date, float]] = {}
    if frame is None or getattr(frame, "empty", True):
        return out
    for label, series in frame.iterrows():
        values = {}
        for col, value in series.items():
            if value is not None and not (isinstance(value, float) and math.isnan(value)):
                values[col.date()] = float(value)
        if values:
            out[str(label)] = values
    return out


@dataclass
class Financials:
    info: dict[str, Any]
    annual: dict[str, dict[date, float]]
    quarterly: dict[str, dict[date, float]]
    balance: dict[str, dict[date, float]]
    cashflow: dict[str, dict[date, float]]
    calendar: dict[str, Any]


def yahoo_financials(symbol: str) -> Financials:
    """Statements, key figures and the results calendar, through yfinance (which handles Yahoo's cookies)."""
    import yfinance as yf

    t = yf.Ticker(symbol)
    info = t.info or {}
    try:
        calendar = t.calendar or {}
    except Exception:  # noqa: BLE001 — a missing calendar isn't worth failing a company over
        calendar = {}
    return Financials(
        info={
            k: info.get(k)
            for k in ("longBusinessSummary", "sharesOutstanding", "bookValue", "trailingEps", "website")
        },
        annual=_rows(t.income_stmt),
        quarterly=_rows(t.quarterly_income_stmt),
        balance=_rows(t.balance_sheet),
        cashflow=_rows(t.cashflow),
        calendar={k: v for k, v in calendar.items() if k in ("Earnings Date", "Ex-Dividend Date")},
    )


# ---------------------------------------------------------------------------- NSE

NSE = "https://www.nseindia.com/api"
NSE_HEADERS = {"Referer": "https://www.nseindia.com/", "Accept": "application/json"}


def _nse_date(text: str) -> date:
    for fmt in ("%d-%b-%Y", "%d-%b-%Y %H:%M:%S", "%d-%B-%Y"):
        try:
            return datetime.strptime(text.strip().title(), fmt).replace(tzinfo=UTC).date()
        except ValueError:
            continue
    raise ValueError(f"unrecognised NSE date {text!r}")


def nse_shareholding(fetch: Fetcher, symbol: str, today: str) -> list[tuple[date, float, float]]:
    """(quarter end, promoter %, public %) for each quarterly shareholding pattern.

    Companies also file patterns on other dates (after a bonus issue or a merger); those aren't a
    quarter's, so they're left out.
    """
    rows = fetch.json(
        f"{NSE}/corporate-share-holdings-master?index=equities&symbol={quote(symbol)}", today, NSE_HEADERS
    )
    out = {}
    for r in rows:
        try:
            day = _nse_date(r["date"])
            if day.month % 3 or (day + timedelta(days=1)).day != 1:
                continue
            out[day] = (float(r["pr_and_prgrp"]), float(r["public_val"]))
        except (KeyError, TypeError, ValueError):
            continue
    return sorted((d, p, q) for d, (p, q) in out.items())


def nse_board_meetings(fetch: Fetcher, today: str) -> list[tuple[str, date, str]]:
    """(symbol, date, purpose) for upcoming board meetings."""
    rows = fetch.json(f"{NSE}/event-calendar", today, NSE_HEADERS)
    return [
        (r["symbol"], _nse_date(r["date"]), r.get("purpose") or "")
        for r in rows
        if r.get("symbol") and r.get("date")
    ]


def nse_fii_dii(fetch: Fetcher, today: str) -> list[tuple[date, str, float, float]]:
    """(date, FPI|DII, buy ₹ crore, sell ₹ crore) for the latest session (NSE's provisional figures)."""
    rows = fetch.json(f"{NSE}/fiidiiTradeReact", today, NSE_HEADERS)
    out = []
    for r in rows:
        participant = "DII" if r["category"].upper().startswith("DII") else "FPI"
        out.append((_nse_date(r["date"]), participant, float(r["buyValue"]), float(r["sellValue"])))
    return out


def _band(text: str) -> tuple[float | None, float | None]:
    """The low and high of a price band such as "Rs.159 to Rs.167" (the dot after Rs isn't a decimal point)."""
    numbers = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", re.sub(r"(?<=\d),(?=\d)", "", text or ""))]
    numbers = [n for n in numbers if n > 0]
    if not numbers:
        return None, None
    return min(numbers), max(numbers)


def nse_ipos(fetch: Fetcher, today: str) -> list[dict[str, Any]]:
    """Mainboard and SME IPOs that are open now or opening soon."""
    current = fetch.json(f"{NSE}/ipo-current-issue", today, NSE_HEADERS)
    upcoming = fetch.json(f"{NSE}/all-upcoming-issues?category=ipo", today, NSE_HEADERS)
    out: dict[str, dict[str, Any]] = {}
    for status, rows in (("OPEN", current), ("UPCOMING", upcoming)):
        for r in rows if isinstance(rows, list) else []:
            name = (r.get("companyName") or r.get("company") or "").strip()
            if not name or name in out:
                continue
            try:
                start, end = _nse_date(r["issueStartDate"]), _nse_date(r["issueEndDate"])
            except (KeyError, ValueError):
                continue
            low, high = _band(r.get("issuePrice") or r.get("priceBand") or "")
            out[name] = {
                "name": name,
                "symbol": r.get("symbol"),
                "status": status if start <= date.fromisoformat(today) else "UPCOMING",
                "board": "SME" if (r.get("series") or "").upper() == "SME" else "MAINBOARD",
                "open": start,
                "close": end,
                "price_low": low,
                "price_high": high,
                "subscribed": float(r["noOfTime"]) if r.get("noOfTime") not in (None, "", "-") else None,
            }
    return list(out.values())


# ------------------------------------------------------------------- niftyindices

NIFTY_LISTS = {
    1: "ind_nifty50list.csv",
    3: "ind_niftybanklist.csv",
    4: "ind_niftyitlist.csv",
    5: "ind_niftymidcap100list.csv",
    6: "ind_niftyfinancelist.csv",
}


def index_members(fetch: Fetcher, index_id: int, today: str) -> list[str]:
    """NSE symbols in an index, from the official constituent list."""
    text = fetch.text(f"https://niftyindices.com/IndexConstituent/{NIFTY_LISTS[index_id]}", today)
    return [row["Symbol"].strip() for row in csv.DictReader(io.StringIO(text)) if row.get("Symbol")]
