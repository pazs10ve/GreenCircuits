-- =============================================================================
-- GreenCircuits · core schema                                             v0.4
-- PostgreSQL 17. Plain Postgres runs local dev and CI; staging and prod apply
-- db/timescale.sql on top (hypertables, compression, rollups, retention).
--
-- Conventions
--   · bigint identity ids for reference and market data; UUIDs for user rows.
--   · timestamptz everywhere (stored UTC, shown IST). Trading and business
--     dates are `date` in IST. Indian FY runs Apr–Mar: FY2026 = Apr 2025–Mar 2026.
--   · Market-data prices are double precision, rounded to tick size at ingest.
--     Money we account for (payments, portfolios, bond cash flows, reported
--     financials) is numeric.
--   · Exchange tokens, symbols and ISINs change over time. They live in
--     validity-ranged identifier tables and are never used as keys.
--   · One database, one schema per domain, and no foreign keys from the
--     high-volume market-data tables, so market data can move to its own
--     cluster later without touching app tables.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- fuzzy instrument / company search
CREATE EXTENSION IF NOT EXISTS citext;      -- case-insensitive email
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- exclusion constraints over validity ranges

CREATE SCHEMA ref;   -- venues, calendars, security master, corporate actions
CREATE SCHEMA md;    -- market data: bars, derivatives analytics, EOD reports
CREATE SCHEMA corp;  -- fundamentals, shareholding, filings, events, news
CREATE SCHEMA fi;    -- fixed income: bonds, cash flows, prices, yield curves
CREATE SCHEMA ipo;   -- primary market
CREATE SCHEMA scr;   -- screener metric catalog and snapshots
CREATE SCHEMA app;   -- users, billing, watchlists, alerts, portfolios
CREATE SCHEMA lab;   -- strategies, backtests, paper trading, plans
CREATE SCHEMA ops;   -- pipeline ledger, data quality, audit

CREATE FUNCTION ops.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;


-- =============================================================================
-- ref · venues and calendars
-- =============================================================================

CREATE TYPE ref.segment AS ENUM (
  'CASH',             -- equities, ETFs, REITs/InvITs, SGBs, listed debt
  'EQ_DERIV',         -- index and stock futures & options
  'CURRENCY_DERIV',   -- USDINR, EURINR ...
  'COMMODITY_DERIV',  -- MCX, NCDEX, and the NSE/BSE commodity segments
  'DEBT',             -- G-sec and corporate bond venues (NDS-OM, RFQ)
  'INDEX'             -- computed indices; quoted, not traded
);

CREATE TYPE ref.session_kind AS ENUM (
  'PRE_OPEN', 'NORMAL', 'CLOSING_AUCTION', 'POST_CLOSE', 'BLOCK_DEAL', 'MUHURAT', 'SPECIAL'
);

CREATE TABLE ref.exchange (
  code      text PRIMARY KEY,
  name      text NOT NULL,
  timezone  text NOT NULL DEFAULT 'Asia/Kolkata'
);

INSERT INTO ref.exchange (code, name) VALUES
  ('NSE',   'National Stock Exchange of India'),
  ('BSE',   'BSE'),
  ('MCX',   'Multi Commodity Exchange of India'),
  ('NCDEX', 'National Commodity & Derivatives Exchange'),
  ('NSEIX', 'NSE International Exchange, GIFT City'),
  ('NDSOM', 'RBI NDS-OM (government securities)');

-- One row per venue/segment/date for the next 12+ months, generated from the
-- exchange holiday circulars. Holidays are rows with is_trading = false.
CREATE TABLE ref.trading_day (
  exchange_code  text        NOT NULL REFERENCES ref.exchange(code),
  segment        ref.segment NOT NULL,
  trade_date     date        NOT NULL,
  is_trading     boolean     NOT NULL,
  note           text,       -- 'Diwali (Laxmi Pujan): Muhurat session only'
  PRIMARY KEY (exchange_code, segment, trade_date)
);

-- Explicit sessions make every calendar quirk data, not code: Muhurat trading,
-- MCX evening-only days, special live sessions from the exchange DR site.
-- Sessions differ by instrument group within a segment, so each group gets its
-- own rows: since Aug 2026 NSE stocks with F&O stop continuous trading at 15:15
-- for a closing auction; MCX agri contracts close at 17:00; cross-currency pairs
-- trade until 19:30. An instrument's group is ref.instrument.session_group.
-- "Is it open now?" = a row for (venue, segment, date, group) whose
-- [starts_at, ends_at) contains now().
CREATE TABLE ref.trading_session (
  exchange_code  text             NOT NULL,
  segment        ref.segment      NOT NULL,
  trade_date     date             NOT NULL,
  session_group  text             NOT NULL DEFAULT 'DEFAULT',  -- DEFAULT, FO_UNDERLYING, AGRI, CROSS_CURRENCY ...
  kind           ref.session_kind NOT NULL,
  starts_at      timestamptz      NOT NULL,
  ends_at        timestamptz      NOT NULL,
  PRIMARY KEY (exchange_code, segment, trade_date, session_group, kind),
  FOREIGN KEY (exchange_code, segment, trade_date)
    REFERENCES ref.trading_day ON DELETE CASCADE,
  CHECK (ends_at > starts_at)
);


-- =============================================================================
-- ref · security master
--   issuer (who) → security (what was issued, has an ISIN)
--                → instrument (what is quoted on a venue: listing, index,
--                               future, option, spot reference)
-- =============================================================================

CREATE TYPE ref.security_type AS ENUM (
  'EQUITY', 'PREFERENCE', 'ETF', 'REIT', 'INVIT',
  'GSEC', 'SDL', 'TBILL', 'SGB', 'CORPORATE_BOND', 'NCD',
  'COMMERCIAL_PAPER', 'CERT_OF_DEPOSIT', 'RIGHTS_ENTITLEMENT'
);

CREATE TYPE ref.instrument_kind AS ENUM (
  'LISTING',  -- a security quoted on a venue: share, ETF, listed bond ...
  'INDEX',
  'FUTURE',
  'OPTION',
  'SPOT'      -- reference price for a commodity or currency pair; underlying only
);

CREATE TYPE ref.option_type       AS ENUM ('CE', 'PE');
CREATE TYPE ref.settlement_type   AS ENUM ('CASH', 'PHYSICAL', 'INTO_FUTURES');  -- MCX options devolve into futures
CREATE TYPE ref.instrument_status AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'DELISTED');

-- NSE's four-level classification: macro sector > sector > industry > basic industry.
CREATE TABLE ref.industry (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scheme     text     NOT NULL DEFAULT 'NSE',
  level      smallint NOT NULL CHECK (level BETWEEN 1 AND 4),
  name       text     NOT NULL,
  parent_id  integer  REFERENCES ref.industry(id),
  UNIQUE NULLS NOT DISTINCT (scheme, parent_id, name),
  CHECK ((level = 1) = (parent_id IS NULL))
);

