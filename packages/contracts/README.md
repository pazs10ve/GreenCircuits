# contracts

What the services agree on:

- `src/index.ts`: Valkey keys and channels, and the quote wire format (`WireQuote` and the gateway's frames).
- `src/strategy.ts`: Zod schemas for strategy definitions and backtest requests. The API validates with them and stores the definition in `lab.strategy_version`, and the Python engine runs it.
- `proto/tick.proto`: a Protobuf version of the quote frame, kept for when bandwidth calls for it ([ADR 0004](../../docs/adr/0004-json-quote-frames.md)).
