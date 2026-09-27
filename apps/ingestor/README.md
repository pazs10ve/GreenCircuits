# ingestor

Owns the market feed. Today that feed is the simulator from `@greencircuits/market`, run over the instruments in the security master. It is seeded by the IST date, so the server's market and the browser's demo mode open in the same state.

What it does, and when:

- **Every 250 ms:** writes changed quotes to the `gc:quotes` hash and publishes them on `gc:ticks`.
- **Every 5 seconds:** upserts the 1-minute bars it has built from the ticks into `md.candle_1m`. TimescaleDB rolls them up into 5- and 15-minute continuous aggregates.
- **Every minute:** refreshes screener prices.
- **On start:** backfills the session's bars, so charts are never empty.

A broker adapter (Angel One SmartAPI or Fyers, on your own account) and a replay adapter are planned behind the same interface.

```bash
pnpm --filter @greencircuits/ingestor dev   # health on port 4010
```
