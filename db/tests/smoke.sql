\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
BEGIN;

CREATE FUNCTION pg_temp.expect_error(stmt text, expected_state text, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN others THEN
    IF SQLSTATE = expected_state THEN
      RAISE NOTICE 'ok   %', label;
      RETURN;
    END IF;
    RAISE EXCEPTION 'FAIL %: got % (%) instead of %', label, SQLSTATE, SQLERRM, expected_state;
  END;
  RAISE EXCEPTION 'FAIL %: statement succeeded but should have been rejected', label;
END $$;

-- ---------------------------------------------------------------- security master
INSERT INTO ref.industry (id, level, name) OVERRIDING SYSTEM VALUE VALUES (1, 1, 'Energy');
INSERT INTO ref.issuer (id, name, issuer_type, industry_id) OVERRIDING SYSTEM VALUE VALUES
  (1, 'Reliance Industries Ltd', 'COMPANY', 1),
  (2, 'NSE Indices Ltd', 'OTHER', NULL),
  (3, 'Sample Tech Ltd', 'COMPANY', NULL);
INSERT INTO ref.security (id, issuer_id, security_type, isin, name, face_value) OVERRIDING SYSTEM VALUE VALUES
  (1, 1, 'EQUITY', 'INE002A01018', 'Reliance Industries equity', 10);
INSERT INTO ref.security_isin VALUES (1, 'INE002A01018', daterange('1995-11-29', NULL));

INSERT INTO ref.instrument (id, kind, exchange_code, segment, trading_symbol, series, display_name, security_id,
   product, underlying_id, expiry_date, strike, option_type, settlement_type, lot_size, tick_size) OVERRIDING SYSTEM VALUE VALUES
  (1, 'LISTING', 'NSE', 'CASH',     'RELIANCE',          'EQ', 'Reliance Industries', 1, NULL, NULL, NULL, NULL, NULL, NULL, 1, 0.10),
  (2, 'LISTING', 'BSE', 'CASH',     'RELIANCE',          'A',  'Reliance Industries', 1, NULL, NULL, NULL, NULL, NULL, NULL, 1, 0.05),
  (3, 'INDEX',   'NSE', 'INDEX',    'NIFTY 50',          NULL, 'Nifty 50', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, 0.01),
  (4, 'FUTURE',  'NSE', 'EQ_DERIV', 'NIFTY26OCTFUT',     NULL, 'NIFTY OCT FUT', NULL, 'NIFTY', 3, '2026-10-27', NULL, NULL, 'CASH', 75, 0.10),
  (5, 'OPTION',  'NSE', 'EQ_DERIV', 'NIFTY26OCT25000CE', NULL, 'NIFTY 25000 CE', NULL, 'NIFTY', 3, '2026-10-27', 25000, 'CE', 'CASH', 75, 0.05),
  (6, 'OPTION',  'NSE', 'EQ_DERIV', 'NIFTY26OCT25000PE', NULL, 'NIFTY 25000 PE', NULL, 'NIFTY', 3, '2026-10-27', 25000, 'PE', 'CASH', 75, 0.05);

-- explicit ids above; move identity sequences past them
DO $$ BEGIN PERFORM setval(pg_get_serial_sequence('ref.instrument', 'id'), 1000); END $$;
DO $$ BEGIN PERFORM setval(pg_get_serial_sequence('ref.issuer', 'id'), 1000); END $$;
DO $$ BEGIN PERFORM setval(pg_get_serial_sequence('ref.corporate_action', 'id'), 1000); END $$;
DO $$ BEGIN PERFORM setval(pg_get_serial_sequence('corp.financial_statement', 'id'), 1000); END $$;
DO $$ BEGIN PERFORM setval(pg_get_serial_sequence('ipo.issue', 'id'), 1000); END $$;

SELECT pg_temp.expect_error($q$
  INSERT INTO ref.instrument (kind, exchange_code, segment, trading_symbol, display_name, product, underlying_id, expiry_date, lot_size, tick_size)
  VALUES ('OPTION','NSE','EQ_DERIV','BAD1','bad','NIFTY',3,'2026-10-27',75,0.05)$q$,
  '23514', 'option without strike rejected');
SELECT pg_temp.expect_error($q$
  INSERT INTO ref.instrument (kind, exchange_code, segment, trading_symbol, display_name, product, underlying_id, expiry_date, strike, lot_size, tick_size)
  VALUES ('FUTURE','NSE','EQ_DERIV','BAD2','bad','NIFTY',3,'2026-11-24',25000,75,0.10)$q$,
  '23514', 'future carrying a strike rejected');
SELECT pg_temp.expect_error($q$
  INSERT INTO ref.instrument (kind, exchange_code, segment, trading_symbol, display_name, product, underlying_id, expiry_date, settlement_type, lot_size, tick_size)
  VALUES ('FUTURE','NSE','EQ_DERIV','NIFTY26OCTFUT-DUP','dup','NIFTY',3,'2026-10-27','CASH',75,0.10)$q$,
  '23505', 'one future per product per expiry');
SELECT pg_temp.expect_error($q$
  INSERT INTO ref.instrument (kind, exchange_code, segment, trading_symbol, display_name, lot_size, tick_size)
  VALUES ('LISTING','NSE','CASH','ORPHAN','orphan',1,0.05)$q$,
  '23514', 'listing without a security rejected');
SELECT pg_temp.expect_error($q$
  INSERT INTO ref.instrument (kind, exchange_code, segment, trading_symbol, display_name, security_id, lot_size, tick_size)
  VALUES ('LISTING','NSE','CASH','RELIANCE','dup',1,1,0.05)$q$,
  '23505', 'live symbol unique per venue');
INSERT INTO ref.instrument (kind, exchange_code, segment, trading_symbol, display_name, security_id, lot_size, tick_size, status)
  VALUES ('LISTING','NSE','CASH','OLDCO','Old Co',1,1,0.05,'DELISTED');
INSERT INTO ref.instrument (kind, exchange_code, segment, trading_symbol, display_name, security_id, lot_size, tick_size)
  VALUES ('LISTING','NSE','CASH','OLDCO','New Co reusing symbol',1,1,0.05);
DO $$ BEGIN RAISE NOTICE 'ok   delisted symbol can be reused'; END $$;

INSERT INTO ref.instrument_identifier (instrument_id, id_type, id_value, valid_during)
  VALUES (1, 'NSE_CM_TOKEN', '2885', daterange('2010-01-01', NULL));
SELECT pg_temp.expect_error($q$
  INSERT INTO ref.instrument_identifier (instrument_id, id_type, id_value, valid_during)
  VALUES (2, 'NSE_CM_TOKEN', '2885', daterange('2020-01-01', NULL))$q$,
  '23P01', 'a token maps to one instrument at a time');
INSERT INTO ref.instrument_identifier (instrument_id, id_type, id_value) VALUES (4, 'NSE_FO_TOKEN', '2885');
DO $$
DECLARE n int;
BEGIN
  SELECT instrument_id INTO n FROM ref.instrument_identifier
  WHERE id_type = 'NSE_CM_TOKEN' AND id_value = '2885' AND valid_during @> DATE '2026-09-25';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL token lookup returned %', n; END IF;
  SELECT count(*) INTO n FROM ref.instrument
  WHERE underlying_id = 3 AND expiry_date = '2026-10-27' AND kind = 'OPTION';
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL chain lookup returned %', n; END IF;
  RAISE NOTICE 'ok   token namespaces per segment; token and chain lookups';
END $$;

-- ---------------------------------------------------------------- calendar
INSERT INTO ref.trading_day VALUES
  ('NSE', 'CASH', '2026-11-08', true, 'Diwali: Muhurat session only'),
  ('NSE', 'CASH', '2026-09-28', true, NULL);
INSERT INTO ref.trading_session (exchange_code, segment, trade_date, session_group, kind, starts_at, ends_at) VALUES
  ('NSE', 'CASH', '2026-11-08', 'DEFAULT',       'MUHURAT',         '2026-11-08 18:00+05:30', '2026-11-08 19:00+05:30'),
  ('NSE', 'CASH', '2026-09-28', 'DEFAULT',       'NORMAL',          '2026-09-28 09:15+05:30', '2026-09-28 15:30+05:30'),
  ('NSE', 'CASH', '2026-09-28', 'FO_UNDERLYING', 'NORMAL',          '2026-09-28 09:15+05:30', '2026-09-28 15:15+05:30'),
  ('NSE', 'CASH', '2026-09-28', 'FO_UNDERLYING', 'CLOSING_AUCTION', '2026-09-28 15:15+05:30', '2026-09-28 15:35+05:30');
UPDATE ref.instrument SET session_group = 'FO_UNDERLYING' WHERE id = 1;
DO $$
DECLARE k_fo text; k_plain text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ref.trading_session
                 WHERE exchange_code = 'NSE' AND segment = 'CASH' AND session_group = 'DEFAULT'
                   AND timestamptz '2026-11-08 18:30+05:30' >= starts_at
                   AND timestamptz '2026-11-08 18:30+05:30' <  ends_at) THEN
    RAISE EXCEPTION 'FAIL muhurat session not found';
  END IF;
  -- 15:20 IST: an F&O stock is in the closing auction, a non-F&O stock still trades normally
  SELECT s.kind::text INTO k_fo
  FROM ref.instrument i
  JOIN ref.trading_session s ON s.exchange_code = i.exchange_code AND s.segment = i.segment
                            AND s.session_group = i.session_group
  WHERE i.id = 1 AND timestamptz '2026-09-28 15:20+05:30' >= s.starts_at
                 AND timestamptz '2026-09-28 15:20+05:30' <  s.ends_at;
  SELECT s.kind::text INTO k_plain
  FROM ref.trading_session s
  WHERE s.exchange_code = 'NSE' AND s.segment = 'CASH' AND s.session_group = 'DEFAULT'
    AND timestamptz '2026-09-28 15:20+05:30' >= s.starts_at
    AND timestamptz '2026-09-28 15:20+05:30' <  s.ends_at;
  IF k_fo IS DISTINCT FROM 'CLOSING_AUCTION' OR k_plain IS DISTINCT FROM 'NORMAL' THEN
    RAISE EXCEPTION 'FAIL session groups: F&O stock %, plain stock %', k_fo, k_plain;
  END IF;
  RAISE NOTICE 'ok   sessions per group: at 15:20 F&O stock in %, other stocks in %', k_fo, k_plain;