CREATE TABLE ref.issuer (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name             text NOT NULL,
  short_name       text,
  issuer_type      text NOT NULL CHECK (issuer_type IN (
                     'COMPANY', 'BANK', 'NBFC', 'INSURER', 'PSU', 'CENTRAL_GOVT',
                     'STATE_GOVT', 'MUNICIPAL', 'TRUST', 'OTHER')),
  cin              text UNIQUE,    -- MCA Corporate Identification Number
  lei              text UNIQUE,
  industry_id      integer REFERENCES ref.industry(id),
  -- which Schedule III layout the financial statements follow
  fs_format        text NOT NULL DEFAULT 'GENERAL'
                     CHECK (fs_format IN ('GENERAL', 'BANK', 'NBFC', 'INSURANCE')),
  incorporated_on  date,
  website          text,
  description      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX issuer_name_trgm ON ref.issuer USING gin (name gin_trgm_ops);

CREATE TABLE ref.security (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  issuer_id           bigint NOT NULL REFERENCES ref.issuer(id),
  security_type       ref.security_type NOT NULL,
  isin                text,           -- current ISIN; history in ref.security_isin
  name                text NOT NULL,
  face_value          numeric(18,4),
  shares_outstanding  bigint,         -- equity: latest count, for market cap
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX security_isin_uq ON ref.security (isin) WHERE isin IS NOT NULL;
CREATE INDEX security_issuer_idx ON ref.security (issuer_id);

-- ISINs change on some corporate actions (e.g. face-value splits) while the
-- price history must stay continuous, so the security id is the stable key.
CREATE TABLE ref.security_isin (
  security_id   bigint    NOT NULL REFERENCES ref.security(id),
  isin          text      NOT NULL CHECK (isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),
  valid_during  daterange NOT NULL,
  PRIMARY KEY (security_id, valid_during),
  CONSTRAINT isin_one_security_at_a_time
    EXCLUDE USING gist (isin WITH =, valid_during WITH &&),
  CONSTRAINT security_one_isin_at_a_time
    EXCLUDE USING gist (security_id WITH =, valid_during WITH &&)
);

CREATE TABLE ref.instrument (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind              ref.instrument_kind NOT NULL,
  exchange_code     text NOT NULL REFERENCES ref.exchange(code),
  segment           ref.segment NOT NULL,
  trading_symbol    text NOT NULL,    -- RELIANCE · NIFTY 50 · NIFTY25OCT25000CE · GOLD25DECFUT
  series            text,             -- cash segment: EQ, BE, BZ, SM, ST ...
  display_name      text NOT NULL,
  security_id       bigint REFERENCES ref.security(id),     -- LISTING
  product           text,             -- derivatives contract family: NIFTY, RELIANCE, GOLDM, USDINR
  underlying_id     bigint REFERENCES ref.instrument(id),   -- FUTURE / OPTION
  expiry_date       date,
  strike            numeric(18,4),
  option_type       ref.option_type,
  settlement_type   ref.settlement_type,
  lot_size          integer NOT NULL DEFAULT 1 CHECK (lot_size > 0),
  tick_size         numeric(12,6) NOT NULL,   -- NSE revises equity ticks by price band monthly: refreshed by master sync
  session_group     text NOT NULL DEFAULT 'DEFAULT',          -- which ref.trading_session rows apply
  quote_unit        text,             -- MCX quotation basis: '10 GRMS', '1 KGS', '1 BBL', '1 MMBTU'
  price_multiplier  numeric(14,4) NOT NULL DEFAULT 1,       -- contract value = price × lot_size × multiplier
  status            ref.instrument_status NOT NULL DEFAULT 'ACTIVE',
  listed_on         date,
  delisted_on       date,
  search_rank       real NOT NULL DEFAULT 0,  -- liquidity/popularity score; orders typeahead results
  attrs             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT listing_needs_security
    CHECK (kind <> 'LISTING' OR security_id IS NOT NULL),
  CONSTRAINT deriv_needs_contract_terms
    CHECK (kind NOT IN ('FUTURE', 'OPTION')
           OR (underlying_id IS NOT NULL AND expiry_date IS NOT NULL AND product IS NOT NULL)),
  CONSTRAINT option_terms_only_on_options
    CHECK (CASE WHEN kind = 'OPTION' THEN strike IS NOT NULL AND option_type IS NOT NULL
                ELSE strike IS NULL AND option_type IS NULL END)
);

-- Live symbols are unique per venue and segment; dead instruments' symbols can be reused.
CREATE UNIQUE INDEX instrument_live_symbol_uq ON ref.instrument (exchange_code, segment, trading_symbol)
  WHERE status IN ('ACTIVE', 'SUSPENDED');
-- A derivative contract's natural key (futures have NULL strike/option_type).
CREATE UNIQUE INDEX instrument_contract_uq ON ref.instrument
  (exchange_code, segment, product, kind, expiry_date, strike, option_type) NULLS NOT DISTINCT
  WHERE kind IN ('FUTURE', 'OPTION');
-- Option chains: all contracts of an underlying for an expiry, ordered by strike.
CREATE INDEX instrument_chain_idx ON ref.instrument (underlying_id, expiry_date, strike)
  WHERE underlying_id IS NOT NULL;
CREATE INDEX instrument_security_idx ON ref.instrument (security_id) WHERE security_id IS NOT NULL;
-- Typeahead. Options are excluded: "nifty 25000 ce oct" is parsed and served from the chain index.
CREATE INDEX instrument_symbol_trgm ON ref.instrument USING gin (trading_symbol gin_trgm_ops)
  WHERE kind <> 'OPTION';
CREATE INDEX instrument_name_trgm ON ref.instrument USING gin (display_name gin_trgm_ops)
  WHERE kind <> 'OPTION';

-- Venue and vendor codes over time. id_type is namespaced per venue segment because
-- token spaces overlap across segments: NSE_CM_TOKEN, NSE_FO_TOKEN, BSE_CM_CODE,
-- MCX_TOKEN, SYMBOL_HISTORY, VENDOR_<NAME>.
CREATE TABLE ref.instrument_identifier (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  instrument_id  bigint    NOT NULL REFERENCES ref.instrument(id),
  id_type        text      NOT NULL,
  id_value       text      NOT NULL,
  valid_during   daterange NOT NULL DEFAULT daterange(CURRENT_DATE, NULL),
  CONSTRAINT code_one_instrument_at_a_time
    EXCLUDE USING gist (id_type WITH =, id_value WITH =, valid_during WITH &&),
  CONSTRAINT instrument_one_code_per_type
    EXCLUDE USING gist (instrument_id WITH =, id_type WITH =, valid_during WITH &&)
);

CREATE TABLE ref.index_constituent (
  index_id      bigint    NOT NULL REFERENCES ref.instrument(id),
  member_id     bigint    NOT NULL REFERENCES ref.instrument(id),
  valid_during  daterange NOT NULL,
  weight_pct    numeric(8,4),     -- latest published weight
  PRIMARY KEY (index_id, member_id, valid_during),
  CONSTRAINT constituent_no_overlap
    EXCLUDE USING gist (index_id WITH =, member_id WITH =, valid_during WITH &&)
);
CREATE INDEX index_constituent_member_idx ON ref.index_constituent (member_id);


-- =============================================================================
-- ref · corporate actions and price adjustment
-- =============================================================================

CREATE TYPE ref.corp_action_type AS ENUM (
  'DIVIDEND', 'SPLIT', 'BONUS', 'RIGHTS', 'BUYBACK', 'MERGER', 'DEMERGER',
  'FACE_VALUE_CHANGE', 'NAME_CHANGE', 'SYMBOL_CHANGE', 'SUSPENSION', 'DELISTING',
  'INTEREST_PAYMENT', 'REDEMPTION', 'OTHER'
);

CREATE TABLE ref.corporate_action (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  security_id     bigint NOT NULL REFERENCES ref.security(id),
  action_type     ref.corp_action_type NOT NULL,
  announced_on    date,
  ex_date         date,
  record_date     date,
  payment_date    date,
  -- shares held before → after: bonus 1:1 is 1 → 2; split ₹10 → ₹2 is 1 → 5
  ratio_old       numeric(18,6),
  ratio_new       numeric(18,6),
  cash_per_share  numeric(18,4),   -- dividend, buyback or rights price
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  source          text NOT NULL,   -- NSE, BSE, VENDOR_<NAME>
  source_ref      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_ref)
);
CREATE INDEX corporate_action_security_idx ON ref.corporate_action (security_id, ex_date DESC);

-- History is never rewritten. Each action adds a factor; reads multiply the
-- factors of every ex-date after the bar (see md.daily_candles).
CREATE TABLE ref.price_adjustment (
  security_id          bigint NOT NULL REFERENCES ref.security(id),
  ex_date              date   NOT NULL,
  kind                 text   NOT NULL CHECK (kind IN ('CAPITAL', 'DIVIDEND')),  -- CAPITAL: split/bonus/rights
  price_factor         double precision NOT NULL CHECK (price_factor > 0),        -- applies to prices before ex_date
  corporate_action_id  bigint REFERENCES ref.corporate_action(id),
  PRIMARY KEY (security_id, ex_date, kind)
);

-- Transaction charges as dated rates (STT on F&O changed in Oct 2024, for one).
-- Backtests and paper fills read the rate in force on each trade date.
CREATE TABLE ref.charge_rate (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  exchange_code  text REFERENCES ref.exchange(code),   -- NULL = every venue
  product        text NOT NULL CHECK (product IN (
                   'EQ_DELIVERY', 'EQ_INTRADAY', 'FUT', 'OPT',
                   'CURRENCY_FUT', 'CURRENCY_OPT', 'COMMODITY_FUT', 'COMMODITY_OPT')),
  component      text NOT NULL CHECK (component IN (
                   'BROKERAGE', 'STT', 'CTT', 'EXCHANGE_TXN', 'SEBI_FEE', 'STAMP_DUTY', 'GST', 'IPFT')),
  side           text NOT NULL CHECK (side IN ('BUY', 'SELL', 'BOTH')),
  basis          text NOT NULL CHECK (basis IN ('TURNOVER', 'PREMIUM', 'PER_ORDER', 'ON_CHARGES')),
  rate           numeric(12,8) NOT NULL,   -- fraction of the basis (0.001 = 0.1%), or rupees for PER_ORDER
  cap_inr        numeric(12,2),            -- e.g. a flat brokerage cap per order
  valid_during   daterange NOT NULL,
  CONSTRAINT charge_rate_no_overlap EXCLUDE USING gist (
    (coalesce(exchange_code, '*')) WITH =, product WITH =, component WITH =, side WITH =, valid_during WITH &&)
);


-- =============================================================================
-- md · market data
-- Bars carry no foreign keys: this is the hottest insert path and the ingestor
-- only writes ids it resolved from the security master.
-- =============================================================================

CREATE TABLE md.candle_1m (
  instrument_id  bigint           NOT NULL,
  ts             timestamptz      NOT NULL,   -- bar open time
  open           double precision NOT NULL,
  high           double precision NOT NULL,
  low            double precision NOT NULL,
  close          double precision NOT NULL,
  volume         bigint           NOT NULL DEFAULT 0,
  turnover       double precision,            -- ₹ traded in the bar, for VWAP
  oi             bigint,                      -- derivatives: open interest at bar close
  PRIMARY KEY (instrument_id, ts)
);

-- Daily bars come from exchange bhavcopies, never from rolling up 1m bars: the
-- official close follows exchange methodology (a closing auction for F&O stocks
-- since Aug 2026) and differs from the last trade.
CREATE TABLE md.candle_1d (
  instrument_id  bigint           NOT NULL,
  trade_date     date             NOT NULL,
  open           double precision NOT NULL,
  high           double precision NOT NULL,
  low            double precision NOT NULL,
  close          double precision NOT NULL,   -- official close
  last_price     double precision,            -- last traded price
  prev_close     double precision,
  settle_price   double precision,            -- derivatives: daily settlement price
  volume         bigint           NOT NULL DEFAULT 0,
  turnover       double precision,
  trades         integer,
  oi             bigint,
  oi_change      bigint,
  delivery_qty   bigint,                      -- cash segment: deliverable quantity
  delivery_pct   real,
  source         text             NOT NULL DEFAULT 'BHAVCOPY',
  PRIMARY KEY (instrument_id, trade_date)
);

-- One row per underlying + expiry per minute; drives PCR/IV/OI history charts.
CREATE TABLE md.fo_chain_summary_1m (
  underlying_id     bigint           NOT NULL,
  expiry_date       date             NOT NULL,
  ts                timestamptz      NOT NULL,
  underlying_price  double precision,
  forward_price     double precision,   -- same-expiry future or synthetic forward; the IV input
  atm_strike        double precision,
  atm_iv            real,
  skew_25d          real,               -- 25-delta put IV minus call IV
  pcr_oi            real,
  pcr_volume        real,
  max_pain          double precision,
  ce_oi             bigint,
  pe_oi             bigint,
  ce_volume         bigint,
  pe_volume         bigint,
  PRIMARY KEY (underlying_id, expiry_date, ts)
);

-- Per-contract IV and greeks at settlement, for IV rank and contract history.
CREATE TABLE md.option_eod (
  instrument_id     bigint NOT NULL,
  trade_date        date   NOT NULL,
  underlying_close  double precision,
  iv                real,
  delta             real,
  gamma             real,
  theta             real,
  vega              real,
  PRIMARY KEY (instrument_id, trade_date)
);

-- Advance/decline across an index universe (NIFTY 500, NIFTY TOTAL MARKET ...).
CREATE TABLE md.breadth_1m (
  index_id   bigint      NOT NULL,
  ts         timestamptz NOT NULL,
  advances   integer     NOT NULL,
  declines   integer     NOT NULL,
  unchanged  integer     NOT NULL,
  PRIMARY KEY (index_id, ts)
);

-- Daily regulatory state per instrument, published before the open.
CREATE TABLE md.instrument_day_status (
  instrument_id  bigint  NOT NULL REFERENCES ref.instrument(id),
  trade_date     date    NOT NULL,
  lower_circuit  double precision,
  upper_circuit  double precision,
  band_pct       real,                           -- 2/5/10/20; NULL where no fixed band applies
  in_fo_ban      boolean NOT NULL DEFAULT false,
  fut_eq_oi      bigint,                         -- futures-equivalent (delta-adjusted) OI, the basis for MWPL since 2025
  mwpl_used_pct  real,                           -- market-wide position limit utilisation; ban above 95%
  surveillance   text[]  NOT NULL DEFAULT '{}',  -- e.g. {ASM:LT-1, GSM:2}
  PRIMARY KEY (instrument_id, trade_date)
);

-- FPI / DII flows. Values in ₹ crore, the unit the exchanges publish in.
CREATE TABLE md.institutional_flow (
  trade_date      date NOT NULL,
  participant     text NOT NULL CHECK (participant IN ('FPI', 'DII')),
  segment         text NOT NULL CHECK (segment IN ('CASH', 'INDEX_FUT', 'INDEX_OPT', 'STOCK_FUT', 'STOCK_OPT')),
  buy_value       numeric(18,2) NOT NULL,
  sell_value      numeric(18,2) NOT NULL,
  net_value       numeric(18,2) GENERATED ALWAYS AS (buy_value - sell_value) STORED,
  is_provisional  boolean NOT NULL DEFAULT true,
  PRIMARY KEY (trade_date, participant, segment)
);

-- Participant-wise open interest (client / DII / FII / pro), from the daily NSE report.
CREATE TABLE md.participant_oi (
  trade_date       date   NOT NULL,
  client_type      text   NOT NULL CHECK (client_type IN ('CLIENT', 'DII', 'FII', 'PRO')),
  contract_group   text   NOT NULL CHECK (contract_group IN (
                     'INDEX_FUT', 'STOCK_FUT', 'INDEX_CALL', 'INDEX_PUT', 'STOCK_CALL', 'STOCK_PUT')),
  long_contracts   bigint NOT NULL,
  short_contracts  bigint NOT NULL,
  PRIMARY KEY (trade_date, client_type, contract_group)
);

CREATE TABLE md.large_deal (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trade_date     date    NOT NULL,
  instrument_id  bigint  NOT NULL REFERENCES ref.instrument(id),
  deal_type      text    NOT NULL CHECK (deal_type IN ('BULK', 'BLOCK')),
  client_name    text    NOT NULL,
  side           char(1) NOT NULL CHECK (side IN ('B', 'S')),
  quantity       bigint  NOT NULL,
  price          numeric(18,4) NOT NULL,
  UNIQUE (trade_date, instrument_id, deal_type, client_name, side, quantity, price)
);
CREATE INDEX large_deal_instrument_idx ON md.large_deal (instrument_id, trade_date DESC);
-- "What did this investor buy?" lookups by name.
CREATE INDEX large_deal_client_trgm ON md.large_deal USING gin (client_name gin_trgm_ops);

-- Daily bars with split/bonus (CAPITAL) or total-return (TOTAL) adjustment
-- applied at read time. p_adjust: NONE | CAPITAL | TOTAL.
CREATE FUNCTION md.daily_candles(
  p_instrument_id bigint,
  p_from          date,
  p_to            date,
  p_adjust        text DEFAULT 'CAPITAL'
) RETURNS TABLE (
  trade_date date,
  open       double precision,
  high       double precision,
  low        double precision,
  close      double precision,
  volume     double precision
)
LANGUAGE sql STABLE AS $$
  SELECT c.trade_date,
         c.open  * f.price_factor,
         c.high  * f.price_factor,
         c.low   * f.price_factor,
         c.close * f.price_factor,
         c.volume / f.capital_factor
  FROM md.candle_1d c
  JOIN ref.instrument i ON i.id = c.instrument_id
  CROSS JOIN LATERAL (
    SELECT coalesce(exp(sum(ln(a.price_factor))), 1) AS price_factor,
           coalesce(exp(sum(ln(a.price_factor)) FILTER (WHERE a.kind = 'CAPITAL')), 1) AS capital_factor
    FROM ref.price_adjustment a
    WHERE a.security_id = i.security_id
      AND a.ex_date > c.trade_date
      AND p_adjust <> 'NONE'
      AND (p_adjust = 'TOTAL' OR a.kind = 'CAPITAL')
  ) f
  WHERE c.instrument_id = p_instrument_id
    AND c.trade_date BETWEEN p_from AND p_to
  ORDER BY c.trade_date
$$;


-- =============================================================================
-- corp · fundamentals, ownership, filings, events, news
-- =============================================================================

CREATE TYPE corp.statement_type AS ENUM ('PL', 'BS', 'CF');
CREATE TYPE corp.period_type    AS ENUM ('Q', 'H', 'FY');   -- TTM is derived, never stored

-- Canonical line items. Filings are mapped onto these codes so a bank, an NBFC
-- and a manufacturer can share one storage model while keeping their own layouts.
CREATE TABLE corp.line_item (
  code           text PRIMARY KEY,         -- revenue_from_operations, pat, total_assets ...
  statement      corp.statement_type NOT NULL,
  fs_format      text NOT NULL DEFAULT 'ALL'
                   CHECK (fs_format IN ('ALL', 'GENERAL', 'BANK', 'NBFC', 'INSURANCE')),
  label          text NOT NULL,
  parent_code    text REFERENCES corp.line_item(code),
  unit           text NOT NULL DEFAULT 'INR' CHECK (unit IN ('INR', 'INR_PER_SHARE', 'COUNT', 'PCT')),
  display_order  integer NOT NULL
);

CREATE TABLE corp.financial_statement (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  issuer_id      bigint NOT NULL REFERENCES ref.issuer(id),
  statement      corp.statement_type NOT NULL,
  consolidated   boolean NOT NULL,
  period_type    corp.period_type NOT NULL,
  period_end     date NOT NULL,
  fiscal_year    smallint NOT NULL,         -- FY2026 = Apr 2025 – Mar 2026
  fiscal_period  smallint,                  -- quarter 1–4 (Q1 = Apr–Jun) or half 1–2; NULL for FY
  audited        boolean,
  filed_at       timestamptz,
  source         text NOT NULL,             -- XBRL_NSE, XBRL_BSE, VENDOR_<NAME>, RHP
  source_ref     text,
  version        smallint NOT NULL DEFAULT 1,   -- restatements add a version
  is_latest      boolean  NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer_id, statement, consolidated, period_type, period_end, version),
  -- CASE + coalesce: a bare OR over a NULL fiscal_period would pass the check
  CHECK (CASE period_type
           WHEN 'FY' THEN fiscal_period IS NULL
           WHEN 'Q'  THEN coalesce(fiscal_period BETWEEN 1 AND 4, false)
           WHEN 'H'  THEN coalesce(fiscal_period BETWEEN 1 AND 2, false)
         END)
);
CREATE UNIQUE INDEX financial_statement_latest_uq ON corp.financial_statement
  (issuer_id, statement, consolidated, period_type, period_end) WHERE is_latest;

