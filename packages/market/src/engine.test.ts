import { describe, expect, it } from "vitest"
import { INDEX, INSTRUMENTS } from "./catalog"
import { createEngine } from "./engine"
import { marketSeed, openingQuotes } from "./session"

describe("marketSeed", () => {
  it("starts a new market at midnight in India, not at midnight UTC", () => {
    const morning = marketSeed(new Date("2026-09-27T03:45:00Z")) // 09:15 IST on the 27th
    const lateEvening = marketSeed(new Date("2026-09-27T18:29:00Z")) // 23:59 IST on the 27th
    const nextDay = marketSeed(new Date("2026-09-27T18:31:00Z")) // 00:01 IST on the 28th
    expect(lateEvening).toBe(morning)
    expect(nextDay).not.toBe(morning)
  })
})

describe("the market simulator", () => {
  const seed = marketSeed(new Date("2026-09-28T05:00:00Z"))
  const byId = new Map(INSTRUMENTS.map((i) => [i.id, i]))

  it("opens the same market wherever it runs", () => {
    // The ingestor and the browser's demo mode each build an engine from the day's seed.
    const a = createEngine(seed, 0).snapshot()
    expect(createEngine(seed, 0).snapshot()).toEqual(a)
    expect(openingQuotes(seed).get(a[0]!.id)).toEqual(a[0])
  })

  it("keeps every quote consistent through a session", () => {
    const engine = createEngine(seed, 0)
    const volume = new Map(engine.snapshot().map((q) => [q.id, q.volume]))
    const problems: string[] = []
    for (let n = 0; n < 1500; n++) {
      for (const q of engine.step()) {
        const inst = byId.get(q.id)!
        if (q.low > q.ltp || q.high < q.ltp) problems.push(`${inst.symbol}: last price outside the day's range`)
        if (q.volume < volume.get(q.id)!) problems.push(`${inst.symbol}: volume went down`)
        volume.set(q.id, q.volume)
        // Stocks stop at a 10% circuit, give or take rounding to the tick.
        if (inst.kind === "EQUITY" && Math.abs(q.ltp - inst.prevClose) > inst.prevClose * 0.1 + inst.tick) {
          problems.push(`${inst.symbol}: broke its circuit`)
        }
      }
    }
    expect(problems).toEqual([])
  })

  it("keeps each index in line with its members", () => {
    const engine = createEngine(seed, 0)
    for (let n = 0; n < 300; n++) engine.step()
    const quotes = new Map(engine.snapshot().map((q) => [q.id, q]))
    for (const indexId of [INDEX.NIFTY, INDEX.BANKNIFTY, INDEX.NIFTYIT]) {
      const index = byId.get(indexId)!
      const members = INSTRUMENTS.filter((i) => i.kind === "EQUITY" && i.indices?.includes(indexId))
      const weight = (m: (typeof members)[number]) => (m.sharesCr ?? 1) * m.prevClose
      const total = members.reduce((s, m) => s + weight(m), 0)
      const ratio = members.reduce((s, m) => s + weight(m) * (quotes.get(m.id)!.ltp / m.prevClose), 0) / total
      expect(quotes.get(indexId)!.ltp).toBeCloseTo(index.prevClose * ratio, 1)
    }
  })
})
