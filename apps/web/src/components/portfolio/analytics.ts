import { INDEX, getInstrument } from "@greencircuits/market/catalog"
import { dailyCandles } from "@greencircuits/market/history"
import type { Candle, Point } from "@greencircuits/market/types"
import type { Holding } from "@/lib/stores/portfolio"

/** The demo generators' daily bars; in live mode the portfolio view passes the API's instead. */
export const demoBars = (id: number, days: number): Candle[] | undefined => {
  const inst = getInstrument(id)
  return inst ? dailyCandles(inst, days) : undefined
}

/**
 * "If you had held today's portfolio for the past year": value of the current
 * holdings on each of the Nifty 50's last `days` sessions, against the Nifty
 * scaled to the same starting value. A stock without a bar on a day counts at
 * its last close before it.
 */
export function holdingsHistory(
  holdings: Holding[],
  barsOf: (id: number, days: number) => Candle[] | undefined = demoBars,
  days = 250,
): { equity: Point[]; benchmark: Point[]; drawdown: Point[] } | null {
  const nifty = barsOf(INDEX.NIFTY, days)
  const series = holdings.flatMap((h) => {
    const candles = barsOf(h.instrumentId, days)
    return candles?.length ? [{ h, candles }] : []
  })
  if (series.length === 0 || !nifty?.length) return null
  // Start where every holding has a price: sources can differ by a day or two on which sessions they list.
  const first = Math.max(...series.map((x) => x.candles[0]!.time))
  const index = nifty.filter((c) => c.time >= first)
  if (index.length < 2) return null
  const times = index.map((c) => c.time)
  const cursor = series.map(() => 0)
  const values = times.map((t) =>
    series.reduce((s, x, k) => {
      while (cursor[k]! + 1 < x.candles.length && x.candles[cursor[k]! + 1]!.time <= t) cursor[k]!++
      const bar = x.candles[cursor[k]!]!
      return s + x.h.qty * (bar.time <= t ? bar.close : 0)
    }, 0),
  )
  if (!(values[0]! > 0)) return null
  const scale = values[0]! / index[0]!.close
  let peak = 0
  return {
    equity: times.map((t, i) => ({ time: t, value: values[i]! })),
    benchmark: index.map((c) => ({ time: c.time, value: c.close * scale })),
    drawdown: values.map((v, i) => {
      peak = Math.max(peak, v)
      return { time: times[i]!, value: (v / peak - 1) * 100 }
    }),
  }
}

/** Weighted beta of the holdings: against the Nifty over the last year with real data, the simulator's market factor in the demo. */
export function portfolioBeta(holdings: Holding[], priceOf: (id: number) => number, betaOf: (id: number) => number | null | undefined = () => null): number {
  let total = 0
  let weighted = 0
  for (const h of holdings) {
    const inst = getInstrument(h.instrumentId)
    if (!inst) continue
    const value = h.qty * priceOf(h.instrumentId)
    total += value
    weighted += value * (betaOf(h.instrumentId) ?? inst.beta)
  }
  return total > 0 ? weighted / total : 0
}
