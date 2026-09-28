-- Mutual funds: the direct growth plan of every open-ended scheme AMFI lists,
-- with its NAV history. Units are bought from and sold back to the fund at the
-- day's NAV rather than traded on an exchange, so schemes live apart from
-- ref.instrument (ETFs, which do trade, are listings there).

CREATE SCHEMA mf;

CREATE TABLE mf.scheme (
  code            integer PRIMARY KEY,          -- AMFI's scheme code
  isin            text UNIQUE,                  -- the growth option's ISIN
  name            text NOT NULL,
  amc             text NOT NULL,                -- the fund house
  amfi_category   text NOT NULL,                -- as AMFI's file writes it
  asset_class     text NOT NULL CHECK (asset_class IN ('Equity', 'Hybrid', 'Debt', 'Index', 'Fund of funds', 'Solution', 'Other')),
  category        text NOT NULL,                -- the site's: 'Large cap', 'Liquid', ...
  launched_on     date,                         -- the first NAV on record
  nav             numeric(16, 4),
  nav_date        date,
  -- Returns on the NAV, to its latest date: a year's change, then annualised (CAGR) over longer spans.
  return_1y_pct   double precision,
  cagr_3y_pct     double precision,
  cagr_5y_pct     double precision,
  cagr_10y_pct    double precision,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scheme_category_idx ON mf.scheme (asset_class, category);
CREATE INDEX scheme_name_trgm ON mf.scheme USING gin (name gin_trgm_ops);

CREATE TABLE mf.nav (
  scheme_code  integer NOT NULL REFERENCES mf.scheme (code) ON DELETE CASCADE,
  nav_date     date    NOT NULL,
  nav          numeric(16, 4) NOT NULL CHECK (nav > 0),
  PRIMARY KEY (scheme_code, nav_date)
);
