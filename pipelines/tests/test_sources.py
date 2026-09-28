"""Parsing of the free sources' quirks, without the network."""

from datetime import date
from typing import Any

from greencircuits.jobs.sources import _band, fo_lots, fund_category, index_list, nse_shareholding, parse_amfi


class FakeFetcher:
    def __init__(self, body: Any) -> None:
        self.body = body

    def json(self, url: str, day: str, headers: dict[str, str] | None = None) -> Any:
        return self.body


def test_price_bands_read_past_the_rs_prefix_and_thousands_separators() -> None:
    assert _band("Rs.159 to Rs.167") == (159.0, 167.0)
    assert _band("Rs.1,020 to Rs.1,075") == (1020.0, 1075.0)
    assert _band("₹ 95 - 100") == (95.0, 100.0)
    assert _band("") == (None, None)


def test_shareholding_keeps_only_quarter_end_patterns() -> None:
    rows = [
        {"date": "30-SEP-2024", "pr_and_prgrp": "50.24", "public_val": "49.76"},
        # Filed after a bonus issue: not a quarter's pattern.
        {"date": "29-OCT-2024", "pr_and_prgrp": "50.24", "public_val": "49.76"},
        {"date": "31-DEC-2024", "pr_and_prgrp": "50.13", "public_val": "49.87"},
        {"date": "not a date", "pr_and_prgrp": "1", "public_val": "99"},
    ]
    assert nse_shareholding(FakeFetcher(rows), "RELIANCE", "2026-09-28") == [  # type: ignore[arg-type]
        (date(2024, 9, 30), 50.24, 49.76),
        (date(2024, 12, 31), 50.13, 49.87),
    ]


class TextFetcher:
    def __init__(self, body: str) -> None:
        self.body = body

    def text(self, url: str, day: str, headers: dict[str, str] | None = None) -> str:
        return self.body


def test_lots_are_read_for_single_stocks_only() -> None:
    # The last stock's contracts start next month.
    body = (
        "UNDERLYING                          ,SYMBOL    ,SEP-26     ,OCT-26     ,NOV-26     \n"
        "NIFTY 50                            ,NIFTY     ,65         ,65         ,65         \n"
        "Derivatives on Individual Securities,Symbol    ,SEP-26     ,OCT-26     ,NOV-26     \n"
        "360 ONE WAM LIMITED                 ,360ONE    ,500        ,500        ,500        \n"
        "NEW LISTING LIMITED                 ,NEWCO     ,           ,1200       ,1200       \n"
    )
    assert fo_lots(TextFetcher(body), "2026-09-28") == {"360ONE": 500, "NEWCO": 1200}  # type: ignore[arg-type]


def test_index_lists_carry_the_isin_and_nse_sector() -> None:
    body = (
        "Company Name,Industry,Symbol,Series,ISIN Code\n"
        "360 ONE WAM Ltd.,Financial Services,360ONE,EQ,INE466L01038\n"
        ",,,,\n"
    )
    [row] = index_list(TextFetcher(body), 9, "2026-09-28")  # type: ignore[arg-type]
    assert (row.symbol, row.name, row.sector, row.isin) == (
        "360ONE",
        "360 ONE WAM Ltd.",
        "Financial Services",
        "INE466L01038",
    )


def test_fund_categories_read_amfi_headings_however_they_are_spelled() -> None:
    assert fund_category("Equity Scheme - Large Cap Fund") == ("Equity", "Large cap")
    assert fund_category("Equity Schemes - Large & Mid Cap Fund") == ("Equity", "Large and mid cap")
    assert fund_category("Income/Debt Oriented Schemes - Ultra Short Term Fund") == (
        "Debt",
        "Ultra short duration",
    )
    assert fund_category("Debt Scheme - Medium to Long Duration Fund") == ("Debt", "Medium to long duration")
    assert fund_category("Hybrid Scheme - Dynamic Asset Allocation or Balanced Advantage") == (
        "Hybrid",
        "Balanced advantage",
    )
    assert fund_category("Other Scheme - Index Funds", "UTI Nifty 50 Index Fund") == ("Index", "Equity index")
    assert fund_category("Other Scheme - Index Funds", "Bharat Bond Index Fund April 2030") == (
        "Index",
        "Debt index",
    )
    assert fund_category("Other Scheme - FoF Overseas") == ("Fund of funds", "Overseas")
    assert fund_category("Other Scheme - Gold ETF") is None


def test_amfi_file_gives_plan_option_and_category() -> None:
    text = (
        "Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date\n"
        "\n"
        "Open Ended Schemes(Equity Scheme - Large Cap Fund)\n"
        "\n"
        "Axis Mutual Fund\n"
        "\n"
        "120465;INF846K01DP8;-;Axis Large Cap Fund;Direct Plan;Growth Option;71.4300;25-Sep-2026\n"
        "Close Ended Schemes(Income)\n"
        "Some Fund House\n"
        "100001;INF000A01AA1;-;Some Fixed Term Plan - Series 1 - Regular Plan - Growth;26.0000;25-Sep-2026\n"
    )
    first, second = parse_amfi(text)
    assert (first.code, first.amc, first.structure, first.category) == (
        120465,
        "Axis Mutual Fund",
        "Open Ended",
        "Equity Scheme - Large Cap Fund",
    )
    assert (first.plan, first.option, first.nav, first.nav_date) == (
        "Direct",
        "Growth",
        71.43,
        date(2026, 9, 25),
    )
    # The older six-column rows say the plan and option only in the name.
    assert (second.structure, second.plan, second.option) == ("Close Ended", "Regular", "Growth")
