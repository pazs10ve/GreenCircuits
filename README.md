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

It was designed for 100,000 requests an hour and 1,000 concurrent users. Load tests on one laptop show it handles that, and that the WebSocket gateway is the first part to give way beyond it ([What it handles](#what-it-handles)).

It is a portfolio project, not a product. Out of the box, prices come from a market simulator and company figures are generated. One command loads real data from free sources instead, for use on your own machine ([Real data, locally](#real-data-locally)). Nothing here is investment advice.

> Green is up on Indian market screens, and a circuit is the exchange's daily price band.

## What works

- **Today:** a daily brief written from the state of the market:
  - a headline;
  - the index's day;
  - what moved and why;
  - sectors;
  - what's coming up.

  It also asks "Would it have worked?" of three ideas, using ten years of index history.
- **Company pages:** price, the five numbers that matter, and P/E against the company's own history and its sector. Then financials, ownership, peers and events, all read from the database.
- **Accounts:** email and password, on server-side sessions ([ADR 0006](docs/adr/0006-accounts-and-sessions.md)).
  - Every visitor gets an anonymous account from the first click ([ADR 0002](docs/adr/0002-anonymous-accounts.md)). Signing up keeps it, and signing in from another browser merges what was made there.
  - Watchlists, alerts, holdings, tests and preferences live in Postgres, and can be downloaded as JSON or deleted.
- **For you:** a feed on Today about the stocks you follow. It covers:
  - unusual moves;
  - 52-week highs and lows;
  - results and dividends in the coming week;
  - alerts that went off;
  - finished tests;
  - the stocks that meet your tested rules today.

  It's ranked for long-term investors or traders, and can follow whole sectors.
- **Alerts:** checked on every tick, fired exactly once, and delivered as in-app notifications.
- **The lab:** describe an idea in sentences and get a report. An idea can be a monthly SIP (optionally waiting for dips), an equity and bond mix, or entry and exit rules.
  - **The engine:** tests are queued on BullMQ and run by a Python engine ([ADR 0001](docs/adr/0001-backtest-jobs-on-a-queue.md)).
    - It fills at the next day's open and charges STT, stamp duty, exchange fees, GST and DP charges.
    - With the backend off, a TypeScript copy runs the same tests in the browser. Golden files keep the two engines agreeing ([ADR 0005](docs/adr/0005-backtest-engine-in-the-browser.md)).
  - **The alternative:** every result sits next to the obvious alternative: a plain SIP, the same SIP in the index, a fixed deposit, all equity, or buying and holding.
  - **The report:** it has the growth chart, the numbers, drawdowns, month-by-month returns and trades. A held-out final 30% of the period shows whether an edge survives.
- **Demo mode:** with the backend off, the site still works, running the simulator in the browser ([ADR 0003](docs/adr/0003-live-and-demo-modes.md)).
- **Real data, locally:** `pnpm data:real` loads real data, and the ingestor then follows real prices. Every page says whether it's showing real or sample figures ([ADR 0007](docs/adr/0007-real-data-for-local-use.md)). It loads:
  - NSE prices going back ten years, with results, shareholding, index membership, events, flows and IPOs, from Yahoo Finance and NSE;
  - mutual fund NAVs, from AMFI;
  - traded bonds, from NSE.
- **Explore:**
  - every stock, index and sector;
  - a screener with its own query language;
  - option chains with a strategy builder;
  - mutual funds, ETFs, REITs and InvITs;
  - IPOs;
  - bonds with the yield curve and a calculator;
  - commodities in rupees or dollars.
- **Portfolio:** holdings with a year's look-back against the Nifty, sectors and capital gains tax; watchlists; and alerts.

What's next is in [Improving it](#improving-it) and the [roadmap](#roadmap).

## Running it

### Requirements

- Docker;
- Node.js 22 or later;
- pnpm 12 (`corepack enable` provides it; otherwise use `npx pnpm@12.6.0` wherever this says `pnpm`);
- Python 3.12 or later with [uv](https://docs.astral.sh/uv/), for the backtest worker and the real-data loader.

The commands are for a POSIX shell. On Windows, use Git Bash.

### First run

```bash
cp .env.example .env
pnpm install
pnpm infra:up      # Postgres with TimescaleDB, and Valkey; a one-off container applies the schema
pnpm db:seed       # the demo market: 880 instruments and five years of history, in under a minute
cp apps/web/.env.example apps/web/.env.local   # live mode: the web app reads from the API and the gateway
pnpm dev           # the web app, API, gateway, ingestor and alert engine, reloading on change
```

In a second terminal, start the backtest worker:

```bash
cd pipelines
uv sync
uv run python -m greencircuits.lab.worker
```

Then open http://localhost:3000. The API's docs are at http://localhost:4000/docs.

This runs on the simulator. To load real prices and figures instead, see [Real data, locally](#real-data-locally).

| Process | Port | Health check |
| --- | --- | --- |
| web | 3000 | |
| api | 4000 | `/health`: Postgres, Valkey and how long since the last tick |
| stream (the WebSocket gateway) | 4001 | `/health` |
| ingestor | 4010 | `/health`, which answers 503 when the feed is stale |
| alerts | 4011 | `/health` |
| lab worker | 4020 | `/health` |
| Postgres | 55432 | |
| Valkey | 6380 | |

### Everyday commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Runs every Node service, reloading on change |
| `pnpm infra:down` | Stops Postgres and Valkey and keeps their data |
| `pnpm infra:reset` | Stops them and deletes their data |
| `pnpm db:migrate` | Applies new migrations, after a pull |
| `pnpm db:seed` | Reloads the demo data. Users' watchlists, alerts and portfolios are left alone |
| `pnpm db:add` | Adds only the instruments the database doesn't have yet, leaving the rest, real data included |
| `pnpm data:real` | Replaces the demo data with real data ([Real data, locally](#real-data-locally)) |
| `pnpm db:psql` | Opens a psql shell on the database |
| `pnpm build` | Builds every app. Each then starts from its build with `pnpm --filter <app> start` |

### Live and demo modes

- **Live:** the web app reads from the API and the gateway named in `apps/web/.env.local`, as in the first run above.
- **Demo only:** run `pnpm --filter web dev` without `apps/web/.env.local`. The simulator, your data and backtests all run in the browser, with no backend at all.

The [diagram below](#two-modes) shows how a page picks one.

### Configuration

Compose reads `.env`. The services don't read it, but their defaults match it. To move a port, change it in `.env` and export the matching URL before `pnpm dev`.

`pnpm dev` passes only four variables through to the services: `DATABASE_URL`, `VALKEY_URL`, `WEB_ORIGINS` and `FEED_PROVIDER`. Set the others when you start a service on its own.

| Variable | Read by | Default |
| --- | --- | --- |
| `GC_DB_PORT`, `GC_VALKEY_PORT` | Compose | `55432`, `6380` |
| `DATABASE_URL` | API, ingestor, alerts, worker, both loaders | `postgres://greencircuits:greencircuits@localhost:55432/greencircuits` |
| `VALKEY_URL` | API, gateway, ingestor, alerts, worker | `redis://localhost:6380` |
| `FEED_PROVIDER` | ingestor | `simulator`, or `yahoo` once real data is loaded |
| `WEB_ORIGINS` | API, gateway | `http://localhost:3100,http://localhost:3000` |
| `SESSION_SECRET` | API | A development value. The API refuses to start in production without a real one |
| `RATE_LIMIT_PER_MINUTE` | API | 1,200 requests a minute per IP |
| `BACKTEST_CONCURRENCY` | worker | 2 runs at a time |
| `PORT` | each service | The ports above |
| `API_URL`, `NEXT_PUBLIC_STREAM_URL` | web app, from `apps/web/.env.local` | Unset, which means demo mode |

### When something's off

- **Port 3000 is taken:** Next.js moves to the next free port, and the API and gateway refuse a page from an origin they don't know. Free the port, or add the new address, for example `WEB_ORIGINS=http://localhost:3001 pnpm dev`.
- **Prices don't move in live mode:**
  - The gateway's `/health` should answer.
  - The API's `/health` shows how long ago the last tick came.
  - The ingestor answers 503 when its feed is stale.
- **A page returns 404 right after you edit its route:** the dev server can keep a stale route table. Restart `pnpm dev`.
- **A page shows old figures after `pnpm data:real`:** the web app's fetch cache serves the previous data once. Reload the page.

### Tests

```bash
pnpm typecheck && pnpm lint && pnpm test          # types, lint and unit tests
pnpm --filter @greencircuits/api test:integration # the API against the running stack
LAB_E2E=1 pnpm --filter @greencircuits/api test:integration   # and a backtest through the worker
pnpm db:test                                      # schema smoke checks in a throwaway database
cd pipelines && uv run pytest && uv run ruff check
```

The unit tests include the golden-file check between the Python and TypeScript engines. After changing the engine:

1. Rewrite the golden file with `uv run python -m greencircuits.lab.parity --write` (in `pipelines/`).
2. Bring the other engine back in line.

[CI](.github/workflows/ci.yml) runs all of these on every push to `main` and on every pull request. The integration job:

1. starts TimescaleDB and Valkey as service containers;
2. migrates and seeds a fresh database;
3. starts a backtest worker;
4. follows a backtest from the API through the queue to its results.

### Load tests

[`loadtest/`](loadtest) runs the blueprint's five scenarios against a separate copy of the stack: its own database, Valkey and ports, so the development data is never touched. [`loadtest/README.md`](loadtest/README.md) is the runbook, and [`loadtest/RESULTS.md`](loadtest/RESULTS.md) holds the latest results.

## How it works

### The system

```mermaid
flowchart TB
  browser([Browser]) -- pages --> web[web<br/>Next.js]
  browser -- WebSocket --> stream[stream<br/>uWebSockets.js]
  web -- SSR and /api/v1 proxy --> api[api<br/>Fastify]
  ingestor[ingestor<br/>simulator or Yahoo] -- quotes, gc:ticks --> valkey[(Valkey)]
  ingestor -- 1-minute bars --> pg[(Postgres<br/>TimescaleDB)]
  valkey -- gc:ticks --> stream
  valkey -- gc:ticks --> alerts[alerts<br/>exactly once]
  alerts -- triggers, notifications --> pg
  api --> pg
  api -- cache, rate limits, backtests queue --> valkey
  valkey -- BullMQ --> worker[lab worker<br/>Python]
  worker -- results, trades --> pg
```

- **Data:** the SQL schema in [`db/`](db) is the source of truth, and numbered migrations sit on top of it. The seed loader fills it with:
  - five years of daily bars for 880 instruments: 859 NSE listings, 11 indices, and 10 commodities and currencies;
  - statements, valuations and shareholding for 500 companies;
  - bonds and IPOs.
- **Live prices:** the ingestor publishes changed quotes every 250 ms. The gateway conflates them per client and copes with slow sockets. Frames are compact JSON arrays ([ADR 0004](docs/adr/0004-json-quote-frames.md)).
- **Contracts:** Zod schemas in [`packages/contracts`](packages/contracts) are shared by the web app, the API and, through stored definitions, the Python engine.

The full design, including specs, capacity maths, the schema, hosting and the load-test plan, is in [`docs/blueprint.html`](docs/blueprint.html). Download it and open it in a browser.

### Live prices

- **The ingestor** keeps the latest quote of every instrument in a Valkey hash and publishes what changed.
- **The gateway** holds its own copy, so a new subscriber gets current prices at once rather than at the next tick.

```mermaid
sequenceDiagram
  participant I as Ingestor
  participant V as Valkey
  participant G as Gateway
  participant B as Browser
  B->>G: connect
  G-->>B: hello, with the source<br/>and the 250 ms flush
  B->>G: sub, with the ids on screen
  G-->>B: their quotes, at once
  loop every 250 ms
    I->>V: HSET gc:quotes<br/>PUBLISH gc:ticks
    V->>G: gc:ticks
    G-->>B: this client's quotes only
  end
  Note over G,B: A client 256 KB behind is skipped,<br/>then sent the latest of what it missed
```

- **Bars:** the ingestor also writes one-minute bars to Postgres every 5 seconds.
- **With real data:** it polls Yahoo every minute while NSE trades and every 15 minutes otherwise, and publishes the same way.

### An alert, exactly once

Every engine holds all active alerts in memory and checks each tick against them. Firing is a claim in Postgres, so any number of engines can run side by side.

```mermaid
sequenceDiagram
  participant V as Valkey
  participant A1 as Alert engine 1
  participant P as Postgres
  participant A2 as Alert engine 2
  V->>A1: gc:ticks
  V->>A2: gc:ticks
  Note over A1,A2: Both find the same alert due
  A1->>P: UPDATE app.alert WHERE id,<br/>version, ACTIVE, cooldown passed
  P-->>A1: 1 row, so A1 owns the firing
  A1->>P: trigger, notification, delivery,<br/>in the same transaction
  A2->>P: the same UPDATE
  P-->>A2: 0 rows, so A2 does nothing
```

- **Delivery:** the browser asks the API for new notifications every 10 seconds, and shows each as a toast.
- **Edits:** the version check means an alert edited during a tick never fires on its old terms.
- **Tested:** the load test fired 50,000 alerts this way across two engines, with no duplicates.

### A backtest

```mermaid
sequenceDiagram
  participant B as Browser
  participant A as API
  participant P as Postgres
  participant W as Python worker
  B->>A: POST /v1/me/backtests
  A->>P: same rules, period and<br/>prices run before?
  alt already run
    A-->>B: 200, with that run
  else new
    A->>P: INSERT lab.backtest_run,<br/>QUEUED
    A-)W: a job on the BullMQ queue,<br/>whose id is the run id
    A-->>B: 202, with the run id
    W->>P: RUNNING, load bars,<br/>simulate with charges
    W->>P: results, SUCCEEDED,<br/>in one transaction
  end
  B->>A: GET the run every<br/>second until done
```

- **The queue** lives in Valkey. The worker runs two tests at a time by default.
- **The run row is the record.** The queued job only points at it, so an API retry can't queue a run twice.
- **Results:** the worker writes the metrics, equity curve, monthly returns and trades together.
- **Reruns:** the cache key covers the rules, dates, capital, slippage, the prices' version and the engine's version. Asking again returns the earlier result.

### Two modes

```mermaid
flowchart LR
  page([A page request]) --> check{"Stream URL set,<br/>and the API answers?"}
  check -- yes --> live["Live: pages from the API,<br/>prices over the WebSocket,<br/>your data, alerts and backtests on the server"]
  check -- no --> demo["Demo: the simulator in a Web Worker,<br/>backtests in TypeScript,<br/>your data in the browser"]
```

Both modes open the day's market in the same state: the simulator's seed comes from the IST date. The server-rendered page therefore matches the browser's first render either way ([ADR 0003](docs/adr/0003-live-and-demo-modes.md)).

## Decisions

The records are in [`docs/adr`](docs/adr). The blueprint's larger choices are summarised with them here.

| Decision | Why | Where |
| --- | --- | --- |
| **One database:** Postgres 17 with TimescaleDB | Relational and time-series data in one engine, with compression and rollups for the bars | Blueprint |
| **Valkey** for quote snapshots, pub/sub, rate limits, the cache and the job queues | One process does all five; at this volume nothing heavier is needed | Blueprint |
| **The API is a modular monolith** on Fastify, with Zod schemas published as OpenAPI | Peak load is about 300 requests a second. One deployable keeps a small team fast, and the module boundaries allow a split later | Blueprint |
| **A separate WebSocket gateway** on uWebSockets.js | Thousands of sockets per core. The tick format is the contract, so the gateway or the ingestor can be rewritten without touching the rest | Blueprint |
| **Alerts fire through a conditional update** | Engines can run side by side without firing an alert twice, and an edit made mid-tick wins | [`apps/alerts`](apps/alerts/src/main.ts) |
| **Backtests go through a queue** (BullMQ) to Python workers | Bursts, retries and stalled-job recovery come from BullMQ. The run id is the job id, so a retry can't queue a run twice | [ADR 0001](docs/adr/0001-backtest-jobs-on-a-queue.md) |
| **Every visitor gets an anonymous account** from the first click | People can try the lab from a link without signing up | [ADR 0002](docs/adr/0002-anonymous-accounts.md) |
| **The web app runs with or without the backend** | The link works on any day, while the backend runs only when needed | [ADR 0003](docs/adr/0003-live-and-demo-modes.md) |
| **Quote frames are JSON arrays,** not Protobuf | Readable in DevTools, with no decoder in the browser; positional arrays already save most of what Protobuf would | [ADR 0004](docs/adr/0004-json-quote-frames.md) |
| **A TypeScript copy of the backtest engine** runs the lab in demo mode | The lab works with the backend off. Golden files keep the two engines agreeing | [ADR 0005](docs/adr/0005-backtest-engine-in-the-browser.md) |
| **Email and password accounts** on server-side sessions | Sessions can be revoked, and no third-party service is needed | [ADR 0006](docs/adr/0006-accounts-and-sessions.md) |
| **Real data from free sources,** for local use only | Shows whether the pages say anything true, without a data licence. It is never deployed | [ADR 0007](docs/adr/0007-real-data-for-local-use.md) |

## What it handles

Measured on 28 September 2026 against the blueprint's targets. The rig was one laptop: an i7-14700HX with 16 GB of RAM, with the load generators on the same machine. It ran one instance of each service, and two alert engines. Method and full figures: [`loadtest/RESULTS.md`](loadtest/RESULTS.md).

| Load | Result | Target | |
| --- | --- | --- | --- |
| 1,000 users on 1,500 live connections, each following 100 instruments | Prices arrive within 174 ms (p95) | Under 1 s | Pass |
| 100,000 requests an hour (28 a second) in the blueprint's mix | p95 13–16 ms; 1 error in 99,353 requests | Under 150 ms, 30 ms cached | Pass |
| Bursts to 300 requests a second | p95 38–47 ms; cached reads 36–44 ms | Cached under 30 ms | Miss |
| 50,000 alerts crossed by one move | Each fired exactly once, the last 107 s after the move | Exactly once | Pass |
| 50 backtests at once | p95 wait 7 s, all done in 9 s | Wait under 3 min | Pass |
| The ingestor killed | Prices flow again after 15 s | About 10 s | Miss: there's no standby |

**Where it gives way:** the WebSocket gateway fills one core at about 2,000 connections, which is about 1,300 users.
- **At 2,000 connections:** prices still arrive within 712 ms, but 50 connections failed.
- **At 3,000 connections,** the blueprint's upper test: prices arrive 15.7 s late.

Nothing else came close to its limit. At the peaks, the API used 0.63 of a core, Postgres 0.6 and Valkey 0.06.

**Against the blueprint's own estimates:**

| Service | Blueprint | Measured |
| --- | --- | --- |
| API, at 300 requests a second | About one core | 0.63 of a core |
| Gateway, at 1,500 connections | Under one core | 0.7 of a core |
| Postgres, with quotes served from Valkey | A trickle | 0.07 of a core on average |

What these numbers don't show:

- **The feed was the blueprint's whole-market rate:** 20,000 ticks a second across 25,000 instruments. Today's universe is 880 instruments, which leaves the gateway less to filter; that case wasn't measured.
- **Not the blueprint's rig:** it calls for a 4-vCPU VM with the load coming from a second machine. Here the generators shared the machine, which may have added to the burst latencies.

## Improving it

In order of what matters most.

**To carry more load** (from the load tests):

1. **Index the gateway's subscriptions by instrument.** Today every flush checks every quote against every client: 60 million checks a second at 3,000 clients. A map from each instrument to its subscribers cuts that more than 200-fold. Build each quote's wire form once per flush, not once per subscriber. Then run more gateway processes behind the load balancer; each can subscribe to `gc:ticks` on its own.
2. **Add a standby ingestor** that takes over when the active one's lock in Valkey expires. It should skip the start-up backfill: a restart now rebuilds a whole session of one-minute bars before prices flow, which took 12 of the 15 seconds.
3. **Claim alerts in batches.** Claim each tick's due alerts with one `UPDATE … WHERE id = ANY(…) RETURNING`, then insert their notifications together. Today each firing is its own transaction, and both engines try every alert, which is why the last of 50,000 came 107 s late.
4. **Run two API processes,** and serve cached JSON as stored. `cached()` parses every hit, and Fastify serialises it again. Then re-measure the bursts on the blueprint's rig.
5. **Spread reconnects.** After a gateway restart, every browser's first retry lands within the same quarter-second. That's the pattern under which connections failed in the tests.

**To make what's there correct** (bugs found by the tests and the [data audit](#real-data-locally)):

6. **Watchlist saves:** two saves for the same user at once collide, and the second fails with a 500. Lock the user's row first.
7. **Stale quotes:**
   - Check each quote's age in the Yahoo feed and the API. Eight REITs and InvITs, the NV20 ETF and zinc show old or wrong prices as today's.
   - Repair the daily bars those quotes overwrote.
8. **1-year returns** should start from the same date a year ago. They now count back 250 sessions: the Nifty shows −9.5% against a true −7.6%.
9. **Company figures:**
   - Build trailing figures only from four consecutive quarters.
   - Show a missing EPS as unknown, not 0.
10. **Bonds and IPOs:**
    - Use real maturity dates; the symbol gives only the year.
    - Price bonds at the close, not when the loader ran.
    - Refresh IPO subscriptions during the day.
11. **Smaller data items:**
    - Take India VIX from NSE's close.
    - Drop Yahoo's zero-volume holiday bars.
    - Convert a commodity's previous close at that day's exchange rate.

**To match the design** (from the design audit):

12. **Alert delivery:** stop offering Email and Telegram in the alert dialog until they're built.
13. **Price source and market status:** show where prices come from on phones too; it's hidden below 1024 px. Show whether the market is open.
14. **Colours:** give links, focus rings and text selection their own colour, so that benchmark blue means only benchmarks.
15. **Disclaimers:** put "not investment advice" back beside results. It left with the footer.

**The blueprint's depth still to build:**
- filings, corporate actions and delivery %;
- F&O open-interest history;
- bond cash flows;
- alerts beyond price moves;
- XIRR and CAS import;
- paper trading;
- email verification and password reset;
- web push;
- a licensed broker feed.

**To prove it properly:** repeat the load tests on the blueprint's rig, port them to k6, add Grafana dashboards, and run a short load test in CI.

## Hosting and cost

The web app can live on Vercel's free tier permanently, in demo mode. The backend runs with Docker Compose on a laptop, or on a short-lived VM for demos and load tests, so it costs nothing while it's off. CI uses GitHub Actions' free minutes.

## Real data, locally

Out of the box every price comes from the simulator and every company figure is generated, and the masthead says "Demo market". To use real data instead, with the stack running:

```bash
pnpm data:real
```

It takes a few minutes the first time. It loads:

- **prices:** up to ten years of daily bars, from Yahoo Finance, for:
  - 859 NSE listings: companies, ETFs, REITs and InvITs;
  - 11 indices;
  - 10 commodities and currencies.
- **companies:** four years of results, quarterly results, balance sheets and cash flows (Yahoo Finance), and shareholding patterns (NSE);
- **the market:** index membership (niftyindices.com), board meetings, dividends, FII and DII flows, and IPOs (NSE);
- **funds:** every open-ended direct growth mutual fund, with its NAV history (AMFI and mfapi.in), and listed ETFs' NAVs (NSE);
- **bonds:** government and state bonds, T-bills, company bonds and gold bonds traded on NSE, with the government's yield curve fitted to them.

The ingestor then switches to real prices on its own. It polls them every minute while NSE trades and every 15 minutes otherwise, and adds each day's close to the history.

The masthead shows which you're seeing: "NSE, delayed" while the market is open, "Closing prices" after it shuts. Text written from the data turns to the past tense once the session is over.

- **Rerunning:** run it again on later days to pick up new results and shareholding.
  - Responses are cached per day in `data/`, so a rerun on the same day fetches nothing.
  - `--only prices,snapshot` runs chosen steps, and `--refresh` ignores the cache.
- **Going back to the simulator:** set `FEED_PROVIDER=simulator` for the ingestor. `pnpm db:seed` restores the demo data.
- **After a load:** each page may show the previous data once, from the web app's fetch cache. Reload it.

An audit on 28 September 2026 checked the real data against its sources.

- **Exact:**
  - 846 of 859 closing prices matched NSE's official closing prices to the paisa.
  - Nine of ten indices matched NSE.
  - 400 sessions of daily history matched Yahoo.
  - Fund NAVs and returns matched AMFI.
- **Wrong:** the exceptions are listed under [Improving it](#improving-it).

What isn't real, or only approximately:

- commodities are international futures converted to rupees, not MCX's prices;
- NSE's shareholding summary splits only promoters from the public;
- two indices only have history from the day real data was first loaded;
- bonds and IPOs are snapshots from the last time the loader ran;
- option prices are modelled, and open interest and the sample portfolio are samples.

[ADR 0007](docs/adr/0007-real-data-for-local-use.md) has the details.

These sources are free and unofficial, and their terms allow personal use only. Run real data on your own machine and don't deploy it. A licensed broker feed (Angel One SmartAPI or Fyers, on your own account) would be the next step for live prices.

Backtest results are hypothetical.

## Repository layout

```
GreenCircuits/
├── apps/
│   ├── web/          Next.js web app, live and demo modes
│   ├── api/          Fastify REST API (/v1, OpenAPI at /docs)
│   ├── stream/       uWebSockets.js gateway for live quotes
│   ├── ingestor/     market feed (the simulator, or Yahoo with real data) and 1-minute bars
│   ├── alerts/       alert engine
│   └── worker/       planned: email and Telegram delivery
├── packages/
│   ├── contracts/    wire formats, Valkey keys, strategy and backtest schemas
│   ├── market/       catalog, simulator, formatting, Black-76, research helpers
│   ├── db/           Kysely types, the connection, the demo-data loader
│   ├── backtest/     the backtest engine in TypeScript, for the lab in demo mode
│   ├── feed/         the personalised feed and today's signals from your tested rules
│   └── ui/           planned: shared design tokens
├── pipelines/        Python: the backtest engine, its worker and the real-data loader
├── db/               schema.sql, timescale.sql, migrations/, migrate.sh, tests/
├── loadtest/         the load-test scenarios, their runbook and results
├── compose.yml       local stack: TimescaleDB, Valkey, optional MinIO
├── deploy/, infra/   later: production overrides and load-test machines
└── docs/             blueprint.html, adr/
```

## Roadmap

- [x] **Foundations:** monorepo, Compose stack, the schema (79 tables) and migrations, the simulator, CI
- [x] **Data and API:** the demo-data loader, a REST API with OpenAPI, company pages and the daily brief from the database
- [x] **Realtime:** the ingestor, 1-minute bars in TimescaleDB, the WebSocket gateway, live and demo modes
- [x] **Your data and alerts:** anonymous accounts, synced watchlists, alerts and holdings, and exactly-once alerts with in-app notifications
- [x] **Backtest engine:** the queue, the Python engine with Indian charges and in-sample and out-of-sample results
- [x] **Lab interface:** build, run and read backtests in the new design
- [x] **Lab in demo mode:** the engine in TypeScript, checked against the Python one with golden files
- [x] **Accounts and the feed:** sign-up that keeps anonymous data, sessions, and a personalised feed built the same way on the server and in the browser
- [x] **Real data, locally:** a loader for prices, results, shareholding, funds, bonds and market data from free sources, a Yahoo price feed, and labels that say which data a page shows
- [x] **The rest of the site:** stocks, the screener, F&O, funds, IPOs, bonds, commodities, holdings, watchlists and alerts in one visual design
- [x] **Load tests:** the blueprint's five scenarios, run on a laptop, with the results in [`loadtest/RESULTS.md`](loadtest/RESULTS.md)
- [ ] **Scale fixes the load tests point to:** the gateway's subscription index, a standby ingestor, batched alert claims
- [ ] **Prove it on the blueprint's rig:** a 4-vCPU VM with k6 on a second machine, and dashboards
- [ ] **A case-study page** about how it's built and what the load tests found
- [ ] **Later:** a licensed broker feed, email verification and password reset, email and Telegram alerts, paper trading, walk-forward testing

## License

Not chosen yet.
