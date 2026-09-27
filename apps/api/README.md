# api

Fastify REST API (`/v1`), one deployable split into modules: instruments, quotes, candles, market, fundamentals, fo, bonds, ipos, screener, lab, watchlists, alerts, portfolio, billing, users.

Reads are cache-first (Valkey, then Postgres). It also mints the 5-minute stream tokens for the gateway and enqueues backtest jobs on the BullMQ `backtests` queue.

Phases 0–5. See §7.6 of `docs/blueprint.html`.
