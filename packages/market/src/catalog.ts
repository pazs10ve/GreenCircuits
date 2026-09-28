import data from "./data/equities.json"
import fundData from "./data/listed-funds.json"
import type { Instrument, InstrumentKind, Sector } from "./types"

/**
 * The universe. The stocks are the Nifty 500, from data/equities.json, and the
 * listed funds every ETF, REIT and InvIT on NSE that Yahoo prices, from
 * data/listed-funds.json; `pnpm catalog` builds both from the official index
 * lists, NSE's security masters, AMFI and Yahoo Finance. Symbols, names,
 * sectors, index membership (except the Sensex's), lots and what each ETF
 * tracks are real. Prices, shares, volumes, volatility and beta are one day's,
 * and anchor the simulator; the demo market moves on from there.
 */

export const INDEX = {
  NIFTY: 1,
  SENSEX: 2,
  BANKNIFTY: 3,
  NIFTYIT: 4,
  MIDCAP: 5,
  FINNIFTY: 6,
  VIX: 7,
  NEXT50: 8,
  NIFTY500: 9,
  MIDCAP150: 10,
  SMALLCAP250: 11,
} as const

/** NSE equity tick sizes by price band (revised monthly since April 2025). */
export function tickFor(price: number): number {
  if (price < 250) return 0.01
  if (price < 1000) return 0.05
  if (price < 5000) return 0.1
  if (price < 10000) return 0.5
  if (price < 20000) return 1
  return 5
}

