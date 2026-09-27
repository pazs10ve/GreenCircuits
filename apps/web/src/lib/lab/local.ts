"use client"

import { useSyncExternalStore } from "react"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { RunDetail, RunInfo, RunSummary, RunTrade } from "@greencircuits/contracts/lab"
import type { BacktestRequest } from "@greencircuits/contracts/strategy"
import { BENCHMARK_ID, ENGINE_VERSION, WARMUP_DAYS, backtest, epochOf, instrumentsOf, isoDate, seriesFromCandles } from "@greencircuits/backtest/engine"
import { downsample } from "@greencircuits/backtest/metrics"
import { getInstrument } from "@greencircuits/market/catalog"
import { dailyCandles } from "@greencircuits/market/history"
import type { Candle } from "@greencircuits/market/types"
import { plainStorage } from "@/lib/stores/persist"

/**
 * The lab when the backend is off (ADR 0005): the TypeScript engine runs in
 * the browser over the same generated history the database is seeded with,
 * and runs are kept in this browser. Golden files keep this engine and the
 * server's Python one giving the same results.
 */

const MAX_RUNS = 20
/** Chart points kept per run: plenty for the chart, and small enough for localStorage. */
const MAX_POINTS = 600

// The history lengths the database is seeded with (packages/db/src/seed/market-data.ts).
const sessionsFor = (id: number) => (getInstrument(id)?.kind === "INDEX" ? 2520 : 1260)

const histories = new Map<string, Candle[]>()
/** An instrument's daily history as the database is seeded with it, memoised per IST day. */
export function historyOf(id: number, now: Date): Candle[] {
  const key = `${id}:${new Date(now.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)}`
  let candles = histories.get(key)
  if (!candles) {
    candles = dailyCandles(getInstrument(id)!, sessionsFor(id), now)
    histories.set(key, candles)
  }
  return candles
}

/** Trades are stamped at the 09:15 IST open, like the server's. */
const atOpen = (t: number) => `${isoDate(t)}T03:45:00.000Z`

export function runInBrowser(request: BacktestRequest, now = new Date()): RunDetail {
  const d = request.definition
  const ids = [...new Set([...instrumentsOf(d), BENCHMARK_ID])].sort((a, b) => a - b)
  const from = epochOf(request.from)
  const candles = new Map(ids.map((id) => [id, historyOf(id, now)]))
  const data = seriesFromCandles(candles, ids, from - WARMUP_DAYS * 86_400, epochOf(request.to))
  const lastDate = data.get(ids[0]!)?.dates.at(-1)
  const started = new Date()
  const run: RunInfo = {
    id: crypto.randomUUID(),
    name: request.name,
    strategy_version: 1,
    definition: d,
    status: "SUCCEEDED",
    progress_pct: 100,
    queued_at: started.toISOString(),
    started_at: started.toISOString(),
    finished_at: null,
    date_from: request.from,
    date_to: request.to,
    initial_capital: request.capital,
    slippage_bps: request.slippageBps,
    error: null,
    engine_version: ENGINE_VERSION,
    data_version: lastDate ? isoDate(lastDate) : request.to,
  }
  try {
    const { result, trades } = backtest(d, data, from, request.capital, request.slippageBps)
    const keep = downsample(result.equity_sample.length, MAX_POINTS)
    const runTrades: RunTrade[] = trades.map((t, i) => ({
      trade_no: i + 1,
      instrument_id: t.instrumentId,
      side: t.side,
      quantity: t.quantity,
      entry_at: atOpen(t.entryAt),
      entry_price: t.entryPrice,
      exit_at: t.exitAt == null ? null : atOpen(t.exitAt),
      exit_price: t.exitPrice,
      charges: t.charges,
      pnl: t.pnl,
      exit_reason: t.exitReason,
    }))
    return {
      run: { ...run, finished_at: new Date().toISOString() },
      result: { ...result, equity_sample: keep.map((k) => result.equity_sample[k]!) },
      trades: runTrades,
    }
  } catch (err) {
    return { run: { ...run, status: "FAILED", finished_at: new Date().toISOString(), error: (err as Error).message }, result: null, trades: [] }
  }
}

interface LocalRuns {
  runs: RunDetail[]
  add: (run: RunDetail) => void
  remove: (id: string) => void
}

export const useLocalRuns = create<LocalRuns>()(
  persist(
    (set) => ({
      runs: [],
      add: (run) => set((s) => ({ runs: [run, ...s.runs].slice(0, MAX_RUNS) })),
      remove: (id) => set((s) => ({ runs: s.runs.filter((r) => r.run.id !== id) })),
    }),
    { name: "gc-lab-runs", version: 1, storage: plainStorage, skipHydration: true, partialize: (s) => ({ runs: s.runs }) },
  ),
)

/** Whether the stored runs have been loaded (they load after mount, like every persisted store). */
export function useLocalRunsReady(): boolean {
  return useSyncExternalStore(
    (onChange) => useLocalRuns.persist.onFinishHydration(onChange),
    () => useLocalRuns.persist.hasHydrated(),
    () => false,
  )
}

export function summaryOf({ run, result }: RunDetail): RunSummary {
  return { ...run, metrics: result?.metrics ?? null }
}
