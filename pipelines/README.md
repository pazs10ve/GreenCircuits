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

```bash
uv run pytest
uv run ruff check
```

Planned: `greencircuits.jobs` for real end-of-day data (bhavcopies and filings) and `greencircuits.quant` for pricing checked against `packages/market`.