END $$;

-- ---------------------------------------------------------------- read-time price adjustment
INSERT INTO md.candle_1d (instrument_id, trade_date, open, high, low, close, volume) VALUES
  (1, '2024-10-25', 2690, 2720, 2680, 2700, 1000000),
  (1, '2024-10-28', 1340, 1360, 1335, 1350, 2100000);
INSERT INTO ref.corporate_action (id, security_id, action_type, ex_date, record_date, ratio_old, ratio_new, source, source_ref) OVERRIDING SYSTEM VALUE VALUES (1, 1, 'BONUS', '2024-10-28', '2024-10-28', 1, 2, 'NSE', 'CA-TEST-1');
INSERT INTO ref.price_adjustment (security_id, ex_date, kind, price_factor, corporate_action_id)
  VALUES (1, '2024-10-28', 'CAPITAL', 0.5, 1);
INSERT INTO ref.price_adjustment (security_id, ex_date, kind, price_factor)
  VALUES (1, '2025-08-14', 'DIVIDEND', 0.996);
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM md.daily_candles(1, '2024-10-25', '2024-10-25', 'NONE');
  IF r.close <> 2700 OR r.volume <> 1000000 THEN
    RAISE EXCEPTION 'FAIL unadjusted: close % volume %', r.close, r.volume; END IF;
  SELECT * INTO r FROM md.daily_candles(1, '2024-10-25', '2024-10-25', 'CAPITAL');
  IF abs(r.close - 1350) > 1e-6 OR abs(r.volume - 2000000) > 1e-3 THEN
    RAISE EXCEPTION 'FAIL capital adjustment: close % volume %', r.close, r.volume; END IF;
  SELECT * INTO r FROM md.daily_candles(1, '2024-10-25', '2024-10-25', 'TOTAL');
  IF abs(r.close - 1344.6) > 1e-6 OR abs(r.volume - 2000000) > 1e-3 THEN
    RAISE EXCEPTION 'FAIL total-return adjustment: close % volume %', r.close, r.volume; END IF;
  SELECT * INTO r FROM md.daily_candles(1, '2024-10-28', '2024-10-28', 'CAPITAL');
  IF abs(r.close - 1350) > 1e-6 THEN
    RAISE EXCEPTION 'FAIL ex-date bar must not be adjusted: close %', r.close; END IF;
  RAISE NOTICE 'ok   read-time adjustment: NONE 2700, CAPITAL 1350, TOTAL 1344.6';
