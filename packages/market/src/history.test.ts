import { describe, expect, it } from "vitest"
import { EQUITIES, ETFS } from "./catalog"
import { dailyCandles } from "./history"

describe("sample daily history", () => {
  const today = new Date("2026-09-28T06:00:00Z")

  it("gives the same bars however many sessions are asked for", () => {
    // A year's chart, the 52-week range and the five-year series must agree where they overlap.
    for (const inst of [EQUITIES[0]!, ETFS.find((e) => e.tracks != null)!, ETFS.find((e) => e.tracks == null)!]) {
      const long = dailyCandles(inst, 750, today)
      expect(dailyCandles(inst, 250, today), inst.symbol).toEqual(long.slice(-250))
    }
  })

  it("ends at yesterday's close", () => {
    const inst = EQUITIES[0]!
    expect(dailyCandles(inst, 30, today).at(-1)!.close).toBe(inst.prevClose)
  })
})
