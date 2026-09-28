# loadtest

The blueprint's five load scenarios (§10.2), as dependency-free scripts for Node 22 or later.

They run against a separate copy of the stack, with its own database, Valkey and ports. Several of them write test users, alerts and bars, so every script refuses the development database and ports.

| Scenario | Script and shape | Passes when |
|---|---|---|
| HTTP mix | `http-mix.mjs`: 28 rps for 30 min, with three 60 s bursts to 300 rps | p95 < 150 ms (< 30 ms cached), errors < 0.1% |
| WebSocket fan-out | `ws-fanout.mjs`, fed by `ticks.mjs`: 1,000 then 3,000 clients × 100 instruments | p95 tick lag < 1 s |
| Alerts | `alerts.mjs`: 50,000 active alerts crossed by one spike | every alert delivered exactly once |
| Failover | `failover.mjs`: kill the ingestor mid-run | stream resumes within ~10 s |
| Backtest burst | `backtests.mjs`: 50 runs queued during the above | p95 queue wait < 3 min, other targets hold |

`run-combined.sh` runs the HTTP mix, the fan-out and the backtest burst together for 30 minutes. Meanwhile `monitor.mjs` samples each service's CPU and memory.

The latest results are in [RESULTS.md](RESULTS.md), and their raw output is in `results/`.

## Runbook

These are the steps behind RESULTS.md, run from the repository root in Git Bash. They need the development stack's Postgres container (`pnpm infra:up`). `monitor.mjs` is Windows-only for now.

### 1. A test database and Valkey

```bash
docker compose exec -T db psql -U greencircuits -d postgres -c "CREATE DATABASE greencircuits_lt"
docker compose exec -T -e PGDATABASE=greencircuits_lt db sh migrate.sh
DATABASE_URL=postgres://greencircuits:greencircuits@localhost:55432/greencircuits_lt pnpm db:seed
docker run -d --name gc-lt-valkey -p 6390:6379 valkey/valkey:8-alpine valkey-server --save "" --appendonly no
```

The scripts read the test database's instruments from a file, and the services read their settings from another. Both live in `.cache/`, which git ignores:

```bash
mkdir -p loadtest/.cache
docker compose exec -T db psql -U greencircuits -d greencircuits_lt -tAc "select json_agg(json_build_object('id', id, 'kind', kind, 'symbol', trading_symbol)) from ref.instrument where status = 'ACTIVE' or status is null" > loadtest/.cache/universe.json
cat > loadtest/.cache/env.sh <<'EOF'
export DATABASE_URL=postgres://greencircuits:greencircuits@localhost:55432/greencircuits_lt
export VALKEY_URL=redis://localhost:6390
EOF
```

### 2. The services, on their own ports

Start each one in its own terminal, after `source loadtest/.cache/env.sh`:

```bash
NODE_ENV=production PORT=4100 RATE_LIMIT_PER_MINUTE=1000000 SESSION_SECRET=$(openssl rand -hex 32) node apps/api/node_modules/tsx/dist/cli.mjs apps/api/src/main.ts
PORT=4101 node apps/stream/node_modules/tsx/dist/cli.mjs apps/stream/src/main.ts
FEED_PROVIDER=simulator PORT=4110 node apps/ingestor/node_modules/tsx/dist/cli.mjs apps/ingestor/src/main.ts
PORT=4111 node apps/alerts/node_modules/tsx/dist/cli.mjs apps/alerts/src/main.ts
PORT=4112 node apps/alerts/node_modules/tsx/dist/cli.mjs apps/alerts/src/main.ts
cd pipelines && PORT=4120 uv run python -m greencircuits.lab.worker
```

The rate limit is raised because every request comes from one IP. At the default of 1,200 a minute, the API would throttle the test itself.

### 3. The scenarios

The combined run takes 31 minutes:

```bash
bash loadtest/run-combined.sh
```

The 1,500- and 2,000-client stages ran separately, with only the feed alongside:

```bash
node loadtest/ticks.mjs --valkey 127.0.0.1:6390 --seconds 420 &
node loadtest/ws-fanout.mjs --url ws://127.0.0.1:4101/v1/stream --stages 1500x180,2000x180 --ramp 250 --out loadtest/results/ws-diag/single-1500-2000.json
```

**Alerts:** stop the test ingestor first. Its simulated prices would cross the test's alerts before the spike does.

```bash
node loadtest/alerts.mjs --db greencircuits_lt --valkey 127.0.0.1:6390 --engines http://127.0.0.1:4111,http://127.0.0.1:4112 --out loadtest/results/alerts.json
```

**Failover:** the script starts, kills and restarts its own ingestor on port 4110, so keep the test ingestor stopped.

```bash
node loadtest/failover.mjs --ws ws://127.0.0.1:4101/v1/stream --db greencircuits_lt --valkey redis://localhost:6390 --kill-after 60 --restart-after 2 --out loadtest/results/failover.json
```

### 4. Clean up

Stop the services first; Postgres won't drop a database that still has connections.

```bash
docker compose exec -T db psql -U greencircuits -d postgres -c "DROP DATABASE greencircuits_lt"
docker rm -f gc-lt-valkey
```

## Not done yet

- **The blueprint's rig:** a 4-vCPU VM for the stack, with the load from a second machine. [`infra/`](../infra) is meant to create both for a run.
- **k6:** these scripts measure the same things with no dependencies. k6 would add its reporting and dashboards.