END $$;

-- ---------------------------------------------------------------- fundamentals
INSERT INTO corp.line_item (code, statement, label, display_order) VALUES
  ('revenue_from_operations', 'PL', 'Revenue from operations', 10),
  ('pat', 'PL', 'Profit after tax', 90);
INSERT INTO corp.financial_statement (id, issuer_id, statement, consolidated, period_type, period_end, fiscal_year, fiscal_period, source) OVERRIDING SYSTEM VALUE VALUES (1, 1, 'PL', true, 'Q', '2026-06-30', 2027, 1, 'XBRL_NSE');
INSERT INTO corp.financial_value VALUES (1, 'revenue_from_operations', 2500000000000), (1, 'pat', 180000000000);
SELECT pg_temp.expect_error($q$
  INSERT INTO corp.financial_statement (issuer_id, statement, consolidated, period_type, period_end, fiscal_year, source)
  VALUES (1,'PL',true,'Q','2026-03-31',2026,'X')$q$,
  '23514', 'quarterly statement needs its quarter');
SELECT pg_temp.expect_error($q$
  INSERT INTO corp.financial_statement (issuer_id, statement, consolidated, period_type, period_end, fiscal_year, fiscal_period, source, version)
  VALUES (1,'PL',true,'Q','2026-06-30',2027,1,'XBRL_NSE',2)$q$,
  '23505', 'restatement must retire the previous latest version first');
