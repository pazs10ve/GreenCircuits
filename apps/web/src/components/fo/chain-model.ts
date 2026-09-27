import { buildChain, expiriesFor, isMonthly, type OptionQuote } from "@greencircuits/market/chain"
import { INDEX, OPTION_UNDERLYINGS, getInstrument } from "@greencircuits/market/catalog"
import type { Instrument } from "@greencircuits/market/types"
import { formatNumber, formatSigned } from "@greencircuits/market/format"
import { gaussian, rngFor } from "@greencircuits/market/random"

/**
 * Chain assembly for the F&O pages.
 *
 * buildChain lays out open interest by position relative to the ATM strike, so
 * building it around the live spot would reshuffle every strike's OI each time
 * the ATM strike changes. Here OI, OI change and volume come from a chain
 * anchored at yesterday's close (stable all session, with buildChain's slow
 * minute drift), while prices, IV and Greeks come from a second buildChain at
 * the live spot and India VIX.
 */

const DAY_MS = 86_400_000

/** Strikes each side of the anchor ATM: covers a ±20 strike view after a large intraday move. */
export const ANCHOR_STRIKES = 40

/** Sample NSE lot sizes for the stock underlyings; the catalog carries lots for indices only. */
const STOCK_LOTS: Record<string, number> = { RELIANCE: 500, ICICIBANK: 700, INFY: 400, BHARTIARTL: 475, SBIN: 750 }

export function lotSize(inst: Instrument): number {
  if (inst.lot) return inst.lot
  // Fallback: a contract worth roughly ₹7.5 lakh, in multiples of 25 shares.
  return STOCK_LOTS[inst.symbol] ?? Math.max(25, Math.round(750_000 / inst.prevClose / 25) * 25)
}

/** Option underlyings, each with a lot size. */
export const FO_UNDERLYINGS: Instrument[] = OPTION_UNDERLYINGS.map((id) => {
  const inst = getInstrument(id)!
  return inst.lot ? inst : { ...inst, lot: lotSize(inst) }
})

export function foUnderlying(id: number): Instrument | undefined {
  return FO_UNDERLYINGS.find((i) => i.id === id)
}

export function foUnderlyingBySlug(slug: string): Instrument | undefined {
  return FO_UNDERLYINGS.find((i) => i.slug === slug.toLowerCase())
}

export function hasWeeklies(inst: Instrument): boolean {
  return inst.id === INDEX.NIFTY || inst.id === INDEX.SENSEX
}

// ------------------------------------------------------------------ open interest

export interface OiSide {
  oi: number
  oiChange: number
  volume: number
}

export interface OiChain {
  atm: number
  step: number
  lot: number
  rows: { strike: number; ce: OiSide; pe: OiSide }[]
  totalCeOi: number
  totalPeOi: number
  pcr: number
  maxPain: number
}

/** Open interest thins out away from the money. */
function taper(stepsFromAtm: number): number {
  const x = Math.max(0, Math.abs(stepsFromAtm) - 8) / 10
  return 1 / (1 + x * x)
}

function maxPainOf(rows: OiChain["rows"]): number {
  let best = rows[0]?.strike ?? 0
  let least = Infinity
  for (const candidate of rows) {
    const S = candidate.strike
    let pain = 0
    for (const r of rows) pain += r.ce.oi * Math.max(S - r.strike, 0) + r.pe.oi * Math.max(r.strike - S, 0)
    if (pain < least) {
      least = pain
      best = S
    }
  }
  return best
}

/**
 * Sample OI for one expiry, in units (a multiple of the lot), laid out around
 * the previous close (`anchor`: the live quote's, or the demo catalog's).
 * Changes slowly, minute by minute.
 */
export function oiChain(inst: Instrument, expiry: Date, now: Date, anchor = inst.prevClose): OiChain {
  const base = buildChain(inst, anchor, expiry, undefined, now, ANCHOR_STRIKES)
  const lot = base.lot
  const side = (q: OptionQuote, t: number): OiSide => ({
    oi: Math.round((q.oi * t) / lot) * lot,
    oiChange: Math.round(q.oiChange * t),
    volume: Math.round(q.volume * t),
  })
  const rows = base.rows.map((r) => {
    const t = taper((r.strike - base.atm) / base.step)
    return { strike: r.strike, ce: side(r.ce, t), pe: side(r.pe, t) }
  })
  const totalCeOi = rows.reduce((s, r) => s + r.ce.oi, 0)
  const totalPeOi = rows.reduce((s, r) => s + r.pe.oi, 0)
  return {
    atm: base.atm,
    step: base.step,
    lot,
    rows,
    totalCeOi,
    totalPeOi,
    pcr: totalPeOi / Math.max(1, totalCeOi),
    maxPain: maxPainOf(rows),
  }
}

// ------------------------------------------------------------------ live chain

export type PrevCloses = Map<number, { ce: number; pe: number }>

export interface ChainQuote extends OptionQuote {
  /** Option's close in the previous session, when it traded then. */
  prevLtp?: number
}

export interface LiveRow {
  strike: number
  ce: ChainQuote
  pe: ChainQuote
}

