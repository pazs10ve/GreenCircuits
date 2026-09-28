# pipelines

The Python side of GreenCircuits, managed with [uv](https://docs.astral.sh/uv/) (`uv sync`).

`greencircuits.lab` is the strategy engine:

- `worker.py` consumes the BullMQ `backtests` queue. Run it with `uv run python -m greencircuits.lab.worker`; its health check is on port 4020.
- `engine.py` claims a run from `lab.backtest_run` and loads daily bars. It simulates the strategy, then writes the metrics, equity curve, monthly returns and trades in one transaction.
- `simulate.py` runs three kinds of strategy:
  - monthly SIPs, which can wait for dips;
  - rebalancing between equity and bonds once a year;
  - rules, with entries on indicator conditions and exits on stops, targets, trailing stops, time limits or signals.

  Signals use the close. Fills happen at the next open, with slippage.
- `charges.py` applies Indian delivery charges: STT, exchange and SEBI fees, stamp duty, GST and DP charges.
- `metrics.py` reports CAGR, volatility, Sharpe, Sortino, drawdown, Calmar and XIRR, for the whole run and split in and out of sample.
- `parity.py` writes the golden files that keep the browser's TypeScript engine (`packages/backtest`) giving the same results. Run `uv run python -m greencircuits.lab.parity --write` after changing the engine.

`greencircuits.jobs` loads real data for running locally ([ADR 0007](../docs/adr/0007-real-data-for-local-use.md)):

- `real_data.py` replaces the demo data, step by step. Run it from the repository root with `pnpm data:real`, or here with `uv run python -m greencircuits.jobs.real_data [--only a,b] [--skip a,b] [--refresh]`. Its steps are:
  - `membership`: index constituents;
  - `prices`: ten years of daily bars;
  - `financials`: statements, ratios and valuation history;
  - `shareholding`;
  - `events`: results dates and dividends;
  - `flows`: FII and DII;
  - `ipos`;
  - `funds`: mutual fund NAVs and returns (AMFI and mfapi.in), and listed ETFs' NAVs (NSE);
  - `bonds`: bonds traded on NSE, and the government's yield curve;
  - `snapshot`: the screener table.
- `sources.py` turns each free source into plain Python values: Yahoo Finance, NSE's website JSON, niftyindices.com, AMFI and mfapi.in.
- `bonds.py` reads a bond's coupon and maturity from its NSE symbol, prices it and fits a Nelson–Siegel curve to the government's bonds.
- `http.py` is a polite client. It paces requests per host, retries 429s and 5xx responses, and caches each response for the day in `data/cache/`.

```bash
uv run pytest
uv run ruff check
```

Planned: `greencircuits.quant` for pricing checked against `packages/market`.
