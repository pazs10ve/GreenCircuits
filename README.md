# GreenCircuits

A research and strategy-testing project for Indian markets. It has three parts:

- **a daily market brief**;
- **company pages** that read like reports;
- **a lab** that backtests investing ideas with Indian costs, from SIPs and rebalancing to entry and exit rules.

It is built in the shape of a real system:

- PostgreSQL with TimescaleDB, and a REST API;
- a market-data ingestor and a WebSocket gateway;
- an alert engine that fires each alert exactly once;
- Python backtest workers behind a queue.

The target is 100,000 requests an hour and 1,000 concurrent users, and load tests will show whether it gets there.

It is a portfolio project, not a product. Prices come from a market simulator, company figures are generated, and nothing here is investment advice.

> Green is up on Indian market screens, and a circuit is the exchange's daily price band.

## What works

- **Today:** a daily brief written from the state of the market: a headline, the index's day, what moved and why, sectors, and what's coming up. It also asks "Would it have worked?" of three ideas, using ten years of index history.
- **Company pages:** price, the five numbers that matter, and P/E against the company's own history and its sector. Then financials, ownership, peers and events, all read from the database.
- **Your data:** watchlists, alerts and holdings, kept on the server under an anonymous account. There is no sign-up ([ADR 0002](docs/adr/0002-anonymous-accounts.md)).
- **Alerts:** checked on every tick, fired exactly once, and delivered as in-app notifications.
- **The lab:** describe an idea in sentences, as a monthly SIP (optionally waiting for dips), an equity and bond mix, or entry and exit rules, and get a report.
  - **The engine:** tests are queued on BullMQ and run by a Python engine ([ADR 0001](docs/adr/0001-backtest-jobs-on-a-queue.md)). It fills at the next day's open and charges STT, stamp duty, exchange fees, GST and DP charges.
  - **The alternative:** every result sits next to the obvious alternative: a plain SIP, the same SIP in the index, a fixed deposit, all equity, or buying and holding.
  - **The report:** it has the growth chart, the numbers, drawdowns, month-by-month returns and trades, plus a held-out final 30% of the period that shows whether an edge survives.
- **Demo mode:** with the backend off, the site still works, running the simulator in the browser ([ADR 0003](docs/adr/0003-live-and-demo-modes.md)).

