# 3. The web app runs with or without the backend

- Date: 2026-09-27
- Status: accepted

## Context

The backend (Postgres, Valkey, the API, the ingestor, the gateway, the alert engine and the backtest workers) won't run all the time; keeping it up would cost money every month. The web app can sit on Vercel's free tier permanently. The link on a resume should work on any day, not only on days the backend happens to be running.

## Decision

The server picks one of two modes on each request:

- **Live:** `NEXT_PUBLIC_STREAM_URL` is set and `GET /v1/quotes/snapshot` answers with the ingestor's quotes. Pages render from the API, the browser subscribes to the WebSocket gateway, user data syncs to the API, and alerts and backtests run on the server.
- **Demo:** anything else. The same market simulator runs in a Web Worker in the browser, and research data comes from the generators the database loader uses. User data stays in the browser, and alerts are checked in the page.

Both modes open the day's market in the same state. The seed is derived from the IST date, and the ingestor and the browser simulate the same instruments in the same order, so the server-rendered page matches the browser's first render either way.

## Consequences

- The site never breaks because the backend is off. At worst it drops to demo mode.
- There are two data paths. They stay small because the browser, the database loader and the ingestor share `@greencircuits/market`.
- Prices are simulated in both modes, so the masthead reads "Demo market" in both. What differs is where the simulator runs and where your data is kept.
- In demo mode, alerts fire only while a tab is open.
- Backtests need price history in the database and a worker, so they run only in live mode. The site's worked examples ("Would it have worked?") are computed in TypeScript from the same generated history, so they work in both modes. How the lab behaves in demo mode is still open: it could show saved runs, or run a TypeScript engine in the browser.
