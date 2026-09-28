"""Build the lists of what GreenCircuits follows, from free sources: the Nifty 500's stocks, and
every ETF, REIT and InvIT listed on NSE.

    uv run --directory pipelines python -m greencircuits.jobs.catalog      (or: pnpm catalog)

Writes packages/market/src/data/equities.json and listed-funds.json, which the demo market, the
seed and the web read. Each keeps its id and display name (and a stock its industry) from one run
to the next: saved watchlists, alerts, holdings and page addresses point at them. Everything else
is refreshed. A stock that leaves the Nifty 500 stays in the file without the index, so whatever
names it keeps working.

Sources (free, unofficial, personal use; see docs/adr/0007):
- niftyindices.com: the Nifty 500 and the other index lists, with each company's ISIN and NSE sector;
- Yahoo Finance: the last close, shares outstanding, average volume, a year of closes (for
  volatility and beta against the Nifty 50) and each company's industry;
- NSE's archive: F&O lot sizes, the ETF master list and the REITs and InvITs among listed securities;
- AMFI: ETF names, from its daily file of every scheme.

The prices and volumes only anchor the demo's simulated market. The real-data loader
(greencircuits.jobs.real_data) replaces them in a local database.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np

from .cleaning import repair_fund_bars
from .http import Fetcher
from .sources import (
    NIFTY_LISTS,
    YAHOO_SYMBOLS,
    Bar,
    Constituent,
    Yahoo,
    amfi_schemes,
    fo_lots,
    fund_category,
    index_list,
    ist_today,
    nse_etfs,
    nse_trusts,
    yahoo_closes,
)

TARGET = Path(__file__).resolve().parents[4] / "packages" / "market" / "src" / "data" / "equities.json"
#: New stocks are numbered from here. Below it: the indices, the first 49 stocks (100–148),
#: commodities (300s) and currencies (400s). Issuer ids are 1000 + the instrument id, and
#: 2000–3099 hold bond and IPO issuers, so instrument ids 1000–2099 stay unused.
FIRST_NEW_ID = 10_000
NIFTY, SENSEX, NIFTY_500 = 1, 2, 9
COLUMNS = [
    "id", "symbol", "name", "isin", "sector", "industry", "prevClose", "sharesCr", "vol", "beta", "avgVolume",
    "indices", "lot",
]  # fmt: skip

#: NSE's sectors, as the index lists name them, folded into the site's.
SECTORS = {
    "Financial Services": "Financials",
    "Information Technology": "IT",
    "Oil Gas & Consumable Fuels": "Energy",
    "Power": "Utilities",
    "Healthcare": "Healthcare",
    "Automobile and Auto Components": "Auto",
    "Fast Moving Consumer Goods": "Consumer",
    "Consumer Durables": "Consumer",
    "Consumer Services": "Consumer",
    "Textiles": "Consumer",
    "Media Entertainment & Publication": "Consumer",
    "Metals & Mining": "Materials",
    "Chemicals": "Materials",
    "Construction Materials": "Materials",
    "Forest Materials": "Materials",
    "Capital Goods": "Industrials",
    "Construction": "Industrials",
    "Services": "Industrials",
    "Diversified": "Industrials",
    "Telecommunication": "Telecom",
    "Realty": "Realty",
}

#: Yahoo's industry names, made plainer and more Indian where they need it.
INDUSTRY_NAMES = {
    "Banks - Regional": "Banks",
    "Banks - Diversified": "Banks",
    "Credit Services": "Non-Bank Lenders",
    "Mortgage Finance": "Housing Finance",
    "Drug Manufacturers - Specialty & Generic": "Pharmaceuticals",
    "Drug Manufacturers - General": "Pharmaceuticals",
    "Information Technology Services": "IT Services",
    "Software - Infrastructure": "Software",
    "Software - Application": "Software",
    "Utilities - Independent Power Producers": "Power Generation",
    "Utilities - Renewable": "Renewable Power",
    "Utilities - Regulated Electric": "Electric Utilities",
    "Utilities - Regulated Gas": "Gas Distribution",
    "Utilities - Diversified": "Utilities",
    "Real Estate - Development": "Real Estate Development",
    "Real Estate - Diversified": "Real Estate",
    "Insurance - Life": "Life Insurance",
    "Insurance - Diversified": "Insurance",
    "Insurance - Property & Casualty": "General Insurance",
    "Insurance - Reinsurance": "Reinsurance",
    "Insurance - Specialty": "Insurance",
    "Beverages - Wineries & Distilleries": "Spirits & Wine",
    "Beverages - Non-Alcoholic": "Soft Drinks",
    "Beverages - Brewers": "Breweries",
    "Other Industrial Metals & Mining": "Metals & Mining",
    "Other Precious Metals & Mining": "Precious Metals",
    "Thermal Coal": "Coal",
    "Aluminum": "Aluminium",
    "Internet Retail": "Online Retail",
    "Specialty Industrial Machinery": "Industrial Machinery",
    "Electrical Equipment & Parts": "Electrical Equipment",
    "Farm & Heavy Construction Machinery": "Farm & Construction Machinery",
    "Furnishings, Fixtures & Appliances": "Home Appliances & Furnishings",
}


@dataclass
class Row:
    id: int
    symbol: str
    name: str
    isin: str | None
    sector: str
    industry: str | None
    prev_close: float
    shares_cr: float
    vol: float
    beta: float
    avg_volume: int
    indices: list[int]
    lot: int | None

    @classmethod
    def read(cls, cells: list[Any]) -> Row:
        return cls(*cells)

    def cells(self) -> list[Any]:
        return [
            self.id, self.symbol, self.name, self.isin, self.sector, self.industry, self.prev_close, self.shares_cr,
            self.vol, self.beta, self.avg_volume, self.indices, self.lot,
        ]  # fmt: skip


def tick_for(price: float) -> float:
    """NSE's tick size for a price (packages/market/src/catalog.ts has the same bands)."""
    for limit, tick in ((250, 0.01), (1000, 0.05), (5000, 0.1), (10000, 0.5), (20000, 1)):
        if price < limit:
            return tick
    return 5


