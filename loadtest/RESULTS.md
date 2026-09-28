# Load test results

Run on 28 September 2026 against the blueprint's targets (§3.3 and §10.2) and measured on one laptop:

- **Alerts and backtests:** both pass outright.
- **HTTP mix:** passes, except for cached reads during the 300 rps bursts. Their p95 was 36–44 ms against a 30 ms target.
- **Stream gateway:** passes at 1,000 and 1,500 clients and fails at 3,000.
- **Failover:** misses its ~10 s target, because there is no standby ingestor.

## How it was run

Not the blueprint's rig. That calls for the stack on one 4-vCPU VM, with k6 on a second machine. This run was on one laptop, with the load generators on the same machine as the stack:

- **Machine:** Intel i7-14700HX (20 cores, 28 threads), 16 GB of RAM, Windows 11. Docker's VM had 8 GB.
- **What ran:**
  - The Node services ran from source under `tsx`, without watch mode.
  - The API ran with `NODE_ENV=production`.
  - The backtest worker is the Python worker, at its default of two runs at a time.
- **Kept away from the development data:**
  - A separate database, `greencircuits_lt`, on the same Postgres container, migrated and seeded: 880 instruments and 1.1 million daily bars.
  - A separate Valkey on port 6390.
  - Separate service ports: API 4100, gateway 4101, ingestor 4110, two alert engines on 4111 and 4112, backtest worker 4120.
  - The scripts refuse the development ports and database.
- **The API's per-IP limit was raised for the test** (`RATE_LIMIT_PER_MINUTE=1000000`). Every request came from one IP; with the default of 1,200 a minute, the limit would have throttled the test itself.
- **Scripts:** in this folder, dependency-free Node 22. k6 wasn't installed.
  - `http-mix.mjs`, `ws-fanout.mjs`, `alerts.mjs`, `backtests.mjs` and `failover.mjs`.
  - `ticks.mjs` is a synthetic feed at the blueprint's 20,000 ticks a second across 25,000 instruments.
  - `monitor.mjs` samples each service's CPU and memory.
  - `run-combined.sh` runs the combined scenario below.

The HTTP mix, the feed, 1,000 and then 3,000 WebSocket clients, and the backtest burst ran together for 30 minutes (`run-combined.sh`). The 1,500- and 2,000-client stages ran separately afterwards, with only the feed alongside, and so did the alerts and failover scenarios.

## Results against the targets

| Scenario | Target | Result | |
|---|---|---|---|
| HTTP, 28 rps for 30 min | p95 < 150 ms, < 30 ms cached; errors < 0.1% | p95 13–16 ms (cached 12–16 ms); 1 error in 99,353 requests (0.001%) | Pass |
| HTTP, three 60 s bursts to 300 rps | same | p95 38–47 ms; **cached p95 36–44 ms**; uncached 42–54 ms | Uncached pass, **cached miss** |
| WebSocket, 1,000 clients × 100 instruments | p95 tick lag < 1 s | p95 137 ms, max 255 ms; 4,000 frames/s | Pass |
| WebSocket, 1,500 clients (the design point) | same | p95 174 ms, max 259 ms | Pass |
| WebSocket, 2,000 clients | same | p95 712 ms, max 997 ms; 50 of 2,000 failed to connect | Marginal |
| WebSocket, 3,000 clients | same | **p95 15.7 s**, max 18.5 s; gateway at 1.0 core; frames at 62% of the rate needed | **Fail** |
| Alerts, 50,000 under a spike, two engines | every alert delivered exactly once | 50,000 triggers, notifications and deliveries; 0 duplicates; 0 of 5,000 control alerts fired | Pass |
| Backtests, 50 at once during the above | p95 queue wait < 3 min; other targets hold | p95 7.1 s; all 50 succeeded; drained in 8.7 s; HTTP p95 stayed at 13.4 ms | Pass |
| Failover, kill the ingestor mid-run | stream resumes within ~10 s | Silent 15.0 s: restarted after 2.4 s, then 12.4 s to the first tick; 0 duplicate bars | **Miss**: no standby exists |

### HTTP mix

The blueprint's mix, in shares of requests:

