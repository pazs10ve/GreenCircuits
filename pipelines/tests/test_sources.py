"""Parsing of the free sources' quirks, without the network."""

from datetime import date
from typing import Any

from greencircuits.jobs.sources import _band, nse_shareholding


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
