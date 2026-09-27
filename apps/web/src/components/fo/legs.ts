import { black76, normCdf, type OptionType } from "@greencircuits/market/black76"
import { RISK_FREE, payoff, type Leg } from "@greencircuits/market/chain"
import type { ChainQuote, LiveChain, LiveRow } from "./chain-model"

/**
 * Strategy builder maths. Legs can sit on different expiries: "at expiry"
 * means the nearest leg expiry, with later legs valued by Black-76 on their
 * remaining time, and every piece goes through payoff() from the chain module.
 */

const YEAR_MS = 365 * 24 * 3600 * 1000
export const MAX_LOTS = 50

export interface StrategyLeg extends Leg {
  type: OptionType
  /** Expiry, unix ms. */
  expiry: number
}

export type Side = Leg["side"]

let counter = 0
function nextId(): string {
  counter += 1
  return `leg-${counter}`
}

export function quoteOf(row: LiveRow, type: OptionType): ChainQuote {
  return type === "CE" ? row.ce : row.pe
}

/** Add one leg, or more lots to an identical leg already in the list. */
export function addLeg(legs: StrategyLeg[], leg: Omit<StrategyLeg, "id">): StrategyLeg[] {
  const same = legs.find((l) => l.expiry === leg.expiry && l.strike === leg.strike && l.type === leg.type && l.side === leg.side)
  if (same) return legs.map((l) => (l === same ? { ...l, lots: Math.min(MAX_LOTS, l.lots + leg.lots) } : l))
  return [...legs, { ...leg, id: nextId() }]
}

// ------------------------------------------------------------------ presets

export type PresetKey = "long-straddle" | "short-strangle" | "bull-call-spread" | "bear-put-spread" | "iron-condor" | "iron-fly"

export const PRESETS: { key: PresetKey; label: string; hint: string }[] = [
  { key: "long-straddle", label: "Long straddle", hint: "Buy the ATM call and put" },
  { key: "short-strangle", label: "Short strangle", hint: "Sell the 25-delta call and put" },
  { key: "bull-call-spread", label: "Bull call spread", hint: "Buy the ATM call, sell the 30-delta call" },
  { key: "bear-put-spread", label: "Bear put spread", hint: "Buy the ATM put, sell the 30-delta put" },
  { key: "iron-condor", label: "Iron condor", hint: "Sell the 25-delta strangle, buy 10-delta wings" },
  { key: "iron-fly", label: "Iron fly", hint: "Sell the ATM straddle, buy 15-delta wings" },
]

/** The out-of-the-money strike whose |delta| is closest to the target. */
function byDelta(rows: LiveRow[], type: OptionType, target: number, atm: number): LiveRow {
  const otm = rows.filter((r) => (type === "CE" ? r.strike >= atm : r.strike <= atm))
  let best = otm[0] ?? rows[0]!
  for (const r of otm) {
    if (Math.abs(Math.abs(quoteOf(r, type).delta) - target) < Math.abs(Math.abs(quoteOf(best, type).delta) - target)) best = r
  }
  return best
}

/** A strike at least `steps` strikes further out than `from`. */
function beyond(rows: LiveRow[], row: LiveRow, from: number, steps: number, type: OptionType, step: number): LiveRow {
  const min = type === "CE" ? from + steps * step : from - steps * step
  const ok = type === "CE" ? row.strike >= min : row.strike <= min
  return ok ? row : (rows.find((r) => r.strike === min) ?? row)
}

export function buildPreset(key: PresetKey, chain: LiveChain): StrategyLeg[] {
  const { rows, atm, step } = chain
  const expiry = chain.expiry.getTime()
  const atmRow = rows.find((r) => r.strike === atm) ?? rows[Math.floor(rows.length / 2)]!
  const leg = (row: LiveRow, type: OptionType, side: Side): StrategyLeg => {
    const q = quoteOf(row, type)
    return { id: nextId(), type, side, strike: row.strike, lots: 1, entry: q.ltp, iv: q.iv, expiry }
  }
  const call = (delta: number, from = atm, min = 1) => beyond(rows, byDelta(rows, "CE", delta, atm), from, min, "CE", step)
  const put = (delta: number, from = atm, min = 1) => beyond(rows, byDelta(rows, "PE", delta, atm), from, min, "PE", step)

  switch (key) {
    case "long-straddle":
      return [leg(atmRow, "CE", "BUY"), leg(atmRow, "PE", "BUY")]
    case "short-strangle":
      return [leg(put(0.25), "PE", "SELL"), leg(call(0.25), "CE", "SELL")]
    case "bull-call-spread":
      return [leg(atmRow, "CE", "BUY"), leg(call(0.3), "CE", "SELL")]
    case "bear-put-spread":
      return [leg(atmRow, "PE", "BUY"), leg(put(0.3), "PE", "SELL")]
    case "iron-condor": {
      const sp = put(0.25)
      const sc = call(0.25)
      return [leg(put(0.1, sp.strike), "PE", "BUY"), leg(sp, "PE", "SELL"), leg(sc, "CE", "SELL"), leg(call(0.1, sc.strike), "CE", "BUY")]
    }
    case "iron-fly":
      return [leg(put(0.15, atm, 2), "PE", "BUY"), leg(atmRow, "PE", "SELL"), leg(atmRow, "CE", "SELL"), leg(call(0.15, atm, 2), "CE", "BUY")]
  }
}

