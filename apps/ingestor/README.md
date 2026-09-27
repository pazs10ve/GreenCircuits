# ingestor

Owns the market feed. It runs one of two providers, chosen by `FEED_PROVIDER`:

- **`simulator`:** the simulator from `@greencircuits/market`, run over the instruments in the security master. It is seeded by the IST date, so the server's market and the browser's demo mode open in the same state.
- **`yahoo`:** real prices from Yahoo Finance, for running locally ([ADR 0007](../../docs/adr/0007-real-data-for-local-use.md)). It needs the real-data loader to have run (`pnpm data:real`), which records each instrument's Yahoo symbol.

Left unset, it picks `yahoo` once real data is loaded, and `simulator` before.

What the simulator does, and when:

- **Every 250 ms:** writes changed quotes to the `gc:quotes` hash and publishes them on `gc:ticks`.
- **Every 5 seconds:** upserts the 1-minute bars it has built from the ticks into `md.candle_1m`. TimescaleDB rolls them up into 5- and 15-minute continuous aggregates.
- **Every minute:** refreshes screener prices.
- **On start:** backfills the session's bars, so charts are never empty.

What the Yahoo provider does:

- **Every minute while NSE trades, every 15 minutes otherwise:** fetches quotes and the day's one-minute closes, 20 symbols a request. Dollar commodities convert to rupees at the same poll's USD/INR.
- **Each poll:**
  - publishes the quotes like the simulator does;
  - upserts the one-minute closes and the day's bar in `md.candle_1d`;
  - updates screener prices.
- **On start:** deletes the simulator's recent one-minute bars, which would otherwise sit under the real ones.
- **When Yahoo refuses:** backs off, up to 15 minutes.

Both write `gc:market:session` with the provider and what its prices are (`SIMULATED`, `DELAYED` while NSE trades, `EOD` after). The gateway and the API pass that on to the site.

A broker adapter (Angel One SmartAPI or Fyers, on your own account) would be a third provider.

```bash
pnpm --filter @greencircuits/ingestor dev   # health on port 4010
```