UPDATE corp.financial_statement SET is_latest = false WHERE id = 1;
INSERT INTO corp.financial_statement (issuer_id, statement, consolidated, period_type, period_end, fiscal_year, fiscal_period, source, version)
  VALUES (1, 'PL', true, 'Q', '2026-06-30', 2027, 1, 'XBRL_NSE', 2);
DO $$ BEGIN RAISE NOTICE 'ok   restatement stored as version 2'; END $$;

-- ---------------------------------------------------------------- IPO
INSERT INTO ipo.issue (id, issuer_id, board, pricing, status, price_band_low, price_band_high, final_price, lot_size, open_date, close_date, listing_date) OVERRIDING SYSTEM VALUE VALUES (1, 3, 'MAINBOARD', 'BOOK_BUILT', 'LISTED', 380, 400, 400, 37, '2026-09-10', '2026-09-12', '2026-09-17');
INSERT INTO ipo.subscription VALUES (1, 'RETAIL', '2026-09-12 17:00+05:30', 1000000, 5230000, 5.23, 150000);
INSERT INTO ipo.listing VALUES (1, 'NSE', NULL, '2026-09-17', 480, 452);
SELECT pg_temp.expect_error($q$
  INSERT INTO ipo.issue (issuer_id, board, pricing, status, price_band_low, price_band_high)
  VALUES (3,'SME','FIXED_PRICE','UPCOMING',400,380)$q$,
  '23514', 'price band must be ordered');