// ------------------------------------------------------------------ payoff

function byExpiry(legs: StrategyLeg[]): Map<number, StrategyLeg[]> {
  const groups = new Map<number, StrategyLeg[]>()
  for (const l of legs) groups.set(l.expiry, [...(groups.get(l.expiry) ?? []), l])
  return groups
}

function sum(into: number[], add: number[]): void {
  for (let i = 0; i < into.length; i++) into[i] += add[i]
}

/** P&L in rupees at the nearest leg expiry, for each spot. Later legs keep their time value. */
export function expiryPnl(legs: StrategyLeg[], lot: number, spots: number[]): number[] {
  const out = spots.map(() => 0)
  if (legs.length === 0) return out
  const first = Math.min(...legs.map((l) => l.expiry))
  for (const [exp, group] of byExpiry(legs)) {
    sum(out, exp === first ? payoff(group, lot, spots, 0).atExpiry : payoff(group, lot, spots, (exp - first) / YEAR_MS).today)
  }
  return out
}

/** P&L in rupees today (T+0), for each spot. */
export function todayPnl(legs: StrategyLeg[], lot: number, spots: number[], nowMs: number): number[] {
  const out = spots.map(() => 0)
  for (const [exp, group] of byExpiry(legs)) sum(out, payoff(group, lot, spots, Math.max(0, (exp - nowMs) / YEAR_MS)).today)
  return out
}

/**
 * Price range for the payoff chart: the strikes and a stable centre, padded by
 * about 2.5 standard deviations to the nearest expiry. Rounded to whole pairs
 * of strikes so it holds still while the spot ticks.
 */
export function payoffRange(strikes: number[], centre: number, spot: number, step: number, sd: number): [number, number] {
  const unit = 2 * step
  const pad = Math.max(3 * step, Math.ceil((2.5 * sd) / unit) * unit, Math.ceil((centre * 0.015) / unit) * unit)
  let lo = Math.floor((Math.min(centre, ...strikes) - pad) / step) * step
  let hi = Math.ceil((Math.max(centre, ...strikes) + pad) / step) * step
  if (spot < lo + step) lo = Math.floor((spot - 2 * step) / step) * step
  if (spot > hi - step) hi = Math.ceil((spot + 2 * step) / step) * step
  return [Math.max(step, lo), hi]
}

/** x-values for the chart: an even grid plus every strike, so the expiry kinks are exact. */
export function chartSpots(lo: number, hi: number, strikes: number[], n = 180): number[] {
  const xs = Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n)
  for (const k of strikes) if (k > lo && k < hi) xs.push(k)
  return [...new Set(xs)].sort((a, b) => a - b)
}

// ------------------------------------------------------------------ summary

export interface StrategyMetrics {
  /** Positive when the strategy collects premium. */
  netPremium: number
  /** Infinity when unlimited. */
  maxProfit: number
  /** Negative; −Infinity when unlimited. */
  maxLoss: number
  breakevens: number[]
  rewardRisk: number | null
  /** Chance of finishing in profit at the nearest expiry, 0–1, lognormal at ATM IV. */
  pop: number | null
  margin: number
  pnlNow: number
  greeks: { delta: number; gamma: number; theta: number; vega: number }
}