export interface LiveChain {
  spot: number
  forward: number
  expiry: Date
  atm: number
  step: number
  lot: number
  atmIv: number
  rows: LiveRow[]
  pcr: number
  maxPain: number
  totalCeOi: number
  totalPeOi: number
}

/** Price the anchored strikes at the live spot and VIX. */
export function liveChain(
  inst: Instrument,
  spot: number,
  expiry: Date,
  vix: number | undefined,
  now: Date,
  oi: OiChain,
  prev: PrevCloses | null,
): LiveChain {
  const drift = Math.ceil(Math.abs(spot - oi.atm) / oi.step) + 1
  const live = buildChain(inst, spot, expiry, vix, now, ANCHOR_STRIKES + drift)
  const byStrike = new Map(live.rows.map((r) => [r.strike, r]))
  const rows: LiveRow[] = []
  for (const o of oi.rows) {
    const l = byStrike.get(o.strike)
    if (!l) continue
    const p = prev?.get(o.strike)
    rows.push({
      strike: o.strike,
      ce: { ...l.ce, ...o.ce, prevLtp: p?.ce },
      pe: { ...l.pe, ...o.pe, prevLtp: p?.pe },
    })
  }
  return {
    spot,
    forward: live.forward,
    expiry,
    atm: live.atm,
    step: live.step,
    lot: live.lot,
    atmIv: live.atmIv,
    rows,
    pcr: oi.pcr,
    maxPain: oi.maxPain,
    totalCeOi: oi.totalCeOi,
    totalPeOi: oi.totalPeOi,
  }
}

/** 15:30 IST on the previous weekday. */
export function previousSessionClose(now: Date): Date {
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000)
  const d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - 1, 10, 0))
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1)
  return d
}

/**
 * Option closes in the previous session (`at`, from previousSessionClose): the
 * chain priced at yesterday's spot and VIX (the live quotes' previous closes,
 * or the demo catalog's) and time to expiry.
 */
export function prevCloseLtps(inst: Instrument, expiry: Date, at: Date, spot = inst.prevClose, vix = getInstrument(INDEX.VIX)!.prevClose): PrevCloses {
  if (expiry.getTime() <= at.getTime()) return new Map()
  const chain = buildChain(inst, spot, expiry, vix, at, ANCHOR_STRIKES)
  return new Map(chain.rows.map((r) => [r.strike, { ce: r.ce.ltp, pe: r.pe.ltp }]))
}

// ------------------------------------------------------------------ IV percentile

const ivHistories = new Map<number, number[]>()

/** A year of sample daily ATM IVs (in %) around the underlying's normal level. */
function ivHistory(inst: Instrument): number[] {
  const cached = ivHistories.get(inst.id)
  if (cached) return cached
  const vix = getInstrument(INDEX.VIX)!.prevClose / 100
  const base = inst.kind === "INDEX" ? vix * (inst.id === INDEX.BANKNIFTY ? 1.15 : 1) : inst.vol * 1.05
  const rng = rngFor(inst.symbol, 0x1f1f)
  const out: number[] = []
  let x = 0
  for (let d = 0; d < 252; d++) {
    // Mean-reverting log-IV, roughly ±20% around a one-month ATM level.
    x = 0.94 * x + gaussian(rng) * 0.07
    out.push(base * 100 * 1.03 * Math.exp(x))
  }
  ivHistories.set(inst.id, out)
  return out
}

/** Share of the past year's sample sessions with ATM IV below today's, 0–100. */
export function ivPercentile(inst: Instrument, atmIv: number): number {
  const history = ivHistory(inst)
  return (history.filter((v) => v < atmIv).length / history.length) * 100
}

// ------------------------------------------------------------------ expiries and units

/** Expiry id for URLs and keys, e.g. "2026-09-29" (the IST date; expiries are at 10:00 UTC). */
export function expiryKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function formatExpiry(d: Date, withYear = false): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  }).format(d)
}

/** "2d 5h", "5h 20m", "12m". */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "Expired"
  const mins = Math.floor(ms / 60000)
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export type OiUnit = "lakh" | "contracts"

/** OI and volume in lakh units (shares or index units) or in contracts. */
export function formatOi(units: number, unit: OiUnit, lot: number, signed = false): string {
  const v = unit === "lakh" ? units / 1e5 : units / lot
  const decimals = unit === "lakh" ? 2 : 0
  return signed ? formatSigned(v, decimals) : formatNumber(v, decimals)
}

export interface ExpiryDay {
  date: Date
  key: string
  entries: { inst: Instrument; monthly: boolean }[]
}

/** Option expiries across the underlyings within the next `days` days, grouped by date. */
export function expiryCalendar(now: Date, days = 14): ExpiryDay[] {
  const end = now.getTime() + days * DAY_MS
  const byDay = new Map<string, ExpiryDay>()
  for (const inst of FO_UNDERLYINGS) {
    for (const e of expiriesFor(inst, now, 6)) {
      if (e.getTime() > end) continue
      const key = expiryKey(e)
      const day = byDay.get(key) ?? { date: e, key, entries: [] }
      day.entries.push({ inst, monthly: isMonthly(e, inst) })
      byDay.set(key, day)
    }
  }
  return [...byDay.values()].sort((a, b) => a.date.getTime() - b.date.getTime())
}