CREATE TABLE corp.financial_value (
  statement_id  bigint NOT NULL REFERENCES corp.financial_statement(id) ON DELETE CASCADE,
  item_code     text   NOT NULL REFERENCES corp.line_item(code),
  value         numeric(24,4) NOT NULL,   -- rupees, normalised from lakh/crore/million as filed
  PRIMARY KEY (statement_id, item_code)
);

-- Per-period derived metrics computed by the pipelines (ROE, ROCE, margins, growth).
CREATE TABLE corp.metric_value (
  issuer_id     bigint NOT NULL REFERENCES ref.issuer(id),
  metric_code   text   NOT NULL,          -- matches scr.metric.code where screenable
  consolidated  boolean NOT NULL,
  period_type   corp.period_type NOT NULL,
  period_end    date   NOT NULL,
  value         double precision,
  PRIMARY KEY (issuer_id, metric_code, consolidated, period_type, period_end)
);

-- Daily valuation history for P/E bands and "is it cheap vs its own history" charts.
CREATE TABLE corp.valuation_daily (
  security_id    bigint NOT NULL,
  trade_date     date   NOT NULL,
  mcap_cr        double precision,
  pe_ttm         double precision,
  pb             double precision,
  ev_ebitda      double precision,
  div_yield_pct  double precision,
  PRIMARY KEY (security_id, trade_date)
);