def to_tick(price: float) -> float:
    tick = tick_for(price)
    return round(round(price / tick) * tick, 2)


def plain_name(name: str) -> str:
    """ "The Indian Hotels Company Ltd." → "Indian Hotels Company"; "Info Edge (India) Ltd." → "Info Edge"."""
    name = re.sub(r"\s+(Ltd\.?|Limited)$", "", name.strip(), flags=re.IGNORECASE)
    name = re.sub(r"^The\s+", "", name)
    return name.replace(" (India)", "").strip()


def risk(
    closes: dict[date, float],
    market: dict[date, float],
    vol_bounds: tuple[float, float] = (0.12, 0.9),
    beta_bounds: tuple[float, float] = (0.3, 2.2),
) -> tuple[float, float] | None:
    """Annualised volatility and beta against the market, from the daily closes both have."""
    days = sorted(d for d in closes if d in market)[-251:]
    if len(days) < 61:
        return None
    stock = np.array([closes[d] for d in days])
    index = np.array([market[d] for d in days])
    r, m = stock[1:] / stock[:-1] - 1, index[1:] / index[:-1] - 1
    vol = float(np.std(r, ddof=1) * math.sqrt(252))
    beta = float(np.cov(r, m)[0, 1] / np.var(m, ddof=1))
    # The simulator wants sane parameters: a stock suspended for a while, or just demerged, can have odd ones.
    (vol_lo, vol_hi), (beta_lo, beta_hi) = vol_bounds, beta_bounds
    return round(min(max(vol, vol_lo), vol_hi), 3), round(min(max(beta, beta_lo), beta_hi), 2)


def read_existing(path: Path) -> list[Row]:
    if not path.exists():
        return []
    return [Row.read(cells) for cells in json.loads(path.read_text(encoding="utf-8"))["equities"]]


