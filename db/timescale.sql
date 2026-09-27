-- =============================================================================
-- GreenCircuits · Timescale layer                                          v0.4
-- Apply after schema.sql on PostgreSQL + TimescaleDB 2.x (staging, prod).
-- Local dev and CI can skip this file: every table still works as a plain table.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- -----------------------------------------------------------------------------
-- 1-minute bars. Covering every live contract (≈5k equities + ≈80k derivatives)
-- is up to ~30M rows per trading day; compressed, that is roughly a tenth.
-- -----------------------------------------------------------------------------
SELECT create_hypertable('md.candle_1m', by_range('ts', INTERVAL '1 day'));
ALTER TABLE md.candle_1m SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'instrument_id',
  timescaledb.compress_orderby   = 'ts DESC'
);
SELECT add_compression_policy('md.candle_1m', compress_after => INTERVAL '3 days');
-- Tune to the data licence and product needs; dailies are kept forever.
SELECT add_retention_policy('md.candle_1m', drop_after => INTERVAL '5 years');

-- Daily bars from bhavcopies: authoritative, never rolled up from 1m.
SELECT create_hypertable('md.candle_1d', by_range('trade_date', INTERVAL '180 days'));
ALTER TABLE md.candle_1d SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'instrument_id',
  timescaledb.compress_orderby   = 'trade_date DESC'
);
SELECT add_compression_policy('md.candle_1d', compress_after => INTERVAL '60 days');

SELECT create_hypertable('md.fo_chain_summary_1m', by_range('ts', INTERVAL '7 days'));
ALTER TABLE md.fo_chain_summary_1m SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'underlying_id, expiry_date',
  timescaledb.compress_orderby   = 'ts DESC'
);
SELECT add_compression_policy('md.fo_chain_summary_1m', compress_after => INTERVAL '7 days');

SELECT create_hypertable('md.option_eod', by_range('trade_date', INTERVAL '90 days'));
ALTER TABLE md.option_eod SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'instrument_id',
  timescaledb.compress_orderby   = 'trade_date DESC'
);
SELECT add_compression_policy('md.option_eod', compress_after => INTERVAL '30 days');

SELECT create_hypertable('md.breadth_1m',          by_range('ts',         INTERVAL '30 days'));
SELECT create_hypertable('corp.valuation_daily',   by_range('trade_date', INTERVAL '365 days'));
SELECT create_hypertable('fi.price_daily',         by_range('trade_date', INTERVAL '365 days'));

-- -----------------------------------------------------------------------------
-- Intraday rollups. UTC-aligned 5m/15m buckets land on IST session boundaries:
-- NSE opens 09:15 IST = 03:45 UTC, MCX 09:00 IST = 03:30 UTC. Hourly and other
-- intraday intervals are re-bucketed from 15m at query time with a per-exchange
-- origin, because NSE hourly bars start at 09:15 and MCX bars at 09:00.
-- materialized_only = false serves the still-forming bar from raw 1m rows.
-- Backfills call refresh_continuous_aggregate() for their window explicitly.
-- -----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW md.candle_5m
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT instrument_id,
       time_bucket(INTERVAL '5 minutes', ts) AS bucket,
       first(open, ts)  AS open,
       max(high)        AS high,
       min(low)         AS low,
       last(close, ts)  AS close,
       sum(volume)      AS volume,
       sum(turnover)    AS turnover,
       last(oi, ts)     AS oi
FROM md.candle_1m
GROUP BY instrument_id, time_bucket(INTERVAL '5 minutes', ts)
WITH NO DATA;

SELECT add_continuous_aggregate_policy('md.candle_5m',
  start_offset      => INTERVAL '1 day',
  end_offset        => INTERVAL '5 minutes',
  schedule_interval => INTERVAL '1 minute');
ALTER MATERIALIZED VIEW md.candle_5m SET (
  timescaledb.compress = true,
  timescaledb.compress_segmentby = 'instrument_id',
  timescaledb.compress_orderby   = 'bucket DESC'
);
SELECT add_compression_policy('md.candle_5m', compress_after => INTERVAL '7 days');

CREATE MATERIALIZED VIEW md.candle_15m
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT instrument_id,
       time_bucket(INTERVAL '15 minutes', ts) AS bucket,
       first(open, ts)  AS open,
       max(high)        AS high,
       min(low)         AS low,
       last(close, ts)  AS close,
       sum(volume)      AS volume,
       sum(turnover)    AS turnover,
       last(oi, ts)     AS oi
FROM md.candle_1m
GROUP BY instrument_id, time_bucket(INTERVAL '15 minutes', ts)
WITH NO DATA;

SELECT add_continuous_aggregate_policy('md.candle_15m',
  start_offset      => INTERVAL '1 day',
  end_offset        => INTERVAL '15 minutes',
  schedule_interval => INTERVAL '5 minutes');
ALTER MATERIALIZED VIEW md.candle_15m SET (
  timescaledb.compress = true,
  timescaledb.compress_segmentby = 'instrument_id',
  timescaledb.compress_orderby   = 'bucket DESC'
);
SELECT add_compression_policy('md.candle_15m', compress_after => INTERVAL '7 days');
