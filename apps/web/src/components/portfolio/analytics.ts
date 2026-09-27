import { INDEX, getInstrument } from "@greencircuits/market/catalog"
import { dailyCandles } from "@greencircuits/market/history"
import type { Point } from "@greencircuits/market/types"
import type { Holding } from "@/lib/stores/portfolio"

/**
 * "If you had held today's portfolio for the past year": value of the current
 * holdings on each of the last `days` sessions, against the Nifty 50 scaled to
 * the same starting value. Daily bars are deterministic, so this is stable.
 */
export function holdingsHistory(holdings: Holding[], days = 250): { equity: Point[]; benchmark: Point[]; drawdown: Point[] } | null {
  const series = holdings
    .map((h) => ({ h, inst: getInstrument(h.instrumentId) }))
    .filter((x) => x.inst)
    .map((x) => ({ h: x.h, candles: dailyCandles(x.inst!, days) }))
  if (series.length === 0) return null
  const times = series[0]!.candles.map((c) => c.time)
  const values = times.map((_, i) => series.reduce((s, x) => s + x.h.qty * (x.candles[i]?.close ?? 0), 0))
  const nifty = dailyCandles(getInstrument(INDEX.NIFTY)!, days)
  const scale = values[0]! / nifty[0]!.close
  let peak = 0
  return {
    equity: times.map((t, i) => ({ time: t, value: values[i]! })),
    benchmark: nifty.map((c) => ({ time: c.time, value: c.close * scale })),
    drawdown: values.map((v, i) => {
      peak = Math.max(peak, v)
      return { time: times[i]!, value: (v / peak - 1) * 100 }
    }),
  }
}

/** Weighted beta of the holdings against the market factor the simulator uses. */
export function portfolioBeta(holdings: Holding[], priceOf: (id: number) => number): number {
  let total = 0
  let weighted = 0
  for (const h of holdings) {
    const inst = getInstrument(h.instrumentId)
    if (!inst) continue
    const value = h.qty * priceOf(h.instrumentId)
    total += value
    weighted += value * inst.beta
  }
  return total > 0 ? weighted / total : 0
}
