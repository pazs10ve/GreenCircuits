"""Golden files that keep the TypeScript engine in step with this one.

The browser runs the lab with a TypeScript copy of this engine when the backend
is off (packages/backtest). packages/backtest/fixtures holds the inputs: frozen
daily bars and a set of strategies. This module records what the Python engine
makes of them in expected.json, and the TypeScript tests check that their
engine gets the same.

After changing the engine: python -m greencircuits.lab.parity --write
Without --write it only checks that expected.json is current.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from .engine import BENCHMARK_ID, WARMUP_DAYS, backtest, instruments_of, series_from_rows

FIXTURES = Path(__file__).resolve().parents[4] / "packages" / "backtest" / "fixtures"
SAMPLE_EVERY = 25


def load_rows() -> list[dict[str, Any]]:
    candles = json.loads((FIXTURES / "candles.json").read_text(encoding="utf-8"))
    return [
        {
            "instrument_id": int(key),
            "trade_date": date.fromisoformat(d),
            "open": o,
            "high": h,
            "low": lo,
            "close": c,
        }
        for key, bars in candles["instruments"].items()
        for d, o, h, lo, c in bars
    ]


def run_case(case: dict[str, Any], rows: list[dict[str, Any]]) -> dict[str, Any]:
    d = case["definition"]
    ids = sorted({*instruments_of(d), BENCHMARK_ID})
    first = date.fromisoformat(case["from"])
    start, end = first - timedelta(days=WARMUP_DAYS), date.fromisoformat(case["to"])
    picked = [r for r in rows if r["instrument_id"] in ids and start <= r["trade_date"] <= end]
    out = backtest(
        d, series_from_rows(picked, ids), first, float(case["capital"]), float(case["slippageBps"])
    )
    sample = out.sample[::SAMPLE_EVERY]
    if (len(out.sample) - 1) % SAMPLE_EVERY:
        sample.append(out.sample[-1])
    return {
        "metrics": out.metrics,
        "oos_from": out.oos_from.isoformat(),
        "benchmark": out.benchmark,
        "monthly_returns": out.monthly,
        "sample_length": len(out.sample),
        "sample": sample,
        "trades": [
            {
                "instrument_id": t.instrument_id,
                "side": t.side,
                "quantity": float(t.quantity),
                "entry_at": t.entry_at.isoformat(),
                "entry_price": float(t.entry_price),
                "exit_at": t.exit_at.isoformat() if t.exit_at else None,
                "exit_price": float(t.exit_price) if t.exit_price is not None else None,
                "charges": float(t.charges),
                "pnl": float(t.pnl) if t.pnl is not None else None,
                "exit_reason": t.exit_reason,
            }
            for t in out.trades
        ],
    }


def compute() -> dict[str, Any]:
    rows = load_rows()
    cases = json.loads((FIXTURES / "cases.json").read_text(encoding="utf-8"))
    return {"sample_every": SAMPLE_EVERY, "cases": {c["name"]: run_case(c, rows) for c in cases}}


def differences(actual: Any, expected: Any, path: str = "", rel: float = 1e-9) -> list[str]:
    """Where two results disagree, allowing for float rounding (NumPy builds can differ by an ulp)."""
    if isinstance(expected, dict) and isinstance(actual, dict):
        out = [f"{path}: missing {k}" for k in expected if k not in actual]
        out += [f"{path}: unexpected {k}" for k in actual if k not in expected]
        for k in expected.keys() & actual.keys():
            out += differences(actual[k], expected[k], f"{path}.{k}", rel)
        return out
    if isinstance(expected, list) and isinstance(actual, list):
        if len(actual) != len(expected):
            return [f"{path}: {len(actual)} items, expected {len(expected)}"]
        return [
            p
            for i, (a, e) in enumerate(zip(actual, expected))
            for p in differences(a, e, f"{path}[{i}]", rel)
        ]
    both_numbers = isinstance(actual, (int, float)) and isinstance(expected, (int, float))
    if both_numbers and not isinstance(actual, bool) and not isinstance(expected, bool):
        return (
            []
            if math.isclose(actual, expected, rel_tol=rel, abs_tol=1e-9)
            else [f"{path}: {actual} != {expected}"]
        )
    return [] if actual == expected else [f"{path}: {actual!r} != {expected!r}"]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--write", action="store_true", help="rewrite expected.json from this engine")
    args = parser.parse_args()
    result = compute()
    target = FIXTURES / "expected.json"
    if args.write:
        target.write_text(json.dumps(result, indent=1, sort_keys=True) + "\n", encoding="utf-8")
        print(f"Wrote {target} ({len(result['cases'])} cases).")
        return 0
    problems = differences(result, json.loads(target.read_text(encoding="utf-8")))
    for p in problems[:20]:
        print(p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
