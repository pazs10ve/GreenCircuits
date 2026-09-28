import { describe, expect, it } from "vitest"
import { MUTUAL_FUNDS, demoNavHistory, demoReturns, returnsOf } from "./funds"

describe("demo mutual funds", () => {
  const today = new Date("2026-09-28T06:00:00Z")
  const largeCap = MUTUAL_FUNDS.find((f) => f.category === "Large cap")!
  const liquid = MUTUAL_FUNDS.find((f) => f.category === "Liquid")!

  it("ends at the scheme's real NAV, and a year is the tail of five", () => {
    const five = demoNavHistory(largeCap, 1300, today)
    expect(five.at(-1)!.value).toBe(largeCap.nav)
    expect(demoNavHistory(largeCap, 260, today)).toEqual(five.slice(-261))
  })

  it("gives each kind of fund returns of its kind", () => {
    const equity = demoReturns(largeCap, today)
    const cash = demoReturns(liquid, today)
    expect(equity.y10).not.toBeNull()
    // A liquid fund earns about its yield, year after year; an equity fund anything.
    expect(cash.y1!).toBeGreaterThan(5)
    expect(cash.y1!).toBeLessThan(8)
    expect(Math.abs(cash.y5! - cash.y1!)).toBeLessThan(1)
  })

  it("measures returns from the NAV on or before the same date years back", () => {
    const day = 86400
    const start = Date.UTC(2020, 0, 1) / 1000
    const history = Array.from({ length: 6 * 365 + 2 }, (_, i) => ({ time: start + i * day, value: 100 * Math.pow(1.1, i / 365.25) }))
    const r = returnsOf(history)
    expect(r.y1!).toBeCloseTo(10, 0)
    expect(r.y5!).toBeCloseTo(10, 0)
    expect(r.y10).toBeNull()
  })
})