-- Quarterly shareholding pattern, simplified from the SEBI format.
CREATE TABLE corp.shareholding (
  security_id   bigint NOT NULL REFERENCES ref.security(id),
  period_end    date   NOT NULL,
  category      text   NOT NULL CHECK (category IN (
                  'PROMOTER', 'FPI', 'DII_MF', 'DII_INSURANCE', 'DII_OTHER',
                  'GOVERNMENT', 'RETAIL', 'OTHER_PUBLIC')),
  holding_pct   numeric(7,4) NOT NULL,
  shares        bigint,
  pledged_pct   numeric(7,4),     -- share of this category's holding that is pledged
  holders       integer,
  PRIMARY KEY (security_id, period_end, category)
);

-- Insider (PIT) and substantial-acquisition (SAST) disclosures.
CREATE TABLE corp.insider_trade (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  security_id        bigint NOT NULL REFERENCES ref.security(id),
  person_name        text   NOT NULL,
  person_category    text   NOT NULL,   -- PROMOTER, PROMOTER_GROUP, DIRECTOR, KMP, DESIGNATED_PERSON, OTHER
  txn_type           text   NOT NULL CHECK (txn_type IN (
                       'BUY', 'SELL', 'PLEDGE', 'PLEDGE_REVOKE', 'PLEDGE_INVOKE', 'ESOP', 'OTHER')),
  mode               text,              -- MARKET, OFF_MARKET, PREFERENTIAL, INTER_SE ...
  quantity           bigint NOT NULL,
  value_inr          numeric(20,2),
  txn_from           date,
  txn_to             date,
  disclosed_on       date   NOT NULL,
  holding_after_pct  numeric(7,4),
  source             text   NOT NULL,
  source_ref         text   NOT NULL,
  UNIQUE (source, source_ref)
);
CREATE INDEX insider_trade_security_idx ON corp.insider_trade (security_id, disclosed_on DESC);

-- Exchange announcements. The same filing often lands on NSE and BSE; dedupe_key joins them.
CREATE TABLE corp.announcement (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  issuer_id       bigint REFERENCES ref.issuer(id),        -- NULL until matched
  exchange_code   text   NOT NULL REFERENCES ref.exchange(code),
  published_at    timestamptz NOT NULL,
  category        text   NOT NULL,   -- RESULTS, BOARD_MEETING, DIVIDEND, AGM, CREDIT_RATING, ORDER_WIN, M_AND_A ...
  subject         text   NOT NULL,
  body            text,
  attachment_url  text,              -- exchange URL
  attachment_key  text,              -- archived copy in object storage
  summary         text,              -- generated summary, added later
  dedupe_key      text,
  source_ref      text   NOT NULL,
  search          tsvector GENERATED ALWAYS AS
                    (to_tsvector('english', subject || ' ' || coalesce(body, ''))) STORED,
  UNIQUE (exchange_code, source_ref)
);
CREATE INDEX announcement_issuer_idx ON corp.announcement (issuer_id, published_at DESC);
CREATE INDEX announcement_recent_idx ON corp.announcement (published_at DESC);
CREATE INDEX announcement_search_idx ON corp.announcement USING gin (search);

-- Results dates, board meetings, record dates: feeds the calendar and event alerts.
CREATE TABLE corp.event (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  issuer_id   bigint NOT NULL REFERENCES ref.issuer(id),
  event_type  text   NOT NULL CHECK (event_type IN (
                'RESULTS', 'BOARD_MEETING', 'AGM', 'EGM', 'DIVIDEND_RECORD',
                'CONCALL', 'ANALYST_MEET', 'OTHER')),
  event_date  date   NOT NULL,
  starts_at   timestamptz,
  purpose     text,
  source_ref  text,
  UNIQUE (issuer_id, event_type, event_date)
);
CREATE INDEX event_date_idx ON corp.event (event_date);

CREATE TABLE corp.credit_rating (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  issuer_id    bigint NOT NULL REFERENCES ref.issuer(id),
  security_id  bigint REFERENCES ref.security(id),   -- set when the rating is for one instrument (NCD, CP)
  agency       text   NOT NULL,     -- CRISIL, ICRA, CARE, INDIA_RATINGS, ACUITE, INFOMERICS
  scale        text   NOT NULL CHECK (scale IN ('LONG_TERM', 'SHORT_TERM')),
  rating       text   NOT NULL,     -- AAA, AA+, A1+ ...
  outlook      text,                -- STABLE, POSITIVE, NEGATIVE, WATCH_*
  action       text,                -- ASSIGNED, REAFFIRMED, UPGRADED, DOWNGRADED, WITHDRAWN
  rated_on     date   NOT NULL,
  source_url   text
);
CREATE INDEX credit_rating_issuer_idx ON corp.credit_rating (issuer_id, rated_on DESC);
CREATE INDEX credit_rating_security_idx ON corp.credit_rating (security_id, rated_on DESC)
  WHERE security_id IS NOT NULL;

CREATE TABLE corp.news_article (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source        text NOT NULL,
  url           text NOT NULL UNIQUE,
  title         text NOT NULL,
  snippet       text,               -- licensed excerpt only; link out for the story
  published_at  timestamptz NOT NULL,
  lang          text NOT NULL DEFAULT 'en'
);
CREATE INDEX news_recent_idx ON corp.news_article (published_at DESC);

