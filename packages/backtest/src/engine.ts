import type { AlternativeKind, EquityPoint, RunMetrics, RunResult, Summary } from "@greencircuits/contracts/lab"
import type { StrategyDefinition } from "@greencircuits/contracts/strategy"
import type { Candle } from "@greencircuits/market/types"
import { downsample, drawdownSeries, monthlyReturns, summarise } from "./metrics"
import { pyRound } from "./numeric"
import { simulateDeposit, simulateHold, simulateRebalance, simulateRules, simulateSip, timeWeighted, type Series, type SimResult, type Trade } from "./simulate"

/**
 * One backtest, as in pipelines/.../lab/engine.py (`backtest`): the same
 * start date, the same alternative, the same metrics and chart samples. The
 * golden-file test in this package runs both engines' outputs side by side.
 */

export const ENGINE_VERSION = "ts-0.4"
export const BENCHMARK_ID = 1 // Nifty 50
export const WARMUP_DAYS = 420
export const OUT_OF_SAMPLE_SHARE = 0.3
export const DEPOSIT_RATE_PCT = 7

export const isoDate = (t: number) => new Date(t * 1000).toISOString().slice(0, 10)
export const epochOf = (date: string) => Date.parse(`${date}T00:00:00Z`) / 1000

export function instrumentsOf(d: StrategyDefinition): number[] {
  return d.type === "rules" ? [...d.universe] : [d.instrumentId]
}

/**
 * Daily bars for each instrument on one shared calendar, between `from` and `to`
 * (unix seconds), forward-filling gaps. Before an instrument's first bar its prices
 * are NaN, so indicators and the start date skip it.
 */
export function seriesFromCandles(candles: Map<number, Candle[]>, ids: number[], from: number, to: number): Map<number, Series> {
  const within = new Map(ids.map((id) => [id, (candles.get(id) ?? []).filter((c) => c.time >= from && c.time <= to)]))
  const dates = [...new Set([...within.values()].flatMap((cs) => cs.map((c) => c.time)))].sort((a, b) => a - b)
  const index = new Map(dates.map((t, k) => [t, k]))
  const out = new Map<number, Series>()
  for (const id of ids) {
    const s: Series = { dates, open: dates.map(() => NaN), high: dates.map(() => NaN), low: dates.map(() => NaN), close: dates.map(() => NaN) }
    for (const c of within.get(id)!) {
      const k = index.get(c.time)!
      s.open[k] = c.open
      s.high[k] = c.high
      s.low[k] = c.low
      s.close[k] = c.close
    }
    for (let k = 1; k < dates.length; k++) {
      if (Number.isNaN(s.close[k])) {
        const prev = s.close[k - 1]!
        s.open[k] = prev
        s.high[k] = prev
        s.low[k] = prev
        s.close[k] = prev
      }
    }
    out.set(id, s)
  }
  return out
}

/** What a strategy is judged against; see alternative() in the Python engine. */
export function alternative(d: StrategyDefinition, data: Map<number, Series>, ids: number[], start: number, capital: number): [AlternativeKind, SimResult] {
  if (d.type === "sip") {
    if (d.dip) return ["plain_sip", simulateSip(data.get(ids[0]!)!, start, d.monthly)]
    if (ids[0] !== BENCHMARK_ID) return ["sip_in_benchmark", simulateSip(data.get(BENCHMARK_ID)!, start, d.monthly)]
    return ["deposit", simulateDeposit(data.get(ids[0]!)!.dates, start, d.monthly, DEPOSIT_RATE_PCT)]
  }
  if (d.type === "rebalance") return ["all_equity", simulateRebalance(data.get(ids[0]!)!, start, capital, 100, 0)]
  return ["buy_and_hold", simulateHold(new Map(ids.map((i) => [i, data.get(i)!])), start, capital, d.costs === "DELIVERY")]
}

/** JSON has no NaN or infinity: the Python engine stores them as null, and so does this one. */
function finite<T>(obj: T): T {
  if (typeof obj === "number") return (Number.isFinite(obj) ? obj : null) as T
  if (obj && typeof obj === "object") return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, finite(v)])) as T
  return obj
}

export interface Backtest {
  result: RunResult
  trades: Trade[]
}