SELECT pg_temp.expect_error($q$
  INSERT INTO ipo.issue (issuer_id, board, pricing, status, price_band_low)
  VALUES (3,'SME','FIXED_PRICE','UPCOMING',400)$q$,
  '23514', 'price band needs both ends');
SELECT pg_temp.expect_error($q$
  INSERT INTO corp.financial_statement (issuer_id, statement, consolidated, period_type, period_end, fiscal_year, fiscal_period, source)
  VALUES (1,'PL',true,'FY','2026-03-31',2026,4,'X')$q$,
  '23514', 'annual statement cannot carry a quarter');
DO $$
DECLARE g numeric; d numeric;
BEGIN
  SELECT listing_gain_pct, day1_close_gain_pct INTO g, d FROM ipo.listing_performance WHERE issue_id = 1;
  IF g <> 20.00 OR d <> 13.00 THEN RAISE EXCEPTION 'FAIL listing gains % / %', g, d; END IF;
  RAISE NOTICE 'ok   IPO listing gain % pct, day-1 close % pct', g, d;
END $$;

-- ---------------------------------------------------------------- screener
INSERT INTO scr.equity_snapshot (instrument_id, security_id, issuer_id, mcap_cr, pe_ttm, roce_pct, index_ids)
  VALUES (1, 1, 1, 1900000, 24.5, 9.8, ARRAY[3]::bigint[]);
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM scr.equity_snapshot
  WHERE mcap_cr > 100000 AND pe_ttm < 30 AND index_ids @> ARRAY[3]::bigint[];
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL screener query returned %', n; END IF;
  RAISE NOTICE 'ok   compiled screener query shape (mcap, pe, index membership)';
END $$;

-- ---------------------------------------------------------------- users, alerts
INSERT INTO app.users (id, email) VALUES ('00000000-0000-0000-0000-000000000001', 'Test@Example.com');
INSERT INTO app.users (phone_e164) VALUES ('+919876543210');
SELECT pg_temp.expect_error($q$INSERT INTO app.users (email) VALUES ('test@example.com')$q$,
  '23505', 'email unique regardless of case');
SELECT pg_temp.expect_error($q$INSERT INTO app.users (name) VALUES ('nobody')$q$,
  '23514', 'user needs an email or a phone');
SELECT pg_temp.expect_error($q$INSERT INTO app.users (phone_e164) VALUES ('98765 43210')$q$,
  '23514', 'phone must be E.164');

INSERT INTO app.watchlist (id, user_id, name) VALUES ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000001', 'Core');
INSERT INTO app.watchlist_item VALUES ('00000000-0000-0000-0000-00000000000a', 1, 0), ('00000000-0000-0000-0000-00000000000a', 5, 1);

INSERT INTO app.alert (user_id, kind, instrument_id, threshold)
  VALUES ('00000000-0000-0000-0000-000000000001', 'PRICE_ABOVE', 1, 1500);
SELECT pg_temp.expect_error($q$
  INSERT INTO app.alert (user_id, kind, instrument_id)
  VALUES ('00000000-0000-0000-0000-000000000001','PRICE_ABOVE',1)$q$,
  '23514', 'price alert needs a threshold');
SELECT pg_temp.expect_error($q$
  INSERT INTO app.alert (user_id, kind, instrument_id, threshold, channels)
  VALUES ('00000000-0000-0000-0000-000000000001','PRICE_ABOVE',1,1,'{PIGEON}')$q$,
  '23514', 'unknown delivery channel rejected');
