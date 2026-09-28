import { describe, expect, it } from "vitest"
import type { Candle, Quote } from "@greencircuits/market/types"
import { barsIn, quoteIn, rateOn } from "./in-currency"

/** A bar at noon IST on a day, closing at `close`. */
const day = (date: string, close: number): Candle => ({ time: Date.parse(`${date}T06:30:00Z`) / 1000, open: close, high: close, low: close, close, volume: 0 })

const quote = (ltp: number, prevClose: number): Quote => ({
  id: 1,
  ltp,
  open: ltp,
  high: ltp,
  low: ltp,
  prevClose,
  change: ltp - prevClose,
  changePct: ((ltp - prevClose) / prevClose) * 100,
  volume: 0,
  bid: ltp,
  ask: ltp,
  ts: 0,
  tickDir: 0,
})

describe("rateOn", () => {
  const rates = [day("2026-09-23", 88), day("2026-09-24", 88.5), day("2026-09-28", 89)]
  const rate = rateOn(rates, false)

  it("reads the rate on the same day, whatever the hour", () => {
    expect(rate(Date.parse("2026-09-24T00:00:00+05:30") / 1000)).toBe(88.5)
    expect(rate(Date.parse("2026-09-24T23:30:00+05:30") / 1000)).toBe(88.5)
  })

  it("carries the last rate over a day without one", () => {
    expect(rate(day("2026-09-26", 0).time)).toBe(88.5)
  })

  it("lets the first rate stand in before it", () => {
    expect(rate(day("2026-09-01", 0).time)).toBe(88)
  })

  it("matches intraday bars by time", () => {
    const minutes = rateOn([{ ...day("2026-09-28", 88.9), time: 1000 }, { ...day("2026-09-28", 89.1), time: 1300 }], true)
    expect(minutes(1200)).toBe(88.9)
    expect(minutes(1300)).toBe(89.1)
  })
})

describe("barsIn", () => {
  it("divides each bar by its day's rate and scales it to the unit", () => {
    const rate = rateOn([day("2026-09-24", 80), day("2026-09-25", 100)], false)
    const [a, b] = barsIn([day("2026-09-24", 8000), day("2026-09-25", 8000)], rate, 2)
    expect(a!.close).toBe(200)
    expect(b!.close).toBe(160)
  })

  it("leaves out bars there's no rate for", () => {
    expect(barsIn([day("2026-09-24", 8000)], () => null, 1)).toEqual([])
  })
})

describe("quoteIn", () => {
  it("counts the currency's move in the day's", () => {
    // Flat in rupees while the rupee weakens from 80 to 88 to the dollar: down in dollars.
    const q = quoteIn(quote(8800, 8800), quote(88, 80), 1)!
    expect(q.ltp).toBeCloseTo(100)
    expect(q.prevClose).toBeCloseTo(110)
    expect(q.changePct).toBeCloseTo(-9.0909, 3)
  })

  it("needs a rate", () => {
    expect(quoteIn(quote(100, 100), undefined, 1)).toBeUndefined()
  })
})