export function backtest(d: StrategyDefinition, data: Map<number, Series>, dateFrom: number, capital: number, slippageBps: number): Backtest {
  const ids = instrumentsOf(d)
  const dates = data.get(ids[0]!)!.dates
  // Start on the requested date, or later if an instrument (or the benchmark) has no prices yet.
  const firsts = [...data.values()].map((s) => s.close.findIndex((v) => !Number.isNaN(v))).filter((k) => k >= 0)
  const firstValid = Math.max(...firsts)
  const start = dates.findIndex((t, k) => t >= dateFrom && k >= firstValid)
  if (start === -1 || dates.length - start < 20) throw new Error("Not enough price history in the chosen date range")

  let sim: SimResult
  if (d.type === "sip") sim = simulateSip(data.get(ids[0]!)!, start, d.monthly, d.dip)
  else if (d.type === "rebalance") sim = simulateRebalance(data.get(ids[0]!)!, start, capital, d.equityPct, d.bondRatePct)
  else sim = simulateRules(new Map(ids.map((i) => [i, data.get(i)!])), start, d, capital, slippageBps)
  for (const tr of sim.trades) if (tr.instrumentId === 0) tr.instrumentId = ids[0]!

  const rets = timeWeighted(sim.values, sim.flows)
  const retDates = sim.dates.slice(1)
  const base = sim.extra.invested ?? capital
  const split = Math.trunc(retDates.length * (1 - OUT_OF_SAMPLE_SHARE))
  const oosFrom = retDates[split]!

  const [kind, alt] = alternative(d, data, ids, start, capital)
  const altRets = timeWeighted(alt.values, alt.flows)
  const altBase = alt.extra.invested ?? capital
  const alternativeMetrics = {
    ...summarise(altRets, retDates),
    kind,
    final_value: alt.values.at(-1)!,
    total_return: altBase ? alt.values.at(-1)! / altBase - 1 : 0,
    in_sample: summarise(altRets.slice(0, split), retDates.slice(0, split)),
    out_of_sample: summarise(altRets.slice(split), retDates.slice(split)),
    ...(alt.extra.xirr != null ? { xirr: alt.extra.xirr } : {}),
  }

  const metrics = {
    ...summarise(rets, retDates),
    ...sim.extra,
    final_value: sim.values.at(-1)!,
    effective_from: isoDate(sim.dates[0]!),
    total_return: base ? sim.values.at(-1)! / base - 1 : 0,
    in_sample: summarise(rets.slice(0, split), retDates.slice(0, split)),
    out_of_sample: summarise(rets.slice(split), retDates.slice(split)),
    alternative: alternativeMetrics,
  } as RunMetrics

  const bench = data.get(BENCHMARK_ID)!.close.slice(start)
  const benchValues = bench.map((v) => (capital * v) / bench[0]!)
  const benchRets = bench.slice(1).map((v, i) => v / bench[i]! - 1)
  const benchmark = { ...summarise(benchRets, retDates), instrument_id: BENCHMARK_ID } as Summary & { instrument_id: number }

  // The report's chart: the account (v) against the alternative (a); money put in (inv) for a
  // SIP, otherwise the benchmark on the same capital (b). Drawdowns are time-weighted.
  const growth = [1]
  for (const r of rets) growth.push(growth.at(-1)! * (1 + r))
  const dd = drawdownSeries(growth)
  const isSip = d.type === "sip"
  let invested = 0
  const investedSoFar = sim.flows.map((f) => (invested += f))
  const sample: EquityPoint[] = downsample(sim.dates.length).map((k) => ({
    t: sim.dates[k]!,
    v: pyRound(sim.values[k]!, 2),
    a: pyRound(alt.values[k]!, 2),
    dd: pyRound(dd[k]!, 6),
    ...(isSip ? { inv: pyRound(investedSoFar[k]!, 2) } : { b: pyRound(benchValues[k]!, 2) }),
  }))

  return {
    result: {
      metrics: finite(metrics),
      oos_from: isoDate(oosFrom),
      equity_sample: sample,
      monthly_returns: monthlyReturns(rets, retDates),
      benchmark: finite(benchmark),
    },
    trades: sim.trades,
  }
}
