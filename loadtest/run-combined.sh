#!/usr/bin/env bash
# The combined run: the HTTP mix for 30 minutes with three bursts to 300 rps,
# the feed at 20,000 ticks a second, WebSocket clients at 1,000 and then 3,000,
# and the 50-run backtest burst in the middle of the 3,000-client stage, all at
# once, with every service's CPU and memory sampled. Point it at a test stack
# (see RESULTS.md for how it was set up); it refuses the development ports.
set -euo pipefail
cd "$(dirname "$0")/.."

API=${API:-http://127.0.0.1:4100}
WS=${WS:-ws://127.0.0.1:4101/v1/stream}
VALKEY=${VALKEY:-127.0.0.1:6390}
DB=${DB:-greencircuits_lt}
OUT=${OUT:-loadtest/results}
mkdir -p "$OUT"

if [[ "$API" == *":4000"* || "$WS" == *":4001"* || "$VALKEY" == *":6380" || "$DB" == "greencircuits" ]]; then
  echo "refusing: those are the development stack's ports or database" >&2
  exit 1
fi

stamp() { date -u +%H:%M:%S; }
echo "$(stamp) start"

node loadtest/monitor.mjs --ports api:4100,stream:4101,ingestor:4110,alerts-a:4111,alerts-b:4112,worker:4120 \
  --containers greencircuits-db-1,gc-lt-valkey --seconds 1860 --every 10 --out "$OUT/monitor.json" > "$OUT/monitor.log" 2>&1 &
node loadtest/ticks.mjs --valkey "$VALKEY" --rate 20000 --instruments 25000 --seconds 1860 > "$OUT/ticks.log" 2>&1 &
sleep 5

# 30 minutes: three 60-second bursts to 300 rps.
node loadtest/http-mix.mjs --base "$API" --plan 28x420,300x60,28x480,300x60,28x480,300x60,28x240 --out "$OUT/http-mix.json" > "$OUT/http-mix.log" 2>&1 &
http=$!
node loadtest/ws-fanout.mjs --url "$WS" --stages 1000x600,3000x600 --subs 100 --ramp 200 --settle 10 --out "$OUT/ws-fanout.json" > "$OUT/ws-fanout.log" 2>&1 &
ws=$!

# The backtest burst lands about three minutes into the 3,000-client stage.
( sleep 800; echo "$(stamp) backtest burst"; node loadtest/backtests.mjs --base "$API" --db "$DB" --runs 50 --out "$OUT/backtests.json" > "$OUT/backtests.log" 2>&1 ) &
bt=$!

wait $http $ws $bt
echo "$(stamp) http, ws and backtests done"
wait
echo "$(stamp) all done"