CREATE TABLE corp.news_mention (
  article_id  bigint NOT NULL REFERENCES corp.news_article(id) ON DELETE CASCADE,
  issuer_id   bigint NOT NULL REFERENCES ref.issuer(id),
  relevance   real   NOT NULL DEFAULT 1,
  PRIMARY KEY (article_id, issuer_id)
);
CREATE INDEX news_mention_issuer_idx ON corp.news_mention (issuer_id);


-- =============================================================================
-- fi · fixed income (the bond type is ref.security.security_type)
-- =============================================================================

CREATE TABLE fi.bond (
  security_id         bigint PRIMARY KEY REFERENCES ref.security(id),
  issue_date          date,
  maturity_date       date,             -- NULL = perpetual (AT1)
  face_value          numeric(18,4) NOT NULL,
  coupon_type         text NOT NULL CHECK (coupon_type IN ('FIXED', 'FLOATING', 'ZERO', 'STEP', 'INFLATION_INDEXED')),
  coupon_rate_pct     numeric(9,6),     -- NULL for zero-coupon or not-yet-reset floaters
  coupon_frequency    smallint NOT NULL CHECK (coupon_frequency IN (0, 1, 2, 4, 12)),  -- per year; 0 = at maturity
  day_count           text NOT NULL CHECK (day_count IN ('30/360', 'ACT/365', 'ACT/ACT', 'ACT/364')),
  floating_benchmark  text,
  spread_bps          numeric(8,2),
  seniority           text CHECK (seniority IN ('SENIOR', 'SUBORDINATED', 'AT1', 'TIER2')),
  is_secured          boolean,
  is_callable         boolean NOT NULL DEFAULT false,
  is_puttable         boolean NOT NULL DEFAULT false,
  is_tax_free         boolean NOT NULL DEFAULT false,
  issue_size_inr      numeric(20,2),
  min_investment_inr  numeric(14,2),
  CHECK (maturity_date IS NULL OR issue_date IS NULL OR maturity_date > issue_date)
);

CREATE TABLE fi.cashflow (
  security_id  bigint NOT NULL REFERENCES fi.bond(security_id) ON DELETE CASCADE,
  pay_date     date   NOT NULL,
  kind         text   NOT NULL CHECK (kind IN ('COUPON', 'PRINCIPAL', 'CALL', 'PUT')),
  amount       numeric(18,6) NOT NULL,   -- per unit of face value
  record_date  date,
  PRIMARY KEY (security_id, pay_date, kind)
);

CREATE TABLE fi.price_daily (
  security_id    bigint NOT NULL REFERENCES ref.security(id),
  trade_date     date   NOT NULL,
  venue          text   NOT NULL,         -- NDSOM, NSE, BSE, RFQ, VALUATION
  clean_price    numeric(12,6),
  ytm_pct        numeric(9,6),
  traded_fv_inr  numeric(20,2),           -- face value traded
  trades         integer,
  PRIMARY KEY (security_id, trade_date, venue)
);

CREATE TABLE fi.yield_curve_point (
  curve        text NOT NULL,             -- GSEC_PAR, GSEC_ZERO, SDL, TBILL, CORP_AAA, CORP_AA
  as_of        date NOT NULL,
  tenor_years  numeric(6,3) NOT NULL,
  yield_pct    numeric(9,6) NOT NULL,
  PRIMARY KEY (curve, as_of, tenor_years)
);


-- =============================================================================
-- ipo · primary market
-- =============================================================================

CREATE TYPE ipo.status AS ENUM (
  'DRHP_FILED', 'UPCOMING', 'OPEN', 'CLOSED', 'ALLOTTED', 'LISTED', 'WITHDRAWN'
);

CREATE TABLE ipo.issue (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  issuer_id              bigint NOT NULL REFERENCES ref.issuer(id),
  security_id            bigint REFERENCES ref.security(id),   -- known once the ISIN is allotted
  board                  text NOT NULL CHECK (board IN ('MAINBOARD', 'SME')),
  issue_kind             text NOT NULL DEFAULT 'IPO' CHECK (issue_kind IN ('IPO', 'FPO', 'REIT', 'INVIT')),
  pricing                text NOT NULL CHECK (pricing IN ('BOOK_BUILT', 'FIXED_PRICE')),
  exchanges              text[] NOT NULL DEFAULT '{NSE,BSE}',
  status                 ipo.status NOT NULL,
  price_band_low         numeric(12,2),
  price_band_high        numeric(12,2),
  final_price            numeric(12,2),
  face_value             numeric(12,2),
  lot_size               integer,
  fresh_issue_inr        numeric(20,2),
  ofs_inr                numeric(20,2),      -- offer for sale
  total_issue_inr        numeric(20,2),
  employee_discount_inr  numeric(10,2),
  anchor_date            date,
  open_date              date,
  close_date             date,
  allotment_date         date,
  refund_date            date,
  demat_credit_date      date,
  listing_date           date,
  registrar              text,
  lead_managers          text[] NOT NULL DEFAULT '{}',
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CHECK ((price_band_low IS NULL) = (price_band_high IS NULL)
         AND (price_band_low IS NULL OR price_band_high >= price_band_low)),
  CHECK (open_date IS NULL OR close_date IS NULL OR close_date >= open_date)
);
CREATE INDEX ipo_issue_status_idx ON ipo.issue (status, open_date);

CREATE TABLE ipo.reservation (
  issue_id      bigint NOT NULL REFERENCES ipo.issue(id) ON DELETE CASCADE,
  category      text   NOT NULL,   -- ANCHOR, QIB, NII, BNII, SNII, RETAIL, EMPLOYEE, SHAREHOLDER, POLICYHOLDER
  shares        bigint,
  pct_of_issue  numeric(6,3),
  PRIMARY KEY (issue_id, category)
);

-- Snapshots polled every few minutes while bidding is open.
CREATE TABLE ipo.subscription (
  issue_id        bigint      NOT NULL REFERENCES ipo.issue(id) ON DELETE CASCADE,
  category        text        NOT NULL,   -- reservation categories plus TOTAL
  captured_at     timestamptz NOT NULL,
  shares_offered  bigint,
  shares_bid      bigint,
  times           numeric(10,2),          -- subscription multiple (×)
  applications    bigint,
  PRIMARY KEY (issue_id, category, captured_at)
);

CREATE TABLE ipo.document (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  issue_id     bigint NOT NULL REFERENCES ipo.issue(id) ON DELETE CASCADE,
  doc_type     text   NOT NULL CHECK (doc_type IN (
                 'DRHP', 'RHP', 'PROSPECTUS', 'ADDENDUM', 'ANCHOR_ALLOCATION', 'BASIS_OF_ALLOTMENT')),
  filed_on     date,
  url          text   NOT NULL,
  storage_key  text                 -- archived copy in object storage
);

CREATE TABLE ipo.listing (
  issue_id       bigint NOT NULL REFERENCES ipo.issue(id),
  exchange_code  text   NOT NULL REFERENCES ref.exchange(code),
  instrument_id  bigint REFERENCES ref.instrument(id),
  listing_date   date   NOT NULL,
  open_price     numeric(12,2),
  close_price    numeric(12,2),
  PRIMARY KEY (issue_id, exchange_code)
);

CREATE VIEW ipo.listing_performance AS
SELECT l.issue_id,
       l.exchange_code,
       l.listing_date,
       i.final_price,
       l.open_price,
       l.close_price,
       round((l.open_price  / i.final_price - 1) * 100, 2) AS listing_gain_pct,
       round((l.close_price / i.final_price - 1) * 100, 2) AS day1_close_gain_pct
FROM ipo.listing l
JOIN ipo.issue i ON i.id = l.issue_id
WHERE i.final_price > 0;


-- =============================================================================
-- scr · screener
-- The DSL compiler only emits columns listed in scr.metric, always with bound
-- parameters. Users never send SQL.
-- =============================================================================

CREATE TABLE scr.metric (
  code         text PRIMARY KEY,     -- identifier used in the screener language
  label        text NOT NULL,
  category     text NOT NULL CHECK (category IN (
                 'PRICE', 'VALUATION', 'PROFITABILITY', 'GROWTH', 'BALANCE_SHEET',
                 'OWNERSHIP', 'TECHNICAL', 'DERIVATIVES')),
  unit         text NOT NULL CHECK (unit IN ('INR', 'INR_CR', 'PCT', 'RATIO', 'X', 'COUNT', 'DAYS')),
  column_name  text NOT NULL,        -- column in scr.equity_snapshot
  refresh      text NOT NULL CHECK (refresh IN ('INTRADAY', 'EOD', 'QUARTERLY')),
  is_premium   boolean NOT NULL DEFAULT false,
  description  text
);