SELECT pg_temp.expect_error($q$
  INSERT INTO app.alert (user_id, kind) VALUES ('00000000-0000-0000-0000-000000000001','SCREEN_MATCH')$q$,
  '23514', 'screen alert needs a saved screen');
DO $$
DECLARE first_try int; second_try int;
BEGIN
  WITH won AS (
    UPDATE app.alert SET status = 'TRIGGERED', trigger_count = trigger_count + 1, last_triggered_at = now()
    WHERE instrument_id = 1 AND status = 'ACTIVE' AND version = 1 RETURNING id)
  SELECT count(*) INTO first_try FROM won;
  WITH won AS (
    UPDATE app.alert SET status = 'TRIGGERED', trigger_count = trigger_count + 1, last_triggered_at = now()
    WHERE instrument_id = 1 AND status = 'ACTIVE' AND version = 1 RETURNING id)
  SELECT count(*) INTO second_try FROM won;
  IF first_try <> 1 OR second_try <> 0 THEN
    RAISE EXCEPTION 'FAIL trigger claim: % then %', first_try, second_try; END IF;
  RAISE NOTICE 'ok   an alert fires once even if two engines see the tick';
END $$;

-- ---------------------------------------------------------------- lab
INSERT INTO ref.charge_rate (exchange_code, product, component, side, basis, rate, valid_during) VALUES
  (NULL, 'OPT', 'STT', 'SELL', 'PREMIUM', 0.000625, daterange('2023-04-01', '2024-10-01')),
  (NULL, 'OPT', 'STT', 'SELL', 'PREMIUM', 0.001,    daterange('2024-10-01', NULL));
SELECT pg_temp.expect_error($q$
  INSERT INTO ref.charge_rate (exchange_code, product, component, side, basis, rate, valid_during)
  VALUES (NULL,'OPT','STT','SELL','PREMIUM',0.002,daterange('2025-01-01', NULL))$q$,
  '23P01', 'one rate per charge component at a time');
DO $$
DECLARE before_change numeric; after_change numeric;
BEGIN
  SELECT rate INTO before_change FROM ref.charge_rate
  WHERE product = 'OPT' AND component = 'STT' AND side = 'SELL' AND valid_during @> DATE '2024-06-14';
  SELECT rate INTO after_change FROM ref.charge_rate
  WHERE product = 'OPT' AND component = 'STT' AND side = 'SELL' AND valid_during @> DATE '2025-06-13';
  IF before_change <> 0.000625 OR after_change <> 0.001 THEN
    RAISE EXCEPTION 'FAIL dated charge lookup % / %', before_change, after_change; END IF;
  RAISE NOTICE 'ok   charges resolved by trade date';
END $$;

INSERT INTO lab.strategy (id, user_id, name, style)
  VALUES ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000001', 'RSI dip in uptrend', 'RULES');
INSERT INTO lab.strategy_version VALUES
  ('00000000-0000-0000-0000-0000000000b1', 1, '{"entry": "rsi(14) < 30 and close > sma(200)"}');
INSERT INTO lab.backtest_run (id, user_id, strategy_id, strategy_version, bar_interval, date_from, date_to,
                              initial_capital, data_version, engine_version, cache_key, priority, queued_at) VALUES
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 1, '1d',
   '2016-01-01', '2026-09-25', 1000000, 'd2026-09-25.a1', 'e0.1', 'k1', 0, '2026-09-27 10:00+05:30'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 1, '1d',
   '2021-01-01', '2026-09-25', 1000000, 'd2026-09-25.a1', 'e0.1', 'k2', 5, '2026-09-27 10:05+05:30');
UPDATE lab.backtest_run SET status = 'SUCCEEDED', started_at = now(), finished_at = now()
  WHERE id = '00000000-0000-0000-0000-0000000000c1';
