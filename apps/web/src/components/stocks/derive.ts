import { yearsToExpiry } from "@greencircuits/market/black76"
import { INDEX, getInstrumentBySlug, marketCapCr, membersOf, slugify } from "@greencircuits/market/catalog"
import { RISK_FREE, expiriesFor, isMonthly } from "@greencircuits/market/chain"
import { dailyCandles } from "@greencircuits/market/history"
import type { Instrument, Sector } from "@greencircuits/market/types"
import { roundTo } from "@greencircuits/market/random"

/**
 * Derived helpers for the stock and instrument pages. Pure functions of the
 * catalog and the sample history, so they run the same on the server and in
 * the browser. Anything that needs sample fundamentals lives in ./data.
 */

// ------------------------------------------------------------------ lookups

/** Resolve a URL segment: the slug first, then a raw symbol such as "M&M" or "NIFTY 50". */
export function findInstrument(segment: string): Instrument | undefined {
  let text = segment
  try {
    text = decodeURIComponent(segment)
  } catch {
    // Malformed escapes: fall back to the raw segment.
  }
  return getInstrumentBySlug(text) ?? getInstrumentBySlug(slugify(text))
}

/** "RELIANCE · Reliance Industries", or just the name when the symbol says the same thing. */
export function instrumentTitle(inst: Instrument): string {
  const same = inst.symbol.replace(/\s+/g, "").toLowerCase() === inst.name.replace(/\s+/g, "").toLowerCase()
  return same ? inst.name : `${inst.symbol} · ${inst.name}`
}

/** Names of the indices an equity belongs to, largest first. */
export function membershipNames(inst: Instrument): string[] {
  const order = [INDEX.NIFTY, INDEX.SENSEX, INDEX.BANKNIFTY, INDEX.FINNIFTY, INDEX.NIFTYIT, INDEX.MIDCAP] as number[]
  const names: Record<number, string> = {
    [INDEX.NIFTY]: "Nifty 50",
    [INDEX.SENSEX]: "BSE Sensex",
    [INDEX.BANKNIFTY]: "Nifty Bank",
    [INDEX.FINNIFTY]: "Nifty Financial Services",
    [INDEX.NIFTYIT]: "Nifty IT",
    [INDEX.MIDCAP]: "Nifty Midcap 100",
  }
  return order.filter((id) => inst.indices?.includes(id)).map((id) => names[id]!)
}