-- One row per listed equity (primary listing). Rebuilt after EOD; price-derived
-- columns refreshed every minute in market hours. ~5k rows, so filters stay cheap.
CREATE TABLE scr.equity_snapshot (
  instrument_id          bigint PRIMARY KEY REFERENCES ref.instrument(id),
  security_id            bigint NOT NULL REFERENCES ref.security(id),
  issuer_id              bigint NOT NULL REFERENCES ref.issuer(id),
  industry_id            integer REFERENCES ref.industry(id),
  mcap_bucket            text CHECK (mcap_bucket IN ('LARGE', 'MID', 'SMALL', 'MICRO')),  -- AMFI list, half-yearly
  index_ids              bigint[] NOT NULL DEFAULT '{}',   -- memberships, for "in NIFTY 50"
  is_fo                  boolean NOT NULL DEFAULT false,
  -- price and liquidity (intraday)
  price                  double precision,
  change_pct             double precision,
  return_1w_pct          double precision,
  return_1m_pct          double precision,
  return_3m_pct          double precision,
  return_1y_pct          double precision,
  cagr_3y_pct            double precision,
  cagr_5y_pct            double precision,
  high_52w               double precision,
  low_52w                double precision,
  from_52w_high_pct      double precision,
  avg_volume_20d         double precision,
  avg_turnover_20d_cr    double precision,
  delivery_pct_20d       double precision,
  -- valuation
  mcap_cr                double precision,
  ev_cr                  double precision,
  pe_ttm                 double precision,
  pb                     double precision,
  ps_ttm                 double precision,
  ev_ebitda              double precision,
  peg                    double precision,
  div_yield_pct          double precision,
  -- profitability
  roe_pct                double precision,
  roce_pct               double precision,
  opm_pct                double precision,
  npm_pct                double precision,
  -- growth
  sales_growth_yoy_pct   double precision,   -- latest quarter vs the same quarter last year
  profit_growth_yoy_pct  double precision,
  sales_cagr_3y_pct      double precision,
  profit_cagr_3y_pct     double precision,
  eps_ttm                double precision,
  -- balance sheet
  debt_to_equity         double precision,
  interest_coverage      double precision,
  current_ratio          double precision,
  -- ownership
  promoter_pct           double precision,
  promoter_pledge_pct    double precision,
  fpi_pct                double precision,
  dii_pct                double precision,
  promoter_change_qoq    double precision,
  -- technicals (EOD)
  rsi_14                 double precision,
  sma_50                 double precision,
  sma_200                double precision,
  ema_20                 double precision,
  macd_hist              double precision,
  atr_14                 double precision,
  beta_1y                double precision,
  volatility_1y_pct      double precision,
  price_updated_at       timestamptz,
  eod_updated_at         timestamptz
);
CREATE INDEX equity_snapshot_index_ids_idx ON scr.equity_snapshot USING gin (index_ids);
CREATE INDEX equity_snapshot_industry_idx  ON scr.equity_snapshot (industry_id);
CREATE INDEX equity_snapshot_mcap_idx      ON scr.equity_snapshot (mcap_cr DESC);

-- One row per underlying + expiry (futures view), refreshed every minute.
CREATE TABLE scr.fo_snapshot (
  underlying_id  bigint NOT NULL REFERENCES ref.instrument(id),
  expiry_date    date   NOT NULL,
  future_id      bigint REFERENCES ref.instrument(id),
  future_price   double precision,
  change_pct     double precision,
  oi             bigint,
  oi_change_pct  double precision,
  fut_eq_oi      bigint,               -- delta-adjusted OI across futures and options
  -- price↑ OI↑ long buildup · price↓ OI↑ short buildup · price↑ OI↓ short covering · price↓ OI↓ long unwinding
  buildup        text CHECK (buildup IN ('LONG_BUILDUP', 'SHORT_BUILDUP', 'SHORT_COVERING', 'LONG_UNWINDING')),
  basis_pct      double precision,     -- (future − spot) / spot
  rollover_pct   double precision,
  atm_iv         double precision,
  iv_rank_1y     double precision,
  pcr_oi         double precision,
  max_pain       double precision,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (underlying_id, expiry_date)
);


-- =============================================================================
-- app · users and product
-- Sessions, OAuth accounts and OTP verifications belong to the auth library
-- (Better Auth), whose CLI generates them against app.users.
-- =============================================================================

CREATE TABLE app.users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- the app supplies UUIDv7
  email           citext UNIQUE,
  email_verified  boolean NOT NULL DEFAULT false,
  phone_e164      text UNIQUE CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  phone_verified  boolean NOT NULL DEFAULT false,
  name            text,
  image_url       text,
  locale          text NOT NULL DEFAULT 'en-IN',
  status          text NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETION_REQUESTED')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz,
  CHECK (email IS NOT NULL OR phone_e164 IS NOT NULL)
);

-- DPDP Act: an append-only record of each consent given or withdrawn, per purpose.
CREATE TABLE app.consent (
  user_id         uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  purpose         text NOT NULL,     -- TERMS, PRIVACY, MARKETING_EMAIL, WHATSAPP, ANALYTICS
  notice_version  text NOT NULL,
  granted         boolean NOT NULL,
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  ip              inet,
  PRIMARY KEY (user_id, purpose, recorded_at)
);

CREATE TABLE app.plan (
  code            text PRIMARY KEY,           -- FREE, PRO, PRO_ANNUAL
  name            text NOT NULL,
  price_inr       numeric(10,2) NOT NULL DEFAULT 0,   -- before 18% GST
  billing_period  text NOT NULL CHECK (billing_period IN ('NONE', 'MONTH', 'YEAR')),
  -- {"watchlists":5,"alerts":20,"stream_symbols":50,"realtime":false,"screener_export":false}
  limits          jsonb NOT NULL,
  is_public       boolean NOT NULL DEFAULT true
);