- 40% quotes;
- 20% daily and intraday bars;
- 15% company and instrument pages;
- 10% index overview and intraday, standing in for option chains, which the browser computes itself;
- 10% screener;
- 5% writes: watchlists and alerts.

"Cached" means reads the API serves from Valkey: quotes, the quote snapshot, company pages, index overviews and the screener.

| Stage | Requests | Errors | p50 | p95 | p99 | Cached p95 | Uncached p95 |
|---|---|---|---|---|---|---|---|
| 28 rps × 7 min | 11,759 | 0 | 3.5 | 15.8 | 32.4 | 15.9 | 15.5 |
| **300 rps × 60 s** | 17,999 | 0 | 5.6 | 47.2 | 64.3 | 44.4 | 53.8 |
| 28 rps × 8 min | 13,439 | 0 | 3.4 | 13.4 | 28.5 | 13.2 | 16.4 |
| **300 rps × 60 s** | 17,999 | 0 | 5.9 | 44.9 | 65.9 | 41.8 | 52.8 |
| 28 rps × 8 min | 13,439 | 0 | 3.6 | 14.2 | 29.9 | 14.1 | 14.4 |
| **300 rps × 60 s** | 17,999 | 1 | 4.3 | 38.3 | 55.3 | 36.2 | 42.1 |
| 28 rps × 4 min | 6,719 | 0 | 4.3 | 13.5 | 30.6 | 11.8 | 24.6 |

All figures are milliseconds.

**In the bursts, every read slowed alike.** The median read still took 2–8 ms, but the p95 of every read class rose to 34–55 ms. That held whether the answer came from Valkey or Postgres, so the time went to waiting, not to a slow query.

The API runs as one Node process, and its JavaScript runs on one thread. At 300 rps it used about 0.6 of a core, and a request that arrives while the thread is busy waits its turn. Two changes to try on the blueprint's rig:

- **Run two API processes;** the VM has four cores.
- **Serve cached JSON as stored.** `cached()` (`apps/api/src/lib/cache.ts`) parses every hit, and Fastify then serialises it again.

Writes took 60–93 ms at p95 during the bursts, within the uncached target.

**One error, a real bug.**
- **What happened:** two `PUT /v1/me/watchlists` requests for the same user overlapped. The handler deletes the user's lists and inserts them again (`apps/api/src/modules/me.ts:119`). The second request's insert hit `watchlist_user_id_name_key` and returned a 500.
- **In real use:** two tabs saving at once can do the same.
- **Fix:** lock the user's row first (`SELECT … FOR UPDATE` on `app.users`), so a second save waits for the first.

### WebSocket fan-out

Each client subscribed to 100 of the feed's 25,000 instruments, so each got about 20 quotes a frame, 4 frames a second. Frames were compressed, as a browser's are: Node's client negotiated permessage-deflate with the gateway. The MB/s column is the JSON after decompression.

| Clients | Connected | Frames/s | Quotes/s | JSON (MB/s) | Lag p50 | p95 | p99 | max |
|---|---|---|---|---|---|---|---|---|
| 1,000 | 1,000 | 4,000 | 80,000 | 4.5 | 83 ms | 137 ms | 154 ms | 255 ms |
| 1,500 | 1,500 | 6,001 | 120,027 | 6.7 | 102 ms | 174 ms | 191 ms | 259 ms |
| 2,000 | 1,950 | 7,812 | 156,242 | 8.7 | 172 ms | 712 ms | 876 ms | 997 ms |
| 3,000 | 3,000 | 7,417 | 148,343 | 8.3 | 8.2 s | 15.7 s | 16.8 s | 18.5 s |

**Why the gateway saturates.** The gateway used half a core at 1,000 clients and all of one at 3,000. On every flush it does two things:

- **Checks every quote against every client's subscriptions** (`apps/stream/src/main.ts`). At 3,000 clients and 5,000 quotes a flush, that is 15 million set lookups a flush, 60 million a second, on one thread.
- **Builds, serialises and compresses each client's frame separately.** It converts each quote to its wire form once per subscriber rather than once.

The first grows with clients × quotes, so fix it first. A map from each instrument to its subscribers cuts a flush to about 65,000 steps at 3,000 clients (5,000 quotes plus 60,000 deliveries), over 200 times fewer. After that, more gateway processes behind the load balancer scale it out.