def write(path: Path, as_of: date, anchors: dict[int, float], rows: list[Row]) -> None:
    """One stock a line, so a refresh reads as a diff."""
    about = (
        "The stocks GreenCircuits follows: the Nifty 500. Generated by `pnpm catalog` "
        "(pipelines/src/greencircuits/jobs/catalog.py); edit that, not this. Prices, shares and volumes "
        f"are from {as_of.isoformat()} and only anchor the demo's simulated market."
    )
    lines = [
        "{",
        f'  "about": {json.dumps(about)},',
        f'  "asOf": "{as_of.isoformat()}",',
        '  "indices": {' + ", ".join(f'"{k}": {v}' for k, v in sorted(anchors.items())) + "},",
        f'  "columns": {json.dumps(COLUMNS)},',
        '  "equities": [',
    ]
    for i, row in enumerate(rows):
        comma = "," if i < len(rows) - 1 else ""
        lines.append("    " + json.dumps(row.cells(), ensure_ascii=False, separators=(",", ":")) + comma)
    lines += ["  ]", "}", ""]
    path.write_text("\n".join(lines), encoding="utf-8", newline="\n")


def build(
    fetch: Fetcher, today: str, existing: list[Row]
) -> tuple[date, dict[int, float], list[Row], list[str]]:
    problems: list[str] = []
    lists = {index_id: index_list(fetch, index_id, today) for index_id in NIFTY_LISTS}
    universe: dict[str, Constituent] = {c.symbol: c for c in lists[NIFTY_500]}
    members: dict[str, set[int]] = {}
    for index_id, companies in lists.items():
        for c in companies:
            members.setdefault(c.symbol, set()).add(index_id)

    # A company that changed its symbol keeps its row: match on the ISIN.
    by_symbol = {r.symbol: r for r in existing}
    by_isin = {r.isin: r for r in existing if r.isin}
    for c in universe.values():
        old = by_isin.get(c.isin)
        if c.symbol not in by_symbol and old and old.symbol not in universe:
            print(f"  {old.symbol} is now {c.symbol}")
            del by_symbol[old.symbol]
            old.symbol = c.symbol
            by_symbol[c.symbol] = old
    symbols = sorted(set(universe) | set(by_symbol))

    yahoo = Yahoo(fetch)
    index_symbols = {i: s for i, s in YAHOO_SYMBOLS.items() if i < 100}
    closes = yahoo_closes(fetch, [f"{s}.NS" for s in symbols] + list(index_symbols.values()), today)
    nifty = closes.get(index_symbols[NIFTY], {})
    # Anchors are the last full session's closes: today's may still be trading.
    past = [d for d in nifty if d.isoformat() < today]
    if not past:
        raise RuntimeError("Yahoo sent no Nifty 50 closes")
    as_of = max(past)
    quotes = yahoo.quotes([f"{s}.NS" for s in symbols], today)
    lots = fo_lots(fetch, today)

    def last_close(series: dict[date, float]) -> float | None:
        days = [d for d in series if d <= as_of]
        return series[max(days)] if days else None

    rows: list[Row] = []
    fresh: list[Row] = []
    for n, symbol in enumerate(symbols):
        ysym = f"{symbol}.NS"
        company, old, q = universe.get(symbol), by_symbol.get(symbol), quotes.get(ysym, {})
        series = closes.get(ysym, {})
        price = last_close(series) or q.get("regularMarketPreviousClose") or (old.prev_close if old else None)
        shares = q.get("sharesOutstanding") or q.get("impliedSharesOutstanding")
        shares_cr = round(shares / 1e7, 2) if shares else (old.shares_cr if old else None)
        if not price or not shares_cr:
            problems.append(
                f"{symbol}: no {'price' if not price else 'shares outstanding'} on Yahoo, left out"
            )
            if old:
                rows.append(old)
            continue
        vol_beta = risk(series, nifty) or ((old.vol, old.beta) if old else (0.3, 1.0))
        industry = old.industry if old else None
        if not industry:
            try:
                industry = yahoo.profile(ysym, today).get("industry")
            except Exception as err:  # noqa: BLE001 — a missing profile shouldn't stop the list
                problems.append(f"{symbol}: no profile, {err}")
            industry = industry or (company.sector if company else None)
            if n and n % 50 == 0:
                print(f"  profiles: {n} of {len(symbols)}", flush=True)
        # Renaming applies to kept industries too, so a new entry in the table reaches every stock.
        industry = INDUSTRY_NAMES.get(industry or "", industry)
        indices = sorted(members.get(symbol, set()) | ({SENSEX} if old and SENSEX in old.indices else set()))
        row = Row(
            id=old.id if old else 0,
            symbol=symbol,
            name=old.name if old else plain_name(company.name if company else symbol),
            isin=(company.isin if company else None) or (old.isin if old else None),
            sector=SECTORS.get(company.sector, "Industrials")
            if company
            else (old.sector if old else "Industrials"),
            industry=industry,
            prev_close=to_tick(float(price)),
            shares_cr=float(shares_cr),
            vol=vol_beta[0],
            beta=vol_beta[1],
            avg_volume=int(q.get("averageDailyVolume3Month") or (old.avg_volume if old else 0)),
            indices=indices,
            lot=lots.get(symbol),
        )
        if company and company.sector not in SECTORS:
            problems.append(f"{symbol}: NSE sector {company.sector!r} isn't mapped; filed under Industrials")
        (rows if old else fresh).append(row)

    # New stocks take the next free ids, largest first.
    next_id = max([FIRST_NEW_ID - 1] + [r.id for r in rows])
    for row in sorted(fresh, key=lambda r: -r.prev_close * r.shares_cr):
        next_id += 1
        row.id = next_id
        rows.append(row)
    rows.sort(key=lambda r: r.id)

    # Yahoo keeps no daily history for a few indices; their quote still has the last close.
    index_quotes = yahoo.quotes(list(index_symbols.values()), today)
    anchors = {}
    for index_id, ysym in index_symbols.items():
        close = last_close(closes.get(ysym, {})) or index_quotes.get(ysym, {}).get(
            "regularMarketPreviousClose"
        )
        if close:
            anchors[index_id] = round(close, 2)
        else:
            problems.append(f"index {index_id} ({ysym}): no close on Yahoo")
    return as_of, anchors, rows, problems


