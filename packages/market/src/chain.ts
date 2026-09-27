import { black76, yearsToExpiry, type OptionType } from "./black76"
import { INDEX } from "./catalog"
import { hashString, mulberry32, roundTo } from "./random"
import type { Instrument } from "./types"

/**
 * Option chains priced with Black-76 on a volatility smile. Expiry rules as of
 * 2026: NSE weeklies are Nifty-only on Tuesdays; BSE weeklies are Sensex-only on
 * Thursdays; everything else is monthly (last Tuesday or Thursday). Exchange
 * holidays that move an expiry are left to the real instrument master.
 */

export const RISK_FREE = 0.065

export interface OptionQuote {
  ltp: number
  iv: number
  delta: number
  gamma: number
  theta: number
  vega: number
  oi: number
  oiChange: number
  volume: number
  bid: number
  ask: number
}

export interface ChainRow {
  strike: number
  ce: OptionQuote
  pe: OptionQuote
}

export interface Chain {
  spot: number
  forward: number
  expiry: Date
  daysToExpiry: number
  atm: number
  step: number
  lot: number
  pcr: number
  maxPain: number
  atmIv: number
  totalCeOi: number
  totalPeOi: number
  rows: ChainRow[]
}

export function strikeStep(inst: Instrument): number {
  if (inst.id === INDEX.NIFTY || inst.id === INDEX.FINNIFTY) return 50
  if (inst.id === INDEX.BANKNIFTY || inst.id === INDEX.SENSEX) return 100
  const p = inst.prevClose
  if (p < 300) return 5
  if (p < 1000) return 10
  if (p < 2500) return 20
  if (p < 5000) return 50
  if (p < 10000) return 100
  return 250
}

/** Expiry at 15:30 IST (10:00 UTC) on the given UTC calendar date. */
function at1530(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d, 10, 0, 0))
}

function lastWeekdayOfMonth(y: number, m: number, weekday: number): Date {
  const last = new Date(Date.UTC(y, m + 1, 0))
  const diff = (last.getUTCDay() - weekday + 7) % 7
  return at1530(y, m, last.getUTCDate() - diff)
}

export function expiriesFor(inst: Instrument, now = new Date(), count = 6): Date[] {
  const weekday = inst.exchange === "BSE" ? 4 : 2 // Thursday for BSE, Tuesday for NSE
  const weekly = inst.id === INDEX.NIFTY || inst.id === INDEX.SENSEX
  const out: Date[] = []
  if (weekly) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    while (out.length < count) {
      if (d.getUTCDay() === weekday) {
        const e = at1530(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
        if (e.getTime() > now.getTime()) out.push(e)
      }
      d.setUTCDate(d.getUTCDate() + 1)
    }
    return out
  }
  let y = now.getUTCFullYear()
  let m = now.getUTCMonth()
  while (out.length < Math.min(count, 3)) {
    const e = lastWeekdayOfMonth(y, m, weekday)
    if (e.getTime() > now.getTime()) out.push(e)
    m++
    if (m > 11) {
      m = 0
      y++
    }
  }
  return out
}

export function isMonthly(expiry: Date, inst: Instrument): boolean {
  const weekday = inst.exchange === "BSE" ? 4 : 2
  return lastWeekdayOfMonth(expiry.getUTCFullYear(), expiry.getUTCMonth(), weekday).getTime() === expiry.getTime()
}

function smile(atmIv: number, K: number, F: number): number {
  const m = Math.log(K / F)
  return Math.max(0.05, atmIv * (1 - 1.6 * m + 9 * m * m))
}

function quote(type: OptionType, F: number, K: number, T: number, iv: number, oi: number, oiChange: number, volume: number): OptionQuote {
  const g = black76(type, F, K, T, iv, RISK_FREE)
  const ltp = Math.max(0.05, roundTo(g.price, 0.05))
  const spread = Math.max(0.05, roundTo(ltp * 0.004, 0.05))
  return {
    ltp,
    iv: iv * 100,
    delta: g.delta,
    gamma: g.gamma,
    theta: g.theta,
    vega: g.vega,
    oi,
    oiChange,
    volume,
    bid: Math.max(0.05, roundTo(ltp - spread / 2, 0.05)),
    ask: roundTo(ltp + spread / 2, 0.05),
  }
}

/**
 * Build a chain around the live spot. Open interest is deterministic per
 * underlying and expiry with a slow drift in time, so it evolves as you watch
 * without jumping on every tick.
 */