DO $$
DECLARE hit uuid;
BEGIN
  SELECT id INTO hit FROM lab.backtest_run WHERE cache_key = 'k1' AND status = 'SUCCEEDED' LIMIT 1;
  IF hit IS DISTINCT FROM '00000000-0000-0000-0000-0000000000c1' THEN
    RAISE EXCEPTION 'FAIL cache lookup returned %', hit; END IF;
  RAISE NOTICE 'ok   an identical request finds the finished run by cache key';
END $$;
SELECT pg_temp.expect_error($q$
  INSERT INTO lab.backtest_run (user_id, strategy_id, strategy_version, bar_interval, date_from, date_to,
                                initial_capital, data_version, engine_version, cache_key)
  VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b1',2,'1d','2020-01-01','2021-01-01',100000,'d','e','k3')$q$,
  '23503', 'a run must point at an existing strategy version');
SELECT pg_temp.expect_error($q$
  INSERT INTO lab.backtest_run (user_id, strategy_id, strategy_version, bar_interval, date_from, date_to,
                                initial_capital, data_version, engine_version, cache_key)
  VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b1',1,'1d','2021-01-01','2020-01-01',100000,'d','e','k4')$q$,
  '23514', 'a run needs an ordered date range');

INSERT INTO lab.paper_account (id, user_id, name, starting_capital, cash)
  VALUES ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000001', 'Paper 1', 500000, 500000);
SELECT pg_temp.expect_error($q$
  INSERT INTO lab.paper_order (account_id, instrument_id, side, quantity, order_type)
  VALUES ('00000000-0000-0000-0000-0000000000d1', 1, 'B', 10, 'LIMIT')$q$,
  '23514', 'a limit order needs a limit price');
SELECT pg_temp.expect_error($q$
  INSERT INTO lab.paper_order (account_id, instrument_id, side, quantity, order_type, trigger_price)
  VALUES ('00000000-0000-0000-0000-0000000000d1', 1, 'S', 10, 'SL-M', NULL)$q$,
  '23514', 'a stop order needs a trigger price');
SELECT pg_temp.expect_error($q$
  INSERT INTO lab.paper_order (account_id, instrument_id, side, quantity, order_type, status)
  VALUES ('00000000-0000-0000-0000-0000000000d1', 1, 'B', 10, 'MARKET', 'FILLED')$q$,
  '23514', 'a filled order records its fill');
INSERT INTO lab.paper_order (account_id, instrument_id, side, quantity, order_type, status, filled_at, fill_price)
  VALUES ('00000000-0000-0000-0000-0000000000d1', 1, 'B', 10, 'MARKET', 'FILLED', now(), 1412.6);
DO $$ BEGIN RAISE NOTICE 'ok   paper market order filled'; END $$;

-- ---------------------------------------------------------------- ops
INSERT INTO ops.job_run (job_name, business_date, attempt, status) VALUES ('eod.bhavcopy.nse_cm', '2026-09-25', 1, 'SUCCEEDED');
SELECT pg_temp.expect_error($q$
  INSERT INTO ops.job_run (job_name, business_date, attempt, status)
  VALUES ('eod.bhavcopy.nse_cm','2026-09-25',2,'SUCCEEDED')$q$,
  '23505', 'one success per job per business day');

-- ---------------------------------------------------------------- summary
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_trigger WHERE tgname = 'touch_updated_at';
  RAISE NOTICE 'info updated_at triggers installed on % tables', n;
END $$;
\unset QUIET
SELECT table_schema AS schema, count(*) FILTER (WHERE table_type = 'BASE TABLE') AS tables,
       count(*) FILTER (WHERE table_type = 'VIEW') AS views
FROM information_schema.tables
WHERE table_schema IN ('ref', 'md', 'corp', 'fi', 'ipo', 'scr', 'app', 'lab', 'ops')
GROUP BY table_schema ORDER BY table_schema;

ROLLBACK;
