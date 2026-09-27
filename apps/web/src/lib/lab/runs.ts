import { SAMPLE_STRATEGIES, getStrategy, type Strategy } from "@greencircuits/market/lab"
import { formatNumber } from "@greencircuits/market/format"
import { addDays, istDateKey, keyToDate, sessionsBetween } from "./dates"
import { shortId } from "./report"

/**
 * Sample run records in the shape of lab.backtest_run. Real ones come from the
 * API; status moves QUEUED → RUNNING (with progress) → SUCCEEDED or FAILED as
 * the Python worker consumes the BullMQ "backtests" queue (ADR 0001).
 */

export type RunStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED"

export interface RunRow {
  id: string
  strategyId: string
  strategyName: string
  version: number
  status: RunStatus
  progress?: number
  position?: number
  error?: string
  interval: string
  from: number
  to: number
  durationMs?: number
  submittedAt: number
}

/** Free-plan limits and the queue as a new run would find it. Sample values. */
export const USAGE = {
  plan: "Free",
  priority: 10,
  backtestsToday: 7,
  backtestsLimit: 20,
  computeMinutes: 38.5,
  computeLimit: 120,
  jobsAhead: 1,
  waitSeconds: 20,
  workersBusy: 3,
  workers: 4,
} as const

/** What the worker loads for each sample strategy, for the run log and the run details panel. */
export function runProfile(strategy: Strategy, from: number, to: number) {
  const sessions = sessionsBetween(istDateKey(from), istDateKey(to))
  const profile: Record<string, { symbols: number; perSession: number; table: string; universe: string }> = {
    "rsi-dip": { symbols: 200, perSession: 1, table: "md.candle_1d", universe: "NIFTY 200 as of each date" },
    "breakout-52w": { symbols: 500, perSession: 1, table: "md.candle_1d", universe: "NIFTY 500 as of each date" },
    "straddle-0920": { symbols: 4, perSession: 15, table: "md.option_candle_5m", universe: "NIFTY ATM strikes on each expiry day" },
    "sector-rotation": { symbols: 12, perSession: 1, table: "md.candle_1d", universe: "Nifty sector indices" },
  }
  const p = profile[strategy.id] ?? profile["rsi-dip"]!
  const bars = Math.round((sessions * p.perSession * p.symbols) / 100) * 100
  const seconds = 0.15 + p.symbols * 0.02 + bars / 100_000
  const indicators = Array.from(new Set([...`${strategy.entry} ${strategy.exit}`.matchAll(/(\w+)\((?:close|high|delivery_pct|volume)?,?\s*(\d+)?/g)].map((m) => (m[2] ? `${m[1]}(${m[2]})` : m[1]!))))
  return { ...p, sessions, bars, seconds, indicators }
}

/** Log lines streamed while a run is in progress, keyed by the progress % at which they appear. */
export function runLog(strategy: Strategy, from: number, to: number, trades: number, runId: string): { at: number; text: string }[] {
  const p = runProfile(strategy, from, to)
  return [
    { at: 0, text: `Claimed job ${runId} on bt-worker-2 · attempt 1 of 2` },
    { at: 3, text: `Loading ${formatNumber(p.bars, 0)} bars from ${p.table}…` },
    { at: 16, text: `Point-in-time universe: ${p.universe}` },
    { at: 26, text: `Indicators precomputed with polars: ${p.indicators.slice(0, 4).join(", ") || "time and expiry calendar"}` },
    { at: 34, text: "Simulating fills at next bar open…" },
    { at: 74, text: strategy.style === "OPTIONS" ? "Applying costs: brokerage, STT on premium, exchange and SEBI fees, stamp duty, GST…" : "Applying costs: STT, stamp duty, exchange and SEBI fees, GST, 5 bps slippage…" },
    { at: 88, text: "Computing metrics…" },
    { at: 96, text: `Writing ${formatNumber(trades, 0)} trades and a 2,000-point equity sample` },
  ]
}

export function recentRuns(now: Date): RunRow[] {
  const t = now.getTime()
  const min = 60_000
  const byId = (id: string) => getStrategy(id) ?? SAMPLE_STRATEGIES[0]!
  const yesterday = keyToDate(addDays(istDateKey(now), -1)).getTime()
  const from = Date.UTC(2016, 0, 1)
  const row = (
    id: string,
    version: number,
    status: RunStatus,
    ago: number,
    extra: Partial<RunRow> = {},
  ): RunRow => {
    const s = byId(id)
    return {
      id: shortId(`${id}:${version}:${ago}`),
      strategyId: s.id,
      strategyName: s.name,
      version,
      status,
      interval: s.interval,
      from,
      to: yesterday,
      submittedAt: t - ago * min,
      ...extra,
    }
  }
  return [
    row("sector-rotation", 1, "QUEUED", 0.4, { position: 1 }),
    row("breakout-52w", 5, "RUNNING", 1, { progress: 64 }),
    row("rsi-dip", 3, "SUCCEEDED", 42, { durationMs: 5_140 }),
    row("straddle-0920", 2, "FAILED", 176, {
      durationMs: 2_310,
      error: "Data gap: no 5-minute option bars for the 7 Mar 2019 expiry. Narrow the range to 2019-04 onwards.",
    }),
    row("breakout-52w", 4, "SUCCEEDED", 214, { durationMs: 21_870 }),
    row("rsi-dip", 3, "CANCELLED", 251),
    row("straddle-0920", 1, "SUCCEEDED", 318, { durationMs: 3_920 }),
    row("sector-rotation", 1, "SUCCEEDED", 1_496, { durationMs: 1_080 }),
  ]
}
