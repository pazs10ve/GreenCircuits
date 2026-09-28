import type { Candle, Quote } from "@greencircuits/market/types"

/** A moment's day in IST, so bars from different feeds line up. */
const istDayOf = (unixSeconds: number) => Math.floor((unixSeconds + 5.5 * 3600) / 86_400)

/**
 * The exchange rate at any moment, from a currency's bars: the close of its
 * bar on the same day (or at the same time, intraday), else the last one
 * before it. Before its first bar, the first stands in.
 */
export function rateOn(rates: Candle[], intraday: boolean): (unixSeconds: number) => number | null {
  const key = intraday ? (t: number) => t : istDayOf
  const sorted = [...rates].sort((a, b) => a.time - b.time)
  const keys = sorted.map((c) => key(c.time))
  return (t) => {
    const k = key(t)
    let [lo, hi, found] = [0, keys.length - 1, -1]
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (keys[mid]! <= k) {
        found = mid
        lo = mid + 1
      } else hi = mid - 1
    }
    return found >= 0 ? sorted[found]!.close : (sorted[0]?.close ?? null)
  }
}

/** Bars in another currency and unit: each price divided by the rate on its day, times `factor` for the unit. */
export function barsIn(bars: Candle[], rate: (unixSeconds: number) => number | null, factor: number): Candle[] {
  return bars.flatMap((b) => {
    const r = rate(b.time)
    if (!r) return []
    const k = factor / r
    return [{ ...b, open: b.open * k, high: b.high * k, low: b.low * k, close: b.close * k }]
  })
}

/** A quote in another currency: today's prices at today's rate, and yesterday's close at yesterday's, so the day's move includes the currency's. */
export function quoteIn(q: Quote | undefined, fx: Quote | undefined, factor: number): Quote | undefined {
  if (!q || !fx || fx.ltp <= 0 || fx.prevClose <= 0) return undefined
  const now = factor / fx.ltp
  const ltp = q.ltp * now
  const prevClose = (q.prevClose * factor) / fx.prevClose
  const change = ltp - prevClose
  return {
    ...q,
    ltp,
    open: q.open * now,
    high: q.high * now,
    low: q.low * now,
    bid: q.bid * now,
    ask: q.ask * now,
    prevClose,
    change,
    changePct: prevClose ? (change / prevClose) * 100 : 0,
  }
}
