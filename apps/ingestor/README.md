# ingestor

Owns the market feed. Every source sits behind one `MarketDataProvider` interface:

- `BrokerProvider`: Angel One SmartAPI or Fyers, on your own account
- `ReplayProvider`: sessions you recorded, for development after hours
- `SimulatorProvider`: a synthetic market for the public demo and load tests

It normalises ticks, keeps quote state, closes 1-minute bars on exchange time, publishes changes to Valkey every 250 ms and writes bars to TimescaleDB. It also records the raw feed from day one, because intraday history cannot be downloaded free later.

Phases 0–2. See §6.2 and §7.1 of `docs/blueprint.html`.