# ------------------------------------------------------------------ listed funds

FUNDS_TARGET = TARGET.parent / "listed-funds.json"
FIRST_ETF_ID, FIRST_TRUST_ID = 20_000, 30_000
FUND_COLUMNS = [
    "id", "symbol", "name", "isin", "kind", "category", "underlying", "tracks", "prevClose", "vol", "beta",
    "avgVolume",
]  # fmt: skip

#: What an ETF follows, when the site follows it too: the demo market moves the ETF with it.
TRACKS = {
    "nifty 50": 1,
    "bse sensex": 2,
    "sensex": 2,
    "nifty bank": 3,
    "nifty it": 4,
    "nifty midcap 100": 5,
    "nifty financial services": 6,
    "nifty next 50": 8,
    "nifty 500": 9,
    "nifty midcap 150": 10,
    "nifty smallcap 250": 11,
    "gold": 300,
    "silver": 301,
}
BROAD_MARKET = {
    "nifty 50", "bse sensex", "sensex", "nifty next 50", "nifty 100", "nifty 200", "nifty 500", "nifty midcap 50",
    "nifty midcap 100", "nifty midcap 150", "nifty smallcap 250", "nifty largemidcap 250", "nifty midsmallcap 400",
    "nifty total market", "msci india", "bse 100", "bse 200", "bse 500", "bse sensex next 50", "bse midcap select",
}  # fmt: skip
STRATEGY = re.compile(
    r"momentum|quality|value|low.?vol|alpha|equal weight|dividend|esg|shariah|stable|high beta", re.IGNORECASE
)
#: Volatility and beta for a fund whose year of prices is too short to measure them.
FUND_DEFAULTS = {
    "Gold": (0.14, -0.1),
    "Silver": (0.24, 0.1),
    "Liquid": (0.004, 0.0),
    "Bonds": (0.04, 0.0),
    "International": (0.2, 0.3),
    "REIT": (0.18, 0.4),
    "INVIT": (0.15, 0.3),
}


