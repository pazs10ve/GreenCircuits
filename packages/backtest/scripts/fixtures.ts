/**
 * Writes the golden-file inputs in ../fixtures: daily bars for a few
 * instruments from the demo market's generator, frozen on a fixed date, and
 * strategies that exercise every path in the engine. Then
 * `python -m greencircuits.lab.parity --write` (in pipelines/) records what
 * the Python engine makes of them in expected.json, and parity.test.ts checks
 * that this engine agrees.
 *
 * Run: pnpm --filter @greencircuits/backtest fixtures
 */
import { writeFileSync } from "node:fs"
import type { StrategyDefinition } from "@greencircuits/contracts/strategy"
import { EQUITIES, INDEX, getInstrument } from "@greencircuits/market/catalog"
import { dailyCandles } from "@greencircuits/market/history"

const TODAY = new Date("2026-06-30T06:30:00Z") // noon IST
const id = (symbol: string) => EQUITIES.find((i) => i.symbol === symbol)!.id
const NIFTY = INDEX.NIFTY
const RELIANCE = id("RELIANCE")
const HDFC = id("HDFCBANK")
const TCS = id("TCS")
const INFY = id("INFY")

// Infosys "lists" later than the rest, to exercise the leading gap in its prices.
const SESSIONS: Record<number, number> = { [NIFTY]: 900, [RELIANCE]: 900, [HDFC]: 900, [TCS]: 900, [INFY]: 600 }

const instruments = Object.fromEntries(
  Object.entries(SESSIONS).map(([key, sessions]) => {
    const inst = getInstrument(Number(key))!
    // Prices to the paisa: rounding to a tick leaves float tails like 18661.100000000002.
    const p = (v: number) => Number(v.toFixed(2))
    const bars = dailyCandles(inst, sessions, TODAY).map((c) => [new Date(c.time * 1000).toISOString().slice(0, 10), p(c.open), p(c.high), p(c.low), p(c.close)])
    return [key, bars]
  }),
)

interface Case {
  name: string
  definition: StrategyDefinition
  from: string
  to: string
  capital: number
  slippageBps: number
}

const rules = (over: Partial<Extract<StrategyDefinition, { type: "rules" }>>): StrategyDefinition => ({
  type: "rules",
  universe: [RELIANCE],
  entry: [],
  entryLogic: "ALL",
  exit: {},
  maxPositions: 1,
  costs: "DELIVERY",
  cashRatePct: 0,
  ...over,
})

const base = { to: "2026-06-29", capital: 1_000_000, slippageBps: 5 }
const cases: Case[] = [
  { ...base, name: "sip in the index", from: "2024-07-01", definition: { type: "sip", instrumentId: NIFTY, monthly: 10_000 } },
  { ...base, name: "sip in a stock", from: "2024-07-01", definition: { type: "sip", instrumentId: RELIANCE, monthly: 5_000 } },
  { ...base, name: "sip that waits for dips", from: "2024-07-01", definition: { type: "sip", instrumentId: NIFTY, monthly: 10_000, dip: { fallPct: 5, cashRatePct: 6 } } },
  { ...base, name: "sip before a listing", from: "2024-01-01", definition: { type: "sip", instrumentId: INFY, monthly: 10_000 } },
  { ...base, name: "60/40 mix", from: "2024-04-01", definition: { type: "rebalance", instrumentId: NIFTY, equityPct: 60, bondRatePct: 7 } },
  { ...base, name: "30/70 mix in a stock", from: "2024-04-01", capital: 500_000, definition: { type: "rebalance", instrumentId: HDFC, equityPct: 30, bondRatePct: 6.5 } },
  { ...base, name: "all bonds", from: "2024-04-01", definition: { type: "rebalance", instrumentId: NIFTY, equityPct: 0, bondRatePct: 7 } },
  {
    ...base,
    name: "rsi dip",
    from: "2024-07-01",
    definition: rules({
      entry: [{ left: { kind: "rsi", period: 14 }, op: "crosses_below", right: { kind: "value", value: 35 } }],
      exit: { targetPct: 8, maxBars: 40 },
      cashRatePct: 6,
    }),
  },
  {
    ...base,
    name: "trend on the index",
    from: "2024-07-01",
    definition: rules({
      universe: [NIFTY],
      entry: [{ left: { kind: "price" }, op: "crosses_above", right: { kind: "sma", period: 100 } }],
      exit: { when: [{ left: { kind: "price" }, op: "crosses_below", right: { kind: "sma", period: 100 } }] },
      cashRatePct: 4,
    }),
  },
  {
    ...base,
    name: "breakouts with a late listing",
    from: "2024-07-01",
    slippageBps: 10,
    definition: rules({
      universe: [RELIANCE, HDFC, TCS, INFY],
      entry: [{ left: { kind: "price" }, op: ">", right: { kind: "high", period: 120 } }],
      exit: { trailPct: 8 },
      maxPositions: 2,
    }),
  },
  {
    ...base,
    name: "averages or oversold, without costs",
    from: "2024-07-01",
    slippageBps: 0,
    definition: rules({
      universe: [RELIANCE, HDFC, TCS],
      entryLogic: "ANY",
      entry: [
        { left: { kind: "ema", period: 10 }, op: "crosses_above", right: { kind: "ema", period: 30 } },
        { left: { kind: "rsi", period: 14 }, op: "<", right: { kind: "value", value: 25 } },
      ],
      exit: { stopPct: 6, targetPct: 15, when: [{ left: { kind: "ema", period: 10 }, op: "crosses_below", right: { kind: "ema", period: 30 } }] },
      maxPositions: 3,
      costs: "NONE",
    }),
  },
  {
    ...base,
    name: "new lows for ten days",
    from: "2024-07-01",
    definition: rules({
      universe: [TCS],
      entry: [{ left: { kind: "price" }, op: "<", right: { kind: "low", period: 20 } }],
      exit: { maxBars: 10 },
    }),
  },
]

const dir = new URL("../fixtures/", import.meta.url)
writeFileSync(new URL("candles.json", dir), JSON.stringify({ today: "2026-06-30", instruments }))
writeFileSync(new URL("cases.json", dir), `${JSON.stringify(cases, null, 1)}\n`)
console.log(`Wrote ${Object.keys(instruments).length} instruments and ${cases.length} cases.`)
