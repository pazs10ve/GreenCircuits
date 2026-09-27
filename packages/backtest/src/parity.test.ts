import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { StrategyDefinition } from "@greencircuits/contracts/strategy"
import type { Candle } from "@greencircuits/market/types"
import { BENCHMARK_ID, WARMUP_DAYS, backtest, epochOf, instrumentsOf, isoDate, seriesFromCandles } from "./engine"

/**
 * The browser's engine against the Python engine, on the same frozen inputs.
 * expected.json is written by `python -m greencircuits.lab.parity --write`;
 * pipelines/tests/test_parity.py fails if it goes stale, so a change to either
 * engine shows up here until both agree again.
 */

const read = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"))

const candlesFile = read("candles.json") as { instruments: Record<string, [string, number, number, number, number][]> }
const cases = read("cases.json") as { name: string; definition: StrategyDefinition; from: string; to: string; capital: number; slippageBps: number }[]
const expected = read("expected.json") as { sample_every: number; cases: Record<string, unknown> }

const candles = new Map<number, Candle[]>(
  Object.entries(candlesFile.instruments).map(([id, bars]) => [Number(id), bars.map(([d, open, high, low, close]) => ({ time: epochOf(d), open, high, low, close, volume: 0 }))]),
)

/** Floats may differ in the last few bits (the two languages' pow() aren't identical); nothing else may. */
function differences(actual: unknown, want: unknown, path: string, out: string[]): string[] {
  if (typeof want === "number" && typeof actual === "number") {
    if (Math.abs(actual - want) > 1e-9 + 1e-7 * Math.abs(want)) out.push(`${path}: ${actual} != ${want}`)
  } else if (Array.isArray(want) && Array.isArray(actual)) {
    if (actual.length !== want.length) out.push(`${path}: ${actual.length} items, expected ${want.length}`)
    else want.forEach((w, i) => differences(actual[i], w, `${path}[${i}]`, out))
  } else if (want && typeof want === "object" && actual && typeof actual === "object") {
    const a = actual as Record<string, unknown>
    const w = want as Record<string, unknown>
    for (const k of new Set([...Object.keys(a), ...Object.keys(w)])) {
      if (!(k in w)) out.push(`${path}: unexpected ${k}`)
      else if (!(k in a)) out.push(`${path}: missing ${k}`)
      else differences(a[k], w[k], `${path}.${k}`, out)
    }
  } else if (actual !== want) {
    out.push(`${path}: ${JSON.stringify(actual)} != ${JSON.stringify(want)}`)
  }
  return out
}

describe("the TypeScript engine against the Python engine", () => {
  it("has a golden result for every case", () => {
    expect(Object.keys(expected.cases).sort()).toEqual(cases.map((c) => c.name).sort())
  })

  for (const c of cases) {
    it(c.name, () => {
      const ids = [...new Set([...instrumentsOf(c.definition), BENCHMARK_ID])].sort((a, b) => a - b)
      const from = epochOf(c.from)
      const data = seriesFromCandles(candles, ids, from - WARMUP_DAYS * 86_400, epochOf(c.to))
      const { result, trades } = backtest(c.definition, data, from, c.capital, c.slippageBps)
      const every = expected.sample_every
      const sample = result.equity_sample.filter((_, i) => i % every === 0)
      if ((result.equity_sample.length - 1) % every) sample.push(result.equity_sample.at(-1)!)
      const actual = {
        metrics: result.metrics,
        oos_from: result.oos_from,
        benchmark: result.benchmark,
        monthly_returns: result.monthly_returns,
        sample_length: result.equity_sample.length,
        sample,
        trades: trades.map((t) => ({
          instrument_id: t.instrumentId,
          side: t.side,
          quantity: t.quantity,
          entry_at: isoDate(t.entryAt),
          entry_price: t.entryPrice,
          exit_at: t.exitAt == null ? null : isoDate(t.exitAt),
          exit_price: t.exitPrice,
          charges: t.charges,
          pnl: t.pnl,
          exit_reason: t.exitReason,
        })),
      }
      expect(differences(actual, expected.cases[c.name], c.name, [])).toEqual([])
    })
  }
})
