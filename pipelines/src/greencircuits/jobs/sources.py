"""The free sources behind the real-data mode and the stock catalog, each reduced to plain Python values.

- Yahoo Finance: daily prices (split-adjusted), financial statements, results dates, quotes and profiles.
- NSE's website JSON: shareholding patterns, board meetings, FII/DII flows, IPOs.
- NSE's archive: F&O lot sizes.
- niftyindices.com: index membership (official CSVs).

All unofficial and for personal use on your own machine; see docs/adr/0007.
"""

from __future__ import annotations

import csv
import io
import json
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
    8: "^NSMIDCP",  # Nifty Next 50
    9: "^CRSLDX",  # Nifty 500
    10: "NIFTYMIDCAP150.NS",
    11: "NIFTYSMLCAP250.NS",
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


def ist_today() -> str:
    return (datetime.now(UTC) + timedelta(hours=5, minutes=30)).date().isoformat()


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
            for k in (
                "longBusinessSummary",
                "sharesOutstanding",
                "bookValue",
                "trailingEps",
                "website",
                # The statements' currency, which isn't always the listing's: Infosys reports in dollars.
                "financialCurrency",
            )
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
    8: "ind_niftynext50list.csv",
    9: "ind_nifty500list.csv",
    10: "ind_niftymidcap150list.csv",
    11: "ind_niftysmallcap250list.csv",
}


@dataclass
class Constituent:
    symbol: str
    #: As NSE writes it, "Reliance Industries Ltd.".
    name: str
    #: NSE's sector, such as "Capital Goods" (the lists call it the industry).
    sector: str
    isin: str


def index_list(fetch: Fetcher, index_id: int, today: str) -> list[Constituent]:
    """The companies in an index, from the official constituent list."""
    text = fetch.text(f"https://niftyindices.com/IndexConstituent/{NIFTY_LISTS[index_id]}", today)
    return [
        Constituent(
            row["Symbol"].strip(),
            (row.get("Company Name") or "").strip(),
            (row.get("Industry") or "").strip(),
            (row.get("ISIN Code") or "").strip(),
        )
        for row in csv.DictReader(io.StringIO(text))
        if (row.get("Symbol") or "").strip()
    ]


def index_members(fetch: Fetcher, index_id: int, today: str) -> list[str]:
    """NSE symbols in an index, from the official constituent list."""
    return [c.symbol for c in index_list(fetch, index_id, today)]


# ----------------------------------------------------------------- NSE archives

NSE_ARCHIVES = "https://nsearchives.nseindia.com/content"
ARCHIVE_HEADERS = {"Referer": "https://www.nseindia.com/"}


@dataclass
class ListedEtf:
    symbol: str
    isin: str
    #: What it holds, as NSE words it: "Nifty 50", or sometimes the fund's own name.
    asset: str
    #: EQUITY, COMMODITY, DEBT, GLOBAL INDICES or Hybrid.
    kind: str
    #: What it tracks: "Nifty 50", "GOLD", "Overnight ETFs and Liquid ETF".
    underlying: str


def nse_etfs(fetch: Fetcher, today: str) -> list[ListedEtf]:
    """Every ETF listed on NSE, from its security master."""
    text = fetch.text(f"{NSE_ARCHIVES}/equities/eq_etfseclist.csv", today, ARCHIVE_HEADERS)
    out = []
    for row in csv.DictReader(io.StringIO(text)):
        r = {(k or "").strip(): (v or "").strip() for k, v in row.items()}
        if r.get("Symbol") and r.get("ISINNumber"):
            out.append(
                ListedEtf(
                    r["Symbol"],
                    r["ISINNumber"],
                    r.get("Underlying Asset", ""),
                    r.get("ETF Underlying", ""),
                    r.get("Underlying Key", ""),
                )
            )
    return out


def nse_trusts(fetch: Fetcher, today: str) -> list[tuple[str, str, str]]:
    """(symbol, name, REIT or INVIT) for every listed real-estate and infrastructure trust."""
    text = fetch.text(f"{NSE_ARCHIVES}/equities/sec_list.csv", today, ARCHIVE_HEADERS)
    kinds = {"RR": "REIT", "IV": "INVIT"}
    return [
        (row["Symbol"].strip(), row["Security Name"].strip(), kinds[row["Series"].strip()])
        for row in csv.DictReader(io.StringIO(text))
        if (row.get("Series") or "").strip() in kinds
    ]


# ------------------------------------------------------------------------- AMFI


@dataclass
class AmfiScheme:
    code: int
    #: The growth or payout ISIN, and the reinvestment one.
    isin: str | None
    isin_reinvest: str | None
    name: str
    amc: str
    #: "Open Ended", "Close Ended" or "Interval Fund".
    structure: str
    #: SEBI's category, as AMFI writes it: "Equity Scheme - Large Cap Fund".
    category: str
    #: "Direct" or "Regular" ("" when AMFI doesn't say).
    plan: str
    #: "Growth" or "IDCW" ("" when AMFI doesn't say).
    option: str
    nav: float | None
    nav_date: date | None


