# pipelines

The Python side of GreenCircuits, managed with [uv](https://docs.astral.sh/uv/) (`uv sync`).

- `greencircuits.jobs`: scheduled data work. Pre-market instrument-master sync, EOD bhavcopies, filings, fundamentals from XBRL, IPO and bond data. Every job records itself in `ops.job_run`, so reruns and backfills are safe.
- `greencircuits.quant`: Black-76 pricing and implied volatility, bond math and indicators, checked against golden test vectors shared with `packages/market`.
- `greencircuits.lab`: the strategy engine, the backtest workers that consume the BullMQ `backtests` queue, the paper-trading runner and the planners.