export function slugify(symbol: string): string {
  return symbol.toLowerCase().replace(/&/g, "-and-").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

/** Index levels at the catalog's date; the fallbacks cover an index the generator couldn't price. */
const anchors = data.indices as Record<string, number>
const level = (id: number, fallback: number) => anchors[id] ?? fallback

const indexRows: Omit<Instrument, "slug">[] = [
  { id: INDEX.NIFTY, symbol: "NIFTY 50", name: "Nifty 50", exchange: "NSE", kind: "INDEX", prevClose: level(INDEX.NIFTY, 25114.2), vol: 0.13, beta: 1, tick: 0.05, avgVolume: 0, lot: 65, isFo: true },
  { id: INDEX.SENSEX, symbol: "SENSEX", name: "BSE Sensex", exchange: "BSE", kind: "INDEX", prevClose: level(INDEX.SENSEX, 82012.66), vol: 0.13, beta: 1, tick: 0.05, avgVolume: 0, lot: 20, isFo: true },
  { id: INDEX.BANKNIFTY, symbol: "BANK NIFTY", name: "Nifty Bank", exchange: "NSE", kind: "INDEX", prevClose: level(INDEX.BANKNIFTY, 55340.1), vol: 0.15, beta: 1.1, tick: 0.05, avgVolume: 0, lot: 30, isFo: true },
  { id: INDEX.NIFTYIT, symbol: "NIFTY IT", name: "Nifty IT", exchange: "NSE", kind: "INDEX", prevClose: level(INDEX.NIFTYIT, 36542.35), vol: 0.2, beta: 0.8, tick: 0.05, avgVolume: 0 },
  { id: INDEX.MIDCAP, symbol: "NIFTY MIDCAP 100", name: "Nifty Midcap 100", exchange: "NSE", kind: "INDEX", prevClose: level(INDEX.MIDCAP, 57418.9), vol: 0.17, beta: 1.15, tick: 0.05, avgVolume: 0 },
  { id: INDEX.FINNIFTY, symbol: "FIN NIFTY", name: "Nifty Financial Services", exchange: "NSE", kind: "INDEX", prevClose: level(INDEX.FINNIFTY, 26482.75), vol: 0.14, beta: 1.05, tick: 0.05, avgVolume: 0, lot: 60, isFo: true },
  { id: INDEX.VIX, symbol: "INDIA VIX", name: "India VIX", exchange: "NSE", kind: "INDEX", prevClose: level(INDEX.VIX, 11.92), vol: 0.75, beta: -4, tick: 0.01, avgVolume: 0 },
  { id: INDEX.NEXT50, symbol: "NIFTY NEXT 50", name: "Nifty Next 50", exchange: "NSE", kind: "INDEX", prevClose: level(INDEX.NEXT50, 68500), vol: 0.17, beta: 1.1, tick: 0.05, avgVolume: 0 },
  { id: INDEX.NIFTY500, symbol: "NIFTY 500", name: "Nifty 500", exchange: "NSE", kind: "INDEX", prevClose: level(INDEX.NIFTY500, 22800), vol: 0.14, beta: 1.02, tick: 0.05, avgVolume: 0 },
  { id: INDEX.MIDCAP150, symbol: "NIFTY MIDCAP 150", name: "Nifty Midcap 150", exchange: "NSE", kind: "INDEX", prevClose: level(INDEX.MIDCAP150, 22000), vol: 0.17, beta: 1.15, tick: 0.05, avgVolume: 0 },
  { id: INDEX.SMALLCAP250, symbol: "NIFTY SMALLCAP 250", name: "Nifty Smallcap 250", exchange: "NSE", kind: "INDEX", prevClose: level(INDEX.SMALLCAP250, 17500), vol: 0.2, beta: 1.25, tick: 0.05, avgVolume: 0 },
]
const indices: Instrument[] = indexRows.map((i) => ({ ...i, slug: slugify(i.symbol) }))

/** One stock in data/equities.json, in the order of its "columns". */
type Row = [
  id: number,
  symbol: string,
  name: string,
  isin: string | null,
  sector: Sector,
  industry: string | null,
  prevClose: number,
  sharesCr: number,
  vol: number,
  beta: number,
  avgVolume: number,
  indices: number[],
  lot: number | null,
]

const equities: Instrument[] = (data.equities as unknown as Row[]).map(
  ([id, symbol, name, isin, sector, industry, prevClose, sharesCr, vol, beta, avgVolume, memberOf, lot]) => {
    const inst: Instrument = {
      id,
      symbol,
      name,
      slug: slugify(symbol),
      exchange: "NSE",
      kind: "EQUITY",
      sector,
      prevClose,
      vol,
      beta,
      tick: tickFor(prevClose),
      sharesCr,
      avgVolume,
      isFo: lot != null,
      indices: memberOf,
    }
    if (industry) inst.industry = industry
    if (isin) inst.isin = isin
    if (lot != null) inst.lot = lot
    return inst
  },
)

/** When the stocks' prices, shares and volumes were taken (the last close before `pnpm catalog` ran). */
export const CATALOG_DATE = data.asOf

/** One fund in data/listed-funds.json, in the order of its "columns". */
type FundRow = [
  id: number,
  symbol: string,
  name: string,
  isin: string | null,
  kind: "ETF" | "REIT" | "INVIT",
  category: string | null,
  underlying: string | null,
  tracks: number | null,
  prevClose: number,
  vol: number,
  beta: number,
  avgVolume: number,
]

const funds: Instrument[] = (fundData.funds as unknown as FundRow[]).map(
  ([id, symbol, name, isin, kind, category, underlying, tracks, prevClose, vol, beta, avgVolume]) => {
    const inst: Instrument = {
      id,
      symbol,
      name,
      slug: slugify(symbol),
      exchange: "NSE",
      kind,
      prevClose,
      vol,
      beta,
      // NSE quotes ETFs, REITs and InvITs in paise.
      tick: 0.01,
      avgVolume,
    }
    if (isin) inst.isin = isin
    if (category) inst.category = category
    if (underlying) inst.underlying = underlying
    if (tracks != null) inst.tracks = tracks
    return inst
  },
)

const commodities: Instrument[] = [
  { id: 300, symbol: "GOLD", name: "Gold", unit: "₹ / 10 g", prevClose: 109850, vol: 0.14, beta: -0.1, tick: 1, lot: 1, avgVolume: 14000 },
  { id: 301, symbol: "SILVER", name: "Silver", unit: "₹ / kg", prevClose: 131400, vol: 0.24, beta: 0.1, tick: 1, lot: 30, avgVolume: 21000 },
  { id: 302, symbol: "CRUDEOIL", name: "Crude Oil", unit: "₹ / bbl", prevClose: 5540, vol: 0.32, beta: 0.2, tick: 1, lot: 100, avgVolume: 48000 },
  { id: 303, symbol: "NATURALGAS", name: "Natural Gas", unit: "₹ / mmBtu", prevClose: 268.4, vol: 0.55, beta: 0.1, tick: 0.1, lot: 1250, avgVolume: 91000 },
  { id: 304, symbol: "COPPER", name: "Copper", unit: "₹ / kg", prevClose: 882.5, vol: 0.22, beta: 0.35, tick: 0.05, lot: 2500, avgVolume: 12000 },
  { id: 305, symbol: "ZINC", name: "Zinc", unit: "₹ / kg", prevClose: 274.9, vol: 0.22, beta: 0.3, tick: 0.05, lot: 5000, avgVolume: 6000 },
  { id: 306, symbol: "ALUMINIUM", name: "Aluminium", unit: "₹ / kg", prevClose: 245.6, vol: 0.2, beta: 0.3, tick: 0.05, lot: 5000, avgVolume: 5000 },
].map((c) => ({ ...c, slug: slugify(c.symbol), exchange: "MCX" as const, kind: "COMMODITY" as const, isFo: true }))

const currencies: Instrument[] = [
  { id: 400, symbol: "USDINR", name: "US Dollar / Rupee", prevClose: 88.2125, vol: 0.04, beta: -0.15, tick: 0.0025, lot: 1000, avgVolume: 1800000 },
  { id: 401, symbol: "EURINR", name: "Euro / Rupee", prevClose: 103.415, vol: 0.06, beta: -0.1, tick: 0.0025, lot: 1000, avgVolume: 150000 },
  { id: 402, symbol: "GBPINR", name: "Pound / Rupee", prevClose: 118.6275, vol: 0.07, beta: -0.1, tick: 0.0025, lot: 1000, avgVolume: 90000 },
].map((c) => ({ ...c, slug: slugify(c.symbol), exchange: "NSE" as const, kind: "CURRENCY" as const, isFo: true }))

/**
 * Everything, by id. The ingestor loads the same instruments from the database
 * in id order, so the server's simulator and the in-browser demo agree for a seed.
 */
export const INSTRUMENTS: Instrument[] = [...indices, ...equities, ...commodities, ...currencies, ...funds].sort((a, b) => a.id - b.id)

const byId = new Map(INSTRUMENTS.map((i) => [i.id, i]))
const bySlug = new Map(INSTRUMENTS.map((i) => [i.slug, i]))

export function getInstrument(id: number): Instrument | undefined {
  return byId.get(id)
}

export function getInstrumentBySlug(slug: string): Instrument | undefined {
  return bySlug.get(slug.toLowerCase())
}

export const EQUITIES = equities
export const INDICES = indices
export const COMMODITIES = commodities
export const CURRENCIES = currencies
export const ETFS = funds.filter((f) => f.kind === "ETF")
/** REITs and InvITs. */
export const TRUSTS = funds.filter((f) => f.kind === "REIT" || f.kind === "INVIT")
export const LISTED_FUNDS = funds

/** What ETFs hold, broadest first: the categories the catalog sorts them into. */
export const ETF_CATEGORIES = ["Broad market", "Sector and theme", "Strategy", "Gold", "Silver", "Liquid", "Bonds", "International", "Hybrid"].filter((c) =>
  funds.some((f) => f.category === c),
)

const FUND_KINDS = new Set<InstrumentKind>(["ETF", "REIT", "INVIT"])

export function isListedFund(inst: Pick<Instrument, "kind">): boolean {
  return FUND_KINDS.has(inst.kind)
}

/** The page an instrument lives on. */
export function hrefOf(inst: Pick<Instrument, "kind" | "slug">): string {
  if (inst.kind === "COMMODITY") return `/commodities?c=${inst.slug}`
  if (FUND_KINDS.has(inst.kind)) return `/funds/${inst.slug}`
  return `/stocks/${inst.slug}`
}

/** Headline instruments for the top-bar ticker. */
export const TICKER_IDS = [INDEX.NIFTY, INDEX.SENSEX, INDEX.BANKNIFTY, INDEX.NIFTYIT, INDEX.VIX, 400, 300, 302]

export function membersOf(indexId: number): Instrument[] {
  return equities.filter((e) => e.indices?.includes(indexId))
}

/** Market cap in crore at a given price. */
export function marketCapCr(instrument: Instrument, price: number): number {
  return (instrument.sharesCr ?? 0) * price
}

export type SizeBand = "Large" | "Mid" | "Small"

export const SIZE_BANDS: SizeBand[] = ["Large", "Mid", "Small"]

/**
 * SEBI's size bands, read from index membership: large is the hundred biggest
 * companies (the Nifty 50 and Next 50), mid the next 150 (the Midcap 150),
 * small the 250 after them (the Smallcap 250).
 */
export function sizeBand(indexIds: readonly number[] | undefined): SizeBand | null {
  if (!indexIds) return null
  if (indexIds.includes(INDEX.NIFTY) || indexIds.includes(INDEX.NEXT50)) return "Large"
  if (indexIds.includes(INDEX.MIDCAP150)) return "Mid"
  if (indexIds.includes(INDEX.SMALLCAP250)) return "Small"
  return null
}

export const SECTORS: Sector[] = [
  "Financials", "IT", "Energy", "Consumer", "Auto", "Healthcare", "Materials", "Industrials", "Telecom", "Utilities", "Realty",
]

/** Derivative underlyings with option chains: the indices with options, then every F&O stock, largest first. */
export const OPTION_UNDERLYINGS: number[] = [
  INDEX.NIFTY,
  INDEX.BANKNIFTY,
  INDEX.FINNIFTY,
  INDEX.SENSEX,
  ...equities
    .filter((e) => e.isFo)
    .sort((a, b) => marketCapCr(b, b.prevClose) - marketCapCr(a, a.prevClose))
    .map((e) => e.id),
]
