"""Faults in Yahoo's daily bars for ETFs, found and put right before they're stored.

Yahoo adjusts stocks for splits, but often not ETFs: many Indian ETFs have
split their units 1:10 (some 1:100), and Yahoo's history shows each as a 90%
fall in a day. It also has the odd day or week of prices off by a factor,
which then come back. Both would make a fund's returns, its risk and any test
run on it nonsense.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import replace
from datetime import date

from .sources import Bar

#: How far a fund can move in a day, beyond what it follows did, before the move counts as a fault.
FAULT = math.log(1.5)
#: The unit splits ETFs do, each with how far a jump, net of the reference's move that day, may miss
#: its ratio and still count. 1:10 is by far the commonest, and it can land on a big day for what the
#: fund follows, which a reference traded in another market may show a day early or late: 1:10 and
#: 1:100 get room for half again either way; the rarer ratios must be close.
SPLITS = {
    2: math.log(1.08),
    5: math.log(1.08),
    10: math.log(1.5),
    20: math.log(1.08),
    50: math.log(1.08),
    100: math.log(1.5),
}
#: A jump that comes back within this many sessions was a fault in the days between.
REVERTS_WITHIN = 5
#: How near the price before the jump "coming back" means.
BACK = math.log(1.25)


def repair_fund_bars(bars: list[Bar], reference: Mapping[date, float]) -> tuple[list[Bar], list[str]]:
    """An ETF's bars with unadjusted unit splits and one-off faults put right, and a note of each fix.

    A fund can't gain or lose half its value in a day beyond what its index or
    metal did (`reference`, closes by day). Such a jump that comes back within a
    week is a fault, and the days between are dropped. One that matches a split
    ratio is a split, and the history before it is rescaled. One on the last day
    is dropped, for the next run to look at again. Anything else is left, and noted.
    """
    out = list(bars)
    notes: list[str] = []
    i = 1
    while i < len(out):
        prev, bar = out[i - 1], out[i]
        now, before = reference.get(bar.day), reference.get(prev.day)
        market = now / before if now and before else 1.0
        jump = math.log(bar.close / prev.close) - math.log(market)
        if abs(jump) <= FAULT:
            i += 1
            continue
        back = next(
            (
                j
                for j in range(i + 1, min(i + 1 + REVERTS_WITHIN, len(out)))
                if abs(math.log(out[j].close / prev.close)) <= BACK
            ),
            None,
        )
        if back is not None:
            days = back - i
            notes.append(f"dropped {days} faulty day{'s' if days > 1 else ''} from {bar.day}")
            del out[i:back]
            continue
        split = min(
            (f for f, room in SPLITS.items() if abs(abs(jump) - math.log(f)) <= room),
            key=lambda f: abs(abs(jump) - math.log(f)),
            default=None,
        )
        if split is not None:
            # A 1:10 split cuts the price to a tenth; a 10:1 consolidation (rarer) multiplies it.
            ratio = 1 / split if jump < 0 else float(split)
            out[:i] = [_scaled(b, ratio) for b in out[:i]]
            notes.append(
                f"rescaled the history before {bar.day} for a {f'1:{split}' if jump < 0 else f'{split}:1'} split"
            )
            i += 1
            continue
        if i == len(out) - 1:
            notes.append(f"dropped a faulty last day, {bar.day}")
            del out[i]
            break
        notes.append(f"left an unexplained jump on {bar.day} ({math.exp(jump):.3f}×)")
        i += 1
    return out, notes


def _scaled(b: Bar, ratio: float) -> Bar:
    return replace(
        b,
        open=b.open * ratio,
        high=b.high * ratio,
        low=b.low * ratio,
        close=b.close * ratio,
        volume=round(b.volume / ratio),
    )