**Connections failed when many arrived at once.** The generators open connections in batches: 200 at a time in the combined run, 250 in the separate runs.

- Ramping to 1,500, and from 1,000 to 3,000, lost none.
- Adding 500 to a gateway already serving 1,500 lost 50.
- Three generators connecting 1,000 each at the same moment, 750 at a time between them, lost 1,099 of 3,000.

The web client retries with jittered backoff (`apps/web/src/lib/stream/live.ts`). But its first retry comes 375–625 ms after a drop, so after a gateway restart every browser would return within the same quarter-second: the pattern that failed here.

### Alerts

- **Setup:** 50,000 `PRICE_ABOVE` alerts at ₹1,050 across 500 stocks and 500 users. There were also 5,000 control alerts at ₹5,000, which should never fire.
- **The move:**
  - Quiet ticks at ₹1,000.
  - A spike to ₹1,100, held for 20 s. That is 80 more ticks on which a broken engine could fire an alert twice.
  - A dip, then a second spike.
  - Two engines ran, with the synthetic feed alongside.
- **Result:** exactly once:
  - 50,000 triggers, 50,000 notifications and 50,000 deliveries.
  - No alert triggered twice, and no control alert fired.
  - The two engines split the work 19,146 / 30,854 through the conditional `UPDATE`.
- **Timing:** the first alert fired 246 ms after the spike, but the last came 107 s after it: about 470 a second.
  - **Why:** each firing is its own four-statement transaction on a four-connection pool (`apps/alerts/src/main.ts`). Both engines attempt every alert, so 50,000 firings cost 100,000 claims.
  - **Fix:** claim each tick's due alerts together, with one `UPDATE … WHERE id = ANY(…) RETURNING` and then bulk inserts. That turns 50,000 transactions into a few per tick.

### Backtests

The burst was 40 single-stock SIPs and 10 rules tests over 50 stocks each, the most the lab accepts (`packages/contracts/src/strategy.ts`). All 50 were submitted at once, about three minutes into the 3,000-client stage.

| | p50 | p95 | max |
|---|---|---|---|
| Queue wait | 3.3 s | 7.1 s | 8.2 s |
| Run time | 0.1 s | 0.9 s | 1.0 s |

### Failover

With one ingestor, recovery is a restart. The ingestor was killed without warning and started again 2.4 s later:

- **Silence:** the stream was silent for **15.0 s**.
- **Why it took that long:** the stream resumed 12.4 s after the restart. On start, the simulator deletes and rebuilds a whole session of one-minute bars before it publishes: 375 minutes × 880 instruments, 330,000 rows.
- **Clients:** they stayed connected.
- **Bars:** there were no duplicates; the upsert on (instrument, minute) prevents them.

**To reach ~10 s:**
- A standby has to take over when the active ingestor's lock expires. The blueprint plans one, but it isn't built.
- The standby should also skip the backfill.

## What each service used

These figures cover the combined run: the average and the peak of 10-second samples.

| Service | Average | Peak | Memory, avg / peak |
|---|---|---|---|
| Gateway | 0.52 core | **1.03 core**, throughout the 3,000-client stage | 127 / 140 MB |
| API | 0.11 core | 0.63 core, in the bursts | 144 / 273 MB |
| Postgres (whole container) | 0.07 core | 0.60 core | 1.33 / 1.39 GB |
| Valkey | 0.02 core | 0.06 core | 36 / 69 MB |
| Ingestor (simulator) | 0.01 core | 0.02 core | 109 / 132 MB |
| Alert engines, each | 0.04 core | 0.07 core | 104 / 135 MB |
| Backtest worker | 0 | 0.44 core | 81 / 200 MB |

Only the gateway runs out. Everything else has room to spare at the design load.

## Still to do

- **The blueprint's rig:** repeat on a 4-vCPU VM, with the load coming from a second machine. That matters most for the cached p95 under bursts.
- **Gateway:**
  - Index subscriptions by instrument, then repeat the 3,000-client stage.
  - Restart it with 1,500 clients attached, to see how the reconnects land.
- **API:**
  - Try two processes, and serving cached JSON as stored.
  - Fix the watchlist race.
- **Ingestor:** add a standby, then repeat failover.
- **Alerts:** batch the claims.