#: NSE's names for what some ETFs follow, in words a reader would use.
UNDERLYING_NAMES = {
    "gold": "Gold",
    "silver": "Silver",
    "overnight etfs and liquid etf": "Overnight money market",
    "gsecs/gilt": "Government bonds",
    "bond": "Bonds",
}


def underlying_name(etf_underlying: str, asset: str) -> str | None:
    """What an ETF follows, as the site shows it: "Nifty 50", "Gold", or for a foreign index its own name."""
    key = etf_underlying.strip().lower()
    if not key:
        return None
    if key == "global indices":
        return fund_name(asset) if asset else "A foreign index"
    return UNDERLYING_NAMES.get(key) or fund_name(etf_underlying)


def etf_category(kind: str, underlying: str) -> str:
    """Sort an ETF by what it holds, from NSE's master list."""
    k, key = kind.strip().upper(), underlying.strip().lower()
    if k == "COMMODITY":
        return "Silver" if "silver" in key else "Gold"
    if k == "DEBT":
        return "Liquid" if "liquid" in key or "overnight" in key else "Bonds"
    if k == "GLOBAL INDICES":
        return "International"
    if k == "HYBRID":
        return "Hybrid"
    if STRATEGY.search(key):
        return "Strategy"
    return "Broad market" if key in BROAD_MARKET else "Sector and theme"


#: Words that stay in capitals when a shouted name is calmed down.
ACRONYMS = {
    "AMC", "BFSI", "BSE", "CPSE", "DSP", "ESG", "ETF", "ETFS", "FMCG", "GSEC", "HDFC", "ICICI", "IDCW", "IRB", "LIC",
    "MNC", "MSCI", "NDR", "NHIT", "NSE", "NYSE", "PSE", "PSU", "REIT", "SBI", "SDL", "TVS", "UTI",
}  # fmt: skip


#: Short words a shouted name keeps in lower case, once calmed down.
SMALL_WORDS = {"of", "and", "the", "for", "in", "on", "to", "with"}
#: Short words in capitals that aren't acronyms, wherever they turn up ("Aditya Birla SUN Life").
PLAIN_WORDS = {"SUN": "Sun", "CAP": "Cap", "LIFE": "Life", "GOLD": "Gold"}


def fund_name(name: str) -> str:
    """ "ICICI PRUDENTIAL SILVER ETF" → "ICICI Prudential Silver ETF"; "BANK OF INDIA LARGE CAP FUND" →
    "Bank of India Large Cap Fund"; "Shrem Invit" → "Shrem InvIT". A name mostly in capitals is shouted
    throughout; otherwise only its long all-capital words are ("HDFC NIFTY 50" → "HDFC Nifty 50")."""
    words = re.sub(r"\s+", " ", name).strip().split(" ")
    letters = [w for w in words if any(ch.isalpha() for ch in w)]
    shouted = bool(letters) and sum(w.isupper() for w in letters) / len(letters) >= 0.7

    def word(w: str, first: bool) -> str:
        if "-" in w:
            return "-".join(word(part, first and i == 0) for i, part in enumerate(w.split("-")))
        upper = w.upper()
        if upper == "INVIT":
            return "InvIT"
        if upper in ACRONYMS:
            return upper
        if w in PLAIN_WORDS:
            return PLAIN_WORDS[w]
        if not w.isupper() or not any(ch.isalpha() for ch in w):
            return w
        if shouted:
            return w.lower() if w.lower() in SMALL_WORDS and not first else w.capitalize()
        return w.capitalize() if len(w) >= 4 else w

    return " ".join(word(w, i == 0) for i, w in enumerate(words))


