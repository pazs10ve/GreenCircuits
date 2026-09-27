import { describe, expect, it } from "vitest"
import type { Preferences } from "@greencircuits/contracts/account"
import { EQUITIES } from "@greencircuits/market/catalog"
import type { Candle, Instrument, Quote } from "@greencircuits/market/types"
import { buildFeed, interestsOf, usualMove, type FeedInput } from "./feed"
import { entrySignals, istDay, withToday } from "./signals"

const NOW = Date.parse("2026-09-28T09:00:00Z") // 14:30 IST on a Monday
const reliance = EQUITIES.find((i) => i.symbol === "RELIANCE")!
const tcs = EQUITIES.find((i) => i.symbol === "TCS")!
const infy = EQUITIES.find((i) => i.symbol === "INFY")!

/** A quote that moved `moves` times the stock's usual daily move. */
function quote(inst: Instrument, moves: number): Quote {
  const changePct = usualMove(inst) * moves
  const ltp = inst.prevClose * (1 + changePct / 100)
  return { id: inst.id, ltp, open: inst.prevClose, high: Math.max(ltp, inst.prevClose), low: Math.min(ltp, inst.prevClose), prevClose: inst.prevClose, change: ltp - inst.prevClose, changePct, volume: 1, bid: ltp, ask: ltp, ts: NOW, tickDir: 0 }
}

function input(over: Partial<FeedInput> = {}, preferences: Preferences = { style: "both", sectors: [] }): FeedInput {
  const quotes = new Map([reliance, tcs, infy].map((i) => [i.id, quote(i, 0.2)]))
  return {
    now: NOW,
    preferences,
    interests: interestsOf({ holdings: [], alerts: [], watchlists: [reliance.id, tcs.id], lab: [] }),
    quote: (id) => quotes.get(id),
    range: (id) => (id === reliance.id ? { high: reliance.prevClose * 1.2, low: reliance.prevClose * 0.8 } : undefined),
    holdings: [],
    events: [],
    alerts: [],
    tests: [],
    signals: [],
    ...over,
  }
}

describe("the feed", () => {
  it("says nothing about a quiet day", () => {
    expect(buildFeed(input())).toEqual([])
  })

  it("reports unusual moves in words, with why the stock is followed", () => {
    const quotes = new Map([[reliance.id, quote(reliance, 2.5)]])
    const [item] = buildFeed(input({ quote: (id) => quotes.get(id) }))
    expect(item).toMatchObject({ kind: "move", instrumentId: reliance.id, tone: "up", detail: "It's on your watchlist." })
    expect(item!.title).toMatch(/^Reliance Industries is up \d+\.\d% today, about 2\.5 times its usual daily move\.$/)
  })

  it("says when, in the past tense, once the session is over", () => {
    const quotes = new Map([[reliance.id, quote(reliance, 2.5)]])
    const [item] = buildFeed(input({ quote: (id) => quotes.get(id), closed: "on Friday" }))
    expect(item!.title).toMatch(/^Reliance Industries closed up \d+\.\d% on Friday, about 2\.5 times its usual daily move\.$/)
  })

  it("calls a 52-week high a high, not just a move", () => {
    const q = { ...quote(reliance, 3), ltp: reliance.prevClose * 1.25 }
    const items = buildFeed(input({ quote: (id) => (id === reliance.id ? q : undefined) }))
    expect(items.map((i) => i.kind)).toEqual(["high"])
  })

  it("leads with your holdings and the alerts that went off", () => {
    const quotes = new Map([[infy.id, quote(infy, 1)]])
    const items = buildFeed(
      input({
        quote: (id) => quotes.get(id),
        holdings: [{ instrumentId: infy.id, qty: 10 }],
        alerts: [{ id: "a1", instrumentId: tcs.id, condition: "PRICE_ABOVE", value: 3100, triggeredAt: NOW - 3_600_000, triggeredPrice: 3112.4 }],
      }),
    )
    expect(items.map((i) => i.kind)).toEqual(["portfolio", "alert"])
    expect(items[0]!.title).toMatch(/^Your holdings are up ₹[\d,.]+ today, [\d.]+%\.$/)
    expect(items[1]!.title).toBe("Your alert on Tata Consultancy Services went off: it rose above ₹3,100.00.")
  })

  it("orders by how you invest", () => {
    const events = [{ date: "2026-09-30", kind: "RESULTS" as const, title: "TCS results", detail: "Q2 FY27", instrumentId: tcs.id }]
    const signals = [{ strategy: "RSI dip", runId: "r1", instrumentId: reliance.id, reason: "its 14-day RSI crosses below 30" }]
    const longTerm = buildFeed(input({ events, signals }, { style: "long_term", sectors: [] }))
    const trading = buildFeed(input({ events, signals }, { style: "trading", sectors: [] }))
    expect(longTerm.map((i) => i.kind)).toEqual(["event", "signal"])
    expect(trading.map((i) => i.kind)).toEqual(["signal", "event"])
    expect(longTerm[0]!.title).toBe("Tata Consultancy Services reports results on Wednesday.")
  })

  it("ignores events for other stocks and beyond the coming week", () => {
    const events = [
      { date: "2026-09-29", kind: "RESULTS" as const, title: "", detail: "", instrumentId: infy.id },
      { date: "2026-10-20", kind: "RESULTS" as const, title: "", detail: "", instrumentId: tcs.id },
    ]
    expect(buildFeed(input({ events }))).toEqual([])
  })

  it("adds the biggest mover in each sector you follow", () => {
    const quotes = new Map([[infy.id, quote(infy, -2)]])
    const items = buildFeed(input({ quote: (id) => quotes.get(id) }, { style: "both", sectors: ["IT"] }))
    expect(items).toHaveLength(1)
    expect(items[0]!.title).toMatch(/^In IT, which you follow, Infosys moved most: down/)
  })
})