CREATE TABLE app.subscription (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid NOT NULL REFERENCES app.users(id),
  plan_code                 text NOT NULL REFERENCES app.plan(code),
  status                    text NOT NULL CHECK (status IN ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED')),
  provider                  text NOT NULL DEFAULT 'RAZORPAY',
  provider_subscription_id  text UNIQUE,
  current_period_start      timestamptz,
  current_period_end        timestamptz,
  cancel_at_period_end      boolean NOT NULL DEFAULT false,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX subscription_one_live_per_user ON app.subscription (user_id)
  WHERE status IN ('TRIALING', 'ACTIVE', 'PAST_DUE');

CREATE TABLE app.payment (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES app.users(id),
  subscription_id      uuid REFERENCES app.subscription(id),
  provider_payment_id  text NOT NULL UNIQUE,
  amount_inr           numeric(12,2) NOT NULL,      -- including GST
  gst_inr              numeric(12,2) NOT NULL DEFAULT 0,
  method               text,                        -- UPI, CARD, NETBANKING, WALLET
  status               text NOT NULL CHECK (status IN ('CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED')),
  invoice_number       text UNIQUE,
  paid_at              timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Webhooks are recorded before they are acted on, so a redelivery is a no-op.
CREATE TABLE app.webhook_event (
  provider      text  NOT NULL,
  event_id      text  NOT NULL,
  event_type    text  NOT NULL,
  payload       jsonb NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz,
  PRIMARY KEY (provider, event_id)
);

CREATE TABLE app.watchlist (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  position    smallint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE app.watchlist_item (
  watchlist_id   uuid    NOT NULL REFERENCES app.watchlist(id) ON DELETE CASCADE,
  instrument_id  bigint  NOT NULL REFERENCES ref.instrument(id),
  position       integer NOT NULL,
  added_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (watchlist_id, instrument_id)
);

CREATE TABLE app.saved_screen (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  query_text   text NOT NULL,     -- as typed: "roce_pct > 20 AND pe_ttm < 25"
  query_ast    jsonb NOT NULL,    -- validated AST; the compiler reads only this
  columns      text[] NOT NULL DEFAULT '{}',
  sort         jsonb,
  is_public    boolean NOT NULL DEFAULT false,
  last_run_at  timestamptz,
  last_result  bigint[],          -- instrument ids, to detect new matches for SCREEN_MATCH alerts
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE app.alert_kind AS ENUM (
  'PRICE_ABOVE', 'PRICE_BELOW',              -- every tick
  'CHANGE_PCT_ABOVE', 'CHANGE_PCT_BELOW',    -- turned into price levels from prev close each morning
  'VOLUME_ABOVE', 'OI_CHANGE_PCT_ABOVE',
  'IV_ABOVE', 'IV_BELOW',
  'NEW_52W_HIGH', 'NEW_52W_LOW',
  'INDICATOR',                               -- on candle close; the rule lives in params
  'SCREEN_MATCH',                            -- new rows in a saved screen, after EOD
  'CORPORATE_EVENT', 'IPO_EVENT'
);

CREATE TABLE app.alert (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  kind               app.alert_kind NOT NULL,
  instrument_id      bigint REFERENCES ref.instrument(id),
  saved_screen_id    uuid   REFERENCES app.saved_screen(id) ON DELETE CASCADE,
  ipo_issue_id       bigint REFERENCES ipo.issue(id),
  threshold          double precision,
  params             jsonb  NOT NULL DEFAULT '{}'::jsonb,  -- {"indicator":"RSI","period":14,"interval":"1d","op":"<","value":30}
  channels           text[] NOT NULL DEFAULT '{IN_APP,PUSH}'
                       CHECK (channels <@ ARRAY['IN_APP', 'PUSH', 'EMAIL', 'WHATSAPP', 'SMS']),
  repeat_mode        text NOT NULL DEFAULT 'ONCE' CHECK (repeat_mode IN ('ONCE', 'REARM_AFTER_COOLDOWN')),
  cooldown           interval NOT NULL DEFAULT '15 minutes',
  status             text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'TRIGGERED', 'EXPIRED')),
  note               text,
  expires_at         timestamptz,
  last_triggered_at  timestamptz,
  trigger_count      integer NOT NULL DEFAULT 0,
  version            integer NOT NULL DEFAULT 1,   -- bumped on edit; the engine drops stale versions
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (kind IN ('SCREEN_MATCH', 'IPO_EVENT') OR instrument_id IS NOT NULL),
  CHECK (kind <> 'SCREEN_MATCH' OR saved_screen_id IS NOT NULL),
  CHECK (kind <> 'IPO_EVENT' OR ipo_issue_id IS NOT NULL),
  CHECK (kind NOT IN ('PRICE_ABOVE', 'PRICE_BELOW', 'CHANGE_PCT_ABOVE', 'CHANGE_PCT_BELOW',
                      'VOLUME_ABOVE', 'OI_CHANGE_PCT_ABOVE', 'IV_ABOVE', 'IV_BELOW')
         OR threshold IS NOT NULL)
);
-- The alert engine loads this at start-up and on change notifications.
CREATE INDEX alert_live_by_instrument ON app.alert (instrument_id) WHERE status = 'ACTIVE';
CREATE INDEX alert_user_idx ON app.alert (user_id, status);

CREATE TABLE app.alert_trigger (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  alert_id        uuid    NOT NULL REFERENCES app.alert(id) ON DELETE CASCADE,
  alert_version   integer NOT NULL,
  triggered_at    timestamptz NOT NULL DEFAULT now(),
  observed_value  double precision,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (alert_id, alert_version, triggered_at)
);

CREATE TABLE app.notification (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  kind        text NOT NULL,       -- ALERT, IPO, RESULTS, SYSTEM, BILLING
  title       text NOT NULL,
  body        text NOT NULL,
  deeplink    text,
  dedupe_key  text UNIQUE,         -- e.g. alert_trigger:<id>; makes delivery retries idempotent
  created_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz
);
CREATE INDEX notification_inbox_idx ON app.notification (user_id, created_at DESC);

CREATE TABLE app.notification_delivery (
  notification_id      uuid NOT NULL REFERENCES app.notification(id) ON DELETE CASCADE,
  channel              text NOT NULL CHECK (channel IN ('IN_APP', 'PUSH', 'EMAIL', 'WHATSAPP', 'SMS')),
  status               text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
  attempts             smallint NOT NULL DEFAULT 0,
  provider_message_id  text,
  last_error           text,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, channel)
);

CREATE TABLE app.push_subscription (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  platform      text NOT NULL CHECK (platform IN ('WEB', 'ANDROID', 'IOS')),
  endpoint      text NOT NULL UNIQUE,   -- Web Push endpoint or FCM/APNs token
  keys          jsonb,                  -- Web Push p256dh / auth
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz
);

CREATE TABLE app.portfolio (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

-- Holdings, realised P&L (FIFO) and XIRR are computed from transactions, never stored.
CREATE TABLE app.portfolio_txn (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id   uuid   NOT NULL REFERENCES app.portfolio(id) ON DELETE CASCADE,
  instrument_id  bigint NOT NULL REFERENCES ref.instrument(id),
  txn_type       text   NOT NULL CHECK (txn_type IN (
                   'BUY', 'SELL', 'BONUS', 'SPLIT', 'DIVIDEND', 'TRANSFER_IN', 'TRANSFER_OUT')),
  trade_date     date   NOT NULL,
  quantity       numeric(20,4) NOT NULL,
  price          numeric(18,4) NOT NULL DEFAULT 0,
  charges        numeric(14,2) NOT NULL DEFAULT 0,   -- brokerage, STT, stamp duty, GST ...
  source         text NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'CSV', 'CAS', 'BROKER')),
  external_ref   text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portfolio_txn_portfolio_idx ON app.portfolio_txn (portfolio_id, trade_date);
-- Re-importing the same CAS statement or CSV does not duplicate rows.
CREATE UNIQUE INDEX portfolio_txn_import_uq ON app.portfolio_txn (portfolio_id, source, external_ref)
  WHERE external_ref IS NOT NULL;

-- Fixed positions saved from the option payoff builder. Rule-driven strategies live in lab.strategy.
CREATE TABLE app.saved_payoff (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid   NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  name           text   NOT NULL,
  underlying_id  bigint NOT NULL REFERENCES ref.instrument(id),
  legs           jsonb  NOT NULL,   -- [{"instrument_id":…,"side":"SELL","lots":2,"entry_price":112.5}]
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.note (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  issuer_id      bigint REFERENCES ref.issuer(id),
  instrument_id  bigint REFERENCES ref.instrument(id),
  body           text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (issuer_id IS NOT NULL OR instrument_id IS NOT NULL)
);


-- =============================================================================
-- lab · strategies, backtests, paper trading, plans
-- One strategy runtime serves backtests (historical bars) and paper trading
-- (the live bar stream), so their results can be compared honestly.
-- =============================================================================

CREATE TYPE lab.run_status AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

CREATE TABLE lab.strategy (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  style           text NOT NULL CHECK (style IN ('RULES', 'OPTIONS', 'PORTFOLIO')),
  latest_version  integer NOT NULL DEFAULT 1,
  is_archived     boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

-- Definitions never change once written. An edit adds a version, so every
-- backtest and paper deployment points at exactly the rules it ran.
CREATE TABLE lab.strategy_version (
  strategy_id  uuid    NOT NULL REFERENCES lab.strategy(id) ON DELETE CASCADE,
  version      integer NOT NULL CHECK (version > 0),
  definition   jsonb   NOT NULL,     -- validated AST: universe, entry, exit, sizing, risk
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (strategy_id, version)
);

-- The durable record of every run: inputs, status, timings, results. Dispatch
-- happens on the BullMQ "backtests" queue (Valkey), whose jobs carry only the
-- run id; workers update this row as they go. See docs/adr/0001.
CREATE TABLE lab.backtest_run (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  strategy_id       uuid NOT NULL,
  strategy_version  integer NOT NULL,
  params            jsonb NOT NULL DEFAULT '{}'::jsonb,
  bar_interval      text NOT NULL CHECK (bar_interval IN ('1m', '5m', '15m', '1d')),
  date_from         date NOT NULL,
  date_to           date NOT NULL,
  initial_capital   numeric(16,2) NOT NULL CHECK (initial_capital > 0),
  slippage_bps      numeric(8,2) NOT NULL DEFAULT 5,
  data_version      text NOT NULL,     -- last bar date + adjustment revision the run saw
  engine_version    text NOT NULL,
  cache_key         text NOT NULL,     -- hash of every input above; identical runs share one result
  status            lab.run_status NOT NULL DEFAULT 'QUEUED',
  priority          smallint NOT NULL DEFAULT 10,   -- BullMQ priority it was queued with; lower runs first
  queued_at         timestamptz NOT NULL DEFAULT now(),
  started_at        timestamptz,
  finished_at       timestamptz,
  worker_id         text,
  attempts          smallint NOT NULL DEFAULT 0,
  progress_pct      real,
  error             text,
  FOREIGN KEY (strategy_id, strategy_version)
    REFERENCES lab.strategy_version (strategy_id, version) ON DELETE CASCADE,
  CHECK (date_to >= date_from)
);
CREATE INDEX backtest_user_idx  ON lab.backtest_run (user_id, queued_at DESC);
-- the reconciler re-enqueues runs still QUEUED here that have no job in Valkey
CREATE INDEX backtest_pending_idx ON lab.backtest_run (queued_at) WHERE status IN ('QUEUED', 'RUNNING');
CREATE INDEX backtest_cache_idx ON lab.backtest_run (cache_key) WHERE status = 'SUCCEEDED';

CREATE TABLE lab.backtest_result (
  run_id           uuid PRIMARY KEY REFERENCES lab.backtest_run(id) ON DELETE CASCADE,
  metrics          jsonb NOT NULL,   -- cagr, sharpe, sortino, max_drawdown, calmar, win_rate, profit_factor, exposure, trades
  oos_from         date,             -- start of the out-of-sample window; metrics are reported on both sides
  equity_sample    jsonb NOT NULL,   -- at most 2,000 downsampled points for charts
  equity_key       text,             -- the full curve as Parquet in the object store
  monthly_returns  jsonb NOT NULL,   -- {"2024-01": 0.021, ...}
  benchmark        jsonb             -- the same metrics for the benchmark, e.g. NIFTY 50 TRI
);

-- Bulk-written by workers; instrument ids come from the engine, so no FK to ref.
CREATE TABLE lab.backtest_trade (
  run_id         uuid     NOT NULL REFERENCES lab.backtest_run(id) ON DELETE CASCADE,
  trade_no       integer  NOT NULL,
  leg_no         smallint NOT NULL DEFAULT 1,     -- option strategies carry several legs per trade
  instrument_id  bigint   NOT NULL,
  side           char(1)  NOT NULL CHECK (side IN ('B', 'S')),
  quantity       numeric(20,4) NOT NULL CHECK (quantity > 0),
  entry_at       timestamptz NOT NULL,
  entry_price    double precision NOT NULL,
  exit_at        timestamptz,
  exit_price     double precision,
  charges        numeric(14,2) NOT NULL DEFAULT 0,
  pnl            numeric(16,2),
  exit_reason    text CHECK (exit_reason IN ('SIGNAL', 'TARGET', 'STOP', 'TRAIL', 'TIME', 'EXPIRY', 'END_OF_TEST')),
  PRIMARY KEY (run_id, trade_no, leg_no)
);

CREATE TABLE lab.paper_account (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  name              text NOT NULL,
  starting_capital  numeric(16,2) NOT NULL CHECK (starting_capital > 0),
  cash              numeric(16,2) NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

-- A strategy version trading virtual money on the live (or simulated) feed.
CREATE TABLE lab.paper_deployment (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        uuid NOT NULL REFERENCES lab.paper_account(id) ON DELETE CASCADE,
  strategy_id       uuid NOT NULL,
  strategy_version  integer NOT NULL,
  params            jsonb NOT NULL DEFAULT '{}'::jsonb,
  status            text NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'PAUSED', 'STOPPED')),
  started_at        timestamptz NOT NULL DEFAULT now(),
  stopped_at        timestamptz,
  FOREIGN KEY (strategy_id, strategy_version)
    REFERENCES lab.strategy_version (strategy_id, version) ON DELETE CASCADE
);
CREATE INDEX paper_deployment_running_idx ON lab.paper_deployment (account_id) WHERE status = 'RUNNING';

CREATE TABLE lab.paper_order (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     uuid NOT NULL REFERENCES lab.paper_account(id) ON DELETE CASCADE,
  deployment_id  uuid REFERENCES lab.paper_deployment(id) ON DELETE SET NULL,   -- NULL for manual orders
  instrument_id  bigint NOT NULL REFERENCES ref.instrument(id),
  side           char(1) NOT NULL CHECK (side IN ('B', 'S')),
  quantity       numeric(20,4) NOT NULL CHECK (quantity > 0),
  order_type     text NOT NULL CHECK (order_type IN ('MARKET', 'LIMIT', 'SL', 'SL-M')),
  limit_price    double precision,
  trigger_price  double precision,
  status         text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'FILLED', 'CANCELLED', 'REJECTED')),
  placed_at      timestamptz NOT NULL DEFAULT now(),
  filled_at      timestamptz,
  fill_price     double precision,
  charges        numeric(14,2),
  reject_reason  text,
  CHECK (order_type NOT IN ('LIMIT', 'SL') OR limit_price IS NOT NULL),
  CHECK (order_type NOT IN ('SL', 'SL-M') OR trigger_price IS NOT NULL),
  CHECK ((status = 'FILLED') = (fill_price IS NOT NULL AND filled_at IS NOT NULL))
);
CREATE INDEX paper_order_open_idx    ON lab.paper_order (instrument_id) WHERE status = 'OPEN';
CREATE INDEX paper_order_account_idx ON lab.paper_order (account_id, placed_at DESC);

CREATE TABLE lab.paper_position (
  account_id     uuid   NOT NULL REFERENCES lab.paper_account(id) ON DELETE CASCADE,
  instrument_id  bigint NOT NULL REFERENCES ref.instrument(id),
  quantity       numeric(20,4) NOT NULL,          -- negative = short
  avg_price      double precision NOT NULL,
  realized_pnl   numeric(16,2) NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, instrument_id)
);

