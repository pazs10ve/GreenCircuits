import { LISTED_FUNDS } from "@greencircuits/market/catalog"
import { dailyCandles } from "@greencircuits/market/history"
import type { Universe } from "@/lib/data/universe"

/** What a listed fund's row needs besides its live quote. */
export interface FundStatic {
  id: number
  /** The last 30 closes, oldest first. */
  spark: number[]
  low52: number
  high52: number
  /** The close a year back, for the year's return; null with less history. */
  yearAgo: number | null
}

/** Sparklines, 52-week ranges and year-ago closes for every ETF, REIT and InvIT: from the API, else the demo's history. */
export function listedFundStatics(universe: Universe | null): FundStatic[] {
  if (universe) {
    const rows = new Map(universe.instruments.map((r) => [r.id, r]))
    return LISTED_FUNDS.flatMap((f) => {
      const r = rows.get(f.id)
      return r ? [{ id: f.id, spark: r.spark, low52: r.low52, high52: r.high52, yearAgo: r.yearAgo ?? null }] : []
    })
  }
  return LISTED_FUNDS.map((f) => {
    const bars = dailyCandles(f, 251)
    const year = bars.slice(-250)
    return {
      id: f.id,
      spark: bars.slice(-30).map((c) => c.close),
      low52: Math.min(...year.map((c) => c.low)),
      high52: Math.max(...year.map((c) => c.high)),
      yearAgo: bars[0]!.close,
    }
  })
}