describe("signals from your tested rules", () => {
  // Thirty quiet days, then a fall: today's price pushes the 14-day RSI below 30.
  const candles: Candle[] = Array.from({ length: 30 }, (_, i) => ({ time: istDay(NOW) - (30 - i) * 86_400, open: 100, high: 101, low: 99, close: 100 + (i % 2), volume: 1 }))
  const falling = { ...quote(reliance, 0), ltp: 80, open: 90, high: 90, low: 79, changePct: -20, change: -20, prevClose: 100 }
  const rules = {
    name: "RSI dip",
    runId: "r1",
    definition: {
      type: "rules" as const,
      universe: [reliance.id],
      entry: [{ left: { kind: "rsi" as const, period: 14 }, op: "crosses_below" as const, right: { kind: "value" as const, value: 30 } }],
      entryLogic: "ALL" as const,
      exit: { maxBars: 10 },
      maxPositions: 1,
      costs: "DELIVERY" as const,
      cashRatePct: 0,
    },
  }

  it("fires when today's price meets the entry rules", () => {
    expect(entrySignals([rules], () => candles, () => falling)).toEqual([
      { strategy: "RSI dip", runId: "r1", instrumentId: reliance.id, reason: "its 14-day RSI crosses below 30" },
    ])
  })

  it("stays quiet when it doesn't", () => {
    expect(entrySignals([rules], () => candles, () => ({ ...falling, ltp: 100.5 }))).toEqual([])
  })
})

describe("the latest quote as a daily bar", () => {
  const friday = Date.parse("2026-09-25T09:59:00Z") // 15:29 IST
  const bar = (time: number, close: number): Candle => ({ time, open: close, high: close, low: close, close, volume: 1 })
  const stored = [bar(istDay(friday) - 86_400, 99), bar(istDay(friday), 100)]
  const q = (ts: number): Quote => ({ ...quote(reliance, 0), ltp: 101, ts })

  it("replaces its own session's stored bar, so a weekend gains no day", () => {
    const s = withToday(stored, q(friday))
    expect(s.dates).toEqual([istDay(friday) - 86_400, istDay(friday)])
    expect(s.close.at(-1)).toBe(101)
  })

  it("adds a bar for a session the history doesn't have yet", () => {
    const monday = Date.parse("2026-09-28T05:00:00Z")
    const s = withToday(stored, q(monday))
    expect(s.dates.at(-1)).toBe(istDay(monday))
    expect(s.dates).toHaveLength(3)
  })
})