/** "a", "a and b", "a, b and c". */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ""
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`
}

// ----------------------------------------------------------------------- F&O

const FO_ROOT: Record<number, string> = {
  [INDEX.NIFTY]: "NIFTY",
  [INDEX.SENSEX]: "SENSEX",
  [INDEX.BANKNIFTY]: "BANKNIFTY",
  [INDEX.FINNIFTY]: "FINNIFTY",
}

/** The root used in contract names: NIFTY, BANKNIFTY, RELIANCE. */
export function foRoot(inst: Instrument): string {
  return FO_ROOT[inst.id] ?? inst.symbol
}

/**
 * F&O lot size. Indices and currency pairs carry their own; the catalog has no
 * stock lots yet, so stocks get a sample lot sized near ₹7.5 lakh a contract
 * and rounded the way NSE lots are.
 */
export function lotSize(inst: Instrument): number | undefined {
  if (!inst.isFo) return undefined
  if (inst.lot) return inst.lot
  const raw = 750_000 / inst.prevClose
  const step = raw >= 1000 ? 50 : raw >= 100 ? 25 : 5
  return Math.max(step, Math.round(raw / step) * step)
}

export function isSampleLot(inst: Instrument): boolean {
  return Boolean(inst.isFo && inst.lot == null)
}

/** Contract rules as encoded in the chain builder (NSE Tuesday, BSE Thursday expiries). */
export function contractRules(inst: Instrument): { options: string; futures: string; settlement: string } {
  const day = inst.exchange === "BSE" ? "Thursday" : "Tuesday"
  const weekly = inst.id === INDEX.NIFTY || inst.id === INDEX.SENSEX
  return {
    options: weekly ? `Weekly, every ${day}` : `Monthly, last ${day}`,
    futures: `Monthly, last ${day}`,
    settlement: inst.kind === "EQUITY" ? "Physical delivery" : "Cash",
  }
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]

/** The next `count` monthly expiries (futures expire monthly even where options are weekly). */
export function monthlyExpiries(inst: Instrument, now: Date, count = 3): Date[] {
  return expiriesFor(inst, now, 16)
    .filter((e) => isMonthly(e, inst))
    .slice(0, count)
}

export interface FutureQuote {
  /** Unix ms of the 15:30 IST expiry. */
  expiry: number
  label: string
  days: number
  price: number
  basis: number
  /** Simple annualised carry: (F / S − 1) × 365 / days, in %. */
  carryPct: number
}

/** Theoretical futures for the next three monthly expiries: F = S × e^(r·t). */
export function futuresCurve(inst: Instrument, spot: number, now: Date): FutureQuote[] {
  return monthlyExpiries(inst, now).map((expiry) => {
    const t = yearsToExpiry(expiry, now)
    const fair = spot * Math.exp(RISK_FREE * t)
    const days = t * 365
    return {
      expiry: expiry.getTime(),
      label: `${foRoot(inst)} ${MONTHS[expiry.getUTCMonth()]} FUT`,
      days,
      price: roundTo(fair, inst.tick),
      basis: fair - spot,
      carryPct: days > 0 ? (fair / spot - 1) * (365 / days) * 100 : 0,
    }
  })
}

// ------------------------------------------------------------------- returns

export const RETURN_PERIODS = [
  { label: "1W", sessions: 5 },
  { label: "1M", sessions: 21 },
  { label: "3M", sessions: 63 },
  { label: "6M", sessions: 126 },
  { label: "1Y", sessions: 250 },
  { label: "3Y", sessions: 750 },
] as const

/** Close `sessions` sessions before today, so returns against the live price include today. */
export function closeSessionsAgo(inst: Instrument, sessions: number): number {
  return dailyCandles(inst, sessions)[0]!.close
}

/** Base closes for every return period, oldest history built once. */
export function returnBases(inst: Instrument): number[] {
  const closes = dailyCandles(inst, 750).map((c) => c.close)
  return RETURN_PERIODS.map((p) => closes[closes.length - p.sessions]!)
}

// ------------------------------------------------------------------- indices

export interface Weight {
  inst: Instrument
  /** Fraction of the index, by market cap at the previous close (how the simulator composes indices). */
  weight: number
}

export function indexWeights(indexId: number): Weight[] {
  const members = membersOf(indexId)
  const total = members.reduce((s, m) => s + marketCapCr(m, m.prevClose), 0)
  if (!total) return []
  return members
    .map((m) => ({ inst: m, weight: marketCapCr(m, m.prevClose) / total }))
    .sort((a, b) => b.weight - a.weight)
}

export function sectorBreakdown(weights: Weight[]): { sector: Sector; weight: number; count: number }[] {
  const map = new Map<Sector, { weight: number; count: number }>()
  for (const { inst, weight } of weights) {
    if (!inst.sector) continue
    const cur = map.get(inst.sector) ?? { weight: 0, count: 0 }
    map.set(inst.sector, { weight: cur.weight + weight, count: cur.count + 1 })
  }
  return [...map.entries()].map(([sector, v]) => ({ sector, ...v })).sort((a, b) => b.weight - a.weight)
}

/** Bounds for compact range bars: whole rupees above ₹1,000, two decimals below. */
export function boundDecimals(value: number): number {
  return value >= 1000 ? 0 : 2
}

// -------------------------------------------------------- shared data shapes

/** Per-stock values computed on the server for the directory table. */
/**
 * A month of closes with the live price as the last point. Real data already
 * holds today's close, which the live price replaces; the demo's history ends
 * yesterday, so the live price is added.
 */
export function withLive(spark: number[], ltp: number | undefined, replaceLast: boolean): number[] {
  if (ltp == null) return spark
  return replaceLast ? [...spark.slice(0, -1), ltp] : [...spark, ltp]
}

export interface StockStatic {
  id: number
  spark: number[]
  low52: number
  high52: number
  /** Trailing twelve months; null when the company hasn't reported enough. */
  eps: number | null
}

export interface IndexStatic {
  id: number
  spark: number[]
  low52: number
  high52: number
  /** Members among the stocks the site follows. */
  members: number
  lot?: number
}

/** The fundamentals the key-stats grid combines with the live price. */
export interface KeyFundamentals {
  eps: number
  bookValue: number
  /** Dividend per share over the last year, ₹. */
  dps: number
  roe: number
  roce: number
  debtEquity: number | null
  faceValue: number
}

/** Index valuation from its sample members, at the previous close. */
export interface IndexValuation {
  members: number
  pe: number
  pb: number
  dividendYield: number
}

export interface PeerStatic {
  id: number
  eps: number
  bookValue: number
  roe: number
  /** Close 250 sessions ago, for a live one-year return. */
  base1y: number
}

export interface CalendarItem {
  /** Unix ms. */
  date: number
  kind: "RESULTS" | "DIVIDEND" | "AGM" | "EXPIRY"
  title: string
  detail: string
  /** A sample date, not an announced one. */
  expected?: boolean
}