export function buildChain(inst: Instrument, spot: number, expiry: Date, vix: number | undefined, now = new Date(), strikesEachSide = 12): Chain {
  const T = Math.max(yearsToExpiry(expiry, now), 1 / (365 * 24))
  const F = spot * Math.exp(RISK_FREE * T)
  const step = strikeStep(inst)
  const atm = roundTo(spot, step)
  const baseIv =
    inst.kind === "INDEX" && vix
      ? (vix / 100) * (inst.id === INDEX.BANKNIFTY ? 1.15 : 1)
      : inst.vol * 1.05
  const atmIv = baseIv * (1 + 0.06 / Math.sqrt(Math.max(T * 365, 0.5)))

  const seed = hashString(`${inst.symbol}:${expiry.toISOString().slice(0, 10)}`)
  const rng = mulberry32(seed)
  const minute = Math.floor(now.getTime() / 60000)
  const lot = inst.lot ?? 1
  const scale = inst.kind === "INDEX" ? 1.4e7 : 2.2e6

  const rows: ChainRow[] = []
  for (let i = -strikesEachSide; i <= strikesEachSide; i++) {
    const K = atm + i * step
    if (K <= 0) continue
    const iv = smile(atmIv, K, F)
    const wiggle = 0.55 + rng() * 0.9
    const phase = rng() * Math.PI * 2
    const drift = 1 + 0.04 * Math.sin(minute / 7 + phase)
    // Call writers cluster above spot (resistance), put writers below (support).
    const ceShape = 1 / (1 + Math.exp(-(i - 2) / 2.2))
    const peShape = 1 / (1 + Math.exp((i + 2) / 2.2))
    const roundStrike = K % (step * 10) === 0 ? 1.6 : K % (step * 2) === 0 ? 1.15 : 1
    const ceOi = Math.round(scale * (0.12 + ceShape) * wiggle * drift * roundStrike / lot) * lot
    const peOi = Math.round(scale * (0.12 + peShape) * wiggle * (2 - drift) * roundStrike / lot) * lot
    const ceChg = Math.round(ceOi * (0.05 + 0.25 * (rng() - 0.35)))
    const peChg = Math.round(peOi * (0.05 + 0.25 * (rng() - 0.35)))
    const near = Math.exp(-(i * i) / 18)
    rows.push({
      strike: K,
      ce: quote("CE", F, K, T, iv, ceOi, ceChg, Math.round(ceOi * (0.6 + 2.4 * near) * (0.5 + rng()))),
      pe: quote("PE", F, K, T, iv, peOi, peChg, Math.round(peOi * (0.6 + 2.4 * near) * (0.5 + rng()))),
    })
  }

  const totalCeOi = rows.reduce((s, r) => s + r.ce.oi, 0)
  const totalPeOi = rows.reduce((s, r) => s + r.pe.oi, 0)
  let maxPain = atm
  let least = Infinity
  for (const candidate of rows) {
    const S = candidate.strike
    let pain = 0
    for (const r of rows) {
      pain += r.ce.oi * Math.max(S - r.strike, 0) + r.pe.oi * Math.max(r.strike - S, 0)
    }
    if (pain < least) {
      least = pain
      maxPain = S
    }
  }

  return {
    spot,
    forward: F,
    expiry,
    daysToExpiry: T * 365,
    atm,
    step,
    lot,
    pcr: totalPeOi / Math.max(1, totalCeOi),
    maxPain,
    atmIv: atmIv * 100,
    totalCeOi,
    totalPeOi,
    rows,
  }
}

export interface Leg {
  id: string
  type: OptionType | "FUT"
  side: "BUY" | "SELL"
  strike: number
  lots: number
  entry: number
  iv: number
}

/** Strategy P&L across a price range, at expiry and today (T+0), in rupees. */
export function payoff(legs: Leg[], lot: number, spots: number[], T: number): { atExpiry: number[]; today: number[] } {
  const atExpiry = spots.map((S) =>
    legs.reduce((sum, leg) => {
      const sign = leg.side === "BUY" ? 1 : -1
      const value =
        leg.type === "FUT" ? S : leg.type === "CE" ? Math.max(S - leg.strike, 0) : Math.max(leg.strike - S, 0)
      return sum + sign * (value - leg.entry) * leg.lots * lot
    }, 0),
  )
  const today = spots.map((S) =>
    legs.reduce((sum, leg) => {
      const sign = leg.side === "BUY" ? 1 : -1
      const value =
        leg.type === "FUT" ? S : black76(leg.type, S * Math.exp(RISK_FREE * T), leg.strike, T, leg.iv / 100, RISK_FREE).price
      return sum + sign * (value - leg.entry) * leg.lots * lot
    }, 0),
  )
  return { atExpiry, today }
}
