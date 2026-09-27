# api

A Fastify 5 REST API under `/v1`, with OpenAPI docs at `/docs`. It is one deployable, split into modules:

| Module | What it serves |
| --- | --- |
| instruments | search, lookup by page slug, daily candles, intraday bars rolled up from 1-minute bars |
| quotes | latest quotes from Valkey, falling back to the last daily close when the feed is off |
| companies | a company page: statements, ratios, P/E history, ownership, peers, events and experiments |
| market | the daily brief's context, FPI and DII flows |
| reference | IPOs, bonds, the G-Sec yield curve |
| auth | sign-up (which keeps the visitor's anonymous data), sign-in (which merges it), sign-out |
| me | the account, preferences, password, sessions, watchlists, alerts, notifications, holdings, export and deletion |
| feed | the personalised feed, from what the visitor follows |
| lab | backtests: validate, version the strategy, return a cached result or queue a run on BullMQ |

Sessions are random tokens in an httpOnly cookie, stored only as a SHA-256 hash, and passwords are hashed with scrypt ([ADR 0006](../../docs/adr/0006-accounts-and-sessions.md)). Zod schemas validate requests and generate the OpenAPI document, and Kysely types every query from the generated schema. Hot reads are cached in Valkey. Rate limits are counted in Valkey too, so every instance shares them.

```bash
pnpm --filter @greencircuits/api dev                # http://localhost:4000, docs at /docs
pnpm --filter @greencircuits/api test               # unit tests
pnpm --filter @greencircuits/api test:integration   # against the running stack, migrated and seeded
```

Set `LAB_E2E=1` for the integration tests, with a backtest worker running, and they follow a backtest through the queue to its result.
