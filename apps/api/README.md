# api

A Fastify 5 REST API under `/v1`, with OpenAPI docs at `/docs`. It is one deployable, split into modules:

| Module | What it serves |
| --- | --- |
| instruments | search, lookup by page slug, daily candles, intraday bars rolled up from 1-minute bars |
| quotes | latest quotes from Valkey, falling back to the last daily close when the feed is off |
| companies | a company page: statements, ratios, P/E history, ownership, peers, events and experiments |
| market | the daily brief's context, FPI and DII flows |
| reference | IPOs, bonds, the G-Sec yield curve |
| me | the anonymous account, watchlists, alerts, notifications, holdings |
| lab | backtests: validate, version the strategy, return a cached result or queue a run on BullMQ |

Zod schemas validate requests and generate the OpenAPI document, and Kysely types every query from the generated schema. Hot reads are cached in Valkey. Rate limits are counted in Valkey too, so every instance shares them.

```bash
pnpm --filter @greencircuits/api dev                # http://localhost:4000, docs at /docs
pnpm --filter @greencircuits/api test               # unit tests
pnpm --filter @greencircuits/api test:integration   # against the running stack, migrated and seeded
```

Set `LAB_E2E=1` for the integration tests, with a backtest worker running, and they follow a backtest through the queue to its result.