@dataclass
class FundRow:
    id: int
    symbol: str
    name: str
    isin: str | None
    #: ETF, REIT or INVIT.
    kind: str
    category: str | None
    underlying: str | None
    #: The instrument an ETF follows, when the site has it.
    tracks: int | None
    prev_close: float
    vol: float
    beta: float
    avg_volume: int

    @classmethod
    def read(cls, cells: list[Any]) -> FundRow:
        return cls(*cells)

    def cells(self) -> list[Any]:
        return [
            self.id, self.symbol, self.name, self.isin, self.kind, self.category, self.underlying, self.tracks,
            self.prev_close, self.vol, self.beta, self.avg_volume,
        ]  # fmt: skip


def read_existing_funds(path: Path) -> list[FundRow]:
    if not path.exists():
        return []
    return [FundRow.read(cells) for cells in json.loads(path.read_text(encoding="utf-8"))["funds"]]


def write_funds(path: Path, as_of: date, rows: list[FundRow]) -> None:
    about = (
        "Every ETF, REIT and InvIT listed on NSE. Generated by `pnpm catalog` "
        "(pipelines/src/greencircuits/jobs/catalog.py); edit that, not this. Prices and volumes are from "
        f"{as_of.isoformat()} and only anchor the demo's simulated market."
    )
    lines = [
        "{",
        f'  "about": {json.dumps(about)},',
        f'  "asOf": "{as_of.isoformat()}",',
        f'  "columns": {json.dumps(FUND_COLUMNS)},',
        '  "funds": [',
    ]
    for i, row in enumerate(rows):
        comma = "," if i < len(rows) - 1 else ""
        lines.append("    " + json.dumps(row.cells(), ensure_ascii=False, separators=(",", ":")) + comma)
    lines += ["  ]", "}", ""]
    path.write_text("\n".join(lines), encoding="utf-8", newline="\n")


