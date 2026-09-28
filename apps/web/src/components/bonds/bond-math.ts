import { bondPrice, type Bond } from "@greencircuits/market/reference"

/**
 * Bond arithmetic for the calculator. Coupon bonds use the data layer's
 * bondPrice (whole coupon periods, no accrued interest, so the result is the
 * clean price on a coupon date). T-Bills (frequency 0) use RBI's simple
 * discount formula: price = 100 / (1 + yield × days / 365).
 */

/**
 * A bond as the page passes it to client components: years left computed once,
 * on the server. Real bonds that didn't trade today have no fresh yield.
 */
export type BondRow = Omit<Bond, "price" | "ytm"> & {
  id: string
  /** Per ₹100 of face value (a gold bond's per gram); null without a price. */
  price: number | null
  ytm: number | null
  yearsLeft: number
  /** Whether the price is from today's trading; a price that isn't may be weeks old. */
  fresh: boolean
  /** Gold bonds: what a gram cost at issue. */
  issuePrice?: number
}

export const FREQUENCY_LABEL: Record<number, string> = {
  0: "Discount",
  1: "Annual",
  2: "Semi-annual",
  4: "Quarterly",
  12: "Monthly",
}

export interface BondMetrics {
  /** Clean price per ₹100 face value. */
  price: number
  /** Coupon payments left (0 for a T-Bill). */
  periods: number
  /** Weighted average time to the cash flows, in years. */
  macaulay: number
  /** % price change for a 1-point (100 bp) move in yield, roughly. */
  modified: number
  convexity: number
  /** ₹ change in price per ₹100 face for a 1 bp move. */
  pv01: number
  /** Annual coupon ÷ price, %. Null for zero-coupon instruments. */
  currentYield: number | null
}

export function priceAt(coupon: number, ytm: number, years: number, frequency: number): number {
  if (frequency === 0) return 100 / (1 + (ytm / 100) * years)
  return bondPrice(coupon, ytm, years, frequency)
}

export function bondMetrics(coupon: number, ytm: number, years: number, frequency: number): BondMetrics {
  if (frequency === 0) {
    const y = ytm / 100
    const price = priceAt(0, ytm, years, 0)
    const modified = years / (1 + y * years)
    const convexity = (2 * years * years) / Math.pow(1 + y * years, 2)
    return { price, periods: 0, macaulay: years, modified, convexity, pv01: modified * price * 1e-4, currentYield: null }
  }
  const n = Math.max(1, Math.round(years * frequency))
  const c = coupon / frequency
  const y = ytm / 100 / frequency
  let pv = 0
  let timeWeighted = 0
  let curvature = 0
  for (let i = 1; i <= n; i++) {
    const cash = c + (i === n ? 100 : 0)
    const discounted = cash / Math.pow(1 + y, i)
    pv += discounted
    timeWeighted += (i / frequency) * discounted
    curvature += (cash * i * (i + 1)) / Math.pow(1 + y, i + 2)
  }
  const price = bondPrice(coupon, ytm, years, frequency)
  const macaulay = timeWeighted / pv
  const modified = macaulay / (1 + y)
  const convexity = curvature / (pv * frequency * frequency)
  return {
    price,
    periods: n,
    macaulay,
    modified,
    convexity,
    pv01: modified * price * 1e-4,
    currentYield: coupon > 0 ? (coupon / price) * 100 : null,
  }
}

export const YIELD_FLOOR = -5
export const YIELD_CAP = 60

/** Yield to maturity for a clean price, by bisection (price falls as yield rises). Null if outside −5% to 60%. */
export function yieldFromPrice(coupon: number, price: number, years: number, frequency: number): number | null {
  if (frequency === 0) {
    const y = ((100 / price - 1) / years) * 100
    return y >= YIELD_FLOOR && y <= YIELD_CAP ? y : null
  }
  let lo = YIELD_FLOOR
  let hi = YIELD_CAP
  const gap = (y: number) => priceAt(coupon, y, years, frequency) - price
  if (gap(lo) < 0 || gap(hi) > 0) return null
  for (let i = 0; i < 200 && hi - lo > 1e-10; i++) {
    const mid = (lo + hi) / 2
    if (gap(mid) > 0) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export interface RateShock {
  bp: number
  yield: number
  /** Full repricing at the shocked yield. */
  price: number
  changePct: number
  /** −modified duration × Δy: the straight-line estimate. */
  durationPct: number
}

export function rateShocks(coupon: number, ytm: number, years: number, frequency: number, moves = [-25, 25]): RateShock[] {
  const base = bondMetrics(coupon, ytm, years, frequency)
  return moves.map((bp) => {
    const y = ytm + bp / 100
    const price = priceAt(coupon, y, years, frequency)
    return {
      bp,
      yield: y,
      price,
      changePct: (price / base.price - 1) * 100,
      durationPct: -base.modified * (bp / 10000) * 100,
    }
  })
}
