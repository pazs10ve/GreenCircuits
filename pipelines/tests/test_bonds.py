"""Reading NSE's bond lists and pricing the bonds."""

from datetime import date

from greencircuits.jobs.bonds import (
    ListedBond,
    fit_curve,
    parse_company,
    parse_gold_bond,
    parse_government,
    price_at,
    ytm_of,
)


def test_government_symbols_carry_coupon_and_maturity() -> None:
    gsec = parse_government(
        {"symbol": "699GS2051", "series": "GS", "isinCode": "IN0020210194", "lastPrice": 97.88}
    )
    assert gsec is not None
    assert (gsec.kind, gsec.coupon, gsec.maturity, gsec.exact) == ("GSEC", 6.99, date(2051, 7, 1), False)
    sdl = parse_government(
        {"symbol": "702GJ31", "series": "SG", "companyName": "Gujarat State", "lastPrice": 97}
    )
    assert sdl is not None
    assert (sdl.kind, sdl.issuer, sdl.coupon, sdl.maturity.year) == (
        "SDL",
        "Government of Gujarat",
        7.02,
        2031,
    )
    tbill = parse_government({"symbol": "364D021026", "series": "TB", "lastPrice": 99.5})
    assert tbill is not None
    assert (tbill.kind, tbill.maturity, tbill.exact, tbill.frequency) == ("TBILL", date(2026, 10, 2), True, 0)
    assert parse_government({"symbol": "NOTABOND", "series": "GS"}) is None


def test_company_bonds_name_their_issuer_from_the_isin_or_the_symbol() -> None:
    row = {
        "symbol": "82HUDCO27",
        "isin": "INE031A07840",
        "maturity_date": "05-Mar-2027",
        "coupr": "8.2",
        "face_value": "1000",
        "ltP": "1054.98",
        "credit_rating": "AA/Stable, AA+/Negative",
        "rating_agency": "CRISIL, BRCK",
    }
    bond = parse_company(row, {})
    assert bond is not None
    assert (bond.issuer, bond.coupon, bond.maturity, bond.rating, bond.agency) == (
        "HUDCO",
        8.2,
        date(2027, 3, 5),
        "AA",
        "CRISIL",
    )
    known = parse_company(row, {"INE031A": "Housing & Urban Development Corporation"})
    assert known is not None and known.issuer == "Housing & Urban Development Corporation"


def test_gold_bonds_mature_in_their_symbol_month() -> None:
    bond = parse_gold_bond({"symbol": "SGBDE31III", "issue_price": "6149", "ltP": "15260.01"})
    assert bond is not None
    assert (bond.maturity, bond.issue_price, bond.price) == (date(2031, 12, 15), 6149.0, 15260.01)
    assert ytm_of(bond, date(2026, 9, 28)) is None


def _ytm(bond: ListedBond, today: date) -> float:
    y = ytm_of(bond, today)
    assert y is not None
    return y


def test_yield_and_price_agree() -> None:
    today = date(2026, 9, 28)
    bond = ListedBond(
        "X", "", "GSEC", "Government of India", 7.0, date(2036, 9, 28), True, 100, 2, 100.0, volume=10
    )
    assert abs(_ytm(bond, today) - 7.0) < 0.02
    bond.price = price_at(7.0, 7.5, 10.0, 2)
    assert abs(_ytm(bond, today) - 7.5) < 0.02
    tbill = ListedBond(
        "T", "", "TBILL", "Government of India", None, date(2027, 9, 28), True, 100, 0, 94.0, volume=5
    )
    assert abs(_ytm(tbill, today) - (100 / 94 - 1) * 100) < 0.1


def test_curve_passes_through_a_smooth_set_of_yields() -> None:
    points = [(t, 5.5 + 1.5 * (1 - 2.71828 ** (-t / 3))) for t in (0.25, 0.5, 1, 2, 3, 5, 7, 10, 15, 20, 30)]
    curve = dict(fit_curve(points))
    assert abs(curve[10] - (5.5 + 1.5 * (1 - 2.71828 ** (-10 / 3)))) < 0.05
    assert curve[0.25] < curve[10] < curve[40] + 0.05
    assert fit_curve(points[:3]) == []


def test_a_bond_that_did_not_trade_today_gets_no_yield() -> None:
    stale = ListedBond("T", "", "TBILL", "Government of India", None, date(2026, 10, 5), True, 100, 0, 98.3)
    assert ytm_of(stale, date(2026, 9, 28)) is None


def test_company_bonds_are_priced_with_accrued_interest() -> None:
    today = date(2026, 9, 28)
    # 8.75% a year, paid each 14 October: the next coupon is 16 days off, so almost a year's interest is in the price.
    bond = ListedBond(
        "B",
        "",
        "CORPORATE_BOND",
        "IIFL",
        8.75,
        date(2027, 10, 14),
        True,
        1000,
        1,
        1073.0,
        volume=5,
        dirty=True,
    )
    full = _ytm(bond, today)
    bond.dirty = False
    # Read as a clean price, the same quote would look like a bond yielding next to nothing.
    assert 8.5 < full < 11 and _ytm(bond, today) < 3