Not done yet: running lab tests in demo mode (they need the backend today), and the screener, F&O, IPO, bond and commodity pages in the new design. See the [roadmap](#roadmap).

## Architecture

```mermaid
flowchart LR
  browser([Browser]) -- pages --> web[web<br/>Next.js]
  web -- SSR and /api/v1 proxy --> api[api<br/>Fastify]
  browser -- WebSocket --> stream[stream<br/>uWebSockets.js]
  ingestor[ingestor<br/>simulator] -- quotes, gc:ticks --> valkey[(Valkey)]
  ingestor -- 1-minute bars --> pg[(Postgres<br/>TimescaleDB)]
  valkey -- gc:ticks --> stream
  valkey -- gc:ticks --> alerts[alerts<br/>exactly once]
  alerts -- triggers, notifications --> pg
  api --> pg
  api -- cache, rate limits, backtests queue --> valkey
  valkey -- BullMQ --> worker[lab worker<br/>Python]
  worker -- results, trades --> pg
```

- **Data:** the SQL schema in [`db/`](db) is the source of truth; numbered migrations sit on top of it. The seed loader fills it with five years of daily bars, statements, valuations, bonds and IPOs for 66 instruments.
- **Live prices:** the ingestor publishes changed quotes every 250 ms. The gateway conflates them per client and copes with slow sockets. Frames are compact JSON arrays ([ADR 0004](docs/adr/0004-json-quote-frames.md)).
- **Contracts:** Zod schemas in [`packages/contracts`](packages/contracts) are shared by the web app, the API and, through stored definitions, the Python engine.

The full design, including specs, capacity maths, the schema, hosting and the load-test plan, is in [`docs/blueprint.html`](docs/blueprint.html); download it and open it in a browser. Decisions are recorded in [`docs/adr`](docs/adr).

## Getting started

Requirements:

- Docker;
- Node.js 22 or later;
- pnpm 12 (`npx pnpm@12.6.0` works if corepack doesn't);
- Python 3.12 with [uv](https://docs.astral.sh/uv/).

```bash
cp .env.example .env
pnpm install
pnpm infra:up        # TimescaleDB and Valkey; the migrate service applies the schema
pnpm db:seed         # the demo dataset, in about five seconds
cp apps/web/.env.example apps/web/.env.local   # live mode: the web app uses the API and the gateway
pnpm dev             # the web app, API, gateway, ingestor and alert engine
```

In a second terminal, start the backtest worker:

```bash
cd pipelines && uv sync && uv run python -m greencircuits.lab.worker
```

Then open http://localhost:3000. The API docs are at http://localhost:4000/docs.

| Process | Port | Health check |
| --- | --- | --- |
| web | 3000 | |
| api | 4000 | `/health`, which also reports feed freshness |
| stream | 4001 | `/health` |
| ingestor | 4010 | `/health` |
| alerts | 4011 | `/health` |
| lab worker | 4020 | `/health` |
| Postgres | 55432 | |
| Valkey | 6380 | |

The database and Valkey ports avoid clashing with other local projects. Change `GC_DB_PORT` or `GC_VALKEY_PORT` in `.env` if they do.

- **Demo mode only:** run `pnpm --filter web dev` without `apps/web/.env.local`.
- **After pulling new migrations:** run `pnpm db:migrate`.

## Tests

```bash
pnpm typecheck && pnpm lint && pnpm test          # types, lint and unit tests
pnpm --filter @greencircuits/api test:integration # the API against the running stack
LAB_E2E=1 pnpm --filter @greencircuits/api test:integration   # and a backtest through the worker
pnpm db:test                                      # schema smoke checks in a throwaway database
cd pipelines && uv run pytest && uv run ruff check
```

[CI](.github/workflows/ci.yml) runs all of these on every push to `main` and on every pull request. The integration job starts TimescaleDB and Valkey as service containers, migrates and seeds a fresh database, starts a backtest worker, and follows a backtest from the API through the queue to its results.

## Hosting and cost

The web app can live on Vercel's free tier permanently, in demo mode. The backend runs with Docker Compose on a laptop, or on a short-lived VM for demos and load tests, so it costs nothing while it's off. CI uses GitHub Actions' free minutes.

## Market data

Today every price comes from the simulator, and every company figure is generated deterministically. Both are labelled as such in the site's masthead.

Real sources are planned:

- a broker API on your own account (Angel One SmartAPI or Fyers) for live prices;
- the exchanges' daily bhavcopy files for end-of-day data.

Broker and exchange terms don't allow showing their data publicly, so real data would stay behind your own login.

Backtest results are hypothetical.

## Repository layout

```
GreenCircuits/
├── apps/
│   ├── web/          Next.js web app, live and demo modes
│   ├── api/          Fastify REST API (/v1, OpenAPI at /docs)
│   ├── stream/       uWebSockets.js gateway for live quotes
│   ├── ingestor/     market feed (the simulator today) and 1-minute bars
│   ├── alerts/       alert engine
│   └── worker/       planned: email and Telegram delivery
├── packages/
│   ├── contracts/    wire formats, Valkey keys, strategy and backtest schemas
│   ├── market/       catalog, simulator, formatting, Black-76, research helpers
│   ├── db/           Kysely types, the connection, the demo-data loader
│   └── ui/           planned: shared design tokens
├── pipelines/        Python: the backtest engine and its worker
├── db/               schema.sql, timescale.sql, migrations/, migrate.sh, tests/
├── compose.yml       local stack: TimescaleDB, Valkey, optional MinIO
├── deploy/, infra/, loadtest/   later: production overrides, load-test machines, k6
└── docs/             blueprint.html, adr/
```

## Roadmap

- [x] **Foundations:** monorepo, Compose stack, the schema (79 tables) and migrations, the simulator, CI
- [x] **Data and API:** the demo-data loader, a REST API with OpenAPI, company pages and the daily brief from the database
- [x] **Realtime:** the ingestor, 1-minute bars in TimescaleDB, the WebSocket gateway, live and demo modes
- [x] **Your data and alerts:** anonymous accounts, synced watchlists, alerts and holdings, and exactly-once alerts with in-app notifications
- [x] **Backtest engine:** the queue, the Python engine with Indian charges and in-sample and out-of-sample results
- [x] **Lab interface:** build, run and read backtests in the new design
- [ ] **Lab in demo mode:** run tests in the browser when the backend is off
- [ ] **The rest of the site:** Explore (screener, IPOs, bonds, commodities), F&O, portfolio and watchlists in the new design, and a case-study page
- [ ] **Prove it:** k6 load tests at 100,000 requests an hour and 1,000 sockets, dashboards, published results
- [ ] **Later:** real end-of-day data, a broker feed, email and Telegram alerts, paper trading, walk-forward testing

## License

Not chosen yet.
