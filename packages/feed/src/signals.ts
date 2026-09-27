import { conditionSeries, type Series } from "@greencircuits/backtest/simulate"
import { conditionText } from "@greencircuits/contracts/describe"
import type { StrategyDefinition } from "@greencircuits/contracts/strategy"
import type { Candle, Quote } from "@greencircuits/market/types"

/**
 * What your tested rules would do next. Each saved rules strategy is checked
 * against its stocks' daily bars with the latest price as the latest close,
 * the way the backtest reads a close; a stock that meets the entry rules would
 * be bought at the next open.
 */

type Rules = Extract<StrategyDefinition, { type: "rules" }>

export interface SavedRules {
  name: string
  runId: string
  definition: Rules
}

export interface Signal {
  strategy: string
  runId: string
  instrumentId: number
  /** The condition that was met, in words: "its 14-day RSI crosses below 30". */
  reason: string
}

/** 00:00 UTC on today's IST date, in unix seconds: the time daily bars are stamped with. */
export function istDay(nowMs: number): number {
  const ist = new Date(nowMs + 5.5 * 3600 * 1000)
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) / 1000
}

/**
 * Daily bars with the latest quote as the bar for its own session: today's
 * while the market trades, the last session's (replacing its stored bar) once
 * it has closed, so a weekend never gains a bar.
 */
export function withToday(candles: Candle[], quote: Quote | undefined): Series {
  const bars = candles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }))
  if (quote) {
    const time = istDay(quote.ts)
    const bar = { time, open: quote.open, high: quote.high, low: quote.low, close: quote.ltp }
    const last = bars.at(-1)
    if (!last || last.time < time) bars.push(bar)
    else if (last.time === time) bars[bars.length - 1] = bar
  }
  return { dates: bars.map((b) => b.time), open: bars.map((b) => b.open), high: bars.map((b) => b.high), low: bars.map((b) => b.low), close: bars.map((b) => b.close) }
}

export function entrySignals(rules: SavedRules[], history: (id: number) => Candle[], quote: (id: number) => Quote | undefined): Signal[] {
  const out: Signal[] = []
  for (const r of rules) {
    for (const id of r.definition.universe) {
      const s = withToday(history(id), quote(id))
      const last = s.dates.length - 1
      if (last < 2) continue
      const met = r.definition.entry.map((c) => conditionSeries(s, c)[last] === true)
      const fires = r.definition.entryLogic === "ANY" ? met.some(Boolean) : met.every(Boolean)
      if (fires) out.push({ strategy: r.name, runId: r.runId, instrumentId: id, reason: conditionText(r.definition.entry[met.indexOf(true)]!) })
    }
  }
  return out
}
