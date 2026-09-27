# 7. Real data from free sources, for local use

- Date: 2026-09-28
- Status: accepted

## Context

Out of the box the site runs on a market simulator and generated company figures, and says so. That shows the system works. It can't show whether the brief, the company pages and the lab say anything true about a real market.

The project has no budget for a data licence and isn't deployed: it runs on the author's machine. Free sources exist, but none is an official API licensed for redistribution:

- **Yahoo Finance:** ten years of split-adjusted daily prices, quotes a minute or so behind the exchange, four years of statements and results dates. Read through its public chart endpoints and the yfinance library.
- **NSE's website:** shareholding patterns, board meetings, FII and DII flows, and IPOs, as the JSON behind its pages. For personal, non-commercial use under NSE's terms.
- **niftyindices.com:** the official constituent lists of the Nifty indices, as CSV.

## Decision

Real data is a mode for running locally, switched on by loading it:

- **`pnpm data:real`** (`greencircuits.jobs.real_data` in `pipelines/`) replaces the demo data in the database, in steps: index membership, prices, financials, shareholding, events, flows, IPOs and the screener table.
  - Every response is cached for the day in `data/cache/` (ignored by git), requests to a host are paced, and 429s and 5xx responses are retried with backoff.
  - A step that fails is reported without stopping the others. Steps can be run alone (`--only`), and a rerun on the same day fetches nothing.
- **The ingestor's Yahoo provider** polls quotes every minute while NSE trades and every 15 minutes otherwise, since gold, crude and the rupee trade longer. It publishes them exactly as the simulator does, writes one-minute closes to `md.candle_1m` and the day's bar to `md.candle_1d`. It's chosen automatically once real data is loaded; `FEED_PROVIDER` overrides it.
- **The site says which data it shows.** The API reports a `dataset` (`real` or `sample`) and the feed's source:
  - `DELAYED` while NSE trades, `EOD` otherwise, `SIMULATED` from the simulator;
  - the masthead reads "NSE, delayed", "Closing prices" or "Demo market";
  - sample badges and notes disappear only where the figures really are real;
  - text written from the data switches to the past tense once a session is over ("Nifty closed up 0.3% on Friday").
- **Only the simulator is ever deployed.** A public demo stays on generated data.

Some of it is approximate, and the site says where:

- **Commodities** are the international futures Yahoo quotes in dollars (gold, silver and copper on COMEX, crude and natural gas on NYMEX, and zinc and aluminium contracts), converted to MCX's units at the day's USD/INR. MCX prices differ by import duty and a basis.
- **Shareholding** from NSE's summary splits holdings only into promoters and the public. Patterns filed off the quarter ends, after a bonus issue or a merger, are left out.
- **Two indices** have no daily history on Yahoo: the Nifty Midcap 100 and the Nifty Financial Services. Their history grows by one close each day the ingestor or the loader runs.
- **Ratios** such as ROE, ROCE and three-year growth are computed by the loader from the statements, not taken from a data vendor.
- **The Sensex** has no free official constituent list, so the site shows no members for it rather than guessed ones.
- **What stays sample:**
  - option prices, which were always modelled with Black-76;
  - open interest;
  - bonds;
  - the sample portfolio.

## Consequences

- The brief, company pages, screener and lab can be checked against what actually happened.
- **Terms:** Yahoo's and NSE's terms don't allow redistribution or commercial use. This mode is for personal study on one machine. The repository holds the code and never the data.
- **Fragility:** unofficial endpoints change without notice. The loader fails one step and names it, and the feed backs off when Yahoo refuses.
- **Backtests** record which prices they used: the run's `data_version` gains " real". A result computed on sample prices is never reused for real ones, and the report says which prices it ran on.
- **Caching:** after a load, the web app's fetch cache can serve the previous data once per page. A reload shows the new data.