_AMFI_HEADER = re.compile(r"^(Open Ended|Close Ended|Interval Fund)\s+Schemes\s*\((.+)\)\s*$")


def _plan_option(name: str, plan: str, option: str) -> tuple[str, str]:
    """AMFI's newer file has columns for these; older rows only say so in the name."""
    text = f"{plan} {option} {name}".lower()
    plan_out = "Direct" if "direct" in text else "Regular" if "regular" in text else ""
    option_out = (
        "Growth"
        if "growth" in text
        else "IDCW"
        if re.search(r"idcw|dividend|payout|reinvest|bonus", text)
        else ""
    )
    return plan_out, option_out


def parse_amfi(text: str) -> list[AmfiScheme]:
    """AMFI's NAVAll.txt: category headings, fund house lines, then one row per scheme."""
    out: list[AmfiScheme] = []
    structure, category, amc = "", "", ""
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("Scheme Code"):
            continue
        if ";" not in line:
            heading = _AMFI_HEADER.match(line)
            if heading:
                structure, category = heading.group(1), re.sub(r"\s+", " ", heading.group(2)).strip()
            else:
                amc = line
            continue
        cells = [c.strip() for c in line.split(";")]
        if len(cells) == 8:
            code, isin, isin_r, name, plan, option, nav, day = cells
        elif len(cells) == 6:
            code, isin, isin_r, name, nav, day = cells
            plan = option = ""
        else:
            continue
        if not code.isdigit():
            continue
        plan, option = _plan_option(name, plan, option)
        try:
            value: float | None = float(nav)
        except ValueError:
            value = None
        try:
            when: date | None = _nse_date(day)
        except ValueError:
            when = None
        out.append(
            AmfiScheme(
                int(code),
                isin if isin not in ("", "-") else None,
                isin_r if isin_r not in ("", "-") else None,
                name,
                amc,
                structure,
                category,
                plan,
                option,
                value,
                when,
            )
        )
    return out


def amfi_schemes(fetch: Fetcher, today: str) -> list[AmfiScheme]:
    """Every mutual fund scheme with its latest NAV, from AMFI's daily file."""
    return parse_amfi(fetch.text("https://www.amfiindia.com/spages/NAVAll.txt", today, legacy_encoding=True))


#: SEBI's categories inside AMFI's headings, in the order they're tried: the first match wins.
_EQUITY = [
    (r"large\s*&\s*mid|large and mid", "Large and mid cap"),
    (r"large cap", "Large cap"),
    (r"mid cap", "Mid cap"),
    (r"small cap", "Small cap"),
    (r"multi cap", "Multi cap"),
    (r"flexi cap", "Flexi cap"),
    (r"focused", "Focused"),
    (r"value|contra", "Value and contra"),
    (r"dividend yield", "Dividend yield"),
    (r"elss|tax saver", "Tax saver (ELSS)"),
    (r"sectoral|thematic", "Sector and theme"),
]
_HYBRID = [
    (r"aggressive", "Aggressive hybrid"),
    (r"balanced advantage|dynamic asset", "Balanced advantage"),
    (r"multi asset", "Multi-asset"),
    (r"arbitrage", "Arbitrage"),
    (r"equity savings", "Equity savings"),
    (r"conservative", "Conservative hybrid"),
    (r"balanced", "Balanced hybrid"),
]
_DEBT = [
    (r"overnight", "Overnight"),
    (r"liquid", "Liquid"),
    (r"money market", "Money market"),
    (r"ultra short", "Ultra short duration"),
    (r"low duration", "Low duration"),
    (r"medium to long", "Medium to long duration"),
    (r"short", "Short duration"),
    (r"medium", "Medium duration"),
    (r"long", "Long duration"),
    (r"dynamic", "Dynamic bond"),
    (r"corporate bond", "Corporate bond"),
    (r"credit risk", "Credit risk"),
    (r"banking and psu|banking & psu", "Banking and PSU"),
    (r"gilt", "Gilt"),
    (r"float", "Floater"),
]


_DEBT_INDEX = re.compile(r"bond|gilt|g-?sec|sdl|crisil|debt|t-?bill|psu|target maturity", re.IGNORECASE)


def fund_category(amfi_category: str, name: str = "") -> tuple[str, str] | None:
    """(asset class, category) for a scheme, from AMFI's heading; None for ETFs, which are listings.

    AMFI's headings vary ("Equity Scheme - Large Cap Fund", "Equity Schemes - Large Cap Fund",
    "Income/Debt Oriented Schemes - Liquid Fund"), so they're matched on words, not spelling. An
    index fund's heading doesn't always say what the index holds; its name does.
    """
    text = re.sub(r"\s+", " ", amfi_category.replace("�", "'")).strip().lower()
    head, _, tail = text.partition(" - ")
    tail = tail or head
    if "etf" in text or "exchange traded" in text:
        return None
    if "index fund" in text:
        return "Index", "Debt index" if "debt" in tail or _DEBT_INDEX.search(name) else "Equity index"
    if "fof" in text or "fund of funds" in text:
        return "Fund of funds", "Overseas" if "overseas" in text else "Domestic"
    if "retirement" in text:
        return "Solution", "Retirement"
    if "children" in text:
        return "Solution", "Children"
    for pattern_list, asset_class, words in (
        (_EQUITY, "Equity", ("equity",)),
        (_HYBRID, "Hybrid", ("hybrid",)),
        (_DEBT, "Debt", ("debt", "income")),
    ):
        if any(w in head for w in words):
            for pattern, category in pattern_list:
                if re.search(pattern, tail):
                    return asset_class, category
            return asset_class, "Other " + asset_class.lower()
    return "Other", tail.strip().capitalize() or "Other"


