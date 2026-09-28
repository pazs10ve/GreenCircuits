export type Exchange = "NSE" | "BSE" | "MCX"

/** ETFs, REITs and InvITs are listed funds: they trade like shares but aren't companies. */
export type InstrumentKind = "EQUITY" | "INDEX" | "COMMODITY" | "CURRENCY" | "ETF" | "REIT" | "INVIT"

export type Sector =
  | "Financials"
  | "IT"
  | "Energy"
  | "Consumer"
  | "Auto"
  | "Healthcare"
  | "Materials"
  | "Industrials"
  | "Telecom"
  | "Utilities"
  | "Realty"

export interface Instrument {
  id: number
  symbol: string
  name: string
  slug: string
  exchange: Exchange
  kind: InstrumentKind
  sector?: Sector
  industry?: string
  /** Equities: the ISIN, which outlives a change of symbol. */
  isin?: string
  /** Simulator anchor: yesterday's close. */
  prevClose: number
  /** Annualised volatility used by the simulator. */
  vol: number
  /** Sensitivity to the market factor. */
  beta: number
  tick: number
  /** Equities: shares outstanding, in crore. */
  sharesCr?: number
  /** Average daily volume (shares or contracts). */
  avgVolume: number
  lot?: number
  /** Quotation unit for commodities, e.g. "₹ / 10 g". */
  unit?: string
  isFo?: boolean
  /** Index ids this equity belongs to. */
  indices?: number[]
  /** ETFs: what the fund holds, broadly ("Broad market", "Gold", "Liquid"). */
  category?: string
  /** ETFs: what the fund tracks, as NSE names it ("Nifty 50", "GOLD"). */
  underlying?: string
  /** ETFs: the instrument the fund follows, when the site has it; the simulator moves the two together. */
  tracks?: number
}

export type DataSource = "LIVE" | "DELAYED" | "EOD" | "SIMULATED"

export interface Quote {
  id: number
  ltp: number
  open: number
  high: number
  low: number
  prevClose: number
  change: number
  changePct: number
  volume: number
  bid: number
  ask: number
  /** Unix ms of the last change. */
  ts: number
  /** +1 up-tick, -1 down-tick, 0 unchanged, relative to the previous quote. */
  tickDir: -1 | 0 | 1
}

export interface Candle {
  time: number // unix seconds
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/** A point on a time series chart. */
export interface Point {
  /** Unix seconds. */
  time: number
  value: number
}
