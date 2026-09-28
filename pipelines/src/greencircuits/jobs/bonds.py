"""Bonds listed on NSE: parsing their terms, pricing them and fitting the government's yield curve.

NSE's list of government bonds has no coupon or maturity fields; the symbol carries both:
"699GS2051" is 6.99% maturing in 2051, "702GJ31" a 7.02% Gujarat loan maturing in 2031, and
"364D021026" a 364-day T-bill maturing on 2 October 2026. Only a T-bill's symbol gives the day,
so other government bonds are taken to mature at the middle of their year (1 July); company
bonds come with full dates. Company bonds trade on NSE with interest accrued in the price, so
their yields are solved against the full price; government bonds against the clean one. Sovereign
gold bonds pay 2.5% a year on their issue price and repay the price of gold at maturity, so they
get no yield to maturity.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import UTC, date, datetime

#: Months as gold bond symbols write them: "SGBDE31III" is December 2031.
MONTHS = {
    "JAN": 1, "JA": 1, "FEB": 2, "FE": 2, "MAR": 3, "MR": 3, "APR": 4, "AP": 4, "MAY": 5, "MY": 5, "JUN": 6,
    "JN": 6, "JUL": 7, "JL": 7, "AUG": 8, "AU": 8, "SEP": 9, "SE": 9, "OCT": 10, "OC": 10, "NOV": 11,
    "NV": 11, "NO": 11, "DEC": 12, "DE": 12, "DC": 12,
}  # fmt: skip


@dataclass
class ListedBond:
    symbol: str
    isin: str
    #: GSEC, SDL, TBILL, CORPORATE_BOND or SGB (ref.security_type).
    kind: str
    issuer: str
    coupon: float | None
    maturity: date
    #: Whether the maturity is the real day or the middle of the year.
    exact: bool
    face_value: float
    #: Coupons a year: 2 for government bonds, 1 for most company bonds, 0 for T-bills.
    frequency: int
    price: float | None
    rating: str | None = None
    agency: str | None = None
    #: Gold bonds: what one unit cost at issue.
    issue_price: float | None = None
    #: Units that changed hands today. A bond that didn't trade keeps a last price that may be weeks old.
    volume: int = 0
    #: Whether the price includes the interest accrued since the last coupon, as company bonds' do on NSE.
    dirty: bool = False


def bond_name(b: ListedBond) -> str:
    """ "6.99% GS 2051", "7.02% Gujarat SDL 2031", "364-day T-bill, 2 Oct 2026", "SGB Dec 2031 (III)"."""
    coupon = f"{b.coupon:.2f}%" if b.coupon is not None else ""
    if b.kind == "TBILL":
        days = re.match(r"\d+", b.symbol)
        return f"{days.group(0) if days else ''}-day T-bill, {b.maturity.day} {b.maturity:%b %Y}"
    if b.kind == "GSEC":
        return f"{coupon} GS {b.maturity.year}"
    if b.kind == "SDL":
        return f"{coupon} {b.issuer.removeprefix('Government of ')} SDL {b.maturity.year}"
    if b.kind == "SGB":
        series = re.search(r"\d{2}([IVX]+)$", b.symbol)
        return f"SGB {b.maturity:%b %Y}{f' ({series.group(1)})' if series else ''}"
    return f"{coupon} {b.issuer} {b.maturity.year}".strip()


def _num(value: object) -> float | None:
    try:
        v = float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) and v > 0 else None


def parse_government(row: dict) -> ListedBond | None:
    """A row of NSE's government bond list: a G-sec (GS), a state loan (SG) or a T-bill (TB)."""
    symbol, series = str(row.get("symbol") or ""), str(row.get("series") or "")
    isin = str(row.get("isinCode") or "")
    price = _num(row.get("lastPrice")) or _num(row.get("previousClose"))
    face = _num(row.get("faceValue")) or 100.0
    volume = int(_num(row.get("totalTradedVolume")) or 0)
    if series == "TB":
        m = re.fullmatch(r"(\d{2,3})D(\d{2})(\d{2})(\d{2})", symbol)
        if not m:
            return None
        maturity = date(2000 + int(m.group(4)), int(m.group(3)), int(m.group(2)))
        return ListedBond(
            symbol, isin, "TBILL", "Government of India", None, maturity, True, face, 0, price, volume=volume
        )
    if series == "GS":
        m = re.fullmatch(r"(\d{3,4})GS(\d{4})[A-Z]*", symbol)
        if not m:
            return None
        coupon, maturity = int(m.group(1)) / 100, date(int(m.group(2)), 7, 1)
        return ListedBond(
            symbol,
            isin,
            "GSEC",
            "Government of India",
            coupon,
            maturity,
            False,
            face,
            2,
            price,
            volume=volume,
        )
    if series == "SG":
        m = re.fullmatch(r"(\d{3,4})([A-Z]{2})(\d{2})[A-Z]*", symbol)
        if not m:
            return None
        coupon, maturity = int(m.group(1)) / 100, date(2000 + int(m.group(3)), 7, 1)
        state = str(row.get("companyName") or m.group(2)).replace(" State", "").strip()
        return ListedBond(
            symbol,
            isin,
            "SDL",
            f"Government of {state}",
            coupon,
            maturity,
            False,
            face,
            2,
            price,
            volume=volume,
        )
    return None


def _first(text: object) -> str | None:
    """ "AA/Stable, AA+/Negative" → "AA"; "CRISIL, BRCK" → "CRISIL"."""
    value = str(text or "").split(",")[0].split("/")[0].strip()
    return value or None