export function strategyMetrics(
  legs: StrategyLeg[],
  { lot, spot, nowMs, atmIv, isIndex }: { lot: number; spot: number; nowMs: number; atmIv: number; isIndex: boolean },
): StrategyMetrics {
  const sign = (l: StrategyLeg) => (l.side === "BUY" ? 1 : -1)
  const netPremium = legs.reduce((s, l) => s - sign(l) * l.entry * l.lots * lot, 0)
  const strikes = legs.map((l) => l.strike)
  const hi = Math.max(spot, ...strikes)
  const xs = chartSpots(spot * 0.02, hi * 2, strikes, 900)
  xs.push(hi * 4)
  const pnl = expiryPnl(legs, lot, xs)

  // Above the highest strike only calls matter: their net quantity is the slope.
  const slopeUp = legs.reduce((s, l) => s + (l.type === "CE" ? sign(l) * l.lots : 0), 0)
  const maxProfit = slopeUp > 0 ? Infinity : Math.max(...pnl)
  const maxLoss = slopeUp < 0 ? -Infinity : Math.min(...pnl)

  const breakevens: number[] = []
  const first = Math.min(...legs.map((l) => l.expiry))
  const T = Math.max((first - nowMs) / YEAR_MS, 1e-6)
  const sigma = Math.max(atmIv, 1) / 100
  const F = spot * Math.exp(RISK_FREE * T)
  const cdf = (x: number) => normCdf((Math.log(x / F) + 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T)))
  let pop = 0
  for (let i = 1; i < xs.length; i++) {
    const [x0, x1, v0, v1] = [xs[i - 1]!, xs[i]!, pnl[i - 1]!, pnl[i]!]
    if ((v0 < 0 && v1 > 0) || (v0 > 0 && v1 < 0)) {
      const be = x0 + ((0 - v0) * (x1 - x0)) / (v1 - v0)
      breakevens.push(be)
      pop += v0 > 0 ? cdf(be) - cdf(x0) : cdf(x1) - cdf(be)
    } else if (v0 + v1 > 0) {
      pop += cdf(x1) - cdf(x0)
    }
  }
  if (pnl.at(-1)! > 0) pop += 1 - cdf(xs.at(-1)!)

  const rewardRisk = Number.isFinite(maxProfit) && Number.isFinite(maxLoss) && maxLoss < 0 && maxProfit > 0 ? maxProfit / -maxLoss : null

  const greeks = { delta: 0, gamma: 0, theta: 0, vega: 0 }
  for (const l of legs) {
    const t = Math.max(0, (l.expiry - nowMs) / YEAR_MS)
    const g = black76(l.type, spot * Math.exp(RISK_FREE * t), l.strike, t, l.iv / 100, RISK_FREE)
    const qty = sign(l) * l.lots * lot
    greeks.delta += g.delta * qty
    greeks.gamma += g.gamma * qty
    greeks.theta += g.theta * qty
    greeks.vega += g.vega * qty
  }

  return {
    netPremium,
    maxProfit,
    maxLoss,
    breakevens: breakevens.filter((b) => b > spot * 0.3 && b < spot * 3),
    rewardRisk,
    pop: legs.length ? Math.min(1, Math.max(0, pop)) : null,
    margin: approxMargin(legs, lot, spot, isIndex) + Math.max(0, -netPremium),
    pnlNow: todayPnl(legs, lot, [spot], nowMs)[0]!,
    greeks,
  }
}

/** Rate applied to the notional of an unhedged short option. */
export function shortMarginRate(isIndex: boolean): number {
  return isIndex ? 0.12 : 0.2
}

/**
 * A rough SPAN-style figure: an unhedged short costs a flat share of notional;
 * a short covered by a long of the same type (same or later expiry) costs the
 * spread width at most. The larger side counts in full, the other at 10%,
 * since calls and puts cannot both finish deep in the money.
 */
export function approxMargin(legs: StrategyLeg[], lot: number, spot: number, isIndex: boolean): number {
  const naked = shortMarginRate(isIndex) * spot * lot
  const side = (type: OptionType) => {
    const units = (s: Side) =>
      legs.filter((l) => l.type === type && l.side === s).flatMap((l) => Array.from({ length: l.lots }, () => l))
    const longs = units("BUY")
    let total = 0
    for (const short of units("SELL")) {
      const width = (long: StrategyLeg) => Math.max(0, type === "CE" ? long.strike - short.strike : short.strike - long.strike) * lot
      let pick = -1
      longs.forEach((long, i) => {
        if (long.expiry >= short.expiry && (pick < 0 || width(long) < width(longs[pick]!))) pick = i
      })
      if (pick >= 0) {
        total += Math.min(naked, width(longs[pick]!))
        longs.splice(pick, 1)
      } else {
        total += naked
      }
    }
    return total
  }
  const ce = side("CE")
  const pe = side("PE")
  return Math.max(ce, pe) + 0.1 * Math.min(ce, pe)
}