def mfapi_history(fetch: Fetcher, code: int, today: str) -> list[tuple[date, float]]:
    """A scheme's whole NAV history, oldest first, from mfapi.in (a free mirror of AMFI's data)."""
    body = fetch.json(f"https://api.mfapi.in/mf/{code}", today)
    out = {}
    for row in body.get("data") or []:
        try:
            day = datetime.strptime(row["date"], "%d-%m-%Y").replace(tzinfo=UTC).date()
            nav = float(row["nav"])
        except (KeyError, TypeError, ValueError):
            continue
        if nav > 0:
            out[day] = nav
    return sorted(out.items())


def fo_lots(fetch: Fetcher, today: str) -> dict[str, int]:
    """The lot size of each stock with futures and options on NSE, for the nearest expiry."""
    text = fetch.text(f"{NSE_ARCHIVES}/fo/fo_mktlots.csv", today, ARCHIVE_HEADERS)
    lots: dict[str, int] = {}
    stocks = False
    for line in text.splitlines():
        cells = [c.strip() for c in line.split(",")]
        if len(cells) < 3:
            continue
        # Index contracts come first, then a heading row, then single stocks.
        if cells[0].lower().startswith("derivatives on individual securities"):
            stocks = True
            continue
        lot = next((int(c) for c in cells[2:] if c.isdigit()), None)
        if stocks and cells[1] and lot:
            lots[cells[1]] = lot
    return lots


# ------------------------------------------------------------- Yahoo, in batches


def yahoo_closes(
    fetch: Fetcher, symbols: list[str], today: str, span: str = "1y"
) -> dict[str, dict[date, float]]:
    """Daily closes by symbol from Yahoo's spark endpoint, 20 symbols a request (it has no volumes).

    While a market trades, the last close is the latest price.
    """
    out: dict[str, dict[date, float]] = {}
    for i in range(0, len(symbols), 20):
        chunk = ",".join(quote(s) for s in symbols[i : i + 20])
        body = fetch.json(
            f"https://query1.finance.yahoo.com/v7/finance/spark?symbols={chunk}&range={span}&interval=1d",
            today,
        )
        for r in (body.get("spark") or {}).get("result") or []:
            x = (r.get("response") or [{}])[0]
            offset = int((x.get("meta") or {}).get("gmtoffset", 0))
            closes = (((x.get("indicators") or {}).get("quote") or [{}])[0]).get("close") or []
            out[r["symbol"]] = {
                _local_day(ts, offset): float(c)
                for ts, c in zip(x.get("timestamp") or [], closes, strict=False)
                if c is not None and math.isfinite(c) and c > 0
            }
    return out


class Yahoo:
    """Yahoo's endpoints that want a session cookie and its crumb: batch quotes and company profiles.

    Responses are cached under their URL without the crumb, so a rerun the same day needs neither.
    """

    def __init__(self, fetch: Fetcher) -> None:
        self.fetch = fetch
        self._crumb: str | None = None

    def _crumb_now(self) -> str:
        if self._crumb is None:
            # fc.yahoo.com sets the session cookie (the page itself is a 404); the crumb goes with it.
            self.fetch.client.get("https://fc.yahoo.com")
            res = self.fetch.client.get("https://query2.finance.yahoo.com/v1/test/getcrumb")
            res.raise_for_status()
            self._crumb = res.text.strip()
        return self._crumb

    def _json(self, url: str, today: str) -> Any:
        hit = self.fetch.cached(url, today)
        if hit is not None:
            return json.loads(hit)
        return self.fetch.json(f"{url}&crumb={quote(self._crumb_now())}", today, cache_url=url)

    def quotes(self, symbols: list[str], today: str) -> dict[str, dict[str, Any]]:
        """Each symbol's quote (shares outstanding, average volume, the last close), 50 symbols a request."""
        out: dict[str, dict[str, Any]] = {}
        for i in range(0, len(symbols), 50):
            chunk = ",".join(quote(s) for s in symbols[i : i + 50])
            body = self._json(f"https://query2.finance.yahoo.com/v7/finance/quote?symbols={chunk}", today)
            for q in (body.get("quoteResponse") or {}).get("result") or []:
                out[q["symbol"]] = q
        return out

    def profile(self, symbol: str, today: str) -> dict[str, Any]:
        """A company's profile: industry, sector, business summary."""
        body = self._json(
            f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{quote(symbol)}?modules=assetProfile",
            today,
        )
        result = (body.get("quoteSummary") or {}).get("result") or [{}]
        return result[0].get("assetProfile") or {}
