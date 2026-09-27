# GreenCircuits

A research and strategy-testing platform for Indian markets: NSE and BSE equities, F&O, MCX commodities, bonds and IPOs. Screen stocks, read option chains with live Greeks, backtest strategies with Indian transaction charges, paper trade them on live prices, and set alerts.

It is designed for **100,000 requests an hour and 1,000 concurrent users**, runs on one machine with Docker Compose, and shows its scale with load tests rather than claiming it.

> Green is up on Indian market screens, and a circuit is the exchange's daily price band.

**Status:** phase 0, foundations. The database schema (78 tables) and its TimescaleDB layer are written and tested; the services come next. See the [roadmap](#roadmap).

## Design

The full system design is in [`docs/blueprint.html`](docs/blueprint.html): download it and open it in a browser. It covers the specs, capacity math, high- and low-level design, the schema, UI wireframes, hosting and cost, and the load-test plan. Architecture decisions are recorded in [`docs/adr`](docs/adr).

In short:

- **Web:** Next.js on Vercel.
- **API:** Fastify, one deployable split into modules.
- **Live prices:** an ingestor normalises the market feed and publishes quotes to Valkey; a uWebSockets.js gateway fans them out to browsers as Protobuf deltas ([`tick.proto`](packages/contracts/proto/tick.proto)).
- **Alerts:** an in-memory engine that fires each alert exactly once.
- **Strategy lab:** a Python engine that backtests on history and paper trades on the live feed with the same code. Backtest jobs go through a BullMQ queue ([ADR 0001](docs/adr/0001-backtest-jobs-on-a-queue.md)).
- **Data:** PostgreSQL 17 with TimescaleDB, and Valkey for quotes, cache and queues.

## Repository layout

```
GreenCircuits/
├── apps/
│   ├── web/          Next.js web app
│   ├── api/          Fastify REST API (modular monolith)
│   ├── stream/       uWebSockets.js gateway
│   ├── ingestor/     feed adapters (broker, replay, simulator), quote state, 1-minute bars
│   ├── alerts/       real-time alert engine
│   └── worker/       BullMQ consumers: notifications
├── packages/
│   ├── contracts/    Zod schemas, OpenAPI, tick.proto
│   ├── market/       calendars, contract parsing, en-IN formatting, Black-76
│   ├── db/           Kysely types generated from the schema
│   └── ui/           design tokens and components
├── pipelines/        Python: EOD pipelines, quant library, strategy lab
├── db/               schema.sql, timescale.sql, migrate.sh, tests/
├── compose.yml       local stack: TimescaleDB, Valkey, MinIO
├── deploy/           production overrides (later)
├── loadtest/         k6 scenarios and published results
├── infra/            Terraform for on-demand load-test machines
└── docs/             blueprint.html, adr/
```

## Getting started

Requirements: Docker, Node.js 22 or later, and Python 3.12 with [uv](https://docs.astral.sh/uv/).

```bash
cp .env.example .env
docker compose up -d                                # TimescaleDB and Valkey; applies the schema on first start
docker compose exec db sh tests/run.sh              # 35 smoke checks in a throwaway database
docker compose exec db psql -U greencircuits -d greencircuits
```

Postgres listens on `localhost:55432` and Valkey on `localhost:6380`, so they don't collide with other local projects; change `GC_DB_PORT` or `GC_VALKEY_PORT` in `.env` if they do. MinIO object storage is optional: `docker compose --profile storage up -d`.

The Node workspaces (`corepack enable`, then `pnpm install`) and the Python pipelines (`uv sync` in `pipelines/`) get their commands as each phase lands.

## Market data

Live prices come from a broker API on your own account (Angel One SmartAPI or Fyers), end-of-day data from the exchanges' daily bhavcopy files, and everything public-facing from a built-in market simulator. Broker and exchange terms don't allow showing their data to the public, so live data stays behind your own login.

GreenCircuits is a research and learning tool. Nothing in it is investment advice, and backtest results are hypothetical.

## Roadmap

- [ ] **0 · Foundations:** monorepo, Compose stack, schema, instrument master, simulator, CI, recording the broker feed
- [ ] **1 · Equities:** EOD pipeline, stock pages with adjusted charts, search, fundamentals from XBRL
- [ ] **2 · Realtime:** stream gateway, quote store in a Web Worker, broker adapter
- [ ] **3 · F&O:** option chain with Black-76 IV and Greeks, OI analytics, payoff builder
- [ ] **4 · Screener and alerts:** screener language compiled to SQL, alert engine, notifier
- [ ] **5 · Strategy lab:** backtest engine and workers, results, paper trading, plans and journal
- [ ] **6 · Prove it:** dashboards, k6 load tests, published results
- [ ] **Stretch:** walk-forward optimisation, investment planner, IPOs, bonds, MCX, portfolio import

## License

Not chosen yet.