def build_funds(
    fetch: Fetcher, today: str, as_of: date, existing: list[FundRow]
) -> tuple[list[FundRow], list[str]]:
    problems: list[str] = []
    etfs = nse_etfs(fetch, today)
    trusts = nse_trusts(fetch, today)
    # AMFI's names for ETFs read better than NSE's security names ("NIPINDETFNIFTYBEES").
    amfi: dict[str, str] = {}
    for scheme in amfi_schemes(fetch, today):
        for isin in (scheme.isin, scheme.isin_reinvest):
            if isin:
                amfi.setdefault(isin, scheme.name)

    listed = [(e.symbol, "ETF") for e in etfs] + [(t[0], t[2]) for t in trusts]
    ysyms = [f"{symbol}.NS" for symbol, _ in listed]
    closes = yahoo_closes(fetch, [*ysyms, "^NSEI"], today)
    nifty = closes.get("^NSEI", {})
    quotes = Yahoo(fetch).quotes(ysyms, today)
    by_symbol = {r.symbol: r for r in existing}
    by_isin = {r.isin: r for r in existing if r.isin}

    def last_close(series: dict[date, float]) -> float | None:
        days = [d for d in series if d <= as_of]
        return series[max(days)] if days else None

    rows: list[FundRow] = []
    fresh: list[FundRow] = []
    etf_by_symbol = {e.symbol: e for e in etfs}
    trust_by_symbol = {t[0]: t for t in trusts}
    for symbol, kind in listed:
        ysym = f"{symbol}.NS"
        etf, trust = etf_by_symbol.get(symbol), trust_by_symbol.get(symbol)
        old = by_symbol.get(symbol) or (by_isin.get(etf.isin) if etf else None)
        q, series = quotes.get(ysym, {}), closes.get(ysym, {})
        if etf and series:
            # Yahoo leaves many ETF unit splits unadjusted, which would make the fund look wildly risky.
            metal = (etf.underlying or "").strip().lower() in ("gold", "silver")
            fixed, _ = repair_fund_bars(
                [Bar(d, c, c, c, c, 0) for d, c in sorted(series.items())], {} if metal else nifty
            )
            series = {b.day: b.close for b in fixed}
        price = last_close(series) or q.get("regularMarketPreviousClose")
        if not price:
            problems.append(f"{symbol}: no price on Yahoo, left out")
            continue
        if etf:
            category = etf_category(etf.kind, etf.underlying)
            underlying = underlying_name(etf.underlying, etf.asset)
            name = amfi.get(etf.isin) or q.get("longName") or etf.asset or symbol
            tracks = TRACKS.get((etf.underlying or "").strip().lower())
        else:
            category, underlying, tracks = None, None, None
            name = q.get("longName") or (trust[1] if trust else symbol)
        default = FUND_DEFAULTS.get(category or kind, (0.16, 1.0))
        vol, beta = risk(series, nifty, vol_bounds=(0.003, 0.9), beta_bounds=(-0.6, 2.0)) or default
        row = FundRow(
            id=old.id if old else 0,
            symbol=symbol,
            name=fund_name(old.name if old else name),
            isin=etf.isin if etf else (old.isin if old else None),
            kind=kind,
            category=category,
            underlying=underlying,
            tracks=tracks,
            prev_close=round(float(price), 2),
            vol=vol,
            beta=beta,
            avg_volume=int(q.get("averageDailyVolume3Month") or (old.avg_volume if old else 0)),
        )
        (rows if old else fresh).append(row)

    # New funds take the next free ids in their range, the most traded first.
    for first, kinds in ((FIRST_ETF_ID, ("ETF",)), (FIRST_TRUST_ID, ("REIT", "INVIT"))):
        next_id = max([first - 1] + [r.id for r in rows if r.kind in kinds])
        for row in sorted((r for r in fresh if r.kind in kinds), key=lambda r: -r.prev_close * r.avg_volume):
            next_id += 1
            row.id = next_id
            rows.append(row)
    kept = {r.symbol for r in rows}
    rows += [r for r in existing if r.symbol not in kept]
    rows.sort(key=lambda r: r.id)
    return rows, problems


# ----------------------------------------------------------------- demo mutual funds

MUTUAL_TARGET = TARGET.parent / "mutual-funds.json"
#: Fund houses the demo samples from, largest first; a category takes the first few that run one.
FUND_HOUSES = [
    "SBI Mutual Fund", "ICICI Prudential Mutual Fund", "HDFC Mutual Fund", "Nippon India Mutual Fund",
    "Kotak Mahindra Mutual Fund", "Axis Mutual Fund", "Aditya Birla Sun Life Mutual Fund", "UTI Mutual Fund",
    "Mirae Asset Mutual Fund", "PPFAS Mutual Fund", "DSP Mutual Fund", "Motilal Oswal Mutual Fund",
    "Tata Mutual Fund", "Canara Robeco Mutual Fund", "Quant Mutual Fund",
]  # fmt: skip
PER_CATEGORY = 4
DEMO_CATEGORIES = {
    "Large cap", "Large and mid cap", "Mid cap", "Small cap", "Multi cap", "Flexi cap", "Focused",
    "Value and contra", "Tax saver (ELSS)", "Sector and theme", "Aggressive hybrid", "Balanced advantage",
    "Multi-asset", "Arbitrage", "Overnight", "Liquid", "Money market", "Short duration", "Corporate bond",
    "Banking and PSU", "Gilt", "Dynamic bond", "Equity index", "Overseas", "Retirement",
}  # fmt: skip