CREATE TABLE lab.plan (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('TRADING', 'INVESTMENT')),
  -- TRADING:    {"capital":500000,"risk_per_trade_pct":1,"max_daily_loss_pct":3,"max_open_positions":5,"setups":[...],"checklist":[...]}
  -- INVESTMENT: {"goal_inr":5000000,"target_date":"2036-03-31","monthly_sip":25000,"step_up_pct":10,"benchmark_id":...}
  body        jsonb NOT NULL,
  account_id  uuid REFERENCES lab.paper_account(id) ON DELETE SET NULL,   -- a trading plan is checked against this account
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE lab.journal_entry (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  plan_id        uuid REFERENCES lab.plan(id) ON DELETE SET NULL,
  order_id       uuid REFERENCES lab.paper_order(id) ON DELETE SET NULL,
  instrument_id  bigint REFERENCES ref.instrument(id),
  entry_date     date NOT NULL,               -- IST date, set by the app
  body           text NOT NULL,
  tags           text[] NOT NULL DEFAULT '{}',
  followed_plan  boolean,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX journal_user_idx ON lab.journal_entry (user_id, entry_date DESC);


-- =============================================================================
-- ops · pipelines, data quality, audit
-- =============================================================================

-- Every batch job claims (job_name, business_date) here. A job that already
-- succeeded for a date is skipped, which makes re-runs and backfills safe.
CREATE TABLE ops.job_run (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_name       text     NOT NULL,        -- eod.bhavcopy.nse_cm, premarket.instrument_master ...
  business_date  date     NOT NULL,
  attempt        smallint NOT NULL DEFAULT 1,
  status         text     NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED')),
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  rows_written   bigint,
  error          text,
  meta           jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (job_name, business_date, attempt)
);
CREATE UNIQUE INDEX job_run_one_success ON ops.job_run (job_name, business_date)
  WHERE status = 'SUCCEEDED';

CREATE TABLE ops.data_quality_issue (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  check_name     text NOT NULL,   -- candle_vs_bhavcopy, stale_feed, missing_bars, price_outside_band
  severity       text NOT NULL CHECK (severity IN ('INFO', 'WARN', 'CRITICAL')),
  instrument_id  bigint REFERENCES ref.instrument(id),
  business_date  date,
  details        jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at    timestamptz
);
CREATE INDEX dq_open_issues_idx ON ops.data_quality_issue (severity, detected_at)
  WHERE resolved_at IS NULL;

CREATE TABLE ops.audit_log (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at           timestamptz NOT NULL DEFAULT now(),
  actor_type   text NOT NULL CHECK (actor_type IN ('USER', 'ADMIN', 'SYSTEM')),
  actor_id     uuid,
  action       text NOT NULL,     -- login, plan_change, data_export, instrument_override ...
  target_type  text,
  target_id    text,
  ip           inet,
  details      jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX audit_log_actor_idx ON ops.audit_log (actor_id, at DESC);


-- =============================================================================
-- keep updated_at current on every table that has one
-- =============================================================================
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.table_schema, c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
    WHERE c.column_name = 'updated_at'
      AND tb.table_type = 'BASE TABLE'
      AND c.table_schema IN ('ref', 'md', 'corp', 'fi', 'ipo', 'scr', 'app', 'lab', 'ops')
  LOOP
    EXECUTE format(
      'CREATE TRIGGER touch_updated_at BEFORE UPDATE ON %I.%I
         FOR EACH ROW EXECUTE FUNCTION ops.touch_updated_at()',
      t.table_schema, t.table_name);
  END LOOP;
END $$;
