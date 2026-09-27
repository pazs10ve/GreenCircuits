import { describe, expect, it } from "vitest"
import type { Quote } from "@greencircuits/market/types"
import { fromWire, readSession, toWire } from "./index"
import { dataVersionOf, readDataVersion } from "./lab"
import { BacktestRequest, StrategyDefinition, TEMPLATES, templateDefinition } from "./strategy"

const quote: Quote = {
  id: 7,
  ltp: 1440.1500000001,
  open: 1432,
  high: 1445.5,
  low: 1430.05,
  prevClose: 1428.3,
  change: 11.85,
  changePct: 0.83,
  volume: 1_234_567,
  bid: 1440.1,
  ask: 1440.2,
  ts: 1_790_000_000_000,
  tickDir: 1,
}

describe("the quote wire format", () => {
  it("rounds away float noise and rebuilds the derived fields", () => {
    const back = fromWire(toWire(quote), { ...quote, ltp: 1439 })
    expect(back.ltp).toBe(1440.15)
    expect(back.change).toBeCloseTo(1440.15 - 1428.3, 9)
    expect(back.changePct).toBeCloseTo(((1440.15 - 1428.3) / 1428.3) * 100, 9)
    expect(back.tickDir).toBe(1)
    expect(back.volume).toBe(quote.volume)
    expect(back.ts).toBe(quote.ts)
  })

  it("has no direction without a previous quote", () => {
    expect(fromWire(toWire(quote)).tickDir).toBe(0)
  })
})

describe("backtest requests", () => {
  const base = { name: "RSI dip on Reliance", definition: templateDefinition("rsi-dip", 7), from: "2021-01-01", to: "2025-12-31" }

  it("fills in capital and slippage", () => {
    const r = BacktestRequest.parse(base)
    expect(r.capital).toBe(1_000_000)
    expect(r.slippageBps).toBe(5)
  })

  it("rejects a range that ends before it starts", () => {
    expect(BacktestRequest.safeParse({ ...base, from: "2025-01-01", to: "2024-01-01" }).success).toBe(false)
  })

  it("rejects rules with no way to exit", () => {
    expect(StrategyDefinition.safeParse({ ...templateDefinition("rsi-dip", 7), exit: {} }).success).toBe(false)
  })

  it("offers templates that validate", () => {
    for (const t of TEMPLATES) {
      expect(StrategyDefinition.safeParse(templateDefinition(t, 7, [7, 8, 9])).success).toBe(true)
    }
    expect(templateDefinition("no-such-template", 7)).toBeNull()
  })
})

describe("what a feed and a run say about their data", () => {
  it("reads a feed's session, treating one from before providers as the simulator's", () => {
    expect(readSession(JSON.stringify({ provider: "yahoo", source: "DELAYED", startedAt: 1, instruments: 66 }))).toMatchObject({ provider: "yahoo", source: "DELAYED" })
    expect(readSession(JSON.stringify({ seed: 7, day: "2026-09-25", startedAt: 1, instruments: 66 }))).toMatchObject({ provider: "simulator", source: "SIMULATED" })
    expect(readSession(null)).toBeNull()
    expect(readSession("not json")).toBeNull()
  })

  it("keeps runs on real and sample prices apart", () => {
    expect(dataVersionOf("2026-09-25", "real")).not.toBe(dataVersionOf("2026-09-25", "sample"))
    expect(readDataVersion(dataVersionOf("2026-09-25", "real"))).toEqual({ lastDate: "2026-09-25", dataset: "real" })
    // Runs from before this existed were all on sample prices.
    expect(readDataVersion("2026-09-25")).toEqual({ lastDate: "2026-09-25", dataset: "sample" })
  })
})