def _stem(symbol: str) -> str:
    """ "82HUDCO27" → "HUDCO": the issuer's short name between the coupon and the year."""
    return re.sub(r"^\d+|\d+[A-Z]?$", "", symbol).strip() or symbol


def parse_company(row: dict, issuers: dict[str, str]) -> ListedBond | None:
    """A row of NSE's company bond list. `issuers` maps an ISIN's company code to a known name."""
    symbol, isin = str(row.get("symbol") or ""), str(row.get("isin") or "")
    try:
        maturity = datetime.strptime(str(row.get("maturity_date")), "%d-%b-%Y").replace(tzinfo=UTC).date()
    except ValueError:
        return None
    return ListedBond(
        symbol,
        isin,
        "CORPORATE_BOND",
        issuers.get(isin[:7]) or _stem(symbol),
        _num(row.get("coupr")),
        maturity,
        True,
        _num(row.get("face_value")) or 1000.0,
        1,
        _num(row.get("ltP")) or _num(row.get("close")),
        _first(row.get("credit_rating")),
        _first(row.get("rating_agency")),
        volume=int(_num(row.get("qty")) or 0),
        dirty=True,
    )


def parse_gold_bond(row: dict) -> ListedBond | None:
    """ "SGBDE31III" matures in December 2031; taken as the 15th, as the day isn't given."""
    symbol = str(row.get("symbol") or "")
    m = re.fullmatch(r"SGB([A-Z]{2,3})(\d{2})([IVX]*)", symbol)
    if not m or m.group(1) not in MONTHS:
        return None
    issue_price = _num(row.get("issue_price"))
    # A gold bond's nominal value is its issue price: the 2.5% interest is paid on it.
    return ListedBond(
        symbol,
        "",
        "SGB",
        "Reserve Bank of India",
        2.5,
        date(2000 + int(m.group(2)), MONTHS[m.group(1)], 15),
        False,
        issue_price or 1.0,
        2,
        _num(row.get("ltP")) or _num(row.get("prevClose")),
        issue_price=issue_price,
        volume=int(_num(row.get("qty")) or 0),
    )


def years_between(start: date, end: date) -> float:
    return (end - start).days / 365.25


def price_at(coupon: float, ytm: float, years: float, frequency: int, dirty: bool = False) -> float:
    """Price per 100 of face value: the coupons and principal still to come, discounted; the clean
    price takes off the interest accrued since the last coupon, which a buyer pays on top."""
    if frequency == 0:
        return 100 / (1 + ytm / 100 * years)
    periods = years * frequency
    y = ytm / 100 / frequency
    c = coupon / frequency
    # Coupons fall at maturity and every period before it; the next is `first` of a period away.
    n = max(1, math.ceil(periods - 1e-9))
    first = periods - (n - 1)
    full = sum(c / (1 + y) ** (first + k) for k in range(n)) + 100 / (1 + y) ** (first + n - 1)
    return full if dirty else full - c * (1 - first)


def ytm_of(bond: ListedBond, today: date) -> float | None:
    """The yield to maturity, in % a year, at the bond's price; None when it can't be priced, or
    didn't trade today (a stale price makes a nonsense yield: a 91-day bill's price from last month,
    with a week left to run, reads as 90% a year)."""
    if bond.kind == "SGB" or not bond.price or bond.volume <= 0:
        return None
    years = years_between(today, bond.maturity)
    # Near maturity a paisa on the price moves the yield by points: a bill's last week, a company bond's last month.
    if years <= (30 if bond.kind == "CORPORATE_BOND" else 7) / 365:
        return None
    price = bond.price / bond.face_value * 100
    if bond.frequency == 0 or bond.coupon is None:
        simple = (100 / price - 1) / years * 100
        return simple if 0 < simple < 25 else None
    lo, hi = -5.0, 60.0
    for _ in range(200):
        mid = (lo + hi) / 2
        if price_at(bond.coupon, mid, years, bond.frequency, bond.dirty) > price:
            lo = mid
        else:
            hi = mid
    y = (lo + hi) / 2
    # Outside this, the price doesn't fit the terms: a bond partly repaid, or quoted on another face value.
    return y if 0 < y < 25 else None


#: The tenors, in years, the site's yield curve is drawn at.
CURVE_TENORS = [0.25, 0.5, 1, 2, 3, 5, 7, 10, 14, 20, 30, 40]


def fit_curve(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """A Nelson–Siegel curve through (years, yield) points, read at CURVE_TENORS.

    The shape (level, slope, hump) is fitted by least squares over a grid of decay times, which
    is plenty for a hundred-odd bonds and needs nothing beyond numpy.
    """
    import numpy as np

    if len(points) < 6:
        return []
    t = np.array([p[0] for p in points])
    y = np.array([p[1] for p in points])
    best: tuple[float, np.ndarray, float] | None = None
    for tau in np.linspace(0.5, 10, 40):
        x = t / tau
        f1 = (1 - np.exp(-x)) / x
        f2 = f1 - np.exp(-x)
        design = np.column_stack([np.ones_like(t), f1, f2])
        coef, *_ = np.linalg.lstsq(design, y, rcond=None)
        err = float(np.sum((design @ coef - y) ** 2))
        if best is None or err < best[2]:
            best = (tau, coef, err)
    assert best is not None
    tau, coef, _ = best
    out = []
    # Read the curve only where there are bonds to hold it: not far short of the shortest.
    for tenor in (x for x in CURVE_TENORS if x >= float(t.min()) * 0.8):
        x = tenor / tau
        f1 = (1 - math.exp(-x)) / x
        out.append((tenor, float(coef[0] + coef[1] * f1 + coef[2] * (f1 - math.exp(-x)))))
    return out