def write_mutual_funds(fetch: Fetcher, today: str) -> int:
    """A sample of real schemes for the demo: a few from the largest fund houses in each main category.

    Their names, categories and latest NAVs are real; the demo simulates their history from its
    own indices, so it works without the database.
    """
    by_category: dict[str, list[tuple[int, Any]]] = {}
    for scheme in amfi_schemes(fetch, today):
        if (
            scheme.structure != "Open Ended"
            or scheme.plan != "Direct"
            or scheme.option != "Growth"
            or not scheme.nav
        ):
            continue
        category = fund_category(scheme.category, scheme.name)
        if category is None or category[1] not in DEMO_CATEGORIES or scheme.amc not in FUND_HOUSES:
            continue
        by_category.setdefault(category[1], []).append((FUND_HOUSES.index(scheme.amc), (scheme, category)))
    rows = []
    for name in sorted(by_category):
        picked: set[str] = set()
        for _, (scheme, (asset_class, category)) in sorted(
            by_category[name], key=lambda x: (x[0], x[1][0].code)
        ):
            if scheme.amc in picked:
                continue
            picked.add(scheme.amc)
            rows.append(
                [
                    scheme.code,
                    fund_name(
                        re.sub(
                            r"\s*\([^)]*segregated[^)]*\)",
                            "",
                            scheme.name.replace("\ufffd", "'"),
                            flags=re.IGNORECASE,
                        )
                    ),
                    scheme.amc,
                    asset_class,
                    category,
                    scheme.nav,
                    scheme.nav_date.isoformat() if scheme.nav_date else None,
                ]
            )
            if len(picked) == PER_CATEGORY:
                break
    about = (
        "A sample of real mutual fund schemes for the demo: a few direct growth plans from the largest fund "
        "houses in each main category, with AMFI's latest NAV. Generated by `pnpm catalog` "
        "(pipelines/src/greencircuits/jobs/catalog.py). The demo simulates their NAV history."
    )
    columns = ["code", "name", "amc", "assetClass", "category", "nav", "navDate"]
    lines = [
        "{",
        f'  "about": {json.dumps(about)},',
        f'  "columns": {json.dumps(columns)},',
        '  "schemes": [',
    ]
    for i, row in enumerate(rows):
        comma = "," if i < len(rows) - 1 else ""
        lines.append("    " + json.dumps(row, ensure_ascii=False, separators=(",", ":")) + comma)
    lines += ["  ]", "}", ""]
    MUTUAL_TARGET.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    return len(rows)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build the stock, ETF and trust catalogs from free sources.")
    parser.add_argument(
        "--refresh", action="store_true", help="fetch again even if today's responses are cached"
    )
    args = parser.parse_args(argv)
    today = ist_today()
    existing = read_existing(TARGET)
    print(f"Building the catalog ({today}) from {len(existing)} stocks already listed...")
    fetch = Fetcher(refresh=args.refresh)
    as_of, anchors, rows, problems = build(fetch, today, existing)
    write(TARGET, as_of, anchors, rows)
    existing_funds = read_existing_funds(FUNDS_TARGET)
    funds, fund_problems = build_funds(fetch, today, as_of, existing_funds)
    write_funds(FUNDS_TARGET, as_of, funds)
    problems += fund_problems
    schemes = write_mutual_funds(fetch, today)
    known = {r.id for r in existing}
    added = [r for r in rows if r.id not in known]
    outside = [r.symbol for r in rows if NIFTY_500 not in r.indices]
    print(f"Wrote {len(rows)} stocks as of {as_of} to {TARGET}: {len(added)} new.")
    counts = {k: sum(1 for f in funds if f.kind == k) for k in ("ETF", "REIT", "INVIT")}
    known_funds = {f.id for f in existing_funds}
    new_funds = sum(1 for f in funds if f.id not in known_funds)
    print(
        f"Wrote {counts['ETF']} ETFs, {counts['REIT']} REITs and {counts['INVIT']} InvITs: {new_funds} new."
    )
    print(f"Wrote {schemes} sample mutual fund schemes for the demo.")
    if outside:
        print(f"Not in the Nifty 500 now, kept: {', '.join(outside)}")
    for p in problems:
        print(f"  ! {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
